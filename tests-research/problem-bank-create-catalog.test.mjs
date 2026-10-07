import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCatalogProblem,createOrVerifyCatalogProblem} from '../research/problem-bank-create-catalog.mjs';

const args={id:'catalog-sympy-test-001',experimentId:'sympy-quadratic',domain:'mathematics',difficulty:2,version:1};

test('creates a fingerprinted problem with the exact locked catalog question',()=>{
  const p=makeCatalogProblem(args);
  assert.equal(p.source.experiment_id,'sympy-quadratic');
  assert.equal(p.question,'Kan Oraklet ange exakt alla distinkta reella rötter och avvisa felaktiga rotmängder?');
  assert.equal(p.verifier_ids[0],'sympy');
  assert.equal(p.status,'active');
  assert.equal(p.fingerprint.length,64);
});

test('rejects an experiment not in the locked catalog',()=>{
  assert.throws(()=>makeCatalogProblem({...args,experimentId:'untrusted-experiment'}),/unsupported_catalog_experiment/);
});

test('returns matching active existing problem without writing',async()=>{
  const expected=makeCatalogProblem(args);
  let writes=0;
  const result=await createOrVerifyCatalogProblem({
    getProblem:async()=>expected,
    putProblem:async()=>{writes++;throw new Error('unexpected_write');}
  },expected);
  assert.equal(result.created,false);
  assert.equal(writes,0);
});

test('rejects a retired existing version even when fingerprint matches',async()=>{
  const expected=makeCatalogProblem(args);
  await assert.rejects(createOrVerifyCatalogProblem({
    getProblem:async()=>({...expected,status:'retired'})
  },expected),/existing_problem_retired_create_new_version/);
});

test('rejects conflicting immutable version',async()=>{
  const expected=makeCatalogProblem(args);
  await assert.rejects(createOrVerifyCatalogProblem({
    getProblem:async()=>({...expected,fingerprint:'0'.repeat(64)})
  },expected),/existing_problem_fingerprint_mismatch/);
});

test('creates missing problem once',async()=>{
  const expected=makeCatalogProblem(args);
  let writes=0;
  const result=await createOrVerifyCatalogProblem({
    getProblem:async()=>{throw new Error('problem_not_found');},
    putProblem:async(p)=>{writes++;return p;}
  },expected);
  assert.equal(result.created,true);
  assert.equal(writes,1);
});

test('does not create when lookup fails for reasons other than missing row',async()=>{
  const expected=makeCatalogProblem(args);
  await assert.rejects(createOrVerifyCatalogProblem({
    getProblem:async()=>{throw new Error('problem_bank_read_failed:403');},
    putProblem:async()=>{throw new Error('must_not_write');}
  },expected),/problem_bank_read_failed:403/);
});

test('rejects noncanonical and unsafe versions',()=>{
  for (const version of ['01','1e0','0','-1','1.0','9007199254740992']) {
    assert.throws(()=>makeCatalogProblem({...args,version}),/invalid_canonical_problem_version/);
  }
});

test('concurrent insert conflict re-reads and verifies the committed row',async()=>{
  const expected=makeCatalogProblem(args);
  let reads=0;
  const result=await createOrVerifyCatalogProblem({
    getProblem:async()=>{reads++;if(reads===1)throw new Error('problem_not_found');return expected;},
    putProblem:async()=>{throw new Error('problem_bank_write_failed:409');}
  },expected);
  assert.equal(result.created,false);
  assert.equal(reads,2);
});

test('concurrent insert conflict rejects different fingerprint',async()=>{
  const expected=makeCatalogProblem(args);
  let reads=0;
  await assert.rejects(createOrVerifyCatalogProblem({
    getProblem:async()=>{reads++;if(reads===1)throw new Error('problem_not_found');return {...expected,fingerprint:'0'.repeat(64)};},
    putProblem:async()=>{throw new Error('problem_bank_write_failed:409');}
  },expected),/existing_problem_fingerprint_mismatch/);
});
