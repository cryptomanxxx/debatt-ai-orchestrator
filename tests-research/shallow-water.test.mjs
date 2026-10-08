import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {WATER_PROTOCOL,WATER_METHODS,makeWaterCases,parseWaterProposal,validateWaterInput,classifyWater,waterMetrics} from '../research/shallow-water.mjs';
import {CATALOG,plannerPrompt,choosePlan} from '../research/catalog.mjs';

test('water primary criterion cannot hide harm to any field, horizon or reference',()=>{
  const good=Object.fromEntries(WATER_METHODS.map(k=>[k,Object.fromEntries(['filter','forecast4','forecast8'].map(e=>[e,{heightMse:k==='pinn-adaptive'?0.8:1,velocityMse:k==='pinn-adaptive'?0.8:1}]))]));
  assert.equal(classifyWater(good),'hybrid_improves_all');
  for(const e of ['filter','forecast4','forecast8'])for(const f of ['heightMse','velocityMse']) {
    const fake=structuredClone(good);fake['pinn-adaptive'][e][f]=.951;
    assert.equal(classifyWater(fake),'mixed_or_no_improvement');
  }
  const tiny=structuredClone(good);for(const m of Object.values(tiny))for(const e of Object.values(m))e.heightMse*=1e-12;
  assert.equal(classifyWater(tiny),'mixed_or_no_improvement');
});

test('spatial MSE and coverage use physical units and both unobserved velocity coefficients',()=>{
  const cov=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===j?1e-4:0));
  const metrics=waterMetrics([{mean:[.01,0,.02,0],truth:[0,0,0,0],covariance:cov}]);
  assert.ok(Math.abs(metrics.heightMse-.0002)<1e-14);
  assert.ok(Math.abs(metrics.velocityMse-19.62*.02**2/2)<1e-14);
  assert.equal(metrics.heightCoverage95,1);assert.ok(metrics.velocityCoverage95<1);
});

test('bounded inputs and commitments forbid arbitrary code or hyperparameters',()=>{
  for(const v of [null,{}, {seed:'1',case:3},{seed:'bad',case:0},{seed:'1',case:true},{seed:'1',case:0,epochs:10}])assert.throws(()=>validateWaterInput(v));
  assert.equal(makeWaterCases('1').length,3);
  assert.notEqual(makeWaterCases('1')[0].commitment,makeWaterCases('2')[0].commitment);
  assert.equal(parseWaterProposal('{"decision":"hybrid_improves_all","reason":"x","code":"x"}'),null);
  assert.equal(parseWaterProposal('{"decision":"unsupported","reason":"x"}'),null);
  assert.equal(parseWaterProposal('{"decision":"mixed_or_no_improvement","reason":"x"}').decision,'mixed_or_no_improvement');
  assert.match(WATER_PROTOCOL.limitations,/inte fulla olinjära/);
});

test('water source/config pins match files; manual menu, Problem Bank and isolated CI agree',async()=>{
  const pins=JSON.parse(await readFile(new URL('../research/shallow-water-toolchain.json',import.meta.url)));
  for(const [file,key]of [['../scripts/shallow_water.py','sourceSha256'],['../research/shallow-water-config.json','configSha256']])
    assert.equal(createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex'),pins[key]);
  const entry=CATALOG.find(e=>e.id==='shallow-water-hybrid');assert.equal(entry.automatic,false);
  assert.equal(entry.question,WATER_PROTOCOL.hypothesis);
  assert.ok(!JSON.parse(plannerPrompt([],'1')[1].content).catalog.some(e=>e.id===entry.id));
  assert.equal((await choosePlan(entry.id,' 20261008 ',[],()=>assert.fail())).seed,'20261008');
  const workflow=await readFile(new URL('../.github/workflows/oraklet-lab.yml',import.meta.url),'utf8');
  assert.match(workflow,/          - shallow-water-hybrid/);
  assert.match(workflow,/steps.resolved.outputs.experiment == 'shallow-water-hybrid'/);
  assert.match(workflow,/plot_shallow_water.py/);
  const domains=await readFile(new URL('../research/oraklet-propose-problems.mjs',import.meta.url),'utf8');assert.match(domains,/'shallow-water-hybrid':'fluid-state-estimation'/);
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
  assert.doesNotMatch(pkg.scripts['test:research'],/python|shallow-water\.py/);
  assert.match(pkg.scripts['test:shallow-water'],/tests-shallow-water/);
});
