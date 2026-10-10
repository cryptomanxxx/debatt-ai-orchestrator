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

test('sends OpenAlex key only as a bearer header, never in URL',async()=>{
  const requests=[];
  const fetchImpl=async(url,opts)=>{
    requests.push({url:String(url),headers:opts.headers});
    return {ok:true,json:async()=>String(url).includes('openalex')?{results:[]}:{data:[]}};
  };
  await benchmark({queries:['science'],limit:1,openAlexKey:'secret-openalex-key',semanticScholarKey:'secret-semantic-key',fetchImpl});
  assert.equal(requests.length,2);
  assert.equal(requests[0].headers.authorization,'Bearer secret-openalex-key');
  assert.equal(requests[0].headers['x-api-key'],undefined);
  assert.equal(requests[0].url.includes('secret-openalex-key'),false);
  assert.equal(requests[0].url.includes('api_key'),false);
  assert.equal(requests[1].headers['x-api-key'],'secret-semantic-key');
  assert.equal(requests[1].headers.authorization,undefined);
});
test('rejects invalid limits before any provider request',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw Error('must not fetch');};
  for (const limit of [0,-1,1.5,101,NaN,'10']) {
    await assert.rejects(()=>benchmark({queries:['science'],limit,fetchImpl}),/Limit must be 1\.\.100/);
  }
  assert.equal(calls,0);
});
test('records elapsed latency for failed requests',async()=>{
  const report=await benchmark({queries:['science'],fetchImpl:async()=>({ok:false,status:429})});
  for (const source of ['openalex','semantic-scholar']) {
    const result=report.results[0].sources[source];
    assert.equal(result.status,'error');
    assert.equal(result.error,'HTTP 429');
    assert.equal(Number.isInteger(result.latencyMs),true);
    assert.equal(result.latencyMs>=0,true);
  }
});
