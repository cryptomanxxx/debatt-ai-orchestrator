import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDoi, abstractFromIndex, normalizePaper, summarize, overlap, searchSource, benchmark } from '../research/literature-benchmark.mjs';

test('normalizes DOI and reconstructs OpenAlex abstracts',()=>{
  assert.equal(normalizeDoi('https://doi.org/10.1234/ABC'),'10.1234/abc');
  assert.equal(normalizeDoi('not a doi'),null);
  assert.equal(abstractFromIndex({world:[1],hello:[0]}),'hello world');
});
test('normalizes records without storing abstracts or full texts',()=>{
  const p=normalizePaper('openalex',{id:'W1',display_name:'Title',doi:'10.1234/ABC',abstract_inverted_index:{hello:[0]},open_access:{is_oa:true}});
  assert.equal(p.hasAbstract,true); assert.equal(p.doi,'10.1234/abc');
  assert.equal('abstract' in p,false); assert.equal(p.hasOpenAccessSignal,true);
});
test('computes DOI overlap without counting missing DOIs',()=>{
  const a=[{source:'a',sourceId:'1',doi:'10.1234/a',hasAbstract:true,hasOpenAccessSignal:false}];
  const b=[{source:'b',sourceId:'2',doi:'10.1234/a'},{source:'b',sourceId:'3',doi:null}];
  assert.deepEqual(overlap(a,b),{commonDois:1,onlyLeft:0,onlyRight:0});
  assert.equal(summarize(a).withAbstract,1);
});
test('fetches and compares both providers with mocked responses',async()=>{
  const urls=[];
  const fetchImpl=async(url,opts)=>{
    urls.push([String(url),opts.headers]);
    return {ok:true,json:async()=>String(url).includes('openalex')
      ? {results:[{id:'W1',display_name:'Study',doi:'10.1234/xyz',abstract_inverted_index:{yes:[0]}}]}
      : {data:[{paperId:'S1',title:'Study',externalIds:{DOI:'10.1234/XYZ'},abstract:'yes'}]}};
  };
  const report=await benchmark({queries:['science'],limit:2,fetchImpl,semanticScholarKey:'test-key'});
  assert.equal(report.results[0].doiOverlap.commonDois,1);
  assert.equal(report.results[0].sources.openalex.records,1);
  assert.equal(urls.length,2);
  assert.equal(urls[1][1]['x-api-key'],'test-key');
  assert.match(urls[0][0],/per-page=2/);
});
test('fails closed for invalid inputs and reports provider errors',async()=>{
  await assert.rejects(()=>searchSource('unknown','x',10),/Unsupported/);
  await assert.rejects(()=>benchmark({queries:[]}),/Invalid/);
  const report=await benchmark({queries:['x'],fetchImpl:async()=>({ok:false,status:429})});
  assert.equal(report.results[0].sources.openalex.status,'error');
  assert.equal(report.results[0].doiOverlap,null);
});
