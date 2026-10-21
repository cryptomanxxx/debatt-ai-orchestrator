// Updates only the generated dropdown in the fixed Scientific v3 workflow.
// The dedicated token must have Contents:write and Workflows:write on this repository.
// GitHub branch protection still applies. No provider credentials are used here.
import {readFile} from 'node:fs/promises';
const file='.github/workflows/blablador-scientific-v3.yml';
const start='        # BEGIN GENERATED BLABLADOR MODEL OPTIONS';
const end='        # END GENERATED BLABLADOR MODEL OPTIONS';
const invalid=/embedding|rerank|bge-|gte-|whisper|transcri|tts|audio|image|all-proxy|moderation|anonymiz/i;
const aliases=new Set(['default','fast','gpt-3.5-turbo','text-davinci-003','text-embedding-ada-002']);
export function eligibleModels(models){
 if(!Array.isArray(models))throw Error('invalid_model_catalog');
 const valid=models.filter(m=>typeof m==='string' && /^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,199}$/.test(m) &&
 !m.toLowerCase().startsWith('alias-') && !m.split('/').includes('..') && !aliases.has(m.toLowerCase()) && !invalid.test(m));
 if(new Set(valid).size!==valid.length)throw Error('duplicate_model_ids');
 const sorted=valid.sort((a,b)=>a.localeCompare(b,'en'));
 if(sorted.length<1||sorted.length>25)throw Error('model_dropdown_requires_1_to_25_eligible_models');
 return sorted;
}
export function withOptions(workflow,models){
 const first=workflow.indexOf(start),last=workflow.indexOf(end);
 if(first<0||last<=first||workflow.indexOf(start,first+1)>=0||workflow.indexOf(end,last+1)>=0)
   throw Error('generated_options_markers_not_unique');
 const replace=start+'\n        options:\n'+models.map(m=>'          - '+JSON.stringify(m)).join('\n')+'\n        '+end.trim();
 return workflow.slice(0,first)+replace+workflow.slice(last+end.length);
}
export async function updateMenu({catalog,repository,token,fetchImpl=fetch}){
 const p=catalog?.providers?.blablador;
 if(p?.status!=='catalog_unverified')throw Error('blablador_catalog_not_verified_as_discovered');
 const models=eligibleModels(p.models);
 if(!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repository)||!token)throw Error('missing_workflow_update_credential');
 const url='https://api.github.com/repos/'+repository+'/contents/'+file;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28','User-Agent':'DebattAI-Research-ModelMenu'};

 // Never print the raw GitHub response: it may contain untrusted or sensitive text.
 async function failure(response,operation){
  let detail='';
  try { const body=await response.json(); if(typeof body?.message==='string')detail=body.message.toLowerCase(); }
  catch {}
  const category=/protected branch|branch protection|ruleset|repository rule|required status check|pushes to this branch/.test(detail)
   ?'branch_protection_or_ruleset'
   : /workflow|permission|resource not accessible|must have write/.test(detail)
   ?'workflow_or_token_permission'
   : response.status===409?'write_conflict'
   : response.status===422?'unprocessable_write'
   : response.status===403?'forbidden'
   : response.status===401?'unauthorized':'github_api_error';
  return Error('github_'+operation+'_http_'+response.status+'_'+category);
 }
 for(let attempt=0;attempt<2;attempt++){
  const read=await fetchImpl(url+'?ref=main',{headers,redirect:'manual'});
  if(!read.ok)throw await failure(read,'read_workflow');
  const meta=await read.json();
  if(typeof meta.sha!=='string'||meta.encoding!=='base64'||typeof meta.content!=='string')throw Error('invalid_github_workflow_file');
  const original=Buffer.from(meta.content.replace(/\\s/g,''),'base64').toString('utf8');
  const updated=withOptions(original,models);
  if(updated===original){console.log('Scientific model dropdown already current ('+models.length+' models)');return;}
  const put=await fetchImpl(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},redirect:'manual',
   body:JSON.stringify({message:'chore(research): refresh scientific Blablador model choices',content:Buffer.from(updated).toString('base64'),sha:meta.sha,branch:'main'})});
  if(put.ok){console.log('Scientific model dropdown updated ('+models.length+' explicit model IDs).');return;}
  // Retry only once on a genuine SHA conflict, never on protections/permissions.
  const error=await failure(put,'update_workflow');
  if(attempt===0 && put.status===409 && error.message.endsWith('_write_conflict')){
   console.log('GitHub reported a workflow write conflict; refreshing file SHA once.');
   continue;
  }
  throw error;
 }

}
if(process.argv[1]?.endsWith('/update-scientific-model-menu.mjs')){
 try{
 const catalog=JSON.parse(await readFile('reports/provider-catalog/catalog.json','utf8'));
 await updateMenu({catalog,repository:process.env.GITHUB_REPOSITORY,token:process.env.MODEL_MENU_WORKFLOW_TOKEN});
 }catch(error){console.error('Model-menu update failed:',error.message);process.exitCode=1;}
}
