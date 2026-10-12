import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline,pipelineOptions,chooseFollowUpQuery} from '../research/research-pipeline.mjs';
const candidate={id:'arp-fluid-state-estimation',status:'candidate_unverified',evidence:[{id:'paper'}],gap_candidates:[]};
const context={method_aliases:['pinn'],topic_terms:['misaligned','measurements'],solution_terms:['transformation','embedded'],policy:'test'};
const follow=()=>({id:'follow-report',literature_run_id:'follow-run',status:'completed',quality_context:context,origin_articles:[],
  searches:{results:[{sources:{openalex:{papers:[]}}},{sources:{openalex:{papers:[{title:'PINN transformation embedded',sourceId:'x'}]}}}]}});
test('one chain propagates exact IDs, isolates artifacts and keeps total model calls within reserved quotas',async()=>{
  const calls=[];
  const result=await runPipeline({PIPELINE_MODEL_BUDGET:'5',LITERATURE_RUN_ID:'stale',FOLLOW_UP_REPORT_ID:'stale'}, {
    preflight:async()=>{},collect:async(e,o)=>{calls.push('collect');assert.equal(o.queries.length,1);return {status:'completed',literature_run_id:'collection-run'};},
    evidence:async(e,o)=>{
      calls.push('evidence');
      if(calls.length===2) {assert.equal(e.LITERATURE_RUN_ID,'collection-run');assert.equal(e.FOLLOW_UP_REPORT_ID,'');assert.equal(e.LITERATURE_MAX_PAPERS,'3');return {id:'initial-report',status:'completed',budget:{model_calls:3},planner:{proposals:[candidate]}};}
      assert.equal(e.FOLLOW_UP_REPORT_ID,'follow-report');assert.equal(e.LITERATURE_RUN_ID,'');assert.equal(e.LITERATURE_QUERY_INDEX,'1');assert.equal(e.LITERATURE_MAX_PAPERS,'2');
      assert.match(o.directory,/follow-up-evidence/);
      return {id:'final-report',status:'completed',budget:{model_calls:2},selection_review:{outcome:'eligible_title_leads'}};
    },followUp:async(e)=>{calls.push('follow');assert.equal(e.PLANNER_REPORT_ID,'initial-report');assert.equal(e.RESEARCH_CANDIDATE_ID,candidate.id);return follow();}
  });
  assert.deepEqual(calls,['collect','evidence','follow','evidence']);assert.equal(result.status,'completed');assert.equal(result.budget.known_model_calls,5);
});
test('insufficient relevant follow-up is an explicit successful outcome and consumes no follow-up model call',async()=>{
  const result=await runPipeline({}, {preflight:async()=>{},collect:async()=>({status:'partial',literature_run_id:'run'}),
    evidence:async e=>e.FOLLOW_UP_REPORT_ID?{id:'final',status:'insufficient_evidence',budget:{model_calls:0},selection_review:{outcome:'insufficient_relevant_hits'}}:
      {id:'initial',status:'completed',budget:{model_calls:1},planner:{proposals:[candidate]}},followUp:async()=>follow()});
  assert.equal(result.status,'insufficient_relevant_hits');assert.equal(result.budget.known_model_calls,1);
});
test('missing candidates and failed stages stop the chain, preserve checkpoints and hide raw diagnostics',async()=>{
  let following=0;
  const deps={preflight:async()=>{},collect:async()=>({status:'completed',literature_run_id:'run'}),
    evidence:async()=>({id:'initial',status:'insufficient_evidence',budget:{model_calls:0},planner:{proposals:[]}}),
    followUp:async()=>{following++;}};
  const empty=await runPipeline({},deps);assert.equal(empty.status,'insufficient_evidence');assert.equal(following,0);
  const checkpoints=[];
  const failed=await runPipeline({}, {...deps,evidence:async()=>{throw Error('private API key');},checkpoint:async r=>checkpoints.push(structuredClone(r))});
  assert.equal(failed.status,'error');assert.equal(failed.budget.actual_count_complete,false);
  assert.ok(!JSON.stringify(checkpoints).includes('private API key'));assert.equal(following,0);
});
test('invalid budgets fail before operations and a stage claiming excessive model use prevents follow-up',async()=>{
  assert.throws(()=>pipelineOptions({PIPELINE_MODEL_BUDGET:'100'}),/invalid_pipeline_options/);
  assert.throws(()=>pipelineOptions({RESEARCH_AREA:'unbounded'}),/invalid_pipeline_options/);
  const result=await runPipeline({}, {preflight:async()=>{},collect:async()=>({literature_run_id:'run',status:'completed'}),
    evidence:async()=>({budget:{model_calls:4}}),followUp:async()=>{assert.fail('must stop');}});
  assert.equal(result.status,'error');assert.equal(result.stages.length,3);
  assert.equal(chooseFollowUpQuery(follow()),1);
});
