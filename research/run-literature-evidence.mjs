import { mkdir,writeFile,appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { EVIDENCE_MESSAGE_LIMIT,boundedJson,createLiteratureEvidenceClient,createLiteratureAbstractLoader,buildEvidenceReport,renderEvidenceReport,validateEvidenceOptions } from './literature-evidence.mjs';

import { createAnalysisRegistryClient } from './literature-analysis-registry.mjs';
import { createFollowUpClient } from './literature-follow-up.mjs';
import { createAbstractArchiveClient,createArchivedAbstractLoader } from './literature-abstract-archive.mjs';

export async function readEvidenceModelProfile({key,fetchImpl=fetch}) {
  if (typeof key!=='string'||key.length<24) throw new Error('missing_orchestrator_key');
  const response=await fetchImpl('https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/model-profile', {
    headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!response.ok) {await response.body?.cancel();throw new Error('model_profile_unavailable');}
  const profile=await boundedJson(response,4096);
  if (profile?.provider!=='openai'||typeof profile.model!=='string'||!profile.model||profile.model.length>200
    ||profile.model.includes('\u0000')||!/^[a-f0-9]{64}$/.test(profile.fingerprint??'')
    ||profile.mode!=='default'||profile.completionTokenLimit!==4096) throw new Error('invalid_model_profile');
  return {provider:profile.provider,model:profile.model,fingerprint:profile.fingerprint,
    mode:profile.mode,completionTokenLimit:profile.completionTokenLimit};
}

export function createEvidenceSummarizer({key,profile=null,fetchImpl=fetch}) {
  if (typeof key!=='string'||key.length<24) throw new Error('missing_orchestrator_key');
  return async prompt=>{
    const message=JSON.stringify(prompt);
    if (typeof message!=='string'||message.length>EVIDENCE_MESSAGE_LIMIT) throw new Error('evidence_prompt_too_large');
    let response;
    try {response=await fetchImpl('https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/query',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),
      headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({message,mode:'default',completionTokenLimit:4096,
        ...(profile?{expectedModelFingerprint:profile.fingerprint}:{})})});}
    catch {throw new Error('literature_transport_error');}
    if (!response.ok) {await response.body?.cancel();throw new Error('literature_http_'+response.status);}
    const data=await boundedJson(response,65536);
    if (data.mock!==false||typeof data.answer!=='string'||typeof data.provider!=='string'||!data.provider
      ||typeof data.model!=='string'||!data.model||data.provider.length>200||data.model.length>200) throw new Error('invalid_model_response');
    if (data.inference?.completionTokenLimit!==4096) throw new Error('model_budget_not_applied');
    if (profile&&(data.provider!==profile.provider||data.model!==profile.model||data.modelFingerprint!==profile.fingerprint))
      throw new Error('model_profile_changed');
    return {text:data.answer,provider:data.provider,model:data.model};
  };
}

export async function main(env=process.env) {
  const options=validateEvidenceOptions({queryIndex:Number(env.LITERATURE_QUERY_INDEX??0),maxPapers:Number(env.LITERATURE_MAX_PAPERS??5)});
  const client=createLiteratureEvidenceClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  const archive=createAbstractArchiveClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  const analysisStore=createAnalysisRegistryClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  const directory='reports/literature-evidence';
  await mkdir(directory,{recursive:true});
  // Missing migration/configuration must fail before any model calls are spent.
  await client.checkReportStorage();
  await archive.checkStorage();
  await analysisStore.checkStorage();
  const modelProfile=await readEvidenceModelProfile({key:env.ORCHESTRATOR_API_KEY});
  const summarize=createEvidenceSummarizer({key:env.ORCHESTRATOR_API_KEY,profile:modelProfile});
  const followUpReview=env.FOLLOW_UP_REPORT_ID?await createFollowUpClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY}).readFollowUp(env.FOLLOW_UP_REPORT_ID):null;
  if (followUpReview && env.LITERATURE_RUN_ID && env.LITERATURE_RUN_ID.toLowerCase()!==followUpReview.literature_run_id)
    throw Error('follow_up_run_mismatch');
  const input=await client.readQuery({runId:followUpReview?.literature_run_id??(env.LITERATURE_RUN_ID||null),...options,followUpReview});
  const report=await buildEvidenceReport(input,{id:randomUUID(),summarize,analysisStore,modelProfile,
    loadAbstract:createArchivedAbstractLoader({client:archive,loadAbstract:createLiteratureAbstractLoader({apiKey:env.OPENALEX_API_KEY||''})})});
  report.code_commit=env.GITHUB_SHA||null;
  if (input.selection_review) report.selection_review=input.selection_review;
  await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');
  const markdown=renderEvidenceReport(report);
  await writeFile(directory+'/report.md',markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,markdown);
  // Reports exist before attempting storage, so a write failure is recoverable.
  await client.saveReport(report);
  console.log(JSON.stringify({saved:true,report_id:report.id,status:report.status,coverage:report.coverage,model_calls:report.budget.model_calls}));
  if (report.status==='insufficient_evidence') throw new Error('no_usable_evidence_report_saved');
}
if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{console.error('Literature evidence run failed. Inspect the report artifact and step summary, if produced.');process.exitCode=1;});
}
