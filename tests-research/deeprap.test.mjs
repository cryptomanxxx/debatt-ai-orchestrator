import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeActMapCases, makeActMapBudgetCases, runActMapExperiment, callActMap, checkDesign, publicTask, budgetStepMessages, gateDecision, intervene,
  ACT_MAP_BUDGET_PROTOCOL, BUDGET_EXPERIMENTS, digest } from '../research/act-map.mjs';
import { deepRapScoreboard, deepRapMarkdown, main as deepRapMain, SCOREBOARD_SCHEMA } from '../research/deeprap.mjs';
import { VEM_SCHEMA } from '../research/vem-sci.mjs';
import { renderAiBus } from '../research/literature-day.mjs';
import { CATALOG } from '../research/catalog.mjs';

const named = (f, list, names) => Object.fromEntries(list.map((t, i) => [names[i], f.view.target_variables[t]]));
const truthful = f => f.truth.scope === 'none' ? { decision: 'none', mapping: null, interventions: null }
  : { decision: f.truth.scope, mapping: named(f, f.truth.mapping, ['s_0', 's_1', 's_2']), interventions: named(f, f.truth.action_to_target, f.view.target_interventions) };
// The intervention that sets the variable playing a source role.
const byRole = (f, role) => f.view.target_interventions[f.truth.action_to_target.indexOf(f.truth.mapping[role])];
// A scripted Oraklet: `choose(f, step, results)` names the intervention for step 0 and step 1.
function scripted(seed, choose) {
  const fixtures = makeActMapBudgetCases(seed), seen = [];
  const propose = async messages => {
    const content = JSON.parse(messages[1].content), task = content.task ?? content;
    const f = fixtures.find(x => x.view.level === task.level);
    seen.push({ system: messages[0].content, content });
    const text = /Avgör nu/.test(messages[0].content) ? JSON.stringify({ ...truthful(f), reason: 'R.' })
      : JSON.stringify({ experiments: [{ intervention: choose(f, content.results ? 1 : 0, content.results), value: 1 }], reason: 'Planerat.' });
    return { provider: 'test', model: 'same', text };
  };
  return { propose, seen };
}
const run = choose => { const s = scripted('3', choose); return runActMapExperiment('3', s.propose, callActMap, async () => {}, { budget: true }).then(r => ({ ...s, report: r })); };

test('the budget fixtures bind their protocol and two-intervention limit, with the direct truth', async () => {
  assert.equal(BUDGET_EXPERIMENTS, 2);
  const budget = makeActMapBudgetCases('3'), direct = makeActMapCases('3').slice(1);
  assert.deepEqual(budget.map(f => f.view.level), [3, 4]);
  for (const [i, f] of budget.entries()) {
    assert.deepEqual([f.view.protocol, f.view.max_experiments], [ACT_MAP_BUDGET_PROTOCOL.id, 2]);
    assert.deepEqual(f.truth, direct[i].truth, 'paired with the direct protocol on the same seed');
    assert.notEqual(f.commitment, direct[i].commitment);
    assert.equal(f.commitment, digest({ view: f.view, truth: f.truth }));
    assert.deepEqual([publicTask(f).protocol, publicTask(f).maxExperiments], [ACT_MAP_BUDGET_PROTOCOL.id, 2]);
  }
  const [f] = budget, three = JSON.stringify({ experiments: f.view.target_interventions.map(i => ({ intervention: i, value: 1 })), reason: 'r' });
  assert.equal(checkDesign(three, f).problem, 'invalid_experiments');
  assert.ok(checkDesign(three, makeActMapCases('3')[1]).design, 'the direct protocol still allows three');
  // The gate keeps to the committed budget: a third intervention is rejected by both verifiers.
  const history = [0, 1, 2].map(action => ({ action, value: 1, outcome: intervene(f, action, 1) }));
  const proposed = { scope: 'full', mapping: f.truth.mapping, action_to_target: f.truth.action_to_target };
  const evidence = await callActMap({ fixture: f, proposed, history });
  assert.equal(evidence.result.gate.reason, 'discovery_budget_exceeded');
  assert.equal(gateDecision(f, proposed, history).status, 'rejected');
  assert.ok(evidence.result.baseline.experiment_cost <= 2, 'the baseline has the same budget');
  // Raising the limit in the view breaks the commitment.
  await assert.rejects(callActMap({ fixture: { ...f, view: { ...f.view, max_experiments: 3 } }, proposed, history }), /tool_transport_error/);
});

