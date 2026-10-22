import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeActMapCases, runActMapExperiment, callActMap, checkDesign, designMessages, ACT_MAP_BUDGET_PROTOCOL, BUDGET_EXPERIMENTS } from '../research/act-map.mjs';
import { deepRapScoreboard, deepRapMarkdown, main as deepRapMain, SCOREBOARD_SCHEMA } from '../research/deeprap.mjs';
import { VEM_SCHEMA } from '../research/vem-sci.mjs';
import { renderAiBus } from '../research/literature-day.mjs';
import { CATALOG } from '../research/catalog.mjs';

const named = (f, list, names) => Object.fromEntries(list.map((t, i) => [names[i], f.view.target_variables[t]]));
const truthful = f => f.truth.scope === 'none' ? { decision: 'none', mapping: null, interventions: null }
  : { decision: f.truth.scope, mapping: named(f, f.truth.mapping, ['s_0', 's_1', 's_2']), interventions: named(f, f.truth.action_to_target, f.view.target_interventions) };
// The two interventions that set the root and the mediator.
const rootAndMediator = f => [0, 1].map(role => f.view.target_interventions[f.truth.action_to_target.indexOf(f.truth.mapping[role])]);
function scripted(seed, design) {
  const fixtures = makeActMapCases(seed), seen = [];
  const propose = async messages => {
    const content = JSON.parse(messages[1].content), task = content.task ?? content;
    const f = fixtures.find(x => x.view.level === task.level);
    seen.push(task.maxExperiments);
    const text = content.results ? JSON.stringify({ ...truthful(f), reason: 'R.' })
      : JSON.stringify({ experiments: design(f).map(i => ({ intervention: i, value: 1 })), reason: 'Planerat.' });
    return { provider: 'test', model: 'same', text };
  };
  return { propose, seen };
}

test('the budget variant runs the same fixtures with at most two interventions', async () => {
  assert.equal(BUDGET_EXPERIMENTS, 2);
  const [f] = makeActMapCases('3');
  assert.match(designMessages(f, 2)[0].content, /1–2 ingrepp/);
  assert.equal(JSON.parse(designMessages(f, 2)[1].content).maxExperiments, 2);
  const three = JSON.stringify({ experiments: f.view.target_interventions.map(i => ({ intervention: i, value: 1 })), reason: 'r' });
  assert.equal(checkDesign(three, f, 2).problem, 'invalid_experiments');
  assert.ok(checkDesign(three, f).design, 'the direct protocol still allows three');
  const planned = scripted('3', rootAndMediator);
  const report = await runActMapExperiment('3', planned.propose, callActMap, async () => {}, { budget: true });
  assert.ok(planned.seen.every(m => m === 2));
  assert.equal(report.protocol.id, ACT_MAP_BUDGET_PROTOCOL.id);
  assert.deepEqual(report.cases.map(c => c.experiments.length), [2, 2, 2]);
  const transfers = report.cases.filter(c => c.hypothesisTest.measured.truth.scope !== 'none');
  assert.ok(transfers.every(c => c.passed), 'root and mediator are enough for the gate');
  assert.ok(report.cases.every(c => typeof c.hypothesisTest.measured.baselineWithinBudget === 'boolean'));
  assert.ok(report.cases.every(c => c.vem.outcome.protocol === 'act-map-budget-v1' && c.vem.outcome.experimentsUsed === 2));
  // Two interventions that miss the mediator cannot certify a correct correspondence.
  const unplanned = scripted('3', f => f.view.target_interventions.filter(i => !rootAndMediator(f).slice(1).includes(i)).slice(0, 2));
  const missed = await runActMapExperiment('3', unplanned.propose, callActMap, async () => {}, { budget: true });
  assert.ok(missed.cases.filter(c => c.hypothesisTest.measured.truth.scope !== 'none')
    .every(c => !c.passed && c.hypothesisTest.measured.gate.reason === 'insufficient_intervention_coverage'));
  assert.deepEqual(CATALOG.find(e => e.id === 'act-map-budget').method, 'budget');
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
 const answer=content.results?{decision:'none',mapping:null,interventions:null,reason:'Test.'}
  :{experiments:content.targetInterventions.slice(0,content.maxExperiments).map(i=>({intervention:i,value:1})),reason:'Test.'};
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answer)});
};`);
    const env = { ...process.env, EXPERIMENT: 'act-map-budget', EXPERIMENT_SEED: '20261023', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' };
    await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env, timeout: 30000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.experimentId, 'act-map-budget');
    assert.equal(saved.protocol.id, 'act-map-budget-v1');
    assert.ok(saved.cases.every(c => c.experiments.length === 2));
    assert.match(await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8'), /## ACT-MAP under budget \(två ingrepp\): Oraklet mot uppräkningsbaslinjen/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
