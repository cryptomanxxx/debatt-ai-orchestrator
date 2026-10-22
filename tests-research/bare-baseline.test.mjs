import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { BARE_PROTOCOL, BARE_ANALYSIS_PLAN, BARE_ARMS, MIN_PAIRS, runBareBaseline, mcnemarExact,
  bareBaselineSummary, bareSummaryMarkdown, bareRunMarkdown } from '../research/bare-baseline.mjs';
import { runHoldoutExperiment, callHoldout, classOf } from '../research/perturbseq-holdout.mjs';
import { CONFIDENCE_RULE } from '../research/calibration.mjs';

const data = JSON.parse(await readFile(new URL('../research/data/perturbseq-holdout.json', import.meta.url)));
const truthFor = genes => Object.fromEntries(genes.map(g => [g, classOf(data.holdout[g])]));
async function labReport(seed = '20261022') {
  const report = await runHoldoutExperiment(seed, async messages => ({ provider: 'test', model: 'same',
    text: JSON.stringify({ predictions: truthFor(JSON.parse(messages[1].content).heldOutGenes), reason: 'Facit.' }) }), callHoldout, async () => {});
  return { ...report, experimentId: 'perturbseq-holdout', executionStatus: 'completed', reportId: '00000000-0000-4000-8000-000000000001' };
}

test('the analysis plan is frozen: its hash is pinned and stored with every bare result', () => {
  assert.equal(BARE_PROTOCOL.analysisPlanSha256, 'f7cf9ca9f24386a2dddd01a01c162079b842cb53ec4d09976e73ec02fad08f80');
  assert.match(BARE_ANALYSIS_PLAN, /McNemar/);
  assert.equal(MIN_PAIRS, 30);
  assert.deepEqual(Object.keys(BARE_ARMS).sort(), ['dowhy-backdoor', 'perturbseq-holdout', 'sympy-quadratic']);
});

test('the bare arm sends only task, data and format, and scores with the lab verifier', async () => {
  const report = await labReport(), sent = [];
  const bare = await runBareBaseline(report, async messages => {
    sent.push(messages);
    const genes = JSON.parse(messages[1].content).genes;
    return { provider: 'test', model: 'same', text: '```json\n' + JSON.stringify({ predictions: Object.fromEntries(genes.map(g => [g, 'none'])), reason: 'Inget.' }) + '\n```' };
  });
  assert.equal(sent.length, 3);
  for (const [i, messages] of sent.entries()) {
    const text = JSON.stringify(messages);
    assert.ok(!/Oraklet|paraloger|stickprov|confidence/.test(text), 'no persona, method hints, protocol rationale or calibration rule');
    assert.ok(!text.includes(CONFIDENCE_RULE));
    assert.deepEqual(JSON.parse(messages[1].content).genes, report.cases[i].data.genes);
    assert.equal(JSON.parse(messages[1].content).training.perturbations, 1674, 'same training data as the lab');
  }
  assert.equal(bare.status, 'completed');
  assert.equal(bare.protocol.analysisPlanSha256, BARE_PROTOCOL.analysisPlanSha256);
  assert.deepEqual(bare.summary, { pairs: 3, labPassed: 3, barePassed: 0, labOnly: 3, bareOnly: 0, bareFormatFailures: 0 });
  assert.ok(bare.cases.every(c => c.labPassed && c.labInitialPassed && !c.barePassed && c.formatProblem === null));
  assert.match(bareRunMarkdown(bare), /labbet 3\/3, rak fråga 0\/3/);
});

test('unreadable bare answers count as failures and are reported as format problems; no correction is made', async () => {
  let calls = 0;
  const bare = await runBareBaseline(await labReport(), async () => { calls++; return { provider: 'test', model: 'same', text: 'Jag tror att...' }; });
  assert.equal(calls, 3);
  assert.ok(bare.cases.every(c => !c.barePassed && c.formatProblem === 'not_json' && c.proposal === null));
  assert.equal(bare.summary.bareFormatFailures, 3);
});

test('another model, an unsupported experiment, an incomplete lab run or forged evidence are never paired', async () => {
  const report = await labReport();
  assert.equal((await runBareBaseline(report, async () => ({ provider: 'test', model: 'other', text: '{}' }))).status, 'model_mismatch');
  assert.equal((await runBareBaseline({ ...report, experimentId: 'ratfit-baseline' }, () => assert.fail())).status, 'unsupported');
  assert.equal((await runBareBaseline({ ...report, executionStatus: 'error' }, () => assert.fail())).status, 'skipped');
  const forged = structuredClone(report);
  forged.cases[0].evidence.result.truth[forged.cases[0].data.genes[0]].class = 'strong';
  const result = await runBareBaseline(forged, () => assert.fail('no model call before verification'));
  assert.equal(result.status, 'error');
  assert.deepEqual(result.failure, { code: 'invalid_tool_evidence', case: 1 });
});

test('exact McNemar test on discordant pairs', () => {
  assert.equal(mcnemarExact(0, 0), 1);
  assert.equal(mcnemarExact(5, 5), 1);
  assert.equal(mcnemarExact(10, 0), 2 / 1024);
  assert.ok(Math.abs(mcnemarExact(3, 8) - 2 * 232 / 2048) < 1e-12);
  assert.equal(mcnemarExact(8, 3), mcnemarExact(3, 8));
});

