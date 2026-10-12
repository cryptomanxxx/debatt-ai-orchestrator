import test from 'node:test';
import assert from 'node:assert/strict';
import { followUpPlan, runFollowUp, createFollowUpClient, followUpOriginUrl } from '../research/literature-follow-up.mjs';
import { literaturePayload } from '../research/literature-database.mjs';
import { SOURCES } from '../research/literature-benchmark.mjs';
import { planEvidenceResearch } from '../research/autonomous-planner.mjs';
import { reportedResponse } from '../research/limitation-review.mjs';

const parentId='00000000-0000-4000-8000-000000000001';
const runId='00000000-0000-4000-8000-000000000002';
const fixture=()=>({schema_version:'literature-evidence-1',id:parentId,
  papers:[{article_id:'paper-1',title:'Turbulence model augmented physics-informed neural networks for mean-flow reconstruction'}],
  planner:{proposals:[{id:'arp-fluid-state-estimation',research_question:'Does a physics-informed estimator improve held-out state estimation under changing flow conditions?',evidence:[{id:'paper-1'}]}]}});

test('queries are bounded deterministic references to the selected parent proposal, even with no gap candidates',()=>{
  const plan=followUpPlan(fixture(),'arp-fluid-state-estimation');
  assert.equal(plan.parent_report_id,parentId);
  assert.equal(plan.queries.length,2);
  assert.equal(plan.seed_article_id,'paper-1');
  for(const q of plan.queries) {assert.ok(q.length<=200);assert.match(q,/^[\p{L}\p{N} ]+$/u);}
  assert.deepEqual(plan,followUpPlan(fixture(),'arp-fluid-state-estimation'));
  assert.throws(()=>followUpPlan(fixture(),'arp-missing'),/candidate_not_found/);
  const bad=fixture();bad.planner.proposals[0].evidence[0].id='absent';
  assert.throws(()=>followUpPlan(bad,'arp-fluid-state-estimation'),/invalid_seed_reference/);
  assert.throws(()=>followUpPlan(fixture(),'arp-a&select=secret'),/invalid_follow_up_input/);
});

test('bounded search persists metadata with failures, strips error text and leaves novelty unknown',async()=>{
  const plan=followUpPlan(fixture(),'arp-fluid-state-estimation');
  let persisted;
  const result=await runFollowUp(plan,{search:async options=>{
    assert.equal(options.limit,10);assert.equal(options.maxRetries,1);
    assert.equal(options.semanticScholarMode,'bulk');assert.deepEqual(options.sources,SOURCES);
    return {sourceNames:SOURCES,results:options.queries.map(query=>({query,sources:Object.fromEntries(SOURCES.map(source=>[source,
      source==='core'?{status:'error',httpStatus:429,error:'secret URL',attempts:2}:
        {status:'ok',records:1,attempts:1,papers:[{source,sourceId:'1',title:'Related work'}]}]))}))};
  },persist:async searches=>{persisted=literaturePayload(searches,{runKey:'test'});return {runId};}});
  assert.equal(result.status,'partial');assert.equal(result.assessment,null);
  assert.equal(result.novelty,'unknown');assert.equal(result.execution_enabled,false);
  assert.equal(result.budget.model_calls,0);assert.equal(result.literature_run_id,runId);
  assert.equal(persisted.searches.length,8);
  assert.ok(!JSON.stringify(result).includes('secret URL'));
});

test('zero hits are a completed search, all provider failures fail, neither establishes a gap',async()=>{
  for(const status of ['ok','error']) {
    const result=await runFollowUp(followUpPlan(fixture(),'arp-fluid-state-estimation'),{
      search:async o=>({sourceNames:SOURCES,results:o.queries.map(query=>({query,sources:Object.fromEntries(SOURCES.map(s=>[s,{status,records:0,papers:[]}]))}))}),
      persist:async()=>({runId})});
    assert.equal(result.status,status==='ok'?'completed':'failed');assert.equal(result.novelty,'unknown');
  }
});

test('database preflight, exact parent identity and receipt failures are enforced without leaking secrets',async()=>{
  const requests=[];
  const client=createFollowUpClient({url:'https://test.supabase.co',secretKey:'sb_secret_test',fetchImpl:async(u,o)=>{
    requests.push({u:new URL(u),o});
    if(new URL(u).pathname.endsWith('literature_follow_up_run')) return Response.json([]);
    return Response.json([{id:parentId,report:fixture()}]);
  }});
  await client.checkStorage();assert.deepEqual(await client.readReport(parentId),fixture());
  assert.equal(requests[1].u.searchParams.get('id'),'eq.'+parentId);
  assert.ok(!requests[1].u.href.includes('sb_secret'));
  await assert.rejects(()=>client.readReport('bad&select=secret'),/invalid_parent_report_id/);
  assert.equal(requests.length,2);
  const broken=createFollowUpClient({url:'https://test.supabase.co',secretKey:'sb_secret_test',fetchImpl:async()=>Response.json({}, {status:404})});
  await assert.rejects(()=>broken.checkStorage(),/follow_up_database_http_404/);
  await assert.rejects(()=>client.saveReport({}),/invalid_follow_up_report/);
});

