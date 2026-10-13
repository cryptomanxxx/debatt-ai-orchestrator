// Links saved literature research candidates to existing catalog experiments in the same research
// area and proposes the matching Problem Bank entries for human review. Nothing is registered or run.
import { CATALOG } from './catalog.mjs';
import { CATALOG_DOMAINS } from './oraklet-propose-problems.mjs';
import { makeCatalogProblem } from './problem-bank-create-catalog.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const slug = id => id.replace(/[^a-z0-9-]/g, '-');

// A candidate's research area is its planner theme (arp-<theme>); catalog experiments carry the same
// domain labels. A shared area means a related, bounded method test, not a test of the reported gap.
export function catalogMatches(candidateId) {
  if (typeof candidateId !== 'string' || !/^arp-[a-z0-9-]{1,60}$/.test(candidateId)) return [];
  const theme = candidateId.slice(4);
  return CATALOG.filter(entry => CATALOG_DOMAINS[entry.id] === theme);
}

function candidateEvidence(candidate) {
  const ids = Array.isArray(candidate.evidence) ? candidate.evidence.map(e => e?.id).filter(id => typeof id === 'string') : [];
  return [...new Set(ids)].slice(0, 20);
}

export function literatureProblemProposals(reports, { existingProblemIds = [], limit = 5 } = {}) {
  if (!Array.isArray(reports)) throw new Error('invalid_literature_reports');
  if (!Array.isArray(existingProblemIds) || !existingProblemIds.every(id => typeof id === 'string'))
    throw new Error('invalid_existing_problem_ids');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('invalid_proposal_limit');
  const existing = new Set(existingProblemIds);
  const proposals = new Map();
  // Reports are read newest first; the newest supporting candidate wins for each experiment.
  for (const report of reports) {
    if (!report || !UUID.test(report.id ?? '') || !Array.isArray(report.planner?.proposals)) continue;
    for (const candidate of report.planner.proposals) {
      const evidence = candidateEvidence(candidate);
      if (!evidence.length || typeof candidate.research_question !== 'string') continue;
      for (const entry of catalogMatches(candidate.id)) {
        if (proposals.has(entry.id)) continue;
        const id = 'oraklet-' + slug(entry.id) + '-001';
        const problem = makeCatalogProblem({ id, experimentId: entry.id, domain: CATALOG_DOMAINS[entry.id], difficulty: 2 });
        proposals.set(entry.id, {
          id, version: problem.version, fingerprint: problem.fingerprint,
          experiment_id: entry.id, question: problem.question, domain: problem.domain,
          automatic: entry.automatic !== false,
          registered: existing.has(id),
          literature: {
            report_id: report.id, candidate_id: candidate.id,
            research_question: candidate.research_question.slice(0, 500),
            evidence_article_ids: evidence,
            gap_candidate_count: Array.isArray(candidate.gap_candidates) ? candidate.gap_candidates.length : 0
          },
          relation: 'same_research_area_not_gap_test',
          status: 'proposed_requires_human_approval'
        });
      }
    }
  }
  return [...proposals.values()].slice(0, limit);
}

const md = value => String(value).replace(/[\\`*_[\]<>|]/g, '\\$&').replace(/\s+/g, ' ');

export function renderLiteratureProposals(proposals) {
  const lines = ['## Litteraturgrundade förslag (ej registrerade)', ''];
  if (!proposals.length) {
    lines.push('Inga sparade litteraturkandidater ligger i samma forskningsområde som ett katalogexperiment.', '');
    return lines.join('\n');
  }
  proposals.forEach((p, i) => {
    lines.push(`### ${i + 1}. ${p.id}`, '',
      `**Experiment:** \`${p.experiment_id}\`${p.automatic ? '' : ' (endast manuellt)'}  `,
      `**Fråga:** ${md(p.question)}  `,
      `**Litteraturkandidat:** ${md(p.literature.research_question)} (\`${p.literature.candidate_id}\`, rapport \`${p.literature.report_id}\`)  `,
      `**Underlag:** ${p.literature.evidence_article_ids.length} artiklar, ${p.literature.gap_candidate_count} rapporterade begränsningar att granska  `,
      `**Status i Problem Bank:** ${p.registered ? 'redan registrerad; kan köras med problem_bank_id ' + p.id : 'inte registrerad; registreras manuellt via workflowet problem-bank-create'}  `,
      `**Fingerprint:** \`${p.fingerprint}\``, '');
  });
  lines.push('Kopplingen gäller samma forskningsområde. Katalogexperimentet är ett avgränsat metodtest och prövar inte den rapporterade begränsningen eller forskningsluckan. Inget har registrerats eller körts; granska underlaget före registrering.', '');
  return lines.join('\n');
}
