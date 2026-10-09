import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {callWater,validateWater,runWaterExperiment,WATER_METHODS} from '../research/shallow-water.mjs';
const run=promisify(execFile);
const envelopes=await Promise.all([0,1,2].map(i=>callWater({seed:'20261008',case:i})));

test('real trained neural map and all four UKFs pass independent JS replay; forgeries fail',()=>{
  for(let i=0;i<3;i++) {
    const e=envelopes[i],input={seed:'20261008',case:i};validateWater(e,input);
    assert.ok(e.result.training.finalLoss<e.result.training.initialLoss/10);
    assert.deepEqual(e.result.training.weights,envelopes[0].result.training.weights);
    assert.equal(e.result.training.trainingUsesTestObservations,false);
    for(const method of WATER_METHODS) {
      assert.equal(e.result.methods[method].forecasts.length,22);
      assert.ok(e.result.metrics[method].minimumCovarianceEigenvalue>0);
    }
    for(const mutate of [
      e=>e.sourceSha256='bad',e=>e.inputSha256='bad',e=>e.result.realWorldValidated=true,
      e=>e.result.decision=e.result.decision==='hybrid_improves_all'?'mixed_or_no_improvement':'hybrid_improves_all',
      e=>e.result.training.weights[0][0][0]+=.01,
      e=>e.result.metrics['pinn-adaptive'].forecast4.heightMse+=.1,
      e=>e.result.methods['pinn-fixed'].forecasts[0].mean[0]+=.001,
      e=>e.result.methods['physics-fixed'].trace[1].covariance[0][0]+=.001,
      e=>e.result.methods['physics-adaptive'].trace[1].rUsed[0]*=2,
      e=>e.result.methods['pinn-adaptive'].metrics.maximumAbsoluteSigmaCoordinate+=.01,
      e=>e.result.methods['pinn-adaptive'].metrics.minimumCovarianceEigenvalue+=.001,
      e=>e.result.methods['pinn-adaptive'].metrics.heightCoverage95=Infinity,
      e=>e.result.testTruth[1][0]+=.01]) {
      const fake=structuredClone(e);mutate(fake);assert.throws(()=>validateWater(fake,input));
    }
  }
});

test('commitment precedes proposal, results survive wrong predictions and later failures',async()=>{
  let committed=false,progress=[];
  const report=await runWaterExperiment('20261008',async messages=>{
    assert.ok(committed);const prompt=JSON.parse(messages[1].content);
    assert.equal(prompt.testTruth,undefined);assert.equal(prompt.metrics,undefined);assert.equal(prompt.observations,undefined);
    return {text:JSON.stringify({decision:'hybrid_improves_all',reason:'Intentional contrast.'}),provider:'test',model:'same'};
  },async input=>envelopes[input.case],async list=>{assert.equal(list.length,3);committed=true;},{onProgress:async c=>{progress=c;}});
  assert.equal(report.status,'failed');assert.equal(progress.length,3);
  assert.ok(report.cases.every(c=>c.hypothesisTest.measured));
  let calls=0;progress=[];
  await assert.rejects(runWaterExperiment('20261008',async()=>({text:++calls===1?' {"decision":"mixed_or_no_improvement","reason":"x"} ':'{}',provider:'test',model:'same'}),
    async input=>envelopes[input.case],async()=>{}, {onProgress:async c=>{progress=c;}}));
  assert.equal(progress.length,1);
});

test('production runner saves full results and plots, including completed cases after an interruption',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'water-runner-'));
  try {
    const preload=join(dir,'mock.mjs');
    await writeFile(preload,`
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},
  answer:JSON.stringify({decision:'mixed_or_no_improvement',reason:'Test.'})});
};`);
    const runner=fileURLToPath(new URL('../research/runner.mjs',import.meta.url));
    const output=await run(process.execPath,['--import',pathToFileURL(preload).href,runner],
      {cwd:dir,env:{...process.env,EXPERIMENT:'shallow-water-hybrid',EXPERIMENT_SEED:' 20261008 ',
      ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:20000,maxBuffer:100000});
    assert.match(output.stdout,/Rapport sparad/);
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.executionStatus,'completed');assert.equal(saved.toolRuntime,'github-actions-python');
    assert.equal(saved.seed,'20261008');assert.equal(saved.modelCalls,3);assert.equal(saved.toolCalls,3);
    assert.equal(saved.cases.length,3);
    const directory=join(dir,'reports/oraklet-lab'),path=join(directory,'report.json');
    const raw=await readFile(path);assert.deepEqual(JSON.parse(raw),saved);
    assert.ok(Buffer.byteLength(JSON.stringify(saved))<1_500_000,'report stores every full trace only once');
    const markdown=await readFile(join(directory,'report.md'),'utf8');
    assert.match(markdown,/Kanalvågor: mätfel/);assert.match(markdown,/physics-fixed/);assert.match(markdown,/täckning/);
    const script=fileURLToPath(new URL('../scripts/plot_shallow_water.py',import.meta.url));
    await run('python3',[script,path],{timeout:20000});
    const manifest=JSON.parse(await readFile(join(directory,'shallow-water-plots.json'),'utf8'));
    assert.equal(manifest.files.length,6);assert.equal(manifest.reportSha256,createHash('sha256').update(raw).digest('hex'));
    for(const file of manifest.files) {
      const bytes=await readFile(join(directory,file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
      if(file.path.endsWith('.png'))assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      else{assert.match(bytes.toString(),/no turbulence/);assert.match(bytes.toString(),/without future sensors/);}
    }
    saved.cases[0].hypothesisTest.measured.methods['pinn-fixed'].forecasts[0].mean[0]+=.1;
    await writeFile(path,JSON.stringify(saved));await assert.rejects(run('python3',[script,path],{timeout:20000}));
    saved.cases=saved.cases.slice(1,2);saved.executionStatus='error';
    await writeFile(path,JSON.stringify(saved));await run('python3',[script,path],{timeout:20000});
    assert.equal(JSON.parse(await readFile(join(directory,'shallow-water-plots.json'),'utf8')).files.length,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});
