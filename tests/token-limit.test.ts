import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { complete, tokenLimitParameter } from '../src/providers/openai.ts';
import { orchestrate } from '../src/orchestrator.ts';
const env = { ORCHESTRATOR_API_KEY: 'local-test-key-at-least-24-characters',
  MODEL_PROVIDER: 'openai', MODEL_BASE_URL: 'https://provider.example/v1',
  MODEL_API_KEY: 'secret', MODEL_DEFAULT: 'small', MODEL_REASONING: 'o3-mini' };
test('automatic token parameter respects model IDs and official endpoint', () => {
  const config = loadConfig(env);
  for (const model of ['o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini-2025-04-16', 'openai/o3'])
    assert.equal(tokenLimitParameter(model, config), 'max_completion_tokens');
  assert.equal(tokenLimitParameter('glm-model', config), 'max_tokens');
  assert.equal(tokenLimitParameter('ocean-model', config), 'max_tokens');
  assert.equal(tokenLimitParameter('small', loadConfig({ ...env, MODEL_BASE_URL: 'https://api.openai.com/v1' })), 'max_completion_tokens');
});
test('explicit provider override works for aliases and legacy providers', () => {
  assert.equal(tokenLimitParameter('custom-reasoner', loadConfig({ ...env, MODEL_TOKEN_LIMIT_FIELD: 'max_completion_tokens' })), 'max_completion_tokens');
  assert.equal(tokenLimitParameter('o3', loadConfig({ ...env, MODEL_TOKEN_LIMIT_FIELD: 'max_tokens' })), 'max_tokens');
  assert.throws(() => loadConfig({ ...env, MODEL_TOKEN_LIMIT_FIELD: 'unsupported' }), /Invalid MODEL_TOKEN_LIMIT_FIELD/);
});
test('reasoning pipeline sends exactly one modern token field; legacy remains capped', async () => {
  const original = globalThis.fetch;
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    requests.push(request);
    if (request.model === 'o3-mini' && 'max_tokens' in request)
      return Response.json({ error: 'unsupported field' }, { status: 400 });
    return Response.json({ choices: [{ message: { content: 'Svar' } }] });
  };
  try {
    const config = loadConfig(env);
    assert.equal((await orchestrate('Hej', 'reasoning', config)).answer, 'Svar');
    assert.equal(requests[0].max_completion_tokens, 1024);
    assert.equal('max_tokens' in requests[0], false);
    await complete('Hej', 'small', config);
    assert.equal(requests[1].max_tokens, 1024);
    assert.equal('max_completion_tokens' in requests[1], false);
    await complete('Hej', 'custom-reasoner', loadConfig({ ...env, MODEL_TOKEN_LIMIT_FIELD: 'max_completion_tokens' }));
    assert.equal(requests[2].max_completion_tokens, 1024);
    assert.equal('max_tokens' in requests[2], false);
    assert.equal(requests.length, 3);
  } finally { globalThis.fetch = original; }
});
