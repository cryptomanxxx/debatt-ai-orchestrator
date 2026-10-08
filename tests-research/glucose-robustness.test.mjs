import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evaluateGlucose, forecast } from '../research/glucose.mjs';
import { makeGlucoseRobustnessCases, evaluateGlucoseRobustness, callGlucoseRobustness,
  validateGlucoseRobustness, runGlucoseRobustnessExperiment, glucoseRobustnessMarkdown } from '../research/glucose-robustness.mjs';

test('stress changes forecast inputs only; clean cell reproduces the original experiment exactly', () => {
  const fixtures = makeGlucoseRobustnessCases('20261008');
  assert.deepEqual(makeGlucoseRobustnessCases('20261008'), fixtures);
  assert.notEqual(makeGlucoseRobustnessCases('42')[0].commitment, fixtures[0].commitment);
  const truths = fixtures.map(({ input: { parameters: { rate, ...known } } }) => known);
  assert.deepEqual(truths[0], truths[1]); assert.deepEqual(truths[1], truths[2]);
  for (const f of fixtures) {
    const measured = evaluateGlucoseRobustness(f.input);
    const original = evaluateGlucose(f.input.parameters);
    const clean = measured.conditions.find(c => c.mealFactor === 1 && c.sensitivityFactor === 1);
    assert.equal(measured.conditions.length, 9);
    assert.equal(measured.stressConditions, 8);
    assert.deepEqual(measured.curve, original.curve);
    assert.deepEqual(measured.observations, original.observations);
    assert.deepEqual(clean.forecasts, original.forecasts);
    assert.deepEqual(clean.horizonMetrics, original.horizonMetrics);
    assert.deepEqual(clean.mseDifferenceFromClean.map(d => [d.fixed, d.adaptive]), [[0, 0], [0, 0]]);
    assert.equal(new Set(measured.conditions.map(c => `${c.mealFactor}/${c.sensitivityFactor}`)).size, 9);
    for (const c of measured.conditions) {
      assert.equal(c.reported.meal, f.input.parameters.meal * c.mealFactor);
      assert.equal(c.reported.sensitivity, f.input.parameters.sensitivity * c.sensitivityFactor);
      assert.equal(c.reported.dose, f.input.parameters.dose);
      assert.equal('rate' in c.reported, false);
      assert.ok(c.horizonMetrics.every(m => m.count === 43));
      // Re-score predictions directly against unchanged future truth.
      for (const m of c.horizonMetrics) for (const method of ['fixed', 'adaptive']) {
        const mse = c.forecasts.reduce((sum, r) => sum + (r.predictions[m.horizon][method]
          - measured.curve[(r.minute + m.horizon) / 5].glucose) ** 2, 0) / 43;
        assert.equal(m[method + 'Mse'], mse);
      }
    }
  }
});

test('wrong inputs preserve causal prediction prefixes', () => {
  const f = makeGlucoseRobustnessCases('42')[0];
  const m = evaluateGlucoseRobustness(f.input), known = m.conditions[0].reported;
  const prefix = forecast(m.observations.slice(0, 25), known);
  const changed = m.observations.map((r, i) => i >= 25 ? { ...r, glucose: r.glucose + 100 } : r);
  assert.deepEqual(forecast(changed, known).filter(r => r.minute <= 120), prefix);
});

test('clean advantage is not mistaken for robustness; mixed results are retained', () => {
  const results = makeGlucoseRobustnessCases('20261008').map(f => evaluateGlucoseRobustness(f.input));
  assert.deepEqual(results.map(m => m.improvedConditions), [5, 2, 5]);
  assert.deepEqual(results.map(m => m.robustness), ['preserved_some', 'no_clean_advantage', 'preserved_some']);
  assert.ok(results.every(m => m.decision === 'adaptive_improves_some'));
  assert.ok(results[0].conditions.some(c => c.mseDifferenceFromClean.some(d => d.adaptive > 0)));
});

