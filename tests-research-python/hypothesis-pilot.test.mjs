import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dataset from '../research/macrodata.json' with {type:'json'};
import { runHypothesisPilot,VARIABLES,pilotData } from '../research/hypothesis-pilot.mjs';
import { callScienceTool,fingerprint } from '../research/python-tools.mjs';
const run=promisify(execFile);
const proposal=variable=>({variable,question:'Finns tidsberoende i tillväxten?',rationale:'Kvartalsvis persistens är ekonomiskt rimlig.',h0:'phi=0',h1:'phi!=0',method:'ar1'});
test('macrodata export exactly matches the installed pinned dataset and source CSV hash',async()=>{
  const {stdout}=await run(process.env.RESEARCH_PYTHON||'python3',['-I','-c',
    'import statsmodels.datasets.macrodata as m,pathlib,csv,json,hashlib; raw=(pathlib.Path(m.__file__).parent/"macrodata.csv").read_bytes(); rows=[{"period":str(int(float(r["year"])))+"Q"+str(int(float(r["quarter"]))),**{v:r[v] for v in ["realgdp","realcons","realinv"]}} for r in csv.DictReader(raw.decode().splitlines())]; print(json.dumps({"rows":rows,"sha256":hashlib.sha256(raw).hexdigest()}))']);
  const expected=JSON.parse(stdout);assert.deepEqual(dataset.rows,expected.rows);assert.equal(dataset.metadata.upstreamCsvSha256,expected.sha256);
});
test('all allowed hypotheses execute real Statsmodels with commitment before primary and null controls',async()=>{
  for(const variable of Object.keys(VARIABLES)) {
    const events=[];let committed;const progress=[];
    const report=await runHypothesisPilot(async()=>{events.push('formulate');return {provider:'test',model:'same',text:JSON.stringify(proposal(variable))};},
      async input=>{assert.ok(committed);events.push('tool');return callScienceTool('statsmodels',input);},
      async commitment=>{events.push('commit');committed=commitment;},async p=>{progress.push(p);});
    assert.deepEqual(events,['formulate','commit','tool','tool']);
    const {sha256,...payload}=committed;assert.equal(sha256,fingerprint(payload));assert.equal(report.commitment,sha256);
    assert.equal(report.executionStatus,'completed');assert.equal(report.independentlyVerified,true);
    assert.deepEqual(report.data,pilotData(variable).input);
    assert.equal(report.controlEvidence.result.decision,'do_not_reject_h0');
    assert.ok(report.controlEvidence.result.pvalue>.999);
    assert.equal(report.hypothesisOutcome,report.evidence.result.decision);
    assert.equal(progress.length,2);
  }
});
test('pilot runner persists live-shaped reports and failures without model data leakage',async()=>{
  const runner=fileURLToPath(new URL('../research/run-hypothesis-pilot.mjs',import.meta.url));
  for(const failing of [false,true]) {
    const dir=await mkdtemp(join(tmpdir(),'oraklet-hypothesis-'));
    try {
      const preload=join(dir,'mock.mjs');await writeFile(preload,`
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(String(url).includes('supabase.co')){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  const message=JSON.parse(body.message);const shown=JSON.parse(message.messages[1].content);
  if(shown.data || shown.dataset.rows || body.completionTokenLimit!==4096)throw new Error('Protocol leak');
  return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:${JSON.stringify(failing?'{}':JSON.stringify(proposal('realgdp')))}});
};`);
      const execution=run(process.execPath,['--import',pathToFileURL(preload).href,runner],{cwd:dir,
        env:{...process.env,ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:45000});
      if(failing)await assert.rejects(execution);else await execution;
      const report=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
      assert.equal(report.executionStatus,failing?'error':'completed');assert.equal(report.modelCalls,1);assert.equal(report.toolCalls,failing?0:2);
      if(failing)assert.equal(report.failure.code,'invalid_model_proposal');
      else {assert.equal(report.hypothesis.variable,'realgdp');assert.equal(report.independentlyVerified,true);
        assert.equal(JSON.parse(await readFile(join(dir,'reports/oraklet-hypothesis/commitment.json'),'utf8')).sha256,report.commitment);}
    } finally {await rm(dir,{recursive:true,force:true});}
  }
});
