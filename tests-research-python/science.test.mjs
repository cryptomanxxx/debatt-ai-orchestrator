import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScienceCases, sciencePrompt, parseScienceProposal, validateScienceResult, mixtureOracle,
  verifyRecurrence, studentTwoSidedPvalue, regressionOracle, holm, runScienceExperiment, PROTOCOLS } from '../research/science.mjs';
import { callScienceTool, fingerprint } from '../research/python-tools.mjs';

const tools=['annihilator','mixalot','statsmodels'];
const answer=(tool,fixture)=>({method:tool, ...(tool==='annihilator'?{coefficients:fixture.truth.coefficients}
  : {decision:tool==='mixalot'?mixtureOracle(fixture.input).decision:studentTwoSidedPvalue(regressionOracle(fixture.input).tStatistic,regressionOracle(fixture.input).dfResidual)<.05?'reject_h0':'do_not_reject_h0'}),reason:'Förutbestämt test.'});

test('Mixalot controls contrast all three primary outcomes, including seed 2 balanced counts',async()=>{
  const outcomes=new Set();
  for(const seed of ['1','2']) {
    const fixtures=makeScienceCases(seed,'mixalot');
    if(seed==='2') {
      assert.deepEqual(fixtures[1].input.counts,[11,13]);
      assert.equal(mixtureOracle({counts:[13,11]}).decision,'supports_h1');
      assert.deepEqual(fixtures[1].control.counts,[0,24]);
    }
    let committed,proposals=0;
    const report=await runScienceExperiment(seed,async()=>{
      const f=fixtures[proposals++];
      assert.equal(committed[f.id-1].sha256,fingerprint({input:f.input,control:f.control,truth:f.truth,
        controlExpectation:f.controlExpectation,protocol:PROTOCOLS.mixalot}));
      return {provider:'test',model:'same',text:JSON.stringify(answer('mixalot',f))};
    },input=>callScienceTool('mixalot',input),receipts=>{committed=receipts;},{toolId:'mixalot'});
    assert.equal(report.status,'passed');
    for(const c of report.cases) {
      const primary=c.evidence.result.decision;
      outcomes.add(primary);
      assert.equal(c.controlExpectation.decision,primary==='supports_h0'?'supports_h1':'supports_h0');
      assert.equal(c.controlEvidence.result.decision,c.controlExpectation.decision);
      assert.notEqual(c.controlEvidence.result.decision,primary);
    }
  }
  assert.deepEqual([...outcomes].sort(),['inconclusive','supports_h0','supports_h1']);
});

test('three integrations execute real tools and fail closed on receipts and scientific quantities',async()=>{
  for(const tool of tools) {
    const fixtures=makeScienceCases('123',tool);let calls=0,committed=false,progress=[];
    const report=await runScienceExperiment('123',async messages=>{
      assert.equal(committed,true);assert.equal(messages.length,2);
      return {provider:'test',model:'same',text:JSON.stringify(answer(tool,fixtures[calls++]))};
    },input=>callScienceTool(tool,input),()=>{committed=true;},{toolId:tool,onProgress:cases=>{progress=cases;}});
    assert.equal(report.status,'passed');assert.equal(report.cases.length,3);assert.equal(calls,3);
    assert.equal(progress.length,3);
    if(tool==='statsmodels') assert.ok(report.cases.every(c=>c.hypothesisTest.familyInference==='completed' && c.hypothesisTest.holmAdjustedPvalue>=c.hypothesisTest.measured.pvalue));
    const c=report.cases[0];
    const changes=[e=>{e.inputSha256='wrong';},e=>{e.versions.numpy='changed';},e=>{e.sourceSha256={unexpected:'wrong'};},
      e=>{e.runtime='browser';},e=>{e.adapterVersion='changed';},e=>{e.factualityChecked=true;},e=>{delete e.versions;},e=>{delete e.sourceSha256;}];
    changes.push(tool==='annihilator'?e=>{e.result.failed=1;}:tool==='mixalot'?e=>{e.result.bayesFactor10='1';}:e=>{e.result.pvalue=.5;});
    changes.push(tool==='annihilator'?e=>{e.result.coefficients[0]='0';}:tool==='mixalot'?e=>{e.result.evidenceH1='1';}:e=>{e.result.phi+=.1;});
    if(tool==='statsmodels') changes.push(e=>{e.result.confidenceInterval95[1]+=.1;});
    for(const mutate of changes) {const e=structuredClone(c.evidence);mutate(e);assert.throws(()=>validateScienceResult(e,tool,c.data),/invalid_tool_evidence/);}
    let wrongCalls=0;
    const incorrect=await runScienceExperiment('123',async()=>{
      const f=fixtures[wrongCalls++],p=answer(tool,f);
      if(f.id===1) { if(tool==='annihilator') p.coefficients=['1','1','1'];
        else p.decision=tool==='mixalot'?(p.decision==='supports_h1'?'supports_h0':'supports_h1'):(p.decision==='reject_h0'?'do_not_reject_h0':'reject_h0'); }
      return {provider:'test',model:'same',text:JSON.stringify(p)};
    },async input=>{
      for(const c of report.cases) { if(JSON.stringify(input)===JSON.stringify(c.data))return c.evidence;
        if(JSON.stringify(input)===JSON.stringify(c.controlData))return c.controlEvidence; }
      throw new Error('Unexpected fixture');
    },()=>{},{toolId:tool});
    assert.equal(incorrect.status,'failed');
    assert.equal(incorrect.cases[0].passed,false);
    assert.deepEqual(incorrect.cases[0].hypothesisTest,report.cases[0].hypothesisTest);
    let count=0;progress=[];
    await assert.rejects(runScienceExperiment('123',async()=>({provider:'test',model:'same',text:count++?'{"raw":"SECRET"}':JSON.stringify(answer(tool,fixtures[0]))}),
      input=>callScienceTool(tool,input),()=>{},{toolId:tool,onProgress:cases=>{progress=cases;}}),e=>e.message==='invalid_model_proposal' && e.diagnostic.case===2 && e.diagnostic.operation==='initial_proposal');
    assert.equal(progress.length,1);
    if(tool==='statsmodels') assert.equal(progress[0].hypothesisTest.familyInference,'pending_all_three_cases');
  }
});
