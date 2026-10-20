// Manual connectivity smoke test. Never prints or persists prompts, model answers or secrets.
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const WORKER_URL = 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/research/inference';
export const MODELS = Object.freeze({hip:'GLM-5.2-AWQ-INT4',blablador:'alias-fast'});
const SAFE_ERRORS = new Set([
  'research_upstream_auth_rejected','research_upstream_model_or_request_rejected',
  'research_upstream_rate_limited','research_upstream_unavailable',
  'research_upstream_http_failed','research_response_missing_body',
  'research_response_too_large','research_response_invalid_json',
  'research_response_secret_echo','research_response_model_mismatch',
  'research_response_incomplete','research_response_invalid_answer',
  'research_transport_or_decode_failed','research_provider_not_configured'
]);
async function safeWorkerError(response) {
  if (response.status !== 502 && response.status !== 503) {
    await response.body?.cancel().catch(()=>{});
    return 'http_'+response.status;
  }
  const reader=response.body?.getReader();
  if(!reader) return 'http_'+response.status;
  let size=0;const chunks=[];
  try {
    while(true) {
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>1024) {await reader.cancel();return 'http_'+response.status;}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return SAFE_ERRORS.has(data?.error) ? data.error : 'http_'+response.status;
  } catch {return 'http_'+response.status;}
  finally {reader.releaseLock();}
}
export async function probe(provider, {key, fetchImpl=fetch}={}) {
  if (!Object.hasOwn(MODELS,provider)) throw new Error('invalid_provider');
  if (typeof key !== 'string' || key.length < 24) throw new Error('missing_orchestrator_key');
  let response;
  try {
    response=await fetchImpl(WORKER_URL,{
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(65000),
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({provider,model:MODELS[provider],
        prompt:'Connectivity test. Reply with the single word READY.'})
    });
  } catch { return {provider,model:MODELS[provider],status:'failed',error:'transport_error'}; }
  if (response.status>=300 && response.status<400) {
    await response.body?.cancel();
    return {provider,model:MODELS[provider],status:'failed',error:'redirect_rejected'};
  }
  if (!response.ok) {
    const error=await safeWorkerError(response);
    return {provider,model:MODELS[provider],status:'failed',error};
  }
  try {
    const length=Number(response.headers.get('content-length')||0);
    if(length>32768) {await response.body?.cancel();throw Error('oversize');}
    const reader=response.body?.getReader();
    if(!reader) throw Error('empty');
    let size=0;const chunks=[];
    try{
      while(true){
        const {value,done}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>32768){await reader.cancel();throw Error('oversize');}
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(data.status!=='completed_unverified' || data.provider!==provider ||
        data.model!==MODELS[provider] ||
        (data.modelIdentity !== undefined && !['exact','documented_alias_target'].includes(data.modelIdentity)) ||
        (provider==='hip' && data.modelIdentity==='documented_alias_target') ||
        typeof data.answer!=='string' ||
        !data.answer.trim() || data.scientificallyVerified!==false ||
        data.backendIdentityVerified!==false) throw Error('invalid');
    return {provider,model:MODELS[provider],status:'connected_unverified'};
  }catch{return {provider,model:MODELS[provider],status:'failed',error:'invalid_response'};}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const provider=process.env.RESEARCH_PROVIDER;
  if(!Object.hasOwn(MODELS,provider??'')) throw Error('invalid_provider');
  const result=await probe(provider,{key:process.env.ORCHESTRATOR_API_KEY});
  await mkdir('reports/worker-provider-smoke',{recursive:true});
  await writeFile('reports/worker-provider-smoke/'+provider+'.json',JSON.stringify({
    schemaVersion:1,githubSha:process.env.GITHUB_SHA||null,
    ...result,scientificallyVerified:false,providerIdentityVerified:false
  },null,2)+'\n');
  console.log('Worker provider smoke:',result.provider,result.status,result.error||'');
  if(result.status!=='connected_unverified') process.exitCode=1;
}
