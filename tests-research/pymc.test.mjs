import test from 'node:test';
import assert from 'node:assert/strict';
import { conjugateOracle } from '../research/pymc.mjs';
import { choosePlan,plannerPrompt } from '../research/catalog.mjs';
test('conjugate posterior has an analytic centered null and refuses arbitrary inputs',()=>{
  const input={train:Array.from({length:65},(_,i)=>String([1,0,-1,0][i%4])),seed:'123'};
  const r=conjugateOracle(input);
  assert.deepEqual(r.posteriorMean,[0,0]);assert.equal(r.posteriorShape,35);assert.equal(r.posteriorScale,32);
  assert.equal(r.probabilityPositive,.5);assert.equal(r.decision,'inconclusive');
  assert.ok(Math.abs(r.phiInterval95[0]+r.phiInterval95[1])<1e-12);
  for(const change of [{seed:'bad'},{train:['1']},{code:'shell'},{train:Array(65).fill('1')}])
    assert.throws(()=>conjugateOracle({...input,...change}),/invalid_tool_evidence/);
});
test('real-data PyMC follow-up is available manually and excluded from automatic planning',async()=>{
  assert.ok(!JSON.parse(plannerPrompt([],'123')[1].content).catalog.some(e=>e.id==='pymc-gdp-ar1'));
  const propose=async()=>({text:JSON.stringify({experimentId:'pymc-gdp-ar1',seed:'123',reason:'Uppföljning.'})});
  await assert.rejects(choosePlan('auto','123',[],propose),/invalid_plan/);
  assert.equal((await choosePlan('pymc-gdp-ar1','123',[],propose)).experimentId,'pymc-gdp-ar1');
});
