import test from 'node:test';
import assert from 'node:assert/strict';
import {createProblem,problemFingerprint,runnerView,assertNoHiddenReference,createProblemBankClient} from '../research/problem-bank.mjs';
function validRow(overrides={}) {
 const base={id:'abc',kind:'open',domain:'math',question:'Q',source:null,verifier_ids:[],difficulty:1,status:'active',version:1};
 return {...base,...overrides,fingerprint:problemFingerprint({...base,...overrides})};
}


test('creates deterministic problem records',()=>{
 const p=createProblem({id:'bench-001',kind:'benchmark_hidden_solution',domain:'math',question:'Solve x^2=4',verifier_ids:['sympy-quadratic'],difficulty:1});
 assert.equal(problemFingerprint(p),p.fingerprint);
 assert.equal(p.kind,'benchmark_hidden_solution');
});
test('runner view strips unknown fields and rejects leaked references',()=>{
 const view=runnerView({id:'x',kind:'open',question:'q',reference_solution:{answer:2}});
 assert.equal(Object.hasOwn(view,'reference_solution'),false);
 assert.throws(()=>assertNoHiddenReference({reference_solution:{answer:2}}),/hidden_reference_leak/);
});
test('client explicitly selects only runner-safe columns',async()=>{
 let requested='';
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'secret',fetchImpl:async url=>{
   requested=String(url);
   return {ok:true,json:async()=>[validRow()]};
 }});
 const p=await client.getProblem('abc',1);
 assert.equal(p.id,'abc');
 assert.match(requested,/version=eq\.1/);
 assert.match(requested,/select=id%2Ckind%2Cdomain%2Cquestion/);
 assert.doesNotMatch(requested,/reference_solution/);
});

test('modern Supabase secret is sent only as apikey',async()=>{
 let headers;
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'sb_secret_test',fetchImpl:async (_url,init)=>{
   headers=init.headers;
   return {ok:true,json:async()=>[validRow()]};
 }});
 await client.getProblem('abc');
 assert.equal(headers.apikey,'sb_secret_test');
 assert.equal(Object.hasOwn(headers,'Authorization'),false);
});
test('hidden references are rejected recursively for benchmarks',()=>{
 assert.throws(()=>createProblem({id:'bench-002',kind:'benchmark_hidden_solution',domain:'math',question:'Q',source:{provider:{answer:42}}}),/hidden_reference_leak/);
 assert.throws(()=>assertNoHiddenReference({source:{nested:[{solution:'secret'}]}}),/hidden_reference_leak/);
 assert.throws(()=>createProblem({id:'bench-003',kind:'benchmark_hidden_solution',domain:'math',question:'Q',source:{provider:{ground_truth:42}}}),/unsafe_benchmark_source/);
});
test('problem records are deeply immutable',()=>{
 const p=createProblem({id:'open-001',kind:'open',domain:'math',question:'Q',source:{url:'a'},verifier_ids:['sympy']});
 assert.throws(()=>{p.source.url='b';},TypeError);
 assert.throws(()=>p.verifier_ids.push('other'),TypeError);
 assert.equal(problemFingerprint(p),p.fingerprint);
});

test('rejects records outside database constraints',()=>{
 for (const extra of [{difficulty:6},{status:'draft'},{version:0},{verifier_ids:'sympy'}])
   assert.throws(()=>createProblem({id:'bad-001',kind:'open',domain:'math',question:'Q',...extra}));
});
test('rejects sparse arrays before fingerprinting',()=>{
 const sparse=[]; sparse.length=1;
 assert.throws(()=>createProblem({id:'bad-002',kind:'open',domain:'math',question:'Q',source:sparse}),/invalid_problem_json/);
});
test('client rejects stale persisted fingerprints',async()=>{
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'sb_secret_test',fetchImpl:async()=>({ok:true,json:async()=>[
   {id:'abc',kind:'open',domain:'math',question:'Changed',source:null,verifier_ids:[],difficulty:1,status:'active',version:1,fingerprint:'a'.repeat(64)}
 ]})});
 await assert.rejects(()=>client.getProblem('abc'),/problem_fingerprint_mismatch/);
});

test('client selects an exact immutable problem version',async()=>{
 let requested='';
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'secret',fetchImpl:async url=>{
   requested=String(url);
   return {ok:true,json:async()=>[validRow({version:2})]};
 }});
 const p=await client.getProblem('abc',2);
 assert.equal(p.version,2);
 assert.match(requested,/version=eq\.2/);
 await assert.rejects(()=>client.getProblem('abc',0),/invalid_problem_version/);
});

test('lifecycle status does not change the immutable problem fingerprint',()=>{
 const active=validRow();
 const retired={...active,status:'retired'};
 assert.equal(problemFingerprint(active),problemFingerprint(retired));
 assert.equal(active.fingerprint,problemFingerprint(retired));
});


