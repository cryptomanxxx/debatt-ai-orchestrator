import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ACT_MAP_PROTOCOL, makeActMapCases, publicTask, intervene, gateDecision, callActMap, validateActMap,
  checkDesign, checkInference, designMessages, inferenceMessages, runActMapExperiment, actMapMarkdown, digest, pythonEnv } from '../research/act-map.mjs';
import { vemClaims, vemState, vemLine, vemRegisterSummary, vemRegisterMarkdown, main as vemMain, VEM_SCHEMA } from '../research/vem-sci.mjs';
import { CATALOG } from '../research/catalog.mjs';
import { MAX_CALIBRATED_CHARS } from '../research/calibration.mjs';

const named = (f, list, names) => Object.fromEntries(list.map((t, i) => [names[i], f.view.target_variables[t]]));
const truthfulAnswer = f => f.truth.scope === 'none'
  ? { decision: 'none', mapping: null, interventions: null, reason: 'Stöds inte.' }
  : { decision: f.truth.scope, mapping: named(f, f.truth.mapping, ['s_0', 's_1', 's_2']),
    interventions: named(f, f.truth.action_to_target, f.view.target_interventions), reason: 'Utfallen följer mekanismen.' };
// A scripted proposer: designs every intervention at value 1, then answers with `answer(fixture)`.
function scripted(seed, answer, { design } = {}) {
  const fixtures = makeActMapCases(seed), calls = [];
  const propose = async messages => {
    const content = JSON.parse(messages[1].content), task = content.task ?? content;
    const f = fixtures.find(x => x.view.level === task.level);
    calls.push({ level: task.level, kind: content.results ? 'inference' : 'design', messages });
    const text = content.results ? JSON.stringify(answer(f, content.results))
      : design ? design(f) : JSON.stringify({ experiments: task.targetInterventions.map(i => ({ intervention: i, value: 1 })), reason: 'Alla roller.' });
    return { provider: 'test', model: 'same', text };
  };
  return { fixtures, calls, propose };
}

test('fixtures are seeded, committed before any call and never show the hidden correspondence', () => {
  const cases = makeActMapCases('20261022');
  assert.deepEqual(cases.map(f => f.view.level), [2, 3, 4]);
  assert.deepEqual(makeActMapCases('20261022'), cases, 'deterministic');
  for (const f of cases) {
    assert.equal(f.commitment, digest({ view: f.view, truth: f.truth }));
    const shown = JSON.stringify(publicTask(f));
    assert.ok(!/mapping|scope|coefficients|truth/.test(shown));
    assert.equal(Boolean(publicTask(f).interventionSets), f.view.level === 2, 'intervention targets are given only at level 2');
  }
  const scopes = new Set(Array.from({ length: 40 }, (_, i) => makeActMapCases(String(i))[2].truth.scope));
  assert.deepEqual([...scopes].sort(), ['none', 'partial']);
  assert.ok(JSON.stringify(inferenceMessages(cases[2], [])).length < MAX_CALIBRATED_CHARS - 500, 'room for results and the confidence rule');
});

test('a correct proposer passes every case; the Python gate certifies transfer and the baseline runs on the same fixture', async () => {
  const { propose, calls } = scripted('20261022', truthfulAnswer);
  const commits = [], progress = [];
  const report = await runActMapExperiment('20261022', propose, callActMap, async c => commits.push(c), { onProgress: async c => progress.push(c.length) });
  assert.equal(commits.length, 1); assert.equal(commits[0].length, 3);
  assert.deepEqual(progress, [1, 2, 3]);
  assert.deepEqual(calls.map(c => c.kind), ['design', 'inference', 'design', 'inference', 'design', 'inference']);
  assert.equal(report.status, 'passed');
  for (const c of report.cases) {
    const m = c.hypothesisTest.measured;
    assert.equal(c.passed, true);
    assert.equal(m.falseCertification, false);
    assert.equal(m.baselinePassed, true);
    assert.equal(c.vem.status, m.truth.scope === 'none' ? 'unresolved' : 'provisionally_supported');
    assert.equal(c.vem.kind, m.truth.scope === 'none' ? 'abstention' : 'transfer');
    assert.deepEqual(c.vem.transitions, ['proposed', 'under_test', c.vem.status]);
  }
  assert.match(actMapMarkdown(report.cases), /Oraklet 3\/3 rätt, uppräkningsbaslinjen 3\/3/);
});

