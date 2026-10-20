import test from 'node:test';
import assert from 'node:assert/strict';
import {selectWorkerModel,workerInference} from '../research/worker-research-client.mjs';
const key='x'.repeat(30);
function mocked(url,opts){
 assert.ok(url.startsWith('https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/research/'));
 assert.equal(opts.headers.Authorization,'Bearer '+key);
 if(url.endsWith('/models')) return Response.json({status:'discovered_unverified',providers:{
  hip:{status:'catalog_unverified',provider:'hip',backendIdentityVerified:false,models:['Mistral-Medium-3.5-128B','GLM-5.2-AWQ-INT4']},
  blablador:{status:'catalog_unverified',provider:'blablador',backendIdentityVerified:false,models:['alias-glm-5.3-flash','alias-fast']}
 }});
 const body=JSON.parse(opts.body);
 assert.deepEqual(Object.keys(body).sort(),['model','prompt','provider']);
 return Response.json({status:'completed_unverified',provider:body.provider,model:body.model,
  answer:'{"method":"sympy","roots":["2","3"],"reason":"verified"}',
  scientificallyVerified:false,backendIdentityVerified:false});
}
test('discovers HIP/Blablador only via Worker with fixed allowlists',async()=>{
 const fetchImpl=async(url,opts)=>mocked(url,opts);
 assert.deepEqual((await selectWorkerModel('hip','reasoning',key,fetchImpl)).model,'Mistral-Medium-3.5-128B');
 assert.deepEqual((await selectWorkerModel('blablador','coding',key,fetchImpl)).model,'alias-glm-5.3-flash');
 assert.deepEqual((await selectWorkerModel('auto','reasoning',key,fetchImpl)).provider,'blablador');
});
test('uses only orchestrator authentication and validates inference output',async()=>{
 const fetchImpl=async(url,opts)=>mocked(url,opts);
 const answer=await workerInference({provider:'hip',model:'GLM-5.2-AWQ-INT4'},'Solve',key,fetchImpl);
 assert.match(answer,/sympy/);
 await assert.rejects(workerInference({provider:'hip',model:'Kimi-K2.6'},'Solve',key,fetchImpl),/invalid_worker_inference/);
 await assert.rejects(workerInference({provider:'hip',model:'GLM-5.2-AWQ-INT4'},'Solve',key,
  async()=>Response.json({status:'completed_unverified',provider:'hip',model:'wrong',answer:'x',
    scientificallyVerified:false,backendIdentityVerified:false})),/invalid_worker_inference_response/);
});
test('fails closed if catalog does not confirm selected model',async()=>{
 await assert.rejects(selectWorkerModel('blablador','coding',key,async()=>Response.json({
  status:'discovered_unverified',providers:{blablador:{status:'catalog_unverified',provider:'blablador',
    backendIdentityVerified:false,models:['undocumented-only']}}
 })),/no_available_allowlisted_model/);
});
test('does not pass arbitrary models or oversized output',async()=>{
 await assert.rejects(workerInference({provider:'hip',model:'Mistral-Medium-3.5-128B'},
  'hello',key,async()=>new Response('x'.repeat(150000))),/worker_response_too_large/);
});
