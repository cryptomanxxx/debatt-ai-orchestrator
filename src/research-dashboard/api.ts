import {timingSafeEqual} from 'node:crypto';
import {createPipelineStore,readJson} from './store.mjs';
import {isStart,uuid,RESEARCH_REPOSITORY,PIPELINE_WORKFLOW,RESEARCH_CHOICES} from './contract.mjs';
import {dashboardHtml,dashboardScript} from './page.ts';
import {demoRuns} from './demo.mjs';
const bytes=new TextEncoder();
const json=(status:number,value:unknown)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const configured=(env:Record<string,string|undefined>)=>Boolean(env.RESEARCH_GITHUB_TOKEN);
async function github(env:Record<string,string|undefined>,path:string,body?:unknown) {
  return fetch('https://api.github.com/repos/'+RESEARCH_REPOSITORY+'/'+path,{method:body?'POST':'GET',
    redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2026-03-10','User-Agent':'Oraklet-Research-Dashboard',
      ...(env.RESEARCH_GITHUB_TOKEN?{Authorization:'Bearer '+env.RESEARCH_GITHUB_TOKEN}:{}),
      ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
async function technical(row:any,env:Record<string,string|undefined>) {
  try {
    let id=row.github_run_id;
    if(!id) {
      const response=await github(env,`actions/workflows/${PIPELINE_WORKFLOW}/runs?branch=main&event=workflow_dispatch&per_page=30`);
      if(!response.ok){await response.body?.cancel();return null;}
      const data=await readJson(response,1200000);
      id=data.workflow_runs?.find((r:any)=>r.display_title?.endsWith(' · '+row.id)&&r.head_branch==='main')?.id;
    }
    if(!/^[1-9]\d{0,19}$/.test(String(id??'')))return null;
    const response=await github(env,'actions/runs/'+id);
    if(!response.ok){await response.body?.cancel();return null;}
    const run=await readJson(response,90000);
    if(String(run.id)!==String(id)||run.repository?.full_name!==RESEARCH_REPOSITORY)return null;
    return {status:['queued','in_progress','completed','waiting','pending','requested'].includes(run.status)?run.status:'unknown',
      conclusion:['success','failure','cancelled','timed_out','action_required','skipped','neutral','stale'].includes(run.conclusion)?run.conclusion:null,
      run_id:String(id),run_attempt:run.run_attempt,updated_at:run.updated_at,
      url:'https://github.com/'+RESEARCH_REPOSITORY+'/actions/runs/'+id};
  } catch {return null;}
}
export async function researchRoute(request:Request,env:Record<string,string|undefined>):Promise<Response|null> {
  const {pathname,search,origin}=new URL(request.url);
  if(request.method==='GET'&&!search&&(pathname==='/research'||pathname==='/research/demo'))
    return new Response(dashboardHtml(pathname.endsWith('/demo')),{headers:{...security,'Content-Type':'text/html; charset=utf-8'}});
  if(request.method==='GET'&&!search&&pathname==='/research/app.js')
    return new Response(dashboardScript,{headers:{...security,'Content-Type':'text/javascript; charset=utf-8'}});
  if(request.method==='GET'&&!search&&pathname==='/research/demo-data')return json(200,{runs:demoRuns,demo:true});
  if(!pathname.startsWith('/v1/research/'))return null;
  const match=/^\/v1\/research\/runs\/([0-9a-f-]{36})$/.exec(pathname);
  if(search||!((pathname==='/v1/research/runs'&&['GET','POST'].includes(request.method))
    ||(match&&uuid(match[1])&&request.method==='GET')))return json(404,{error:'not_found'});
  const key=env.RESEARCH_DASHBOARD_KEY;
  if(typeof key!=='string'||key.length<24)return json(503,{error:'dashboard_not_configured'});
  const actual=bytes.encode(request.headers.get('Authorization')??''),expected=bytes.encode('Bearer '+key);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return json(401,{error:'unauthorized'});
  if(request.headers.has('Origin')&&request.headers.get('Origin')!==origin)return json(403,{error:'same_origin_required'});
  try {
    const store=createPipelineStore({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
    if(request.method==='GET') {
      if(match) {const row=await store.get(match[1]);return row?json(200,{run:row,technical:await technical(row,env)}):json(404,{error:'run_not_found'});}
      return json(200,{runs:await store.list(),can_start:configured(env),areas:RESEARCH_CHOICES});
    }
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')return json(415,{error:'application_json_required'});
    let input;try {input=await readJson(request,1024);}catch {return json(400,{error:'invalid_start'});}
    if(!isStart(input))return json(400,{error:'invalid_start'});
    if(!configured(env))return json(503,{error:'research_start_not_configured'});
    // Claim before dispatch. A retry with the same UUID never dispatches twice.
    const {created,row}=await store.enqueue(input);
    if(!created)return json(200,{run:row,reused:true});
    let state='uncertain',runId=null;
    try {
      const response=await github(env,`actions/workflows/${PIPELINE_WORKFLOW}/dispatches`,{
        ref:'main',inputs:{research_area:input.area,model_budget:String(input.model_budget),dashboard_request_id:input.id}});
      if(response.status===200) {
        const receipt=await readJson(response,4096);
        if(!/^[1-9]\d{0,19}$/.test(String(receipt.workflow_run_id??'')))throw Error('invalid_dispatch_receipt');
        runId=String(receipt.workflow_run_id);state='accepted';
      } else {state=response.status===204?'accepted':[400,401,403,404,422].includes(response.status)?'failed':'uncertain';await response.body?.cancel();}
    } catch { /* No retry: GitHub might already have accepted this paid run. */ }
    await store.dispatched(input.id,state,runId);
    return json(202,{run:{...row,dispatch_status:state,github_run_id:runId}});
  } catch {return json(503,{error:'research_dashboard_unavailable'});}
}