test('a wrong correspondence is rejected by the gate, fails the case and is stored as rejected', async () => {
  const swap = f => {
    const answer = truthfulAnswer(f.truth.scope === 'none' ? { ...f, truth: { ...f.truth, scope: 'partial' } } : f);
    [answer.mapping.s_0, answer.mapping.s_1] = [answer.mapping.s_1, answer.mapping.s_0];
    return answer;
  };
  const report = await runActMapExperiment('7', scripted('7', swap).propose, callActMap, async () => {});
  assert.equal(report.status, 'failed');
  assert.ok(report.cases.every(c => !c.passed && c.hypothesisTest.measured.gate.status === 'rejected' && c.vem.status === 'rejected'));
  assert.ok(report.cases.every(c => !c.hypothesisTest.measured.falseCertification));
});

test('a design that misses the mediator cannot certify a correct mapping; abstaining on a real transfer fails', async () => {
  const onlyOne = f => JSON.stringify({ experiments: [{ intervention: f.view.target_interventions[0], value: 2 }], reason: 'Ett ingrepp.' });
  const report = await runActMapExperiment('11', scripted('11', truthfulAnswer, { design: onlyOne }).propose, callActMap, async () => {});
  const full = report.cases.filter(c => c.hypothesisTest.measured.truth.scope !== 'none');
  assert.ok(full.every(c => !c.passed && c.hypothesisTest.measured.gate.reason === 'insufficient_evidence'));
  assert.ok(report.cases.every(c => c.experiments.length === 1));
  const abstain = await runActMapExperiment('11', scripted('11', () => ({ decision: 'none', mapping: null, interventions: null, reason: 'Osäker.' })).propose, callActMap, async () => {});
  assert.deepEqual(abstain.cases.map(c => c.passed), abstain.cases.map(c => c.hypothesisTest.measured.truth.scope === 'none'));
});

test('unreadable answers fail the case with a fixed code, make no claim and never reach the gate as a claim', async () => {
  const { propose, calls } = scripted('3', truthfulAnswer, { design: () => 'Jag tror att...' });
  const report = await runActMapExperiment('3', propose, callActMap, async () => {});
  assert.equal(calls.length, 3, 'no inference call after an unreadable design');
  assert.ok(report.cases.every(c => c.formatProblem === 'design:not_json' && !c.passed && c.vem === null));
  assert.ok(report.cases.every(c => c.hypothesisTest.measured.gate.status === 'unresolved'));
  const bad = await runActMapExperiment('3', scripted('3', () => ({ decision: 'maybe', reason: 'x' })).propose, callActMap, async () => {});
  assert.ok(bad.cases.every(c => c.formatProblem === 'inference:invalid_decision' && c.vem === null));
});

