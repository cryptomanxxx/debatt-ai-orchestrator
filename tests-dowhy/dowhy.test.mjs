import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { callDowhy, validateDowhy, makeDowhyCases, runDowhyExperiment } from '../research/dowhy.mjs';
const run = promisify(execFile), seed = '123', fixtures = makeDowhyCases(seed);
const answer = f => ({ method: 'dowhy', adjustment: ['z'], effect: f.truth.effect, reason: 'Förslag före validering.' });
test('actual DoWhy executes controls, verifies all quantities and separates model failure', async () => {
  let committed = false, index = 0;
  const receipts = [];
  const report = await runDowhyExperiment(seed, async messages => {
    assert.ok(committed);
    const visible = JSON.parse(messages[1].content);
    assert.deepEqual(Object.keys(visible).sort(), ['columns', 'protocol', 'rows']);
    assert.deepEqual(visible.rows, fixtures[index].input.rows);
    assert.equal(visible.truth, undefined); assert.equal(visible.control, undefined);
    return {text: JSON.stringify(answer(fixtures[index++])), provider:'test', model:'same'};
  }, async input => { const e = await callDowhy(input); receipts.push(e); return e; }, commitments => {
    assert.equal(commitments.length, 3); assert.equal(commitments[0].sha256, fixtures[0].commitment); committed = true;
  });
  assert.equal(receipts.length, 6); assert.equal(report.status, 'passed');
  for (const c of report.cases) {
    assert.notEqual(c.evidence.result.decision, c.controlEvidence.result.decision);
    assert.ok(c.hypothesisTest.independentlyVerified);
  }
  for (const mutate of [e=>{e.result.coefficients[0]+=1}, e=>{e.result.coefficients[1]+=1}, e=>{e.result.coefficients[2]+=1}, e=>{e.result.effect+=1},
    e=>{e.result.naiveEffect+=1}, e=>{e.result.residualMse+=1}, e=>{e.result.residualMse=-1e-10},
    e=>{e.result.effect=NaN}, e=>{e.result.rowCount++}, e=>{e.result.adjustmentVariables=[]},
    e=>{e.result.decision='negative'}, e=>{e.inputSha256='bad'}, e=>{e.versions.dowhy='bad'},
    e=>{e.adapterVersion++}, e=>{e.runtime='wrong'}, e=>{e.result.extra='bad'}]) {
    const e=structuredClone(receipts[0]); mutate(e);
    assert.throws(()=>validateDowhy(e,fixtures[0].input), /invalid_tool_evidence/);
  }
  assert.throws(()=>validateDowhy(receipts[0],fixtures[1].input), /invalid_tool_evidence/);
  index=0; let calls=0;
  const wrong=await runDowhyExperiment(seed,async()=> {
    const p=answer(fixtures[index++]); p.adjustment=[]; p.effect+=1;
    return {text:JSON.stringify(p),provider:'test',model:'same'};
  },async()=>receipts[calls++],()=>{});
  assert.equal(wrong.status,'failed'); assert.ok(wrong.cases.every(c=>!c.passed));
  assert.deepEqual(wrong.cases.map(c=>c.hypothesisTest),report.cases.map(c=>c.hypothesisTest));
  index=0; calls=0; const partial=[];
  await assert.rejects(runDowhyExperiment(seed,async()=>({text:JSON.stringify(answer(fixtures[index++])),provider:'test',model:'same'}),
    async()=>{if(calls===2) throw new Error('transport'); return receipts[calls++];},()=>{},
    {onProgress:cases=>partial.push(cases)}));
  assert.equal(partial.at(-1).length,1);
  let toolCalls=0;
  await assert.rejects(runDowhyExperiment(seed,async()=>({text:'{}'}),async()=>{toolCalls++},()=>{}),/invalid_model_proposal/);
  assert.equal(toolCalls,0);
  await assert.rejects(runDowhyExperiment(seed,()=>assert.fail('model before commitment'),callDowhy,()=>{throw new Error('commit failed')}));
});

test('Python independently refuses singular designs, code, booleans, large payloads and invalid numbers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dowhy-boundary-'));
  try {
    const preload = join(dir, 'input.mjs');
    const overlapping = {rows: Array(25).fill([1,1,1])};
    const boolean = structuredClone(fixtures[0].input); boolean.rows[0][1] = true;
    const tooLarge = structuredClone(fixtures[0].input); tooLarge.rows[0][0] = 17;
    for (const raw of [JSON.stringify(overlapping), JSON.stringify(boolean), JSON.stringify(tooLarge),
      JSON.stringify({ ...fixtures[0].input, code: 'exec' }), 'x'.repeat(8193),
      '{"rows":[[NaN,1,1]]}']) {
      await writeFile(preload, `import {spawn} from 'node:child_process'; const p=spawn(${JSON.stringify(fileURLToPath(new URL('../.dowhy-venv/bin/python', import.meta.url)))},
        ['-I',${JSON.stringify(fileURLToPath(new URL('../scripts/dowhy_bridge.py', import.meta.url)))}]);
        p.stdin.end(${JSON.stringify(raw)}); p.stdout.pipe(process.stdout); p.on('exit',code=>process.exitCode=code);`);
      await assert.rejects(run(process.execPath, [preload], { timeout: 20000 }),
        e => e.code === 1 && JSON.parse(e.stdout).error === 'dowhy_tool_execution_failed');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('full runner saves real dowhy evidence, model failures and partial results with bounded budgets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dowhy-runner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    for (const mode of ['correct', 'wrong', 'aborted']) {
      const answers = fixtures.map(answer);
      if (mode === 'wrong') answers.forEach(p => { p.effect += 1; p.adjustment = []; });
      await writeFile(preload, `import {writeFile} from 'node:fs/promises'; let index=0; const answers=${JSON.stringify(answers)};
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')) { if(options.method==='POST') {await writeFile('saved.json',options.body);return new Response('',{status:201});} return Response.json([]); }
 const body=JSON.parse(options.body); if(body.completionTokenLimit!==4096) throw new Error('budget');
 if(${JSON.stringify(mode)}==='aborted' && index===1) return new Response('{}',{status:503});
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answers[index++])});
};`);
      const command = () => run(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
        { cwd: dir, env: { ...process.env, EXPERIMENT: 'dowhy-backdoor', EXPERIMENT_SEED: seed,
          ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' }, timeout: 60000 });
      if (mode === 'aborted') await assert.rejects(command()); else await command();
      const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
      assert.equal(saved.toolId, 'dowhy');
      assert.equal(saved.executionStatus, mode === 'aborted' ? 'error' : 'completed');
      assert.equal(saved.status, mode === 'correct' ? 'passed' : 'failed');
      assert.equal(saved.modelCalls, mode === 'aborted' ? 2 : 3);
      assert.equal(saved.toolCalls, mode === 'aborted' ? 2 : 6);
      assert.equal(saved.cases.length, mode === 'aborted' ? 1 : 3);
      assert.ok(saved.cases.every(c => c.hypothesisTest.independentlyVerified));
      const markdown = await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8');
      assert.ok(markdown.includes('Antaganden:')); assert.ok(markdown.includes('ojusterad association='));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
