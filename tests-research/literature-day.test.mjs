import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LITERATURE_FIELDS, DAILY_MODEL_BUDGET, fieldForDate, registerLiteratureProblems, readRecentLabReports,
  runLiteratureDay, renderAiBus, main } from '../research/literature-day.mjs';
import { RESEARCH_AREAS } from '../research/research-pipeline.mjs';
import { catalogMatches } from '../research/literature-problem-proposals.mjs';
import { planResearch } from '../research/autonomous-planner.mjs';

const REPORT = '00000000-0000-4000-8000-000000000010';
const pipelineReport = (extra = {}) => ({ status: 'completed', area: 'Causal inference', query: 'causal inference machine learning',
  budget: { maximum_model_calls: 10, known_model_calls: 7 }, candidate_id: 'arp-causal-inference',
  candidate: { id: 'arp-causal-inference', question: 'Does adjustment recover the effect?', hypothesis: 'Adjusted <b>estimates</b> | differ', gap_review_count: 2, evidence_articles: 3 },
  stages: [
    { name: 'collection', summary: { metadata: { returned_records: 40 }, abstracts: { available: 10 } } },
    { name: 'initial_evidence', report_id: REPORT, summary: { coverage: { selected: 5, summarized: 5 },
      papers: [{ title: 'A causal paper', status: 'summarized', findings: [{ kind: 'limitation', claim: 'Small samples limit `power` | x' }] }] } },
    { name: 'follow_up_evidence', report_id: '00000000-0000-4000-8000-000000000011', summary: { coverage: { selected: 2, summarized: 2 }, papers: [] } },
  ], ...extra });

test('the two chosen fields alternate by UTC day and are pipeline research areas', () => {
  assert.deepEqual(LITERATURE_FIELDS, ['AI for scientific discovery', 'Causal inference']);
  assert.ok(LITERATURE_FIELDS.every(f => Object.hasOwn(RESEARCH_AREAS, f)));
  const a = fieldForDate('2026-10-23'), b = fieldForDate('2026-10-24');
  assert.notEqual(a, b); assert.equal(fieldForDate('2026-10-25'), a);
  for (const bad of ['2026-13-01', '23-10-2026', '', null]) assert.throws(() => fieldForDate(bad));
});

test('causal-inference literature now reaches the DoWhy catalog experiment', () => {
  assert.deepEqual(catalogMatches('arp-causal-inference').map(e => e.id), ['dowhy-backdoor']);
  const papers = [{ id: 'p1', title: 'Causal inference under unmeasured confounding', abstract: 'We study backdoor adjustment.',
    year: 2026, url: 'https://example.org/p1', doi: '10.1/x' }];
  const plan = planResearch(papers);
  assert.ok(plan.proposals.some(p => p.id === 'arp-causal-inference'));
});

test('the day runs every tool itself, with the fixed budget, and records a failing stage without stopping', async () => {
  const calls = [];
  const day = await runLiteratureDay({ KEEP: 'x' }, { date: '2026-10-24', now: '2026-10-24T09:41:00.000Z',
    pipeline: async env => { calls.push(['pipeline', env.RESEARCH_AREA, env.PIPELINE_MODEL_BUDGET, env.RESEARCH_DASHBOARD_ENABLED, env.KEEP]); return pipelineReport(); },
    tree: async env => { calls.push(['tree', env.RESEARCH_TREE_REPORT_ID]); return { status: 'review_required', review_queue: [{ rank: 1, branch_kind: 'replication', hypothesis: 'Replicate it' }] }; },
    novelty: async env => { calls.push(['novelty', env.PLANNER_REPORT_ID, env.RESEARCH_CANDIDATE_ID]); throw Error('no_openalex_seed'); },
    register: async () => [{ id: 'oraklet-dowhy-backdoor-001', experiment_id: 'dowhy-backdoor', research_question: 'Q', evidence_articles: 3, action: 'registered' }],
    labReports: async (env, since) => { calls.push(['lab', since]); return []; } });
  assert.deepEqual(calls, [['pipeline', fieldForDate('2026-10-24'), String(DAILY_MODEL_BUDGET), 'false', 'x'], ['tree', REPORT],
    ['novelty', REPORT, 'arp-causal-inference'], ['lab', '2026-10-23T09:41:00.000Z']]);
  assert.deepEqual(day.novelty, { status: 'error', code: 'no_openalex_seed' });
  assert.deepEqual(day.errors, ['novelty']);
  const none = await runLiteratureDay({}, { date: '2026-10-24', pipeline: async () => { throw Error('boom!'); },
    tree: () => assert.fail('no report, no tree'), novelty: () => assert.fail('no candidate, no novelty'),
    register: async () => [], labReports: async () => [] });
  assert.deepEqual(none.pipeline, { status: 'error', code: 'stage_failed' });
  assert.deepEqual(none.errors, ['pipeline']);
});