test('uppercase UUID input matches canonical PostgreSQL report identity and rejects a different report',async()=>{
  const id='abcdef12-abcd-4abc-8def-abcdef123456';
  let endpoint;
  const client=createFollowUpClient({url:'https://test.supabase.co',secretKey:'sb_secret_test',fetchImpl:async u=>{
    endpoint=new URL(u);return Response.json([{id,report:{...fixture(),id}}]);
  }});
  assert.equal((await client.readReport(id.toUpperCase())).id,id);
  assert.equal(endpoint.searchParams.get('id'),'eq.'+id);
  await assert.rejects(()=>client.readReport(parentId),/parent_report_not_found/);
});

test('provenance uses the executing fork or renamed repository, without guessing missing context',()=>{
  for(const repository of ['another-owner/fork','new-owner/renamed.repo']) {
    assert.equal(followUpOriginUrl({GITHUB_REPOSITORY:repository,GITHUB_RUN_ID:'123'}),`https://github.com/${repository}/actions/runs/123`);
  }
  for(const env of [{},{GITHUB_RUN_ID:'123'},{GITHUB_REPOSITORY:'owner/repo'},
    {GITHUB_REPOSITORY:'owner/repo?bad',GITHUB_RUN_ID:'123'},
    {GITHUB_REPOSITORY:'owner/repo',GITHUB_RUN_ID:'123/other'}]) assert.equal(followUpOriginUrl(env),null);
});

const responseQuote='Misaligned velocity measurements significantly affect flow reconstruction accuracy, leading to the proposal of transformation-embedded PINNs, to correct spatially-misaligned measurements.';
const responseFinding=()=>({kind:'limitation',claim:'Misaligned velocity measurements reduce flow reconstruction accuracy.',quote:responseQuote,
  context_quote:responseQuote,limitation_status:'remaining',verification:'quote_match_only'});

test('a reported solution is excluded from gap candidates without rewriting the model finding',()=>{
  const f=responseFinding();
  const paper={article_id:'paper-1',title:fixture().papers[0].title,status:'summarized',findings:[f],
    content:{url:'https://openalex.org/W1',sha256:'a'.repeat(64),analyzed_sha256:'a'.repeat(64),truncated:false}};
  const proposal=planEvidenceResearch([paper]).proposals[0];
  assert.equal(proposal.gap_candidates.length,0);
  assert.equal(proposal.limitation_review[0].limitation_status,'unclear');
  assert.equal(proposal.limitation_review[0].model_limitation_status,'remaining');
  assert.match(proposal.limitation_review[0].reason,/proposed response/);
  assert.equal(f.limitation_status,'remaining');
});

test('limitation follow-up searches both the problem and proposed response with exact references',()=>{
  const report=fixture();report.papers[0].findings=[responseFinding()];
  const auto=followUpPlan(report,'arp-fluid-state-estimation');
  assert.deepEqual(auto.finding_ref,{article_id:'paper-1',finding_index:0});
  assert.match(auto.queries[0],/misaligned velocity/);
  assert.match(auto.queries[1],/transformation embedded pinns/);
  assert.equal(auto.limitation_review,'reported_response_requires_review');
  const exact=followUpPlan(report,'arp-fluid-state-estimation',{articleId:'paper-1',findingIndex:'0'});
  assert.deepEqual(exact,auto);
  for(const options of [{articleId:'paper-1'},{findingIndex:'0'},
    {articleId:'other',findingIndex:'0'},{articleId:'paper-1',findingIndex:'3'},
    {articleId:'paper-1',findingIndex:'1'}]) assert.throws(()=>followUpPlan(report,'arp-fluid-state-estimation',options));
});

test('a plain residual limitation remains eligible while ambiguous solution wording stays review-only',()=>{
  assert.equal(reportedResponse({kind:'result',quote:responseQuote}),null);
  const f=responseFinding();f.quote=f.context_quote='Validation with misaligned measurements remains future work.';
  assert.equal(reportedResponse(f),null);
  const paper={article_id:'paper-1',title:fixture().papers[0].title,status:'summarized',findings:[f],
    content:{url:'https://openalex.org/W1',sha256:'a'.repeat(64),analyzed_sha256:'a'.repeat(64),truncated:false}};
  assert.equal(planEvidenceResearch([paper]).proposals[0].gap_candidates.length,1);
  const report=fixture();report.papers[0].findings=[f];
  assert.match(followUpPlan(report,'arp-fluid-state-estimation').queries[0],/misaligned/);
});
