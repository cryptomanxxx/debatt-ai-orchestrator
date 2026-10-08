import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp,rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WARMING_DATA_SHA256,WARMING_PROTOCOL,forecastWarmingRows,evaluateWarming,callWarming,
  validateWarming,makeWarmingCases,parseWarmingProposal,runWarmingExperiment,warmingMarkdown } from '../research/insulin-warming.mjs';
const raw=await readFile(new URL('../research/data/insulin-aspart-warming.json',import.meta.url));
const source=JSON.parse(raw);
const rows=source.points.map(({minute,unheated,heated})=>({minute,unheated,heated}));
const curve=(t,tau,A)=>t===0?0:A*(t/tau)*Math.exp(1-t/tau);

test('digitization pins figure bytes, marker coordinates, units and clinically distinct endpoint',()=>{
  assert.equal(createHash('sha256').update(raw).digest('hex'),WARMING_DATA_SHA256);
  assert.equal(source.source.figureSha256,'2019408ba0b3dab28ce48ae7ebff4acef6fcf62964c69f29bd7bd4213f405436');
  assert.equal(source.source.insulinCurveParticipants,12);assert.equal(source.source.unheatedSkinTemperatureC,null);
  assert.equal(source.digitization.assumedErrorUuPerMl,source.digitization.assumedVerticalErrorPx*0.5);
  for(const row of source.points){
    for(const arm of ['unheated','heated'])assert.equal(row[arm],(307-row[arm+'YPx'])*0.5);
    const x=80+row.minute*(547-80)/300;assert.ok(Math.abs(x-row.xPx)<=2);
  }
  assert.ok(rows.at(-1).unheated<0,'negative late baseline-subtracted observations remain visible');
  assert.ok(!rows.some(r=>r.minute===10),'overlapping unresolved marker is not invented');
  assert.notEqual(makeWarmingCases('1')[0].commitment,makeWarmingCases('2')[0].commitment);
  assert.deepEqual(makeWarmingCases('1').map(x=>x.input),makeWarmingCases('2').map(x=>x.input));
});

test('fit has analytic identical-arm control and a recoverable timing contrast without future fitting',()=>{
  const minutes=[0,20,30,40,50,60,70,80,90,120,150];
  const identical=minutes.map(minute=>({minute,unheated:curve(minute,60,80),heated:curve(minute,60,80)}));
  for(const model of forecastWarmingRows(identical,60)){
    assert.equal(model.tauMinutes.unheated,60);assert.equal(model.tauMinutes.heated,60);
    assert.ok(model.trainingMse<1e-8);
    for(const p of model.predictions)assert.ok(Math.abs(p.heated-curve(p.minute,60,80))<1e-8);
  }
  const contrast=minutes.map(minute=>({minute,unheated:curve(minute,60,80),heated:curve(minute,40,80)}));
  const timing=forecastWarmingRows(contrast,60).find(x=>x.kind==='timing');
  assert.equal(timing.tauMinutes.unheated,60);assert.equal(timing.tauMinutes.heated,40);
  assert.ok(timing.trainingMse<1e-8);
  for(const p of timing.predictions)assert.ok(Math.abs(p.heated-curve(p.minute,40,80))<1e-8);
});

test('changing every future point cannot change parameters or predictions; horizons use actual targets',()=>{
  for(const origin of [30,60,90]){
    const futureChanged=rows.map(r=>r.minute>origin?{...r,heated:600,unheated:-600}:r);
    assert.deepEqual(forecastWarmingRows(rows,origin),forecastWarmingRows(futureChanged,origin));
    assert.deepEqual(forecastWarmingRows(rows.filter(r=>r.minute<=origin),origin),forecastWarmingRows(rows,origin));
    const m=evaluateWarming({origin,mode:'observed'});
    assert.deepEqual(m.horizonMetrics.map(x=>x.minute),[origin+30,origin+60]);
    for(const r of m.horizonMetrics)assert.deepEqual(r.observed,{
      unheated:rows.find(p=>p.minute===r.minute).unheated,heated:rows.find(p=>p.minute===r.minute).heated});
  }
});

test('all models fit the same prefix; added parameters and fixed reading patterns are explicit',()=>{
  for(const origin of [30,60,90]){
    const m=evaluateWarming({origin,mode:'observed'});
    assert.equal(m.scenarios.length,5);assert.equal(m.physiologicalAbsorptionIdentified,false);
    for(const s of m.scenarios){
      const [shared,timing,amplitude,both]=s.models;
      assert.deepEqual(s.models.map(x=>x.parameters),[2,3,3,4]);
      assert.ok(timing.trainingMse<=shared.trainingMse+1e-7);
      assert.ok(amplitude.trainingMse<=shared.trainingMse+1e-7);
      assert.ok(both.trainingMse<=Math.min(timing.trainingMse,amplitude.trainingMse)+1e-7);
      for(const r of s.metrics){assert.equal(r.points,2);assert.ok(Number.isFinite(r.bothMse));
        const last=rows.find(p=>p.minute===origin);
        if(s.pattern==='central'){
          assert.deepEqual(r.persistencePrediction,{unheated:last.unheated,heated:last.heated});
          assert.equal(r.persistenceMse,((last.unheated-r.observed.unheated)**2+(last.heated-r.observed.heated)**2)/2);
        }
      }
    }
  }
  const central=evaluateWarming({origin:60,mode:'observed'});
  assert.equal(central.decision,'mixed_or_no_improvement');assert.equal(central.robustness,'some_tested_patterns');
});

