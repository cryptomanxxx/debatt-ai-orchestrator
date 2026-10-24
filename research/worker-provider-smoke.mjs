// Manual connectivity smoke test. Never prints or persists prompts, model answers or secrets.
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { explicitModels } from './explicit-models.mjs';

const WORKER = 'https://debatt-ai-orchestrator.xx8031126.workers.dev';
// Preferred explicit IDs; otherwise the first explicit catalog ID is used. Aliases
// (e.g. alias-fast) report a different backend ID and always fail the identity check.
export const PREFERRED = Object.freeze({hip:'GLM-5.2-AWQ-INT4',blablador:null});
const SAFE_ERRORS = new Set([
  'benchmark_catalog_unavailable','benchmark_model_not_listed','benchmark_non_chat_model',
  'benchmark_transport_failed','benchmark_upstream_failed','benchmark_upstream_rate_limited',
  'benchmark_upstream_auth_rejected','benchmark_upstream_quota_exhausted',
  'benchmark_invalid_response','benchmark_token_budget_exceeded','benchmark_missing_answer','benchmark_output_truncated',
  'benchmark_response_too_large','benchmark_model_identity_mismatch',
  'benchmark_invalid_finish_reason','benchmark_invalid_upstream_json',
  'research_provider_not_configured','benchmark_alias_unresolved'
]);
async function boundedJson(response, max) {
  const length=Number(response.headers.get('content-length')||0);
  if(length>max) {await response.body?.cancel();throw Error('oversize');}
  const reader=response.body?.getReader();
  if(!reader) throw Error('empty');
  let size=0;const chunks=[];
  try{
    while(true){
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>max){await reader.cancel();throw Error('oversize');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function safeWorkerError(response) {
  if (![400,429,502,503].includes(response.status)) {
    await response.body?.cancel().catch(()=>{});
    return 'http_'+response.status;
  }
  try {
    const data=await boundedJson(response,1024);
    return SAFE_ERRORS.has(data?.error) ? data.error : 'http_'+response.status;
  } catch {return 'http_'+response.status;}
}
async function call(fetchImpl, path, key, body) {
  const response=await fetchImpl(WORKER+path,{
    method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(65000),
    headers:{Authorization:'Bearer '+key,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if (response.status>=300 && response.status<400) {
    await response.body?.cancel();
    throw Error('redirect_rejected');
  }
  if (!response.ok) throw Error(await safeWorkerError(response));
  try {return await boundedJson(response,path==='/v1/research/models'?262144:32768);}
  catch {throw Error('invalid_response');}
}
export async function probe(provider, {key, fetchImpl=fetch}={}) {
  if (!Object.hasOwn(PREFERRED,provider)) throw new Error('invalid_provider');
  if (typeof key !== 'string' || key.length < 24) throw new Error('missing_orchestrator_key');
  const known=new Set([...SAFE_ERRORS,'redirect_rejected','invalid_response','catalog_failed',
    'no_explicit_chat_model']);
  const failed=(error,model=null)=>({provider,model,status:'failed',
    error:known.has(error)||/^http_\d{3}$/.test(error)?error:'transport_error'});
  let model;
  try {
    const catalog=(await call(fetchImpl,'/v1/research/models',key))?.providers?.[provider];
    if(catalog?.status!=='catalog_unverified'||!Array.isArray(catalog.models)) return failed('catalog_failed');
    const explicit=explicitModels(catalog.models);
    model=explicit.includes(PREFERRED[provider]) ? PREFERRED[provider] : explicit[0];
    if(!model) return failed('no_explicit_chat_model');
  } catch(error) {return failed(error.message==='invalid_model_catalog'||error.message==='duplicate_model_ids'?'catalog_failed':error.message);}
  try {
    const data=await call(fetchImpl,'/v1/research/benchmark',key,{provider,model,profile:'standard',
      max_tokens:256,messages:[{role:'user',content:'Connectivity test. Reply with the single word READY.'}]});
    if(data?.status!=='completed_unverified' || data.provider!==provider ||
        data.model!==model || typeof data.answer!=='string' ||
        !data.answer.trim() || data.scientificallyVerified!==false ||
        data.backendIdentityVerified!==false) return failed('invalid_response',model);
    return {provider,model,status:'connected_unverified'};
  } catch(error) {return failed(error.message,model);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const provider=process.env.RESEARCH_PROVIDER;
  if(!Object.hasOwn(PREFERRED,provider??'')) throw Error('invalid_provider');
  const result=await probe(provider,{key:process.env.ORCHESTRATOR_API_KEY});
  await mkdir('reports/worker-provider-smoke',{recursive:true});
  await writeFile('reports/worker-provider-smoke/'+provider+'.json',JSON.stringify({
    schemaVersion:2,githubSha:process.env.GITHUB_SHA||null,
    ...result,scientificallyVerified:false,providerIdentityVerified:false
  },null,2)+'\n');
  console.log('Worker provider smoke:',result.provider,result.model??'',result.status,result.error||'');
  if(result.status!=='connected_unverified') process.exitCode=1;
}
