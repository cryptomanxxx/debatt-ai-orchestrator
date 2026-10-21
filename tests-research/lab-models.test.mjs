import test from 'node:test';
import assert from 'node:assert/strict';
import { researchChoices, loadResearchChoices, chosenResearchModel, unwrapJsonAnswer, MIN_DOMAIN_ATTEMPTS } from '../research/lab-models.mjs';
import { choosePlan, parsePlan, plannerPrompt } from '../research/catalog.mjs';
import { DOMAIN_SUITE } from '../research/model-scores.mjs';

const tally = (correct, attempts, latency = 2) => ({ correct, attempts, latencies: [latency] });
const runs = {
  '1': { provider: 'hip', suite: DOMAIN_SUITE, models: {
    'GLM-5.2-AWQ-INT4': { correct: 0, attempts: 0, latencies: [], domains: { causal: tally(8, 8, 9), symbolic: tally(5, 8) } },
    'Qwen3.8-27B': { correct: 0, attempts: 0, latencies: [], domains: { causal: tally(8, 8, 3), symbolic: tally(8, 8) } },
    'Kimi-K2.6': { correct: 0, attempts: 0, latencies: [], domains: { causal: tally(6, 8) } } } },
  '2': { provider: 'blablador', suite: DOMAIN_SUITE, models: {
    'alias-fast@openai/gpt-oss-120b': { correct: 0, attempts: 0, latencies: [], domains: { causal: tally(7, 8, 1), discrete: tally(4, 4) } } } },
  '3': { provider: 'hip', models: { 'Kimi-K2.6': { correct: 99, attempts: 99, latencies: [1] } } } };
const catalog = { hip: ['GLM-5.2-AWQ-INT4', 'Qwen3.8-27B', 'Kimi-K2.6'], blablador: ['alias-fast'] };
const aliasRoots = { blablador: { 'alias-fast': 'openai/gpt-oss-120b' } };

test('candidates per domain need enough domain evidence and are ranked across providers', () => {
  const choices = researchChoices(runs, catalog, aliasRoots);
  assert.deepEqual(choices.causal.map(c => c.choice), ['hip / Qwen3.8-27B', 'hip / GLM-5.2-AWQ-INT4', 'blablador / alias-fast']);
  assert.deepEqual(choices.symbolic.map(c => c.choice), ['hip / Qwen3.8-27B'], '5/8 is below the minimum rate');
  assert.equal(choices.discrete, undefined, `fewer than ${MIN_DOMAIN_ATTEMPTS} attempts`);
  assert.equal(choices.statistics, undefined, 'classic runs never count as domain evidence');
  assert.deepEqual(chosenResearchModel('hip / Qwen3.8-27B', 'causal', choices)?.model, 'Qwen3.8-27B');
  assert.equal(chosenResearchModel('hip / Qwen3.8-27B', 'discrete', choices), null);
  assert.equal(chosenResearchModel('default', 'causal', choices), null);
});

test('missing or broken score files mean no ranked candidates', async () => {
  assert.deepEqual(await loadResearchChoices(async () => { throw new Error('ENOENT'); }), {});
  assert.deepEqual(await loadResearchChoices(async () => '{not json'), {});
  const files = { 'research/model-scores.json': JSON.stringify({ runs }), 'research/model-catalog.json': JSON.stringify({ providers: catalog, aliasRoots }) };
  assert.equal((await loadResearchChoices(async path => files[path])).causal.length, 3);
});

test('the planner may pick a ranked model only for the chosen experiment domain', async () => {
  const choices = researchChoices(runs, catalog, aliasRoots);
  const plan = { experimentId: 'dowhy-backdoor', seed: '7', reason: 'Bäst på kausala uppgifter.', modelMode: 'hip / Qwen3.8-27B' };
  assert.deepEqual(parsePlan(JSON.stringify(plan), ['default'], choices), plan);
  for (const bad of [{ modelMode: 'hip / Kimi-K2.6' }, { experimentId: 'sympy-quadratic', modelMode: 'blablador / alias-fast' },
    { modelMode: 'reasoning' }, { modelMode: undefined }])
    assert.throws(() => parsePlan(JSON.stringify({ ...plan, ...bad }), ['default'], choices));
  assert.equal(parsePlan(JSON.stringify({ ...plan, modelMode: 'default' }), ['default'], choices).modelMode, 'default');
  const prompt = plannerPrompt([], '7', ['default'], choices);
  const user = JSON.parse(prompt[1].content);
  assert.deepEqual(user.researchModels.causal[0], { modelMode: 'hip / Qwen3.8-27B', correct: 8, attempts: 8 });
  assert.equal(user.catalog.find(e => e.id === 'dowhy-backdoor').domain, 'causal');
  assert.match(prompt[0].content, /researchModels/);
  const chosen = await choosePlan('auto', '7', [], async () => ({ text: JSON.stringify(plan) }), ['default'], choices);
  assert.equal(chosen.modelMode, 'hip / Qwen3.8-27B');
  // Without ranked models the original prompt and three-key plan are unchanged.
  assert.equal(plannerPrompt([], '7')[1].content.includes('researchModels'), false);
  assert.throws(() => parsePlan(JSON.stringify(plan)));
});

test('only Markdown fences and leading think blocks are removed from ranked-model answers', () => {
  assert.equal(unwrapJsonAnswer('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(unwrapJsonAnswer('<think>hmm</think>\n{"a":1}'), '{"a":1}');
  assert.equal(unwrapJsonAnswer('Here: {"a":1}'), 'Here: {"a":1}');
  assert.equal(unwrapJsonAnswer(' {"a":1} '), '{"a":1}');
});
