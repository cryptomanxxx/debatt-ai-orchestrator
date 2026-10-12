import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {DEFAULT_QUERIES} from './literature-benchmark.mjs';
import {main as collect} from './collect-literature.mjs';
import {main as evidence} from './run-literature-evidence.mjs';
import {main as followUp,createFollowUpClient} from './literature-follow-up.mjs';
import {createLiteratureEvidenceClient} from './literature-evidence.mjs';

export const RESEARCH_AREAS = Object.freeze({
  'PINNs and turbulence':DEFAULT_QUERIES[0],
  'Experiment design':DEFAULT_QUERIES[1],
  'Kalman state estimation':DEFAULT_QUERIES[2],
  'Causal inference':DEFAULT_QUERIES[3],
  'Model evaluation':DEFAULT_QUERIES[4],
});
export function pipelineOptions(env) {
  const area=env.RESEARCH_AREA??'PINNs and turbulence';
  const budget=Number(env.PIPELINE_MODEL_BUDGET??5);
  if (!Object.hasOwn(RESEARCH_AREAS,area)||![5,10].includes(budget)) throw Error('invalid_pipeline_options');
  return {area,query:RESEARCH_AREAS[area],budget,initialQuota:Math.ceil(budget/2),followUpQuota:Math.floor(budget/2)};
}
export function choosePipelineCandidate(report) {
  const candidates=(report.planner?.proposals??[]).filter(p=>p.status==='candidate_unverified'&&p.evidence?.length);
  // Prefer existing limitation review tasks, then stable ID; not a merit ranking.
  return [...candidates].sort((a,b)=>(b.gap_candidates?.length??0)+(b.limitation_review?.filter(r=>r.limitation_status!=='prior_work').length??0)
    -((a.gap_candidates?.length??0)+(a.limitation_review?.filter(r=>r.limitation_status!=='prior_work').length??0))
    ||(a.id<b.id?-1:a.id>b.id?1:0))[0]??null;
}

export async function chooseFollowUpQuery(report,readQuery) {
  if (typeof readQuery!=='function'||!Array.isArray(report.queries)||report.queries.length<1||report.queries.length>2)
    throw Error('invalid_query_selection_context');
  const counts=[];
  for (let index=0;index<report.queries.length;index++) {
    // Use the same canonical grouping, title precedence and origin policy as final analysis.
    const input=await readQuery({runId:report.literature_run_id,queryIndex:index,maxPapers:10,followUpReview:report});
    const count=input.selection_review?.eligible;
    if (input.literature_run_id!==report.literature_run_id||input.query_index!==index
      ||input.selection_review?.follow_up_report_id!==report.id||!Number.isInteger(count)||count<0||count>400)
      throw Error('invalid_canonical_query_count');
    counts.push({index,count});
  }
  counts.sort((a,b)=>b.count-a.count||a.index-b.index);
  return counts[0].index;
}

