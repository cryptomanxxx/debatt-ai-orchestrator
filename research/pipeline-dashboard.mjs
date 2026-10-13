// Small display snapshots, not complete abstracts or raw model responses.
const text=(v,n)=>typeof v==='string'?v.slice(0,n):null;
const count=v=>Number.isInteger(v)&&v>=0?v:0;
export function evidenceSnapshot(report) {
  return {query:text(report.query,200),coverage:report.coverage??null,validation:report.validation_stats??null,
    reused_analyses:count(report.analysis_stats?.reused),selection:report.selection_review??null,
    papers:(report.papers??[]).slice(0,10).map(p=>({article_id:p.article_id,title:text(p.title,400),status:p.status,
      reason:text(p.reason,100),source_url:text(p.content?.url,512),reused_analysis:p.analysis?.cache_hit===true,
      validation:p.validation??null,selection:p.selection_review??null,
      findings:(p.findings??[]).slice(0,3).map(f=>({kind:f.kind,claim:text(f.claim,500),quote:text(f.quote,280),
        limitation_status:f.limitation_status??null,context_quote:text(f.context_quote,280)}))}))};
}
export function collectionSnapshot(report) {
  return {metadata:report.metadata??null,abstracts:report.abstracts??null,
    unavailable:(report.items??[]).filter(p=>['error','unavailable'].includes(p.status)).slice(0,10)
      .map(p=>({title:text(p.title,400),reason:text(p.reason,100)}))};
}
export function followUpSnapshot(report) {
  return {queries:(report.searches?.results??[]).slice(0,2).map(r=>({query:text(r.query,200),
    sources:Object.entries(r.sources??{}).slice(0,4).map(([source,s])=>({source,status:s.status,records:count(s.records)}))})),
    domain_terms:report.quality_context?.domain_terms??[]};
}
export function candidateSnapshot(candidate) {
  return {id:candidate.id,question:text(candidate.research_question,800),
    hypothesis:text(candidate.hypothesis,800),gap_review_count:count(candidate.gap_candidates?.length),
    evidence_articles:count(candidate.evidence?.length),status:'unverified',experiment_status:'draft_not_executable'};
}
