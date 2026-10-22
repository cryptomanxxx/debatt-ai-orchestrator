import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { HOLDOUT_DATA_SHA256, HOLDOUT_PROTOCOL, CLASSES, classOf, makeHoldoutCases, trainingContext,
  evaluateHoldout, callHoldout, validateHoldout, parseHoldoutProposal, holdoutMessages,
  runHoldoutExperiment, holdoutMarkdown } from '../research/perturbseq-holdout.mjs';
import { parseCounts, SOURCE } from '../research/import-perturbseq-holdout.mjs';
import { CONFIDENCE_RULE, MAX_CALIBRATED_CHARS, calibrated } from '../research/calibration.mjs';

const raw = await readFile(new URL('../research/data/perturbseq-holdout.json', import.meta.url));
const data = JSON.parse(raw);

test('snapshot is the pinned published split: 1,674 training and 272 held-out targets, disjoint', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), HOLDOUT_DATA_SHA256);
  assert.deepEqual(data.source, SOURCE);
  assert.equal(Object.keys(data.training).length, 1674);
  assert.equal(Object.keys(data.holdout).length, 272);
  assert.ok(Object.keys(data.holdout).every(g => !Object.hasOwn(data.training, g)));
  const counts = c => Object.fromEntries(CLASSES.map(k => [k, Object.values(c).filter(n => classOf(n) === k).length]));
  assert.deepEqual(counts(data.holdout), { none: 172, weak: 72, strong: 28 });
  assert.deepEqual(counts(data.training), { none: 1205, weak: 410, strong: 59 });
  assert.deepEqual([0, 1, 49, 50].map(classOf), ['none', 'weak', 'weak', 'strong']);
});

test('importer accepts only the expected two-column count format', () => {
  assert.deepEqual(parseCounts('target_name,n_degs\nAbat,0\nPsmc1,430\n'), { Abat: 0, Psmc1: 430 });
  for (const bad of ['gene,n\nAbat,0', 'target_name,n_degs\nAbat,-1', 'target_name,n_degs\nAbat,1,2', 'target_name,n_degs\nAbat,1\nAbat,2'])
    assert.throws(() => parseCounts(bad));
});

test('seeds draw three disjoint stratified batches; commitments change with the seed', () => {
  const first = makeHoldoutCases('20261022');
  assert.deepEqual(first.map(f => f.input.genes), makeHoldoutCases('20261022').map(f => f.input.genes));
  assert.equal(new Set(first.flatMap(f => f.input.genes)).size, 36);
  for (const f of first) {
    const classes = f.input.genes.map(g => classOf(data.holdout[g]));
    assert.deepEqual(CLASSES.map(c => classes.filter(x => x === c).length), [6, 4, 2]);
  }
  const other = makeHoldoutCases('42');
  assert.notDeepEqual(other.map(f => f.input.genes), first.map(f => f.input.genes));
  assert.ok(first.every((f, i) => f.commitment !== other[i].commitment));
  for (const seed of ['invalid', '', '1234567890', 42]) assert.throws(() => makeHoldoutCases(seed));
});

test('the prompt shows only training counts, never held-out counts, and leaves room for calibration', () => {
  const seed = '20261022', context = trainingContext(seed);
  assert.equal(context.perturbations, 1674);
  assert.equal(context.strongest[0][0], 'Uba5');
  assert.equal(context.strongest.length, 30);
  assert.equal(context.sample.length, 30);
  assert.ok([...context.strongest, ...context.sample].every(([g, n]) => data.training[g] === n));
  assert.notDeepEqual(trainingContext('42').sample, context.sample);
  for (const f of makeHoldoutCases(seed)) {
    const messages = holdoutMessages(seed, f.input.genes), user = JSON.parse(messages[1].content);
    assert.deepEqual(user.heldOutGenes, f.input.genes);
    const shown = JSON.stringify(user.training);
    assert.ok(f.input.genes.every(g => !shown.includes(`"${g}"`)));
    assert.ok(JSON.stringify([...messages, { role: 'system', content: CONFIDENCE_RULE }]).length <= MAX_CALIBRATED_CHARS);
  }
});

