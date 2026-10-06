import test from 'node:test';
import assert from 'node:assert/strict';
import { hypothesisPrompt, parseHypothesis, pilotData, runHypothesisPilot } from '../research/hypothesis-pilot.mjs';
const proposal={variable:'realgdp',question:'Finns lagg-1-beroende i real BNP-tillväxt?',rationale:'Tröghet i ekonomin kan ge seriellt beroende.',h0:'phi=0',h1:'phi!=0',method:'ar1'};
test('pilot formulation sees metadata only and refuses changes to its hypothesis class',()=>{
  const shown=JSON.parse(hypothesisPrompt()[1].content);
  assert.equal(shown.dataset.observations,203);assert.equal(shown.dataset.rows,undefined);
  assert.equal(shown.data,undefined);assert.equal(shown.measured,undefined);
  assert.deepEqual(parseHypothesis(JSON.stringify(proposal)),proposal);
  for(const change of [{variable:'unemp'},{variable:'toString'},{h0:'phi=1'},{h1:'phi>0'},{method:'shell'},{code:'exec'},{question:''}])
    assert.throws(()=>parseHypothesis(JSON.stringify({...proposal,...change})),/invalid_model_proposal/);
  const {input,periods}=pilotData('realgdp');assert.equal(input.train.length,128);assert.equal(input.holdout.length,16);
  assert.deepEqual(periods,{trainingStart:'1973Q4',trainingEnd:'2005Q3',holdoutStart:'2005Q4',holdoutEnd:'2009Q3'});
  assert.deepEqual(pilotData('realgdp'),{input,periods});
});
test('failed formulation or commitment prevents any tool analysis',async()=>{
  let calls=0;
  await assert.rejects(runHypothesisPilot(async()=>({text:'{}'}),async()=>{calls++;},async()=>{}),/invalid_model_proposal/);
  await assert.rejects(runHypothesisPilot(async()=>({text:JSON.stringify(proposal)}),async()=>{calls++;},async()=>{throw new Error('persist failed');}),/persist failed/);
  assert.equal(calls,0);
});
