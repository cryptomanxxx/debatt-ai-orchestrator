import test from 'node:test';
import assert from 'node:assert/strict';
import {qualitySeeds,reviewHit,prioritizeFollowUp,FOLLOW_UP_SELECTION_DESCRIPTION} from '../research/follow-up-quality.mjs';
import {selectQueryEvidence,buildEvidenceReport} from '../research/literature-evidence.mjs';
import {RESEARCH_AREAS} from '../research/research-pipeline.mjs';
import {followUpPlan} from '../research/literature-follow-up.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={method_aliases:['pinn','pinns','physics informed neural networks'],topic_terms:['misaligned','velocity','measurements'],solution_terms:['transformation','embedded'],policy:'title_anchor_overlap_v1'};
const origins=[{article_id:uid(1),title:'Original PINN study',doi:'10.1234/origin',arxiv_id:'2306.01065',sources:[{source:'core',source_id:'123'}]}];
const review={id:uid(99),literature_run_id:uid(100),queries:['query'],quality_context:context,origin_articles:origins};
test('same DOI, arXiv, source namespace and canonical UUID confirm origin; titles only flag possible copies',()=>{
  for(const p of [{doi:'https://doi.org/10.1234/ORIGIN'}, {arxivId:'2306.01065v2'},
    {source:'core',sourceId:'123'}, {article_id:uid(1)}])
    assert.equal(reviewHit({...p,title:'Changed title'},context,origins).origin_relation,'confirmed_origin');
  assert.equal(reviewHit({source:'openalex',sourceId:'123',title:'Other paper'},context,origins).origin_relation,'not_matched_to_origin');
  assert.equal(reviewHit({title:'Original PINN study'},context,origins).origin_relation,'possible_origin_title');
});
test('short query removes narrative phrasing, includes method in problem query and expands acronym for solution',()=>{
  const q=qualitySeeds({paper:{title:'Mean flow reconstruction using physics-informed neural networks'},
    limitation:{claim:'Misaligned velocity measurements significantly reduce flow reconstruction accuracy.',context_quote:'Leading to the proposal of transformation-embedded PINNs to correct spatially-misaligned measurements.'},candidate:{}});
  assert.deepEqual(q.queries,['pinn misaligned velocity measurements','transformation embedded physics informed neural networks']);
  assert.ok(!q.queries.some(s=>/leading|proposal|significantly/.test(s)));
});
test('ranking requires bounded phrase overlap, origins are excluded but title-only copies stay visible',()=>{
  const papers=[{article_id:uid(1),rank:1,title:'Original PINN study'},
    {article_id:uid(2),rank:1,title:'Art Hussy'},
    {article_id:uid(3),rank:10,title:'PINNs with misaligned velocity measurements'},
    {article_id:uid(4),rank:2,title:'Original PINN study'}];
  const result=prioritizeFollowUp(papers,review);
  assert.equal(result.papers[0].article_id,uid(3));
  assert.equal(result.papers[0].selection_review.anchor_score,3);
  assert.equal(result.summary.confirmed_origin,1);assert.equal(result.summary.possible_origin_title,1);
  assert.equal(result.summary.rejected_for_weak_anchors,2);
  assert.equal(reviewHit({title:'Spinning measurements'},context,origins).matched_method.length,0);
});

