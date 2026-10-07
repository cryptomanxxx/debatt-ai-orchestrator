import test from 'node:test';
import assert from 'node:assert/strict';
import { createProblem } from '../research/problem-bank.mjs';
import { addHypothesis, recordResult } from '../research/research-loop.mjs';
import { researchProblemFromBank, startBankResearchRun, finishBankResearchRun } from '../research/problem-bank-research-loop.mjs';

const bankProblem=()=>createProblem({id:'adapter-problem-001',kind:'open',domain:'mathematics',question:'Can this conjecture be tested?',difficulty:2,verifier_ids:['sympy']});
const clientFor=(bank)=>({
 async startRun(problem,state){return {id:'run-1',status:'running',problem_id:bank.id,problem_version:bank.version,problem_fingerprint:bank.fingerprint,state};},
 async finishRun(id,status,state,expected){return {id,status,state,expected};}
});

test('adapter preserves immutable Problem Bank lineage in Research Loop source',()=>{
 const bank=bankProblem(), research=researchProblemFromBank(bank,{maxAttempts:4});
 assert.equal(research.id,bank.id); assert.equal(research.source.problem_bank.fingerprint,bank.fingerprint);
 assert.equal(research.source.problem_bank.version,bank.version); assert.equal(research.computeBudget.maxAttempts,4);
});

test('adapter rejects retired or tampered Problem Bank problems',()=>{
 const retired=createProblem({id:'adapter-retired',kind:'open',domain:'test',question:'Retired?',status:'retired'});
 assert.throws(()=>researchProblemFromBank(retired),/problem_not_active/);
 const bank=bankProblem(); assert.throws(()=>researchProblemFromBank({...bank,question:'tampered'}),/problem_fingerprint_mismatch/);
});

test('run lifecycle persists evolving Research Loop state without conflating fingerprints',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank,{maxAttempts:2});
 let research=addHypothesis(session.research,{id:'h1',statement:'Candidate',rationale:'Testable'});
 research=recordResult(research,{id:'r1',claim:'More evidence is required.',status:'inconclusive'});
 const finished=await finishBankResearchRun(clientFor(bank),session,{research});
 assert.equal(finished.state.problem_fingerprint,bank.fingerprint); assert.equal(finished.state.research_fingerprint,research.fingerprint);
 assert.notEqual(finished.state.problem_fingerprint,finished.state.research_fingerprint); assert.equal(finished.state.research.results.length,1);
});

test('finish rejects tampered, cross-problem and cross-version research',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank);
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),session,{research:{...session.research,question:'tampered'}}),/invalid_problem_fingerprint/);
 const other=researchProblemFromBank(createProblem({id:'adapter-problem-002',kind:'open',domain:'test',question:'Other?'}));
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),session,{research:other}),/research_problem_lineage_mismatch/);
 const version2=researchProblemFromBank(createProblem({...bank,version:2}));
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),session,{research:version2}),/research_problem_lineage_mismatch/);
});

test('finish rejects a run borrowed from another problem session',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank);
 const mixed={...session,run:{...session.run,problem_id:'other-problem'}};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),mixed),/research_run_lineage_mismatch/);
});

test('finish requires final research to descend from the started state',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank,{maxAttempts:1});
 const replacement=researchProblemFromBank(bank,{maxAttempts:20});
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),session,{research:replacement}),/research_state_lineage_mismatch/);
});


test('finish rejects a run borrowed from another session on the same Problem Bank version',async()=>{
 const bank=bankProblem();
 const low=await startBankResearchRun(clientFor(bank),bank,{maxAttempts:1});
 const high=await startBankResearchRun(clientFor(bank),bank,{maxAttempts:20});
 const mixed={...high,run:low.run};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),mixed),/research_run_state_mismatch/);
});


test('identical concurrent sessions have unique persisted run bindings',async()=>{
 const bank=bankProblem();
 const first=await startBankResearchRun(clientFor(bank),bank);
 const second=await startBankResearchRun(clientFor(bank),bank);
 assert.notEqual(first.runBinding,second.runBinding);
 const mixed={...first,run:second.run};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),mixed),/research_run_state_mismatch/);
});

test('finish rejects run records with omitted lineage fields',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank);
 const stripped={...session,run:{id:session.run.id}};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),stripped),/research_run_lineage_mismatch/);
});


test('finish passes persisted compare-and-set lineage guard to Problem Bank client',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank);
 const finished=await finishBankResearchRun(clientFor(bank),session);
 assert.deepEqual(finished.expected,{
   problem_id:bank.id,problem_version:bank.version,problem_fingerprint:bank.fingerprint,run_binding:session.runBinding
 });
});
