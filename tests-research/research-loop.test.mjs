import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchProblem, addHypothesis, recordAttempt, recordResult, researchSummary } from '../research/research-loop.mjs';

test('Research Loop v1 preserves problem lineage through verified result',()=>{
 let p=createResearchProblem({id:'open-problem-001',question:'Kan hypotesen verifieras?',domain:'matematik',computeBudget:{maxAttempts:2}});
 const original=p.fingerprint;
 p=addHypothesis(p,{id:'h1',statement:'Ett kandidatsamband gäller.',rationale:'Testbar kandidat.'});
 p=recordAttempt(p,{id:'a1',hypothesisId:'h1',method:'symbolic-check',toolId:'sympy',outcome:'Kandidaten stöds.',evidence:{case:'exact'},verification:{tool:'sympy',independent:true,result:{valid:true}}});
 p=recordResult(p,{id:'r1',claim:'Kandidatsambandet gäller inom testad domän.',status:'verified',significance:'pilot',verification:{tool:'sympy',independent:true,result:{valid:true}}});
 assert.equal(p.status,'verified'); assert.notEqual(p.fingerprint,original);
 assert.equal(p.revisions.length,3); assert.equal(researchSummary(p).attempts,'1/2');
});
test('verified/falsified claims require verification',()=>{
 const p=createResearchProblem({id:'problem-002',question:'Är påståendet sant?',domain:'test'});
 assert.throws(()=>recordResult(p,{id:'r',claim:'Ja.',status:'verified'}),/verification_required/);
});
test('attempts obey compute budget and known hypothesis',()=>{
 let p=createResearchProblem({id:'problem-003',question:'Test?',domain:'test',computeBudget:{maxAttempts:1}});
 p=addHypothesis(p,{id:'h',statement:'H',rationale:'R'});
 assert.throws(()=>recordAttempt(p,{id:'x',hypothesisId:'missing',method:'m',outcome:'o'}),/unknown_hypothesis/);
 p=recordAttempt(p,{id:'a',hypothesisId:'h',method:'m',outcome:'o'});
 assert.throws(()=>recordAttempt(p,{id:'b',hypothesisId:'h',method:'m',outcome:'o'}),/compute_budget_exhausted/);
});
test('inconclusive is a first-class research result',()=>{
 let p=createResearchProblem({id:'problem-004',question:'Test?',domain:'test'});
 p=recordResult(p,{id:'r',claim:'Evidensen räcker inte.',status:'inconclusive'});
 assert.equal(p.status,'inconclusive');
});


test('research state is deeply immutable',()=>{
 let p=createResearchProblem({id:'problem-005',question:'Test?',domain:'test',source:{origin:'fixture'}});
 p=addHypothesis(p,{id:'h',statement:'H',rationale:'R'});
 assert.equal(Object.isFrozen(p.hypotheses),true);
 assert.equal(Object.isFrozen(p.hypotheses[0]),true);
 assert.throws(()=>p.hypotheses.push({}),TypeError);
 assert.throws(()=>{p.hypotheses[0].statement='changed';},TypeError);
});
test('conclusive verification requires structured independent result',()=>{
 const p=createResearchProblem({id:'problem-006',question:'Test?',domain:'test'});
 for (const verification of [{},true,'yes',{tool:'sympy',independent:true}])
   assert.throws(()=>recordResult(p,{id:'r',claim:'C',status:'verified',verification}),/invalid_verification/);
});
test('fingerprinted unrestricted fields reject non JSON values',()=>{
 assert.throws(()=>createResearchProblem({id:'problem-007',question:'Test?',domain:'test',source:{x:undefined}}),/invalid_json_value/);
 assert.throws(()=>createResearchProblem({id:'problem-008',question:'Test?',domain:'test',source:{x:NaN}}),/invalid_json_value/);
 assert.throws(()=>createResearchProblem({id:'problem-009',question:'Test?',domain:'test',source:{x:1n}}),/invalid_json_value/);
});


test('verification result must be affirmative',()=>{
 const p=createResearchProblem({id:'problem-010',question:'Test?',domain:'test'});
 for (const result of [null,{valid:false},{}])
   assert.throws(()=>recordResult(p,{id:'r',claim:'C',status:'verified',verification:{tool:'sympy',independent:true,result}}),/invalid_verification/);
});
test('sparse arrays are rejected',()=>{
 assert.throws(()=>createResearchProblem({id:'problem-011',question:'Test?',domain:'test',source:Array(1)}),/invalid_json_value/);
});
test('stored fingerprint is directly verifiable',()=>{
 const p=createResearchProblem({id:'problem-012',question:'Test?',domain:'test'});
 assert.equal(researchFingerprint(p),p.fingerprint);
});
test('hypothesis parent must already exist',()=>{
 let p=createResearchProblem({id:'problem-013',question:'Test?',domain:'test'});
 assert.throws(()=>addHypothesis(p,{id:'child',statement:'C',rationale:'R',parentId:'missing'}),/unknown_parent_hypothesis/);
 p=addHypothesis(p,{id:'parent',statement:'P',rationale:'R'});
 p=addHypothesis(p,{id:'child',statement:'C',rationale:'R',parentId:'parent'});
 assert.equal(p.hypotheses[1].parentId,'parent');
});
