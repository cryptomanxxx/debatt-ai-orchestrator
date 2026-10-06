import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const runner=fileURLToPath(new URL('../research/runner.mjs',import.meta.url));
const science=new URL('../research/science.mjs',import.meta.url).href;

test('runner dispatches all new scientific tools and persists evidence, budgets and incomplete inference',async()=>{
  for(const [tool,experiment,failing] of [['annihilator','annihilator-recurrence',false],['mixalot','mixalot-model-comparison',false],['statsmodels','statsmodels-ar1',false],['statsmodels','statsmodels-ar1',true]]) {
    const dir=await mkdtemp(join(tmpdir(),'oraklet-science-run-'));
    try {
      const preload=join(dir,'mock.mjs');
      await writeFile(preload,`
import { writeFile } from 'node:fs/promises';
import { makeScienceCases, mixtureOracle, regressionOracle, studentTwoSidedPvalue } from ${JSON.stringify(science)};
const tool=${JSON.stringify(tool)}, fixtures=makeScienceCases('123',tool);let calls=0;
globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('supabase.co')){
    if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
    return Response.json([]);
  }
  const body=JSON.parse(options.body);if(body.tool)throw new Error('Must execute Python locally');
  if(body.completionTokenLimit!==4096)throw new Error('Wrong model budget');
  const f=fixtures[calls++];
  const oracle=tool==='statsmodels'?regressionOracle(f.input):null;
  const answer={method:tool,...(tool==='annihilator'?{coefficients:f.truth.coefficients}:{decision:tool==='mixalot'?mixtureOracle(f.input).decision:studentTwoSidedPvalue(oracle.tStatistic,oracle.dfResidual)<.05?'reject_h0':'do_not_reject_h0'}),reason:'Testförslag.'};
  return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:${failing}&&calls===2?'{}':JSON.stringify(answer)});
};`);
      const execution=run(process.execPath,['--import',pathToFileURL(preload).href,runner],{cwd:dir,
        env:{...process.env,EXPERIMENT:experiment,EXPERIMENT_SEED:'123',ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:45000});
      if(failing)await assert.rejects(execution);else await execution;
      const report=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
      assert.equal(report.toolId,tool);assert.equal(report.experimentId,experiment);
      assert.equal(report.status,failing?'failed':'passed');assert.equal(report.executionStatus,failing?'error':'completed');
      assert.equal(report.cases.length,failing?1:3);assert.equal(report.modelCalls,failing?2:3);assert.equal(report.toolCalls,failing?2:6);
      assert.ok(report.cases.every(c=>c.hypothesisTest.independentlyVerified && c.evidence.runtime==='github-actions-python'));
      const commitments=JSON.parse(await readFile(join(dir,'reports/oraklet-lab/commitments.json'),'utf8'));
      assert.ok(commitments.every(c=>c.protocol.id && c.sha256));
      const markdown=await readFile(join(dir,'reports/oraklet-lab/report.md'),'utf8');assert.ok(markdown.includes('Hypotesresultat'));
      if(failing){assert.equal(report.failure.code,'invalid_model_proposal');assert.equal(report.failure.case,2);
        assert.equal(report.cases[0].hypothesisTest.familyInference,'pending_all_three_cases');assert.ok(markdown.includes('ej klar'));
      }else if(tool==='statsmodels'){
        assert.ok(report.cases.every(c=>c.hypothesisTest.familyInference==='completed'));
        assert.ok(markdown.includes('Holm='));
      }
    }finally{await rm(dir,{recursive:true,force:true});}
  }
});
