import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.ts';
import { loadConfig } from '../src/config.ts';
const key = 'local-test-key-at-least-24-characters';
test('configuration fails closed', () => {
  assert.throws(() => loadConfig({}), /ORCHESTRATOR_API_KEY/);
  assert.throws(() => loadConfig({ ORCHESTRATOR_API_KEY: key, MODEL_PROVIDER: 'unknown' }), /Invalid MODEL_PROVIDER/);
});
test('HTTP endpoints and validation', async () => {
  const app = createApp(loadConfig({ ORCHESTRATOR_API_KEY: key }));
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.address().port}`;
  const query = (body: string, auth = key) => fetch(url + '/v1/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, body
  });
  try {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.equal((await query('{"message":"Hej"}', 'wrong')).status, 401);
    assert.equal((await query('{')).status, 400);
    assert.equal((await query('{"message":"  "}')).status, 400);
    assert.equal((await query('{"message":"Hej","mode":"unknown"}')).status, 400);
    assert.equal((await query(JSON.stringify({ message: 'x'.repeat(40000) }))).status, 413);
    const response = await query('{"message":"Hej","mode":"reasoning"}');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.mock, true);
    assert.equal(data.mode, 'reasoning');
    assert.match(data.answer, /Testläge/);
    assert.ok(data.id);
    assert.equal(data.verification.status, 'not_verified');
    const arithmetic = await query(JSON.stringify({ message: 'räkna: (2+3)*4', mode: 'auto' }));
    assert.equal(arithmetic.status, 200);
    const result = await arithmetic.json();
    assert.equal(result.answer, '20');
    assert.equal(result.verification.scope, 'arithmetic_consistency');
    assert.equal((await query(JSON.stringify({ message: 'calc: 1/0', mode: 'auto' }))).status, 400);
    assert.equal((await query(JSON.stringify({ message: 'calc: process.exit()', mode: 'auto' }))).status, 400);
  } finally { await new Promise<void>((resolve, reject) => app.close(err => err ? reject(err) : resolve())); }
});
test('real provider sends selected model and handles upstream failures', async () => {
  const { orchestrate } = await import('../src/orchestrator.ts');
  const original = globalThis.fetch;
  const config = loadConfig({ ORCHESTRATOR_API_KEY: key, MODEL_PROVIDER: 'openai',
    MODEL_BASE_URL: 'https://provider.example/v1', MODEL_API_KEY: 'secret',
    MODEL_DEFAULT: 'small', MODEL_REASONING: 'large' });
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://provider.example/v1/chat/completions');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'large');
      assert.equal(body.messages[0].content, 'Hej');
      return Response.json({ choices: [{ message: { content: 'Svar' } }] });
    };
    assert.equal((await orchestrate('Hej', 'reasoning', config)).answer, 'Svar');
    globalThis.fetch = async () => new Response('private provider error', { status: 500 });
    await assert.rejects(orchestrate('Hej', 'default', config), /Model provider request failed/);
  } finally { globalThis.fetch = original; }
});
