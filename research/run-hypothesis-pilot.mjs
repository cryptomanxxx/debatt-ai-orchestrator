import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runHypothesisPilot } from './hypothesis-pilot.mjs';
import { callScienceTool } from './python-tools.mjs';
import { ResearchError, diagnostic } from './errors.mjs';

const API='https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/query';
const DB='https://fmwxftnistkoqazfwnuj.supabase.co/rest/v1/oraklet_experiment';
const key=process.env.ORCHESTRATOR_API_KEY||'',serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
if(key.length<24 || !serviceKey) throw new Error('Orchestrator- och databasnycklar krävs');
const directory='reports/oraklet-hypothesis';
await mkdir(directory,{recursive:true});
let modelCalls=0,toolCalls=0,partial={},report,failed=false;
async function readJson(response) {
  const reader=response.body?.getReader();if(!reader)throw new ResearchError('invalid_model_response');
  const chunks=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>65536){await reader.cancel();throw new ResearchError('invalid_model_response');}chunks.push(Buffer.from(value));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {reader.releaseLock();}
}
try {
  report=await runHypothesisPilot(async messages=>{
    if(++modelCalls>1)throw new ResearchError('model_budget_exceeded');
    let response;
    try {response=await fetch(API,{method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({message:JSON.stringify({instruction:'Följ denna konversation och svara endast med begärd JSON.',messages}),mode:'default',completionTokenLimit:4096})});}
    catch {throw new ResearchError('model_transport_error');}
    if(response.status!==200){await response.body?.cancel();throw new ResearchError('model_http_error',{httpStatus:response.status});}
    const result=await readJson(response);
    if(result.mock!==false || typeof result.answer!=='string' || !result.provider || !result.model)throw new ResearchError('invalid_model_response');
    if(result.inference?.completionTokenLimit!==4096)throw new ResearchError('model_budget_not_applied');
    return {text:result.answer,provider:result.provider,model:result.model};
  },async input=>{
    if(++toolCalls>2)throw new ResearchError('tool_budget_exceeded');
    return callScienceTool('statsmodels',input);
  },async commitment=>{
    await writeFile(`${directory}/commitment.json`,JSON.stringify(commitment,null,2));
    console.log('Hypotes låst före analys:',commitment.sha256);
  },async progress=>{
    partial=progress;
    await writeFile(`${directory}/progress.json`,JSON.stringify(progress,null,2));
  });
} catch(error) {
  failed=true;
  report={schemaVersion:2,experimentId:'oraklet-macro-hypothesis-pilot',title:'Oraklets hypotesförsök avbröts',
    researcher:'Professor Oraklet',status:'failed',executionStatus:'error',failure:diagnostic(error),...partial,
    limitations:'Avbruten körning. Delresultat utan slutförd kontroll ger ingen verifierad slutsats.'};
}
Object.assign(report,{reportId:randomUUID(),createdAt:new Date().toISOString(),codeCommit:process.env.GITHUB_SHA||null,
  runUrl:/^\d+$/.test(process.env.GITHUB_RUN_ID||'')?`https://github.com/cryptomanxxx/debatt-ai-orchestrator/actions/runs/${process.env.GITHUB_RUN_ID}`:null,
  modelCalls,toolCalls,inferenceSettings:{completionTokenLimit:4096}});
await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
const m=report.evidence?.result;
const markdown=`# ${report.title}\n\n`+(failed?`Driftfel: ${JSON.stringify(report.failure)}\n\n`:
  `Oraklets fråga: ${report.hypothesis.question}\n\nMotivering: ${report.hypothesis.rationale}\n\n`+
  `Vald variabel: ${report.hypothesis.variable}. H0: phi=0. H1: phi!=0. Alpha: 0.05.\n\n`+
  `Träning: ${report.periods.trainingStart}–${report.periods.trainingEnd}; prognoskontroll: ${report.periods.holdoutStart}–${report.periods.holdoutEnd}.\n\n`+
  `Uppmätt phi: ${m.phi.toPrecision(5)}; p: ${m.pvalue.toPrecision(5)}; 95% intervall: [${m.confidenceInterval95.map(v=>v.toPrecision(5)).join(', ')}].\n\n`+
  `Prognos-RMSE: ${m.holdoutRmse.toPrecision(5)}; persistens-RMSE: ${m.persistenceRmse.toPrecision(5)}.\n\n`+
  `${report.conclusion}\n\nDatakälla: ${report.dataset.source}. Historisk dataversion, inte dagens reviderade statistik.\n\n`)+
  `${report.limitations}\n\nHypotesen formulerades inom en fast metodklass; detta är ett avgränsat pilotförsök.\n`;
await writeFile(`${directory}/report.md`,markdown);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,markdown);
const saved=await fetch(DB,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',Prefer:'return=minimal'},
  body:JSON.stringify({id:report.reportId,titel:report.title,status:report.status,rapport:report,skapad:report.createdAt})});
await saved.body?.cancel();if(!saved.ok)throw new Error('Rapporten kunde inte sparas; filer finns i artefakten');
console.log('HYPOTHESIS_PILOT_RESULT',JSON.stringify({reportId:report.reportId,executionStatus:report.executionStatus,
  hypothesis:report.hypothesis,provider:report.provider,model:report.model,periods:report.periods,
  outcome:report.hypothesisOutcome,phi:m?.phi,pvalue:m?.pvalue,confidenceInterval95:m?.confidenceInterval95,
  holdoutRmse:m?.holdoutRmse,persistenceRmse:m?.persistenceRmse,independentlyVerified:report.independentlyVerified,
  modelCalls,toolCalls,failure:report.failure}));
if(failed)throw new Error('Hypotesförsöket avbröts; driftfelsrapport sparad');
