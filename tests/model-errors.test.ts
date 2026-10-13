import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeQuery } from '../src/query.ts';
import { loadConfig } from '../src/config.ts';
import { modelRetry } from '../src/providers/openai.ts';

Object.assign(modelRetry, { baseDelayMs: 1, maxDelayMs: 5, minAttemptMs: 0 });

test('model failures expose bounded cause without raw responses, secrets or truncated answers', async () => {
  const config = loadConfig({ ORCHESTRATOR_API_KEY: 'test'.repeat(8), MODEL_PROVIDER: 'openai',
    MODEL_API_KEY: 'SECRET', MODEL_BASE_URL: 'https://api.groq.com/openai/v1', MODEL_DEFAULT: 'test' });
  const original = globalThis.fetch;
  try {
    for (const status of [429, 503]) {
      globalThis.fetch = async () => new Response('SECRET upstream body', { status });
      assert.deepEqual(await executeQuery({ message: 'Test' }, config), {
        status: 502, data: { error: 'model_upstream_http_error', upstreamStatus: status },
      });
    }
    for (const [body, code] of [
      [{ choices: [{ finish_reason: 'length', message: { content: '{"partial":"SECRET' } }] }, 'model_output_truncated'],
      [{ choices: [{ finish_reason: 'stop', message: { content: '' } }] }, 'model_empty_response'],
    ] as const) {
      globalThis.fetch = async () => Response.json(body);
      assert.deepEqual(await executeQuery({ message: 'Test' }, config), { status: 502, data: { error: code } });
    }
    globalThis.fetch = async () => new Response('SECRET non-json body');
    assert.deepEqual(await executeQuery({ message: 'Test' }, config), { status: 502, data: { error: 'model_invalid_response' } });
    globalThis.fetch = async () => { throw new Error('SECRET transport error'); };
    assert.deepEqual(await executeQuery({ message: 'Test' }, config), { status: 502, data: { error: 'model_transport_error' } });
  } finally { globalThis.fetch = original; }
});

test('transient upstream statuses are retried a bounded number of times', async () => {
  const config = loadConfig({ ORCHESTRATOR_API_KEY: 'test'.repeat(8), MODEL_PROVIDER: 'openai',
    MODEL_API_KEY: 'SECRET', MODEL_BASE_URL: 'https://api.groq.com/openai/v1', MODEL_DEFAULT: 'test' });
  const original = globalThis.fetch;
  let calls = 0;
  try {
    const statuses = [503, 429];
    globalThis.fetch = async () => {
      calls++;
      const status = statuses.shift();
      return status ? new Response('busy', { status, headers: { 'Retry-After': '0' } })
        : Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Svar' } }] });
    };
    const result = await executeQuery({ message: 'Test' }, config);
    assert.equal(result.status, 200);
    assert.equal(calls, 3);

    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('busy', { status: 429 }); };
    assert.deepEqual(await executeQuery({ message: 'Test' }, config),
      { status: 502, data: { error: 'model_upstream_http_error', upstreamStatus: 429 } });
    assert.equal(calls, modelRetry.attempts);

    for (const status of [400, 401, 500]) {
      calls = 0;
      globalThis.fetch = async () => { calls++; return new Response('no', { status }); };
      assert.equal((await executeQuery({ message: 'Test' }, config)).status, 502);
      assert.equal(calls, 1, `status ${status} must not be retried`);
    }

    calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('timeout'); };
    assert.deepEqual(await executeQuery({ message: 'Test' }, config), { status: 502, data: { error: 'model_transport_error' } });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('retries stop when the remaining deadline cannot fit another attempt', async () => {
  const config = loadConfig({ ORCHESTRATOR_API_KEY: 'test'.repeat(8), MODEL_PROVIDER: 'openai',
    MODEL_API_KEY: 'SECRET', MODEL_BASE_URL: 'https://api.groq.com/openai/v1', MODEL_DEFAULT: 'test' });
  const original = globalThis.fetch;
  const saved = { ...modelRetry };
  let calls = 0;
  try {
    Object.assign(modelRetry, { deadlineMs: 1000, minAttemptMs: 2000 });
    globalThis.fetch = async () => { calls++; return new Response('busy', { status: 503 }); };
    assert.deepEqual(await executeQuery({ message: 'Test' }, config),
      { status: 502, data: { error: 'model_upstream_http_error', upstreamStatus: 503 } });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; Object.assign(modelRetry, saved); }
});
