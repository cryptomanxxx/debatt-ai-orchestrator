import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EXTERNAL_PROTOCOL,EXTERNAL_DATA_SHA256,forecastExternalRows,scoreExternalRows,classifyExternalMetrics,
  evaluateExternalCurve,callExternalCurve,validateExternalCurve,makeExternalCases,parseExternalProposal,
  runExternalCurveExperiment,externalMarkdown } from '../research/insulin-external-curve.mjs';
import { forecastShapeRows,evaluateCurveShape } from '../research/insulin-curve-shape.mjs';
import { CATALOG,plannerPrompt,choosePlan } from '../research/catalog.mjs';
const raw = await readFile(new URL('../research/data/insulin-aspart-external.json',import.meta.url));
const source = JSON.parse(raw);
const rows = source.points.map(({minute,unheated,heated}) => ({minute,unheated,heated}));
const run = promisify(execFile);

test('separate source, marker calibration and pre-digitization specification are pinned',async()=>{
  assert.equal(createHash('sha256').update(raw).digest('hex'),EXTERNAL_DATA_SHA256);
  const lock = await readFile(new URL('../research/data/insulin-external-analysis-lock.md',import.meta.url));
  assert.equal(createHash('sha256').update(lock).digest('hex'),EXTERNAL_PROTOCOL.analysisLockSha256);
  assert.equal(source.source.doi,'10.1089/dia.2013.0187');assert.equal(source.source.pkParticipants,16);
  assert.notEqual(source.source.doi,source.source.previousDoi);assert.equal(source.source.warmingEndMinutes,60);
  for(const r of source.points)for(const a of ['unheated','heated'])
    assert.equal(r[a],Math.round((341-r.pixel[a+'Y'])*100/221*2)/2);
  assert.ok(source.points.at(-1).heated<0,'late negative increments are preserved');
  assert.match(lock.toString(),/not an externally registered/);
});

test('same fixed curves fit only chronological prefixes; future values cannot change forecasts',()=>{
  for(const origin of [30,60,90]) {
    const original=forecastShapeRows(rows,origin).filter(m=>['both','shape2'].includes(m.kind));
    assert.deepEqual(forecastExternalRows(rows,origin),original);
    assert.deepEqual(forecastExternalRows(rows.filter(r=>r.minute<=origin),origin),original);
    const changed=rows.map(r=>r.minute>origin?{...r,unheated:500,heated:-500}:r);
    assert.deepEqual(forecastExternalRows(changed,origin),original);
    assert.ok(original.every(m=>m.parameters===4));
    const m=evaluateExternalCurve({origin,mode:'observed'});
    for(const model of m.scenarios[0].models)for(const p of model.predictions)for(const a of ['unheated','heated'])
      assert.equal(m.plot.curves.find(c=>c.kind===model.kind).points.find(r=>r.minute===p.minute)[a],p[a]);
  }
});

test('pooled gains cannot hide harm to either arm or losses to persistence',()=>{
  // The previous figure really has pooled gains but harms the unheated arm at origin 90.
  const prior=evaluateCurveShape({origin:90,mode:'observed'}), models=prior.scenarios[0].models;
  const metrics=prior.horizonMetrics.map(h=>({...h,armMetrics:['unheated','heated'].map(arm=>({arm,
    bothSquaredError:(models.find(m=>m.kind==='both').predictions.find(p=>p.horizon===h.horizon)[arm]-h.observed[arm])**2,
    shape2SquaredError:(models.find(m=>m.kind==='shape2').predictions.find(p=>p.horizon===h.horizon)[arm]-h.observed[arm])**2,
    persistenceSquaredError:(h.persistencePrediction[arm]-h.observed[arm])**2}))}));
  const d=classifyExternalMetrics(metrics);
  assert.equal(d.pooledDecision,'shape_beats_both_references');assert.equal(d.decision,'mixed_or_no_improvement');
  assert.equal(d.armDecisions.unheated,'mixed_or_no_improvement');
  const after60=evaluateExternalCurve({origin:60,mode:'observed'});
  assert.equal(after60.pooledDecision,'shape_beats_both_references');assert.equal(after60.decision,'mixed_or_no_improvement');
  assert.ok(after60.horizonMetrics[0].armMetrics.find(r=>r.arm==='heated').shape2SquaredError
    >after60.horizonMetrics[0].armMetrics.find(r=>r.arm==='heated').persistenceSquaredError);
  assert.equal(evaluateExternalCurve({origin:90,mode:'observed'}).decision,'shape_improves_all_arms');
});

test('group signed, absolute and squared errors agree with predictions at exact targets in all patterns',()=>{
  for(const origin of [30,60,90]) {
    const m=evaluateExternalCurve({origin,mode:'observed'});
    assert.equal(m.testedPatterns,5);assert.equal(m.independentReplication,false);assert.equal(m.clinicalForecastValidated,false);
    for(const s of m.scenarios)for(const h of s.metrics) {
      assert.equal(h.minute,origin+h.horizon);
      for(const r of h.armMetrics)for(const k of ['both','shape2','persistence']) {
        assert.equal(r[k+'Error'],r[k+'Prediction']-r.observed);
        assert.equal(r[k+'AbsoluteError'],Math.abs(r[k+'Error']));
        assert.equal(r[k+'SquaredError'],r[k+'Error']**2);
      }
      for(const k of ['both','shape2','persistence']) assert.equal(h[k+'Mse'],h.armMetrics.reduce((v,r)=>v+r[k+'SquaredError'],0)/2);
    }
  }
  assert.throws(()=>scoreExternalRows(rows.filter(r=>r.minute!==120),90));
});

