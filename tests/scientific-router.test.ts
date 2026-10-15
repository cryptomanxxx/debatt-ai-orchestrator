import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { chooseScientificRoute, routedCompletion } from '../src/models/scientific-router.ts';
import { ModelRequestError } from '../src/providers/openai.ts';
import { executeQuery } from '../src/query.ts';
const base = { ORCHESTRATOR_API_KEY:'a'.repeat(32), MODEL_PROVIDER:'openai',
  MODEL_DEFAULT:'gpt-oss', MODEL_API_KEY:'primary-secret',
  MODEL_BASE_URL:'https://primary.example/v1', MODEL_PRIMARY_CONTEXT_CHARS:'1000',
  MODEL_SECONDARY_NAME:'long-context', MODEL_SECONDARY_BASE_URL:'https://secondary.example/v1',
  MODEL_SECONDARY_API_KEY:'secondary-secret', MODEL_SECONDARY_CONTEXT_CHARS:'32000' };
const config = loadConfig(base);
test('reject incomplete and insecure secondary config and invalid limits', () => {
  assert.throws(() => loadConfig({ ...base, MODEL_SECONDARY_API_KEY:'' }), /Incomplete secondary/);
  assert.throws(() => loadConfig({ ...base, MODEL_SECONDARY_BASE_URL:'http://secondary.example/v1' }), /Invalid secondary model URL/);
  assert.throws(() => loadConfig({ ...base, MODEL_PRIMARY_CONTEXT_CHARS:'abc' }), /Invalid context character limit/);
});
test('auto selects secondary for over-limit context but default never silently switches', () => {
  assert.equal(chooseScientificRoute('x'.repeat(1500),'auto',config).selected,'secondary');
  assert.equal(chooseScientificRoute('small','auto',config).selected,'primary');
  assert.throws(() => chooseScientificRoute('x'.repeat(1500),'default',config), /context_capacity_unavailable/);
  assert.throws(() => chooseScientificRoute('x'.repeat(32001),'auto',config), /context_capacity_unavailable/);
});
test('secondary routing uses separate endpoint and key; trace names actual model', async () => {
  const requests: Array<{model:string;key:string;url:string}> = [];
  const fake = async (_message:string, model:string, opts:typeof config) => {
    requests.push({model,key:opts.modelKey,url:opts.baseUrl});
    return 'accepted';
  };
  const result = await routedCompletion('x'.repeat(1500),'auto','gpt-oss',config,1024,fake);
  assert.equal(result.model,'long-context');
  assert.equal(result.routing.route,'secondary');
  assert.deepEqual(requests,[{model:'long-context',key:'secondary-secret',url:'https://secondary.example/v1'}]);
  assert.equal(JSON.stringify(result).includes('secondary-secret'),false);
});
test('auto retries only transient errors; locked modes never fail over', async () => {
  const calls:string[] = [];
  const failPrimary = async (_message:string, model:string) => {
    calls.push(model);
    if (model==='gpt-oss') throw new ModelRequestError('model_upstream_http_error',429);
    return 'secondary succeeded';
  };
  const recovered = await routedCompletion('small','auto','gpt-oss',config,1024,failPrimary);
  assert.deepEqual(calls,['gpt-oss','long-context']);
  assert.equal(recovered.routing.attempts,2);
  calls.length=0;
  await assert.rejects(routedCompletion('small','default','gpt-oss',config,1024,failPrimary), /model_upstream_http_error/);
  assert.deepEqual(calls,['gpt-oss']);
  const rejectPermanent = async () => { throw new ModelRequestError('model_invalid_response'); };
  await assert.rejects(routedCompletion('small','auto','gpt-oss',config,1024,rejectPermanent), /model_invalid_response/);
});
test('auto accepts larger prompts with secondary, rejects oversized and non-auto prompts', async () => {
  const original=globalThis.fetch;
  const seen:string[]=[];
  globalThis.fetch=async (url,init) => {
    seen.push(String(url));
    const req=JSON.parse(String(init?.body));
    assert.equal(req.model,'long-context');
    return Response.json({choices:[{finish_reason:'stop',message:{content:'verified response'}}]});
  };
  try {
    const ok=await executeQuery({message:'x'.repeat(9000),mode:'auto'},config);
    assert.equal(ok.status,200);
    assert.equal(ok.data.model,'long-context');
    assert.equal(seen.length,1);
    const rejected=await executeQuery({message:'x'.repeat(9000),mode:'default'},config);
    assert.equal(rejected.status,400);
    assert.equal(seen.length,1);
  } finally {globalThis.fetch=original;}
});
