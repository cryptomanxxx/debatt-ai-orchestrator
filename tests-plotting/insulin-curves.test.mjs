import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { WARMING_DATA_SHA256 } from '../research/insulin-warming.mjs';
import { EXTERNAL_DATA_SHA256 } from '../research/insulin-external-curve.mjs';
const run = promisify(execFile);

for (const experiment of ['insulin-curve-shape','insulin-external-curve'])
test(`${experiment}: plot pipeline renders full production reports and rejects forged samples`,async()=>{
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
      {cwd:dir,env:{...process.env,EXPERIMENT:experiment,EXPERIMENT_SEED:' 20261008 ',
        ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:20000});
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.executionStatus,'completed');assert.equal(saved.seed,'20261008');
    assert.equal(saved.modelCalls,3);assert.equal(saved.toolCalls,6);assert.equal(saved.toolRuntime,'github-actions-node');
    assert.ok(saved.cases.every(c=>c.data.dataSha256===(experiment==='insulin-external-curve'?EXTERNAL_DATA_SHA256:WARMING_DATA_SHA256)));
    const directory=join(dir,'reports/oraklet-lab'), path=join(directory,'report.json');
    const raw=await readFile(path);
    const markdown=await readFile(join(directory,'report.md'),'utf8');
    assert.match(markdown,experiment==='insulin-external-curve'?/Separat publikation: gruppvis prognoskontroll/:/Utforskande kurvformsjämförelse/);
    assert.match(markdown,/Persistens/);assert.match(markdown,/Tau utan värme/);
    const script=fileURLToPath(new URL('../scripts/plot_insulin_curves.py',import.meta.url));
    await run('python3',[script,path],{timeout:25000});
    const manifest=JSON.parse(await readFile(join(directory,'curve-plots.json'),'utf8'));
    assert.equal(manifest.plots.length,6);assert.equal(manifest.reportSha256,createHash('sha256').update(raw).digest('hex'));
    for (const plot of manifest.plots) {
      const bytes=await readFile(join(directory,plot.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),plot.sha256);
      if (plot.file.endsWith('.png')) assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      else {assert.match(bytes.toString(),/Minuter efter bolus/);assert.match(bytes.toString(),/Persistens/);
        if(experiment==='insulin-external-curve'){assert.match(bytes.toString(),/10.1089\/dia.2013.0187/);assert.doesNotMatch(bytes.toString(),/10.1111\/pedi.12001/);}}
      assert.ok(plot.file.startsWith(experiment==='insulin-external-curve'?'external-curve-origin-':'curve-shape-origin-'));
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
