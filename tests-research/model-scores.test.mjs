import test from 'node:test';
import assert from 'node:assert/strict';
import {tallyReport,mergeRuns,rankings,recommendations,rankingMarkdown,attemptOf} from '../research/model-scores.mjs';

const row=(model,verdict,status='ok',latency=1)=>({model,scientific_verdict:verdict,status,latency_seconds:latency});
const v3={provider:'blablador',results:[row('Qwen3.8-27B','correct'),row('Qwen3.8-27B','incorrect',)
 ,row('alias-fast','correct'),row('Qwen3.8-27B','not_evaluated','gateway_http_5xx',null),
 row('Qwen3.8-27B','not_evaluated','discovery_failed',null),row('Qwen3.8-27B','not_evaluated','rate_limited',null),
 row('Qwen3.8-27B','not_evaluated','gateway_gateway_http_401',null),row('Qwen3.8-27B','not_evaluated','gateway_gateway_http_403',null)]};
const hip={provider:'hessian.AI HIP',results:[row('GLM-5.2-AWQ-INT4','correct','ok',8),row('GLM-5.2-AWQ-INT4','correct','ok',10)]};

test('tallies reports; outages, quota stops and aliases are not model attempts',()=>{
 assert.deepEqual(tallyReport('blablador-scientific-v3.json',v3),{provider:'blablador',
  models:{'Qwen3.8-27B':{correct:1,attempts:3,latencies:[1,1]}}});
 assert.deepEqual(tallyReport('results.json',hip),{provider:'hip',
  models:{'GLM-5.2-AWQ-INT4':{correct:2,attempts:2,latencies:[8,10]}}});
 assert.equal(tallyReport('blablador-scientific-v3.json',{...v3,provider:'hip'}).provider,'hip');
 assert.equal(tallyReport('summary.json',hip),null);
 assert.equal(tallyReport('results.json',{provider:'other',results:[]}),null);
 assert.equal(tallyReport('blablador-scientific-v3.json',{results:'x'}),null);
});
test('the latest rerun attempt is identified from the artifact directory',()=>{
 assert.equal(attemptOf('reports/benchmarks/9/hip-scientific-9-2'),2);
 assert.equal(attemptOf('reports/benchmarks/9/blablador-scientific-v3-results'),0);
});
test('runs are keyed by run ID, never double counted, and capped',()=>{
 const run={provider:'hip',models:{a:{correct:1,attempts:1,latencies:[1]}}};
 assert.deepEqual(Object.keys(mergeRuns({'5':run},{'5':run,'7':run})).sort(),['5','7']);
 const many=Object.fromEntries(Array.from({length:45},(_,i)=>[String(i+100),run]));
 const blab={provider:'blablador',models:{q:{correct:1,attempts:1,latencies:[1]}}};
 const kept=Object.keys(mergeRuns(many,{'5':blab,'6':blab}));
 assert.equal(kept.length,42);assert.ok(!kept.includes('100'));
 assert.ok(kept.includes('5')&&kept.includes('6'),'older runs of the other provider are kept');
 assert.deepEqual(Object.keys(mergeRuns({x:run,'9':{provider:'other'}},{})),[]);
});
test('ranks by correct share, needs five answers, and only recommends catalog models',()=>{
 const runs={
  '1':{provider:'hip',models:{A:{correct:5,attempts:5,latencies:[9]},B:{correct:4,attempts:5,latencies:[2]},C:{correct:2,attempts:2,latencies:[1]}}},
  '2':{provider:'hip',models:{B:{correct:5,attempts:5,latencies:[4]},Gone:{correct:10,attempts:10,latencies:[1]}}},
  '3':{provider:'blablador',models:{Q:{correct:3,attempts:4,latencies:[1]}}}};
 const ranked=rankings(runs,{hip:['A','B','C'],blablador:['Q']});
 assert.deepEqual(ranked.hip.map(r=>r.model),['A','C','B']);
 assert.deepEqual(recommendations(ranked),{hip:{model:'A',correct:5,attempts:5}});
 const md=rankingMarkdown(ranked,{hip:['A','B','C','D'],blablador:['Q']});
 assert.match(md,/`A` \(rekommenderad\) \| 5\/5 \| 100%/);
 assert.match(md,/Not yet benchmarked: `D`/);
});
test('latency ties use the median of all calls, not of run medians',()=>{
 const runs={'1':{provider:'hip',models:{A:{correct:5,attempts:5,latencies:[1,1,1,1,1]},
  B:{correct:5,attempts:5,latencies:[50,50,50,50,50]}}},
  '2':{provider:'hip',models:{A:{correct:15,attempts:15,latencies:Array(15).fill(100)},
  B:{correct:15,attempts:15,latencies:Array(15).fill(50)}}}};
 const ranked=rankings(runs,{hip:['A','B']}).hip;
 assert.deepEqual(ranked.map(r=>[r.model,r.medianLatency]),[['B',50],['A',100]]);
});