test('answer parsing tolerates fences and think blocks and rejects malformed shapes', () => {
  const [l2, l3, l4] = makeActMapCases('5');
  const acts = l3.view.target_interventions;
  assert.deepEqual(checkDesign('<think>x</think>\n```json\n' + JSON.stringify({ experiments: [{ intervention: acts[0], value: '-1' }], reason: 'r' }) + '\n```', l3).design.experiments, [{ action: 0, value: -1 }]);
  assert.equal(checkDesign(JSON.stringify({ experiments: [{ intervention: acts[0], value: 3 }], reason: 'r' }), l3).problem, 'invalid_experiments', 'held-out values are not allowed');
  assert.equal(checkDesign(JSON.stringify({ experiments: [{ intervention: acts[0], value: 1 }, { intervention: acts[0], value: 1 }], reason: 'r' }), l3).problem, 'duplicate_experiment');
  assert.equal(checkDesign(JSON.stringify({ experiments: Array(4).fill({ intervention: acts[0], value: 1 }), reason: 'r' }), l3).problem, 'invalid_experiments');
  assert.equal(checkInference(JSON.stringify({ ...truthfulAnswer(l3), decision: 'partial' }), l3).problem, 'invalid_decision', 'partial only at level 4');
  const omitted = checkInference(JSON.stringify({ ...truthfulAnswer(l2), interventions: undefined }), l2);
  assert.deepEqual(omitted.claim.proposed.action_to_target, [0, 1, 2], 'level 2 interventions are given');
  assert.equal(checkInference(JSON.stringify({ ...truthfulAnswer(l3), interventions: undefined }), l3).problem, 'invalid_interventions');
  const twice = truthfulAnswer(l4.truth.scope === 'none' ? { ...l4, truth: { ...l4.truth, scope: 'partial' } } : l4);
  twice.mapping.s_2 = twice.mapping.s_0;
  assert.equal(checkInference(JSON.stringify(twice), l4).problem, 'invalid_mapping');
  assert.equal(checkInference(JSON.stringify({ ...truthfulAnswer(l3), extra: 1 }), l3).problem, 'extra_fields');
});

test('tampered or mismatched gate evidence is rejected by the independent Node replay', async () => {
  const f = makeActMapCases('9')[1];
  const proposed = { scope: 'full', mapping: f.truth.mapping, action_to_target: f.truth.action_to_target };
  const history = [0, 1, 2].map(action => ({ action, value: 1, outcome: intervene(f, action, 1) }));
  const input = { fixture: f, proposed, history };
  const evidence = await callActMap(input);
  assert.equal(validateActMap(evidence, input).gate.status, 'provisionally_supported');
  assert.deepEqual(gateDecision(f, proposed, history), { status: 'provisionally_supported', accepted: true });
  const flipped = structuredClone(evidence); flipped.result.gate = { status: 'rejected', accepted: false, reason: 'x' };
  assert.throws(() => validateActMap(flipped, input), /invalid_tool_evidence/);
  assert.throws(() => validateActMap(evidence, { ...input, history: history.slice(1) }), /invalid_tool_evidence/);
  const forged = { ...input, history: [{ ...history[0], outcome: [9, 9, 9] }, ...history.slice(1)] };
  assert.equal((await callActMap(forged)).result.gate.reason, 'invalid_evidence_provenance');
  await assert.rejects(callActMap({ ...input, fixture: { ...f, commitment: '0'.repeat(64) } }), /tool_transport_error/);
});

test('the design call can use an uncalibrated proposer; a model change between the calls stops the run', async () => {
  const design = scripted('4', truthfulAnswer), inference = scripted('4', truthfulAnswer);
  const kinds = [];
  await runActMapExperiment('4', async m => { kinds.push('inference'); return inference.propose(m); }, callActMap, async () => {},
    { designPropose: async m => { kinds.push('design'); return design.propose(m); } });
  assert.deepEqual(kinds, ['design', 'inference', 'design', 'inference', 'design', 'inference']);
  const other = scripted('4', truthfulAnswer);
  await assert.rejects(runActMapExperiment('4', async m => ({ ...(await other.propose(m)), model: 'other' }), callActMap, async () => {},
    { designPropose: other.propose }), /model_changed/);
  assert.ok(designMessages(makeActMapCases('4')[0])[0].content.includes('Välj först'));
});

test('the catalog offers ACT-MAP to the planner under the causal domain', () => {
  const entry = CATALOG.find(e => e.id === 'act-map-transfer');
  assert.equal(entry.toolId, 'act-map'); assert.equal(entry.domain, 'causal'); assert.notEqual(entry.automatic, false);
  assert.equal(ACT_MAP_PROTOCOL.id, 'act-map-oraklet-v1');
});

