// Existing four scientific task categories, now via the Cloudflare-only client.
import {mkdir,writeFile} from 'node:fs/promises';
import {selectWorkerModel,workerInference} from './worker-research-client.mjs';
const PROMPTS={
 reasoning:'Solve this exactly, showing a short check: for x^2 - 5x + 6 = 0, list both real roots.',
 literature:'Explain how one can distinguish a hypothesis from evidence in a scientific literature review. State two limitations.',
 coding:'Explain how to test a Python function for edge cases, then provide one simple test for a pure square function.',
 fast:'Give a concise explanation of the difference between correlation and causation.'
};
const task=process.env.ROUTER_TASK||'reasoning',provider=process.env.ROUTER_PROVIDER||'auto';
const report={schema_version:2,status:'preflight',task,scientifically_verified:false};
await mkdir('reports/scientific-model-router',{recursive:true});
const save=()=>writeFile('reports/scientific-model-router/report.json',JSON.stringify(report,null,2)+'\n');
await save();
try{
 if(!Object.hasOwn(PROMPTS,task))throw Error('invalid_task');
 const key=process.env.ORCHESTRATOR_API_KEY;
 const selection=await selectWorkerModel(provider,task,key);
 const start=performance.now();
 const answer=await workerInference(selection,PROMPTS[task],key);
 // Keep data minimization: save bounded output, never secrets or raw provider response.
 report.status='completed_unverified';
 report.selected={provider:selection.provider,model:selection.model,reason:selection.reason,
   backendIdentityVerified:false};
 report.latency_seconds=Math.round((performance.now()-start)/10)/100;
 report.prompt=PROMPTS[task];
 report.answer=answer.slice(0,6000);
 report.limitations='Smoke-test answer, not independent scientific verification';
 await save();
 console.log('Cloudflare scientific router:',selection.provider,selection.model,report.status);
}catch(error){
 report.status='failed';
 const known=new Set(['missing_orchestrator_key','invalid_route_options','no_available_allowlisted_model',
   'invalid_worker_catalog','invalid_worker_inference','invalid_worker_inference_response',
   'worker_missing_body','worker_response_too_large','worker_invalid_json']);
 report.error=known.has(error?.message)?error.message:/^worker_http_[0-9]{3}$/.test(error?.message||'')?error.message:'worker_research_failed';
 await save();
 console.error('Cloudflare scientific router:',report.error);
 process.exitCode=1;
}
