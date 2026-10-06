import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { callSympy,validateSympy,makeSympyCases,runSympyExperiment } from '../research/sympy.mjs';
const run=promisify(execFile),seed='123',fixtures=makeSympyCases(seed);
const answer=f=>({method:'sympy',roots:f.truth.roots,reason:'Exakta rötter.'});

test('real SymPy verifies complete roots, rejects controls and tampered evidence; model errors remain separate',async()=>{
  let committed=false,index=0;const receipts=[];
  const report=await runSympyExperiment(seed,async messages=>{
    assert.equal(committed,true);const visible=JSON.parse(messages[1].content);
    assert.deepEqual(Object.keys(visible).sort(),['coefficients','protocol']);
    return {text:JSON.stringify(answer(fixtures[index++])),provider:'test',model:'same'};
  },async input=>{const e=await callSympy(input);receipts.push(e);return e;},commitments=>{
    assert.equal(commitments.length,3);assert.equal(commitments[0].sha256,fixtures[0].commitment);committed=true;
  });
  assert.equal(report.status,'passed');assert.equal(receipts.length,6);
  for(const c of report.cases){assert.equal(c.evidence.result.accepted,true);assert.equal(c.controlEvidence.result.accepted,false);}
  for(const mutate of [e=>{e.result.roots=[];},e=>{e.result.accepted=false;},e=>{e.result.discriminant='0';},
    e=>{e.inputSha256='bad';},e=>{e.versions.sympy='bad';},e=>{e.adapterVersion='bad';},e=>{e.result.distinctRootCount=1;}]){
    const e=structuredClone(receipts[0]);mutate(e);assert.throws(()=>validateSympy(e,fixtures[0].input),/invalid_tool_evidence/);
  }
  index=0;let calls=0;
  const wrong=await runSympyExperiment(seed,async()=>({text:JSON.stringify({...answer(fixtures[index++]),roots:[]}),provider:'test',model:'same'}),
    async()=>receipts[calls++],()=>{});
  assert.equal(wrong.status,'failed');assert.deepEqual(wrong.cases.map(c=>c.hypothesisTest),report.cases.map(c=>c.hypothesisTest));
  index=0;calls=0;const partial=[];
  await assert.rejects(runSympyExperiment(seed,async()=>({text:JSON.stringify(answer(fixtures[index++])),provider:'test',model:'same'}),
    async()=>{if(calls===2)throw new Error('transport');return receipts[calls++];},()=>{},{onProgress:cases=>{partial.push(cases);}}));
  assert.equal(partial.at(-1).length,1);
});

test('Python boundary independently rejects expressions, unsupported roots and oversized requests',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sympy-boundary-'));
  try{
    const preload=join(dir,'input.mjs');
    for(const raw of [JSON.stringify({coefficients:['1','0','-2'],candidates:[]}),JSON.stringify({coefficients:['1','0','0'],candidates:['0/2']}),
      JSON.stringify({coefficients:['1','0','0'],candidates:['__import__("os")']}),'x'.repeat(4097)]){
      await writeFile(preload,`import {spawn} from 'node:child_process';const p=spawn(process.env.RESEARCH_PYTHON||'python3',['-I',${JSON.stringify(fileURLToPath(new URL('../scripts/sympy_bridge.py',import.meta.url)))}]);p.stdin.end(${JSON.stringify(raw)});p.stdout.pipe(process.stdout);p.on('exit',code=>process.exitCode=code);`);
      await assert.rejects(run(process.execPath,[preload],{timeout:20000}),e=>e.code===1&&JSON.parse(e.stdout).error==='sympy_tool_execution_failed');
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('full runner executes actual SymPy and saves verified reports with bounded calls',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sympy-runner-'));
  try{
    const preload=join(dir,'mock.mjs');await writeFile(preload,`
import {writeFile} from 'node:fs/promises';let index=0;const answers=${JSON.stringify(fixtures.map(answer))};
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')){if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}return Response.json([]);}
 const body=JSON.parse(options.body);if(body.completionTokenLimit!==4096)throw new Error('budget');
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answers[index++])});
};`);
    await run(process.execPath,['--import',pathToFileURL(preload).href,fileURLToPath(new URL('../research/runner.mjs',import.meta.url))],
      {cwd:dir,env:{...process.env,EXPERIMENT:'sympy-quadratic',EXPERIMENT_SEED:seed,ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:60000});
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.status,'passed');assert.equal(saved.executionStatus,'completed');assert.equal(saved.toolId,'sympy');
    assert.equal(saved.modelCalls,3);assert.equal(saved.toolCalls,6);assert.equal(saved.cases.length,3);
    assert.ok((await readFile(join(dir,'reports/oraklet-lab/report.md'),'utf8')).includes('Rötter:'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
