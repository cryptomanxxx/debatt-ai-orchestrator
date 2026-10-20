import test from 'node:test';
import assert from 'node:assert/strict';
import {probe,MODELS} from '../research/worker-provider-smoke.mjs';
const key='test-orchestrator-key-is-not-real';
test('unknown providers and missing key never make network calls',async()=>{
  let called=false;
  const transport=async()=>{called=true;throw Error('called');};
  await assert.rejects(()=>probe('toString',{key,fetchImpl:transport}),/invalid_provider/);
  await assert.rejects(()=>probe('hip',{key:'',fetchImpl:transport}),/missing_orchestrator_key/);
  assert.equal(called,false);
});
test('fixed Worker URL and exact authorized request, no provider secrets',async()=>{
  const fake=async (url,opts)=>{
    assert.equal(url,'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/research/inference');
    assert.equal(opts.redirect,'manual');
    assert.equal(opts.headers.Authorization,'Bearer '+key);
    const data=JSON.parse(opts.body);
    assert.deepEqual(Object.keys(data).sort(),['model','prompt','provider']);
    assert.equal(data.provider,'hip');assert.equal(data.model,MODELS.hip);
    return Response.json({status:'completed_unverified',provider:'hip',model:MODELS.hip,
      answer:'READY',scientificallyVerified:false,backendIdentityVerified:false});
  };
  assert.deepEqual(await probe('hip',{key,fetchImpl:fake}),{
    provider:'hip',model:MODELS.hip,status:'connected_unverified'});
});
test('fails closed on redirect, authentication error, bad identity and oversized replies',async()=>{
  const bad=[
    async()=>new Response(null,{status:302,headers:{Location:'https://evil.example'}}),
    async()=>Response.json({error:'unauthorized'},{status:401}),
    async()=>Response.json({status:'completed_unverified',provider:'hip',model:MODELS.hip,
      answer:'READY',scientificallyVerified:true,backendIdentityVerified:false}),
    async()=>Response.json({status:'completed_unverified',provider:'blablador',model:MODELS.blablador,
      answer:'READY',scientificallyVerified:false,backendIdentityVerified:false}),
    async()=>Response.json({status:'completed_unverified',provider:'hip',model:MODELS.hip,
      answer:'x'.repeat(33000),scientificallyVerified:false,backendIdentityVerified:false})
  ];
  for(const fake of bad){
    const result=await probe('hip',{key,fetchImpl:fake});
    assert.equal(result.status,'failed');
    assert.equal(Object.hasOwn(result,'answer'),false);
  }
});

test('reports only allowlisted diagnostic values from a bounded Worker error body',async()=>{
  const valid=await probe('blablador',{key,fetchImpl:async()=>Response.json({
    error:'research_response_model_mismatch',answer:'NEVER STORE ME'
  },{status:502})});
  assert.deepEqual(valid,{provider:'blablador',model:MODELS.blablador,
    status:'failed',error:'research_response_model_mismatch'});
  for(const error of ['secret data','__proto__','research_random_error']){
    const result=await probe('blablador',{key,fetchImpl:async()=>Response.json({
      error,credential:key
    },{status:502})});
    assert.equal(result.error,'http_502');
    assert.ok(!JSON.stringify(result).includes(key));
  }
  const large=await probe('blablador',{key,fetchImpl:async()=>Response.json({
    error:'research_response_model_mismatch',junk:'x'.repeat(2000)
  },{status:502})});
  assert.equal(large.error,'http_502');
});
