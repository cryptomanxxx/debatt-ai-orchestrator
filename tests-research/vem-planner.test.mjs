import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { learningPriority, vemKnowledge, knowledgeChoice, knowledgeLine, vemRegisterSummary, VEM_SCHEMA } from '../research/vem-sci.mjs';
import { CATALOG, plannerPrompt, choosePlan, fitPlannerContext, MAX_PLANNER_CHARS } from '../research/catalog.mjs';

const offered = CATALOG.filter(e => e.automatic !== false).map(e => e.id);
const claim = (experimentId, status, kind = 'answer') => ({ experimentId, status, kind });
const row = (experimentId, claims, skapad = '2026-10-22T05:00:00Z') => ({ skapad, experimentId, vem: { schema: VEM_SCHEMA, claims } });

test('learning priority favours experiments whose claims failed and those without evidence', () => {
  assert.equal(learningPriority(), 0.5, 'no claims');
  assert.equal(learningPriority([4, 1, 1]), 3 / 8);
  assert.ok(learningPriority([0, 3, 0]) > learningPriority([0, 0, 0]));
  assert.ok(learningPriority([10, 0, 0]) < learningPriority([1, 0, 0]));
  const summary = vemRegisterSummary([
    row('act-map-transfer', [claim('act-map-transfer', 'provisionally_supported'), claim('act-map-transfer', 'unresolved', 'no_answer')]),
    row('sympy-quadratic', [claim('sympy-quadratic', 'rejected'), claim('sympy-quadratic', 'rejected')]),
    row('ratfit-baseline', [claim('ratfit-baseline', 'provisionally_supported'), claim('ratfit-baseline', 'provisionally_supported')]),
    row('glucose-temperature-evidence', [claim('glucose-temperature-evidence', 'rejected')])]);
  assert.equal(summary.experiments.find(e => e.experimentId === 'act-map-transfer').noAnswers, 1);
  const knowledge = vemKnowledge(summary, offered);
  assert.deepEqual(Object.keys(knowledge), ['sympy-quadratic', 'act-map-transfer', 'ratfit-baseline'], 'highest priority first; manual experiments left out');
  assert.deepEqual(knowledge['sympy-quadratic'], [0, 2, 0]);
  assert.deepEqual(knowledgeChoice(knowledge, offered, 'sympy-quadratic'), { claims: [0, 2, 0], priority: 0.75, rank: 1, of: offered.length });
  const untested = knowledgeChoice(knowledge, offered, 'dowhy-backdoor');
  assert.deepEqual([untested.claims, untested.priority, untested.rank], [null, 0.5, 2]);
  assert.equal(knowledgeChoice(knowledge, offered, 'ratfit-baseline').rank, offered.length);
  assert.match(knowledgeLine({ runs: 4, ...knowledgeChoice(knowledge, offered, 'sympy-quadratic') }), /0\/2\/0 \(stödda\/avvisade\/olösta\); lärprioritet 0.75, plats 1 av/);
  assert.match(knowledgeLine({ unavailable: true }), /kunde inte läsas/);
  assert.equal(knowledgeLine(undefined), '');
});

test('the planner sees the register only when it has entries, and the rule asks it to learn from failures', () => {
  const without = plannerPrompt([], '1');
  assert.ok(!JSON.stringify(without).includes('knowledge'));
  const prompt = plannerPrompt([], '1', ['default'], {}, [], { 'act-map-transfer': [4, 1, 1] });
  assert.match(prompt[0].content, /knowledge är ditt VEM-Sci-register.*avvisats eller är olösta eller där belägg saknas/);
  assert.deepEqual(JSON.parse(prompt[1].content).knowledge, { 'act-map-transfer': [4, 1, 1] });
});

