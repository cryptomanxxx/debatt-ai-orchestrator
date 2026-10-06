import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScienceCases, sciencePrompt, parseScienceProposal, validateScienceResult, mixtureOracle,
  verifyRecurrence, studentTwoSidedPvalue, regressionOracle, holm, PROTOCOLS } from '../research/science.mjs';
import { fingerprint } from '../research/python-tools.mjs';

const tools=['annihilator','mixalot','statsmodels'];
const answer=(tool,fixture)=>({method:tool, ...(tool==='annihilator'?{coefficients:fixture.truth.coefficients}
  : {decision:tool==='mixalot'?mixtureOracle(fixture.input).decision:studentTwoSidedPvalue(regressionOracle(fixture.input).tStatistic,regressionOracle(fixture.input).dfResidual)<.05?'reject_h0':'do_not_reject_h0'}),reason:'Förutbestämt test.'});

test('scientific protocols are seeded, committed and separate visible data from holdout',()=>{
  for(const tool of tools) {
    const fixtures=makeScienceCases('123',tool);
    assert.deepEqual(makeScienceCases('123',tool),fixtures);
    assert.notEqual(makeScienceCases('124',tool)[0].commitment,fixtures[0].commitment);
    const visible=JSON.parse(sciencePrompt(tool,fixtures[0].input)[1].content);
    assert.deepEqual(visible.protocol,PROTOCOLS[tool]);
    assert.equal(visible.data.holdout,undefined);
    if(tool==='annihilator') assert.equal(visible.data.observed.length,12);
    if(tool==='statsmodels') assert.equal(visible.data.train.length,88);
    const p=answer(tool,fixtures[0]);
    assert.deepEqual(parseScienceProposal(JSON.stringify(p),tool),p);
    for(const change of [{method:'shell'},{code:'eval'},{reason:''},tool==='annihilator'?{coefficients:['1','1','0']}:{decision:'proven_true'}])
      assert.equal(parseScienceProposal(JSON.stringify({...p,...change}),tool),null);
  }
});

test('recurrence fixtures have distinct data and prompts, including seed 123 collisions',()=>{
  for(const seed of ['123','999999999',...Array.from({length:200},(_,i)=>String(i))]) {
    const fixtures=makeScienceCases(seed,'annihilator');
    assert.deepEqual(makeScienceCases(seed,'annihilator'),fixtures);
    for(const select of [f=>f.input,f=>f.control,f=>sciencePrompt('annihilator',f.input),f=>f.commitment])
      assert.equal(new Set(fixtures.map(f=>JSON.stringify(select(f)))).size,3,`seed ${seed}`);
    for(const f of fixtures) {
      assert.equal(verifyRecurrence(f.truth.coefficients,[...f.input.train,...f.input.holdout]),true);
      assert.equal(verifyRecurrence(f.truth.coefficients,[...f.control.train,...f.control.holdout]),false);
      const [first,second,third]=f.input.train.map(BigInt);
      assert.notEqual(second*second,first*third); // No degenerate geometric sequence.
      assert.equal(f.commitment,fingerprint({input:f.input,control:f.control,truth:f.truth,protocol:PROTOCOLS.annihilator}));
    }
  }
});

test('independent mathematical oracles and Holm have analytic positive/negative controls',()=>{
  assert.equal(verifyRecurrence(['-1','-1','1'],['1','1','2','3','5','8']),true);
  assert.equal(verifyRecurrence(['-1','-1','1'],['1','1','2','3','5','9']),false);
  const mix=mixtureOracle({counts:[1,3]});
  assert.equal(mix.evidenceH0,'64/625');
  assert.equal(mix.evidenceH1,'761/12500');
  assert.equal(mix.bayesFactor10,'761/1280');
  assert.equal(mix.posteriorH1,'761/2041');
  assert.equal(studentTwoSidedPvalue(0,10),1);
  assert.ok(Math.abs(studentTwoSidedPvalue(1,1)-.5)<1e-12);
  assert.ok(Math.abs(studentTwoSidedPvalue(2.2281388519649385,10)-.05)<1e-10);
  assert.deepEqual(holm([.01,.04,.03]),[.03,.06,.06]);
  assert.deepEqual(holm([.9,.7,1]),[1,1,1]);
});
