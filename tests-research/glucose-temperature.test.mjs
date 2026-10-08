import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { TEMPERATURE_DATA_SHA256, makeTemperatureCases, evaluateTemperature,
  callTemperature, validateTemperature, runTemperatureExperiment, temperatureMarkdown } from '../research/glucose-temperature.mjs';

test('source snapshot matches reviewed extraction; seeds change commitments, never clinical data', async () => {
  const raw = await readFile(new URL('../research/temperature-evidence.json', import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'), TEMPERATURE_DATA_SHA256);
  const data = JSON.parse(raw);
  assert.deepEqual(data.studies.map(s => s.n), [6, 9, 14]);
  assert.deepEqual(data.studies.slice(0, 2).map(s => s.reportedRatioRange), [[1.5, 1.6], [3, 5]]);
  assert.deepEqual(data.studies[2].means, {control:84, cooling:61, warming:92});
  const first = makeTemperatureCases('20261008'), second = makeTemperatureCases('42');
  assert.deepEqual(first.map(f => f.input), second.map(f => f.input));
  assert.ok(first.every((f, i) => f.commitment !== second[i].commitment));
  assert.throws(() => makeTemperatureCases('invalid'));
});

test('both temperature assumptions match measured contrasts but disagree internally', () => {
  for (const f of makeTemperatureCases('42').slice(0, 2)) {
    const m = evaluateTemperature(f.input), rows = m.interpolations;
    assert.deepEqual(rows[0].linearRatioRange, [1, 1]);
    assert.deepEqual(rows[0].loglinearRatioRange, [1, 1]);
    assert.deepEqual(rows.at(-1).linearRatioRange, m.reportedRatioRange);
    assert.deepEqual(rows.at(-1).loglinearRatioRange, m.reportedRatioRange);
    for (let i = 0; i < 2; i++) {
      assert.ok(Math.abs(rows[2].loglinearRatioRange[i] ** 2 - m.reportedRatioRange[i]) < 1e-12);
      assert.ok(m.interiorDifferenceAtMidpoint[i] > 0);
    }
    assert.equal(m.uniqueTemperatureLawIdentified, false);
    assert.equal(m.individualUncertaintyEstimable, false);
  }
});

test('transport uses only training contrast; heterogeneity and extrapolation prevent clinical validation claim', () => {
  const m = evaluateTemperature(makeTemperatureCases('42')[1].input);
  assert.equal(m.decision, 'reported_increase_transport_mismatch');
  const predicted = m.transport.predictedRatioRange;
  // Reverse the transformation without refitting to the target study.
  assert.ok(Math.abs(predicted[0] ** 3 - 1.5 ** 4) < 1e-12);
  assert.ok(Math.abs(predicted[1] ** 3 - 1.6 ** 4) < 1e-12);
  assert.ok(predicted[1] < m.reportedRatioRange[0]);
  assert.equal(m.transport.rangesOverlap, false);
  assert.equal(m.transport.statisticalTest, false);
  assert.equal(m.transport.independentlyHeldOut, false);
  assert.equal(m.transport.outsideTrainingTemperatureRange, true);
});

test('local skin experiment retains published p-values and never substitutes room temperature or AUC for absorption', () => {
  const input = makeTemperatureCases('42')[2].input, m = evaluateTemperature(input);
  assert.equal(m.contrasts[0].ratioToControl, 61 / 84);
  assert.equal(m.contrasts[1].ratioToControl, 92 / 84);
  assert.deepEqual(m.contrasts.map(c => c.publishedP), [0.02, 0.65]);
  assert.deepEqual(m.contrasts.map(c => c.interpretation), ['published_difference_detected', 'published_difference_not_detected']);
  assert.ok(m.contrasts.every(c => c.controlTemperatureC === null));
  assert.equal(m.absorptionRateEstimable, false);
  assert.equal(m.ambientTemperatureEffectEstimable, false);
  assert.equal(m.doseRecommendationAllowed, false);
});

test('numeric verifier rejects forged evidence; null controls are labelled synthetic without fabricated p-values', async () => {
  for (const f of makeTemperatureCases('42')) {
    const e = await callTemperature(f.input); validateTemperature(e, f.input);
    for (const change of [v => {v.dataSha256='wrong';}, v => {v.result.uniqueTemperatureLawIdentified=true;},
      v => {v.result.sourceUrl='https://example.com';}]) {
      const forged = structuredClone(e); change(forged);
      assert.throws(() => validateTemperature(forged, f.input));
    }
    const input = {...f.input,mode:'null-control'}, control = await callTemperature(input);
    const m = validateTemperature(control, input);
    assert.equal(m.dataKind, 'synthetic-negative-control');
    assert.equal(m.decision, 'synthetic_no_difference');
    if (m.contrasts) assert.ok(m.contrasts.every(c => c.ratioToControl===1 && c.publishedP===null));
    else {assert.deepEqual(m.reportedRatioRange,[1,1]);assert.equal(m.reportedP,null);}
    const forged = structuredClone(e);
    if (forged.result.contrasts) forged.result.contrasts[0].publishedP = 0.9;
    else forged.result.interpolations[2].loglinearRatioRange[0] += 0.01;
    assert.throws(() => validateTemperature(forged, f.input));
  }
  await assert.rejects(callTemperature({studyId:'unknown',mode:'observed'}));
  await assert.rejects(callTemperature({studyId:'ambient-1981',mode:'observed',temperature:50}));
});

test('changed source bytes fail the integrity guard before any experiment runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'temperature-integrity-'));
  try {
    for (const path of ['glucose-temperature.mjs','errors.mjs','temperature-evidence.json'])
      await writeFile(join(dir,path), await readFile(new URL('../research/'+path,import.meta.url)));
    await writeFile(join(dir,'temperature-evidence.json'), '{}');
    await assert.rejects(promisify(execFile)(process.execPath,[join(dir,'glucose-temperature.mjs')]));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('commitment precedes interpretation; measured results survive wrong AI answers and later interruption', async () => {
  let committed = false, calls = 0, progress = [];
  const proposal = async messages => {
    assert.ok(committed);
    const data = JSON.parse(messages[1].content);
    assert.ok(data.study.doi); // Explicitly uses published facts, not a blind clinical forecast.
    return {provider:'test',model:'same',text:JSON.stringify({decision:'reported_increase_law_unidentified',
      uniqueTemperatureLawIdentified:true,reason:'Intentionally unsupported claim.'})};
  };
  const tool = async input => {calls++;return callTemperature(input);};
  const commit = async items => {assert.equal(items.length,3);committed=true;};
  const report = await runTemperatureExperiment('42',proposal,tool,commit,{onProgress:async c=>{progress=c;}});
  assert.equal(calls,6);assert.equal(report.status,'failed');assert.equal(progress.length,3);
  assert.ok(report.cases.every(c=>c.hypothesisTest.measured.uniqueTemperatureLawIdentified===false));
  const markdown = temperatureMarkdown(report.cases);
  assert.match(markdown,/61|0\.7262/);assert.match(markdown,/0\.65/);
  assert.match(markdown,/10 °C ligger utanför/);
  let proposals=0;progress=[];
  await assert.rejects(runTemperatureExperiment('42',async messages=>++proposals===1?proposal(messages):{text:'{}'},
    tool,commit,{onProgress:async c=>{progress=c;}}));
  assert.equal(progress.length,1);
});

test('production runner executes locally, saves source provenance and publishes interpretations separately', async () => {
  const dir = await mkdtemp(join(tmpdir(),'temperature-runner-'));
  try {
    const preload=join(dir,'mock.mjs');
    await writeFile(preload, `
import { writeFile } from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 const body=JSON.parse(options.body);if(body.tool)throw new Error('Local analysis required');
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},
  answer:JSON.stringify({decision:'reported_increase_law_unidentified',uniqueTemperatureLawIdentified:false,reason:'Test.'})});
};`);
    await promisify(execFile)(process.execPath,['--import',pathToFileURL(preload).href,
      fileURLToPath(new URL('../research/runner.mjs',import.meta.url))],{cwd:dir,
      env:{...process.env,EXPERIMENT:'glucose-temperature-evidence',EXPERIMENT_SEED:' 20261008 ',
        ORCHESTRATOR_API_KEY:'test'.repeat(8),SUPABASE_SERVICE_ROLE_KEY:'test'},timeout:15000});
    const saved=JSON.parse(await readFile(join(dir,'saved.json'),'utf8')).rapport;
    assert.equal(saved.seed,'20261008');assert.equal(saved.plan.seed,'20261008');
    assert.equal(saved.executionStatus,'completed');assert.equal(saved.modelCalls,3);assert.equal(saved.toolCalls,6);
    assert.equal(saved.toolRuntime,'github-actions-node');assert.equal(saved.cases.length,3);
    assert.ok(saved.cases.every(c=>c.data.source.doi&&c.data.dataSha256===TEMPERATURE_DATA_SHA256));
    const markdown=await readFile(join(dir,'reports/oraklet-lab/report.md'),'utf8');
    assert.match(markdown,/Källor och antagna temperaturkurvor/);
    assert.match(markdown,/publicerat p=0\.65/);
    assert.match(markdown,/1\.7171–1\.8714/);
    assert.match(markdown,/inte uppmätta individuella absorptionskurvor/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
