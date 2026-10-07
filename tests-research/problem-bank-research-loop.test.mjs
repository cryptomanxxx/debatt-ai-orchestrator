import test from 'node:test';
import assert from 'node:assert/strict';
import { createProblem } from '../research/problem-bank.mjs';
import { addHypothesis, recordResult } from '../research/research-loop.mjs';
import { researchProblemFromBank, startBankResearchRun, finishBankResearchRun } from '../research/problem-bank-research-loop.mjs';

const bankProblem=()=>createProblem({id:'adapter-problem-001',kind:'open',domain:'mathematics',question:'Can this conjecture be tested?',difficulty:2,verifier_ids:['sympy']});

test('adapter preserves immutable Problem Bank lineage in Research Loop source',()=>{
 const bank=bankProblem();
 const research=researchProblemFromBank(bank,{maxAttempts:4});
 assert.equal(research.id,bank.id);
 assert.equal(research.source.problem_bank.fingerprint,bank.fingerprint);
 assert.equal(research.source.problem_bank.version,bank.version);
 assert.equal(research.computeBudget.maxAttempts,4);
});

test('adapter rejects retired or tampered Problem Bank problems',()=>{
 const retired=createProblem({id:'adapter-retired',kind:'open',domain:'test',question:'Retired?',status:'retired'});
 assert.throws(()=>researchProblemFromBank(retired),/problem_not_active/);
 const bank=bankProblem();
 assert.throws(()=>researchProblemFromBank({...bank,question:'tampered'}),/problem_fingerprint_mismatch/);
});

test('run lifecycle persists evolving Research Loop state without conflating fingerprints',async()=>{
 const calls=[];
 const client={
   async startRun(problem,state){ calls.push(['start',problem,state]); return {id:'run-1',status:'running'}; },
   async finishRun(id,status,state){ calls.push(['finish',id,status,state]); return {id,status,state}; }
 };
 const bank=bankProblem();
 const session=await startBankResearchRun(client,bank,{maxAttempts:2});
 let research=addHypothesis(session.research,{id:'h1',statement:'Candidate',rationale:'Testable'});
 research=recordResult(research,{id:'r1',claim:'More evidence is required.',status:'inconclusive'});
 const finished=await finishBankResearchRun(client,session,{research});
 assert.equal(calls[0][2].research_fingerprint,session.research.fingerprint);
 assert.equal(finished.state.problem_fingerprint,bank.fingerprint);
 assert.equal(finished.state.research_fingerprint,research.fingerprint);
 assert.notEqual(finished.state.problem_fingerprint,finished.state.research_fingerprint);
 assert.equal(finished.state.research.results.length,1);
});

test('finish rejects tampered Research Loop state and cross-problem lineage',async()=>{
 const client={async startRun(){return {id:'run-1'};},async finishRun(){throw new Error('must_not_write');}};
 const session=await startBankResearchRun(client,bankProblem());
 assert.rejects(()=>finishBankResearchRun(client,session,{research:{...session.research,question:'tampered'}}),/invalid_problem_fingerprint/);
 const other=researchProblemFromBank(createProblem({id:'adapter-problem-002',kind:'open',domain:'test',question:'Other?'}));
 await assert.rejects(()=>finishBankResearchRun(client,session,{research:other}),/research_problem_lineage_mismatch/);
 const version2=researchProblemFromBank(createProblem({id:'adapter-problem-001',kind:'open',domain:'mathematics',question:'Can this conjecture be tested?',difficulty:2,verifier_ids:['sympy'],version:2}));
 await assert.rejects(()=>finishBankResearchRun(client,session,{research:version2}),/research_problem_lineage_mismatch/);
});
