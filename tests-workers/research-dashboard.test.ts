import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const key='dashboard-key-at-least-24-characters',id='00000000-0000-4000-8000-000000000001';
const start={id,area:'PINNs and turbulence',model_budget:5};
const runtime=(options={})=>new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.worker-build/worker.js',
  compatibilityDate:'2026-10-05',compatibilityFlags:['nodejs_compat'],bindings:{RESEARCH_DASHBOARD_KEY:key,
    SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',RESEARCH_GITHUB_TOKEN:'private-github-token',RESEARCH_DASHBOARD_ENABLED:'true'},...options}));
const request=(r:Miniflare,path='runs',body?:unknown,headers={})=>r.dispatchFetch('https://worker.test/v1/research/'+path,{
  method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
test('public shell/demo use no credentials or model config; API authenticates before touching storage',async()=>{
  let calls=0;const r=runtime({outboundService:async()=>{calls++;throw Error('Must not fetch');}});
  try {for(const path of ['/research','/research/demo','/research/app.js','/research/demo-data']){
    const response=await r.dispatchFetch('https://worker.test'+path);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
    if(path==='/research') {assert.match(response.headers.get('Content-Security-Policy')??'',/frame-ancestors 'none'/);assert.ok(!(await response.text()).includes('private-github-token'));}}
    assert.equal((await request(r,'runs',start,{Authorization:'Bearer wrong'})).status,401);
    assert.equal((await request(r,'runs',start,{Origin:'https://attacker.example'})).status,403);
    assert.equal((await request(r,'runs',{...start,model_budget:100})).status,400);
    assert.equal((await request(r,'runs',{...start,ref:'other'})).status,400);
    assert.equal((await request(r,'runs?extra=1')).status,404);assert.equal(calls,0);
  }finally{await r.dispose();}
});
test('fixed main workflow starts once per UUID; repeated starts and detail preserve exact identity',async()=>{
  let row:any=null,dispatches=0;
  const r=runtime({outboundService:async(req:Request)=>{
    const u=new URL(req.url);
    if(u.hostname==='test.supabase.co') {
      assert.equal(req.headers.get('apikey'),'sb_secret_test');
      if(req.method==='POST') {if(row)return new Response('',{status:409});row={...(await req.json()),status:'queued',known_model_calls:0,dispatch_status:'pending'};return Response.json([row]);}
      if(req.method==='PATCH') {Object.assign(row,await req.json());return Response.json([row]);}
      return Response.json(row&&(!u.searchParams.has('id')||u.searchParams.get('id')==='eq.'+row.id)?[row]:[]);
    }
    assert.equal(u.hostname,'api.github.com');assert.equal(req.headers.get('Authorization'),'Bearer private-github-token');
    if(req.method==='POST'){dispatches++;assert.equal(u.pathname,'/repos/cryptomanxxx/debatt-ai-orchestrator/actions/workflows/research-pipeline.yml/dispatches');
      assert.deepEqual(await req.json(),{ref:'main',inputs:{research_area:start.area,model_budget:'5',dashboard_request_id:id}});
      return Response.json({workflow_run_id:123});}
    return Response.json({id:123,status:'completed',conclusion:'success',run_attempt:1,repository:{full_name:'cryptomanxxx/debatt-ai-orchestrator'}});
  }});
  try{const first=await request(r,'runs',start);assert.equal(first.status,202);assert.equal((await first.json()).run.github_run_id,'123');
    const again=await request(r,'runs',start);assert.equal(again.status,200);assert.equal((await again.json()).reused,true);assert.equal(dispatches,1);
    const detail=await request(r,'runs/'+id);assert.equal(detail.status,200);const value=await detail.json();assert.equal(value.technical.conclusion,'success');
    assert.ok(!JSON.stringify(value).includes('private-github-token'));assert.equal((await request(r,'runs/'+id.replace(/1$/,'2'))).status,404);
  }finally{await r.dispose();}
});
test('uncertain dispatch is recorded and never retried; missing start config keeps reading available',async()=>{
  let row:any=null,dispatches=0;
  const r=runtime({outboundService:async(req:Request)=>{if(new URL(req.url).hostname==='api.github.com'){dispatches++;return new Response('private upstream error',{status:502});}
    if(req.method==='POST'){if(row)return new Response('',{status:409});row={...(await req.json()),status:'queued'};return Response.json([row]);}
    if(req.method==='PATCH'){Object.assign(row,await req.json());return Response.json([row]);}return Response.json([row]);}});
  try{const first=await (await request(r,'runs',start)).json();assert.equal(first.run.dispatch_status,'uncertain');
    const again=await (await request(r,'runs',start)).json();assert.equal(again.reused,true);assert.equal(dispatches,1);assert.ok(!JSON.stringify(first).includes('private upstream'));}
  finally{await r.dispose();}
  const readOnly=runtime({bindings:{RESEARCH_DASHBOARD_KEY:key,SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'},outboundService:async()=>Response.json([])});
  try{assert.equal((await request(readOnly,'runs',start)).status,503);assert.equal((await (await request(readOnly)).json()).can_start,false);}finally{await readOnly.dispose();}
});
