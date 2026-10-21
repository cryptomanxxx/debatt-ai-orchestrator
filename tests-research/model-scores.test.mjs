import test from 'node:test';
import assert from 'node:assert/strict';
import {tallyReport,mergeRuns,rankings,recommendations,rankingMarkdown} from '../research/model-scores.mjs';

const row=(model,verdict,status='ok',latency=1)=>({model,scientific_verdict:verdict,status,latency_seconds:latency});
const v3={provider:'blablador',results:[row('Qwen3.8-27B','correct'),row('Qwen3.8-27B','incorrect',)
 ,row('alias-fast','correct'),row('Qwen3.8-27B','not_evaluated','gateway_http_5xx',null)]};
const hip={provider:'hessian.AI HIP',results:[row('GLM-5.2-AWQ-INT4','correct','ok',8),row('GLM-5.2-AWQ-INT4','correct','ok',10)]};

test('tallies Scientific v3 and HIP reports, ignoring aliases and unknown files',()=>{
 assert.deepEqual(tallyReport('blablador-scientific-v3.json',v3),{provider:'blablador',
  models:{'Qwen3.8-27B':{correct:1,attempts:3,medianLatency:1}}});
 assert.deepEqual(tallyReport('results.json',hip),{provider:'hip',
  models:{'GLM-5.2-AWQ-INT4':{correct:2,attempts:2,medianLatency:9}}});
 assert.equal(tallyReport('blablador-scientific-v3.json',{...v3,provider:'hip'}).provider,'hip');
 assert.equal(tallyReport('summary.json',hip),null);
 assert.equal(tallyReport('results.json',{provider:'other',results:[]}),null);
 assert.equal(tallyReport('blablador-scientific-v3.json',{results:'x'}),null);
});
test('runs are keyed by run ID, never double counted, and capped',()=>{
 const run={provider:'hip',models:{a:{correct:1,attempts:1,medianLatency:1}}};
 assert.deepEqual(Object.keys(mergeRuns({'5':run},{'5':run,'7':run})).sort(),['5','7']);
 const many=Object.fromEntries(Array.from({length:45},(_,i)=>[String(i+1),run]));
 const kept=Object.keys(mergeRuns(many,{}));
 assert.equal(kept.length,40);assert.ok(!kept.includes('1'));
 assert.deepEqual(Object.keys(mergeRuns({x:run},{})),[]);
});
test('ranks by correct share, needs five answers, and only recommends catalog models',()=>{
 const runs={
  '1':{provider:'hip',models:{A:{correct:5,attempts:5,medianLatency:9},B:{correct:4,attempts:5,medianLatency:2},C:{correct:2,attempts:2,medianLatency:1}}},
  '2':{provider:'hip',models:{B:{correct:5,attempts:5,medianLatency:4},Gone:{correct:10,attempts:10,medianLatency:1}}},
  '3':{provider:'blablador',models:{Q:{correct:3,attempts:4,medianLatency:1}}}};
 const ranked=rankings(runs,{hip:['A','B','C'],blablador:['Q']});
 assert.deepEqual(ranked.hip.map(r=>r.model),['A','C','B']);
 assert.deepEqual(recommendations(ranked),{hip:{model:'A',correct:5,attempts:5}});
 const md=rankingMarkdown(ranked,{hip:['A','B','C','D'],blablador:['Q']});
 assert.match(md,/`A` \(rekommenderad\) \| 5\/5 \| 100%/);
 assert.match(md,/Not yet benchmarked: `D`/);
});
