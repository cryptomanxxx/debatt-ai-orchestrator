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
  {model:input.model,choices:[{finish_reason:'length',message:{content:'ok'}}]},
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