test('baselines: always-none scores exactly one half; the symbol family uses a four-character prefix', () => {
  for (const f of makeHoldoutCases('7')) {
    const m = evaluateHoldout(f.input);
    assert.equal(m.baselines.majority.accuracy, 0.5);
    assert.ok(Object.values(m.baselines.family.predictions).every(p => CLASSES.includes(p)));
    for (const [g, p] of Object.entries(m.baselines.family.prefixes))
      if (p.length < 4) assert.equal(m.baselines.family.predictions[g], 'none');
  }
  const m = evaluateHoldout(makeHoldoutCases('20261022')[2].input);
  assert.deepEqual(m.truth.Psmc5, { nDegs: 624, class: 'strong' });
  assert.deepEqual(m.baselines.family.prefixes.Psmc5, { length: 4, matches: 1, medianNDegs: 430 });
  assert.equal(m.baselines.family.predictions.Psmc5, 'strong');
});

test('verifier recomputes truth and baselines on a separate path and rejects forged evidence', async () => {
  const input = makeHoldoutCases('20261022')[0].input, e = await callHoldout(input);
  validateHoldout(e, input);
  const gene = input.genes[0];
  for (const change of [v => { v.dataSha256 = 'wrong'; }, v => { v.result.truth[gene].class = 'strong'; },
    v => { v.result.truth[gene].nDegs += 1; }, v => { v.result.baselines.family.accuracy = 1; },
    v => { v.result.baselines.majority.predictions[gene] = 'weak'; }]) {
    const forged = structuredClone(e); change(forged);
    assert.throws(() => validateHoldout(forged, input));
  }
  assert.throws(() => validateHoldout(e, { genes: [...input.genes].reverse() }));
  await assert.rejects(callHoldout({ genes: ['Uba5', ...input.genes.slice(1)] }), 'training genes are not held out');
  await assert.rejects(callHoldout({ genes: input.genes.slice(1) }));
  await assert.rejects(callHoldout({ genes: input.genes, extra: true }));
});

test('proposal parser requires exactly the batch genes and the three classes', () => {
  const genes = ['A1', 'B2'];
  assert.deepEqual(parseHoldoutProposal(JSON.stringify({ predictions: { B2: 'weak', A1: 'none' }, reason: ' Skäl. ' }), genes),
    { predictions: { A1: 'none', B2: 'weak' }, reason: 'Skäl.' });
  for (const bad of [{ predictions: { A1: 'none' }, reason: 'x' }, { predictions: { A1: 'none', B2: 'huge' }, reason: 'x' },
    { predictions: { A1: 'none', B2: 'weak', C3: 'none' }, reason: 'x' }, { predictions: { A1: 'none', B2: 'weak' }, reason: '' },
    { predictions: { A1: 'none', B2: 'weak' }, reason: 'x', extra: 1 }, { predictions: ['none', 'weak'], reason: 'x' }])
    assert.equal(parseHoldoutProposal(JSON.stringify(bad), genes), null);
  assert.equal(parseHoldoutProposal('not json', genes), null);
});

