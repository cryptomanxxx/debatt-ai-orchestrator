import test from 'node:test';
import assert from 'node:assert/strict';
import { researchInference } from '../src/research-inference.ts';

const hip = { HIP_API_KEY: 'test-hip-key-not-real' };
const request = { provider: 'hip', model: 'GLM-5.2-AWQ-INT4', prompt: 'Solve x^2 = 4' };
test('only fixed provider, model, and prompt are accepted without network calls', async () => {
  const never = async () => { throw new Error('network request forbidden'); };
  for (const body of [
    { ...request, provider: 'unknown' }, { ...request, provider: 'toString' }, { ...request, model: 'evil' },
    { ...request, endpoint: 'https://attacker.example' },
    { ...request, prompt: ' ' }, { ...request, prompt: 'x'.repeat(4001) }
  ]) assert.equal((await researchInference(body,hip,never as typeof fetch)).status,400);
});
test('missing provider secret fails closed', async () => {
  assert.equal((await researchInference(request,{})).status,503);
});
test('fixed HTTPS upstream receives the selected secret and 512-token ceiling', async () => {
  let calls=0;
  const fake = async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(url,'https://llm-service.ai.tu-darmstadt.de/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer test-hip-key-not-real');
    assert.equal(init?.redirect,'manual');
    const data=JSON.parse(String(init?.body));
    assert.equal(data.max_tokens,512);
    assert.equal(data.model,request.model);
    return Response.json({ model:request.model,choices:[{message:{content:'-2, 2'},finish_reason:'stop'}] });
  };
  const result = await researchInference(request,hip,fake as typeof fetch);
  assert.equal(result.status,200);
  assert.equal(result.data.scientificallyVerified,false);
  assert.equal(calls,1);
});
test('rejects invalid model identity, truncated or oversized responses', async () => {
  const fake=(body:unknown)=>async()=>Response.json(body);
  for (const body of [
    {model:'other',choices:[{message:{content:'ok'},finish_reason:'stop'}]},
    {model:request.model,choices:[{message:{content:'ok'},finish_reason:'length'}]},
    {model:request.model,choices:[{message:{content:'x'.repeat(70000)},finish_reason:'stop'}]}
  ]) assert.equal((await researchInference(request,hip,fake(body) as typeof fetch)).status,502);
});

test('never reflects an upstream response containing the provider secret', async () => {
  const reflect = async () => Response.json({
    model: request.model,
    choices: [{ message: { content: 'Credential: test-hip-key-not-real' }, finish_reason: 'stop' }]
  });
  const result=await researchInference(request,hip,reflect as typeof fetch);
  assert.equal(result.status,502);
  assert.ok(!JSON.stringify(result.data).includes(hip.HIP_API_KEY));
});
