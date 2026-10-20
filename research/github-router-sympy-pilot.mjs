import {sympyWorkerPrompt} from './sympy-worker-prompt.mjs';
import {selectWorkerModel,workerInference} from './worker-research-client.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { lockModel } from './catalog.mjs';
import { ResearchError } from './errors.mjs';
import { runSympyExperiment, callSympy } from './sympy.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const exec = promisify(execFile);
export const ROUTES = Object.freeze({
  blablador: { base: 'https://api.blablador.fz-juelich.de/v1', secret: 'BLABLADOR_API_KEY',
    models: ['alias-kimi-k3-1m','alias-glm-5.3-flash'] },
  hip: { base: 'https://llm-service.ai.tu-darmstadt.de/v1', secret: 'HIP_API_KEY',
    models: ['Mistral-Medium-3.5-128B'] },
});
export function checkedSelection(selection, env) {
  if (!selection || !Object.hasOwn(ROUTES,selection.provider)) throw new Error('untrusted_route');
  const route = ROUTES[selection.provider];
  if (!route.models.includes(selection.model)) throw new Error('untrusted_model');
  if (typeof env[route.secret] !== 'string' || env[route.secret].length < 8) throw new Error('missing_provider_key');
  return { ...route, provider: selection.provider, model: selection.model };
}
export async function readJsonBounded(response, maxBytes=65536) {
  const reader = response.body?.getReader();
  if (!reader) throw new ResearchError('invalid_model_response');
  const chunks=[];let size=0;
  try {
    while(true) {
      let packet;
      try {packet=await reader.read();} catch {throw new ResearchError('model_transport_error');}
      const {value,done}=packet;if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new ResearchError('oversized_provider_response');}
      chunks.push(Buffer.from(value));
    }
    try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch {throw new ResearchError('invalid_model_response');}
  } finally {reader.releaseLock();}
}
export function researchProposer(selection, env, fetchImpl=fetch) {
  const route=checkedSelection(selection,env);
  let calls=0;
  const fail = code => { throw new ResearchError(code); };
  return lockModel(async messages => {
    if (++calls > 3) fail('model_call_budget_exceeded');
    // No tools or secrets pass to the model. This single experiment locks the
    // provider and model rather than silently failing over after selection.
    let response;
    try {
      response=await fetchImpl(route.base+'/chat/completions',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),
      headers:{Authorization:'Bearer '+env[route.secret],'Content-Type':'application/json'},
      body:JSON.stringify({model:route.model,messages,max_tokens:768,temperature:0}),
      });
    } catch {
      fail('model_transport_error');
    }
    if(!response.ok){await response.body?.cancel();fail('model_upstream_http_error');}
    const data=await readJsonBounded(response);
    if(data?.model!==route.model)fail('model_identity_mismatch');
    if(data?.choices?.[0]?.finish_reason!=='stop')fail('incomplete_model_response');
    const answer=data?.choices?.[0]?.message?.content;
    if(typeof answer!=='string'||!answer.trim()||answer.length>12000)fail('invalid_model_answer');
    for (const secret of [env.BLABLADOR_API_KEY, env.HIP_API_KEY]) {
      if (typeof secret === 'string' && secret && answer.includes(secret)) fail('provider_secret_echoed');
    }
    return {text:answer,provider:route.provider,model:route.model};
  });
}
export async function runPilot({env=process.env,select,propose,tool=callSympy,write=writeFile}={}) {
  const seed=env.EXPERIMENT_SEED||'20261016';

  const dir='reports/github-router-sympy';
  await mkdir(dir,{recursive:true});
  const report={schemaVersion:1,status:'preflight',seed,startedAt:new Date().toISOString(),
    githubSha:env.GITHUB_SHA||null,modelCallsMax:3,results:[]};
  const safeIssues=issues=>Array.isArray(issues)?issues.filter(x=>
    x&&typeof x==='object'&&Object.hasOwn(ROUTES,x.provider)&&typeof x.error==='string'&&
    (['key_not_configured','not_listed','invalid_api_key','upstream_timeout',
      'upstream_transport_error','invalid_upstream_json','invalid_model_discovery','oversized_response'].includes(x.error)
       || /^http_[1-5][0-9]{2}$/.test(x.error))).slice(0,12).map(x=>({provider:x.provider,error:x.error,
      ...(ROUTES[x.provider].models.includes(x.model)?{model:x.model}:{})})):[];
  const persist=async()=>{
    // Recursively redact only string values, never serialized object structure.
    const secrets=[env.BLABLADOR_API_KEY,env.HIP_API_KEY]
      .filter(x=>typeof x==='string'&&x.length>=8&&!/\s/.test(x)).sort((a,b)=>b.length-a.length);
    const redact=value=>{
      if(typeof value==='string') {
        for(const secret of secrets)value=value.replaceAll(secret,'[REDACTED]');
        return value;
      }
      if(Array.isArray(value))return value.map(redact);
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)]));
      return value;
    };
    const snapshot=JSON.stringify(redact(report),null,2);
    await write(dir+'/report.json',snapshot+'\n');
  };
  await persist();
  try{
    if(!/^\d{1,9}$/.test(seed))throw new ResearchError('invalid_seed');
    let selected=select;
    if(!selected) {
      try {
        selected=await selectWorkerModel(env.ROUTER_PROVIDER||'auto','reasoning',env.ORCHESTRATOR_API_KEY);
      } catch(error) {
        // Preserve only defined, non-sensitive diagnostic codes, never upstream bodies.
        const knownSelection=new Set(['missing_orchestrator_key','invalid_route_options',
          'invalid_worker_catalog','no_available_allowlisted_model','worker_missing_body',
          'worker_response_too_large','worker_invalid_json']);
        const code=error instanceof Error ? error.message : '';
        throw new ResearchError(knownSelection.has(code) || /^worker_http_[0-9]{3}$/.test(code)
          ? code : 'router_selection_failed');
      }
      // The authenticated Worker catalog already selected the bounded model.
    }
    const route=selected && !select ? {provider:selected.provider,model:selected.model} : checkedSelection(selected,env);
    report.selected={provider:route.provider,model:route.model,
      backendIdentityVerified:false,
      identityScope:'api_model_id_only',
      aliasMayRetarget:route.model.startsWith('alias-')};
    report.routingReason=selected.reason;
    // Routing issues are fixed, non-secret diagnostic enums from the Python selector.
    report.discoveryIssues=safeIssues(selected.issues);
    report.status='running';await persist();
    const runner=await runSympyExperiment(seed,propose||(!select ? async messages=>({
      text:await (async()=>{
        try {return await workerInference(selected,sympyWorkerPrompt(messages),env.ORCHESTRATOR_API_KEY);}
        catch(error){
          const code=error instanceof Error ? error.message : '';
          const safe=new Set(['missing_orchestrator_key','invalid_worker_inference',
            'invalid_worker_inference_response','worker_missing_body','worker_response_too_large',
            'worker_invalid_json']);
          throw new ResearchError(safe.has(code)||/^worker_http_[0-9]{3}$/.test(code)
            ? code : 'model_transport_error');
        }
      })(),
      provider:selected.provider,model:selected.model
    }) : researchProposer(selected,env)),tool,
      async commitments=>{report.commitments=commitments;await persist();},
      {onProgress:async cases=>{report.results=cases;await persist();}});
    report.status='completed';report.scientificStatus=runner.status;
    report.results=runner.cases;report.limitations=runner.limitations;
    await persist();return report;
  }catch(error){
    report.status='failed';
    const known=['missing_orchestrator_key','no_available_allowlisted_model','invalid_worker_inference_response','invalid_worker_inference','invalid_worker_catalog','invalid_route_options','worker_http_502','worker_missing_body','worker_response_too_large','worker_invalid_json','invalid_seed','untrusted_route','untrusted_model','missing_provider_key',
      'model_call_budget_exceeded','model_identity_mismatch','incomplete_model_response',
      'invalid_model_answer','provider_secret_echoed','oversized_provider_response','invalid_model_proposal',
      'model_upstream_http_error','invalid_model_response','no_available_allowlisted_model','router_selection_failed',
      'invalid_tool_evidence','model_transport_error','tool_transport_error'];
    const originating=error?.message==='invalid_model_proposal' ? error?.details?.code : null;
    if(error instanceof ResearchError){
      const {case: caseNumber,operation}=error.diagnostic||{};
      if(Number.isInteger(caseNumber)&&caseNumber>=1&&caseNumber<=3)report.failureCase=caseNumber;
      if(['initial_proposal','correction','positive_control','negative_control'].includes(operation))report.failureOperation=operation;
    }
    report.failureCode=known.includes(originating)?originating
      :known.includes(error?.message) || /^worker_http_[0-9]{3}$/.test(error?.message||'')
        ? error.message:'research_pilot_failed';
    await persist();throw new Error(report.failureCode);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  runPilot().then(r=>console.log(JSON.stringify({status:r.status,scientificStatus:r.scientificStatus,selected:r.selected})))
    .catch(e=>{console.error('GitHub router SymPy pilot:',e.message);process.exitCode=1;});
