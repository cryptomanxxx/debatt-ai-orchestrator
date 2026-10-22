// Citation-graph novelty check for one research candidate of a saved evidence report.
// Bounded best-first tree search (agentic-tree-search.mjs) over OpenAlex: each node is a work,
// its children are the works citing it, ranked by how many of the candidate's specific terms their
// titles share. No model calls, no database writes. It looks for later work that may already
// address the candidate's question; finding none within the budget does not establish novelty.
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { agenticTreeSearch } from './agentic-tree-search.mjs';
import { createFollowUpClient } from './literature-follow-up.mjs';
import { boundedJson } from './literature-evidence.mjs';

export const LIMITS = Object.freeze({ maxNodes: 12, maxDepth: 3, maxChildren: 4, seeds: 4, seedCandidates: 8, citingPerWork: 100 });
export const OVERLAP_THRESHOLD = 0.5;
const WORK = /^https:\/\/openalex\.org\/(W\d{1,15})$/;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'can', 'does', 'how', 'which', 'under', 'into',
  'using', 'based', 'its', 'their', 'when', 'what', 'between', 'via', 'new', 'study', 'approach', 'approaches', 'method', 'methods',
  'model', 'models', 'improve', 'improves', 'improved', 'improving', 'held', 'out', 'earlier', 'require', 'requires', 'required',
  'enough', 'whether', 'existing', 'current', 'better', 'more', 'less', 'than', 'such', 'also', 'other', 'these', 'those', 'over',
  'still', 'only', 'remain', 'remains', 'given', 'well']);

// Light stemming for title matching: a plural s is dropped and long words compare on six letters,
// so estimator/estimation and physics/physical match while short words stay exact.
export function stem(word) {
  const w = word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
  return w.length > 6 ? w.slice(0, 6) : w;
}
const stems = text => new Set((typeof text === 'string' ? text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [] : []).map(stem));

export function terms(...texts) {
  const words = texts.filter(t => typeof t === 'string').join(' ').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set();
  return words.filter(w => w.length > 2 && !STOP.has(w) && !seen.has(stem(w)) && seen.add(stem(w))).slice(0, 16);
}
// The scored terms: the candidate's terms that every seed title already contains name the shared
// field (every citing work matches them), so they are left out; at most six, research question first.
export function scoringTerms(candidateTerms, seedTitles) {
  const titles = seedTitles.filter(t => typeof t === 'string').map(stems);
  const specific = candidateTerms.filter(t => !titles.length || !titles.every(s => s.has(stem(t))));
  return (specific.length ? specific : candidateTerms).slice(0, 6);
}
// Share of the scored terms that a title contains.
export function relevance(title, scoredTerms) {
  const scored = scoredTerms.slice(0, 6);
  if (typeof title !== 'string' || !scored.length) return 0;
  const words = stems(title);
  return Math.round(scored.filter(t => words.has(stem(t))).length / scored.length * 1000) / 1000;
}

// Seeds: the candidate's evidence papers with a resolvable OpenAlex identity.
export function candidateSeeds(report, candidateId) {
  const candidate = report?.planner?.proposals?.find(p => p?.id === candidateId);
  if (!candidate || typeof candidate.research_question !== 'string' || !Array.isArray(candidate.evidence)) throw Error('candidate_not_found');
  const ids = new Set(candidate.evidence.map(e => e?.id));
  const seeds = [];
  for (const paper of report.papers ?? []) {
    // More candidates than seeds: merged OpenAlex records can collapse several into one work.
    if (!ids.has(paper?.article_id) || seeds.length >= LIMITS.seedCandidates) continue;
    const id = [paper.content?.resolved_openalex_id, paper.lookup_identifiers?.openalex_records?.[0]?.source_id].find(v => WORK.test(v ?? ''));
    if (id) seeds.push({ article_id: paper.article_id, openalex_id: id, title: typeof paper.title === 'string' ? paper.title.slice(0, 300) : null });
  }
  const limitations = (report.papers ?? []).filter(p => ids.has(p?.article_id)).flatMap(p => p.findings ?? [])
    .filter(f => f?.kind === 'limitation' && typeof f.claim === 'string').map(f => f.claim);
  return { candidate, seeds, terms: terms(candidate.research_question, ...limitations.slice(0, 2)) };
}