test('the budget variant chooses the second intervention after seeing the first', async () => {
  assert.match(budgetStepMessages(makeActMapBudgetCases('3')[0])[0].content, /Välj ditt första ingrepp/);
  const { report, seen } = await run((f, step) => byRole(f, step));
  assert.equal(report.protocol.id, ACT_MAP_BUDGET_PROTOCOL.id);
  assert.equal(seen.length, 6, 'three calls per case, two cases');
  const second = seen.filter(x => /Välj ditt andra ingrepp/.test(x.system));
  assert.equal(second.length, 2);
  assert.ok(second.every(x => x.content.results.length === 1 && x.content.results[0].observed), 'the second choice sees the first outcome');
  assert.deepEqual(report.cases.map(c => c.experiments.length), [2, 2]);
  assert.ok(report.cases.filter(c => c.hypothesisTest.measured.truth.scope !== 'none').every(c => c.passed));
  assert.ok(report.cases.every(c => c.vem.outcome.protocol === 'act-map-budget-v1' && c.vem.outcome.experimentsUsed === 2
    && c.vem.outcome.completable === true && c.vem.outcome.secondCompletes === true));
  assert.equal(report.cases[0].proposal.design.reasons.length, 2);
  assert.deepEqual(CATALOG.find(e => e.id === 'act-map-budget').method, 'budget');
});

test('the budget variant separates bad luck from a poor second choice', async () => {
  // First on the mediator, then on s_2: coverage was reachable, the second choice missed it.
  const missed = (await run((f, step) => byRole(f, step ? 2 : 1))).report;
  for (const c of missed.cases) {
    assert.deepEqual(c.hypothesisTest.measured.planning, { completable: true, secondCompletes: false });
    if (c.hypothesisTest.measured.truth.scope !== 'none') assert.equal(c.hypothesisTest.measured.gate.reason, 'insufficient_intervention_coverage');
  }
  // First on s_2: nothing public told the roles apart, so the case says nothing about planning.
  const unlucky = (await run((f, step) => byRole(f, step ? 0 : 2))).report;
  assert.ok(unlucky.cases.every(c => c.hypothesisTest.measured.planning.completable === false && c.hypothesisTest.measured.planning.secondCompletes === null));
  // Repeating the first intervention is a format failure of the second step.
  const repeated = (await run(f => byRole(f, 0))).report;
  assert.ok(repeated.cases.every(c => c.formatProblem === 'second:repeated_intervention' && c.vem.kind === 'no_answer' && c.experiments.length === 1));
});

const outcome = (protocol, level, passed, extra = {}) => ({ protocol, level, passed, experimentsUsed: 3, baselineExperiments: 2, baselinePassed: true, falseCertification: false, ...extra });
const rows = [
  { skapad: '2026-10-23T05:00:00Z', experimentId: 'act-map-transfer', knowledge: { rank: 1, of: 18, claims: null },
    calibration: { cases: [{ confidence: 0.9, passed: true }, { confidence: 0.9, passed: false }] },
    vem: { schema: VEM_SCHEMA, claims: [
      { status: 'provisionally_supported', kind: 'transfer', outcome: outcome('act-map-oraklet-v1', 2, true) },
      { status: 'rejected', kind: 'transfer', outcome: outcome('act-map-oraklet-v1', 3, false) },
      { status: 'unresolved', kind: 'no_answer', outcome: outcome('act-map-oraklet-v1', 4, false) }] } },
  { skapad: '2026-10-24T05:00:00Z', experimentId: 'act-map-tree', knowledge: { rank: 5, of: 18, claims: [1, 1, 1] },
    vem: { schema: VEM_SCHEMA, claims: [
      { status: 'provisionally_supported', kind: 'transfer', outcome: outcome('act-map-tree-v1', 3, true, { experimentsUsed: 2 }) },
      { status: 'unresolved', kind: 'abstention', outcome: outcome('act-map-tree-v1', 4, true) }] } },
  { skapad: '2026-10-24T06:00:00Z', experimentId: 'sympy-quadratic', knowledge: { unavailable: true },
    vem: { schema: VEM_SCHEMA, claims: [{ status: 'rejected', kind: 'answer' }] } },
  { skapad: '2026-10-24T07:00:00Z', experimentId: 'x', vem: { schema: 'other', claims: [{ status: 'rejected' }] } },
];

