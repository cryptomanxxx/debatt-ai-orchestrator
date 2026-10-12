// Explicit design suggestions, not claims established by the cited literature.
const DESIGNS={
  'fluid-state-estimation':{
    intervention:'Estimator architecture: physics-informed versus conventional and data-only.',
    baselines:['Conventional filter','Data-only estimator'],
    outcomes:['Held-out state-estimation error','Error under changed flow conditions','Measured compute use'],
    controls:['Identical observations and train/test splits','Matched compute budgets','Hidden evaluation conditions'],
  },
  'symbolic-regression':{
    intervention:'Measurement selection: targeted versus passive.',
    baselines:['Passive measurement selection'],
    outcomes:['Incorrect symbolic hypotheses on hidden holdouts','Measurements required','Model/tool calls'],
    controls:['Same synthetic generators','Hidden holdouts','Matched model-call budgets'],
  },
  'experiment-design':{
    intervention:'Experiment selection: uncertainty-based versus random and fixed-order.',
    baselines:['Random selection','Fixed-order selection'],
    outcomes:['Uncertainty reduction after an observation','Compute consumed per observation'],
    controls:['Identical synthetic tasks','Same initial information','Matched budgets'],
  },
  'autonomous-research':{
    intervention:'Research selection: literature-grounded planning versus a fixed catalog.',
    baselines:['Fixed research catalog'],
    outcomes:['Blinded ratings of testability and evidence support','Measured model/tool use'],
    controls:['Identical held-out scientific tasks','Blinded review','Equal budgets'],
  },
  'reproducibility':{
    intervention:'Independent rerun of a published benchmark.',
    baselines:['Published benchmark result'],
    outcomes:['Difference in measured effect sizes','Variation across reruns'],
    controls:['Fixed software versions','Pre-registered acceptance criteria','Recorded data provenance'],
  },
};
const REQUIREMENTS={
  scientific_significance:'Explain the knowledge question and who could use the answer.',
  novelty:'Record targeted searches, related work and the difference from earlier experiments.',
  feasibility:'Verify available data, tools, licenses, resources and a successful small pilot.',
  information_gain:'Define current uncertainty and how alternative outcomes would change it.',
  cost:'Estimate model/tool calls, compute time, storage and review effort.',
  opportunity_cost:'Compare competing experiments under the same resource budget.',
};
export function candidateProtocol(proposal) {
  const theme=proposal.id.replace(/^arp-/,'');
  const design=DESIGNS[theme]??{intervention:null,baselines:[],outcomes:[],controls:[]};
  return {
    schema_version:'research-protocol-draft-1',status:'draft_requires_specification',
    origin:'heuristic_design_template',execution_ready:false,preregistered:false,
    intervention:design.intervention,baselines:design.baselines,outcome_candidates:design.outcomes,controls:design.controls,
    dataset:null,sample_size:null,seeds:null,primary_outcome:null,decision_rule:null,
    resource_budget:{model_calls:null,tool_calls:null,compute_seconds:null,currency_cost:null},
    evidence_article_ids:proposal.evidence.map(e=>e.id),
    blockers:['Review the supporting findings and any claimed gap against later literature.',
      'Select lawful, available data and verify the required tools.',
      'Specify sample size, seeds, primary outcome and a falsifiable decision rule.',
      'Set a resource budget and register the protocol before analyzing results.'],
  };
}
export function portfolioAssessment() {
  return Object.fromEntries(Object.entries(REQUIREMENTS).map(([dimension,required_evidence])=>
    [dimension,{status:'unknown',value:null,required_evidence}]));
}
export function gapReviewPlan(gaps) {
  return gaps.map(gap=>({
    gap_id:gap.id,status:'not_searched',finding_ref:{article_id:gap.article_id,finding_index:gap.finding_index},
    search_seed_refs:[{article_id:gap.article_id,path:'papers[].title'},
      {article_id:gap.article_id,finding_index:gap.finding_index,path:'papers[].findings[].claim'}],
    search_scope:'Related and subsequent work across the available literature sources; the reporting paper alone cannot establish novelty.',
    questions:['Does subsequent work address the reported limitation?',
      'Are related methods or contrary results already available?',
      'Do the full paper and its assumptions support this interpretation?'],
    related_article_ids:[],assessment:null,
  }));
}