test('pooling per experiment and model applies the minimum pair count and only the frozen plan', () => {
  const run = (lab, bare, extra = {}) => ({ plan: {}, baseline: { protocol: BARE_PROTOCOL, experimentId: 'sympy-quadratic', status: 'completed',
    provider: 'p', model: 'm', cases: lab.map((l, i) => ({ case: i + 1, labPassed: l, labInitialPassed: l, barePassed: bare[i] })), ...extra } });
  const few = bareBaselineSummary([run([true, true, true], [false, false, true])]);
  assert.equal(few[0].pairs, 3); assert.equal(few[0].verdict, 'too_few_pairs');
  const many = Array.from({ length: 10 }, () => run([true, true, true], [false, true, true]));
  const [g] = bareBaselineSummary([...many, run([true], [true], { status: 'model_mismatch' }),
    run([true], [true], { protocol: { analysisPlanSha256: 'other' } })]);
  assert.deepEqual([g.runs, g.pairs, g.labOnly, g.bareOnly, g.labRate, g.bareRate, g.verdict], [10, 30, 10, 0, 1, 0.6667, 'lab_better']);
  assert.equal(g.mcnemarP, Math.round(2 / 1024 * 1e4) / 1e4);
  assert.match(bareSummaryMarkdown([g]), /\| sympy-quadratic · p \/ m \| 30 \| 1 \| 1 \| 0.6667 \| 10 \/ 0 \|/);
  assert.match(bareSummaryMarkdown([]), /Inga parade körningar/);
});

test('after a lab run the bare step calls the same model and patches only the saved report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bare-runner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    await writeFile(preload, `
import {writeFile,appendFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(u.includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  if(options.method==='PATCH'){await writeFile('patched.json',JSON.stringify({url:u,body:JSON.parse(options.body)}));return Response.json([{id:'x'}]);}
  return Response.json([]);
 }
 const body=JSON.parse(options.body);
 const messages=JSON.parse(body.message).messages, content=JSON.parse(messages[1].content);
 await appendFile('modes.txt',body.mode+'\\n');
 const genes=content.heldOutGenes??content.genes;
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},
  answer:JSON.stringify({predictions:Object.fromEntries(genes.map(g=>[g,'none'])),reason:'Test.'})});
};`);
    const env = { ...process.env, EXPERIMENT: 'perturbseq-holdout', EXPERIMENT_SEED: '20261022', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test', BARE_SPACING_MS: '0', BARE_RETRY_DELAY_MS: '0' };
    const node = script => promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/' + script, import.meta.url))], { cwd: dir, env, timeout: 20000 });
    await node('runner.mjs');
    const { stdout } = await node('bare-baseline.mjs');
    assert.match(stdout, /Rak fråga: completed/);
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    const patched = JSON.parse(await readFile(join(dir, 'patched.json'), 'utf8'));
    assert.match(patched.url, new RegExp(`id=eq\\.${saved.reportId}&select=id$`));
    const { baseline, ...rest } = patched.body.rapport;
    assert.deepEqual(rest, saved, 'the lab fields are unchanged');
    assert.equal(baseline.status, 'completed'); assert.equal(baseline.summary.pairs, 3);
    assert.deepEqual((await readFile(join(dir, 'modes.txt'), 'utf8')).trim().split('\n'), Array(6).fill('default'));
    const file = JSON.parse(await readFile(join(dir, 'reports/oraklet-lab/baseline.json'), 'utf8'));
    assert.equal(file.modelCalls, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a transient provider error is retried once after a pause; a second failure stops with the case named', async () => {
  const { ResearchError } = await import('../research/errors.mjs');
  const report = await labReport(), pauses = [];
  let calls = 0;
  const answer = messages => ({ provider: 'test', model: 'same', text: JSON.stringify({ predictions: truthFor(JSON.parse(messages[1].content).genes), reason: 'Facit.' }) });
  const bare = await runBareBaseline(report, async messages => {
    if (++calls === 3) throw new ResearchError('model_upstream_http_error', { httpStatus: 429 });
    return answer(messages);
  }, { sleep: async ms => { pauses.push(ms); }, spacingMs: 15, retryDelayMs: 45 });
  assert.equal(bare.status, 'completed'); assert.equal(bare.retries, 1); assert.equal(calls, 4);
  assert.deepEqual(pauses, [15, 15, 15, 45], 'spacing before each case, then one pause before the retry of case 3');
  assert.ok(bare.cases.every(c => c.barePassed));
  calls = 0;
  const failed = await runBareBaseline(report, async messages => {
    if (++calls >= 2) throw new ResearchError('model_upstream_http_error', { httpStatus: 429 });
    return answer(messages);
  }, { sleep: async () => {} });
  assert.equal(failed.status, 'error'); assert.equal(failed.retries, 1); assert.equal(failed.cases.length, 1);
  assert.deepEqual(failed.failure, { code: 'model_upstream_http_error', httpStatus: 429, case: 2 });
  calls = 0;
  const final = await runBareBaseline(report, async () => { calls++; throw new ResearchError('model_budget_exceeded'); }, { sleep: async () => {} });
  assert.deepEqual([final.status, final.retries, calls], ['error', 0, 1], 'no retry for a non-transient error');
});
