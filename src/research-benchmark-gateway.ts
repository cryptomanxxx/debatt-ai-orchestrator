// A separate, opt-in gateway for bounded scientific benchmarks.
// Catalog presence is necessary but never proof of chat capability or scientific validity.
import { discoverResearchModels, isAlias } from './research-model-catalog.ts';
import type { ResearchKeys } from './research-inference.ts';
const SOURCES = {
  hip: { url:'https://llm-service.ai.tu-darmstadt.de/v1/chat/completions', key:'HIP_API_KEY' },
  blablador: { url:'https://api.blablador.fz-juelich.de/v1/chat/completions', key:'BLABLADOR_API_KEY' }
} as const;
type Provider=keyof typeof SOURCES;
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,199}$/;
const BUDGET={standard:{tokens:512,chars:4000,timeout:45000},benchmark:{tokens:768,chars:12000,timeout:60000}} as const;
const MAX_RESPONSE=65536;
// Same non-chat predicate as the menu's catalog filter (research/explicit-models.mjs).
const blockedId=(id:string)=>/embedding|rerank|bge-|gte-|whisper|transcri|tts|audio|image|all-proxy|moderation|anonymiz/i.test(id);
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
// A benchmark run sends dozens of completions within minutes; refetching the provider catalog
// before every one made Blablador stop answering /models mid-run. A verified catalog is reused
// for CATALOG_TTL_MS per provider and key. Only successful catalogs are cached.
const CATALOG_TTL_MS=60000;
type Catalog=Awaited<ReturnType<typeof discoverResearchModels>>;
export type CatalogCache=Map<string,{key:string,at:number,catalog:Catalog}>;
const sharedCatalogCache:CatalogCache=new Map();
async function catalogFor(provider:Provider,keys:ResearchKeys,transport:typeof fetch,cache:CatalogCache|undefined,now:number){
  const key=keys[SOURCES[provider].key]??'';
  const hit=cache?.get(provider);
  if(hit&&hit.key===key&&now-hit.at>=0&&now-hit.at<CATALOG_TTL_MS)return hit.catalog;
  const catalog=await discoverResearchModels(provider,keys,transport);
  // A failure never evicts: a concurrent request may have just cached a verified catalog.
  if(catalog.status===200)cache?.set(provider,{key,at:now,catalog});
  return catalog;
}
// The shared cache applies only to the production transport; tests pass their own cache.
export async function researchBenchmark(input:unknown,keys:ResearchKeys,transport:typeof fetch=fetch,
  cache:CatalogCache|undefined=transport===fetch?sharedCatalogCache:undefined,now:number=Date.now()){
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
  if(typeof key!=='string'||key.length<8||/\s/.test(key))return error(503,'research_provider_not_configured');
  // Membership is checked before sending a prompt: the caller cannot create arbitrary
  // provider model names or direct arbitrary requests to a backend.
  const catalog=await catalogFor(provider,keys,transport,cache,now);
  if(catalog.status!==200)return error(502,'benchmark_catalog_unavailable');
  const models=(catalog.data as {models?:string[]}).models;
  if(!Array.isArray(models)||!models.includes(model))return error(400,'benchmark_model_not_listed');
  // An alias answers under its backing model's name. It is accepted only when the reply's
  // model is the alias's catalog root, or a catalog entry with that same root.
  const aliasRoot=isAlias(model)?(catalog.data as {aliases?:Record<string,string>}).aliases?.[model]:undefined;
  const roots='roots' in catalog?catalog.roots:undefined;
  // An alias is only run while the live catalog names a usable root, so its reply is always verifiable.
  if(isAlias(model) && aliasRoot===undefined)return error(400,'benchmark_alias_unresolved');
  if(aliasRoot!==undefined && blockedId(aliasRoot))return error(400,'benchmark_non_chat_model');
  let response:Response;
  const started=performance.now();
  try{
    response=await transport(source.url,{method:'POST',redirect:'manual',
      signal:AbortSignal.timeout(profile.timeout),
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({model,messages,max_tokens:x.max_tokens,temperature:0})});
  }catch{return error(502,'benchmark_transport_failed');}
  if(!response.ok){
    const status=response.status;await response.body?.cancel().catch(()=>{});
    if(status===429)return error(429,'benchmark_upstream_rate_limited');
    // Distinct terminal codes let callers stop instead of exhausting a quota or a rejected key.
    if(status===401||status===403)return error(502,'benchmark_upstream_auth_rejected');
    if(status===402)return error(502,'benchmark_upstream_quota_exhausted');
    return error(502,'benchmark_upstream_failed');
  }
  let data:any;
  try{data=await boundedJson(response);}catch(e){return error(502,e instanceof Error && e.message==='oversized'?'benchmark_response_too_large':'benchmark_invalid_upstream_json');}
  const answer=data?.choices?.[0]?.message?.content;
  // No untrusted upstream values are returned in diagnostics: only static error codes.
  if(typeof answer!=='string'||!answer.trim())return error(502,'benchmark_missing_answer');
  if(answer.includes(key))return error(502,'benchmark_invalid_response');
  if(answer.length>16000)return error(502,'benchmark_response_too_large');
  const replied=data?.model;
  const viaAlias=aliasRoot!==undefined && typeof replied==='string' &&
    (replied===aliasRoot || roots?.get(replied)===aliasRoot);
  if(replied!==model && !viaAlias)return error(502,'benchmark_model_identity_mismatch');
  if(!['stop','length'].includes(data?.choices?.[0]?.finish_reason))
    return error(502,'benchmark_invalid_finish_reason');
  const completionLatencySeconds=Math.round((performance.now()-started)/10)/100;
  const usage=data?.usage;
  if(Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens>Number(x.max_tokens))
    return error(502,'benchmark_token_budget_exceeded');
  const safeUsage=(name:string)=>Number.isSafeInteger(usage?.[name])&&usage[name]>=0?usage[name]:null;
  return {status:200,data:{status:'completed_unverified',provider,model,answer,
    finish_reason:data.choices[0].finish_reason,completion_latency_seconds:completionLatencySeconds,usage:{prompt_tokens:safeUsage('prompt_tokens'),
      completion_tokens:safeUsage('completion_tokens'),total_tokens:safeUsage('total_tokens')},
    // resolved_model comes from the validated catalog root, never from the upstream reply.
    ...(aliasRoot!==undefined?{resolved_model:aliasRoot}:{}),
    scientificallyVerified:false,backendIdentityVerified:false}};
}
