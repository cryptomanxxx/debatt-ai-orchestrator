import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogMatches, literatureProblemProposals, renderLiteratureProposals } from '../research/literature-problem-proposals.mjs';
import { makeCatalogProblem } from '../research/problem-bank-create-catalog.mjs';
import { main } from '../research/run-oraklet-proposals.mjs';

const report = (id, proposals) => ({ id, schema_version: 'literature-evidence-1', planner: { proposals } });
const candidate = (theme, evidence = ['a1', 'a2'], extra = {}) => ({
  id: 'arp-' + theme, research_question: 'Does the reported method hold up? `x` | y',
  evidence: evidence.map(id => ({ id })), gap_candidates: [{ id: 'g1' }], ...extra
});
const NEW = '00000000-0000-4000-8000-000000000002', OLD = '00000000-0000-4000-8000-000000000001';

test('candidates map to catalog experiments only through a shared research area', () => {
  assert.deepEqual(catalogMatches('arp-symbolic-regression').map(e => e.id), ['ratfit-baseline', 'ratfit-feedback']);
  assert.deepEqual(catalogMatches('arp-fluid-state-estimation').map(e => e.id), ['shallow-water-hybrid']);
  for (const id of ['arp-reproducibility', 'arp-experiment-design', 'symbolic-regression', 'arp-../x', null]) assert.deepEqual(catalogMatches(id), []);
});

test('proposals reuse the catalog problem identity, keep the newest evidence and need human approval', () => {
  const proposals = literatureProblemProposals([
    report(NEW, [candidate('fluid-state-estimation', ['n1']), candidate('reproducibility')]),
    report(OLD, [candidate('fluid-state-estimation', ['o1']), candidate('symbolic-regression', [])]),
    { id: 'not-a-uuid', planner: { proposals: [candidate('symbolic-regression')] } }
  ], { existingProblemIds: ['oraklet-shallow-water-hybrid-001'] });
  assert.equal(proposals.length, 1);
  const [p] = proposals;
  const expected = makeCatalogProblem({ id: 'oraklet-shallow-water-hybrid-001', experimentId: 'shallow-water-hybrid',
    domain: 'fluid-state-estimation', difficulty: 2 });
  assert.equal(p.fingerprint, expected.fingerprint);
  assert.equal(p.question, expected.question);
  assert.equal(p.registered, true);
  assert.equal(p.automatic, false);
  assert.equal(p.status, 'proposed_requires_human_approval');
  assert.equal(p.relation, 'same_research_area_not_gap_test');
  assert.deepEqual(p.literature.evidence_article_ids, ['n1']);
  assert.equal(p.literature.report_id, NEW);
  assert.throws(() => literatureProblemProposals('x'));
  assert.throws(() => literatureProblemProposals([], { limit: 0 }));
  assert.throws(() => literatureProblemProposals([], { existingProblemIds: [1] }));
});

test('rendering escapes untrusted literature text and states the limits of the link', () => {
  const markdown = renderLiteratureProposals(literatureProblemProposals([report(NEW, [candidate('symbolic-regression')])]));
  assert.match(markdown, /prövar inte den rapporterade begränsningen/);
  assert.match(markdown, /\\`x\\` \\\| y/);
  assert.match(renderLiteratureProposals([]), /Inga sparade litteraturkandidater/);
});

test('proposal workflow reads saved literature reports and reports registration status without writing', async () => {
  const registered = makeCatalogProblem({ id: 'oraklet-ratfit-baseline-001', experimentId: 'ratfit-baseline',
    domain: 'symbolic-regression', difficulty: 2 });
  const writes = [];
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    if (options.method && options.method !== 'GET') writes.push(u.pathname);
    if (u.pathname === '/rest/v1/literature_planner_run') {
      assert.equal(u.searchParams.get('limit'), '10');
      return Response.json([{ report: report(NEW, [candidate('symbolic-regression')]) }]);
    }
    if (u.pathname === '/rest/v1/research_problem')
      return Response.json(u.searchParams.get('id') === 'eq.' + registered.id ? [{ ...registered, status: 'active' }] : []);
    throw new Error('Unexpected request ' + u.pathname);
  };
  const logs = [], original = console.log, cwd = process.cwd();
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const dir = await mkdtemp((await import('node:os')).tmpdir() + '/proposals-');
  console.log = line => logs.push(line);
  try {
    process.chdir(dir);
    await main({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'secret' }, fetchImpl);
    const markdown = await readFile('oraklet-proposals.md', 'utf8');
    assert.match(markdown, /Litteraturgrundade förslag/);
    assert.match(markdown, /oraklet-ratfit-baseline-001[\s\S]*redan registrerad/);
  } finally { console.log = original; process.chdir(cwd); }
  assert.deepEqual(writes, []);
  const summary = JSON.parse(logs.at(-1));
  assert.ok(summary.literature_proposal_ids.includes('oraklet-ratfit-baseline-001'));
  assert.equal(summary.registered, false);
});
