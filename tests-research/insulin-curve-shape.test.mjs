import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { CURVE_PROTOCOL,forecastShapeRows,evaluateCurveShape,callCurveShape,validateCurveShape,
  makeCurveCases,parseCurveProposal,runCurveShapeExperiment,curveMarkdown } from '../research/insulin-curve-shape.mjs';
import { forecastWarmingRows,WARMING_DATA_SHA256 } from '../research/insulin-warming.mjs';
const source = JSON.parse(await readFile(new URL('../research/data/insulin-aspart-warming.json',import.meta.url)));
const rows = source.points.map(({minute,unheated,heated}) => ({minute,unheated,heated}));
const run = promisify(execFile);

test('fixed exponent-2 form recovers synthetic parameters and retains unchanged original models',()=>{
  const curve = (t,tau,A) => t ? A*(t/tau)**2*Math.exp(2*(1-t/tau)) : 0;
  const synthetic = [0,20,30,40,50,60,90,120].map(minute => ({minute,
    unheated:curve(minute,60,80),heated:curve(minute,40,100)}));
  const models = forecastShapeRows(synthetic,60), shape = models.at(-1);
  assert.equal(shape.shapePower,2);assert.equal(shape.parameters,4);
  assert.deepEqual(shape.tauMinutes,{unheated:60,heated:40});
  assert.ok(shape.trainingMse < 1e-8);
  for (const p of shape.predictions) {
    assert.ok(Math.abs(p.unheated-curve(p.minute,60,80)) < 1e-8);
    assert.ok(Math.abs(p.heated-curve(p.minute,40,100)) < 1e-8);
  }
  for (const origin of [30,60,90]) assert.deepEqual(forecastShapeRows(rows,origin).slice(0,4).map(({shapePower,...m})=>m),forecastWarmingRows(rows,origin));
});

test('future values cannot influence fits, forecasts or dense graph samples',()=>{
  for (const origin of [30,60,90]) {
    const changed = rows.map(r => r.minute > origin ? {...r,heated:600,unheated:-600} : r);
    assert.deepEqual(forecastShapeRows(changed,origin),forecastShapeRows(rows,origin));
    assert.deepEqual(forecastShapeRows(rows.filter(r=>r.minute<=origin),origin),forecastShapeRows(rows,origin));
    const m = evaluateCurveShape({origin,mode:'observed'});
    for (const curve of m.plot.curves) {
      const model = m.scenarios[0].models.find(x=>x.kind===curve.kind);
      for (const p of model.predictions) for (const arm of ['unheated','heated'])
        assert.equal(curve.points.find(x=>x.minute===p.minute)[arm],p[arm]);
    }
    assert.ok(m.plot.points.every(r=>r.minute<=origin+60));
    assert.equal(m.analysisKind,'exploratory-same-figure-followup');assert.equal(m.independentReplication,false);
  }
});

test('primary criterion needs both references at both horizons; stress and actual targets are retained',()=>{
  for (const origin of [30,60,90]) {
    const m = evaluateCurveShape({origin,mode:'observed'});
    assert.equal(m.testedPatterns,5);assert.equal(m.clinicalForecastValidated,false);
    for (const s of m.scenarios) {
      const pass = s.metrics.every(r=>r.shape2Mse<r.bothMse-1e-8 && r.shape2Mse<r.persistenceMse-1e-8);
      assert.equal(s.decision,pass ? 'shape_beats_both_references' : 'mixed_or_no_improvement');
      for (const r of s.metrics) {
        assert.equal(r.minute,origin+r.horizon);assert.equal(r.points,2);
        for (const model of s.models) {
          const p=model.predictions.find(p=>p.horizon===r.horizon);
          assert.equal(r[model.kind+'Mse'],((p.heated-r.observed.heated)**2+(p.unheated-r.observed.unheated)**2)/2);
        }
      }
    }
  }
  // This contrast guards against declaring success after beating only the old curve.
  const after60 = evaluateCurveShape({origin:60,mode:'observed'});
  assert.ok(after60.horizonMetrics.every(r=>r.shape2Mse<r.bothMse));
  assert.ok(after60.horizonMetrics[0].shape2Mse>after60.horizonMetrics[0].persistenceMse);
  assert.equal(after60.decision,'mixed_or_no_improvement');
});

test('alternate arithmetic checks all evidence including plots; identical-arm control does not forbid shape gains',async()=>{
  for (const origin of [30,60,90]) for (const mode of ['observed','null-control']) {
    const input = {origin,mode}, e = await callCurveShape(input);
    validateCurveShape(e,input);
    if (mode === 'null-control') for (const model of e.result.scenarios[0].models) {
      assert.equal(model.tauMinutes.heated,model.tauMinutes.unheated);
      assert.equal(model.peakScale.heated,model.peakScale.unheated);
      for (const p of model.predictions) assert.equal(p.heated,p.unheated);
    }
    for (const mutate of [e=>{e.dataSha256='changed';},e=>{e.result.horizonMetrics[0].shape2Mse+=1;},
      e=>{e.result.scenarios[0].models.at(-1).tauMinutes.heated+=2;},
      e=>{e.result.plot.curves.at(-1).points.at(-1).heated+=1;},e=>{e.result.independentReplication=true;}]) {
      const fake=structuredClone(e);mutate(fake);assert.throws(()=>validateCurveShape(fake,input));
    }
  }
});

