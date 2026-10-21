import test from 'node:test';
import assert from 'node:assert/strict';
import {researchBenchmark} from '../src/research-benchmark-gateway.ts';
const keys={HIP_API_KEY:'hip-test-secret-123456789',BLABLADOR_API_KEY:'blablador-test-secret-123456789'};
const input={provider:'hip',model:'Qwen3.8-27B',profile:'benchmark',max_tokens:768,
  messages:[{role:'system',content:'Answer scientifically.'},{role:'user',content:'Solve x^2=4.'}]};
function transport(url:string|URL|Request,init?:RequestInit){
  const dest=String(url);
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+keys.HIP_API_KEY);
  if(dest.endsWith('/models'))return Promise.resolve(Response.json({data:[
    {id:'Qwen3.8-27B'},{id:'gte-Qwen2-1.5B-instruct'},{id:'Mistral-Medium-3.5-128B'}]}));
  assert.equal(dest,'https://llm-service.ai.tu-darmstadt.de/v1/chat/completions');
  const body=JSON.parse(String(init?.body));
  assert.equal(body.max_tokens,768);assert.equal(body.temperature,0);
  assert.deepEqual(body.messages,input.messages);
  return Promise.resolve(Response.json({model:input.model,choices:[{finish_reason:'stop',message:{content:'roots: -2, 2'}}],
    usage:{prompt_tokens:21,completion_tokens:12,total_tokens:33}}));
}
test('benchmark retains message roles, catalog verification and 768-token budget',async()=>{
 const r=await researchBenchmark(input,keys,transport as typeof fetch);
 assert.equal(r.status,200);
 assert.deepEqual((r.data as any).usage,{prompt_tokens:21,completion_tokens:12,total_tokens:33});
 assert.equal((r.data as any).scientificallyVerified,false);
});
test('rejects invalid, oversize and unknown model requests before completion',async()=>{
 for(const change of [
  {max_tokens:769},{messages:[{role:'user',content:'x'.repeat(12001)}]},
  {messages:[{role:'tool',content:'a'}]},{messages:[{role:'user',content:'a',url:'https://evil.example'}]},
  {profile:'unbounded'},{model:'gte-Qwen2-1.5B-instruct'}, {model:'../evil'}, {model:'not-listed'}
 ]){
  const r=await researchBenchmark({...input,...change},keys,transport as typeof fetch);
  assert.equal(r.status,400);
 }
});
test('strictly rejects upstream identity swaps, secrets, malformed and incomplete replies',async()=>{
 const responses=[
  {model:'other',choices:[{finish_reason:'stop',message:{content:'ok'}}]},
  {model:input.model,choices:[{finish_reason:'stop',message:{content:keys.HIP_API_KEY}}]}
 ];
 for(const answer of responses){
  const r=await researchBenchmark(input,keys,(async(url:string|URL|Request,init?:RequestInit)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
   return Response.json(answer);
  }) as typeof fetch);
  assert.equal(r.status,502);
  assert.ok(!JSON.stringify(r.data).includes(keys.HIP_API_KEY));
 }
});

