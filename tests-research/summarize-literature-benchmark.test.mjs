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

test('renders titles, DOI and source links with safe Markdown and a preprint label',()=>{
  const s=formatBenchmarkSummary({sourceNames:['arxiv'],results:[{query:'AI',sources:{arxiv:{status:'ok',
    records:2,papers:[{title:'AI | [bad](javascript:alert(1)) <script>',doi:'10.1234/abc',sourceUrl:'https://arxiv.org/abs/2610.01234'},
      {title:'No DOI',doi:null,sourceUrl:'javascript:alert(1)'}]}}}]});
  assert.ok(s.includes('[View](https://arxiv.org/abs/2610.01234)'));
  assert.ok(s.includes('[10.1234/abc](https://doi.org/10.1234/abc)'));
  assert.ok(s.includes('preprint repository; newest submissions first'));
  assert.ok(s.includes('\\|')); assert.ok(s.includes('&lt;script&gt;'));
  assert.ok(s.includes('| No DOI | — | — |'));
});

test('summary bounds displayed records without losing the artifact metadata',()=>{
  const papers=Array.from({length:25},(_,i)=>({title:'Paper '+i,doi:null,sourceUrl:null}));
  const s=formatBenchmarkSummary({sourceNames:['core'],results:[{query:'AI',sources:{core:{status:'ok',records:25,papers}}}]});
  assert.ok(s.includes('Paper 19'));assert.equal(s.includes('Paper 20'),false);
  assert.ok(s.includes('all returned records are in the JSON artifact'));
  assert.equal(papers.length,25);
});
