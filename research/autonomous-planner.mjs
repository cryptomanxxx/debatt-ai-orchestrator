// Autonomous Research Planner v0.1: reproducible, offline literature-to-proposal baseline.
// No claim of novelty is made without independent literature review.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const THEMES = [
  { pattern: /symbolic regression|equation discover|rational function/i, theme: 'symbolic-regression', question: 'Does targeted measurement selection reduce incorrect symbolic hypotheses?', method: 'Compare passive observations against active selection with hidden holdouts and matched model-call budgets.' },
  { pattern: /hypothes|scientific discovery|research agent|autonomous research/i, theme: 'autonomous-research', question: 'Does evidence-grounded hypothesis selection outperform a fixed research catalog on held-out scientific tasks?', method: 'Compare fixed-catalog and literature-grounded planning with blinded expert ratings and equal budgets.' },
  { pattern: /experiment design|active learning|information gain|bayesian optimization/i, theme: 'experiment-design', question: 'Does uncertainty-aware experiment selection improve information gained per unit of compute?', method: 'Compare uncertainty-based selection against random and fixed-order baselines on identical synthetic benchmarks.' },
  { pattern: /replicat|reproducib|benchmark|evaluation/i, theme: 'reproducibility', question: 'How often do reported agent-science results reproduce under independent reruns?', method: 'Pre-register acceptance criteria, rerun public benchmarks with fixed versions and compare effect sizes.' },
];
const DEFAULT_THEME = { theme: 'literature-methods', question: 'Which reported method remains robust under a matched, independent replication?', method: 'Select a fully specified public benchmark and reproduce it against its published baseline.' };
const normalize = value => typeof value === 'string' ? value.trim() : '';
const unique = values => [...new Set(values)];

export function validateCorpus(corpus) {
  if (!Array.isArray(corpus) || corpus.length === 0) throw new Error('Corpus must be a non-empty JSON array');
  const seen = new Set();
  return corpus.map((paper, index) => {
    if (!paper || typeof paper !== 'object' || Array.isArray(paper)) throw new Error(`Paper ${index} must be an object`);
    const id = normalize(paper.id), title = normalize(paper.title), abstract = normalize(paper.abstract);
    const url = normalize(paper.url), year = paper.year;
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && Boolean(parsed.hostname) && !/\\s/.test(url); } catch { /* invalid source URL */ }
    if (!id || !title || !abstract || !validUrl) throw new Error(`Paper ${index} requires id, title, abstract and HTTPS url`);
    if (seen.has(id)) throw new Error(`Duplicate paper id: ${id}`);
    if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 2100)) throw new Error(`Invalid year for ${id}`);
    seen.add(id);
    return { id, title, abstract, url, ...(year === undefined ? {} : { year }) };
  });
}

export function planResearch(input, { maxProposals = 10 } = {}) {
  const papers = validateCorpus(input);
  if (!Number.isInteger(maxProposals) || maxProposals < 1 || maxProposals > 100) throw new Error('maxProposals must be 1..100');
  const groups = new Map();
  for (const paper of papers) {
    const text = `${paper.title} ${paper.abstract}`;
    const match = THEMES.find(item => item.pattern.test(text)) ?? DEFAULT_THEME;
    const group = groups.get(match.theme) ?? { ...match, papers: [] };
    group.papers.push(paper);
    groups.set(match.theme, group);
  }
  const proposals = [...groups.values()].map(group => {
    const citations = group.papers.map(({ id, title, url, year }) => ({ id, title, url, ...(year === undefined ? {} : { year }) })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // These are transparent heuristic *priorities*, not validated scientific merit scores.
    const scores = {
      scientific_significance: 2,
      novelty: 1, // Cannot be established by a small corpus.
      feasibility: 3, // Assumes only public data and existing scientific Python tooling.
      information_gain: 2,
      cost: 3, // Lower-cost experiments get higher scores; no actual cost estimate.
      opportunity_cost: 1, // Unknown until alternatives and budgets are measured.
    };
    return {
      id: `arp-${group.theme}`,
      status: 'candidate_unverified',
      research_question: group.question,
      hypothesis: `The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.`,
      proposed_method: group.method,
      evidence: citations,
      evidence_count: citations.length,
      scores,
      priority_score: scores.scientific_significance + scores.novelty + scores.feasibility + scores.information_gain + scores.cost + scores.opportunity_cost,
      caveats: [
        'Topic matching is heuristic; cited papers are leads, not proof of a research gap.',
        'Novelty requires a broader literature search and expert validation.',
        'Feasibility, information gain, and opportunity cost are unverified estimates.',
      ],
      requires_human_approval: true,
    };
  });
  proposals.sort((a, b) => b.evidence_count - a.evidence_count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schema_version: '0.1.0',
    mode: 'offline-heuristic-baseline',
    corpus_count: papers.length,
    distinct_themes: groups.size,
    proposals: proposals.slice(0, maxProposals),
    selection_note: 'Ranked by supporting-paper count, not by verified scientific merit. Scores are illustrative and must not be used as automated funding or execution decisions.',
    execution_enabled: false,
  };
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node research/autonomous-planner.mjs corpus.json proposals.json');
    process.exitCode = 2;
    return;
  }
  const result = planResearch(JSON.parse(readFileSync(input, 'utf8')));
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'w' });
  console.log(`Analyzed ${result.corpus_count} papers; generated ${result.proposals.length} unverified proposals -> ${output}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
