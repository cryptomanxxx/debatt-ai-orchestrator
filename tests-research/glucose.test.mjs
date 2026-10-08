import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGlucoseCases,simulate,forecast,evaluateGlucose,callGlucose,validateGlucose,runGlucoseExperiment} from '../research/glucose.mjs';

test('absorption conserves the injected amount and agrees with analytical two-depot solution',()=>{
  for(const f of makeGlucoseCases('42')) for(const row of simulate(f.input)) {
    const z=f.input.rate*row.minute;
    const exact=f.input.dose*(1-Math.exp(-z)*(1+z));
    assert.ok(Math.abs(row.absorbed-exact)<1e-8);
    assert.ok(row.absorbed>=0&&row.absorbed<=f.input.dose);
  }
});
test('unchanged-rate control has identical curves; increasing rate changes timing not total dose',()=>{
  const base=makeGlucoseCases('42')[1].input;
  const control=evaluateGlucose(base);
  assert.deepEqual(control.curve,control.baselineCurve);
  const low=simulate({...base,rate:0.012}),high=simulate({...base,rate:0.048});
  assert.ok(high[12].absorbed>low[12].absorbed);
});
test('forecast prefixes cannot be altered by future measurements',()=>{
  const {rate,...known}=makeGlucoseCases('42')[0].input;
  const rows=simulate({...known,rate}).map(r=>({minute:r.minute,glucose:r.glucose}));
  const prefix=forecast(rows.slice(0,25),known);
  const changed=rows.map((r,i)=>i>=25?{...r,glucose:r.glucose+100}:r);
  assert.deepEqual(forecast(changed,known).filter(r=>r.minute<=120),prefix);
});
test('independent solvers agree across multiple fixtures; forged evidence is rejected',async()=>{
  for(const seed of ['1','42','20261008']) for(const f of makeGlucoseCases(seed)) {
    const e=await callGlucose(f.input);validateGlucose(e,f.input);
    const forged=structuredClone(e);forged.result.horizonMetrics[0].adaptiveMse+=0.01;
    assert.throws(()=>validateGlucose(forged,f.input));
    const wrong=structuredClone(e);wrong.result.curve[0].glucose=NaN;
    assert.throws(()=>validateGlucose(wrong,f.input));
  }
});
test('invalid tool parameters are rejected',async()=>{
  await assert.rejects(callGlucose({...makeGlucoseCases('1')[0].input,rate:0}));
});
test('commit precedes proposals; measured outcomes are separate from wrong AI predictions',async()=>{
  let committed=false,calls=0;
  const report=await runGlucoseExperiment('42',async()=>{
    assert.ok(committed);return {text:JSON.stringify({absorptionAt60:'same',forecastDecision:'mixed_or_no_improvement',reason:'control'}),provider:'test',model:'test'};
  },async input=>{calls++;return callGlucose(input);},async()=>{committed=true;});
  assert.equal(calls,6);assert.equal(report.cases.length,3);
  assert.equal(report.status,'failed');
  assert.equal(report.cases[1].passed,true);
  assert.ok(report.cases.every(c=>c.hypothesisTest.independentlyVerified));
});
