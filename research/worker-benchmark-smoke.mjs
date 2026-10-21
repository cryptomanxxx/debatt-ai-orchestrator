// Manual, bounded production check. Never persist prompts, responses or credentials.
import { WORKER, workerRequest } from './worker-research-client.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const provider=process.env.RESEARCH_PROVIDER;
const key=process.env.ORCHESTRATOR_API_KEY;
if(!['hip','blablador'].includes(provider)||!key||key.length<24)throw Error('invalid_smoke_configuration');
const endpoint=WORKER+'/v1/research/benchmark';
const probe=await fetch(endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),
  headers:{'Content-Type':'application/json',Authorization:'Bearer invalid-smoke-token'},
  body:'{}'});
await probe.body?.cancel().catch(()=>{});
if(probe.status!==401)throw Error('benchmark_not_deployed_or_auth_unexpected_'+probe.status);
const inventory=await workerRequest('/v1/research/models',key,null);
const entry=inventory?.providers?.[provider];
if(inventory?.status!=='discovered_unverified'||entry?.status!=='catalog_unverified')
 throw Error('provider_catalog_unavailable');
const preferred=provider==='hip'?['Mistral-Medium-3.5-128B','GLM-5.2-AWQ-INT4']:[];
const catalogModels=Array.isArray(entry.models)?entry.models:[];
const eligible=catalogModels.filter(x=>typeof x==='string'&&
 /^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,199}$/.test(x)&&!x.toLowerCase().startsWith('alias-')&&
 !['default','fast','gpt-3.5-turbo','text-davinci-003','text-embedding-ada-002'].includes(x.toLowerCase())&&
 !/embedding|rerank|bge-|gte-|whisper|transcri|tts|audio|image|all-proxy|moderation|anonymiz/i.test(x));
const model=preferred.find(x=>eligible.includes(x))||eligible[0];
if(!model)throw Error('no_compatible_smoke_model');
const body={provider,model,profile:'standard',max_tokens:64,
 messages:[{role:'system',content:'Return a brief answer.'},{role:'user',content:'What is 2 + 2? Reply with the number only.'}]};
const result=await workerRequest('/v1/research/benchmark',key,body);
if(result?.status!=='completed_unverified'||result.provider!==provider||result.model!==model||
    result.scientificallyVerified!==false||result.backendIdentityVerified!==false||
    typeof result.answer!=='string'||!result.answer.trim()||result.answer.includes(key)||
    typeof result.completion_latency_seconds!=='number'||!Number.isFinite(result.completion_latency_seconds))
 throw Error('invalid_benchmark_response');
const fields=['prompt_tokens','completion_tokens','total_tokens'];
const reportedUsage=result.usage;
if(!reportedUsage||typeof reportedUsage!=='object'||Array.isArray(reportedUsage)||
    Object.keys(reportedUsage).some(k=>!fields.includes(k))||
    fields.some(k=>!Object.hasOwn(reportedUsage,k)||!(reportedUsage[k]===null||
      (Number.isSafeInteger(reportedUsage[k])&&reportedUsage[k]>=0)))||
    (reportedUsage.completion_tokens!==null&&reportedUsage.completion_tokens>64))
 throw Error('invalid_benchmark_usage');
const safeUsage=Object.fromEntries(fields.map(k=>[k,reportedUsage[k]]));
await mkdir('reports/worker-benchmark-smoke',{recursive:true});
await writeFile('reports/worker-benchmark-smoke/report.json',JSON.stringify({
 schemaVersion:1,provider,model,status:'completed_unverified',
 benchmarkGatewayDeployed:true,backendIdentityVerified:false,scientificallyVerified:false,
 completionLatencySeconds:result.completion_latency_seconds,
 usage:safeUsage},null,2)+'\n');
console.log(provider+': benchmark gateway accepted a bounded Cloudflare-backed request; answer not stored.');
