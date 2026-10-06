import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { callSklearn, validateSklearn, makeSklearnCases, runSklearnExperiment } from '../research/sklearn.mjs';
import { fingerprint } from '../research/python-tools.mjs';
const run = promisify(execFile), seed = '123', fixtures = makeSklearnCases(seed);
const answer = f => ({ method: 'scikit-learn', degree: f.truth.selectedDegree, reason: 'Förslag före validering.' });

test('actual Scikit-learn executes paired controls, verifies every quantity and separates wrong model proposals', async () => {
  let committed = false, index = 0;
  const receipts = [];
  const report = await runSklearnExperiment(seed, async messages => {
    assert.ok(committed);
    const visible = JSON.parse(messages[1].content);
    assert.deepEqual(Object.keys(visible).sort(), ['protocol', 'train']);
    assert.deepEqual(visible.train, fixtures[index].input.train);
    assert.equal(visible.validation, undefined); assert.equal(visible.test, undefined);
    return { text: JSON.stringify(answer(fixtures[index++])), provider: 'test', model: 'same' };
  }, async input => { const e = await callSklearn(input); receipts.push(e); return e; }, commitments => {
    assert.equal(commitments.length, 3); assert.equal(commitments[0].sha256, fixtures[0].commitment); committed = true;
  });
  assert.equal(receipts.length, 6); assert.equal(report.status, 'passed');
  for (const c of report.cases) {
    assert.notEqual(c.evidence.result.selectedDegree, c.controlEvidence.result.selectedDegree);
    assert.ok(c.hypothesisTest.independentlyVerified);
  }
  for (const mutate of [e => { e.result.models[0].coefficients[0] += 1; },
    e => { e.result.models[1].testPredictions[0] += 1; }, e => { e.result.models[0].validationMse += 1; },
    e => { e.result.models[1].testMse += 1; }, e => { e.result.selectedDegree = 2; },
    e => { e.result.models[0].degree += 1e-10; }, e => { e.result.models[0].validationMse = -1e-10; },
    e => { e.result.selectedTestMse = NaN; }, e => { e.inputSha256 = 'bad'; },
    e => { e.versions['scikit-learn'] = 'bad'; }, e => { e.adapterVersion++; },
    e => { e.result.models[0].extra = 'bad'; }, e => { e.result.decision = 'prefer_quadratic'; }]) {
    const e = structuredClone(receipts[0]); mutate(e);
    assert.throws(() => validateSklearn(e, fixtures[0].input), /invalid_tool_evidence/);
  }
  assert.throws(() => validateSklearn(receipts[0], fixtures[1].input), /invalid_tool_evidence/);
  index = 0; let calls = 0;
  const wrong = await runSklearnExperiment(seed, async () => {
    const p = answer(fixtures[index++]); p.degree = 3 - p.degree;
    return { text: JSON.stringify(p), provider: 'test', model: 'same' };
  }, async () => receipts[calls++], () => {});
  assert.equal(wrong.status, 'failed'); assert.ok(wrong.cases.every(c => !c.passed));
  assert.deepEqual(wrong.cases.map(c => c.hypothesisTest), report.cases.map(c => c.hypothesisTest));
  index = 0; calls = 0; const partial = [];
  await assert.rejects(runSklearnExperiment(seed, async () => ({ text: JSON.stringify(answer(fixtures[index++])), provider: 'test', model: 'same' }),
    async () => { if (calls === 2) throw new Error('transport'); return receipts[calls++]; }, () => {},
    { onProgress: cases => partial.push(cases) }));
  assert.equal(partial.at(-1).length, 1);
  let toolCalls = 0;
  await assert.rejects(runSklearnExperiment(seed, async () => ({ text: '{}' }), async () => { toolCalls++; }, () => {}), /invalid_model_proposal/);
  assert.equal(toolCalls, 0);
  await assert.rejects(runSklearnExperiment(seed, () => assert.fail('model called before commitment'), callSklearn,
    () => { throw new Error('commit failed'); }));
});