test('commitment precedes predictions; a perfect answer passes, always-none and an invalid answer do not', async () => {
  const truthOf = messages => Object.fromEntries(JSON.parse(messages[1].content).heldOutGenes.map(g => [g, classOf(data.holdout[g])]));
  let committed = false, tools = 0, progress = [];
  const commit = async items => { assert.equal(items.length, 3); assert.ok(items.every(i => i.protocol.id === HOLDOUT_PROTOCOL.id)); committed = true; };
  const tool = async input => { tools++; return callHoldout(input); };
  const perfect = await runHoldoutExperiment('20261022', async messages => {
    assert.ok(committed);
    return { provider: 'test', model: 'same', text: JSON.stringify({ predictions: truthOf(messages), reason: 'Facit.' }) };
  }, tool, commit, { onProgress: async c => { progress = c; } });
  assert.equal(tools, 3); assert.equal(progress.length, 3);
  assert.equal(perfect.status, 'passed');
  assert.deepEqual(perfect.summary, { genes: 36, orakletAccuracy: 1, majorityAccuracy: 0.5,
    familyAccuracy: perfect.summary.familyAccuracy });
  assert.ok(perfect.cases.every(c => c.hypothesisTest.decision === 'beats_baselines' && c.initialPassed));
  const markdown = holdoutMarkdown(perfect.cases);
  assert.match(markdown, /Totalt 36 gener: Oraklet 100%, alltid none 50%/);
  assert.match(markdown, /\| Psmc5 \| strong \| strong \| strong \(624\) \|/);

  const allNone = await runHoldoutExperiment('20261022', async messages => ({ provider: 'test', model: 'same',
    text: JSON.stringify({ predictions: Object.fromEntries(Object.keys(truthOf(messages)).map(g => [g, 'none'])), reason: 'Inget.' }) }),
    tool, async () => {});
  assert.equal(allNone.status, 'failed');
  assert.ok(allNone.cases.every(c => c.hypothesisTest.measured.oraklet.accuracy === 0.5 && !c.passed), 'equalling the majority baseline is not enough');

  await assert.rejects(runHoldoutExperiment('20261022', async () => ({ provider: 'test', model: 'same', text: '{}' }), tool, async () => {}),
    { message: 'invalid_model_proposal' });
});