test('method-only and unrelated titles do not enter the analysis budget; possible origin title with strong anchors remains eligible',()=>{
  const weak=[{article_id:uid(2),rank:1,title:'PINNs for blood flow'},
    {article_id:uid(3),rank:2,title:'Misaligned velocity measurements'}];
  const result=prioritizeFollowUp(weak,review);
  assert.equal(result.papers.length,0);assert.equal(result.summary.outcome,'insufficient_relevant_hits');
  const original={...origins[0],title:'PINNs with misaligned velocity measurements'};
  const copy=prioritizeFollowUp([{article_id:uid(4),rank:1,title:original.title}],{...review,origin_articles:[original]});
  assert.equal(copy.papers.length,1);assert.equal(copy.papers[0].selection_review.origin_relation,'possible_origin_title');
});
test('all canonical hits are ranked before applying the selected-paper budget; unrelated run IDs fail closed',()=>{
  const hits=Array.from({length:12},(_,i)=>({rank:i+1,source_record_id:uid(200+i),metadata:{title:i===11?'PINN misaligned velocity measurements':i===0?'Original PINN study':'Unrelated work',sourceId:`https://openalex.org/W${i+1}`},
    literature_source_record:{id:uid(200+i),source:'openalex',source_id:`https://openalex.org/W${i+1}`,article_id:uid(i+1),canonical:{id:uid(i+1),doi:null,arxiv_id:null,openalex_records:[]}}}));
  const searches=[{id:uid(20),query:'query',source:'openalex',status:'ok',literature_hit:hits}];
  const input=selectQueryEvidence({id:uid(100)},searches,{maxPapers:1,followUpReview:review});
  assert.equal(input.papers[0].article_id,uid(12));
  assert.equal(input.total_articles,12);assert.equal(input.selection_review.confirmed_origin,1);
  assert.equal(input.selection,FOLLOW_UP_SELECTION_DESCRIPTION);
  assert.equal(input.selection,input.selection_review.selection_description);
  assert.throws(()=>selectQueryEvidence({id:uid(101)},searches,{followUpReview:review}),/follow_up_query_mismatch/);
  assert.equal(selectQueryEvidence({id:uid(100)},searches,{maxPapers:1}).papers[0].article_id,uid(1));
});

test('an empty strict selection saves an insufficient-evidence report without retrieving content or calling a model',async()=>{
  const report=await buildEvidenceReport({literature_run_id:uid(100),query_index:0,query:'pinn misaligned velocity measurements',
    papers:[],total_articles:20,source_statuses:[],selection:'Strict title anchors'},
    {id:uid(101),loadAbstract:async()=>assert.fail('no retrieval for rejected hits'),summarize:async()=>assert.fail('no inference for rejected hits')});
  assert.equal(report.status,'insufficient_evidence');assert.equal(report.budget.model_calls,0);
  assert.equal(report.coverage.selected,0);assert.equal(report.planner.proposals.length,0);
});

test('every advertised research area recognizes its configured method and allows strong problem leads',()=>{
  for (const [area,query] of Object.entries(RESEARCH_AREAS)) {
    // Some retrieved titles omit the method; the explicit parent query supplies it.
    const quality=qualitySeeds({paper:{title:'Limited sparse sensor observations'},
      limitation:{claim:'Sparse sensor observations limit reconstruction.'},candidate:{},researchQuery:query});
    const c=quality.quality_context;
    assert.ok(c.method_aliases.length>0,area);
    assert.equal(c.method_anchor_source,'parent_research_query',area);
    const lead={article_id:uid(80),rank:1,title:c.method_aliases[0]+' sparse sensor observations '+(c.domain_terms?.[0]??'')};
    assert.equal(prioritizeFollowUp([lead],{...review,quality_context:c}).papers.length,1,area);
    const methodOnly={...lead,title:c.method_aliases[0]};
    assert.equal(prioritizeFollowUp([methodOnly],{...review,quality_context:c}).papers.length,0,area);
    const stored={id:uid(90),schema_version:'literature-evidence-1',query,
      papers:[{article_id:uid(91),title:'Limited sparse sensor observations',findings:[]}],
      planner:{proposals:[{id:'arp-reproducibility',research_question:'Do sparse sensor observations limit reconstruction?',evidence:[{id:uid(91)}]}]}};
    const plan=followUpPlan(stored,'arp-reproducibility');
    assert.deepEqual(plan.quality_context.method_aliases,c.method_aliases,area);
    assert.equal(plan.quality_context.method_anchor_source,'parent_research_query',area);
  }
});

test('source methods take precedence and aliases handle punctuation without double-counting method tokens',()=>{
  for (const title of ['Active-learning sensor allocation','Causal inference sensor allocation','Mixture-of-experts sensor allocation','Bayesian optimisation sensor allocation']) {
    const quality=qualitySeeds({paper:{title},candidate:{research_question:title},researchQuery:'Kalman filter estimation'});
    const c=quality.quality_context;
    assert.equal(c.method_anchor_source,'source_title_or_context');assert.ok(!c.method_aliases.includes('kalman'));
    assert.deepEqual(c.topic_terms,['sensor','allocation']);assert.deepEqual(c.solution_terms,['sensor','allocation']);
    assert.equal(prioritizeFollowUp([{article_id:uid(80),rank:1,title:c.method_aliases[0]}],{...review,quality_context:c}).papers.length,0);
  }
  const unknown=qualitySeeds({paper:{title:'Unknown technique for sensor allocation'},candidate:{research_question:'Sensor allocation'},researchQuery:'Unknown technique'});
  assert.equal(unknown.quality_context.method_anchor_source,'not_recognized');
  assert.equal(prioritizeFollowUp([{article_id:uid(80),rank:1,title:'Unknown technique for sensor allocation'}],{...review,quality_context:unknown.quality_context}).papers.length,0);
});

