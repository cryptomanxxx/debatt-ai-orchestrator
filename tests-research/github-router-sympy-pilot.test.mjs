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

test('network failure is preserved as model_transport_error in partial report',async()=>{
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'operator-selected'},
    propose:researchProposer(choice,env,async()=>{throw new TypeError('network unreachable');}),
    write:async(path,text)=>writes.push(JSON.parse(text)),
  }),/model_transport_error/);
  assert.equal(writes.at(-1).failureCode,'model_transport_error');
});
test('HTTP 429 is preserved as model_upstream_http_error in partial report',async()=>{
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'operator-selected'},
    propose:researchProposer(choice,env,async()=>new Response('private server error',{status:429})),
    write:async(path,text)=>writes.push(JSON.parse(text)),
  }),/model_upstream_http_error/);
  assert.equal(writes.at(-1).failureCode,'model_upstream_http_error');
});

test('longer credential is redacted before shared prefix in persisted report',async()=>{
  const short='shared-secret-key-123';
  const long=short+'-longer-suffix-456';
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'abc',BLABLADOR_API_KEY:short,HIP_API_KEY:long},
    write:async(path,text)=>writes.push(text),
  }),/invalid_seed/);
  // Test the persistence path with a provider-supplied model reason bearing both keys.
  writes.length=0;
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',BLABLADOR_API_KEY:short,HIP_API_KEY:long},
    select:{...choice,reason:'credential '+long},
    propose:async()=>{throw new Error('stop');},
    write:async(path,text)=>writes.push(text),
  }),/research_pilot_failed/);
  assert.ok(writes.every(x=>!x.includes(long)&&!x.includes(short)&&!x.includes('-longer-suffix-456')));
});
test('body stream failures become a bounded transport error',async()=>{
  const stream=new ReadableStream({pull(){throw new Error('connection interrupted');}});
  const propose=researchProposer(choice,env,async()=>({ok:true,body:stream}));
  await assert.rejects(propose([{role:'user',content:'test'}]),/model_transport_error/);
});
test('oversized model response preserves its failure code in report',async()=>{
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'operator-selected'},
    propose:researchProposer(choice,env,async()=>new Response('x'.repeat(70000))),
    write:async(path,text)=>writes.push(JSON.parse(text)),
  }),/oversized_provider_response/);
  assert.equal(writes.at(-1).failureCode,'oversized_provider_response');
});
test('SymPy tool transport failures preserve their failure code',async()=>{
  const writes=[];
  const {ResearchError}=await import('../research/errors.mjs');
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'operator-selected'},
    propose:async()=>({text:'{"method":"sympy","roots":[],"reason":"test"}',provider:choice.provider,model:choice.model}),
    tool:async()=>{throw new ResearchError('tool_transport_error');},
    write:async(path,text)=>writes.push(JSON.parse(text)),
  }),/tool_transport_error/);
  assert.equal(writes.at(-1).failureCode,'tool_transport_error');
});

test('JSON-structure-like credential does not corrupt persisted report',async()=>{
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'abc',BLABLADOR_API_KEY:'status":',HIP_API_KEY:'hip-secret-1234567'},
    write:async(path,text)=>writes.push(JSON.parse(text))
  }),/invalid_seed/);
  assert.equal(writes.at(-1).failureCode,'invalid_seed');
});
test('malformed successful provider JSON retains response failure code',async()=>{
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'selected'},
    propose:researchProposer(choice,env,async()=>new Response('broken JSON',{status:200})),
    write:async(path,text)=>writes.push(JSON.parse(text))
  }),/invalid_model_response/);
  assert.equal(writes.at(-1).failureCode,'invalid_model_response');
});
test('sanitized discovery issues are included in selection provenance',async()=>{
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'selected',issues:[{provider:'hip',error:'http_503'}, {provider:'hip',error:'secret-token'}]},
    propose:async()=>{throw new Error('halt');},
    write:async(path,text)=>writes.push(JSON.parse(text))
  }),/research_pilot_failed/);
  assert.deepEqual(writes.at(-1).discoveryIssues,[{provider:'hip',error:'http_503'}]);
});

test('empty successful response has structured invalid-model-response error',async()=>{
  const proposer=researchProposer(choice,env,async()=>new Response(null,{status:204}));
  await assert.rejects(proposer([{role:'user',content:'hi'}]),/invalid_model_response/);
});
test('auto fallback captures oversized discovery and provider-specific rejected candidate',async()=>{
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'fallback',issues:[
      {provider:'hip',error:'oversized_response'},
      {provider:'hip',model:'Mistral-Medium-3.5-128B',error:'not_listed'},
      {provider:'blablador',model:'alias-glm-5.3-flash',error:'not_listed'}]},
    propose:async()=>{throw new Error('halt');},
    write:async(path,text)=>writes.push(JSON.parse(text)),
  }),/research_pilot_failed/);
  assert.deepEqual(writes.at(-1).discoveryIssues,[
    {provider:'hip',error:'oversized_response'},
    {provider:'hip',error:'not_listed',model:'Mistral-Medium-3.5-128B'},
    {provider:'blablador',error:'not_listed',model:'alias-glm-5.3-flash'}]);
});
test('tool diagnostic preserves case and operation context',async()=>{
  const {ResearchError}=await import('../research/errors.mjs');
  const writes=[];
  await assert.rejects(runPilot({
    env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'selected'},
    propose:async()=>({text:'{"method":"sympy","roots":[],"reason":"test"}',provider:choice.provider,model:choice.model}),
    tool:async()=>{throw new ResearchError('tool_transport_error');},
    write:async(path,text)=>writes.push(JSON.parse(text)),
  }),/tool_transport_error/);
  assert.equal(writes.at(-1).failureCase,1);
  assert.equal(writes.at(-1).failureOperation,'positive_control');
});

test('short invalid credential does not corrupt ordinary report values',async()=>{
  const writes=[];
  await assert.rejects(runPilot({env:{EXPERIMENT_SEED:'abc',BLABLADOR_API_KEY:env.BLABLADOR_API_KEY,HIP_API_KEY:'failed'},
    write:async(path,text)=>writes.push(JSON.parse(text))}),/invalid_seed/);
  assert.equal(writes.at(-1).status,'failed');
});
test('router HTTP errors preserve full bounded status range',async()=>{
  const writes=[];
  await assert.rejects(runPilot({env:{EXPERIMENT_SEED:'20261016',...env},
    select:{...choice,reason:'fallback',issues:[{provider:'hip',error:'http_408'}, {provider:'hip',error:'http_422'}]},
    propose:async()=>{throw new Error('stop');},
    write:async(path,text)=>writes.push(JSON.parse(text))}),/research_pilot_failed/);
  assert.deepEqual(writes.at(-1).discoveryIssues,[{provider:'hip',error:'http_408'}, {provider:'hip',error:'http_422'}]);
  assert.equal(writes.at(-1).selected.backendIdentityVerified,false);
});