test('literature-backed catalog proposals are registered automatically; manual experiments wait for a person', async () => {
  const report = (id, ids) => ({ id, planner: { proposals: ids.map(t => ({ id: 'arp-' + t, research_question: 'Q ' + t, evidence: [{ id: 'a1' }, { id: 'a2' }] })) } });
  const stored = new Map([['oraklet-ratfit-baseline-001', null]]), writes = [];
  const client = {
    getProblem: async id => { if (!stored.has(id)) throw Error('problem_not_found'); return stored.get(id); },
    putProblem: async p => { writes.push(p.id); return p; },
  };
  const { makeCatalogProblem } = await import('../research/problem-bank-create-catalog.mjs');
  stored.set('oraklet-ratfit-baseline-001', makeCatalogProblem({ id: 'oraklet-ratfit-baseline-001', experimentId: 'ratfit-baseline', domain: 'symbolic-regression', difficulty: 2 }));
  // A retired version is reported as retired, never counted as registered (the lab only sees active problems).
  stored.set('oraklet-ratfit-feedback-001', { ...makeCatalogProblem({ id: 'oraklet-ratfit-feedback-001', experimentId: 'ratfit-feedback', domain: 'symbolic-regression', difficulty: 2 }), status: 'retired' });
  const results = await registerLiteratureProblems(client, [report('00000000-0000-4000-8000-000000000001', ['causal-inference', 'symbolic-regression', 'fluid-state-estimation'])]);
  const by = Object.fromEntries(results.map(r => [r.experiment_id, r.action]));
  assert.equal(by['dowhy-backdoor'], 'registered');
  assert.equal(by['ratfit-baseline'], 'already_registered');
  assert.equal(by['ratfit-feedback'], 'retired');
  assert.equal(by['shallow-water-hybrid'], 'requires_human_approval');
  assert.deepEqual(writes, ['oraklet-dowhy-backdoor-001']);
  await assert.rejects(registerLiteratureProblems({ getProblem: async () => { throw Error('timeout'); } },
    [report('00000000-0000-4000-8000-000000000001', ['causal-inference'])]), /timeout/);
});

test('lab reports of the last day are read bounded and summarised without evidence', async () => {
  let url;
  const rows = [{ rapport: { experimentId: 'perturbseq-holdout', seed: '1', status: 'failed', executionStatus: 'completed',
    cases: [{ passed: true, evidence: { big: 1 } }, { passed: false }], baseline: { status: 'completed', summary: { pairs: 2, labPassed: 1, barePassed: 0 } } } }];
  const lab = await readRecentLabReports('key', '2026-10-23T09:41:00.000Z', async u => { url = u; return new Response(JSON.stringify(rows)); });
  assert.match(url, /skapad=gte\.2026-10-23T09%3A41%3A00\.000Z&order=skapad\.desc&limit=21$/);
  assert.equal(lab.truncated, false);
  const many = await readRecentLabReports('key', 'x', async () => new Response(JSON.stringify(Array(21).fill(rows[0]))));
  assert.deepEqual([many.runs.length, many.truncated], [20, true]);
  assert.deepEqual(lab.runs[0], { title: null, experimentId: 'perturbseq-holdout', seed: '1', status: 'failed', executionStatus: 'completed',
    createdAt: null, cases: 2, passed: 1, problemBank: null, baseline: { pairs: 2, labPassed: 1, barePassed: 0 } });
  await assert.rejects(readRecentLabReports('key', 'x', async () => new Response('', { status: 401 })), /lab_reports_unavailable/);
});