test('bounded tool/proposal contract rejects arbitrary inputs and commitments bind the new protocol',async()=>{
  for (const input of [null,{}, {origin:45,mode:'observed'}, {origin:60,mode:'live'}, {origin:60,mode:'observed',power:3}])
    await assert.rejects(callCurveShape(input));
  for (const seed of ['', 'bad', '1234567890', null]) assert.throws(()=>makeCurveCases(seed));
  assert.notEqual(makeCurveCases('1')[0].commitment,makeCurveCases('2')[0].commitment);
  assert.match(CURVE_PROTOCOL.rule,/tidigare resultat är redan kända/);
  for (const text of ['null','{}',JSON.stringify({decision:'shape_beats_both_references',robustness:'all_tested_patterns',reason:'',power:2})])
    assert.equal(parseCurveProposal(text),null);
});

test('commit before model; no future values in prompt; wrong proposals and partial outcomes survive',async()=>{
  let committed=false, toolCalls=0, progress=[];
  const report=await runCurveShapeExperiment('20261008',async messages=>{
    assert.ok(committed);
    const p=JSON.parse(messages[1].content);
    assert.ok(p.training.every(r=>r.minute<=p.origin));assert.equal(p.source.points,undefined);
    const measured=evaluateCurveShape({origin:p.origin,mode:'observed'});
    return {text:JSON.stringify({decision:measured.decision==='mixed_or_no_improvement'?'shape_beats_both_references':'mixed_or_no_improvement',
      robustness:measured.robustness,reason:'Deliberately wrong.'}),provider:'test',model:'same'};
  }, async input=>{toolCalls++;return callCurveShape(input);},async fixtures=>{assert.equal(fixtures.length,3);committed=true;},
  {onProgress:async cases=>{progress=cases;}});
  assert.equal(report.status,'failed');assert.equal(progress.length,3);assert.equal(toolCalls,6);
  assert.ok(report.cases.every(c=>!c.passed && c.hypothesisTest.measured.scenarios.length===5));
  assert.match(curveMarkdown(report.cases),/Ny form/);assert.match(curveMarkdown(report.cases),/Gränsträff/);
  let n=0;progress=[];
  await assert.rejects(runCurveShapeExperiment('1',async()=>({text:++n===1?JSON.stringify({decision:'mixed_or_no_improvement',robustness:'no_tested_patterns',reason:'test'}):'{}'}),
    callCurveShape,async()=>{}, {onProgress:async cases=>{progress=cases;}}));
  assert.equal(progress.length,1);
});

test('production runner saves comparison/provenance; plotting produces all origins and checks samples',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'curve-shape-runner-'));
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
      {cwd:dir,env:{...process.env,EXPERIMENT:'insulin-curve-shape',EXPERIMENT_SEED:' 20261008 ',
        ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:20000});
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.executionStatus,'completed');assert.equal(saved.seed,'20261008');
    assert.equal(saved.modelCalls,3);assert.equal(saved.toolCalls,6);assert.equal(saved.toolRuntime,'github-actions-node');
    assert.ok(saved.cases.every(c=>c.data.dataSha256===WARMING_DATA_SHA256));
    const directory=join(dir,'reports/oraklet-lab'), path=join(directory,'report.json');
    const raw=await readFile(path);
    const markdown=await readFile(join(directory,'report.md'),'utf8');
    assert.match(markdown,/Utforskande kurvformsjämförelse/);assert.match(markdown,/Persistens/);assert.match(markdown,/Tau utan värme/);
    const script=fileURLToPath(new URL('../scripts/plot_insulin_curves.py',import.meta.url));
    await run('python3',[script,path],{timeout:25000});
    const manifest=JSON.parse(await readFile(join(directory,'curve-plots.json'),'utf8'));
    assert.equal(manifest.plots.length,6);assert.equal(manifest.reportSha256,createHash('sha256').update(raw).digest('hex'));
    for (const plot of manifest.plots) {
      const bytes=await readFile(join(directory,plot.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),plot.sha256);
      if (plot.file.endsWith('.png')) assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      else {assert.match(bytes.toString(),/Minuter efter bolus/);assert.match(bytes.toString(),/Persistens/);}
    }
    saved.cases[0].hypothesisTest.measured.plot.curves[0].points.at(-1).heated+=1;
    await writeFile(path,JSON.stringify(saved));
    await assert.rejects(run('python3',[script,path],{timeout:15000}));
    // Partial reports still render their completed case; wrong proposal is irrelevant.
    saved.cases=saved.cases.slice(1,2);saved.executionStatus='error';
    await writeFile(path,JSON.stringify(saved));await run('python3',[script,path],{timeout:15000});
    assert.equal(JSON.parse(await readFile(join(directory,'curve-plots.json'),'utf8')).plots.length,2);
  } finally {await rm(dir,{recursive:true,force:true});}
});
