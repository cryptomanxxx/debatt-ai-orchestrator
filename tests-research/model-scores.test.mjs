import test from 'node:test';
import assert from 'node:assert/strict';
import {tallyReport,mergeRuns,rankings,recommendations,rankingMarkdown,attemptOf} from '../research/model-scores.mjs';

const row=(model,verdict,status='ok',latency=1)=>({model,scientific_verdict:verdict,status,latency_seconds:latency});
const v3={provider:'blablador',results:[row('Qwen3.8-27B','correct'),row('Qwen3.8-27B','incorrect',)
 ,row('alias-default','correct'),row('alias-fast','correct'),row('Qwen3.8-27B','not_evaluated','gateway_http_5xx',null),
 row('Qwen3.8-27B','not_evaluated','discovery_failed',null),row('Qwen3.8-27B','not_evaluated','rate_limited',null),
 row('Qwen3.8-27B','not_evaluated','gateway_gateway_http_401',null),row('Qwen3.8-27B','not_evaluated','gateway_gateway_http_403',null)]};
const hip={provider:'hessian.AI HIP',results:[row('GLM-5.2-AWQ-INT4','correct','ok',8),row('GLM-5.2-AWQ-INT4','correct','ok',10)]};

test('tallies reports; outages, quota stops, alias-default and rootless aliases are not model attempts',()=>{
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
test('alias evidence is keyed by the model it ran and ignored after a remap',()=>{
 const report={provider:'blablador',model_metadata:{'alias-fast':{root:'openai/gpt-oss-120b'}},results:[
  {...row('alias-fast','correct'),resolved_model:'openai/gpt-oss-120b'},
  row('alias-fast','not_evaluated','gateway_benchmark_model_identity_mismatch',null),
  row('alias-orphan','correct')]};
 const t=tallyReport('blablador-scientific-v3.json',report);
 assert.deepEqual(Object.keys(t.models),['alias-fast@openai/gpt-oss-120b']);
 assert.equal(t.models['alias-fast@openai/gpt-oss-120b'].attempts,2);
 const runs={'1':t,'2':{provider:'blablador',models:{'alias-fast@openai/gpt-oss-120b':{correct:4,attempts:4,latencies:[1]}}}};
 const same=rankings(runs,{blablador:['alias-fast']},{blablador:{'alias-fast':'openai/gpt-oss-120b'}}).blablador;
 assert.deepEqual(same.map(r=>[r.model,r.correct,r.attempts]),[['alias-fast',5,6]]);
 assert.deepEqual(recommendations({hip:[],blablador:same}),{blablador:{model:'alias-fast',correct:5,attempts:6}});
 const remapped=rankings(runs,{blablador:['alias-fast']},{blablador:{'alias-fast':'Qwen/Qwen3.8-27B-FP8'}}).blablador;
 assert.deepEqual(remapped,[]);
});
test('pre-dispatch refusals are not attempts; synonyms of one root share evidence',()=>{
 const report={provider:'blablador',model_metadata:{'alias-fast':{root:'openai/gpt-oss-120b'}},results:[
  {...row('alias-fast','correct'),resolved_model:'openai/gpt-oss-120b'},
  row('alias-fast','not_evaluated','gateway_benchmark_alias_unresolved',null),
  row('alias-fast','not_evaluated','gateway_gateway_benchmark_non_chat_model',null),
  row('alias-fast','not_evaluated','gateway_benchmark_model_not_listed',null),
  row('alias-fast','not_evaluated','gateway_benchmark_catalog_unavailable',null)]};
 const t=tallyReport('blablador-scientific-v3.json',report);
 assert.equal(t.models['alias-fast@openai/gpt-oss-120b'].attempts,1);
 const renamed=rankings({'1':t},{blablador:['alias-gpt-oss-120b']},{blablador:{'alias-gpt-oss-120b':'openai/gpt-oss-120b'}}).blablador;
 assert.deepEqual(renamed.map(r=>[r.model,r.correct,r.attempts]),[['alias-gpt-oss-120b',1,1]]);
 const slash={provider:'blablador',model_metadata:{'alias-x':{root:'/'}},results:[row('alias-x','correct')]};
 assert.equal(tallyReport('blablador-scientific-v3.json',slash),null);
});
import {domainRankings,domainRecommendations,domainMarkdown,DOMAIN_SUITE,DOMAINS} from '../research/model-scores.mjs';
const drow=(model,domain,verdict,status='ok',extra={})=>({model,domain,scientific_verdict:verdict,status,latency_seconds:1,...extra});
test('Scientific v4 reports are tallied per domain and kept out of the classic ranking',()=>{
 const report={schema_version:4,suite:DOMAIN_SUITE,provider:'hip',results:[
  drow('Qwen3.8-27B','causal','correct'),drow('Qwen3.8-27B','causal','incorrect'),
  drow('Qwen3.8-27B','symbolic','unverified','truncated'),drow('Qwen3.8-27B','symbolic','not_evaluated','gateway_benchmark_catalog_unavailable'),
  drow('Qwen3.8-27B','astrology','correct')]};
 const t=tallyReport('scientific-v4.json',report);
 assert.equal(t.suite,DOMAIN_SUITE);
 assert.deepEqual(t.models['Qwen3.8-27B'].domains,{causal:{correct:1,attempts:2,latencies:[1,1]},symbolic:{correct:0,attempts:1,latencies:[]}});
 assert.equal(tallyReport('scientific-v4.json',{...report,suite:'other'}),null);
 assert.equal(tallyReport('scientific-v4.json',{...report,provider:'groq'}),null);
 const runs={'10':t,'11':tallyReport('results.json',hip)};
 assert.deepEqual(rankings(runs,{hip:['Qwen3.8-27B','GLM-5.2-AWQ-INT4']}).hip.map(r=>r.model),['GLM-5.2-AWQ-INT4']);
});
test('domain rankings pool runs and aliases by root and recommend per domain',()=>{
 const run=(provider,models)=>({provider,suite:DOMAIN_SUITE,models});
 const m=(domains)=>({correct:0,attempts:0,latencies:[2],domains});
 const runs={
  '20':run('blablador',{'alias-fast@openai/gpt-oss-120b':m({causal:{correct:3,attempts:4}}),
   'deepseek':m({causal:{correct:2,attempts:4},symbolic:{correct:4,attempts:4}})}),
  '21':run('blablador',{'alias-gpt@openai/gpt-oss-120b':m({causal:{correct:4,attempts:4}})}),
  '22':{provider:'blablador',models:{deepseek:{correct:5,attempts:5,latencies:[1]}}}};
 const catalog={hip:[],blablador:['deepseek','alias-fast']};
 const aliasRoots={blablador:{'alias-fast':'openai/gpt-oss-120b'}};
 const ranked=domainRankings(runs,catalog,aliasRoots);
 assert.deepEqual(ranked.blablador.causal.map(r=>[r.model,r.correct,r.attempts]),[['alias-fast',7,8],['deepseek',2,4]]);
 assert.deepEqual(ranked.blablador.symbolic.map(r=>r.model),['deepseek']);
 assert.deepEqual(ranked.blablador.statistics,[]);
 const rec=domainRecommendations(ranked);
 assert.deepEqual(rec.blablador.causal,{model:'alias-fast',correct:7,attempts:8});
 assert.equal(rec.blablador.statistics,undefined);
 assert.deepEqual(Object.keys(rec.hip),[]);
 const md=domainMarkdown(ranked,catalog,aliasRoots);
 assert.ok(md.includes('| `deepseek` | 4/4 ★ | – | 2/4 | – | – |'),md);
 assert.ok(md.includes('| `alias-fast` = `gpt-oss-120b` | – | – | 7/8 ★ | – | – |'),md);
 assert.match(md,/### hip\n\nNo domain benchmark results yet\./);
 assert.equal(DOMAINS.length,5);
});
test('domain ties break on latency in that domain only; suites keep separate run quotas',()=>{
 const run={provider:'hip',suite:DOMAIN_SUITE,models:{
  fast:{correct:0,attempts:0,latencies:[],domains:{causal:{correct:4,attempts:4,latencies:[9]},symbolic:{correct:4,attempts:4,latencies:[1,1,1]}}},
  slow:{correct:0,attempts:0,latencies:[],domains:{causal:{correct:4,attempts:4,latencies:[2]},symbolic:{correct:4,attempts:4,latencies:[8]}}}}};
 const ranked=domainRankings({'1':run},{hip:['fast','slow'],blablador:[]});
 assert.deepEqual(ranked.hip.causal.map(r=>r.model),['slow','fast']);
 assert.deepEqual(ranked.hip.symbolic.map(r=>r.model),['fast','slow']);
 const classic={provider:'hip',models:{a:{correct:1,attempts:1,latencies:[1]}}};
 const domain={provider:'hip',suite:DOMAIN_SUITE,models:{}};
 const many={'5':classic,...Object.fromEntries(Array.from({length:45},(_,i)=>[String(i+100),domain]))};
 const kept=mergeRuns(many,{});
 assert.ok(kept['5'],'the older classic run survives 45 newer domain runs');
 assert.equal(Object.values(kept).filter(r=>r.suite===DOMAIN_SUITE).length,40);
});
