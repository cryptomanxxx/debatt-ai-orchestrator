import test from 'node:test';
import assert from 'node:assert/strict';
import {createPipelineStore,readJson} from '../src/research-dashboard/store.mjs';
import {isStart,isSnapshot,RESEARCH_CHOICES} from '../src/research-dashboard/contract.mjs';
import {runPipeline,RESEARCH_AREAS} from '../research/research-pipeline.mjs';
import {evidenceSnapshot} from '../research/pipeline-dashboard.mjs';
const id='00000000-0000-4000-8000-000000000001';
const env={PIPELINE_REQUEST_ID:id,GITHUB_RUN_ID:'38320243526',GITHUB_RUN_ATTEMPT:'1'};
const deps={preflight:async()=>{},collect:async()=>({status:'completed',literature_run_id:'run'}),
  evidence:async()=>({id:'evidence',status:'completed',budget:{model_calls:1},planner:{proposals:[]}})};
test('fixed start contract refuses arbitrary workflow/ref, unbounded budgets and invalid identities',()=>{
  assert.deepEqual(RESEARCH_CHOICES,Object.keys(RESEARCH_AREAS));
  for(const area of RESEARCH_CHOICES)assert.equal(isStart({id,area,model_budget:5}),true);
  for(const value of [null,[],{id,area:'PINNs and turbulence',model_budget:100},{id,area:'arbitrary',model_budget:5},
    {id:'../x',area:RESEARCH_CHOICES[0],model_budget:5},{id,area:RESEARCH_CHOICES[0],model_budget:5,ref:'other'}])assert.ok(!isStart(value));
});
test('pipeline checkpoints preserve exact run identity, monotonic sequence, known budgets and safe failure status',async()=>{
  const snapshots=[];const r=await runPipeline(env,{...deps,checkpoint:async s=>snapshots.push(structuredClone(s))});
  assert.equal(r.id,id);assert.equal(r.github_run_id,env.GITHUB_RUN_ID);assert.equal(r.status,'insufficient_evidence');
  assert.ok(snapshots.every(isSnapshot));assert.deepEqual(snapshots.map(s=>s.checkpoint_sequence),[1,2,3,4]);
  assert.equal(r.stages[2].summary.coverage,null);assert.ok(r.stages.every(s=>s.started_at&&s.finished_at));
  const failed=await runPipeline(env,{...deps,evidence:async()=>{throw Error('private model key');}});
  assert.equal(failed.status,'error');assert.equal(failed.budget.actual_count_complete,false);assert.ok(!JSON.stringify(failed).includes('private model key'));
  await assert.rejects(()=>runPipeline({...env,PIPELINE_REQUEST_ID:'not-a-uuid'},deps),/invalid_pipeline_request_id/);
});
test('display snapshots copy accepted findings and controlled diagnostics, omit raw abstract and model response',()=>{
  const report={papers:[{title:'title',status:'summarized',abstract:'not for dashboard',raw_model:'private',
    findings:[{kind:'result',claim:'reported result',quote:'an exact source excerpt'}],validation:{accepted_findings:1,rejected_findings:1,rejected:[{index:1,reason:'quote_not_exact'}]}}]};
  const view=evidenceSnapshot(report);assert.ok(!JSON.stringify(view).includes('not for dashboard'));assert.ok(!JSON.stringify(view).includes('private'));
  assert.equal(view.papers[0].findings[0].quote,report.papers[0].findings[0].quote);
});
test('store validates endpoints and claims a duplicate request without generating another dispatch',async()=>{
  assert.throws(()=>createPipelineStore({url:'https://attacker.example',secretKey:'sb_secret_key'}));
  const start={id,area:RESEARCH_CHOICES[0],model_budget:5};const calls=[];
  const store=createPipelineStore({url:'https://test.supabase.co',secretKey:'sb_secret_test',fetchImpl:async(u,o)=>{
    calls.push({u:String(u),o});assert.equal(o.redirect,'manual');assert.equal(o.headers.apikey,'sb_secret_test');
    if(o.method==='POST')return new Response('',{status:409});return Response.json([start]);}});
  const result=await store.enqueue(start);assert.equal(result.created,false);assert.equal(calls.length,2);
  await assert.rejects(()=>store.get('../private'),/invalid_pipeline_id/);
});
test('storage errors and oversized streams fail with controlled errors, checkpoint receipts must match',async()=>{
  const store=createPipelineStore({url:'https://test.supabase.co',secretKey:'sb_secret_test',fetchImpl:async()=>new Response('private upstream',{status:500})});
  await assert.rejects(()=>store.list(),/dashboard_storage_unavailable/);
  await assert.rejects(()=>readJson(new Response('x'.repeat(100)),50),/response_too_large/);
  const report=await runPipeline(env,deps);
  const wrong=createPipelineStore({url:'https://test.supabase.co',secretKey:'sb_secret_test',fetchImpl:async()=>Response.json('different-id')});
  await assert.rejects(()=>wrong.save(report),/invalid_checkpoint_receipt/);
});
