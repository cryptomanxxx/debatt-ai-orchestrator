import test from 'node:test';
import assert from 'node:assert/strict';
import { openResearchProblems, loadOpenProblems, MAX_OPEN_PROBLEMS } from '../research/open-problems.mjs';
import { createProblem } from '../research/problem-bank.mjs';
import { CATALOG, parsePlan, plannerPrompt, choosePlan, fitPlannerContext, MAX_PLANNER_CHARS } from '../research/catalog.mjs';
import { researchVerdict } from '../research/oraklet-problem-bank.mjs';

const entry = id => CATALOG.find(e => e.id === id);
const bank = (id, experimentId, extra = {}) => createProblem({ id, kind: 'open', domain: 'x', question: entry(experimentId).question,
  source: { experiment_id: experimentId }, ...extra });
const report = (candidateId, question = 'Kan rationella samband återfinnas med få punkter?') => ({ id: '11111111-1111-4111-8111-111111111111',
  planner: { proposals: [{ id: candidateId, research_question: question, evidence: [{ id: 'W1' }, { id: 'W2' }], gap_candidates: [{}] }] } });

test('open problems are approved catalog problems, literature-supported first', () => {
  const problems = [bank('oraklet-dowhy-backdoor-001', 'dowhy-backdoor'), bank('oraklet-ratfit-feedback-001', 'ratfit-feedback'),
    bank('oraklet-ratfit-feedback-001', 'ratfit-feedback', { version: 2 }),
    bank('manual-only', 'pymc-gdp-ar1'), { ...bank('retired-one', 'sympy-quadratic'), status: 'retired' },
    createProblem({ id: 'wrong-question', kind: 'open', domain: 'x', question: 'Other?', source: { experiment_id: 'sympy-quadratic' } })];
  const open = openResearchProblems(problems, [report('arp-symbolic-regression')], CATALOG);
  assert.deepEqual(open.map(o => o.summary.problemBankId), ['oraklet-ratfit-feedback-001', 'oraklet-dowhy-backdoor-001']);
  assert.equal(open[0].summary.version, 1, 'the first row per id (newest by the client order) wins');
  assert.deepEqual(open[0].summary.literature, { researchQuestion: 'Kan rationella samband återfinnas med få punkter?', articles: 2, reportedLimitations: 1 });
  assert.equal(open[1].summary.literature, null);
  assert.deepEqual(openResearchProblems(problems, 'broken', CATALOG).map(o => o.summary.problemBankId).sort(),
    ['oraklet-dowhy-backdoor-001', 'oraklet-ratfit-feedback-001']);
  const many = CATALOG.filter(e => e.automatic !== false).map(e => bank('p-' + e.id, e.id));
  assert.equal(openResearchProblems(many, [], CATALOG).length, MAX_OPEN_PROBLEMS);
});

test('Problem Bank outages or missing configuration mean no open problems', async () => {
  assert.deepEqual((await loadOpenProblems({}, CATALOG)).open, []);
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'secret' };
  assert.deepEqual((await loadOpenProblems(env, CATALOG, async () => new Response('down', { status: 503 }))).open, []);
  const row = bank('oraklet-dowhy-backdoor-001', 'dowhy-backdoor');
  const fetchImpl = async url => String(url).includes('research_problem') ? Response.json([row]) : new Response('x', { status: 500 });
  const loaded = await loadOpenProblems(env, CATALOG, fetchImpl);
  assert.equal(loaded.open[0].summary.problemBankId, 'oraklet-dowhy-backdoor-001');
  assert.equal(loaded.open[0].summary.literature, null, 'literature outage keeps the problem');
  let signals = 0;
  await loadOpenProblems(env, CATALOG, async (url, options) => { if (options?.signal) signals++; return Response.json([]); });
  assert.equal(signals, 2, 'Problem Bank and literature requests are time-bounded');
  const tampered = async url => String(url).includes('research_problem') ? Response.json([{ ...row, question: 'Changed?' }]) : Response.json([]);
  assert.deepEqual((await loadOpenProblems(env, CATALOG, tampered)).open, [], 'a fingerprint mismatch drops the whole list');
});

