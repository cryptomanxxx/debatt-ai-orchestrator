import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const key = 'workers-test-key-at-least-24-characters';
const createRuntime = (options = {}) => new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: '.worker-build/worker.js',
  compatibilityDate: '2026-10-05',
  compatibilityFlags: ['nodejs_compat'],
  bindings: { ORCHESTRATOR_API_KEY: key, MODEL_PROVIDER: 'mock' },
  ...options
}));
const request = (runtime: Miniflare, body: string, auth = key, contentType = 'application/json') =>
  runtime.dispatchFetch('https://worker.test/v1/query', {
    method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': contentType }, body
  });

test('Workers runtime serves health, authenticated mock and calculator queries', async () => {
  const runtime = createRuntime();
  try {
    assert.equal((await runtime.dispatchFetch('https://worker.test/health')).status, 200);
    const response = await request(runtime, JSON.stringify({ message: 'Hej', mode: 'reasoning' }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const mock = await response.json();
    assert.equal(mock.mock, true);
    assert.equal(mock.verification.status, 'not_verified');
    assert.ok(mock.id);
    const arithmetic = await request(runtime, JSON.stringify({ message: 'räkna: (2+3)*4', mode: 'auto' }));
    const result = await arithmetic.json();
    assert.equal(arithmetic.status, 200);
    assert.equal(result.answer, '20');
    assert.equal(result.provider, 'local');
    assert.equal(result.verification.scope, 'arithmetic_consistency');
    const bootloops = await request(runtime, JSON.stringify({ tool: 'bootloops_ratfit', input: {
      banked: [['0', '1/2'], ['1', '2/3'], ['2', '3/4'], ['3', '4/5']],
      holdout: [['4', '5/6'], ['5', '6/7']]
    } }));
    assert.equal(bootloops.status, 503);
    assert.deepEqual(await bootloops.json(), { error: 'bootloops_runtime_unavailable' });
    assert.equal((await request(runtime, '{"message":"calc: 1/0","mode":"auto"}')).status, 400);
  } finally { await runtime.dispose(); }
});

test('Workers runtime rejects unauthorized, malformed and oversized requests', async () => {
  const runtime = createRuntime();
  try {
    assert.equal((await request(runtime, '{"message":"Hej"}', 'wrong')).status, 401);
    assert.equal((await request(runtime, '{}', key, 'text/plain')).status, 415);
    assert.equal((await request(runtime, '{')).status, 400);
    for (const body of ['null', '[]', '{"message":" "}', '{"message":"Hej","mode":null}', '{"message":"Hej","mode":"unknown"}'])
      assert.equal((await request(runtime, body)).status, 400);
    assert.equal((await request(runtime, JSON.stringify({ message: 'x'.repeat(8001) }))).status, 400);
    // UTF-8 bytes, not JavaScript character count, determine the body limit.
    assert.equal((await request(runtime, JSON.stringify({ message: 'x', extra: 'ö'.repeat(20000) }))).status, 413);
    const boundary = JSON.stringify({ message: 'Hej' });
    assert.equal((await request(runtime, boundary + ' '.repeat(32768 - Buffer.byteLength(boundary)))).status, 200);
    assert.equal((await request(runtime, boundary + ' '.repeat(32769 - Buffer.byteLength(boundary)))).status, 413);
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(' '.repeat(16000)));
      controller.enqueue(new TextEncoder().encode(' '.repeat(18000)));
      controller.close();
    } });
    assert.equal((await runtime.dispatchFetch('https://worker.test/v1/query', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: stream, duplex: 'half'
    })).status, 413);
    assert.equal((await runtime.dispatchFetch('https://worker.test/v1/query?unexpected=1', { method: 'POST' })).status, 404);
  } finally { await runtime.dispose(); }
});

test('Workers configuration fails closed without disclosing bindings', async () => {
  const runtime = createRuntime({ bindings: {} });
  try {
    const response = await runtime.dispatchFetch('https://worker.test/health');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_not_configured' });
  } finally { await runtime.dispose(); }
});

test('Workers runtime routes real inference and hides provider failures', async () => {
  const calls: Record<string, unknown>[] = [];
  let fail = false;
  const runtime = createRuntime({
    bindings: { ORCHESTRATOR_API_KEY: key, MODEL_PROVIDER: 'openai',
      MODEL_BASE_URL: 'https://api.openai.com/v1', MODEL_API_KEY: 'private-model-key',
      MODEL_DEFAULT: 'default-test-model', MODEL_REASONING: 'o3-mini' },
    outboundService: async (upstream: Request) => {
      assert.equal(upstream.url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(upstream.headers.get('Authorization'), 'Bearer private-model-key');
      calls.push(await upstream.json());
      return fail ? new Response('private-upstream-error', { status: 500 })
        : Response.json({ choices: [{ message: { content: 'Svar' } }] });
    }
  });
  try {
    const response = await request(runtime, '{"message":"Hej","mode":"reasoning"}');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).answer, 'Svar');
    assert.equal(calls[0].model, 'o3-mini');
    assert.equal(calls[0].max_completion_tokens, 1024);
    assert.equal('max_tokens' in calls[0], false);
    await request(runtime, '{"message":"calc: 2+2","mode":"auto"}');
    assert.equal(calls.length, 1);
    fail = true;
    const failure = await request(runtime, '{"message":"Hej"}');
    assert.equal(failure.status, 502);
    assert.deepEqual(await failure.json(), { error: 'model_request_failed' });
    assert.equal(calls[1].model, 'default-test-model');
  } finally { await runtime.dispose(); }
});
