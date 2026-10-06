import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePlan, parsePlan, lockModel, plannerPrompt } from '../research/catalog.mjs';
import { runExperiment, makeCases, UPSTREAM } from '../research/ratfit.mjs';

test('planner can select only validated runnable experiments, bounded seed and reason', async () => {
  const plan = { experimentId: 'ratfit-feedback', seed: '123', reason: 'Pröva återkoppling på nya data.' };
  assert.deepEqual(parsePlan(JSON.stringify(plan)), plan);
  for (const change of [{ experimentId: 'shell' }, { seed: 'abc' }, { reason: '' }, { code: 'run' }])
    assert.throws(() => parsePlan(JSON.stringify({ ...plan, ...change })));
  let calls = 0;
  const propose = async () => { calls++; return { text: JSON.stringify(plan) }; };
  assert.deepEqual(await choosePlan('auto', '123', [], propose), plan);
  await assert.rejects(choosePlan('auto', '123', [{ experimentId: plan.experimentId, seed: plan.seed }], propose));
  await choosePlan('ratfit-baseline', '123', [], propose);
  assert.equal(calls, 2); // Manual selection never calls a planner.
  assert.equal(JSON.parse(plannerPrompt(Array(20).fill({ status: 'failed' }), '123')[1].content).history.length, 10);
});

test('provider/model is locked across planner, proposals and corrections', async () => {
  let model = 'one';
  const propose = lockModel(async () => ({ text: '{}', provider: 'groq', model }));
  await propose([]); await propose([]);
  model = 'two';
  await assert.rejects(propose([]), /ändrades/);
});

test('baseline locks first proposal and never sends correction feedback', async () => {
  const fixtures = makeCases('123'); let calls = 0, tools = 0;
  const report = await runExperiment('123', async messages => {
    assert.equal(messages.length, 2);
    const f = fixtures[calls++];
    return { text: JSON.stringify({ method: 'bootloops_ratfit', coefficients: f.id === 2 ? ['1','1','1','1'] : f.truth, reason: 'Första förslag.' }), provider: 'groq', model: 'same' };
  }, async () => {
    const accepted = tools++ % 2 === 0;
    return { status: accepted ? 200 : 422, data: { provider: 'bootloops', mock: false,
      toolResult: { tool: 'bootloops_ratfit', upstreamCommit: UPSTREAM, accepted, depth: 3, checked: 3, failed: accepted ? 0 : 1 },
      verification: { status: accepted ? 'passed' : 'failed', scope: 'exact_rational_holdout', factualityChecked: false } } };
  }, () => {}, { feedback: false });
  assert.equal(calls, 3); assert.equal(tools, 6);
  assert.equal(report.cases[1].passed, false);
  assert.ok(report.cases.every(c => !c.correctionAttempted && c.attempts.length === 1));
});