test('the plan may attach only an offered problem of the planned experiment', async () => {
  const offered = [{ problemBankId: 'oraklet-dowhy-backdoor-001', version: 1, experimentId: 'dowhy-backdoor', literature: null }];
  const plan = { experimentId: 'dowhy-backdoor', seed: '5', reason: 'Godkänt problem.', problemBankId: 'oraklet-dowhy-backdoor-001' };
  assert.deepEqual(parsePlan(JSON.stringify(plan), ['default'], {}, offered), plan);
  assert.equal(parsePlan(JSON.stringify({ ...plan, problemBankId: null }), ['default'], {}, offered).problemBankId, null);
  for (const bad of [{ problemBankId: 'unknown' }, { experimentId: 'sympy-quadratic' }, { problemBankId: undefined }, { problemBankId: 7 }])
    assert.throws(() => parsePlan(JSON.stringify({ ...plan, ...bad }), ['default'], {}, offered));
  assert.throws(() => parsePlan(JSON.stringify(plan)), 'without offered problems the old three-key plan applies');
  const prompt = plannerPrompt([], '5', ['default'], {}, offered);
  assert.deepEqual(JSON.parse(prompt[1].content).openProblems, offered);
  assert.match(prompt[0].content, /experimentId, seed, problemBankId och reason/);
  assert.equal(plannerPrompt([], '5')[0].content.includes('openProblems'), false);
  assert.equal((await choosePlan('auto', '5', [], async () => ({ text: JSON.stringify(plan) }), ['default'], {}, offered)).problemBankId,
    'oraklet-dowhy-backdoor-001');
});

test('a consistent completed run is verified or falsified by the experiment verifier, never by the model', () => {
  const e = entry('dowhy-backdoor');
  const base = { reportId: 'r', seed: '5', toolId: 'dowhy', executionStatus: 'completed' };
  const passed = researchVerdict(e, { ...base, status: 'passed' }, 3, 3);
  assert.equal(passed.status, 'verified');
  assert.deepEqual(passed.verification, { tool: 'dowhy', independent: true,
    result: { valid: true, scope: 'catalog_method_test_single_run', report_status: 'passed', passed_cases: 3, total_cases: 3 } });
  assert.match(passed.claim, /seed 5.*all 3 cases/);
  assert.equal(researchVerdict(e, { ...base, status: 'failed' }, 1, 3).status, 'falsified');
  assert.equal(researchVerdict(e, { ...base, status: 'passed' }, 2, 3).status, 'needs_external_verification', 'status and cases disagree');
  assert.equal(researchVerdict(e, { ...base, status: 'passed' }, 0, 0).status, 'needs_external_verification');
  assert.equal(researchVerdict(e, { ...base, executionStatus: 'error', status: 'failed' }, 0, 3).status, 'inconclusive');
});

test('optional planning context shrinks until the planning request fits', async () => {
  const history = Array.from({ length: 10 }, () => ({ titel: 'x'.repeat(80), status: 'passed', seed: '123456789', experimentId: 'glucose-robustness' }));
  const choices = Object.fromEntries(['symbolic', 'probability', 'causal', 'statistics', 'discrete'].map(d =>
    [d, [0, 1, 2].map(i => ({ choice: 'hip / Model-' + d + i, provider: 'hip', model: 'Model-' + d + i, correct: 8, attempts: 8 }))]));
  const open = Array.from({ length: 8 }, (_, i) => ({ problemBankId: 'p-' + i, version: 1, experimentId: 'glucose-robustness',
    literature: { researchQuestion: 'q'.repeat(300), articles: 20, reportedLimitations: 5 } }));
  const fitted = fitPlannerContext(history, '123456789', ['default', 'reasoning'], choices, open);
  const size = JSON.stringify(plannerPrompt(history, '123456789', ['default', 'reasoning'], fitted.researchChoices, fitted.openProblems)).length;
  assert.ok(size <= MAX_PLANNER_CHARS, String(size));
  assert.ok(fitted.openProblems.length >= 1 && fitted.openProblems.length < 8);
  assert.ok(fitted.openProblems.every(p => p.literature.researchQuestion.length <= 120));
  assert.equal(fitted.openProblems[0].problemBankId, 'p-0', 'the highest-priority problems are kept');
  const small = fitPlannerContext([], '1', ['default'], {}, open.slice(0, 1));
  assert.equal(small.openProblems[0].literature.researchQuestion.length, 300, 'nothing is trimmed when it already fits');
  let sent;
  await choosePlan('auto', '123456789', history, async messages => { sent = messages; return { text: JSON.stringify({ experimentId: 'glucose-robustness',
    seed: '1', reason: 'R.', modelMode: 'default', problemBankId: null }) }; }, ['default', 'reasoning'], choices, open);
  assert.ok(JSON.stringify(sent).length <= MAX_PLANNER_CHARS);
});