test('numeric controls agree across seeds; modified inputs and forged per-cell evidence fail closed', async () => {
  for (const seed of ['1', '42', '20261008']) for (const f of makeGlucoseRobustnessCases(seed)) {
    const e = await callGlucoseRobustness(f.input);
    validateGlucoseRobustness(e, f.input);
    const forged = structuredClone(e);
    forged.result.conditions[0].horizonMetrics[0].adaptiveMse += 0.01;
    assert.throws(() => validateGlucoseRobustness(forged, f.input));
    assert.throws(() => validateGlucoseRobustness(e, { ...f.input, mode: 'clean' }));
  }
  const input = makeGlucoseRobustnessCases('1')[0].input;
  await assert.rejects(callGlucoseRobustness({ ...input, mode: 'arbitrary' }));
  await assert.rejects(callGlucoseRobustness({ ...input, factors: [100] }));
  await assert.rejects(callGlucoseRobustness({ ...input, parameters: { ...input.parameters, dose: 100 } }));
});

test('locked predictions precede evidence; measured outcomes and partial progress survive wrong proposals', async () => {
  let committed = false, calls = 0, proposals = 0, progress = 0;
  const report = await runGlucoseRobustnessExperiment('20261008', async () => {
    assert.ok(committed);
    proposals++;
    return { provider: 'test', model: 'same', text: JSON.stringify({ cleanDecision: 'mixed_or_no_improvement',
      stressDecision: 'adaptive_improves_none', reason: 'Intentionally incorrect.' }) };
  }, async input => { calls++; return callGlucoseRobustness(input); }, async commitments => {
    assert.equal(commitments.length, 3); committed = true;
  }, { onProgress: async cases => { progress++; assert.equal(cases.length, progress); } });
  assert.equal(calls, 6); assert.equal(proposals, 3); assert.equal(progress, 3);
  assert.equal(report.status, 'failed');
  assert.ok(report.cases.every(c => !c.passed && c.hypothesisTest.independentlyVerified));
  const markdown = glucoseRobustnessMarkdown(report.cases);
  assert.equal(markdown.split('\n').filter(r => /^\| [01]/.test(r)).length, 54);
  assert.match(markdown, /no_clean_advantage/);
  assert.equal(glucoseRobustnessMarkdown([]), '');
});

test('production runner dispatches robustness locally and saves full report and all stress rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oraklet-glucose-robustness-'));
  try {
    const preload = join(dir, 'mock.mjs');
    await writeFile(preload, `
import { writeFile } from 'node:fs/promises';
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('supabase.co')) {
    if (options.method === 'POST') { await writeFile('saved.json', options.body); return new Response('', {status: 201}); }
    return Response.json([]);
  }
  const body = JSON.parse(options.body);
  if (body.tool) throw new Error('Simulator must execute locally');
  return Response.json({mock: false, provider: 'test', model: 'same', inference: {completionTokenLimit: 4096},
    answer: JSON.stringify({cleanDecision:'mixed_or_no_improvement',stressDecision:'adaptive_improves_none',reason:'Test.'})});
};`);
    await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href,
      fileURLToPath(new URL('../research/runner.mjs', import.meta.url))], { cwd: dir,
      env: { ...process.env, EXPERIMENT: 'glucose-robustness', EXPERIMENT_SEED: '20261008',
        ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' }, timeout: 60000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.executionStatus, 'completed');
    assert.equal(saved.status, 'failed'); // Incorrect AI predictions are not execution errors.
    assert.equal(saved.toolId, 'glucose-robustness-simulator');
    assert.equal(saved.toolRuntime, 'github-actions-node');
    assert.equal(saved.modelCalls, 3); assert.equal(saved.toolCalls, 6);
    assert.equal(saved.cases.length, 3);
    const markdown = await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8');
    assert.match(markdown, /Alla stresstestkombinationer/);
    assert.equal(markdown.split('\n').filter(r => /^\| [01]\.[037] \|/.test(r)).length, 36);
    assert.ok(saved.cases.every(c => c.hypothesisTest.measured.conditions.length === 9));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
