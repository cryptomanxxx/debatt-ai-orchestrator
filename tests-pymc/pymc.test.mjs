import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import manifest from '../research/pymc-toolchain.json' with {type:'json'};
import { callPymc,validatePymc,runPymcExperiment } from '../research/pymc.mjs';
import { pilotData } from '../research/hypothesis-pilot.mjs';
const run=promisify(execFile),seed='20261006';
const input={train:pilotData('realgdp').input.train,seed},control={train:Array.from({length:65},(_,i)=>String([1,0,-1,0][i%4])),seed};
const proposal={method:'pymc',decision:'positive',reason:'Hypotes om positiv persistens.'};
test('real PyMC fits positive GDP and analytic null; quantities, diagnostics and full runner are verified',{timeout:400000},async()=>{
  const receipts=await Promise.all([callPymc(input),callPymc(control)]);
  const primary=validatePymc(receipts[0],input),nullResult=validatePymc(receipts[1],control);
  assert.equal(primary.decision,'positive');assert.ok(primary.probabilityPositive>.99);
  assert.equal(nullResult.decision,'inconclusive');assert.equal(nullResult.probabilityPositive,.5);
  const cache=async data=>JSON.stringify(data)===JSON.stringify(input)?receipts[0]:JSON.stringify(data)===JSON.stringify(control)?receipts[1]:null;
  let committed=false;
  const report=await runPymcExperiment(seed,async()=>{assert.equal(committed,true);return {text:JSON.stringify(proposal),provider:'test',model:'same'};},cache,()=>{committed=true;});
  assert.equal(report.status,'passed');assert.equal(report.cases.length,1);
  assert.equal(report.cases[0].hypothesisTest.independentlyVerified,true);
  const wrong=await runPymcExperiment(seed,async()=>({text:JSON.stringify({...proposal,decision:'negative'}),provider:'test',model:'same'}),cache,()=>{});
  assert.equal(wrong.status,'failed');
  assert.deepEqual(wrong.cases[0].hypothesisTest,report.cases[0].hypothesisTest);
  for(const mutate of [e=>{e.inputSha256='wrong';},e=>{e.versions.pymc='wrong';},e=>{e.result.probabilityPositive=.5;},
    e=>{e.result.phiInterval95[0]=0;},e=>{e.result.mcmc.maximumRhat=1.1;},e=>{e.result.mcmc.minimumEssBulk=10;},
    e=>{e.result.mcmc.divergences=1;},e=>{e.result.densityProbes[0].logDensity+=1;},e=>{e.result.prior.shape=4;}]) {
    const e=structuredClone(receipts[0]);mutate(e);assert.throws(()=>validatePymc(e,input),/invalid_tool_evidence/);
  }
  const dir=await mkdtemp(join(tmpdir(),'oraklet-pymc-'));
  try {
    const preload=join(dir,'mock.mjs');await writeFile(preload,`
import {writeFile} from 'node:fs/promises';
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const receipts=${JSON.stringify(receipts)};
cp.execFile=(file,args,options,callback)=>({stdin:{on:()=>{},end:raw=>{
  const data=JSON.parse(raw);const receipt=receipts[data.train.length===128?0:1];
  queueMicrotask(()=>callback(null,JSON.stringify(receipt)));}}});syncBuiltinESMExports();
globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('supabase.co')){if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}return Response.json([]);}
  const body=JSON.parse(options.body);if(body.completionTokenLimit!==4096)throw new Error('budget');
  return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:${JSON.stringify(JSON.stringify(proposal))}});
};`);
    await run(process.execPath,['--import',pathToFileURL(preload).href,fileURLToPath(new URL('../research/runner.mjs',import.meta.url))],
      {cwd:dir,env:{...process.env,EXPERIMENT:'pymc-gdp-ar1',EXPERIMENT_SEED:seed,ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:15000});
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.executionStatus,'completed');assert.equal(saved.toolId,'pymc');assert.equal(saved.modelCalls,1);assert.equal(saved.toolCalls,2);
    assert.equal(saved.cases[0].hypothesisTest.measured.probabilityPositive,primary.probabilityPositive);
    assert.ok((await readFile(join(dir,'reports/oraklet-lab/report.md'),'utf8')).includes('P(phi>0)='));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('PyMC lockfile and manifest list exactly the same versions',async()=>{
  const lines=(await readFile(new URL('../research/pymc-requirements.lock',import.meta.url),'utf8')).trim().split('\n');
  assert.deepEqual(Object.fromEntries(lines.map(l=>l.split('=='))),manifest.packages);
});
