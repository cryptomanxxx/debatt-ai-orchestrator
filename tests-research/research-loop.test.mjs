import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchProblem, addHypothesis, recordAttempt, recordResult, researchSummary } from '../research/research-loop.mjs';

test('Research Loop v1 preserves problem lineage through verified result',()=>{
 let p=createResearchProblem({id:'open-problem-001',question:'Kan hypotesen verifieras?',domain:'matematik',computeBudget:{maxAttempts:2}});
 const original=p.fingerprint;
 p=addHypothesis(p,{id:'h1',statement:'Ett kandidatsamband gäller.',rationale:'Testbar kandidat.'});
 p=recordAttempt(p,{id:'a1',hypothesisId:'h1',method:'symbolic-check',toolId:'sympy',outcome:'Kandidaten stöds.',evidence:{case:'exact'},verification:{tool:'sympy',independent:true}});
 p=recordResult(p,{id:'r1',claim:'Kandidatsambandet gäller inom testad domän.',status:'verified',significance:'pilot',verification:{tool:'sympy',independent:true}});
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
