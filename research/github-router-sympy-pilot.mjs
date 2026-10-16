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
    models: ['Kimi-K2.6'] },
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
  if (!reader) throw new Error('empty_response_body');
  const chunks=[];let size=0;
  try {
    while(true) {
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new Error('oversized_provider_response');}
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
  const persist=async()=>{
    let snapshot=JSON.stringify(report,null,2);
    // Last-resort masking after JSON escaping (including quotes and backslashes).
    for(const secret of [env.BLABLADOR_API_KEY,env.HIP_API_KEY]) {
      if(typeof secret==='string'&&secret){
        snapshot=snapshot.replaceAll(JSON.stringify(secret).slice(1,-1),'[REDACTED]');
        snapshot=snapshot.replaceAll(secret,'[REDACTED]');
      }
    }
    await write(dir+'/report.json',snapshot+'\n');
  };
  await persist();
  try{
    if(!/^\d{1,9}$/.test(seed))throw new ResearchError('invalid_seed');
    let selected=select;
    if(!selected) {
      const {stdout}=await exec('python3',[fileURLToPath(new URL('./router_select.py',import.meta.url))],
        {timeout:65000,maxBuffer:8192,env:{
          PATH:env.PATH,ROUTER_PROVIDER:env.ROUTER_PROVIDER||'auto',
          BLABLADOR_API_KEY:env.BLABLADOR_API_KEY||'',HIP_API_KEY:env.HIP_API_KEY||''}});
      selected=JSON.parse(stdout);
    }
    const route=checkedSelection(selected,env);
    report.selected={provider:route.provider,model:route.model};
    report.routingReason=selected.reason;
    report.status='running';await persist();
    const runner=await runSympyExperiment(seed,propose||researchProposer(selected,env),tool,
      async commitments=>{report.commitments=commitments;await persist();},
      {onProgress:async cases=>{report.results=cases;await persist();}});
    report.status='completed';report.scientificStatus=runner.status;
    report.results=runner.cases;report.limitations=runner.limitations;
    await persist();return report;
  }catch(error){
    report.status='failed';
    const known=['invalid_seed','untrusted_route','untrusted_model','missing_provider_key',
      'model_call_budget_exceeded','model_identity_mismatch','incomplete_model_response',
      'invalid_model_answer','provider_secret_echoed','oversized_provider_response','invalid_model_proposal',
      'model_upstream_http_error',
      'invalid_tool_evidence','model_transport_error'];
    const originating=error?.message==='invalid_model_proposal' ? error?.details?.code : null;
    report.failureCode=known.includes(originating)?originating
      :known.includes(error?.message)?error.message:'research_pilot_failed';
    await persist();throw new Error(report.failureCode);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  runPilot().then(r=>console.log(JSON.stringify({status:r.status,scientificStatus:r.scientificStatus,selected:r.selected})))
    .catch(e=>{console.error('GitHub router SymPy pilot:',e.message);process.exitCode=1;});