test('VEM-Sci claims come only from verified cases; every lab report carries its register entry', async () => {
  const report = await runActMapExperiment('20261022', scripted('20261022', truthfulAnswer).propose, callActMap, async () => {});
  Object.assign(report, { experimentId: 'act-map-transfer' });
  const state = vemState(report);
  assert.equal(state.schema, VEM_SCHEMA);
  assert.equal(state.claims.length, 3);
  assert.ok(state.claims.every(c => c.experimentId === 'act-map-transfer' && c.seed === '20261022'));
  assert.match(vemLine(state), /3 påståenden/);
  const generic = vemClaims({ experimentId: 'sympy-quadratic', seed: '1', toolId: 'sympy', cases: [
    { case: 1, passed: true, proposal: { roots: [1] }, hypothesisTest: { independentlyVerified: true, verificationScope: 'exact' } },
    { case: 2, passed: false, proposal: { roots: [2] } },
    { case: 3, passed: true, proposal: {}, hypothesisTest: { independentlyVerified: false } },
    { case: 4 }] });
  assert.deepEqual(generic.map(c => c.status), ['provisionally_supported', 'rejected', 'unresolved']);
  assert.equal(generic[1].verifier, 'sympy');
  // Verifier results stored outside `evidence` (Ratfit, Rankscreen) still bind each claim.
  const stored = vemClaims({ experimentId: 'ratfit-baseline', seed: '1', cases: [
    { case: 1, passed: true, proposal: { c: 1 }, ratfit: { ok: 1 } }, { case: 2, passed: true, proposal: { c: 1 }, ratfit: { ok: 2 } }] });
  assert.notEqual(stored[0].evidenceSha256, stored[1].evidenceSha256);
  // A corrected answer registers both verified attempts.
  const corrected = vemClaims({ experimentId: 'ratfit-feedback', seed: '1', cases: [{ case: 1, passed: true, initialPassed: false,
    correctionAttempted: true, proposal: { c: 2 }, attempts: [{ proposal: { c: 1 } }, { proposal: { c: 2 } }] }] });
  assert.deepEqual(corrected.map(c => [c.attempt, c.status]), [['initial', 'rejected'], ['final', 'provisionally_supported']]);
  assert.notEqual(corrected[0].claimId, corrected[1].claimId);
  assert.equal(vemLine(vemState({ cases: [] })), '');
});

