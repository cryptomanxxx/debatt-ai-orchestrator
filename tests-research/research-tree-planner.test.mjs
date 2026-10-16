import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planEvidenceResearch } from '../research/autonomous-planner.mjs';
import { researchFingerprint } from '../research/research-loop.mjs';
import { planResearchTree,validateTreeEvidence,renderTreeReview,main } from '../research/research-tree-planner.mjs';

const REPORT_ID='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const sha=c=>c.repeat(64);
const digest=t=>createHash('sha256').update(t).digest('hex');
const ABSTRACT_1='Targeted symbolic regression with hidden holdout samples.';
const ABSTRACT_2='Bayesian optimization of information gain in experiment design.';
function fixture(){
  const papers=[
    {article_id:'11111111-1111-4111-8111-111111111111',title:'Symbolic regression measurement selection',status:'summarized',validation:{accepted_findings:1,rejected_findings:0},source_hits:[{source:'openalex',title:'Symbolic regression measurement selection',source_id:'https://openalex.org/W12345'}],
      content:{provider:'openalex',url:'https://openalex.org/W12345',sha256:digest(ABSTRACT_1),analyzed_sha256:digest(ABSTRACT_1),resolved_openalex_id:'https://openalex.org/W12345',truncated:false,scope:'abstract_only'},
      findings:[{kind:'method',claim:'Targeted symbolic regression with hidden holdout samples.',quote:'Targeted symbolic regression with hidden holdout samples.',verification:'quote_match_only'}]},
    {article_id:'22222222-2222-4222-8222-222222222222',title:'Bayesian active learning experiment design',status:'summarized',validation:{accepted_findings:1,rejected_findings:0},source_hits:[{source:'openalex',title:'Bayesian active learning experiment design',source_id:'https://openalex.org/W67890'}],
      content:{provider:'openalex',url:'https://openalex.org/W67890',sha256:digest(ABSTRACT_2),analyzed_sha256:digest(ABSTRACT_2),resolved_openalex_id:'https://openalex.org/W67890',truncated:false,scope:'abstract_only'},
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
  await assert.rejects(planResearchTree(d),/invalid_tree_evidence_report/);
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


test('rejects fabricated extra findings and inconsistent report coverage',async()=>{
  const tooMany=fixture();
  tooMany.papers[0].findings.push(...Array(3).fill(null).map((_,i)=>({
    kind:'method',claim:'Invented extra finding '+i,
    quote:'Invented extra finding supported nowhere.',verification:'quote_match_only'
  })));
  tooMany.papers[0].validation.accepted_findings=4;
  await assert.rejects(planResearchTree(tooMany),/invalid_tree_citation/);
  const forgedPartial=fixture();
  forgedPartial.status='partial';
  await assert.rejects(planResearchTree(forgedPartial),/invalid_tree_evidence_report/);
  const failed=fixture();
  failed.papers[0].status='error';
  await assert.rejects(planResearchTree(failed),/invalid_tree_evidence_report/);
});

test('rejects invalid rejected finding counts instead of claiming completion',async()=>{
  for (const value of [-1, 1.5, '0', null]) {
    const report=fixture();
    report.papers[0].validation={accepted_findings:1,rejected_findings:value};
    await assert.rejects(planResearchTree(report),/invalid_tree_evidence_report/);
  }
  const valid=fixture();
  valid.papers[0].validation={accepted_findings:1,rejected_findings:0};
  assert.equal((await planResearchTree(valid)).source_report_status,'completed');
});

test('rejects oversized local replay before parsing its JSON',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'research-tree-replay-'));
  try {
    const path=join(folder,'oversized.json');
    await writeFile(path,'x'.repeat(500_001));
    await assert.rejects(main({RESEARCH_TREE_INPUT_FILE:path},{
      mkdirImpl:async()=>{},write:async()=>{throw Error('unexpected_write');}
    }),/invalid_tree_evidence_report/);
  } finally {
    await rm(folder,{recursive:true,force:true});
  }
});

test('rejects noncanonical arXiv identity, unknown paper status and mismatched full abstract hash',async()=>{
  const hashMismatch=fixture();
  hashMismatch.papers[0].content.analyzed_sha256=sha('b');
  hashMismatch.planner=planEvidenceResearch(hashMismatch.papers);
  await assert.rejects(planResearchTree(hashMismatch),/invalid_tree_citation/);

  const unknownStatus=fixture();
  unknownStatus.papers[1].status='totally_forged';
  unknownStatus.status='partial';
  unknownStatus.planner=planEvidenceResearch(unknownStatus.papers);
  await assert.rejects(planResearchTree(unknownStatus),/invalid_tree_evidence_report/);

  const badArxiv=fixture();
  badArxiv.papers[0].content.provider='arxiv';
  badArxiv.papers[0].content.url='https://arxiv.org/abs/2401.99999';
  badArxiv.papers[0].lookup_identifiers={arxiv_id:'2401.00001'};
  badArxiv.planner=planEvidenceResearch(badArxiv.papers);
  await assert.rejects(planResearchTree(badArxiv),/invalid_tree_citation/);
});


