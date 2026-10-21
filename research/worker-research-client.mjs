// Shared, restricted research-client for GitHub Actions. HIP/Blablador keys stay inside Cloudflare.
export const WORKER='https://debatt-ai-orchestrator.xx8031126.workers.dev';
export const ALLOWED=Object.freeze({
  hip:['Mistral-Medium-3.5-128B','GLM-5.2-AWQ-INT4'],
  blablador:['alias-glm-5.3-flash','alias-fast']
});
const MAX_BYTES=131072;
// The two-provider catalog (IDs plus alias roots) may exceed a single completion's bound.
const MAX_CATALOG_BYTES=262144;
export async function boundedJson(response,max=MAX_BYTES){
  const reader=response.body?.getReader();
  if(!reader)throw Error('worker_missing_body');
  let n=0;const chunks=[];
  try{
    while(true){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;
      if(n>max){await reader.cancel();throw Error('worker_response_too_large');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(n);let o=0;
  for(const c of chunks){bytes.set(c,o);o+=c.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('worker_invalid_json');}
}
export async function workerRequest(path,key,body,fetchImpl=fetch){
  if(typeof key!=='string'||key.length<24)throw Error('missing_orchestrator_key');
  if(!['/v1/research/models','/v1/research/inference','/v1/research/benchmark'].includes(path))throw Error('invalid_worker_path');
  const response=await fetchImpl(WORKER+path,{method:body?'POST':'GET',redirect:'manual',
    signal:AbortSignal.timeout(path==='/v1/research/benchmark'?95000:65000),
    headers:{Authorization:'Bearer '+key,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw Error('worker_http_'+response.status);}
  return boundedJson(response,path==='/v1/research/models'?MAX_CATALOG_BYTES:MAX_BYTES);
}
export async function selectWorkerModel(provider,task,key,fetchImpl=fetch){
  if(!['auto','hip','blablador'].includes(provider)||!['reasoning','literature','coding','fast'].includes(task))
    throw Error('invalid_route_options');
  const preferences={
    reasoning:[['blablador','alias-glm-5.3-flash'],['hip','Mistral-Medium-3.5-128B']],
    literature:[['hip','Mistral-Medium-3.5-128B'],['blablador','alias-glm-5.3-flash']],
    coding:[['blablador','alias-glm-5.3-flash'],['hip','GLM-5.2-AWQ-INT4']],
    fast:[['blablador','alias-fast'],['hip','GLM-5.2-AWQ-INT4']]
  };
  const catalog=await workerRequest('/v1/research/models',key,null,fetchImpl);
  if(catalog?.status!=='discovered_unverified')throw Error('invalid_worker_catalog');
  for(const [p,m] of preferences[task]){
    if(provider!=='auto'&&provider!==p)continue;
    const entry=catalog.providers?.[p];
    if(entry?.status==='catalog_unverified'&&entry.provider===p&&entry.backendIdentityVerified===false &&
       Array.isArray(entry.models)&&ALLOWED[p].includes(m)&&entry.models.includes(m))
      return {provider:p,model:m,reason:'worker_catalog_and_fixed_priority'};
  }
  throw Error('no_available_allowlisted_model');
}
export async function workerInference(selection,prompt,key,fetchImpl=fetch){
  if(!selection||!Object.hasOwn(ALLOWED,selection.provider)||!ALLOWED[selection.provider].includes(selection.model)||
     typeof prompt!=='string'||!prompt.trim()||prompt.length>4000)throw Error('invalid_worker_inference');
  const data=await workerRequest('/v1/research/inference',key,{provider:selection.provider,model:selection.model,prompt},fetchImpl);
  if(data?.status!=='completed_unverified'||data.provider!==selection.provider||
     data.model!==selection.model||data.scientificallyVerified!==false||data.backendIdentityVerified!==false||
     typeof data.answer!=='string'||!data.answer.trim()||data.answer.length>16000||data.answer.includes(key))
    throw Error('invalid_worker_inference_response');
  return data.answer;
}