test('distinguishes safe validation failures without leaking upstream contents',async()=>{
 const cases=[
  {answer:{model:'other',choices:[{finish_reason:'stop',message:{content:'secret reply'}}]},code:'benchmark_model_identity_mismatch'},
  {answer:{model:input.model,choices:[{finish_reason:'stop',message:{content:''}}]},code:'benchmark_missing_answer'},
  {answer:{model:input.model,choices:[{finish_reason:'other',message:{content:'valid'}}]},code:'benchmark_invalid_finish_reason'},
  {answer:{model:input.model,choices:[{finish_reason:'stop',message:{content:'x'.repeat(16001)}}]},code:'benchmark_response_too_large'},
 ];
 for(const {answer,code} of cases){
  const r=await researchBenchmark(input,keys,(async(url:string|URL|Request)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
   return Response.json(answer);
  }) as typeof fetch);
  assert.equal(r.status,502);
  assert.deepEqual(r.data,{error:code});
  assert.ok(!JSON.stringify(r.data).includes('secret reply'));
 }
 const invalid=await researchBenchmark(input,keys,(async(url:string|URL|Request)=>{
  if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
  return new Response('private upstream contents',{status:200});
 }) as typeof fetch);
 assert.deepEqual(invalid.data,{error:'benchmark_invalid_upstream_json'});
 const huge=await researchBenchmark(input,keys,(async(url:string|URL|Request)=>{
  if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
  return new Response('x'.repeat(65537),{status:200});
 }) as typeof fetch);
 assert.deepEqual(huge.data,{error:'benchmark_response_too_large'});
});
test('maps provider throttling into bounded HTTP 429 without exposing backend response',async()=>{
 const stub=async(url:string|URL|Request)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
   return new Response('upstream secret', {status:429});
 };
 const r=await researchBenchmark(input,keys,stub as typeof fetch);
 assert.equal(r.status,429);
 assert.deepEqual(r.data,{error:'benchmark_upstream_rate_limited'});
 assert.ok(!JSON.stringify(r).includes('upstream secret'));
});
test('keeps provider authentication and quota rejections distinct and terminal',async()=>{
 for(const [status,code] of [[401,'benchmark_upstream_auth_rejected'],[403,'benchmark_upstream_auth_rejected'],
   [402,'benchmark_upstream_quota_exhausted'],[500,'benchmark_upstream_failed']] as const){
  const stub=async(url:string|URL|Request)=>{
    if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
    return new Response('upstream secret', {status});
  };
  const r=await researchBenchmark(input,keys,stub as typeof fetch);
  assert.equal(r.status,502);
  assert.deepEqual(r.data,{error:code});
  assert.ok(!JSON.stringify(r).includes('upstream secret'));
 }
});
test('retains safe length responses without claiming scientific verification',async()=>{
 const stub=async(url:string|URL|Request)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
   return Response.json({model:input.model,choices:[{finish_reason:'length',message:{content:'partial answer'}}],
     usage:{prompt_tokens:8,completion_tokens:768,total_tokens:776}});
 };
 const r=await researchBenchmark(input,keys,stub as typeof fetch);
 assert.equal(r.status,200);
 assert.equal((r.data as any).finish_reason,'length');
 assert.equal((r.data as any).answer,'partial answer');
 assert.equal((r.data as any).scientificallyVerified,false);
});
test('rejects provider keys containing whitespace before calling discovery',async()=>{
 let calls=0;
 const result=await researchBenchmark(input,{HIP_API_KEY:'invalid secret value'},(async()=>{
   calls++;throw Error('network must not be called');
 }) as typeof fetch);
 assert.equal(result.status,503);assert.equal(calls,0);
});
test('blocks over-budget reported completion tokens and retains completion-only latency',async()=>{
 const stub=async(url:string|URL|Request)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
   return Response.json({model:input.model,choices:[{finish_reason:'stop',message:{content:'ok'}}],
     usage:{completion_tokens:769}});
 };
 const over=await researchBenchmark(input,keys,stub as typeof fetch);
 assert.equal(over.status,502);
 assert.deepEqual(over.data,{error:'benchmark_token_budget_exceeded'});
 const ok=await researchBenchmark(input,keys,transport as typeof fetch);
 assert.equal(ok.status,200);
 assert.equal(typeof (ok.data as any).completion_latency_seconds,'number');
 assert.ok((ok.data as any).completion_latency_seconds>=0);
});
test('catalog-listed HIP VL chat model is allowed for text prompts',async()=>{
 const model='qwen3-vl-30b-a3b-instruct-awq';
 const result=await researchBenchmark({...input,model},keys,(async(url:string|URL|Request)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:model}]});
   return Response.json({model,choices:[{finish_reason:'stop',message:{content:'ok'}}]});
 }) as typeof fetch);
 assert.equal(result.status,200);
});

const aliasInput={provider:'blablador',model:'alias-fast',profile:'benchmark',max_tokens:768,
  messages:[{role:'user',content:'Solve x^2=4.'}]};
