import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScienceCases, sciencePrompt, parseScienceProposal, validateScienceResult, mixtureOracle,
  verifyRecurrence, studentTwoSidedPvalue, regressionOracle, holm, runScienceExperiment, PROTOCOLS } from '../research/science.mjs';
import { callScienceTool } from '../research/python-tools.mjs';

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