test('the scoreboard measures reasoning, abstraction and planning from verified runs only', () => {
  const s = deepRapScoreboard(rows);
  assert.equal(s.schema, SCOREBOARD_SCHEMA);
  assert.equal(s.runs, 3, 'a foreign schema is ignored');
  assert.deepEqual([s.reasoning.supported, s.reasoning.rejected, s.reasoning.unresolved, s.reasoning.noAnswers, s.reasoning.abstentions], [2, 2, 2, 1, 1]);
  assert.equal(s.reasoning.supportRate, 0.5);
  assert.deepEqual(s.reasoning.calibration, { cases: 2, meanConfidence: 0.9, passRate: 0.5, brier: 0.41 });
  const direct = s.abstraction.protocols.find(p => p.protocol === 'act-map-oraklet-v1');
  assert.deepEqual([direct.cases, direct.passed, direct.levels.map(l => [l.level, l.passed, l.cases])], [3, 1, [[2, 1, 1], [3, 0, 1], [4, 0, 1]]]);
  assert.equal(s.abstraction.protocols.find(p => p.protocol === 'act-map-tree-v1').rate, 1);
  assert.deepEqual(s.planning.interventions, { cases: 3, oraklet: 2.6667, baseline: 2 });
  assert.deepEqual(s.planning.memory, { runs: 2, topPriority: 1, meanRelativeRank: 0.1176, untestedChosen: 1 });
  const md = deepRapMarkdown(s);
  assert.match(md, /\| Resonemang \| Påståenden som höll vid verifiering \| 50 % \| 2 stödda, 2 avvisade \|/);
  assert.match(md, /\| Abstraktion \| ACT-MAP trädsökning: rätt beslut \| 100 % \| 2 av 2; per nivå 3: 1\/1, 4: 1\/1 \|/);
  assert.match(md, /\| Planering \| Planeringen valde högsta lärprioritet \| 1 av 2 \|/);
  assert.deepEqual(s.planning.budget, { cases: 0, possible: 0, completed: 0, rate: null, unreachable: 0 });
  const budget = deepRapScoreboard([{ skapad: '2026-10-24T05:30:00Z', experimentId: 'act-map-budget', vem: { schema: VEM_SCHEMA, claims: [
    { status: 'provisionally_supported', kind: 'transfer', outcome: outcome('act-map-budget-v1', 3, true, { experimentsUsed: 2, completable: true, secondCompletes: true }) },
    { status: 'rejected', kind: 'transfer', outcome: outcome('act-map-budget-v1', 4, false, { experimentsUsed: 2, completable: true, secondCompletes: false }) },
    { status: 'rejected', kind: 'transfer', outcome: outcome('act-map-budget-v1', 3, false, { experimentsUsed: 2, completable: false, secondCompletes: null }) }] } }]);
  assert.deepEqual(budget.planning.budget, { cases: 3, possible: 2, completed: 1, rate: 0.5, unreachable: 1 });
  assert.match(deepRapMarkdown(budget), /\| Planering \| Två ingrepp: det andra fullbordade täckningen \| 50 % \| 1 av 2 fall där det var möjligt; 1 där första ingreppet satte s_2 \|/);
  const empty = deepRapMarkdown(deepRapScoreboard([]));
  assert.match(empty, /inga ACT-MAP-fall med utfall ännu/);
  assert.match(empty, /\| Resonemang \| Påståenden som höll vid verifiering \| – \|/);
});

test('the scoreboard CLI reads calibration and plan choices with the register and never fails the run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deeprap-')), cwd = process.cwd();
  try {
    process.chdir(dir);
    let url;
    await deepRapMain({ SUPABASE_SERVICE_ROLE_KEY: 'k' }, async u => { url = String(u); return Response.json(rows); });
    assert.match(url, /calibration:rapport->calibration/);
    assert.match(url, /knowledge:rapport->plan->knowledge/);
    assert.match(await readFile('reports/oraklet-lab/deeprap.md', 'utf8'), /# DeepRAP-mått/);
    assert.equal(JSON.parse(await readFile('reports/oraklet-lab/deeprap.json', 'utf8')).runs, 3);
    await deepRapMain({ SUPABASE_SERVICE_ROLE_KEY: 'k' }, async () => new Response('no', { status: 500 }));
    assert.match(await readFile('reports/oraklet-lab/deeprap.md', 'utf8'), /kunde inte läsas/);
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});

test('ai-bus shows the scoreboard under the memory section', () => {
  const md = renderAiBus({ date: '2026-10-24', field: 'Causal inference', model_budget: 10, pipeline: {}, errors: [], lab: { runs: [] },
    memory: { runs: 3, totals: { provisionally_supported: 2, rejected: 2, unresolved: 2 },
      experiments: [{ experimentId: 'act-map-transfer', provisionally_supported: 1, rejected: 1, unresolved: 1, abstentions: 0, noAnswers: 1 }],
      deeprap: deepRapScoreboard(rows) } });
  assert.ok(md.indexOf('## Kunskapsminne (VEM-Sci)') < md.indexOf('## DeepRAP-mått'));
  assert.match(md, /## DeepRAP-mått\n\nFrån 3 sparade labbkörningar/);
});

test('the lab runner runs the budget variant end to end', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'act-map-budget-runner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    await writeFile(preload, `
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(u.includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 const messages=JSON.parse(JSON.parse(options.body).message).messages, content=JSON.parse(messages[1].content);
 const task=content.task??content;
 const answer=/Avgör nu/.test(messages[0].content)?{decision:'none',mapping:null,interventions:null,reason:'Test.'}
  :{experiments:[{intervention:task.targetInterventions[content.results?1:0],value:1}],reason:'Test.'};
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answer)});
};`);
    const env = { ...process.env, EXPERIMENT: 'act-map-budget', EXPERIMENT_SEED: '20261023', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' };
    await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env, timeout: 30000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.experimentId, 'act-map-budget');
    assert.equal(saved.protocol.id, 'act-map-budget-v1');
    assert.deepEqual(saved.cases.map(c => [c.level, c.experiments.length]), [[3, 2], [4, 2]]);
    assert.match(await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8'), /## ACT-MAP under budget \(två ingrepp\): Oraklet mot uppräkningsbaslinjen/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
