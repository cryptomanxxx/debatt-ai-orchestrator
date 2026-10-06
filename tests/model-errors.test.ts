import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeQuery } from '../src/query.ts';
import { loadConfig } from '../src/config.ts';

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
