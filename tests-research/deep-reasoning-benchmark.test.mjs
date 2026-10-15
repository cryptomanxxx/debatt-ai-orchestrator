import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedBenchmark, runDeepReasoningBenchmark, orchestratorProposer, readBoundedJson, runDeepReasoningCli } from '../research/deep-reasoning-benchmark.mjs';
import { quadraticOracle } from '../research/sympy.mjs';

const solver = async ({ mode, message }) => {
  const req = JSON.parse(message);
  assert.deepEqual(Object.keys(req).sort(), ['coefficients','instruction','previous_attempts','strategy_path','system']);
  assert.equal(JSON.stringify(req).includes('"truth"'), false);
  const roots = quadraticOracle({ coefficients: req.coefficients, candidates: [] }).roots;
  return { mock: false, model: 'fixture-' + mode, provider: 'fixture-provider',
    answer: JSON.stringify({ method: 'sympy', roots, reason: 'Exact arithmetic fixture' }) };
};
test('offline plan is deterministic and enforces budgets', () => {
  const a = plannedBenchmark({ seed: '20261016' });
  assert.deepEqual(a, plannedBenchmark({ seed: '20261016' }));
  assert.equal(a.cases.length, 3);
  assert.throws(() => plannedBenchmark({ maxCalls: 11 }), /insufficient_model_call_budget/);
  assert.throws(() => plannedBenchmark({ modes: ['default', 'bogus'] }), /invalid_benchmark_modes/);
  assert.throws(() => plannedBenchmark({ seed: 'abc' }), /invalid_plan/);
});
test('identical sealed cases are compared for default and reasoning', async () => {
  const r = await runDeepReasoningBenchmark({ seed: '20261016',
    modes: ['default', 'reasoning'], maxTreeNodes: 3, maxCalls: 24, propose: solver });
  assert.equal(r.status, 'completed');
  assert.deepEqual(r.results.filter(x => x.mode === 'default').map(x => x.commitment),
    r.results.filter(x => x.mode === 'reasoning').map(x => x.commitment));
  assert.equal(r.summary.default.directVerified, 3);
  assert.equal(r.summary.reasoning.treeVerified, 3);
  assert.equal(r.actualModelCalls, 12);
  assert.equal(r.modelIdentities.default, 'fixture-provider/fixture-default');
});
test('invalid AI proposals cannot pass the scientific verifier', async () => {
  const r = await runDeepReasoningBenchmark({ modes: ['default'], maxTreeNodes: 1, maxCalls: 6,
    propose: async () => ({ mock: false, model: 'm', provider: 'p', answer: '{"oops":1}' }) });
  assert.equal(r.summary.default.directVerified, 0);
  assert.equal(r.summary.default.treeVerified, 0);
  assert.equal(r.actualModelCalls, 6);
});
test('mock and changing model identity are rejected', async () => {
  await assert.rejects(runDeepReasoningBenchmark({ modes: ['default'], maxTreeNodes: 1, maxCalls: 6,
    propose: async () => ({ mock: true, model: 'm', provider: 'p', answer: '{}' }) }), /invalid_real_model_response/);
  let i = 0;
  await assert.rejects(runDeepReasoningBenchmark({ modes: ['default'], maxTreeNodes: 1, maxCalls: 6,
    propose: async () => ({ mock: false, model: 'model-' + ++i, provider: 'p', answer: '{}' }) }), /model_identity_changed/);
});
test('orchestrator adapter authenticates and limits completion budget', async () => {
  let called = 0;
  const proposer = orchestratorProposer({
    apiUrl: 'https://example.org/v1/query', apiKey: 'a'.repeat(24),
    fetchImpl: async (url, init) => {
      called++;
      assert.equal(url, 'https://example.org/v1/query');
      assert.equal(init.headers.Authorization, 'Bearer ' + 'a'.repeat(24));
      assert.equal(JSON.parse(init.body).completionTokenLimit, 4096);
      return new Response(JSON.stringify({ mock: false, model: 'm', provider: 'p', answer: '{}', inference: { completionTokenLimit: 4096 } }), { status: 200 });
    },
  });
  assert.deepEqual(await proposer({ mode: 'default', message: '{}' }),
    { mock: false, answer: '{}', model: 'm', provider: 'p' });
  assert.equal(called, 1);
  assert.throws(() => orchestratorProposer({
    apiUrl: 'http://example.org/v1/query', apiKey: 'a'.repeat(24),
  }), /invalid_orchestrator_url/);
});

test('adapter rejects responses when upstream did not apply the token budget', async () => {
  const proposer = orchestratorProposer({
    apiUrl: 'https://example.org/v1/query', apiKey: 'a'.repeat(24),
    fetchImpl: async () => new Response(JSON.stringify({ mock: false, model: 'm',
      provider: 'p', answer: '{}', inference: { completionTokenLimit: 2048 } }), { status: 200 }),
  });
  await assert.rejects(proposer({ mode: 'default', message: '{}' }), /model_budget_not_applied/);
});
test('streamed API responses are cancelled before exceeding the byte cap', async () => {
  let cancelled = false;
  let reads = 0;
  const stream = new ReadableStream({
    pull(controller) {
      reads++;
      if (reads > 2) throw new Error('body should have been cancelled before full read');
      controller.enqueue(new Uint8Array(70000));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedJson({ body: stream }), /oversized_orchestrator_response/);
  assert.equal(cancelled, true);
  assert.equal(reads, 1);
});
test('missing live key replaces previous offline status with failed preflight report', async () => {
  const writes = [];
  const environment = { BENCHMARK_MODE: 'default', BENCHMARK_MAX_CALLS: '12' };
  await assert.rejects(runDeepReasoningCli(environment, [], {
    mkdirImpl: async () => {},
    writeFileImpl: async (_path, text) => { writes.push(JSON.parse(text)); },
  }), /missing_orchestrator_key/);
  assert.equal(writes[0].status, 'live-preflight');
  assert.equal(writes.at(-1).status, 'failed');
  assert.equal(writes.at(-1).failureStage, 'preflight');
  assert.equal(writes.at(-1).failureCode, 'missing_orchestrator_key');
});
test('unavailable reasoning profile is recorded as preflight failure', async () => {
  const writes = [];
  const environment = { BENCHMARK_MODE: 'reasoning', BENCHMARK_MAX_CALLS: '12',
    ORCHESTRATOR_API_KEY: 'a'.repeat(24) };
  await assert.rejects(runDeepReasoningCli(environment, [], {
    mkdirImpl: async () => {},
    writeFileImpl: async (_path, text) => { writes.push(JSON.parse(text)); },
    fetchImpl: async () => new Response('service not available', { status: 503 }),
  }), /reasoning_model_profile_unavailable/);
  assert.equal(writes.at(-1).status, 'failed');
  assert.equal(writes.at(-1).failureCode, 'reasoning_model_profile_unavailable');
});
