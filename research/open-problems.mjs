// Open research problems for the daily lab: registered (human-approved) active Problem Bank entries
// that map to an automatic catalog experiment, marked with the saved literature candidate that
// supports them. The lab may attach its run to one; registration itself stays a manual step.
import { createProblemBankClient } from './problem-bank.mjs';
import { readRecentLiteratureReports } from './run-oraklet-proposals.mjs';
import { literatureProblemProposals } from './literature-problem-proposals.mjs';

export const MAX_OPEN_PROBLEMS = 8;

export function openResearchProblems(problems, literatureReports, catalog) {
  if (!Array.isArray(problems)) return [];
  const literature = new Map();
  try {
    for (const p of literatureProblemProposals(Array.isArray(literatureReports) ? literatureReports : [], { limit: 20 }))
      literature.set(p.experiment_id, p.literature);
  } catch { /* Literature only ranks problems; it never blocks them. */ }
  const seen = new Set();
  const open = [];
  for (const problem of problems) {
    const entry = catalog.find(e => e.id === problem?.source?.experiment_id);
    // Same contract as the manual Problem Bank runner: the problem asks exactly the catalog question.
    if (!entry || entry.automatic === false || problem.status !== 'active' || problem.question !== entry.question) continue;
    if (seen.has(problem.id)) continue; // newest version first (ordered by the client)
    seen.add(problem.id);
    const support = literature.get(entry.id);
    open.push({ problem, summary: Object.freeze({ problemBankId: problem.id, version: problem.version, experimentId: entry.id,
      literature: support ? { researchQuestion: support.research_question.slice(0, 300), articles: support.evidence_article_ids.length,
        reportedLimitations: support.gap_candidate_count } : null }) });
  }
  // Literature-supported problems first, then by id, so the bounded list keeps the best-grounded ones.
  open.sort((a, b) => Number(!!b.summary.literature) - Number(!!a.summary.literature) || a.problem.id.localeCompare(b.problem.id, 'en'));
  return open.slice(0, MAX_OPEN_PROBLEMS);
}

// Every Problem Bank request of the lab (listing, run start and finish) is bounded, so a hanging
// database cannot hold the daily run until the job times out.
const bounded = fetchImpl => (url, options = {}) => fetchImpl(url, { ...options, signal: options.signal ?? AbortSignal.timeout(15000) });

// Problem Bank or literature outages only mean no open problems: the lab plans as before.
export async function loadOpenProblems(env, catalog, fetchImpl = fetch) {
  const none = { client: null, open: [] };
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return none;
    const client = createProblemBankClient({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, fetchImpl: bounded(fetchImpl) });
    const problems = await client.listActiveProblems();
    let reports = [];
    try { reports = await readRecentLiteratureReports({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, fetchImpl }); }
    catch { /* Problems stay eligible without literature context. */ }
    return { client, open: openResearchProblems(problems, reports, catalog) };
  } catch { return none; }
}