// OpenAlex: the newest works citing one work, titles and years only (one request per expansion).
export function createOpenAlexGraph({ fetchImpl = fetch, apiKey = '', pause = () => new Promise(r => setTimeout(r, 200)) } = {}) {
  let requests = 0;
  async function get(url) {
    if (++requests > 1 + LIMITS.seedCandidates + LIMITS.maxNodes) throw Error('openalex_request_budget_exceeded');
    await pause();
    // A merged OpenAlex work redirects to its canonical record; only redirects within the API are followed.
    const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {} });
    if (response.url && new URL(response.url).origin !== 'https://api.openalex.org') { await response.body?.cancel(); throw Error('openalex_redirect_offsite'); }
    if (!response.ok) { await response.body?.cancel(); throw Error('openalex_http_' + response.status); }
    return boundedJson(response, 2_000_000);
  }
  // OpenAlex allows a null title; the work is kept (its ID still leads to citing works) and scores 0.
  const work = w => WORK.test(w?.id ?? '')
    ? { openalex_id: w.id, title: typeof w.display_name === 'string' ? w.display_name.slice(0, 300) : null, year: Number.isInteger(w.publication_year) ? w.publication_year : null,
      cited_by_count: Number.isInteger(w.cited_by_count) ? w.cited_by_count : 0 } : null;
  return {
    get requests() { return requests; },
    async work(id) {
      const url = new URL('https://api.openalex.org/works/' + id.match(WORK)[1]);
      url.searchParams.set('select', 'id,display_name,publication_year,cited_by_count');
      // A deleted or merged-away ID answers 404: that seed is unavailable, the others are still searched.
      try { return work(await get(url)); } catch (error) { if (error.message === 'openalex_http_404') return null; throw error; }
    },
    async citing(id) {
      const url = new URL('https://api.openalex.org/works');
      // Retracted works never become leads.
      url.searchParams.set('filter', `cites:${id.match(WORK)[1]},is_retracted:false`);
      url.searchParams.set('sort', 'publication_date:desc');
      url.searchParams.set('per-page', String(LIMITS.citingPerWork));
      url.searchParams.set('select', 'id,display_name,publication_year,cited_by_count');
      const data = await get(url);
      return (Array.isArray(data?.results) ? data.results : []).map(work).filter(Boolean);
    },
  };
}

export async function noveltyCheck(report, candidateId, graph) {
  const { candidate, seeds, terms: candidateTerms } = candidateSeeds(report, candidateId);
  if (!seeds.length) throw Error('no_openalex_seed');
  const works = new Map(); // action id -> work
  const actionId = w => w.openalex_id.match(WORK)[1].toLowerCase();
  const seedWorks = [];
  for (const seed of seeds) {
    if (seedWorks.length >= LIMITS.seeds) break;
    const resolved = await graph.work(seed.openalex_id);
    // Merged records redirect to one canonical work; each canonical seed is searched once.
    if (!resolved || works.has(actionId(resolved))) continue;
    const w = { ...resolved, title: resolved.title ?? seed.title };
    seedWorks.push({ ...w, article_id: seed.article_id }); works.set(actionId(w), { ...w, seed: true });
  }
  if (!seedWorks.length) throw Error('no_openalex_seed');
  const scored = scoringTerms(candidateTerms, seedWorks.map(w => w.title));
  const seen = new Set(seedWorks.map(w => w.openalex_id));
  const search = await agenticTreeSearch({ ...LIMITS,
    expand: async node => {
      if (node.depth === 0) return seedWorks.slice(0, LIMITS.maxChildren).map(w => ({ id: actionId(w), label: (w.title ?? w.openalex_id).slice(0, 120) }));
      const parent = works.get(node.actionId);
      const citing = (await graph.citing(parent.openalex_id)).filter(w => !seen.has(w.openalex_id))
        .map(w => ({ ...w, relevance: relevance(w.title, scored) }))
        .sort((a, b) => b.relevance - a.relevance || (b.year ?? 0) - (a.year ?? 0) || b.cited_by_count - a.cited_by_count)
        .slice(0, LIMITS.maxChildren);
      for (const w of citing) { seen.add(w.openalex_id); works.set(actionId(w), w); }
      return citing.map(w => ({ id: actionId(w), label: (w.title || w.openalex_id).slice(0, 120) || w.openalex_id }));
    },
    // The score only orders the search; a title match is never treated as verification.
    evaluate: async node => {
      const w = works.get(node.actionId);
      return { score: relevance(w.title, scored), verified: false, result: { openalex_id: w.openalex_id, year: w.year } };
    } });
  // With an undated seed no work can be shown to predate every seed, so the cutoff is then off.
  const earliestSeedYear = seedWorks.some(w => w.year === null) ? -Infinity : Math.min(...seedWorks.map(w => w.year));
  const leads = search.trace.map(n => ({ ...works.get(n.actionId), depth: n.depth, relevance: n.score }))
    // Undated works stay as review leads; a dated work older than every seed cannot be later work.
    .filter(w => !w.seed && (w.year === null || !Number.isFinite(earliestSeedYear) || w.year >= earliestSeedYear))
    .sort((a, b) => b.relevance - a.relevance || (b.year ?? 0) - (a.year ?? 0)).slice(0, 10)
    .map(({ seed, ...w }) => w);
  const strongest = leads[0] ?? null;
  return { schema_version: 'citation-novelty-1', parent_report_id: report.id, candidate_id: candidateId,
    research_question: candidate.research_question.slice(0, 2000), terms: candidateTerms, scored_terms: scored, seeds: seedWorks,
    search: { algorithm: search.algorithm, limits: search.limits, evaluated_nodes: search.evaluatedNodes, exhausted: search.exhausted,
      openalex_requests: graph.requests, trace: search.trace.map(n => ({ id: n.id, depth: n.depth, score: n.score, openalex_id: n.result?.openalex_id ?? null })) },
    leads,
    novelty: { status: strongest && strongest.relevance >= OVERLAP_THRESHOLD ? 'possible_overlap_found' : 'no_overlap_found_within_budget',
      threshold: OVERLAP_THRESHOLD, strongest },
    limitations: ['Titles only: a shared-term score is a review lead, not evidence that a work answers the question.',
      `Bounded search: at most ${LIMITS.maxNodes} works, ${LIMITS.maxDepth - 1} citation steps from the seeds and ${LIMITS.maxChildren} newest-relevant citing works per step; uncovered work is not ruled out.`,
      'OpenAlex coverage and citation links are incomplete. No model calls, full texts or database writes.'] };
}

