import test from 'node:test';
import assert from 'node:assert/strict';
import { planEvidenceResearch } from '../research/autonomous-planner.mjs';
import { researchFingerprint } from '../research/research-loop.mjs';
import { planResearchTree,validateTreeEvidence,renderTreeReview,main } from '../research/research-tree-planner.mjs';

const REPORT_ID='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const sha=c=>c.repeat(64);
function fixture(){
  const papers=[
    {article_id:'p-1',title:'Symbolic regression measurement selection',status:'summarized',
      content:{provider:'openalex',url:'https://openalex.org/W12345',sha256:sha('a'),analyzed_sha256:sha('b'),truncated:false,scope:'abstract_only'},
      findings:[{kind:'method',claim:'Targeted symbolic regression with hidden holdout samples.',quote:'Targeted symbolic regression with hidden holdout samples.',verification:'quote_match_only'}]},
    {article_id:'p-2',title:'Bayesian active learning experiment design',status:'summarized',
      content:{provider:'openalex',url:'https://openalex.org/W67890',sha256:sha('c'),analyzed_sha256:sha('d'),truncated:false,scope:'abstract_only'},
      findings:[{kind:'method',claim:'Bayesian optimization of information gain in experiment design.',quote:'Bayesian optimization of information gain in experiment design.',verification:'quote_match_only'}]},
  ];
  return {schema_version:'literature-evidence-1',id:REPORT_ID,status:'completed',
    papers,planner:planEvidenceResearch(papers)};
}
test('builds bounded review tree and immutable Research Loop lineage from real planner output',async()=>{
  const report=fixture();
  const result=await planResearchTree(report,{maxNodes:6,maxCandidates:2});
  assert.equal(result.status,'review_required');
  assert.equal(result.execution_enabled,false);
  assert.equal(result.verification_performed,false);
  assert.equal(result.budget.model_calls,0);
  assert.equal(result.search.evaluatedNodes,6);
  assert.equal(result.search.verifiedNodeId,null);
  assert.equal(result.research.hypotheses.length,6);
  assert.equal(result.research.attempts.length,0);
  assert.equal(result.research.results.length,0);
  assert.equal(researchFingerprint(result.research),result.research.fingerprint);
  assert.equal(new Set(result.review_queue.map(x=>x.hypothesis_id)).size,6);
  for(const item of result.review_queue){
    assert.equal(item.verified,false);
    assert.equal(item.execution_ready,false);
    assert.equal(item.portfolio_assessment.novelty.status,'unknown');
    assert.equal(item.experiment_protocol.execution_ready,false);
    assert.ok(item.evidence_refs.length>0);
    assert.ok(item.priority<1);
    assert.equal(item.review_status,'requires_human_approval');
    if(item.branch_kind!=='candidate') assert.ok(item.parent_hypothesis_id);
  }
  assert.equal(result.review_queue[0].rank,1);
  assert.match(renderTreeReview(result),/no scientific ranking or verification/i);
});
test('limits search and preserves deterministic proposals',async()=>{
  const report=fixture();
  const first=await planResearchTree(report,{maxNodes:1,maxCandidates:1});
  const second=await planResearchTree(report,{maxNodes:1,maxCandidates:1});
  assert.deepEqual(first,second);
  assert.equal(first.search.evaluatedNodes,1);
  const one=await planResearchTree(report,{maxNodes:3,maxCandidates:1});
  assert.equal(one.search.evaluatedNodes,3); // root + two second-level alternatives
  assert.ok(one.review_queue.some(x=>x.branch_kind==='null-test'));
  await assert.rejects(planResearchTree(report,{maxNodes:13}),/invalid_tree_limits/);
  await assert.rejects(planResearchTree(report,{maxCandidates:5}),/invalid_tree_limits/);
});
test('rejects invented references, elevated portfolio claims and malformed reports',async()=>{
  const a=fixture(); a.planner.proposals[0].evidence[0].analyzed_content_sha256=sha('f');
  await assert.rejects(planResearchTree(a),/invalid_tree_citation/);
  const b=fixture(); b.planner.proposals[0].scores.novelty=3;
  await assert.rejects(planResearchTree(b),/invalid_tree_candidate/);
  const c=fixture(); c.planner.proposals[0].portfolio_assessment.novelty.status='verified';
  await assert.rejects(planResearchTree(c),/invalid_tree_candidate/);
  const d=fixture(); d.papers[0].status='insufficient_evidence';
  // Planner recomputation catches an inconsistent producer state before citation validation.
  await assert.rejects(planResearchTree(d),/invalid_tree_candidate/);
  const e=fixture(); e.planner.proposals[0].experiment_protocol.execution_ready=true;
  await assert.rejects(planResearchTree(e),/invalid_tree_protocol/);
  const f=fixture(); f.schema_version='other';
  assert.throws(()=>validateTreeEvidence(f),/invalid_tree_evidence_report/);
});
test('graceful no-evidence report never manufactures hypotheses',async()=>{
  const empty={schema_version:'literature-evidence-1',id:REPORT_ID,status:'insufficient_evidence',
    papers:[],planner:{mode:'abstract-evidence-baseline',proposals:[]}};
  const result=await planResearchTree(empty);
  assert.equal(result.status,'insufficient_evidence');
  assert.equal(result.search.evaluatedNodes,0);
  assert.deepEqual(result.review_queue,[]);
  assert.deepEqual(result.research.hypotheses,[]);
});
test('CLI reads existing report by UUID without writes to Supabase or model calls',async()=>{
  const writes=new Map();
  const r=await main({RESEARCH_TREE_REPORT_ID:REPORT_ID},{readReport:async id=>{
    assert.equal(id,REPORT_ID);return fixture();
  },mkdirImpl:async()=>{},write:async(path,data)=>{writes.set(path,data);}});
  assert.equal(r.source_report_id,REPORT_ID);
  assert.ok(writes.has('reports/research-tree-review/report.json'));
  assert.ok(writes.has('reports/research-tree-review/summary.md'));
  await assert.rejects(main({RESEARCH_TREE_REPORT_ID:'invalid'},{readReport:()=>{throw Error('should_not_call');}}),
    /invalid_tree_report_id/);
});


test('candidate evidence matches planner and canonical JSON keys preserve identity',async()=>{
  const report=fixture();
  const forged=structuredClone(report);
  forged.planner.proposals[0].evidence=structuredClone(report.planner.proposals[1].evidence);
  await assert.rejects(planResearchTree(forged),/invalid_tree_candidate/);
  const reordered=JSON.parse(JSON.stringify(report, (_key, value)=>
    value && typeof value==='object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse()) : value));
  const first=await planResearchTree(report);
  const second=await planResearchTree(reordered);
  assert.equal(first.research.source.report_sha256,second.research.source.report_sha256);
});
