// A separate, opt-in gateway for bounded scientific benchmarks.
// Catalog presence is necessary but never proof of chat capability or scientific validity.
import { discoverResearchModels } from './research-model-catalog.ts';
import type { ResearchKeys } from './research-inference.ts';
const SOURCES = {
  hip: { url:'https://llm-service.ai.tu-darmstadt.de/v1/chat/completions', key:'HIP_API_KEY' },
  blablador: { url:'https://api.blablador.fz-juelich.de/v1/chat/completions', key:'BLABLADOR_API_KEY' }
} as const;
type Provider=keyof typeof SOURCES;
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,199}$/;
const BUDGET={standard:{tokens:512,chars:4000,timeout:45000},benchmark:{tokens:768,chars:12000,timeout:60000}} as const;
const MAX_RESPONSE=65536;
const blockedId=(id:string)=>/embedding|rerank|bge-|gte-|whisper|transcri|tts|audio|image|all-proxy|moderation/i.test(id);
const error=(status:number,code:string)=>({status,data:{error:code}});
async function boundedJson(response:Response){
  const reader=response.body?.getReader();
  if(!reader)throw Error('missing_body');
  let size=0;const chunks:Uint8Array[]=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_RESPONSE){await reader.cancel();throw Error('oversized');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function researchBenchmark(input:unknown,keys:ResearchKeys,transport:typeof fetch=fetch){
  if(!input||typeof input!=='object'||Array.isArray(input))return error(400,'invalid_benchmark_request');
  const x=input as Record<string,unknown>;
  if(Object.keys(x).some(k=>!['provider','model','messages','profile','max_tokens'].includes(k))||
     typeof x.provider!=='string'||!Object.hasOwn(SOURCES,x.provider)||
     typeof x.model!=='string'||!SAFE_ID.test(x.model)||
     typeof x.profile!=='string'||!Object.hasOwn(BUDGET,x.profile))
    return error(400,'invalid_benchmark_request');
  const provider=x.provider as Provider,model=x.model,profile=BUDGET[x.profile as keyof typeof BUDGET];
  const messages=x.messages;
  if(!Array.isArray(messages)||messages.length<1||messages.length>8 ||
     messages.some(m=>!m||typeof m!=='object'||Array.isArray(m)||
       Object.keys(m).sort().join(',')!=='content,role'||
       !['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim())||
     !messages.some(m=>m.role==='user')||
     messages.reduce((a,m)=>a+m.content.length,0)>profile.chars||
     !Number.isSafeInteger(x.max_tokens)||Number(x.max_tokens)<1||Number(x.max_tokens)>profile.tokens)
    return error(400,'invalid_benchmark_request');
  if(blockedId(model))return error(400,'benchmark_non_chat_model');
  const source=SOURCES[provider],key=keys[source.key];
  if(typeof key!=='string'||key.length<8||/\\s/.test(key))return error(503,'research_provider_not_configured');
  // Membership is checked before sending a prompt: the caller cannot create arbitrary
  // provider model names or direct arbitrary requests to a backend.
  const catalog=await discoverResearchModels(provider,keys,transport);
  if(catalog.status!==200)return error(502,'benchmark_catalog_unavailable');
  const models=(catalog.data as {models?:string[]}).models;
  if(!Array.isArray(models)||!models.includes(model))return error(400,'benchmark_model_not_listed');
  let response:Response;
  const started=performance.now();
  try{
    response=await transport(source.url,{method:'POST',redirect:'manual',
      signal:AbortSignal.timeout(profile.timeout),
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({model,messages,max_tokens:x.max_tokens,temperature:0})});
  }catch{return error(502,'benchmark_transport_failed');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});return error(502,'benchmark_upstream_failed');}
  let data:any;
  try{data=await boundedJson(response);}catch{return error(502,'benchmark_invalid_response');}
  const answer=data?.choices?.[0]?.message?.content;
  if(typeof answer!=='string'||!answer.trim()||answer.length>16000||
     answer.includes(key)||data?.model!==model||data?.choices?.[0]?.finish_reason!=='stop')
    return error(502,'benchmark_invalid_response');
  const completionLatencySeconds=Math.round((performance.now()-started)/10)/100;
  const usage=data?.usage;
  if(Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens>Number(x.max_tokens))
    return error(502,'benchmark_token_budget_exceeded');
  const safeUsage=(name:string)=>Number.isSafeInteger(usage?.[name])&&usage[name]>=0?usage[name]:null;
  return {status:200,data:{status:'completed_unverified',provider,model,answer,
    finish_reason:'stop',completion_latency_seconds:completionLatencySeconds,usage:{prompt_tokens:safeUsage('prompt_tokens'),
      completion_tokens:safeUsage('completion_tokens'),total_tokens:safeUsage('total_tokens')},
    scientificallyVerified:false,backendIdentityVerified:false}};
}
