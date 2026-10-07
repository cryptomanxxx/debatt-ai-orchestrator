import test from 'node:test';
import assert from 'node:assert/strict';
import { createProblem } from '../research/problem-bank.mjs';
import { resolveProblemExperiment, researchStateFromOrakletReport, runProblemBankOraklet } from '../research/oraklet-problem-bank.mjs';

const entry={id:'sympy-quadratic',toolId:'sympy',question:'Can the locked quadratic experiment answer this question?'};
const problem=()=>createProblem({id:'oraklet-bank-001',kind:'open',domain:'mathematics',question:entry.question,source:{experiment_id:entry.id}});
function clientFor(bank) {
  const finishes=[];
  return {finishes,
    async getProblem(){return bank;},
    async startRun(_problem,state){return {id:'run-1',status:'running',problem_id:bank.id,problem_version:bank.version,problem_fingerprint:bank.fingerprint,state};},
    async finishRun(id,status,state,expected){finishes.push({id,status,state,expected}); return {id,status,state};}
  };
}
const report=()=>({reportId:'report-1',experimentId:entry.id,toolId:entry.toolId,seed:'123',executionStatus:'completed',status:'passed',
  method:'Locked exact quadratic protocol.',cases:[{passed:true},{passed:false}]});

test('Problem Bank entry must explicitly map to the same catalog question',()=>{
 const bank=problem();
 assert.equal(resolveProblemExperiment(bank,[entry]).id,entry.id);
 assert.throws(()=>resolveProblemExperiment({...bank,question:'Different question'},[entry]),/problem_bank_question_experiment_mismatch/);
 assert.throws(()=>resolveProblemExperiment(createProblem({id:'oraklet-bank-002',kind:'open',domain:'x',question:'Q'}),[entry]),/problem_bank_experiment_not_supported/);
});

test('Oraklet report becomes replay-valid Research Loop evidence',async()=>{
 const bank=problem(), client=clientFor(bank);
 const result=await runProblemBankOraklet({client,problem:bank,catalog:[entry],execute:async()=>report()});
 assert.equal(result.run.status,'completed');
 assert.equal(result.research.attempts.length,1);
 assert.equal(result.research.results.length,1);
 assert.equal(result.research.results[0].status,'needs_external_verification');
 assert.equal(result.research.attempts[0].evidence.report_id,'report-1');
 assert.equal(client.finishes[0].expected.research_fingerprint,result.research.revisions[0].previousFingerprint);
});

test('executor failure closes the persistent research run as failed',async()=>{
 const bank=problem(), client=clientFor(bank);
 await assert.rejects(()=>runProblemBankOraklet({client,problem:bank,catalog:[entry],execute:async()=>{throw new Error('boom');}}),/boom/);
 assert.equal(client.finishes.length,1);
 assert.equal(client.finishes[0].status,'failed');
});

test('failed report is persisted as an inconclusive failed run',async()=>{
 const bank=problem(), client=clientFor(bank);
 const failed={...report(),executionStatus:'error',status:'failed'};
 const result=await runProblemBankOraklet({client,problem:bank,catalog:[entry],execute:async()=>failed});
 assert.equal(result.run.status,'failed');
 assert.equal(result.research.status,'inconclusive');
});
