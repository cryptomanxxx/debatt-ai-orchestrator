import { isDeepStrictEqual } from 'node:util';
import { boundedJson,hashText,inspectFindings } from './literature-evidence.mjs';

export const ANALYSIS_CONTRACT='abstract-findings-2';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
export function analysisKey({loaded,prompt,profile}) {
  const key={abstract_version_id:loaded.archive?.version_id,content_hash:loaded.content?.sha256,
    analyzed_hash:hashText(prompt.source_text),analyzed_characters:Array.from(prompt.source_text).length,
    prompt_hash:hashText(JSON.stringify(prompt)),contract_version:ANALYSIS_CONTRACT,
    profile_hash:profile?.fingerprint,model_provider:profile?.provider,model_name:profile?.model};
  if (!UUID.test(key.abstract_version_id??'')||!HASH.test(key.content_hash??'')||!HASH.test(key.profile_hash??'')
    ||typeof loaded.abstract!=='string'||hashText(loaded.abstract)!==key.content_hash
    ||!loaded.abstract.startsWith(prompt.source_text)||key.analyzed_characters<1
    ||[key.model_provider,key.model_name].some(x=>typeof x!=='string'||!x||x.length>200||x.includes('\u0000')))
    throw new Error('invalid_analysis_context');
  return key;
}
function checkedFindings(findings,prompt) {
  if (!Array.isArray(findings)) throw new Error('invalid_analysis_registry_response');
  const raw=findings.map(f=>({kind:f?.kind,claim:f?.claim,quote:f?.quote,
    ...(f?.kind==='limitation'&&f.context_quote!==null?{limitation_status:f.limitation_status,context_quote:f.context_quote}:{})}));
  const checked=inspectFindings(JSON.stringify({findings:raw}),prompt.source_text);
  if (checked.validation.rejected_findings||!isDeepStrictEqual(checked.findings,findings))
    throw new Error('invalid_analysis_registry_response');
  return checked;
}
function validateRow(row,key,prompt) {
  if (!row||!UUID.test(row.id??'')||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at))
    ||Object.entries(key).some(([name,value])=>row[name]!==value)) throw new Error('invalid_analysis_registry_response');
  const checked=checkedFindings(row.findings,prompt);
  return {id:row.id,created_at:row.created_at,model:{provider:row.model_provider,name:row.model_name},...checked};
}
export function createAnalysisRegistryClient({url,secretKey,fetchImpl=fetch}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url??'')||typeof secretKey!=='string'||!secretKey)
    throw new Error('invalid_literature_database_environment');
  async function request(path,options={}) {
    let response;
    try {response=await fetchImpl(new URL(path,url),{...options,headers:{apikey:secretKey,...options.headers},
      redirect:'error',signal:AbortSignal.timeout(55000)});}
    catch {throw new Error('analysis_registry_transport_error');}
    if (!response.ok) {await response.body?.cancel();throw new Error('analysis_registry_http_'+response.status);}
    return boundedJson(response,100_000);
  }
  return {
    async checkStorage() {
      const rows=await request('/rest/v1/literature_evidence_analysis?select=id&limit=0');
      if (!Array.isArray(rows)||rows.length) throw new Error('invalid_analysis_registry_response');
    },
    async read(context) {
      const key=analysisKey(context);
      const params=new URLSearchParams({select:'*',limit:'1'});
      for (const name of ['abstract_version_id','prompt_hash','contract_version','profile_hash'])
        params.set(name,'eq.'+key[name]);
      const rows=await request('/rest/v1/literature_evidence_analysis?'+params);
      if (!Array.isArray(rows)||rows.length>1) throw new Error('invalid_analysis_registry_response');
      return rows.length?{...validateRow(rows[0],key,context.prompt),cache_hit:true}:null;
    },
    async save(context,checked) {
      const key=analysisKey(context);
      if (checked.validation.rejected_findings) throw new Error('invalid_analysis_registry_response');
      checkedFindings(checked.findings,context.prompt);
      const row=await request('/rest/v1/rpc/save_literature_analysis',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({p_payload:{...key,findings:checked.findings}})});
      // Concurrent inserts return the first stored interpretation, never overwrite it.
      return {...validateRow(row,key,context.prompt),cache_hit:false};
    }
  };
}
