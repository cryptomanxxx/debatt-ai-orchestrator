import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { terms, relevance, candidateSeeds, noveltyCheck, renderNovelty, createOpenAlexGraph, main, LIMITS, OVERLAP_THRESHOLD } from '../research/citation-novelty.mjs';

const REPORT_ID = '6f14d7f6-de91-4c84-8dc7-169798dccd69';
const report = {
  id: REPORT_ID,
  papers: [
    { article_id: 'a1', title: 'PINN state estimation for shallow water', content: { resolved_openalex_id: 'https://openalex.org/W100' },
      findings: [{ kind: 'limitation', claim: 'Sparse sensors limit velocity reconstruction' }] },
    { article_id: 'a2', title: 'Kalman filtering for channels', lookup_identifiers: { openalex_records: [{ source_id: 'https://openalex.org/W200' }] } },
    { article_id: 'a3', title: 'No identity' },
    { article_id: 'other', content: { resolved_openalex_id: 'https://openalex.org/W999' } }],
  planner: { proposals: [{ id: 'arp-fluid-state-estimation', research_question: 'Can physics informed networks reconstruct shallow water velocity from sparse sensors?',
    evidence: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] }] } };

function fakeGraph(citations, works) {
  let requests = 0; const asked = [];
  return { get requests() { return requests; }, asked,
    async work(id) { requests++; return works[id] ?? null; },
    async citing(id) { requests++; asked.push(id); return citations[id] ?? []; } };
}
const W = (n, title, year = 2025, cited = 1) => ({ openalex_id: 'https://openalex.org/W' + n, title, year, cited_by_count: cited });

test('terms and relevance are deterministic title overlaps', () => {
  const t = terms('Can physics informed networks reconstruct velocity?', 'Sparse sensors');
  assert.deepEqual(t, ['physics', 'informed', 'networks', 'reconstruct', 'velocity', 'sparse', 'sensors']);
  assert.equal(relevance('Physics-informed networks for velocity', t), 0.667);
  assert.equal(relevance('Unrelated biology', t), 0);
  assert.equal(relevance(null, t), 0);
  // Only the six scored terms count: terms beyond them can neither reach the threshold nor saturate it.
  const many = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b1', 'b2', 'b3'];
  assert.equal(relevance('b1 b2 b3', many), 0);
  assert.equal(relevance('a1 a2 a3 b1 b2 b3', many), 0.5);
});

test('seeds are the candidate evidence papers with an OpenAlex identity', () => {
  const { seeds, terms: t } = candidateSeeds(report, 'arp-fluid-state-estimation');
  assert.deepEqual(seeds.map(s => s.openalex_id), ['https://openalex.org/W100', 'https://openalex.org/W200']);
  assert.ok(t.includes('sparse'), 'limitation claims add terms');
  assert.throws(() => candidateSeeds(report, 'arp-missing'), /candidate_not_found/);
});

test('the search follows the most relevant citing works and flags a possible overlap', async () => {
  const works = { 'https://openalex.org/W100': W(100, 'PINN state estimation', 2022), 'https://openalex.org/W200': W(200, 'Kalman channels', 2021) };
  const citations = {
    'https://openalex.org/W100': [W(301, 'Gardening notes', 2024), W(302, 'Physics informed networks reconstruct velocity from sparse sensors', 2025, 40), W(100, 'self loop', 2023)],
    'https://openalex.org/W200': [W(401, 'Kalman filters for sparse sensors', 2024)],
    'https://openalex.org/W302': [W(501, 'Shallow water velocity reconstruction with sparse sensors', 2026)] };
  const graph = fakeGraph(citations, works);
  const r = await noveltyCheck(report, 'arp-fluid-state-estimation', graph);
  assert.equal(r.schema_version, 'citation-novelty-1');
  assert.equal(r.novelty.status, 'possible_overlap_found');
  assert.deepEqual(r.leads.slice(0, 2).map(l => [l.openalex_id, l.relevance]), [['https://openalex.org/W302', 0.667], ['https://openalex.org/W501', 0.333]],
    'only the six scored terms count, so the closer title leads');
  assert.equal(r.novelty.strongest.openalex_id, 'https://openalex.org/W302');
  assert.ok(r.novelty.strongest.relevance >= OVERLAP_THRESHOLD);
  assert.ok(r.leads.some(l => l.openalex_id === 'https://openalex.org/W501' && l.depth === 3), 'second citation step is explored');
  assert.ok(!r.leads.some(l => l.openalex_id === 'https://openalex.org/W100'), 'seeds and loops are not leads');
  assert.ok(r.search.evaluated_nodes <= LIMITS.maxNodes);
  assert.ok(graph.asked.indexOf('https://openalex.org/W302') < graph.asked.indexOf('https://openalex.org/W401') || !graph.asked.includes('https://openalex.org/W401'),
    'the most relevant citing work is expanded first');
  assert.match(renderNovelty(r), /Möjlig överlappning hittad/);
});

test('no relevant later work means no overlap within budget, never proven novelty', async () => {
  const works = { 'https://openalex.org/W100': W(100, 'PINN', 2022), 'https://openalex.org/W200': W(200, 'Kalman', 2021) };
  const r = await noveltyCheck(report, 'arp-fluid-state-estimation', fakeGraph({ 'https://openalex.org/W100': [W(301, 'Gardening', 2024)] }, works));
  assert.equal(r.novelty.status, 'no_overlap_found_within_budget');
  assert.match(renderNovelty(r), /bevisar inte att frågan är ny/);
  await assert.rejects(noveltyCheck(report, 'arp-fluid-state-estimation', fakeGraph({}, {})), /no_openalex_seed/);
});

