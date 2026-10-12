import test from 'node:test';
import assert from 'node:assert/strict';
import {runPipeline,pipelineOptions,chooseFollowUpQuery} from '../research/research-pipeline.mjs';
import {selectQueryEvidence} from '../research/literature-evidence.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const canonicalReader=async({runId,queryIndex,followUpReview})=>({literature_run_id:runId,query_index:queryIndex,selection_review:{eligible:queryIndex,follow_up_report_id:followUpReview.id}});
const candidate={id:'arp-fluid-state-estimation',status:'candidate_unverified',evidence:[{id:'paper'}],gap_candidates:[]};
const context={method_aliases:['pinn'],topic_terms:['misaligned','measurements'],solution_terms:['transformation','embedded'],policy:'test'};
const follow=()=>({id:'follow-report',literature_run_id:'follow-run',status:'completed',queries:['query0','query1'],quality_context:context,origin_articles:[],
  searches:{results:[{sources:{openalex:{papers:[]}}},{sources:{openalex:{papers:[{title:'PINN transformation embedded',sourceId:'x'}]}}}]}});
test('one chain propagates exact IDs, isolates artifacts and keeps total model calls within reserved quotas',async()=>{
  const calls=[];
  const result=await runPipeline({PIPELINE_MODEL_BUDGET:'5',LITERATURE_RUN_ID:'stale',FOLLOW_UP_REPORT_ID:'stale'}, {
    preflight:async()=>{},readQuery:canonicalReader,collect:async(e,o)=>{calls.push('collect');assert.equal(o.queries.length,1);return {status:'completed',literature_run_id:'collection-run'};},
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
  for(const outcome of ['insufficient_relevant_hits','insufficient_abstract_identifiers']) {
  const result=await runPipeline({}, {preflight:async()=>{},readQuery:canonicalReader,collect:async()=>({status:'partial',literature_run_id:'run'}),
    evidence:async e=>e.FOLLOW_UP_REPORT_ID?{id:'final',status:'insufficient_evidence',budget:{model_calls:0},selection_review:{outcome}}:
      {id:'initial',status:'completed',budget:{model_calls:1},planner:{proposals:[candidate]}},followUp:async()=>follow()});
  assert.equal(result.status,outcome);assert.equal(result.budget.known_model_calls,1);
  }
});
test('missing candidates and failed stages stop the chain, preserve checkpoints and hide raw diagnostics',async()=>{
  let following=0;
  const deps={preflight:async()=>{},readQuery:canonicalReader,collect:async()=>({status:'completed',literature_run_id:'run'}),
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
  const result=await runPipeline({}, {preflight:async()=>{},readQuery:canonicalReader,collect:async()=>({literature_run_id:'run',status:'completed'}),
    evidence:async()=>({budget:{model_calls:4}}),followUp:async()=>{assert.fail('must stop');}});
  assert.equal(result.status,'error');assert.equal(result.stages.length,3);
  assert.equal(await chooseFollowUpQuery(follow(),canonicalReader),1);
});

function canonicalSearch(source,index,rows) {
  const providers=['openalex','semantic-scholar','core','arxiv'];
  return {id:uid(20+providers.indexOf(source)),source,query:'query'+index,status:'ok',literature_hit:rows.map((row,i)=>{
    const record=uid(1000+index*100+providers.indexOf(source)*10+i);
    const sourceId=source==='openalex'?'https://openalex.org/W'+row.article:source+'-'+row.article;
    return {rank:i+1,source_record_id:record,metadata:{title:row.title,sourceId,doi:'10.1234/'+row.article},
      literature_source_record:{id:record,source,source_id:sourceId,article_id:uid(row.article),
        canonical:{id:uid(row.article),doi:'10.1234/'+row.article,arxiv_id:null,openalex_records:[]}}};
  })};
}
const canonicalReport=()=>({...follow(),id:uid(99),literature_run_id:uid(100)});
const databaseReader=searches=>async options=>selectQueryEvidence({id:options.runId},searches[options.queryIndex],options);

test('query selection uses the same canonical provider-title priority as final evidence',async()=>{
  const r=canonicalReport(),title='PINN transformation embedded';
  const searches=[
    [canonicalSearch('openalex',0,[{article:1,title:'Unanchored title'}]),canonicalSearch('core',0,[{article:1,title}])],
    [canonicalSearch('openalex',1,[{article:2,title}])]];
  assert.equal(await chooseFollowUpQuery(r,databaseReader(searches)),1);
  const input=await databaseReader(searches)({runId:r.literature_run_id,queryIndex:0,maxPapers:10,followUpReview:r});
  assert.equal(input.selection_review.eligible,0);
});

test('canonical query counts deduplicate four provider copies and respect canonical origin identity',async()=>{
  const r=canonicalReport(),title='PINN transformation embedded';
  const searches=[['openalex','core','semantic-scholar','arxiv'].map(s=>canonicalSearch(s,0,[{article:1,title}])),
    [canonicalSearch('openalex',1,[1,2,3].map(i=>({article:i+1,title})))]];
  assert.equal(await chooseFollowUpQuery(r,databaseReader(searches)),1);
  const q0=await databaseReader(searches)({runId:r.literature_run_id,queryIndex:0,maxPapers:10,followUpReview:r});
  assert.equal(q0.selection_review.eligible,1);
  r.origin_articles=[{article_id:uid(1),title,doi:null,arxiv_id:null,sources:[]}];
  const original=await databaseReader(searches)({runId:r.literature_run_id,queryIndex:0,maxPapers:10,followUpReview:r});
  assert.equal(original.selection_review.confirmed_origin,1);assert.equal(original.selection_review.eligible,0);
});

test('unavailable or mismatched canonical counts stop query selection before final inference',async()=>{
  await assert.rejects(()=>chooseFollowUpQuery(canonicalReport(),async()=>{throw Error('database error');}));
  await assert.rejects(()=>chooseFollowUpQuery(canonicalReport(),async()=>({literature_run_id:'wrong',query_index:0,selection_review:{eligible:1}})),/invalid_canonical_query_count/);
});