test('all recognized method phrases are removed from problem and solution anchors',()=>{
  for(const title of ['Bayesian optimization for experimental design','Active learning with Bayesian optimization for experimental design','PINNs with Kalman filters']) {
    const quality=qualitySeeds({paper:{title},candidate:{research_question:title}});
    assert.deepEqual(quality.quality_context.topic_terms,[],title);
    assert.deepEqual(quality.quality_context.solution_terms,[],title);
    assert.equal(prioritizeFollowUp([{article_id:uid(80),rank:1,title}],{...review,quality_context:quality.quality_context}).papers.length,0,title);
  }
  const title='Bayesian optimization for experimental design with sparse sensor observations';
  const quality=qualitySeeds({paper:{title},candidate:{research_question:title}});
  assert.deepEqual(quality.quality_context.topic_terms,['sparse','sensor','observations']);
  assert.equal(prioritizeFollowUp([{article_id:uid(80),rank:1,title}],{...review,quality_context:quality.quality_context}).papers.length,1);
});

test('anchor threshold uses the union of configured and matched terms, not the smaller bucket',()=>{
  const c={...context,topic_terms:['turbulence'],solution_terms:['sparse','sensor','measurements']};
  const evaluate=(title,quality_context=c)=>prioritizeFollowUp([{article_id:uid(80),rank:1,title}],{...review,quality_context});
  assert.equal(evaluate('PINN turbulence').papers.length,0);
  assert.equal(evaluate('PINN turbulence sparse').papers.length,1);
  assert.equal(evaluate('PINN turbulence',{...c,solution_terms:['turbulence']}).papers.length,1);
  assert.equal(evaluate('PINN sparse',{...c,topic_terms:['sparse'],solution_terms:['sparse','sensor']}).papers.length,0);
  assert.equal(evaluate('PINN',{...c,topic_terms:[],solution_terms:[]}).papers.length,0);
});

test('selection prioritizes loader-compatible identities, new leads and abstract hints before provider rank',()=>{
  const title='PINN turbulence sparse measurements';
  const c={...context,topic_terms:['turbulence','sparse','measurements'],solution_terms:[]};
  const original={...origins[0],title};
  const papers=[
    {article_id:uid(80),rank:1,title,lookup_identifiers:{doi:null,arxiv_id:null,openalex_records:[]},source_hits:[]},
    {article_id:uid(81),rank:2,title,doi:'10.1234/copy'},
    {article_id:uid(82),rank:10,title:'New '+title,doi:'10.1234/new',has_abstract_signal:true},
    {article_id:uid(83),rank:3,title:'Another '+title,doi:'10.1234/other'},
  ];
  const selected=prioritizeFollowUp(papers,{...review,quality_context:c,origin_articles:[original]});
  assert.equal(selected.papers[0].article_id,uid(82));
  assert.equal(selected.papers[1].article_id,uid(83));
  assert.equal(selected.papers[2].article_id,uid(81));
  assert.equal(selected.summary.rejected_for_no_abstract_identifier,1);
  assert.equal(selected.summary.eligible,3);assert.equal(selected.summary.eligible_title_leads,4);
  assert.equal(selected.papers[0].selection_review.abstract_access.has_abstract_signal,true);
  assert.equal(selected.summary.selection_description,FOLLOW_UP_SELECTION_DESCRIPTION);
  assert.match(selected.summary.selection_description,/usable abstract identifiers, new leads before possible title copies, provider abstract signals, title anchor score, source rank, then canonical UUID/);
});

