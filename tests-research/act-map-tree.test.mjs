import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACT_MAP_TREE_PROTOCOL, makeActMapTreeCases, checkHypotheses, consistency, searchHypotheses, runActMapTreeExperiment,
  actMapTreeMarkdown, hypothesesMessages } from '../research/act-map-tree.mjs';
import { makeActMapCases, callActMap, intervene, VALUES } from '../research/act-map.mjs';
import { CATALOG, plannerPrompt } from '../research/catalog.mjs';

const named = (f, list, names) => Object.fromEntries(list.map((t, i) => [names[i], f.view.target_variables[t]]));
const truthful = f => f.truth.scope === 'none' ? { decision: 'none', mapping: null, interventions: null }
  : { decision: f.truth.scope, mapping: named(f, f.truth.mapping, ['s_0', 's_1', 's_2']), interventions: named(f, f.truth.action_to_target, f.view.target_interventions) };
// A wrong full claim: the true correspondence with s_0 and s_1 swapped.
const wrong = f => {
  const h = { decision: 'full', mapping: named(f, f.truth.mapping, ['s_0', 's_1', 's_2']), interventions: named(f, f.truth.action_to_target, f.view.target_interventions) };
  [h.mapping.s_0, h.mapping.s_1] = [h.mapping.s_1, h.mapping.s_0];
  return h;
};
const allOnes = f => JSON.stringify({ experiments: f.view.target_interventions.map(i => ({ intervention: i, value: 1 })), reason: 'Alla.' });
// Scripted Oraklet: design, hypotheses(fixture), final(fixture, hypotheses-as-evaluated).
function scripted(seed, { hypotheses, final }) {
  const fixtures = makeActMapTreeCases(seed), calls = [];
  const propose = async messages => {
    const content = JSON.parse(messages[1].content), task = content.task ?? content;
    const f = fixtures.find(x => x.view.level === task.level);
    const kind = !content.results ? 'design' : content.hypotheses ? 'final' : 'hypotheses';
    calls.push({ kind, level: task.level, content });
    const text = kind === 'design' ? allOnes(f) : kind === 'hypotheses' ? JSON.stringify({ hypotheses: hypotheses(f), reason: 'Konkurrerande.' })
      : JSON.stringify({ ...final(f, content.hypotheses), reason: 'Prövat.' });
    return { provider: 'test', model: 'same', text };
  };
  return { fixtures, calls, propose };
}

test('the tree protocol uses the same fixtures as the direct protocol on the same seed (levels 3 and 4)', () => {
  const tree = makeActMapTreeCases('20261023'), direct = makeActMapCases('20261023');
  assert.deepEqual(tree.map(f => f.view.level), [3, 4]);
  assert.deepEqual(tree.map(f => f.commitment), direct.slice(1).map(f => f.commitment));
  assert.equal(ACT_MAP_TREE_PROTOCOL.id, 'act-map-tree-v1');
  assert.match(hypothesesMessages(tree[0], [])[0].content, /Avgör inte än/);
});

test('consistency checks a hypothesis only against observations already seen', () => {
  const [f] = makeActMapTreeCases('4');
  const history = [0, 1, 2].map(action => ({ action, value: 1, outcome: intervene(f, action, 1) }));
  const right = checkHypotheses(JSON.stringify({ hypotheses: [truthful(f)], reason: 'r' }), f).hypotheses[0];
  assert.deepEqual(consistency(f, right, history).contradiction, null);
  const bad = checkHypotheses(JSON.stringify({ hypotheses: [wrong(f)], reason: 'r' }), f).hypotheses[0];
  const c = consistency(f, bad, history);
  assert.ok(c.contradiction && c.matched < c.checked);
  assert.ok(VALUES.includes(c.contradiction.value), 'never a hidden intervention size');
  assert.deepEqual(consistency(f, { decision: 'none', proposed: null }, history), { checked: 0, matched: 0, contradiction: null });
});