test('changed snapshot bytes fail the integrity guard before any experiment runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'perturbseq-integrity-'));
  try {
    await mkdir(join(dir, 'data'));
    for (const path of ['perturbseq-holdout.mjs', 'errors.mjs'])
      await writeFile(join(dir, path), await readFile(new URL('../research/' + path, import.meta.url)));
    await writeFile(join(dir, 'data', 'perturbseq-holdout.json'), raw.toString('utf8').replace('"Uba5": 2677', '"Uba5": 2678'));
    await assert.rejects(promisify(execFile)(process.execPath, [join(dir, 'perturbseq-holdout.mjs')]));
    await writeFile(join(dir, 'data', 'perturbseq-holdout.json'), raw);
    await promisify(execFile)(process.execPath, [join(dir, 'perturbseq-holdout.mjs')]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the lab runner executes the experiment end to end with calibration and a rendered report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'perturbseq-runner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    await writeFile(preload, `
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 const body=JSON.parse(options.body);if(body.tool)throw new Error('Expected local tool');
 const genes=JSON.parse(JSON.parse(body.message).messages[1].content).heldOutGenes;
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},
  answer:JSON.stringify({predictions:Object.fromEntries(genes.map(g=>[g,'strong'])),reason:'Test.',confidence:0.25})});
};`);
    await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env: { ...process.env, EXPERIMENT: 'perturbseq-holdout', EXPERIMENT_SEED: '20261022',
        ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' }, timeout: 20000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.executionStatus, 'completed'); assert.equal(saved.status, 'failed');
    assert.equal(saved.modelCalls, 3); assert.equal(saved.toolCalls, 3); assert.equal(saved.toolRuntime, 'github-actions-node');
    assert.ok(saved.cases.every(c => c.data.dataSha256 === HOLDOUT_DATA_SHA256 && c.hypothesisTest.measured.oraklet.correct === 2));
    assert.deepEqual(saved.summary, { genes: 36, orakletAccuracy: 1 / 6, majorityAccuracy: 0.5, familyAccuracy: saved.summary.familyAccuracy });
    assert.equal(saved.calibration.scoredCases, 3); assert.equal(saved.calibration.meanConfidence, 0.25);
    const markdown = await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8');
    assert.match(markdown, /Slår inte båda baslinjerna \| Oraklet 2\/12 \(17%\); alltid none 50%/);
    assert.match(markdown, /## Undanhållna genutslagningar/);
    assert.match(markdown, /\| Psmc5 \| strong \| strong \| strong \(624\) \|/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('common answer shapes are normalised; anything else gets a fixed problem code', async () => {
  const { checkHoldoutProposal } = await import('../research/perturbseq-holdout.mjs');
  const genes = ['Psmc5', 'Ank3'], want = { predictions: { Psmc5: 'strong', Ank3: 'weak' }, reason: 'Skäl.' };
  for (const text of [
    '```json\n{"predictions":{"Psmc5":"Strong","Ank3":" WEAK "},"reason":"Skäl."}\n```',
    '{"predictions":[{"gene":"Ank3","class":"weak"},{"gene":"psmc5","prediction":"strong"}],"reason":"Skäl."}',
    '{"predictions":{"Psmc5":{"class":"strong","confidence":0.7},"Ank3":{"class":"weak"}},"reason":"Skäl."}'])
    assert.deepEqual(checkHoldoutProposal(text, genes), { proposal: want });
  const problem = value => checkHoldoutProposal(JSON.stringify(value), genes).problem;
  assert.equal(checkHoldoutProposal('Jag tror att...', genes).problem, 'not_json');
  assert.equal(problem(['x']), 'not_object');
  assert.equal(problem({ ...want, note: 1 }), 'extra_fields');
  assert.equal(problem({ reason: 'x' }), 'missing_predictions');
  assert.equal(problem({ predictions: { Psmc5: 'strong', Ank3: 'weak', Snap25: 'none' }, reason: 'x' }), 'unknown_gene');
  assert.equal(problem({ predictions: [{ gene: 'Ank3', class: 'weak' }, { gene: 'ANK3', class: 'none' }], reason: 'x' }), 'duplicate_gene');
  assert.equal(problem({ predictions: { Psmc5: 'huge', Ank3: 'weak' }, reason: 'x' }), 'invalid_class');
  assert.equal(problem({ predictions: { Psmc5: 'strong' }, reason: 'x' }), 'missing_gene');
  assert.equal(problem({ predictions: want.predictions, reason: 'x'.repeat(801) }), 'invalid_reason');
});

test('an unreadable answer gets one format correction, recorded on the case; a second failure names the case', async () => {
  const answer = messages => Object.fromEntries(JSON.parse(messages[1].content).heldOutGenes.map(g => [g, classOf(data.holdout[g])]));
  const sent = [];
  const report = await runHoldoutExperiment('20261022', async messages => {
    sent.push(messages);
    return { provider: 'test', model: 'same', text: messages.length === 2 ? 'Här är min bedömning.'
      : JSON.stringify({ predictions: answer(messages), reason: 'Facit.' }) };
  }, callHoldout, async () => {});
  assert.equal(sent.length, 6);
  assert.match(sent[1].at(-1).content, /^Ditt svar kunde inte tolkas: svaret var inte giltig JSON\. Svara igen endast med JSON/);
  assert.ok(!sent[1].at(-1).content.includes('Här är min bedömning'), 'the model text is never echoed');
  assert.ok(report.cases.every(c => c.formatCorrection.problem === 'not_json' && c.correctionAttempted && !c.initialPassed && c.passed));
  assert.equal(report.status, 'passed');
  await assert.rejects(runHoldoutExperiment('20261022', async () => ({ provider: 'test', model: 'same', text: '{}' }), callHoldout, async () => {}),
    e => e.message === 'invalid_model_proposal' && e.diagnostic.case === 1 && e.diagnostic.operation === 'correction');
  let calls = 0;
  await assert.rejects(runHoldoutExperiment('20261022', async () => ({ provider: 'test', model: ++calls === 1 ? 'a' : 'b', text: '{}' }), callHoldout, async () => {}),
    { message: 'model_changed' });
});

test('a fenced answer that follows the calibration rule passes without a format correction', async () => {
  const log = { calls: [], marks: [] };
  let calls = 0;
  const report = await runHoldoutExperiment('20261022', calibrated(async messages => {
    calls++;
    const predictions = Object.fromEntries(JSON.parse(messages[1].content).heldOutGenes.map(g => [g, classOf(data.holdout[g])]));
    return { provider: 'test', model: 'same', text: '```json\n' + JSON.stringify({ predictions, reason: 'Facit.', confidence: 0.6 }) + '\n```' };
  }, log), callHoldout, async () => {});
  assert.equal(calls, 3);
  assert.deepEqual(log.calls, [0.6, 0.6, 0.6]);
  assert.ok(report.cases.every(c => c.initialPassed && !c.correctionAttempted && !c.formatCorrection));
});