test('strong title leads with no loader identity report a content limitation separately from relevance',()=>{
  const result=prioritizeFollowUp([{article_id:uid(80),rank:1,title:'PINN transformation embedded',
    lookup_identifiers:{doi:null,arxiv_id:null,openalex_records:[]},source_hits:[]}],review);
  assert.equal(result.papers.length,0);
  assert.equal(result.summary.outcome,'insufficient_abstract_identifiers');
  assert.equal(result.summary.rejected_for_weak_anchors,0);
});

 test('turbulence parent query anchors both searches and rejects power-system drift before the paper budget',()=>{
  const quality=qualitySeeds({paper:{title:'Turbulence model augmented physics-informed neural networks'},
    candidate:{research_question:'Does a physics-informed estimator improve held-out state estimation under changing flow conditions?'},
    researchQuery:'physics informed neural networks turbulence'});
  assert.equal(quality.queries.length,2);
  assert.ok(quality.queries.every(q=>q.includes('turbulence')));
  const c=quality.quality_context;
  const papers=[{article_id:uid(80),rank:1,title:'A Physics-Informed-Neural-Network-Based State Estimator for Low Voltage Distribution Systems',doi:'10.1234/power'},
    {article_id:uid(81),rank:2,title:'Physics informed neural networks for secure power flow state estimation',doi:'10.1234/grid'},
    {article_id:uid(82),rank:10,title:'PINN state estimator for turbulent flow',doi:'10.1234/fluid'}];
  const selected=prioritizeFollowUp(papers,{...review,quality_context:c});
  assert.deepEqual(selected.papers.map(p=>p.article_id),[uid(82)]);
  assert.equal(selected.summary.rejected_for_domain,2);
  assert.deepEqual(selected.papers[0].selection_review.matched_domain,['turbulent']);
  const none=prioritizeFollowUp(papers.slice(0,2),{...review,quality_context:c});
  assert.equal(none.summary.outcome,'insufficient_relevant_hits');
  assert.equal(none.summary.eligible,0);
  // Counts and evidence selection use the same canonical path.
  const searches=[{id:uid(20),query:quality.queries[0],source:'openalex',status:'ok',literature_hit:papers.map((p,i)=>({rank:p.rank,source_record_id:uid(200+i),metadata:{title:p.title,sourceId:'https://openalex.org/W'+(i+1)},literature_source_record:{id:uid(200+i),source:'openalex',source_id:'https://openalex.org/W'+(i+1),article_id:p.article_id,canonical:{id:p.article_id,doi:p.doi,openalex_records:[]}}}))}];
  const canonical=selectQueryEvidence({id:uid(100)},searches,{maxPapers:1,followUpReview:{...review,queries:quality.queries,quality_context:c}});
  assert.deepEqual(canonical.papers.map(p=>p.article_id),[uid(82)]);
  assert.equal(canonical.selection_review.rejected_for_domain,2);
  assert.throws(()=>prioritizeFollowUp(papers,{...review,quality_context:{...c,domain_terms:'turbulence'}}),/invalid_follow_up_quality_context/);
});

test('long accepted seed terms cannot truncate fixed method and turbulence query anchors',()=>{
  const longTerms=['a'.repeat(80),'b'.repeat(80),'c'.repeat(80)].join(' ');
  const title='Physics informed neural networks '+longTerms;
  const question='Does '+longTerms+' improve state estimation?';
  const stored={id:uid(90),schema_version:'literature-evidence-1',query:'physics informed neural networks turbulence',
    papers:[{article_id:uid(91),title,findings:[]}],
    planner:{proposals:[{id:'arp-fluid-state-estimation',research_question:question,evidence:[{id:uid(91)}]}]}};
  const plan=followUpPlan(stored,'arp-fluid-state-estimation');
  assert.equal(plan.queries.length,2);
  assert.ok(plan.queries.every(q=>q.length<=200&&/\bturbulence\b/.test(q)));
  assert.match(plan.queries[0],/^pinn turbulence /);
  assert.match(plan.queries[1],/^physics informed neural networks turbulence /);
  assert.doesNotThrow(()=>prioritizeFollowUp([],{...review,quality_context:plan.quality_context}));
  const limitation=qualitySeeds({paper:{title},candidate:{research_question:question},
    limitation:{claim:longTerms,context_quote:longTerms},researchQuery:stored.query});
  assert.ok(limitation.queries.every(q=>q.length<=200&&/\bturbulence\b/.test(q)));
});