test('hypotheses parsing drops invalid and repeated candidates and rejects malformed answers', () => {
  const [f] = makeActMapTreeCases('6');
  const ok = checkHypotheses(JSON.stringify({ hypotheses: [truthful(f), truthful(f), { decision: 'maybe' }], reason: 'r' }), f);
  assert.equal(ok.hypotheses.length, 1);
  assert.equal(checkHypotheses(JSON.stringify({ hypotheses: Array(4).fill(truthful(f)), reason: 'r' }), f).problem, 'invalid_hypotheses');
  assert.equal(checkHypotheses(JSON.stringify({ hypotheses: [{ decision: 'maybe' }], reason: 'r' }), f).problem, 'invalid_hypotheses');
  assert.equal(checkHypotheses('nej', f).problem, 'not_json');
  assert.equal(checkHypotheses(JSON.stringify({ hypotheses: [truthful(f)], extra: 1 }), f).problem, 'extra_fields');
  for (const reason of [undefined, 7, '  ', 'x'.repeat(801)])
    assert.equal(checkHypotheses(JSON.stringify({ hypotheses: [truthful(f)], reason }), f).problem, 'invalid_reason', String(reason));
});

test('the bounded tree search stops at the first hypothesis that fits all observations', async () => {
  const [f] = makeActMapTreeCases('9');
  const history = [0, 1, 2].map(action => ({ action, value: 1, outcome: intervene(f, action, 1) }));
  const hyps = checkHypotheses(JSON.stringify({ hypotheses: [wrong(f), truthful(f), { decision: 'none', mapping: null, interventions: null }], reason: 'r' }), f).hypotheses;
  const tree = await searchHypotheses(f, hyps, history);
  assert.equal(tree.search.algorithm, 'bounded-best-first-tree-search');
  assert.equal(tree.search.verifiedNodeId, 'root/h2');
  assert.deepEqual(tree.evaluated.map(h => [h.hypothesis, h.consistent]), [['h1', false], ['h2', true]]);
  assert.ok(tree.evaluated[0].firstContradiction);
  assert.deepEqual(tree.notEvaluated, ['h3']);
  assert.deepEqual(tree.candidates.map(h => [h.hypothesis, h.consistent]), [['h1', false], ['h2', true], ['h3', null]],
    'the untested hypothesis still reaches the final step');
  assert.match(tree.candidates[2].note, /inte prövad/);
});

test('Oraklet sees which hypotheses fit before the claim; a correct claim passes the gate', async () => {
  const { propose, calls } = scripted('20261023', { hypotheses: f => [wrong(f), truthful(f)], final: f => truthful(f) });
  const report = await runActMapTreeExperiment('20261023', propose, callActMap, async () => {});
  assert.deepEqual(calls.map(c => c.kind), ['design', 'hypotheses', 'final', 'design', 'hypotheses', 'final']);
  const finals = calls.filter(c => c.kind === 'final');
  assert.ok(finals.every(c => Array.isArray(c.content.hypotheses) && c.content.hypotheses.length === 2), 'all stated hypotheses, tested or not');
  assert.ok(finals.every(c => !JSON.stringify(c.content).match(/target_coefficients|"scope"|-2,3|HOLDOUT/)), 'no truth or hidden sizes reach the model');
  assert.equal(report.status, 'passed');
  for (const c of report.cases) {
    const m = c.hypothesisTest.measured;
    assert.equal(m.correctHypothesisAmongCandidates, true);
    assert.equal(c.vem.status, m.truth.scope === 'none' ? 'unresolved' : 'provisionally_supported');
    assert.equal(c.tree.search.limits.maxNodes, 3);
  }
  assert.match(actMapTreeMarkdown(report.cases), /Oraklet 2\/2 rätt/);
});

