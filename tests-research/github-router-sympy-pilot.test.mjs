import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedSelection,readJsonBounded,researchProposer,runPilot} from '../research/github-router-sympy-pilot.mjs';

const env={BLABLADOR_API_KEY:'a'.repeat(24),HIP_API_KEY:'b'.repeat(24)};
const choice={provider:'blablador',model:'alias-kimi-k3-1m'};
test('only allowlisted route and model with a secret may run',()=>{
  assert.equal(checkedSelection(choice,env).model,choice.model);
  assert.throws(()=>checkedSelection({provider:'unknown',model:'x'},env),/untrusted_route/);
  assert.throws(()=>checkedSelection({provider:'blablador',model:'arbitrary-model'},env),/untrusted_model/);
  assert.throws(()=>checkedSelection(choice,{}),/missing_provider_key/);
});
test('router pins returned model, bounds output and does not leak keys',async()=>{
  let called=0;
  const propose=researchProposer(choice,env,async(url,req)=>{
    called++;
    assert.equal(url,'https://api.blablador.fz-juelich.de/v1/chat/completions');
    assert.equal(req.headers.Authorization,'Bearer '+env.BLABLADOR_API_KEY);
    assert.equal(JSON.parse(req.body).max_tokens,768);
    return Response.json({model:choice.model,choices:[{finish_reason:'stop',message:{content:'{"method":"sympy","roots":[],"reason":"none"}'}}]});
  });
  const reply=await propose([{role:'user',content:'compute'}]);
  assert.equal(reply.provider,'blablador');
  assert.equal(reply.model,choice.model);
  assert.equal(JSON.stringify(reply).includes(env.BLABLADOR_API_KEY),false);
  assert.equal(called,1);
});
test('identity mismatch and output truncation fail closed',async()=>{
  const fake=record=>async()=>Response.json(record);
  await assert.rejects(researchProposer(choice,env,fake({
    model:'another',choices:[{finish_reason:'stop',message:{content:'hi'}}]}))([{role:'user',content:'hi'}]),/model_identity_mismatch/);
  await assert.rejects(researchProposer(choice,env,fake({
    model:choice.model,choices:[{finish_reason:'length',message:{content:'partial'}}]}))([{role:'user',content:'hi'}]),/incomplete_model_response/);
});
test('HTTP errors are bounded and do not silently change provider',async()=>{
  let n=0;
  await assert.rejects(researchProposer(choice,env,async()=>{
    n++;return new Response('do not expose upstream content',{status:429});
  })([{role:'user',content:'hi'}]),/model_upstream_http_error/);
  assert.equal(n,1);
});
test('oversized streamed replies are canceled before memory accumulation',async()=>{
  let canceled=false;
  const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(70000));},cancel(){canceled=true;}});
  await assert.rejects(readJsonBounded({body:stream}),/oversized_provider_response/);
  assert.equal(canceled,true);
});

test('provider secret reflection is rejected before reporting model output',async()=>{
  const secret='the"\\key-123456789';
  const credentials={...env,BLABLADOR_API_KEY:secret};
  const propose=researchProposer(choice,credentials,async()=>Response.json({
    model:choice.model,choices:[{finish_reason:'stop',message:{content:'{"method":"sympy","roots":[],"reason":"'+secret+'"}'}}]
  }));
  await assert.rejects(propose([{role:'user',content:'test'}]),/provider_secret_echoed/);
});
test('invalid seed produces a persisted failed artifact rather than none',async()=>{
  const writes=[];
  await assert.rejects(runPilot({env:{EXPERIMENT_SEED:'abc',...env},
    write:async(path,text)=>writes.push(JSON.parse(text))}),/invalid_seed/);
  assert.equal(writes.at(-1).status,'failed');
  assert.equal(writes.at(-1).failureCode,'invalid_seed');
});
test('credential redaction handles serialized escaping',async()=>{
  const secret='key-"\\-dangerous-123';
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',BLABLADOR_API_KEY:secret},
    select:{...choice,reason:'operator-selected'},
    propose:async()=>{throw new Error('unexpected');},
    write:async(path,text)=>writes.push(text),
  }),/research_pilot_failed/);
  assert.ok(writes.length>=2);
  assert.ok(writes.every(x=>!x.includes(secret)&&!x.includes(JSON.stringify(secret).slice(1,-1))));
});
test('provider identity errors stay recognizable across SymPy wrapper',async()=>{
  const writes=[];
  await assert.rejects(runPilot({env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'operator-selected'},
    propose:researchProposer(choice,env,async()=>Response.json({
      model:'wrong-model',choices:[{finish_reason:'stop',message:{content:'{}'}}]})),
    write:async(path,text)=>writes.push(JSON.parse(text)),
  }),/model_identity_mismatch/);
  assert.equal(writes.at(-1).failureCode,'model_identity_mismatch');
});
