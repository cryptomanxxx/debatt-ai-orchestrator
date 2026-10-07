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
