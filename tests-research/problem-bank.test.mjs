import test from 'node:test';
import assert from 'node:assert/strict';
import {createProblem,problemFingerprint,runnerView,assertNoHiddenReference,createProblemBankClient} from '../research/problem-bank.mjs';

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
   return {ok:true,json:async()=>[{id:'abc',kind:'open',domain:'math',question:'Q',source:null,verifier_ids:[],difficulty:1,status:'active',version:1,fingerprint:'a'.repeat(64)}]};
 }});
 const p=await client.getProblem('abc');
 assert.equal(p.id,'abc');
 assert.match(requested,/select=id%2Ckind%2Cdomain%2Cquestion/);
 assert.doesNotMatch(requested,/reference_solution/);
});
