import { normalizeDoi, normalizeArxivId } from './literature-benchmark.mjs';

export const FOLLOW_UP_SELECTION_DESCRIPTION='Strict method and combined problem/solution title anchors; exclude confirmed origin articles and records without loader-compatible abstract identifiers, retaining them in the catalog. Rank by usable abstract identifiers, new leads before possible title copies, provider abstract signals, title anchor score, source rank, then canonical UUID. Abstract signals are unverified; no merit, novelty or independence judgment.';

const words = text => (String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
const stop = new Set(('does the with and under which from for how can are leading proposal significantly reduce reduces reduced improve improves improved accuracy performance affect affects affected correct correcting spatially work paper study method approach using used use remains remaining requires required future limitation limitations enough appropriately distributed new reported this that into based to of out held conditions changing networks neural physics informed pinn pinns').split(' '));
const terms = text => [...new Set(words(text))].filter(w => w.length > 2 && !stop.has(w));
const titleKey = title => words(String(title ?? '').normalize('NFKC')).join(' ');
const METHODS = [
  {pattern:/\bpinns?\b|physics[- ]informed neural networks?/i,short:'pinn',expanded:'physics informed neural networks',aliases:['pinn','pinns','physics informed neural network','physics informed neural networks']},
  {pattern:/kalman/i,short:'kalman',expanded:'kalman filter',aliases:['kalman','kalman filter','kalman filters','kalman filtering']},
  {pattern:/symbolic regression/i,short:'symbolic regression',expanded:'symbolic regression',aliases:['symbolic regression']},
  {pattern:/neural operators?/i,short:'neural operator',expanded:'neural operator',aliases:['neural operator','neural operators']},
  {pattern:/\bactive learning\b/i,short:'active learning',expanded:'active learning',aliases:['active learning']},
  {pattern:/\bbayesian optim(?:ization|isation)\b/i,short:'bayesian optimization',expanded:'bayesian optimization',aliases:['bayesian optimization','bayesian optimisation']},
  {pattern:/\b(?:experiment|experimental) design\b/i,short:'experiment design',expanded:'experimental design',aliases:['experiment design','experimental design']},
  {pattern:/\bcausal (?:inference|discovery|estimation)\b/i,short:'causal inference',expanded:'causal inference',aliases:['causal inference','causal discovery','causal estimation']},
  {pattern:/\bmixture of experts\b|\bmoe\b/i,short:'moe',expanded:'mixture of experts',aliases:['moe','mixture of experts']},
];

export function qualitySeeds({paper,limitation,candidate,researchQuery=''}) {
  const sourceText=titleKey(paper.title + ' ' + (limitation?.context_quote ?? ''));
  const sourceMethod=METHODS.find(m => m.pattern.test(sourceText));
  const method=sourceMethod ?? METHODS.find(m => m.pattern.test(titleKey(researchQuery)));
  const allSeedText=titleKey([sourceText,researchQuery,limitation?.claim,candidate.research_question].filter(Boolean).join(' '));
  const recognized=METHODS.filter(m=>m.pattern.test(allSeedText));
  const methodWords=new Set(recognized.flatMap(m=>m.aliases).flatMap(words));
  const nonMethodTerms=text=>terms(text).filter(t=>!methodWords.has(t));
  const topic = nonMethodTerms(limitation?.claim ?? candidate.research_question).slice(0,3);
  const context = limitation?.context_quote ?? paper.title;
  const solution = /transformation[- ]embedded/i.test(context) ? ['transformation','embedded'] : nonMethodTerms(context).slice(0,3);
  const seeds = [
    [method?.short,...topic].filter(Boolean).join(' '),
    [...solution,method?.expanded].filter(Boolean).join(' '),
  ].map(q => q.slice(0,200).trim());
  return {queries:[...new Set(seeds)].filter(q => q.length >= 3),
    quality_context:{method_aliases:method?.aliases ?? [],topic_terms:topic,solution_terms:solution,
      method_anchor_source:sourceMethod?'source_title_or_context':method?'parent_research_query':'not_recognized',
      policy:'title_anchor_overlap_v1; heuristic selection, not scientific merit'}};
}

export function originArticles(papers) {
  return papers.map(p => ({article_id:p.article_id,title:p.title,
    doi:normalizeDoi(p.lookup_identifiers?.doi),arxiv_id:normalizeArxivId(p.lookup_identifiers?.arxiv_id),
    sources:(p.source_hits ?? []).map(h => ({source:h.source,source_id:h.source_id}))}));
}

export function abstractAccess(paper) {
  const lookup=paper.lookup_identifiers;
  const hasIdentifier=Boolean(normalizeDoi(lookup?.doi??paper.doi)||normalizeArxivId(lookup?.arxiv_id??paper.arxivId)
    ||lookup?.openalex_records?.length || (paper.source_hits??[]).some(h=>
      normalizeDoi(h.doi)||(h.source==='openalex'&&/^https:\/\/openalex.org\/W\d+$/.test(h.source_id??'')))
    ||(paper.source==='openalex'&&/^https:\/\/openalex.org\/W\d+$/.test(paper.sourceId??'')));
  return {identifier_status:hasIdentifier?'available':lookup?'missing':'unknown',
    has_abstract_signal:paper.has_abstract_signal===true||paper.hasAbstract===true,
    note:'Metadata signal and loader-compatible identity only; actual abstract availability is not verified.'};
}

export function reviewHit(paper, context, origins) {
  const lookup = paper.lookup_identifiers ?? {};
  const doi = normalizeDoi(paper.doi ?? lookup.doi), arxiv = normalizeArxivId(paper.arxivId ?? lookup.arxiv_id);
  const sources = paper.source_hits?.map(h => ({source:h.source,source_id:h.source_id})) ??
    [{source:paper.source,source_id:paper.sourceId}];
  const exact = origins.find(o => (paper.article_id && paper.article_id === o.article_id)
    || (doi && doi === o.doi) || (arxiv && arxiv === o.arxiv_id)
    || sources.some(s => s.source_id && o.sources.some(t => t.source === s.source && t.source_id === s.source_id)));
  const possible = !exact && origins.find(o => titleKey(o.title) === titleKey(paper.title));
  const text = ' ' + titleKey(paper.title) + ' ';
  const matched = list => list.filter(t => text.includes(' ' + t + ' '));
  const method = matched(context.method_aliases), topic = matched(context.topic_terms), solution = matched(context.solution_terms);
  return {origin_relation:exact ? 'confirmed_origin' : possible ? 'possible_origin_title' : 'not_matched_to_origin',
    origin_article_id:exact?.article_id ?? possible?.article_id ?? null,
    matched_method:method,matched_topic:topic,matched_solution:solution,
    abstract_access:abstractAccess(paper),
    anchor_score:(method.length ? 2 : 0) + (topic.length || solution.length ? 1 : 0),
    reason:'Title token/phrase overlap only; not semantic relevance, novelty or independence.'};
}

export function prioritizeFollowUp(papers, review) {
  if (!review?.quality_context || !Array.isArray(review.origin_articles) || review.origin_articles.length > 10)
    throw Error('invalid_follow_up_quality_context');
  const c = review.quality_context;
  if (typeof c.policy !== 'string' || c.policy.length > 200 || review.origin_articles.some(o =>
    !o || typeof o.article_id !== 'string' || o.article_id.length > 100 || typeof o.title !== 'string' || o.title.length > 1000
    || !Array.isArray(o.sources) || o.sources.length > 4 || o.sources.some(s =>
      typeof s.source !== 'string' || typeof s.source_id !== 'string' || s.source_id.length > 500)))
    throw Error('invalid_follow_up_quality_context');
  for (const key of ['method_aliases','topic_terms','solution_terms'])
    if (!Array.isArray(c[key]) || c[key].length > 10 || c[key].some(t => typeof t !== 'string' || !t || t.length > 100))
      throw Error('invalid_follow_up_quality_context');
  const reviewed = papers.map(p => ({...p,selection_review:reviewHit(p,c,review.origin_articles)}));
  // Confirmed origin records remain in the search/catalog and audit counts.
  // Do not spend the selected-paper budget treating them as additional evidence.
  const nonOrigin = reviewed.filter(p => p.selection_review.origin_relation !== 'confirmed_origin');
  const vocabulary=new Set([...c.topic_terms,...c.solution_terms]);
  const requiredMatches=vocabulary.size===1?1:2;
  const eligible = nonOrigin.filter(p => {
    const r=p.selection_review;
    return r.matched_method.length>0 && new Set([...r.matched_topic,...r.matched_solution]).size>=requiredMatches;
  });
  const selectable=eligible.filter(p=>p.selection_review.abstract_access.identifier_status!=='missing');
  const accessRank=p=>p.selection_review.abstract_access.identifier_status==='available'?1:0;
  const titleCopy=p=>p.selection_review.origin_relation==='possible_origin_title'?1:0;
  selectable.sort((a,b) => accessRank(b)-accessRank(a) || titleCopy(a)-titleCopy(b)
    || Number(b.selection_review.abstract_access.has_abstract_signal)-Number(a.selection_review.abstract_access.has_abstract_signal)
    || b.selection_review.anchor_score - a.selection_review.anchor_score
    || a.rank - b.rank || (a.article_id < b.article_id ? -1 : a.article_id > b.article_id ? 1 : 0));
  return {papers:selectable,summary:{policy:c.policy,reviewed:reviewed.length,
    selection_description:FOLLOW_UP_SELECTION_DESCRIPTION,
    confirmed_origin:reviewed.filter(p => p.selection_review.origin_relation === 'confirmed_origin').length,
    possible_origin_title:reviewed.filter(p => p.selection_review.origin_relation === 'possible_origin_title').length,
    eligible:selectable.length,eligible_title_leads:eligible.length,
    rejected_for_no_abstract_identifier:eligible.length-selectable.length,
    rejected_for_weak_anchors:nonOrigin.length-eligible.length,
    outcome:selectable.length?'eligible_title_leads':eligible.length?'insufficient_abstract_identifiers':'insufficient_relevant_hits',
    required_anchor_terms:requiredMatches,
    eligibility_rule:'Recognized method plus two distinct terms across the combined problem/solution vocabulary (one only if the entire vocabulary has one). Titles only; omitted terms can cause false negatives.',
    follow_up_report_id:review.id}};
}