test('merged seeds are searched once, titleless seeds stay, and an undated seed disables the year cutoff', async () => {
  // Both evidence IDs resolve to the same canonical work, which has no OpenAlex title.
  const canonical = { openalex_id: 'https://openalex.org/W100', title: null, year: null, cited_by_count: 0 };
  const graph = fakeGraph({ 'https://openalex.org/W100': [W(701, 'Physics informed networks reconstruct shallow water', 2005)] },
    { 'https://openalex.org/W100': canonical, 'https://openalex.org/W200': canonical });
  const r = await noveltyCheck(report, 'arp-fluid-state-estimation', graph);
  assert.deepEqual(r.seeds.map(s => [s.openalex_id, s.title]), [['https://openalex.org/W100', 'PINN state estimation for shallow water']]);
  assert.deepEqual(r.leads.map(l => l.openalex_id), ['https://openalex.org/W701'], 'an old work citing an undated seed is kept');
  assert.match(r.limitations[1], /2 citation steps from the seeds/);
});

test('an undated citing work stays a review lead', async () => {
  const works = { 'https://openalex.org/W100': W(100, 'PINN', 2022), 'https://openalex.org/W200': W(200, 'Kalman', 2021) };
  const undated = W(601, 'Physics informed networks reconstruct shallow water', null);
  const r = await noveltyCheck(report, 'arp-fluid-state-estimation', fakeGraph({ 'https://openalex.org/W100': [undated, W(602, 'Physics informed networks', 2010)] }, works));
  assert.deepEqual(r.leads.map(l => [l.openalex_id, l.year]), [['https://openalex.org/W601', null]], 'undated kept; older than every seed dropped');
  assert.equal(r.novelty.status, 'possible_overlap_found');
  assert.match(renderNovelty(r), /\| \? \|/);
});

test('the OpenAlex client builds bounded citation requests', async () => {
  const urls = [];
  const graph = createOpenAlexGraph({ pause: async () => {}, apiKey: 'k', fetchImpl: async (url, options) => {
    urls.push(String(url)); assert.equal(options.headers.Authorization, 'Bearer k');
    return String(url).includes('filter=')
      ? Response.json({ results: [{ id: 'https://openalex.org/W5', display_name: 'T', publication_year: 2024, cited_by_count: 3 }, { id: 'bad' }] })
      : Response.json({ id: 'https://openalex.org/W1', display_name: 'Seed', publication_year: 2020 });
  } });
  assert.deepEqual(await graph.work('https://openalex.org/W1'), { openalex_id: 'https://openalex.org/W1', title: 'Seed', year: 2020, cited_by_count: 0 });
  assert.deepEqual((await graph.citing('https://openalex.org/W1')).map(w => w.openalex_id), ['https://openalex.org/W5']);
  assert.match(urls[1], /filter=cites%3AW1%2Cis_retracted%3Afalse&sort=publication_date%3Adesc&per-page=25/);
  for (let i = 0; i < 1 + LIMITS.seeds + LIMITS.maxNodes - 2; i++) await graph.work('https://openalex.org/W1');
  await assert.rejects(graph.work('https://openalex.org/W1'), /openalex_request_budget_exceeded/);
  // A merged work redirects to its canonical OpenAlex record; a redirect off the API is refused.
  const redirected = (url, body) => Object.defineProperty(Response.json(body), 'url', { value: url });
  const merged = createOpenAlexGraph({ pause: async () => {}, fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'follow');
    return redirected('https://api.openalex.org/works/W9', { id: 'https://openalex.org/W9', display_name: 'Canonical', publication_year: 2021 });
  } });
  assert.equal((await merged.work('https://openalex.org/W1')).openalex_id, 'https://openalex.org/W9');
  const offsite = createOpenAlexGraph({ pause: async () => {}, fetchImpl: async () => redirected('https://example.com/x', {}) });
  await assert.rejects(offsite.work('https://openalex.org/W1'), /openalex_redirect_offsite/);
  const failing = createOpenAlexGraph({ pause: async () => {}, fetchImpl: async () => new Response('x', { status: 429 }) });
  await assert.rejects(failing.citing('https://openalex.org/W1'), /openalex_http_429/);
});

test('main reads the saved report, searches and writes the artifact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'novelty-'));
  try {
    const fetchImpl = async url => {
      const u = String(url);
      if (u.includes('supabase.co')) return Response.json([{ id: REPORT_ID, report }]);
      if (u.includes('filter=')) return Response.json({ results: [] });
      const id = u.match(/works\/(W\d+)/)[1];
      return Response.json({ id: 'https://openalex.org/' + id, display_name: 'Seed ' + id, publication_year: 2022 });
    };
    await main({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', PLANNER_REPORT_ID: REPORT_ID,
      RESEARCH_CANDIDATE_ID: 'arp-fluid-state-estimation' }, { directory: dir, fetchImpl });
    const saved = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
    assert.equal(saved.novelty.status, 'no_overlap_found_within_budget');
    assert.equal(saved.seeds.length, 2);
    assert.match(await readFile(join(dir, 'report.md'), 'utf8'), /Nyhetskontroll via citeringsgraf/);
    await assert.rejects(main({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', PLANNER_REPORT_ID: REPORT_ID,
      RESEARCH_CANDIDATE_ID: 'Bad id' }, { directory: dir, fetchImpl }), /invalid_candidate_id/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