test('rejects mismatched OpenAlex work IDs and rebranded source titles',async()=>{
  const badWork=fixture();
  badWork.papers[0].lookup_identifiers={openalex_records:[{source_id:'https://openalex.org/W999'}]};
  badWork.planner=planEvidenceResearch(badWork.papers);
  await assert.rejects(planResearchTree(badWork),/invalid_tree_citation/);

  const retitled=fixture();
  retitled.papers[0].source_hits=[{source:'openalex',title:'Original source title',source_id:'https://openalex.org/W12345'}];
  retitled.planner=planEvidenceResearch(retitled.papers);
  await assert.rejects(planResearchTree(retitled),/invalid_tree_paper/);
});

test('rejects missing retained title provenance, non-UUID articles and padded quotations',async()=>{
  const missing=fixture(); delete missing.papers[0].source_hits;
  await assert.rejects(planResearchTree(missing),/invalid_tree_paper/);
  const badId=fixture(); badId.papers[0].article_id='not-a-uuid';
  badId.planner=planEvidenceResearch(badId.papers);
  await assert.rejects(planResearchTree(badId),/invalid_tree_paper/);
  const padded=fixture(); padded.papers[0].findings[0].quote='x'+' '.repeat(25);
  padded.planner=planEvidenceResearch(padded.papers);
  await assert.rejects(planResearchTree(padded),/invalid_tree_citation/);
  const context=fixture();context.papers[0].findings[0]={
    kind:'limitation',claim:'This limitation warrants a careful comparison.',
    quote:'This limitation warrants a careful comparison.',
    context_quote:'x'+' '.repeat(25),limitation_status:'unclear',
    limitation_assessment:'unverified_model_interpretation',verification:'quote_match_only'
  };
  context.planner=planEvidenceResearch(context.papers);
  await assert.rejects(planResearchTree(context),/invalid_tree_citation/);
});

test('review artifact keeps the evidence scope for every reference',async()=>{
  const full=await planResearchTree(fixture());
  assert.ok(full.review_queue[0].evidence_refs.every(e=>e.evidence_scope==='abstract_only' && e.truncated===false));
  const prefix=fixture();prefix.papers[0].content.truncated=true;
  prefix.papers[0].content.analyzed_sha256=digest(ABSTRACT_1);
  prefix.planner=planEvidenceResearch(prefix.papers);
  const reviewed=await planResearchTree(prefix);
  const refs=reviewed.review_queue.flatMap(row=>row.evidence_refs);
  assert.ok(refs.some(e=>e.article_id===prefix.papers[0].article_id && e.evidence_scope==='abstract_prefix' && e.truncated===true));
});

test('rejects missing producer validation, reordered providers, forged quotations and resolved work ID',async()=>{
  const a=fixture();delete a.papers[0].validation;
  await assert.rejects(planResearchTree(a),/invalid_tree_evidence_report/);
  const b=fixture();b.papers[0].source_hits=[
    {source:'semantic-scholar',title:b.papers[0].title,source_id:'123'},
    {source:'openalex',title:b.papers[0].title,source_id:'https://openalex.org/W12345'}];
  await assert.rejects(planResearchTree(b),/invalid_tree_paper/);
  
  const d=fixture();d.papers[0].content.resolved_openalex_id='https://openalex.org/W99999';
  await assert.rejects(planResearchTree(d),/invalid_tree_citation/);
});


test('archive mismatch blocks publication of the review queue',async()=>{
  const report=fixture();
  report.papers[0].archive={version_id:'99999999-9999-4999-8999-999999999999'};
  const result=await main({RESEARCH_TREE_REPORT_ID:REPORT_ID},{
    readReport:async()=>report,
    readArchiveVersion:async()=>({abstract:'mismatched content',archive:{version_id:report.papers[0].archive.version_id},
      content:{provider:'openalex',url:report.papers[0].content.url,sha256:report.papers[0].content.sha256}}),
    mkdirImpl:async()=>{},write:async()=>{}
  });
  assert.equal(result.status,'invalid_evidence');
  assert.equal(result.review_queue.length,0);
  assert.equal(result.citation_replay.rejected,1);
});

test('legacy OpenAlex reports remain readable without resolved work ID',async()=>{
  const old=fixture();
  old.papers.forEach(p=>delete p.content.resolved_openalex_id);
  const result=await planResearchTree(old);
  assert.equal(result.status,'review_required');
});
