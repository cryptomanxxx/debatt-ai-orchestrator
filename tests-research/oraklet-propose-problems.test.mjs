import test from 'node:test';
import assert from 'node:assert/strict';
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