test('the register aggregates saved runs per experiment and never fails the lab run', async () => {
  const rows = [
    { skapad: '2026-10-22T05:00:00Z', experimentId: 'act-map-transfer', vem: vemState({ experimentId: 'act-map-transfer', seed: '1', cases: [
      { case: 1, vem: { claimId: 'a', kind: 'transfer', status: 'provisionally_supported' } },
      { case: 2, vem: { claimId: 'b', kind: 'abstention', status: 'unresolved' } }, { case: 3, vem: null }] }) },
    { skapad: '2026-10-21T05:00:00Z', experimentId: 'sympy-quadratic', vem: vemState({ experimentId: 'sympy-quadratic', seed: '2', cases: [{ case: 1, passed: false }] }) },
    { skapad: '2026-10-20T05:00:00Z', experimentId: 'x', vem: { schema: 'other', claims: [{ status: 'rejected' }] } },
  ];
  const summary = vemRegisterSummary(rows);
  assert.equal(summary.runs, 2);
  assert.deepEqual(summary.totals, { provisionally_supported: 1, rejected: 1, unresolved: 1 });
  assert.deepEqual(summary.experiments.map(e => [e.experimentId, e.abstentions, e.latest.slice(0, 10)]),
    [['act-map-transfer', 1, '2026-10-22'], ['sympy-quadratic', 0, '2026-10-21']]);
  assert.match(vemRegisterMarkdown(summary), /\| act-map-transfer \| 1 \| 0 \| 1 \(1\) \| 2026-10-22 \|/);
  const dir = await mkdtemp(join(tmpdir(), 'vem-')), cwd = process.cwd();
  try {
    process.chdir(dir);
    let url;
    await vemMain({ SUPABASE_SERVICE_ROLE_KEY: 'k' }, async u => { url = String(u); return Response.json(rows); });
    assert.match(url, /rapport-%3Evem=not\.is\.null|rapport->vem=not\.is\.null/);
    assert.match(await readFile('reports/oraklet-lab/vem-register.md', 'utf8'), /2 sparade körningar/);
    await vemMain({ SUPABASE_SERVICE_ROLE_KEY: 'k' }, async () => new Response('no', { status: 500 }));
    assert.match(await readFile('reports/oraklet-lab/vem-register.md', 'utf8'), /kunde inte läsas/);
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});

test('the lab runner runs ACT-MAP end to end and saves the VEM-Sci register with the report', async () => {
  const { writeFile } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const dir = await mkdtemp(join(tmpdir(), 'act-map-runner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    await writeFile(preload, `
import {writeFile,appendFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(u.includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 const messages=JSON.parse(JSON.parse(options.body).message).messages, content=JSON.parse(messages[1].content);
 await appendFile('calls.txt',(content.results?'inference':'design')+(messages.some(m=>m.content.includes('confidence'))?'+confidence':'')+'\\n');
 const answer=content.results?{decision:'none',mapping:null,interventions:null,reason:'Test.',confidence:0.9}
  :{experiments:content.targetInterventions.map(i=>({intervention:i,value:1})),reason:'Test.'};
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answer)});
};`);
    const env = { ...process.env, EXPERIMENT: 'act-map-transfer', EXPERIMENT_SEED: '20261022', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' };
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href,
      fileURLToPath(new URL('../research/runner.mjs', import.meta.url))], { cwd: dir, env, timeout: 30000 });
    assert.match(stdout, /Rapport sparad/);
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.experimentId, 'act-map-transfer');
    assert.equal(saved.modelCalls, 6);
    assert.equal(saved.vem.claims.length, 3);
    assert.ok(saved.vem.claims.every(c => c.kind === 'abstention' && c.status === 'unresolved'));
    assert.deepEqual((await readFile(join(dir, 'calls.txt'), 'utf8')).trim().split('\n'),
      ['design', 'inference+confidence', 'design', 'inference+confidence', 'design', 'inference+confidence'], 'only the claim carries a confidence');
    assert.equal(saved.calibration.scoredCases, 3);
    const markdown = await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8');
    assert.match(markdown, /## ACT-MAP: Oraklet mot uppräkningsbaslinjen/);
    assert.match(markdown, /VEM-Sci: 3 påståenden i registret: 0 preliminärt stödda, 0 avvisade, 3 olösta/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the gate finds Python behind a version-manager shim and never receives credentials', async () => {
  const { writeFile, chmod } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  assert.deepEqual(pythonEnv({ PATH: '/p', HOME: '/h', ASDF_DIR: '/a', PYENV_VERSION: '3', ORCHESTRATOR_API_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' }),
    { PATH: '/p', HOME: '/h', ASDF_DIR: '/a', PYENV_VERSION: '3' });
  // Like the asdf shim in the Cloudflare build image: without HOME it cannot start Python.
  const dir = await mkdtemp(join(tmpdir(), 'shim-')), real = execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim();
  const path = process.env.PATH;
  try {
    await writeFile(join(dir, 'python3'), `#!/bin/sh\n[ -n "$HOME" ] || exit 1\nexec ${real} "$@"\n`);
    await chmod(join(dir, 'python3'), 0o755);
    process.env.PATH = `${dir}:${path}`;
    const f = makeActMapCases('1')[0];
    assert.equal((await callActMap({ fixture: f, proposed: null, history: [] })).result.gate.status, 'unresolved');
  } finally { process.env.PATH = path; await rm(dir, { recursive: true, force: true }); }
});