test('when no transfer hypothesis fits, the evaluation says so and abstaining on a non-transfer passes', async () => {
  // Find a seed whose level-4 case does not transfer.
  const seed = Array.from({ length: 50 }, (_, i) => String(i)).find(s => makeActMapTreeCases(s)[1].truth.scope === 'none');
  const { propose, calls } = scripted(seed, { hypotheses: f => [wrong(f), { ...truthful({ ...f, truth: { ...f.truth, scope: 'full' } }) }],
    final: (f, evaluated) => evaluated.some(h => h.consistent) ? truthful({ ...f, truth: { ...f.truth, scope: 'full' } }) : { decision: 'none', mapping: null, interventions: null } });
  const report = await runActMapTreeExperiment(seed, propose, callActMap, async () => {});
  const level4 = report.cases[1], m = level4.hypothesisTest.measured;
  assert.equal(m.truth.scope, 'none');
  assert.equal(m.consistentHypothesisFound, false);
  assert.ok(level4.tree.evaluated.every(h => !h.consistent && h.firstContradiction));
  assert.equal(level4.proposal.decision, 'none');
  assert.equal(level4.passed, true);
  assert.equal(level4.vem.kind, 'abstention');
  assert.ok(calls.some(c => c.kind === 'final' && c.content.hypotheses.every(h => !h.consistent)));
});

test('a cut-off or unreadable step fails its case as a remembered non-answer and the run goes on', async () => {
  const { ResearchError } = await import('../research/errors.mjs');
  const { propose } = scripted('12', { hypotheses: f => [truthful(f)], final: f => truthful(f) });
  let n = 0;
  const cut = async messages => { if (++n === 2) throw new ResearchError('model_output_truncated'); return propose(messages); };
  const report = await runActMapTreeExperiment('12', cut, callActMap, async () => {});
  assert.equal(report.cases[0].formatProblem, 'hypotheses:truncated');
  assert.deepEqual([report.cases[0].vem.kind, report.cases[0].vem.status], ['no_answer', 'unresolved']);
  assert.equal(report.cases[0].tree, null);
  assert.equal(report.cases[1].passed, true);
  const bad = scripted('12', { hypotheses: () => [{ decision: 'maybe' }], final: () => assert.fail('no final call after unusable hypotheses') });
  const failed = await runActMapTreeExperiment('12', bad.propose, callActMap, async () => {});
  assert.ok(failed.cases.every(c => c.formatProblem === 'hypotheses:invalid_hypotheses' && !c.passed));
  await assert.rejects(runActMapTreeExperiment('12', async m => ({ ...(await propose(m)), model: String(Math.random()) }), callActMap, async () => {}), /model_changed/);
});

test('the catalog offers the tree method to the planner without display names', () => {
  const entry = CATALOG.find(e => e.id === 'act-map-tree');
  assert.deepEqual([entry.toolId, entry.method, entry.domain], ['act-map', 'tree', 'causal']);
  const offered = JSON.parse(plannerPrompt([], '1')[1].content).catalog;
  assert.ok(offered.some(e => e.id === 'act-map-tree'));
  assert.ok(offered.every(e => Object.keys(e).join() === 'id,domain,question'));
});

test('the lab runner runs the tree method end to end: six calls, confidence only on the claim', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'act-map-tree-runner-'));
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
 const kind=!content.results?'design':content.hypotheses?'final':'hypotheses';
 await appendFile('calls.txt',kind+(messages.some(m=>m.content.includes('confidence'))?'+confidence':'')+'\\n');
 const none={decision:'none',mapping:null,interventions:null};
 const answer=kind==='design'?{experiments:content.targetInterventions.map(i=>({intervention:i,value:1})),reason:'Test.'}
  :kind==='hypotheses'?{hypotheses:[none],reason:'Test.'}:{...none,reason:'Test.',confidence:0.4};
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answer)});
};`);
    const env = { ...process.env, EXPERIMENT: 'act-map-tree', EXPERIMENT_SEED: '20261023', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' };
    await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env, timeout: 30000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.experimentId, 'act-map-tree');
    assert.equal(saved.modelCalls, 6);
    assert.equal(saved.cases.length, 2);
    assert.equal(saved.calibration.scoredCases, 2);
    assert.deepEqual((await readFile(join(dir, 'calls.txt'), 'utf8')).trim().split('\n'),
      ['design', 'hypotheses', 'final+confidence', 'design', 'hypotheses', 'final+confidence']);
    assert.equal(saved.vem.claims.length, 2);
    assert.match(await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8'), /## ACT-MAP med trädsökning: Oraklet mot uppräkningsbaslinjen/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