test('client persists problems and runs through the Supabase write path',async()=>{
 const calls=[];
 const row=validRow();
 const run={id:'11111111-1111-1111-1111-111111111111',problem_id:'abc',problem_version:1,problem_fingerprint:row.fingerprint,state:{step:1},status:'running',started_at:'2026-10-07T13:00:00.000Z',completed_at:null};
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'sb_secret_test',fetchImpl:async (url,init={})=>{
   calls.push({url:String(url),init});
   if (String(url).includes('research_problem')) return {ok:true,json:async()=>[row]};
   if (init.method==='PATCH') return {ok:true,json:async()=>[{...run,state:{done:true},status:'completed',completed_at:'2026-10-07T13:01:00.000Z'}]};
   return {ok:true,json:async()=>[run]};
 }});
 const problem=await client.putProblem({id:'abc',kind:'open',domain:'math',question:'Q',difficulty:1});
 const started=await client.startRun(problem,{step:1});
 const finished=await client.finishRun(started.id,'completed',{done:true});
 assert.equal(finished.status,'completed');
 assert.deepEqual(calls.map(c=>c.init.method),['POST','POST','PATCH']);
 assert.equal(calls[0].init.headers.apikey,'sb_secret_test');
 assert.equal(Object.hasOwn(calls[0].init.headers,'Authorization'),false);
 assert.match(calls[2].url,/id=eq\.11111111-1111-1111-1111-111111111111/);
});


test('startRun rejects tampered problem content with a copied fingerprint',async()=>{
 const original=validRow();
 const tampered={...original,question:'Tampered question'};
 let called=false;
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'sb_secret_test',fetchImpl:async()=>{
   called=true;
   throw new Error('should_not_call_supabase');
 }});
 await assert.rejects(()=>client.startRun(tampered,{}),/problem_fingerprint_mismatch/);
 assert.equal(called,false);
});


test('run writes reject non-JSON state before calling Supabase',async()=>{
 const problem=validRow();
 for (const state of [{value:NaN},{value:undefined},new Array(1)]) {
   let called=false;
   const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'sb_secret_test',fetchImpl:async()=>{
     called=true;
     throw new Error('should_not_call_supabase');
   }});
   await assert.rejects(()=>client.startRun(problem,state),/invalid_problem_json/);
   assert.equal(called,false);
   await assert.rejects(()=>client.finishRun('11111111-1111-1111-1111-111111111111','completed',state),/invalid_problem_json/);
   assert.equal(called,false);
 }
});


test('finishRun delegates completed_at to the database clock',async()=>{
 let patchBody;
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'sb_secret_test',fetchImpl:async (_url,init)=>{
   patchBody=JSON.parse(init.body);
   return {ok:true,json:async()=>[{id:'11111111-1111-1111-1111-111111111111',status:'completed',state:{done:true},started_at:'2026-10-07T13:00:00.000Z',completed_at:'2026-10-07T13:00:00.001Z'}]};
 }});
 await client.finishRun('11111111-1111-1111-1111-111111111111','completed',{done:true});
 assert.equal(Object.hasOwn(patchBody,'completed_at'),false);
});


test('finishRun delegates completed_at to the database clock',async()=>{
 let patchBody;
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'sb_secret_test',fetchImpl:async (_url,init)=>{
   patchBody=JSON.parse(init.body);
   return {ok:true,json:async()=>[{id:'11111111-1111-1111-1111-111111111111',status:'completed',state:{done:true},started_at:'2026-10-07T13:00:00.000Z',completed_at:'2026-10-07T13:00:00.001Z'}]};
 }});
 await client.finishRun('11111111-1111-1111-1111-111111111111','completed',{done:true});
 assert.equal(Object.hasOwn(patchBody,'completed_at'),false);
});


test('finishRun compare-and-set filters on persisted run lineage and binding',async()=>{
 let requested='';
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'secret',fetchImpl:async (url)=> {
   requested=String(url); return {ok:true,json:async()=>[]};
 }});
 await assert.rejects(()=>client.finishRun('11111111-1111-1111-1111-111111111111','completed',{done:true},{
   problem_id:'abc',problem_version:1,problem_fingerprint:'f'.repeat(64),run_binding:'binding-1'
 }),/research_run_finish_invalid_response/);
 assert.match(requested,/problem_id=eq\.abc/);
 assert.match(requested,/problem_version=eq\.1/);
 assert.match(requested,/problem_fingerprint=eq\.f{64}/);
 assert.match(requested,/state-%3E%3Erun_binding=eq\.binding-1/);
});

test('finishRun rejects incomplete compare-and-set guards before Supabase',async()=>{
 let called=false;
 const client=createProblemBankClient({url:'https://example.supabase.co',secretKey:'secret',fetchImpl:async()=>{called=true; throw new Error('unexpected');}});
 await assert.rejects(()=>client.finishRun('run','completed',{}, {problem_id:'abc'}),/invalid_run_finish_guard/);
 assert.equal(called,false);
});