test('alternate verification rejects forged group metrics, models, graphs, source and independence flags',async()=>{
  for(const origin of [30,60,90])for(const mode of ['observed','null-control']) {
    const input={origin,mode},e=await callExternalCurve(input);validateExternalCurve(e,input);
    if(mode==='null-control')for(const model of e.result.scenarios[0].models) {
      assert.equal(model.peakScale.heated,model.peakScale.unheated);assert.equal(model.tauMinutes.heated,model.tauMinutes.unheated);
    }
    for(const mutate of [e=>e.dataSha256='bad',e=>e.result.horizonMetrics[0].armMetrics[0].shape2SquaredError+=1,
      e=>e.result.scenarios[0].models[1].tauMinutes.heated+=2,e=>e.result.plot.curves[1].points.at(-1).heated+=1,
      e=>e.result.independentReplication=true,e=>e.result.armDecisions.heated='invented']) {
      const fake=structuredClone(e);mutate(fake);assert.throws(()=>validateExternalCurve(fake,input));
    }
  }
  for(const input of [null,{}, {origin:45,mode:'observed'},{origin:60,mode:'live'},{origin:60,mode:'observed',power:3}])
    await assert.rejects(callExternalCurve(input));
  for(const seed of ['',null,'bad','1234567890'])assert.throws(()=>makeExternalCases(seed));
  assert.notEqual(makeExternalCases('1')[0].commitment,makeExternalCases('2')[0].commitment);
  assert.equal(parseExternalProposal('{"decision":"shape_beats_both_references","robustness":"all_tested_patterns","reason":"Wrong criterion"}'),null);
  assert.equal(CATALOG.find(e=>e.id==='insulin-external-curve').automatic,false);
  assert.ok(!JSON.parse(plannerPrompt([],'1')[1].content).catalog.some(e=>e.id==='insulin-external-curve'));
  assert.equal((await choosePlan('insulin-external-curve','20261008',[],()=>assert.fail())).experimentId,'insulin-external-curve');
});

test('commit before Oraklet; prefix-only proposals; wrong predictions and partial cases survive',async()=>{
  let committed=false,calls=0,progress=[];
  const propose=async messages=>{
    assert.ok(committed);const p=JSON.parse(messages[1].content);
    assert.ok(p.training.every(r=>r.minute<=p.origin));assert.equal(p.source.points,undefined);assert.equal(p.digitization.points,undefined);
    const m=evaluateExternalCurve({origin:p.origin,mode:'observed'});
    return {text:JSON.stringify({decision:m.decision==='mixed_or_no_improvement'?'shape_improves_all_arms':'mixed_or_no_improvement',robustness:m.robustness,reason:'Deliberately wrong.'}),provider:'test',model:'same'};
  };
  const report=await runExternalCurveExperiment('20261008',propose,async input=>{calls++;return callExternalCurve(input);},
    async fixtures=>{assert.equal(fixtures.length,3);committed=true;},{onProgress:async cases=>{progress=cases;}});
  assert.equal(report.status,'failed');assert.equal(calls,6);assert.equal(progress.length,3);
  assert.ok(report.cases.every(c=>!c.passed && c.data.dataSha256===EXTERNAL_DATA_SHA256));
  assert.match(externalMarkdown(report.cases),/Absolutfel/);assert.match(externalMarkdown(report.cases),/Kvadratfel/);
  assert.match(externalMarkdown(report.cases),/10.1089\/dia.2013.0187/);
  let n=0;progress=[];
  await assert.rejects(runExternalCurveExperiment('1',async()=>({text:++n===1?JSON.stringify({decision:'mixed_or_no_improvement',robustness:'no_tested_patterns',reason:'test'}):'{}'}),
    callExternalCurve,async()=>{}, {onProgress:async cases=>{progress=cases;}}));assert.equal(progress.length,1);
});

test('production runner persists separate-source results and group errors without Python dependencies',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'external-curve-runner-'));
  try {
    const preload=join(dir,'mock.mjs');
    await writeFile(preload,`
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 const body=JSON.parse(options.body);if(body.tool)throw new Error('Expected local tool');
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},
  answer:JSON.stringify({decision:'mixed_or_no_improvement',robustness:'no_tested_patterns',reason:'Test.'})});
};`);
    await run(process.execPath,['--import',pathToFileURL(preload).href,fileURLToPath(new URL('../research/runner.mjs',import.meta.url))],
      {cwd:dir,env:{...process.env,EXPERIMENT:'insulin-external-curve',EXPERIMENT_SEED:' 20261008 ',
        ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:20000});
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.executionStatus,'completed');assert.equal(saved.seed,'20261008');
    assert.equal(saved.modelCalls,3);assert.equal(saved.toolCalls,6);assert.equal(saved.toolRuntime,'github-actions-node');
    assert.equal(saved.cases.length,3);assert.equal(saved.cases[2].hypothesisTest.measured.decision,'shape_improves_all_arms');
    const path=join(dir,'reports/oraklet-lab/report.json');assert.deepEqual(JSON.parse(await readFile(path)),saved);
    const markdown=await readFile(join(dir,'reports/oraklet-lab/report.md'),'utf8');
    assert.match(markdown,/Separat publikation: gruppvis prognoskontroll/);assert.match(markdown,/Gruppbeslut/);
    assert.match(markdown,/Persistens/);assert.doesNotMatch(markdown,/10.1111\/pedi.12001/);
    // No plotting command is invoked by the default Node test/build path.
  }finally{await rm(dir,{recursive:true,force:true});}
});
