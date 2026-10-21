import test from 'node:test';
import assert from 'node:assert/strict';
import {probe,PREFERRED} from '../research/worker-provider-smoke.mjs';
const key='test-orchestrator-key-is-not-real';
const WORKER='https://debatt-ai-orchestrator.xx8031126.workers.dev';
const catalog={status:'discovered_unverified',providers:{
  hip:{status:'catalog_unverified',provider:'hip',models:['bge-reranker-v2-m3',PREFERRED.hip,'Kimi-K2.6']},
  blablador:{status:'catalog_unverified',provider:'blablador',models:['alias-fast','Qwen3.8-27B','deepseek-v4.1-flash-at-hzdr']}
}};
const ok=(provider,model,extra={})=>Response.json({status:'completed_unverified',provider,model,
  answer:'READY',scientificallyVerified:false,backendIdentityVerified:false,...extra});
function worker(reply,models=catalog){
  return async (url,opts)=>{
    assert.equal(opts.redirect,'manual');
    assert.equal(opts.headers.Authorization,'Bearer '+key);
    if(url===WORKER+'/v1/research/models'){assert.equal(opts.method,'GET');return Response.json(models);}
    assert.equal(url,WORKER+'/v1/research/benchmark');
    return reply(JSON.parse(opts.body));
  };
}
test('unknown providers and missing key never make network calls',async()=>{
  let called=false;
  const transport=async()=>{called=true;throw Error('called');};
  await assert.rejects(()=>probe('toString',{key,fetchImpl:transport}),/invalid_provider/);
  await assert.rejects(()=>probe('hip',{key:'',fetchImpl:transport}),/missing_orchestrator_key/);
  assert.equal(called,false);
});
test('fixed Worker URLs, preferred HIP model and bounded benchmark request',async()=>{
  const fake=worker(data=>{
    assert.deepEqual(Object.keys(data).sort(),['max_tokens','messages','model','profile','provider']);
    assert.equal(data.provider,'hip');assert.equal(data.model,PREFERRED.hip);
    assert.equal(data.profile,'standard');
    return ok('hip',PREFERRED.hip);
  });
  assert.deepEqual(await probe('hip',{key,fetchImpl:fake}),{
    provider:'hip',model:PREFERRED.hip,status:'connected_unverified'});
});
test('Blablador uses the first explicit catalog ID, never an alias',async()=>{
  let sent;
  const fake=worker(data=>{sent=data.model;return ok('blablador',data.model,{finish_reason:'length'});});
  assert.deepEqual(await probe('blablador',{key,fetchImpl:fake}),{
    provider:'blablador',model:'deepseek-v4.1-flash-at-hzdr',status:'connected_unverified'});
  assert.equal(sent,'deepseek-v4.1-flash-at-hzdr');
  const onlyAliases=structuredClone(catalog);onlyAliases.providers.blablador.models=['alias-fast'];
  const result=await probe('blablador',{key,fetchImpl:worker(()=>assert.fail('no inference'),onlyAliases)});
  assert.equal(result.error,'no_explicit_chat_model');
});
test('fails closed on redirect, authentication error, bad identity and oversized replies',async()=>{
  const bad=[
    async()=>new Response(null,{status:302,headers:{Location:'https://evil.example'}}),
    async()=>Response.json({error:'unauthorized'},{status:401}),
    worker(()=>ok('hip',PREFERRED.hip,{scientificallyVerified:true})),
    worker(()=>ok('hip','Kimi-K2.6')),
    worker(()=>ok('hip',PREFERRED.hip,{answer:'x'.repeat(33000)})),
    worker(()=>{throw Error('network '+key);})
  ];
  for(const fake of bad){
    const result=await probe('hip',{key,fetchImpl:fake});
    assert.equal(result.status,'failed');
    assert.equal(Object.hasOwn(result,'answer'),false);
    assert.ok(!JSON.stringify(result).includes(key));
  }
});
test('reports only allowlisted diagnostic values from a bounded Worker error body',async()=>{
  const valid=await probe('blablador',{key,fetchImpl:worker(()=>Response.json({
    error:'benchmark_model_identity_mismatch',answer:'NEVER STORE ME'
  },{status:502}))});
  assert.deepEqual(valid,{provider:'blablador',model:'deepseek-v4.1-flash-at-hzdr',
    status:'failed',error:'benchmark_model_identity_mismatch'});
  for(const error of ['secret data','__proto__','research_random_error']){
    const result=await probe('blablador',{key,fetchImpl:worker(()=>Response.json({
      error,credential:key
    },{status:502}))});
    assert.equal(result.error,'http_502');
    assert.ok(!JSON.stringify(result).includes(key));
  }
  const large=await probe('blablador',{key,fetchImpl:worker(()=>Response.json({
    error:'benchmark_model_identity_mismatch',junk:'x'.repeat(2000)
  },{status:502}))});
  assert.equal(large.error,'http_502');
});
