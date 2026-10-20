// Manual connectivity smoke test. Never prints or persists prompts, model answers or secrets.
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const WORKER_URL = 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/research/inference';
export const MODELS = Object.freeze({hip:'GLM-5.2-AWQ-INT4',blablador:'alias-fast'});
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
    await response.body?.cancel();
    return {provider,model:MODELS[provider],status:'failed',error:'http_'+response.status};
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
        data.model!==MODELS[provider] || typeof data.answer!=='string' ||
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
