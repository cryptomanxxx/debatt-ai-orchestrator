import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../research/catalog.mjs';
import {proposeCatalogProblems,renderProposals} from '../research/oraklet-propose-problems.mjs';

test('suggests only locked catalog problems with a testable plan and fingerprint',()=>{
  const proposals=proposeCatalogProblems({limit:3});
  assert.equal(proposals.length,3);
  assert.ok(proposals.every(p=>p.fingerprint.length===64 && p.verification_plan && p.status==='proposed_requires_human_approval'));
});

test('skips registered problems and does not propose manually restricted experiments',()=>{
  const all=proposeCatalogProblems({limit:11,existingIds:['oraklet-ratfit-baseline-001']});
  assert.ok(all.every(p=>p.id!=='oraklet-ratfit-baseline-001'));
  assert.ok(all.every(p=>p.experiment_id!=='pymc-gdp-ar1'));
});

test('returns empty when every eligible catalog problem exists',()=>{
  const all=proposeCatalogProblems({limit:11});
  assert.deepEqual(proposeCatalogProblems({existingIds:all.map(p=>p.id)}),[]);
});

test('rejects invalid inventory and proposal limits',()=>{
  assert.throws(()=>proposeCatalogProblems({existingIds:[null]}),/invalid_existing_problem_ids/);
  assert.throws(()=>proposeCatalogProblems({limit:100}),/invalid_proposal_limit/);
});

test('report explicitly identifies proposals as unregistered',()=>{
  assert.match(renderProposals(proposeCatalogProblems({limit:1})),/inte skrivits till Supabase/);
});

test('candidate lookup checks every candidate and excludes existing rows',async()=>{
  const {findExistingCandidateIds}=await import('../research/run-oraklet-proposals.mjs');
  const candidates=proposeCatalogProblems({limit:4});
  const calls=[];
  const existing=await findExistingCandidateIds({
    getProblem:async(id,version)=>{
      calls.push([id,version]);
      if (id!==candidates[2].id) throw new Error('problem_not_found');
      return candidates[2];
    }
  },candidates);
  assert.deepEqual(existing,[candidates[2].id]);
  assert.equal(calls.length,4);
  assert.ok(!proposeCatalogProblems({existingIds:existing,limit:11}).some(p=>p.id===candidates[2].id));
});

test('candidate lookup fails closed on database errors',async()=>{
  const {findExistingCandidateIds}=await import('../research/run-oraklet-proposals.mjs');
  await assert.rejects(findExistingCandidateIds({
    getProblem:async()=>{throw new Error('problem_bank_read_failed:403');}
  },proposeCatalogProblems({limit:1})),/problem_bank_read_failed:403/);
});


test('every automatic catalog experiment is available to the proposal generator',()=>{
  const proposals=proposeCatalogProblems({limit:11});
  assert.deepEqual(proposals.map(p=>p.experiment_id),CATALOG.filter(e=>e.automatic!==false).map(e=>e.id));
  const glucose=proposals.find(p=>p.experiment_id==='glucose-absorption');
  assert.equal(glucose.domain,'synthetic-physiological-dynamics');
  assert.deepEqual(glucose.verifier_ids,['glucose-simulator']);
  assert.equal(glucose.status,'proposed_requires_human_approval');
});