test('the ai-bus report counts what was saved and keeps literature and model text inert', () => {
  const md = renderAiBus({ date: '2026-10-24', field: 'Causal inference', model_budget: 10, pipeline: pipelineReport(), errors: ['novelty'],
    tree: { status: 'review_required', review_queue: [{ rank: 1, branch_kind: 'replication', hypothesis: 'Replicate <img src=x>' }] },
    novelty: { status: 'error', code: 'no_openalex_seed' },
    problem_bank: [{ id: 'oraklet-dowhy-backdoor-001', experiment_id: 'dowhy-backdoor', research_question: 'Q', evidence_articles: 3, action: 'registered' }],
    lab: { truncated: false, runs: [{ experimentId: 'perturbseq-holdout', seed: '1', status: 'failed', executionStatus: 'completed', cases: 3, passed: 0, baseline: { pairs: 3, labPassed: 0, barePassed: 0 } }] } });
  assert.match(md, /^# Professor Oraklets dag – 2026-10-24/);
  assert.match(md, /\*\*Fält i dag:\*\* Kausal inferens/);
  assert.match(md, /40 träffar hittade, 10 sammanfattningar arkiverade, 7 sammanfattningar analyserade, 1 citerade fynd\. Modellanrop: 7 av 10\./);
  assert.match(md, /1 nya problem registrerade automatiskt, 0 väntar på ditt godkännande/);
  assert.match(md, /\| perturbseq-holdout \| 1 \| failed \| 0 av 3 \| 0\/0 av 3 \|/);
  assert.match(md, /Nyhetskontrollen misslyckades \(no\\_openalex\\_seed\)/);
  assert.match(md, /Adjusted &lt;b&gt;estimates&lt;\/b&gt; \\\| differ/);
  assert.match(md, /Small samples limit \\`power\\` \\\| x/);
  assert.doesNotMatch(md, /<img|<b>/);
  assert.match(md, /\*\*Experiment senaste dygnet:\*\* 1 körningar/);
  assert.match(renderAiBus({ date: '2026-10-24', field: 'Causal inference', model_budget: 10, pipeline: {}, errors: [],
    lab: { truncated: true, runs: [] } }), /## Experiment de 20 senaste körningarna \(fler kördes\)/);
  assert.match(md, /inget här påstår en ny vetenskaplig upptäckt/);
});

test('main writes the dated and latest ai-bus files and the day record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'literature-day-')), cwd = process.cwd();
  process.chdir(dir);
  try {
    const day = await main({}, { now: '2026-10-24T09:41:00.000Z', deps: { pipeline: async () => pipelineReport({ candidate_id: null, candidate: null }),
      tree: async () => ({ status: 'insufficient_evidence', review_queue: [] }), novelty: () => assert.fail(),
      register: async () => [], labReports: async () => ({ runs: [], truncated: false }) } });
    assert.deepEqual(day.errors, []);
    const dated = await readFile(join(dir, 'ai-bus/2026-10-24.md'), 'utf8');
    assert.equal(await readFile(join(dir, 'ai-bus/senaste.md'), 'utf8'), dated);
    assert.match(dated, /Ingen kandidat med tillräckligt underlag i dag\./);
    assert.equal(JSON.parse(await readFile(join(dir, 'reports/literature-day/day.json'), 'utf8')).date, '2026-10-24');
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});
