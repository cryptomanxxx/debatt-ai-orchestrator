import test from 'node:test';
import assert from 'node:assert/strict';
import {qualitySeeds,reviewHit,prioritizeFollowUp} from '../research/follow-up-quality.mjs';
import {selectQueryEvidence} from '../research/literature-evidence.mjs';
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
  assert.ok(result.papers.some(p=>p.article_id===uid(4)));
  assert.equal(reviewHit({title:'Spinning measurements'},context,origins).matched_method.length,0);
});
test('all canonical hits are ranked before applying the selected-paper budget; unrelated run IDs fail closed',()=>{
  const hits=Array.from({length:12},(_,i)=>({rank:i+1,source_record_id:uid(200+i),metadata:{title:i===11?'PINN misaligned velocity measurements':i===0?'Original PINN study':'Unrelated work',sourceId:`https://openalex.org/W${i+1}`},
    literature_source_record:{id:uid(200+i),source:'openalex',source_id:`https://openalex.org/W${i+1}`,article_id:uid(i+1),canonical:{id:uid(i+1),doi:null,arxiv_id:null,openalex_records:[]}}}));
  const searches=[{id:uid(20),query:'query',source:'openalex',status:'ok',literature_hit:hits}];
  const input=selectQueryEvidence({id:uid(100)},searches,{maxPapers:1,followUpReview:review});
  assert.equal(input.papers[0].article_id,uid(12));
  assert.equal(input.total_articles,12);assert.equal(input.selection_review.confirmed_origin,1);
  assert.throws(()=>selectQueryEvidence({id:uid(101)},searches,{followUpReview:review}),/follow_up_query_mismatch/);
  assert.equal(selectQueryEvidence({id:uid(100)},searches,{maxPapers:1}).papers[0].article_id,uid(1));
});
