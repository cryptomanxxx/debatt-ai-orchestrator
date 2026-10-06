import test from 'node:test';
import assert from 'node:assert/strict';
import { quadraticOracle,makeSympyCases,parseSympyProposal } from '../research/sympy.mjs';

test('exact quadratic oracle handles rational, repeated and absent real roots and rejects unsupported input',()=>{
  assert.deepEqual(quadraticOracle({coefficients:['2','1','-1'],candidates:['1/2','-1']}).roots,['-1','1/2']);
  assert.equal(quadraticOracle({coefficients:['1','-2','1'],candidates:['1']}).distinctRootCount,1);
  assert.deepEqual(quadraticOracle({coefficients:['1','0','1'],candidates:[]}).roots,[]);
  assert.equal(quadraticOracle({coefficients:['1','-3','2'],candidates:['1']}).accepted,false);
  for(const input of [{coefficients:['1','0','-2'],candidates:[]},{coefficients:['0','1','2'],candidates:[]},
    {coefficients:['1','0','0'],candidates:['0','0']},{coefficients:['1','0','0'],candidates:['0/2']},
    {coefficients:['1','0','0'],candidates:['eval()']},{coefficients:['10001','0','0'],candidates:[]}])
    assert.throws(()=>quadraticOracle(input),/invalid_tool_evidence/);
  assert.equal(parseSympyProposal('{"method":"sympy","roots":[],"reason":"Ingen reell rot."}').roots.length,0);
  assert.equal(parseSympyProposal('{"method":"sympy","roots":[],"reason":"x","code":"shell"}'),null);
});
test('seeded fixtures remain distinct, committed and have contrasting root-set controls',()=>{
  for(let seed=0;seed<100;seed++){
    const cases=makeSympyCases(String(seed));
    assert.deepEqual(cases.map(f=>quadraticOracle(f.input).distinctRootCount),[2,1,0]);
    assert.ok(cases.every(f=>quadraticOracle(f.input).accepted&&!quadraticOracle(f.control).accepted));
    assert.deepEqual(cases,makeSympyCases(String(seed)));
  }
  assert.notEqual(makeSympyCases('123')[0].commitment,makeSympyCases('124')[0].commitment);
});