export async function runPipeline(env,{collect,evidence,followUp,preflight,readQuery,checkpoint=async()=>{}}) {
  const options=pipelineOptions(env);
  const report={schema_version:'research-pipeline-1',created_at:new Date().toISOString(),
    status:'running',area:options.area,query:options.query,
    budget:{maximum_model_calls:options.budget,initial_quota:options.initialQuota,follow_up_quota:options.followUpQuota,known_model_calls:0},
    stages:[],execution_enabled:false,candidate_selection:'Existing review tasks, then stable candidate ID; no scientific merit ranking.'};
  let stage;
  async function begin(name,quota=0) {
    stage={name,status:'running',maximum_model_calls:quota,model_calls:quota===0?0:null};
    report.stages.push(stage);await checkpoint(report);
  }
  function modelCount(result,quota) {
    const n=result.budget?.model_calls;
    if (!Number.isInteger(n)||n<0||n>quota) throw Error('invalid_stage_model_count');
    stage.model_calls=n;report.budget.known_model_calls+=n;
  }
  try {
    await begin('preflight');await preflight();stage.status='completed';stage.model_calls=0;
    await begin('collection');
    const collection=await collect({...env,LITERATURE_MAX_ABSTRACTS:'10'},
      {queries:[options.query],directory:'reports/research-pipeline/collection'});
    if (!collection.literature_run_id) throw Error('missing_collection_receipt');
    stage.status=collection.status;stage.model_calls=0;stage.literature_run_id=collection.literature_run_id;
    await begin('initial_evidence',options.initialQuota);
    const initial=await evidence({...env,LITERATURE_RUN_ID:collection.literature_run_id,LITERATURE_QUERY_INDEX:'0',
      LITERATURE_MAX_PAPERS:String(options.initialQuota),FOLLOW_UP_REPORT_ID:''},
      {directory:'reports/research-pipeline/initial-evidence',allowInsufficient:true});
    modelCount(initial,options.initialQuota);stage.status=initial.status;stage.report_id=initial.id;
    const candidate=choosePipelineCandidate(initial);
    if (!candidate) {report.status='insufficient_evidence';report.stop_reason='No evidence-backed candidate available for follow-up.';}
    else {
      report.candidate_id=candidate.id;
      await begin('follow_up_search');
      const follow=await followUp({...env,PLANNER_REPORT_ID:initial.id,RESEARCH_CANDIDATE_ID:candidate.id,
        LIMITATION_ARTICLE_ID:'',LIMITATION_FINDING_INDEX:''},{directory:'reports/research-pipeline/follow-up'});
      stage.status=follow.status;stage.model_calls=0;stage.report_id=follow.id;stage.literature_run_id=follow.literature_run_id;
      await begin('follow_up_selection');
      const queryIndex=await chooseFollowUpQuery(follow,readQuery);
      stage.status='completed';stage.query_index=queryIndex;
      await begin('follow_up_evidence',options.followUpQuota);
      stage.query_index=queryIndex;
      const final=await evidence({...env,FOLLOW_UP_REPORT_ID:follow.id,LITERATURE_RUN_ID:'',LITERATURE_QUERY_INDEX:String(queryIndex),
        LITERATURE_MAX_PAPERS:String(options.followUpQuota)},
        {directory:'reports/research-pipeline/follow-up-evidence',allowInsufficient:true});
      modelCount(final,options.followUpQuota);stage.status=final.status;stage.report_id=final.id;
      report.selection_review=final.selection_review??null;
      report.status=['insufficient_relevant_hits','insufficient_abstract_identifiers'].includes(final.selection_review?.outcome)?final.selection_review.outcome:
        final.status==='insufficient_evidence'?'insufficient_evidence':report.stages.some(s=>s.status==='partial')?'partial':'completed';
    }
  } catch {
    if (stage) stage.status='error';
    report.status='error';report.stop_reason='Pipeline stage failed; inspect its checkpoint/artifact. Raw errors are not included.';
    // The in-flight stage may have spent some of its quota. Do not invent an actual count.
    report.budget.actual_count_complete=stage?.model_calls!==null;
  }
  report.finished_at=new Date().toISOString();await checkpoint(report);return report;
}

export function renderPipeline(report) {
  return ['# Oraklet research pipeline','',`Status: ${report.status}. Area: ${report.area}.`,
    `Model-call limit: ${report.budget.maximum_model_calls}; known completed calls: ${report.budget.known_model_calls}.`,
    ...(report.budget.actual_count_complete===false?['Failed in-flight stage: actual calls unknown, bounded by its reserved quota.']:[]),
    '',...report.stages.map(s=>`${s.name}: ${s.status}; model calls ${s.model_calls??'unknown'}; report ${s.report_id??'n/a'}; literature run ${s.literature_run_id??'n/a'}.`),
    '',report.stop_reason??'No experiments executed. Research gaps and novelty remain unverified.',''].join('\n');
}

export async function main(env=process.env) {
  pipelineOptions(env); // Reject invalid inputs before writing or spending anything.
  const directory='reports/research-pipeline';await mkdir(directory,{recursive:true});
  const checkpoint=r=>writeFile(directory+'/pipeline.json',JSON.stringify(r,null,2)+'\n');
  const report=await runPipeline(env,{collect,evidence,followUp,checkpoint,
    readQuery:options=>createLiteratureEvidenceClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY}).readQuery(options),
    preflight:()=>createFollowUpClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY}).checkStorage()});
  const markdown=renderPipeline(report);await writeFile(directory+'/pipeline.md',markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,markdown);
  console.log(JSON.stringify({status:report.status,budget:report.budget}));
  if (report.status==='error') throw Error('research_pipeline_failed');
  return report;
}
if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{console.error('Research pipeline failed. Inspect its report artifact and summary.');process.exitCode=1;});
}
