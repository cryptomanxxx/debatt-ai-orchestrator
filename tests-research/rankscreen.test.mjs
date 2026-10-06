import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { callRankscreen, makeRankCases, exactRank, exactVerdict, parseRankProposal, validateRankEvidence, runRankExperiment } from '../research/rankscreen.mjs';
const run = promisify(execFile);

test('independent exact minors distinguish rank deficit and inconsistent augmentation', () => {
  assert.equal(exactRank([['0','0'],['0','0']]), 0);
  assert.equal(exactRank([['1','2'],['2','4']]), 1);
  assert.deepEqual(exactVerdict({ rows: [['1','2','3'],['2','4','7']] }), { rank: 1, consistent: false });
  assert.deepEqual(exactVerdict({ rows: [['1','2','3'],['2','4','6']] }), { rank: 1, consistent: true });
  assert.equal(exactRank([['0','1','0'],['1','0','0'],['0','0','1']]), 3);
});

test('strict rank proposal refuses code, extras, malformed values and missing rationale', () => {
  const p = { method: 'bootloops_rankscreen', rank: 2, consistent: true, reason: 'Rang två.' };
  assert.deepEqual(parseRankProposal(JSON.stringify(p)), p);
  for (const change of [{ rank: '2' }, { rank: 4 }, { consistent: 1 }, { method: 'shell' }, { code: 'eval' }, { reason: '' }])
    assert.equal(parseRankProposal(JSON.stringify({ ...p, ...change })), null);
});

test('both experiments run real pinned upstream tools and paired controls; evidence fails closed', async () => {
  for (const experimentId of ['rankscreen-consistency', 'rankscreen-rank-deficit']) {
    const fixtures = makeRankCases('123', experimentId); let calls = 0, committed = false;
    assert.deepEqual(makeRankCases('123', experimentId), fixtures);
    for (const [i, f] of fixtures.entries()) {
      assert.equal(f.truth.rank, experimentId === 'rankscreen-consistency' ? 3 : 1 + i % 2);
      assert.equal(f.truth.consistent, i % 2 === 0);
    }
    assert.notEqual(makeRankCases('124', experimentId)[0].commitment, fixtures[0].commitment);
    const report = await runRankExperiment('123', async messages => {
      assert.equal(committed, true);
      assert.equal(messages.length, 2);
      const input = JSON.parse(messages[1].content);
      assert.deepEqual(input, fixtures[calls].input);
      const truth = fixtures[calls++].truth;
      return { text: JSON.stringify({ method: 'bootloops_rankscreen', ...truth, reason: 'Exakt klassificering.' }), provider: 'test', model: 'same' };
    }, callRankscreen, () => { committed = true; }, { experimentId });
    assert.equal(report.status, 'passed');
    assert.equal(report.cases.length, 3);
    const c = report.cases[0];
    for (const mutate of [e => { e.receipt.rank = 0; }, e => { e.upstreamCommit = 'wrong'; },
      e => { e.inputSha256 = 'wrong'; }, e => { e.sourceSha256 = {}; },
      e => { e.receipt.verdict = 'ESCALATE-TO-EXACT'; }, e => { e.receipt.per_prime[0].rank = 0; }]) {
      const evidence = structuredClone(c.rankscreen); mutate(evidence);
      assert.throws(() => validateRankEvidence(evidence, c.data, c.truth), /invalid_tool_evidence/);
    }
    assert.notEqual(c.truth.consistent, c.controlTruth.consistent);
    assert.equal(c.truth.rank, c.controlTruth.rank);
    let progress = [];
    await assert.rejects(runRankExperiment('123', async () => {
      if (progress.length) return { text: '{}' };
      return { text: JSON.stringify({ method: 'bootloops_rankscreen', ...fixtures[0].truth, reason: 'Svar.' }), provider: 'test', model: 'same' };
    }, callRankscreen, () => {}, { experimentId, onProgress: cases => { progress = cases; } }), error => error.diagnostic.case === 2 && error.message === 'invalid_model_proposal');
    assert.equal(progress.length, 1);
  }
});

test('wrong model classification is a scientific failure with completed execution', async () => {
  const report = await runRankExperiment('123', async () => ({ provider: 'test', model: 'same',
    text: JSON.stringify({ method: 'bootloops_rankscreen', rank: 0, consistent: false, reason: 'Fel gissning.' }) }),
  callRankscreen, () => {}, { experimentId: 'rankscreen-consistency' });
  assert.equal(report.status, 'failed');
  assert.equal(report.cases.length, 3);
});

test('runner dispatches real Rankscreen, preserves budgets and saves complete or partial reports', async () => {
  for (const failing of [false, true]) {
  const dir = await mkdtemp(join(tmpdir(), 'oraklet-rank-runner-'));
  try {
    const core = new URL('../research/rankscreen.mjs', import.meta.url).href;
    const preload = join(dir, 'mock.mjs');
    await writeFile(preload, `
import { writeFile } from 'node:fs/promises';
import { exactVerdict } from ${JSON.stringify(core)};
let calls = 0;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('supabase.co')) {
    if (options.method === 'POST') { await writeFile('saved.json', options.body); return new Response('', {status: 201}); }
    return Response.json([]);
  }
  const body = JSON.parse(options.body);
  if (body.tool) throw new Error('Rankscreen must execute locally');
  const messages = JSON.parse(body.message).messages;
  const input = JSON.parse(messages[1].content);
  return Response.json({ mock: false, provider: 'test', model: 'same', inference: {completionTokenLimit: 4096},
    answer: ${failing} && calls++ > 0 ? '{}' : JSON.stringify({ method: 'bootloops_rankscreen', ...exactVerdict(input), reason: 'Svar.' }) });
};`);
    const execution = run(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env: { ...process.env, EXPERIMENT: 'rankscreen-rank-deficit', EXPERIMENT_SEED: '123', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' }, timeout: 15000 });
    if (failing) await assert.rejects(execution); else await execution;
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8'));
    assert.equal(saved.rapport.status, failing ? 'failed' : 'passed');
    assert.equal(saved.rapport.executionStatus, failing ? 'error' : 'completed');
    if (!failing) {
      assert.equal(saved.rapport.toolId, 'rankscreen');
      assert.equal(saved.rapport.toolRuntime, 'github-actions-python');
    } else {
      assert.equal(saved.rapport.failure.code, 'invalid_model_proposal');
      assert.equal(saved.rapport.failure.case, 2);
      assert.equal(saved.rapport.failure.operation, 'initial_proposal');
    }
    assert.equal(saved.rapport.toolCalls, failing ? 2 : 6);
    assert.equal(saved.rapport.modelCalls, failing ? 2 : 3);
    assert.equal(saved.rapport.cases.length, failing ? 1 : 3);
  } finally { await rm(dir, {recursive: true, force: true}); }
  }
});

test('catalog-only runs without credentials, Python invocation, model or database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oraklet-menu-'));
  try {
    const preload = join(dir, 'no-fetch.mjs');
    await writeFile(preload, "globalThis.fetch = () => { throw new Error('No external call allowed'); };\n");
    await run(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env: { ...process.env, EXPERIMENT: 'catalog-only', ORCHESTRATOR_API_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' }, timeout: 5000 });
    const catalog = JSON.parse(await readFile(join(dir, 'reports/oraklet-lab/catalog.json'), 'utf8'));
    assert.equal(catalog.experiments.length, 9);
    assert.equal(catalog.tools.filter(t => t.integration === 'pending').length, 45);
    await assert.rejects(readFile(join(dir, 'saved.json')), { code: 'ENOENT' });
  } finally { await rm(dir, {recursive: true, force: true}); }
});