test('alternate arithmetic and residual search agree; forged evidence and open inputs fail closed',async()=>{
  for(const origin of [30,60,90])for(const mode of ['observed','null-control']){
    const input={origin,mode},e=await callWarming(input);validateWarming(e,input);
    if(mode==='null-control'){
      assert.equal(e.result.decision,'mixed_or_no_improvement');
      for(const r of e.result.horizonMetrics)assert.ok(Math.abs(r.sharedMse-r.timingMse)<1e-7);
    }
    for(const mutate of [e=>{e.dataSha256='bad';},e=>{e.result.horizonMetrics[0].timingMse+=10;},
      e=>{e.result.scenarios[0].models[1].tauMinutes.heated+=2;},e=>{e.result.physiologicalAbsorptionIdentified=true;}]){
      const forged=structuredClone(e);mutate(forged);assert.throws(()=>validateWarming(forged,input));
    }
  }
  for(const input of [{origin:45,mode:'observed'},{origin:60,mode:'live'},
    {origin:60,mode:'observed',code:'run'},null])await assert.rejects(callWarming(input));
  assert.throws(()=>forecastWarmingRows(rows.map(r=>({...r,heated:NaN})),60));
  assert.throws(()=>forecastWarmingRows(rows.slice().reverse(),60));
  for(const text of ['{}','null',JSON.stringify({decision:'timing_improves_both',robustness:'all_tested_patterns',reason:'x',dose:1})])
    assert.equal(parseWarmingProposal(text),null);
});

test('changed digitization snapshot fails integrity guard before execution',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'warming-integrity-'));
  try{
    await mkdir(join(dir,'data'));
    for(const name of ['insulin-warming.mjs','errors.mjs'])await writeFile(join(dir,name),await readFile(new URL('../research/'+name,import.meta.url)));
    await writeFile(join(dir,'data/insulin-aspart-warming.json'),'{}');
    await assert.rejects(promisify(execFile)(process.execPath,[join(dir,'insulin-warming.mjs')]));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('commitments precede AI; prompt excludes holdout values, scientific outcomes survive wrong proposals',async()=>{
  let committed=false,tools=0,progress=[];
  const report=await runWarmingExperiment('20261008',async messages=>{
    assert.ok(committed);const p=JSON.parse(messages[1].content);
    assert.ok(p.training.every(r=>r.minute<=p.origin));assert.equal(p.training.at(-1).minute,p.origin);
    assert.equal(p.digitization.points,undefined);assert.equal(p.source.points,undefined);
    const actual=evaluateWarming({origin:p.origin,mode:'observed'});
    return {text:JSON.stringify({decision:actual.decision==='timing_improves_both'?'mixed_or_no_improvement':'timing_improves_both',
      robustness:actual.robustness,reason:'Intentionally wrong.'}),provider:'test',model:'same'};
  },async input=>{tools++;return callWarming(input);},async c=>{assert.equal(c.length,3);committed=true;},
  {onProgress:async c=>{progress=c;}});
  assert.equal(tools,6);assert.equal(report.status,'failed');assert.equal(progress.length,3);
  assert.ok(report.cases.every(c=>!c.passed&&c.hypothesisTest.measured.scenarios.length===5));
  let proposals=0;progress=[];
  await assert.rejects(runWarmingExperiment('1',async()=>({text:++proposals===1?JSON.stringify({decision:'timing_improves_both',robustness:'all_tested_patterns',reason:'test'}):'{}'}),
    callWarming,async()=>{}, {onProgress:async c=>{progress=c;}}));
  assert.equal(progress.length,1);
  assert.match(warmingMarkdown(report.cases),/Höjd MSE/);
});

test('production runner saves local forecasts, canonical seed, provenance, controls and complete markdown',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'warming-runner-'));
  try{
    const preload=join(dir,'mock.mjs');
    await writeFile(preload,`
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 const body=JSON.parse(options.body);if(body.tool)throw new Error('Local tool required');
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},
  answer:JSON.stringify({decision:'timing_improves_both',robustness:'all_tested_patterns',reason:'Test.'})});
};`);
    await promisify(execFile)(process.execPath,['--import',pathToFileURL(preload).href,
      fileURLToPath(new URL('../research/runner.mjs',import.meta.url))],{cwd:dir,
      env:{...process.env,EXPERIMENT:'insulin-warming-forecast',EXPERIMENT_SEED:' 20261008 ',
        ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:15000});
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.executionStatus,'completed');assert.equal(saved.seed,'20261008');
    assert.equal(saved.modelCalls,3);assert.equal(saved.toolCalls,6);assert.equal(saved.toolRuntime,'github-actions-node');
    assert.equal(saved.cases.length,3);assert.ok(saved.cases.every(c=>c.data.dataSha256===WARMING_DATA_SHA256));
    assert.ok(saved.cases.every(c=>c.controlEvidence.result.dataKind==='synthetic-identical-arm-control'));
    const markdown=await readFile(join(dir,'reports/oraklet-lab/report.md'),'utf8');
    assert.match(markdown,/Insulinkurvor: undanhållna/);assert.match(markdown,/Höjd MSE/);
    assert.match(markdown,/Persistens MSE/);assert.match(markdown,/Gränsträff/);assert.match(markdown,/3\/7/);assert.match(markdown,/6\/6/);
    assert.ok(saved.cases.some(c=>c.hypothesisTest.decision==='mixed_or_no_improvement'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