test('actual estimator cannot fit validation/test labels, and test labels cannot choose the model', async () => {
  const input = fixtures[1].input, original = (await callSklearn(input)).result;
  const modified = structuredClone(input);
  modified.test.forEach(row => row[1] += 500);
  const alteredTest = (await callSklearn(modified)).result;
  assert.equal(alteredTest.selectedDegree, original.selectedDegree);
  assert.deepEqual(alteredTest.models.map(m => m.coefficients), original.models.map(m => m.coefficients));
  assert.deepEqual(alteredTest.models.map(m => m.validationMse), original.models.map(m => m.validationMse));
  assert.notEqual(alteredTest.selectedTestMse, original.selectedTestMse);
  modified.validation.forEach(row => row[1] += 300);
  const alteredBoth = (await callSklearn(modified)).result;
  assert.deepEqual(alteredBoth.models.map(m => m.coefficients), original.models.map(m => m.coefficients));
  assert.equal(fingerprint(input), fingerprint(fixtures[1].input));
});

test('Python independently refuses overlapping points, code, booleans, large payloads and invalid numbers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sklearn-boundary-'));
  try {
    const preload = join(dir, 'input.mjs');
    const overlapping = structuredClone(fixtures[0].input); overlapping.test[0][0] = overlapping.train[0][0];
    const boolean = structuredClone(fixtures[0].input); boolean.train[0][1] = true;
    const tooLarge = structuredClone(fixtures[0].input); tooLarge.train[0][0] = 17;
    for (const raw of [JSON.stringify(overlapping), JSON.stringify(boolean), JSON.stringify(tooLarge),
      JSON.stringify({ ...fixtures[0].input, code: 'exec' }), 'x'.repeat(8193),
      JSON.stringify(fixtures[0].input).replace('"train":[[', '"train":[[NaN,')]) {
      await writeFile(preload, `import {spawn} from 'node:child_process'; const p=spawn(process.env.RESEARCH_PYTHON||'python3',
        ['-I',${JSON.stringify(fileURLToPath(new URL('../scripts/sklearn_bridge.py', import.meta.url)))}]);
        p.stdin.end(${JSON.stringify(raw)}); p.stdout.pipe(process.stdout); p.on('exit',code=>process.exitCode=code);`);
      await assert.rejects(run(process.execPath, [preload], { timeout: 20000 }),
        e => e.code === 1 && JSON.parse(e.stdout).error === 'sklearn_tool_execution_failed');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('full runner saves real sklearn evidence, model failures and partial results with bounded budgets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sklearn-runner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    for (const mode of ['correct', 'wrong', 'aborted']) {
      const answers = fixtures.map(answer);
      if (mode === 'wrong') answers.forEach(p => { p.degree = 3 - p.degree; });
      await writeFile(preload, `import {writeFile} from 'node:fs/promises'; let index=0; const answers=${JSON.stringify(answers)};
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')) { if(options.method==='POST') {await writeFile('saved.json',options.body);return new Response('',{status:201});} return Response.json([]); }
 const body=JSON.parse(options.body); if(body.completionTokenLimit!==4096) throw new Error('budget');
 if(${JSON.stringify(mode)}==='aborted' && index===1) return new Response('{}',{status:503});
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answers[index++])});
};`);
      const command = () => run(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
        { cwd: dir, env: { ...process.env, EXPERIMENT: 'sklearn-polynomial', EXPERIMENT_SEED: seed,
          ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' }, timeout: 60000 });
      if (mode === 'aborted') await assert.rejects(command()); else await command();
      const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
      assert.equal(saved.toolId, 'scikit-learn');
      assert.equal(saved.executionStatus, mode === 'aborted' ? 'error' : 'completed');
      assert.equal(saved.status, mode === 'correct' ? 'passed' : 'failed');
      assert.equal(saved.modelCalls, mode === 'aborted' ? 2 : 3);
      assert.equal(saved.toolCalls, mode === 'aborted' ? 2 : 6);
      assert.equal(saved.cases.length, mode === 'aborted' ? 1 : 3);
      assert.ok(saved.cases.every(c => c.hypothesisTest.independentlyVerified));
      const markdown = await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8');
      assert.ok(markdown.includes('Validerings-MSE:')); assert.ok(markdown.includes('separat test-MSE='));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
