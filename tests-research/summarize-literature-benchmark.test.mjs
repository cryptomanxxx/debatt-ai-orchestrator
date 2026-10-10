import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBenchmarkSummary } from '../research/summarize-literature-benchmark.mjs';

test('summarizes successful and failed sources without conflating missing metrics with zero',()=>{
  const s=formatBenchmarkSummary({results:[{query:'science',sources:{
    openalex:{status:'ok',records:2,withAbstract:1,withOpenAccessSignal:0,latencyMs:12},
    'semantic-scholar':{status:'error',latencyMs:500}}}]});
  assert.match(s,/openalex \| ok \| 2 \| 1 \| 0 \| 12/);
  assert.match(s,/semantic-scholar \| error \| — \| — \| — \| 500/);
  assert.match(s,/Provider errors are not zero search results/);
});
test('rejects malformed reports',()=>{
  assert.throws(()=>formatBenchmarkSummary({}),/Invalid/);
});