const md = v => String(v ?? '').replace(/[\\`*_[\]<>|]/g, '\\$&').replace(/\s+/g, ' ');
export function renderNovelty(r) {
  const status = r.novelty.status === 'possible_overlap_found' ? 'Möjlig överlappning hittad – granska ledtrådarna nedan.' : 'Ingen överlappning hittad inom sökbudgeten. Detta bevisar inte att frågan är ny.';
  return ['# Nyhetskontroll via citeringsgraf', '', `**Kandidat:** \`${r.candidate_id}\` (rapport \`${r.parent_report_id}\`)  `, `**Fråga:** ${md(r.research_question)}  `,
    `**Status:** ${status}  `, `**Sökning:** ${r.search.evaluated_nodes} verk, ${r.search.openalex_requests} OpenAlex-anrop, räknade termer: ${md(r.scored_terms.join(', '))} (av ${md(r.terms.join(', '))})`, '',
    '## Utgångsartiklar', '', ...r.seeds.map(s => `- ${md(s.title ?? s.openalex_id)} (${s.year ?? '?'}, ${s.openalex_id})`), '',
    '## Senare verk att granska', '', '| Relevans | År | Titel | Citeringar | Steg |', '| ---: | ---: | --- | ---: | ---: |',
    ...(r.leads.length ? r.leads.map(l => `| ${l.relevance} | ${l.year ?? '?'} | [${md(l.title ?? l.openalex_id)}](${l.openalex_id}) | ${l.cited_by_count} | ${l.depth} |`) : ['| – | – | Inga citerande verk hittades | – | – |']),
    '', ...r.limitations.map(l => `- ${l}`), ''].join('\n');
}

export async function main(env = process.env, { directory = 'reports/citation-novelty', fetchImpl = fetch } = {}) {
  const client = createFollowUpClient({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, fetchImpl });
  const report = await client.readReport(env.PLANNER_REPORT_ID);
  if (typeof env.RESEARCH_CANDIDATE_ID !== 'string' || !/^arp-[a-z0-9-]{1,80}$/.test(env.RESEARCH_CANDIDATE_ID)) throw Error('invalid_candidate_id');
  const result = await noveltyCheck(report, env.RESEARCH_CANDIDATE_ID, createOpenAlexGraph({ fetchImpl, apiKey: env.OPENALEX_API_KEY || '' }));
  const markdown = renderNovelty(result);
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/report.json', JSON.stringify(result, null, 2));
  await writeFile(directory + '/report.md', markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown);
  console.log(JSON.stringify({ ok: true, candidate_id: result.candidate_id, status: result.novelty.status, leads: result.leads.length, requests: result.search.openalex_requests }));
}

if (process.argv[1]?.endsWith('/citation-novelty.mjs')) main().catch(error => { console.error(error.message); process.exitCode = 1; });
