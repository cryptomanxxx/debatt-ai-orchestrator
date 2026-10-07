import test from 'node:test';
import assert from 'node:assert/strict';
import { createProblem } from '../research/problem-bank.mjs';
import { addHypothesis, recordResult, researchFingerprint } from '../research/research-loop.mjs';
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
   problem_id:bank.id,problem_version:bank.version,problem_fingerprint:bank.fingerprint,run_binding:session.runBinding,
   research_fingerprint:session.research.fingerprint
 });
});


test('finish rejects forged ancestry that mutates immutable compute budget',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank,{maxAttempts:1});
 const forgedBase={...session.research,computeBudget:{maxAttempts:20},
   revisions:[...session.research.revisions,{version:1,reason:'forged',previousFingerprint:session.research.fingerprint}]};
 delete forgedBase.fingerprint;
 const { researchFingerprint }=await import('../research/research-loop.mjs');
 const forged={...forgedBase,fingerprint:researchFingerprint(forgedBase)};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),session,{research:forged}),/research_state_lineage_mismatch/);
});

test('finish rejects forged ancestry that rewrites started history',async()=>{
 const bank=bankProblem(), base=await startBankResearchRun(clientFor(bank),bank);
 const startedResearch=addHypothesis(base.research,{id:'h-start',statement:'Original',rationale:'Original rationale'});
 const session={...base,research:startedResearch,run:{...base.run,state:{...base.run.state,research_fingerprint:startedResearch.fingerprint}}};
 const forgedBase={...startedResearch,hypotheses:[{...startedResearch.hypotheses[0],statement:'Rewritten'}],
   revisions:[...startedResearch.revisions,{version:2,reason:'forged',previousFingerprint:startedResearch.fingerprint}]};
 delete forgedBase.fingerprint;
 const { researchFingerprint }=await import('../research/research-loop.mjs');
 const forged={...forgedBase,fingerprint:researchFingerprint(forgedBase)};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),session,{research:forged}),/research_state_lineage_mismatch/);
});


test('finish rejects fabricated post-start attempts that bypass compute budget',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank,{maxAttempts:1});
 const hypothesis=addHypothesis(session.research,{id:'h-budget',statement:'Candidate',rationale:'Test'});
 const forgedAttempts=[
   {id:'a1',hypothesisId:'h-budget',method:'fake',toolId:null,outcome:'x',evidence:null,verification:null},
   {id:'a2',hypothesisId:'h-budget',method:'fake',toolId:null,outcome:'x',evidence:null,verification:null}
 ];
 const forgedBase={...hypothesis,attempts:forgedAttempts,
   revisions:[...hypothesis.revisions,{version:2,reason:'attempt_recorded',previousFingerprint:hypothesis.fingerprint},
     {version:3,reason:'attempt_recorded',previousFingerprint:'fabricated'}]};
 delete forgedBase.fingerprint;
 const forged={...forgedBase,fingerprint:researchFingerprint(forgedBase)};
 const startedSession={...session,research:hypothesis,run:{...session.run,state:{...session.run.state,research_fingerprint:hypothesis.fingerprint}}};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),startedSession,{research:forged}),/research_state_lineage_mismatch/);
});

test('finish rejects fabricated post-start attempt with unknown hypothesis',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank);
 const forgedAttempt={id:'a-forged',hypothesisId:'missing',method:'fake',toolId:null,outcome:'x',evidence:null,verification:null};
 const forgedBase={...session.research,attempts:[forgedAttempt],
   revisions:[{version:1,reason:'attempt_recorded',previousFingerprint:session.research.fingerprint}]};
 delete forgedBase.fingerprint;
 const forged={...forgedBase,fingerprint:researchFingerprint(forgedBase)};
 await assert.rejects(()=>finishBankResearchRun(clientFor(bank),session,{research:forged}),/research_state_lineage_mismatch/);
});


test('finish guard binds the persisted starting research fingerprint',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank,{maxAttempts:1});
 const forgedBase={...session.research,computeBudget:{maxAttempts:20}}; delete forgedBase.fingerprint;
 const forged={...forgedBase,fingerprint:researchFingerprint(forgedBase)};
 const local={...session,research:forged,run:{...session.run,state:{...session.run.state,research_fingerprint:forged.fingerprint}}};
 const finished=await finishBankResearchRun(clientFor(bank),local,{research:forged});
 assert.equal(finished.expected.research_fingerprint,forged.fingerprint);
 assert.notEqual(finished.expected.research_fingerprint,session.run.state.research_fingerprint);
});


test('finish accepts valid descendant reconstructed with different object key order',async()=>{
 const bank=bankProblem(), session=await startBankResearchRun(clientFor(bank),bank);
 const research=addHypothesis(session.research,{id:'h-order',statement:'Candidate',rationale:'Testable'});
 const reorder=value=>{
   if (Array.isArray(value)) return value.map(reorder);
   if (value && typeof value==='object') {
     const out={};
     for (const key of Object.keys(value).reverse()) out[key]=reorder(value[key]);
     return out;
   }
   return value;
 };
 const reconstructed=reorder(research);
 assert.equal(researchFingerprint(reconstructed),research.fingerprint);
 const finished=await finishBankResearchRun(clientFor(bank),session,{research:reconstructed});
 assert.equal(finished.state.research_fingerprint,research.fingerprint);
});