test('register entries shrink from the lowest priority, after literature and before open problems', () => {
  const history = Array.from({ length: 10 }, () => ({ titel: 'x'.repeat(80), status: 'passed', seed: '123456789', experimentId: 'glucose-robustness' }));
  const knowledge = Object.fromEntries(offered.map((id, i) => [id, [i, 1, 1]]));
  const open = Array.from({ length: 3 }, (_, i) => ({ problemBankId: 'p-' + i, version: 1, experimentId: 'glucose-robustness',
    literature: { researchQuestion: 'q'.repeat(300), articles: 20, reportedLimitations: 5 } }));
  const choices = Object.fromEntries(['symbolic', 'probability', 'causal', 'statistics', 'discrete'].map(d =>
    [d, [0, 1, 2].map(i => ({ choice: 'hip / Model-' + d + i, provider: 'hip', model: 'Model-' + d + i, correct: 8, attempts: 8 }))]));
  const fitted = fitPlannerContext(history, '123456789', ['default'], choices, open, MAX_PLANNER_CHARS, knowledge);
  assert.ok(JSON.stringify(plannerPrompt(history, '123456789', ['default'], fitted.researchChoices, fitted.openProblems, fitted.knowledge, fitted.knowledgeOmitted)).length <= MAX_PLANNER_CHARS);
  assert.deepEqual(Object.keys(fitted.knowledge), Object.keys(knowledge).slice(0, Object.keys(fitted.knowledge).length), 'the first (highest-priority) entries are kept');
  assert.ok(Object.keys(fitted.knowledge).length >= 5 || fitted.openProblems.length === 0, 'five entries are kept before problems are dropped');
  assert.equal(fitted.knowledgeOmitted, offered.length - Object.keys(fitted.knowledge).length);
  assert.ok(fitted.knowledgeOmitted > 0, 'the worst case cuts register entries');
  const sentPrompt = plannerPrompt(history, '123456789', ['default'], fitted.researchChoices, fitted.openProblems, fitted.knowledge, fitted.knowledgeOmitted);
  assert.equal(JSON.parse(sentPrompt[1].content).knowledgeOmitted, fitted.knowledgeOmitted, 'absence is not presented as "no claims"');
  assert.match(sentPrompt[0].content, /utom de knowledgeOmitted lägre prioriterade som utelämnats/);
  const whole = fitPlannerContext([], '1', ['default'], {}, [], MAX_PLANNER_CHARS, knowledge);
  assert.deepEqual([whole.knowledge, whole.knowledgeOmitted], [knowledge, 0], 'nothing is cut when it fits');
  assert.ok(!JSON.stringify(plannerPrompt([], '1', ['default'], {}, [], knowledge, 0)).includes('knowledgeOmitted'));
  // A realistic day: the full register for every automatic experiment, ranked models and two problems fit.
  const realistic = fitPlannerContext(Array.from({ length: 10 }, (_, i) => ({ titel: 'Oraklets experiment ' + i, status: 'passed', seed: String(i), experimentId: offered[i] })),
    '20261023', ['default'], { causal: [{ choice: 'hip / M', provider: 'hip', model: 'M', correct: 5, attempts: 6 }] }, open.slice(0, 2), MAX_PLANNER_CHARS, knowledge);
  assert.equal(Object.keys(realistic.knowledge).length, offered.length);
  assert.equal(realistic.openProblems.length, 2);
});

test('choosePlan passes the fitted register to the model; manual runs never read it', async () => {
  let sent;
  await choosePlan('auto', '5', [], async messages => { sent = messages; return { text: JSON.stringify({ experimentId: 'sympy-quadratic', seed: '5', reason: 'Lär av avvisade påståenden.' }) }; },
    ['default'], {}, [], { 'sympy-quadratic': [0, 2, 0] });
  assert.deepEqual(JSON.parse(sent[1].content).knowledge, { 'sympy-quadratic': [0, 2, 0] });
  assert.equal((await choosePlan('sympy-quadratic', '5', [], () => assert.fail(), ['default'], {}, [], { x: [1, 1, 1] })).experimentId, 'sympy-quadratic');
  const plan = await choosePlan('auto', '5', [], async () => ({ text: JSON.stringify({ experimentId: 'sympy-quadratic', seed: '5', reason: 'R.' }) }),
    ['default'], {}, [], { 'sympy-quadratic': [0, 2, 0] });
  assert.deepEqual(plan.knowledgeShown, { entries: 1, omitted: 0, chosenShown: true });
  const line = knowledgeLine({ runs: 9, claims: [5, 0, 0], priority: 0.1429, rank: 20, of: 20, shown: { entries: 6, omitted: 10, chosenShown: false } });
  assert.match(line, /Planeringen såg 6 poster \(10 utelämnade för utrymmet\); det valda experimentets post var bland de utelämnade\./);
});

test('the daily lab plans with the register, commits the choice with the plan and reports it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vem-planner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    const register = [row('sympy-quadratic', [claim('sympy-quadratic', 'rejected'), claim('sympy-quadratic', 'rejected')])];
    await writeFile(preload, `
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(u.includes('/v1/model-profile')) return Response.json({reasoningAvailable:false});
 if(u.includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  if(u.includes('vem:rapport'))return Response.json(${JSON.stringify(register)});
  return Response.json([]);
 }
 const messages=JSON.parse(JSON.parse(options.body).message).messages, content=JSON.parse(messages[1].content);
 if(content.catalog){await writeFile('planner.json',JSON.stringify(messages));return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},
  answer:JSON.stringify({experimentId:'act-map-transfer',seed:'11',reason:'Inga belägg ännu.'})});}
 const answer=content.results?{decision:'none',mapping:null,interventions:null,reason:'Test.'}
  :{experiments:content.targetInterventions.map(i=>({intervention:i,value:1})),reason:'Test.'};
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answer)});
};`);
    const env = { ...process.env, EXPERIMENT: 'auto', EXPERIMENT_SEED: '20261023', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test',
      SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' };
    await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env, timeout: 30000 });
    const planner = JSON.parse(await readFile(join(dir, 'planner.json'), 'utf8'));
    assert.deepEqual(JSON.parse(planner[1].content).knowledge, { 'sympy-quadratic': [0, 2, 0] });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.deepEqual(saved.plan.knowledge, { source: VEM_SCHEMA, runs: 1, claims: null, priority: 0.5, rank: 2, of: offered.length,
      shown: { entries: 1, omitted: 0, chosenShown: false } });
    assert.equal(saved.plan.knowledgeShown, undefined, 'folded into plan.knowledge');
    const plan = JSON.parse(await readFile(join(dir, 'reports/oraklet-lab/plan.json'), 'utf8'));
    assert.deepEqual(plan.plan.knowledge, saved.plan.knowledge, 'committed with the plan before the experiment');
    assert.match(await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8'), /Kunskapsminne: planeringen såg registret från 1 körningar\. Valt experiment: inga tidigare påståenden; lärprioritet 0.5, plats 2 av/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