function aliasTransport(replyModel:unknown){
  return (async(url:string|URL|Request)=>{
    if(String(url).endsWith('/models'))return Response.json({data:[
      {id:'01 - GPT-OSS-120b - an open model',root:'openai/gpt-oss-120b'},
      {id:'alias-fast',root:'openai/gpt-oss-120b'},
      {id:'alias-code',root:'Qwen/Qwen3.8-27B-FP8'},
      {id:'07 - Qwen3.8-27B-FP8',root:'Qwen/Qwen3.8-27B-FP8'}]});
    return Response.json({model:replyModel,choices:[{finish_reason:'stop',message:{content:'2'}}],usage:{}});
  }) as typeof fetch;
}
test('an alias is accepted only when the reply comes from its catalog root',async()=>{
 for(const replied of ['openai/gpt-oss-120b','01 - GPT-OSS-120b - an open model','alias-fast']){
  const r:any=await researchBenchmark(aliasInput,keys,aliasTransport(replied));
  assert.equal(r.status,200,replied);
  assert.equal(r.data.model,'alias-fast');
  assert.equal(r.data.resolved_model,'openai/gpt-oss-120b','every rooted alias reply names its root');
  assert.ok(!JSON.stringify(r.data).includes('01 - GPT'),'upstream display name is never echoed');
 }
 for(const replied of ['Qwen/Qwen3.8-27B-FP8','07 - Qwen3.8-27B-FP8','other',null]){
  const r:any=await researchBenchmark(aliasInput,keys,aliasTransport(replied));
  assert.deepEqual(r.data,{error:'benchmark_model_identity_mismatch'},String(replied));
 }
});
test('an alias never accepts another alias root',async()=>{
 const r:any=await researchBenchmark({...aliasInput,model:'alias-code'},keys,aliasTransport('openai/gpt-oss-120b'));
 assert.deepEqual(r.data,{error:'benchmark_model_identity_mismatch'});
});
test('an alias whose current root is a non-chat model is refused before any completion',async()=>{
 let completions=0;
 const t=(async(url:string|URL|Request)=>{
  if(String(url).endsWith('/models'))return Response.json({data:[{id:'alias-fast',root:'Qwen/Qwen3-Embedding-8B'}]});
  completions++;return Response.json({});
 }) as typeof fetch;
 const r:any=await researchBenchmark(aliasInput,keys,t);
 assert.equal(r.status,400);assert.deepEqual(r.data,{error:'benchmark_non_chat_model'});
 assert.equal(completions,0);
});
test('rootless aliases and anonymizer roots are refused before any completion',async()=>{
 for(const [root,code] of [[undefined,'benchmark_alias_unresolved'],['None','benchmark_alias_unresolved'],
   ['bad root','benchmark_alias_unresolved'],['org/text-anonymizer-v1','benchmark_non_chat_model']]){
  let completions=0;
  const t=(async(url:string|URL|Request)=>{
   if(String(url).endsWith('/models'))return Response.json({data:[{id:'alias-fast',...(root?{root}:{})}]});
   completions++;return Response.json({model:'alias-fast',choices:[{finish_reason:'stop',message:{content:'2'}}]});
  }) as typeof fetch;
  const r:any=await researchBenchmark(aliasInput,keys,t);
  assert.deepEqual(r.data,{error:code},String(root));assert.equal(completions,0);
 }
});
test('alias prefixes are case-insensitive: an upper-case alias still needs its root',async()=>{
 const t=(root?:string)=>(async(url:string|URL|Request)=>{
  if(String(url).endsWith('/models'))return Response.json({data:[{id:'ALIAS-Fast',...(root?{root}:{})}]});
  return Response.json({model:'ALIAS-Fast',choices:[{finish_reason:'stop',message:{content:'2'}}]});
 }) as typeof fetch;
 const input={...aliasInput,model:'ALIAS-Fast'};
 assert.deepEqual((await researchBenchmark(input,keys,t()) as any).data,{error:'benchmark_alias_unresolved'});
 assert.deepEqual((await researchBenchmark(input,keys,t('/')) as any).data,{error:'benchmark_alias_unresolved'});
 const ok:any=await researchBenchmark(input,keys,t('openai/gpt-oss-120b'));
 assert.equal(ok.status,200);assert.equal(ok.data.resolved_model,'openai/gpt-oss-120b');
});
test('reuses a verified catalog for a minute per provider and key, never a failed one',async()=>{
 let catalogCalls=0,fail=false;
 const counting=(async(url:string|URL|Request,init?:RequestInit)=>{
  if(String(url).endsWith('/models')){
   catalogCalls++;
   return fail?new Response('busy',{status:503}):Response.json({data:[{id:input.model}]});
  }
  return transport(url,init);
 }) as typeof fetch;
 const cache=new Map();
 for(const now of [1000,30000,60999])
  assert.equal((await researchBenchmark(input,keys,counting,cache,now)).status,200);
 assert.equal(catalogCalls,1);
 fail=true;
 const expired=await researchBenchmark(input,keys,counting,cache,61000);
 assert.equal((expired.data as any).error,'benchmark_catalog_unavailable');
 assert.equal(catalogCalls,2);
 assert.equal((await researchBenchmark(input,keys,counting,cache,61001)).status,502);
 assert.equal(catalogCalls,3);
 fail=false;
 assert.equal((await researchBenchmark(input,keys,counting,cache,62000)).status,200);
 const rotated={...keys,HIP_API_KEY:keys.HIP_API_KEY};
 cache.set('hip',{...cache.get('hip'),key:'old-key-0000000000'});
 assert.equal((await researchBenchmark(input,rotated,counting,cache,62001)).status,200);
 assert.equal(catalogCalls,5);
});
test('a failed catalog lookup never evicts one a concurrent request cached',async()=>{
 const cache=new Map();let release:()=>void=()=>{};
 const gate=new Promise<void>(r=>{release=r;});
 const slowFail=(async(url:string|URL|Request)=>{
  if(String(url).endsWith('/models')){await gate;return new Response('busy',{status:503});}
  throw Error('unreachable');
 }) as typeof fetch;
 const ok=(async(url:string|URL|Request,init?:RequestInit)=>String(url).endsWith('/models')?
  Response.json({data:[{id:input.model}]}):transport(url,init)) as typeof fetch;
 const failing=researchBenchmark(input,keys,slowFail,cache,1000);
 assert.equal((await researchBenchmark(input,keys,ok,cache,1000)).status,200);
 release();
 assert.equal((await failing).status,502);
 assert.equal(cache.get('hip')?.at,1000);
});
test('an explicit model may answer under its own catalog root, never another root',async()=>{
 const explicit={...aliasInput,model:'Swift-Qwen3.8-27b'};
 const t=(replied:unknown)=>(async(url:string|URL|Request)=>{
  if(String(url).endsWith('/models'))return Response.json({data:[
   {id:'Swift-Qwen3.8-27b',root:'/p/scratch/swift/Qwen3.8-27B'},
   {id:'Qwen3.8 Swift - speculative decoding',root:'/p/scratch/swift/Qwen3.8-27B'},
   {id:'alias-fast',root:'openai/gpt-oss-120b'},{id:'plain-model'},
   {id:'chatty-name',root:'BAAI/bge-reranker-v2'}]});
  return Response.json({model:replied,choices:[{finish_reason:'stop',message:{content:'2'}}]});
 }) as typeof fetch;
 for(const replied of ['Swift-Qwen3.8-27b','/p/scratch/swift/Qwen3.8-27B','Qwen3.8 Swift - speculative decoding']){
  const r:any=await researchBenchmark(explicit,keys,t(replied));
  assert.equal(r.status,200,replied);
  assert.equal(r.data.model,'Swift-Qwen3.8-27b');
  assert.equal(r.data.resolved_model,undefined,'only aliases report a resolved model');
 }
 for(const replied of ['openai/gpt-oss-120b','alias-fast','Qwen/Qwen3.8-27B-FP8',null]){
  const r:any=await researchBenchmark(explicit,keys,t(replied));
  assert.equal(r.data.error,'benchmark_model_identity_mismatch',String(replied));
 }
 const rootless:any=await researchBenchmark({...explicit,model:'plain-model'},keys,t('/p/scratch/swift/Qwen3.8-27B'));
 assert.equal(rootless.data.error,'benchmark_model_identity_mismatch');
 const nonChat:any=await researchBenchmark({...explicit,model:'chatty-name'},keys,t('BAAI/bge-reranker-v2'));
 assert.equal(nonChat.data.error,'benchmark_model_identity_mismatch','a non-chat root never vouches for a reply');
});
test('the lab profile allows the lab 4,096-token budget and nothing above it',async()=>{
 const lab={...input,profile:'lab',max_tokens:4096};
 const t=(async(url:string|URL|Request,init?:RequestInit)=>{
  if(String(url).endsWith('/models'))return Response.json({data:[{id:input.model}]});
  assert.equal(JSON.parse(String(init?.body)).max_tokens,4096);
  return Response.json({model:input.model,choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{completion_tokens:900}});
 }) as typeof fetch;
 assert.equal((await researchBenchmark(lab,keys,t)).status,200);
 assert.equal((await researchBenchmark({...lab,max_tokens:4097},keys,t)).status,400);
 assert.equal((await researchBenchmark({...input,max_tokens:769},keys,t)).status,400,'benchmark keeps its 768 cap');
});
