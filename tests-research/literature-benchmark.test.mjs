import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDoi, abstractFromIndex, normalizePaper, summarize, overlap, searchSource, benchmark, parseRetryAfter } from '../research/literature-benchmark.mjs';

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
  const report=await benchmark({sources:['openalex','semantic-scholar'],queries:['science'],limit:2,fetchImpl,semanticScholarKey:'test-key',requestDelayMs:0,sleep:async()=>{}});
  assert.equal(report.results[0].doiOverlap.commonDois,1);
  assert.equal(report.results[0].sources.openalex.records,1);
  assert.equal(urls.length,2);
  assert.equal(urls[1][1]['x-api-key'],'test-key');
  assert.match(urls[0][0],/per-page=2/);
});
test('fails closed for invalid inputs and reports provider errors',async()=>{
  await assert.rejects(()=>searchSource('unknown','x',10),/Unsupported/);
  await assert.rejects(()=>benchmark({sources:['openalex','semantic-scholar'],queries:[]}),/Invalid/);
  const report=await benchmark({sources:['openalex','semantic-scholar'],queries:['x'],fetchImpl:async()=>({ok:false,status:429}),requestDelayMs:0,maxRetries:0,sleep:async()=>{}});
  assert.equal(report.results[0].sources.openalex.status,'error');
  assert.equal(report.results[0].doiOverlap,null);
});

test('legacy DOI overlap keeps its orientation for every three-provider ordering',async()=>{
  const orders=[
    ['openalex','semantic-scholar','core'],['openalex','core','semantic-scholar'],
    ['semantic-scholar','openalex','core'],['semantic-scholar','core','openalex'],
    ['core','openalex','semantic-scholar'],['core','semantic-scholar','openalex'],
  ];
  for (const sources of orders) {
    const report=await benchmark({sources,queries:['science'],requestDelayMs:0,maxRetries:0,
      fetchImpl:async(url)=>({ok:true,json:async()=>{
        if (url.hostname==='api.openalex.org') return {results:[
          {id:'W1',display_name:'Shared',doi:'10.1234/shared'},
          {id:'W2',display_name:'Alex only',doi:'10.1234/alex'},
        ]};
        if (url.hostname==='api.semanticscholar.org') return {data:[
          {paperId:'S1',title:'Shared',externalIds:{DOI:'10.1234/shared'}},
          {paperId:'S2',title:'Scholar only 1',externalIds:{DOI:'10.1234/scholar1'}},
          {paperId:'S3',title:'Scholar only 2',externalIds:{DOI:'10.1234/scholar2'}},
        ]};
        return {results:[]};
      }})});
    assert.deepEqual(report.results[0].doiOverlap,{commonDois:1,onlyLeft:1,onlyRight:2},sources.join(','));
  }
});

test('legacy DOI overlap is unavailable when either legacy source is absent or fails',async()=>{
  for (const sources of [['core'],['semantic-scholar','core'],['core','openalex'],['semantic-scholar','openalex']]) {
    const report=await benchmark({sources,queries:['science'],requestDelayMs:0,maxRetries:0,
      fetchImpl:async(url)=>url.hostname==='api.openalex.org'
        ? {ok:false,status:401}
        : {ok:true,json:async()=>url.hostname==='api.semanticscholar.org'?{data:[]}:{results:[]}}});
    assert.equal(report.results[0].doiOverlap,null);
  }
});

test('sends OpenAlex key only as a bearer header, never in URL',async()=>{
  const requests=[];
  const fetchImpl=async(url,opts)=>{
    requests.push({url:String(url),headers:opts.headers});
    return {ok:true,json:async()=>String(url).includes('openalex')?{results:[]}:{data:[]}};
  };
  await benchmark({sources:['openalex','semantic-scholar'],queries:['science'],limit:1,openAlexKey:'secret-openalex-key',semanticScholarKey:'secret-semantic-key',requestDelayMs:0,sleep:async()=>{},fetchImpl});
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
    await assert.rejects(()=>benchmark({sources:['openalex','semantic-scholar'],queries:['science'],limit,fetchImpl}),/Limit must be 1\.\.100/);
  }
  assert.equal(calls,0);
});
test('records elapsed latency for failed requests',async()=>{
  const report=await benchmark({sources:['openalex','semantic-scholar'],queries:['science'],requestDelayMs:0,maxRetries:0,sleep:async()=>{},fetchImpl:async()=>({ok:false,status:429})});
  for (const source of ['openalex','semantic-scholar']) {
    const result=report.results[0].sources[source];
    assert.equal(result.status,'error');
    assert.equal(result.error,'HTTP 429');
    assert.equal(Number.isInteger(result.latencyMs),true);
    assert.equal(result.latencyMs>=0,true);
  }
});

test('retries transient 429 twice and records successful attempts',async()=>{
  let calls=0; const sleeps=[];
  const fetchImpl=async(url)=>{
    calls++;
    if (String(url).includes('openalex') && calls<=2) return {ok:false,status:429};
    return {ok:true,json:async()=>String(url).includes('openalex')?{results:[]}:{data:[]}};
  };
  const result=await benchmark({sources:['openalex','semantic-scholar'],queries:['test'],limit:1,fetchImpl,requestDelayMs:0,sleep:async(ms)=>sleeps.push(ms)});
  assert.equal(result.results[0].sources.openalex.status,'ok');
  assert.equal(result.results[0].sources.openalex.attempts,3);
  assert.deepEqual(sleeps,[2000,4000]);
  assert.equal(calls,4);
});
test('reports HTTP 429 after bounded retries and preserves next source',async()=>{
  const result=await benchmark({sources:['openalex','semantic-scholar'],queries:['test'],limit:1,requestDelayMs:0,maxRetries:1,sleep:async()=>{},
    fetchImpl:async(url)=>String(url).includes('openalex')?{ok:false,status:429}:{ok:true,json:async()=>({data:[]})}});
  assert.equal(result.results[0].sources.openalex.httpStatus,429);
  assert.equal(result.results[0].sources.openalex.attempts,2);
  assert.equal(result.results[0].sources['semantic-scholar'].status,'ok');
});
test('does not retry permanent authentication errors',async()=>{
  let calls=0;
  const result=await benchmark({sources:['openalex','semantic-scholar'],queries:['test'],requestDelayMs:0,sleep:async()=>{},fetchImpl:async()=>{calls++;return {ok:false,status:401};}});
  assert.equal(calls,2);
  assert.equal(result.results[0].sources.openalex.attempts,1);
  assert.equal(result.results[0].sources.openalex.httpStatus,401);
});
test('rejects invalid retry configuration before requests',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('unexpected');};
  await assert.rejects(()=>benchmark({sources:['openalex','semantic-scholar'],queries:['x'],requestDelayMs:-1,fetchImpl}),/Invalid request delay/);
  await assert.rejects(()=>benchmark({sources:['openalex','semantic-scholar'],queries:['x'],maxRetries:4,fetchImpl}),/Invalid retry count/);
  assert.equal(calls,0);
});

test('provider latency excludes artificial pacing time',async()=>{
  let now=0;
  const report=await benchmark({sources:['openalex','semantic-scholar'],queries:['x'],limit:1,requestDelayMs:1200,maxRetries:0,
    clock:()=>now,
    sleep:async(ms)=>{now+=ms;},
    fetchImpl:async(url)=>{
      now+=7;
      return {ok:true,json:async()=>String(url).includes('openalex')?{results:[]}:{data:[]}};
    }});
  assert.equal(report.results[0].sources.openalex.latencyMs,7);
  assert.equal(report.results[0].sources['semantic-scholar'].latencyMs,7);
});

test('parses Retry-After seconds and HTTP dates safely',()=>{
  assert.equal(parseRetryAfter('2.5'),2500);
  assert.equal(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT',Date.parse('2026-10-21T07:27:57Z')),3000);
  assert.equal(parseRetryAfter('nonsense'),null);
  assert.equal(parseRetryAfter('-3'),null);
});
test('honors Retry-After when longer than 429 backoff',async()=>{
  let calls=0;const sleeps=[];
  const report=await benchmark({sources:['openalex','semantic-scholar'],queries:['test'],requestDelayMs:0,maxRetries:1,
    sleep:async(ms)=>sleeps.push(ms),
    fetchImpl:async(url)=>{
      if(String(url).includes('openalex') && ++calls===1) return {ok:false,status:429,headers:{get:()=> '7'}};
      return {ok:true,json:async()=>String(url).includes('openalex')?{results:[]}:{data:[]}};
    }});
  assert.deepEqual(sleeps,[7000]);
  assert.equal(report.results[0].sources.openalex.attempts,2);
});
test('caps excessive Retry-After and preserves other provider',async()=>{
  const sleeps=[];
  const report=await benchmark({sources:['openalex','semantic-scholar'],queries:['test'],requestDelayMs:0,maxRetries:1,maxBackoffMs:5000,
    sleep:async(ms)=>sleeps.push(ms),
    fetchImpl:async(url)=>String(url).includes('openalex')
      ? {ok:false,status:429,headers:{get:()=> '3600'}}
      : {ok:true,json:async()=>({data:[]})}});
  assert.deepEqual(sleeps,[5000]);
  assert.equal(report.results[0].sources.openalex.httpStatus,429);
  assert.equal(report.results[0].sources['semantic-scholar'].status,'ok');
});

test('CORE metadata adapter excludes full text and sends key only in header',async()=>{
  const requests=[];
  const report=await benchmark({sources:['core'],queries:['turbulence'],limit:2,coreApiKey:'private-core-key',
    requestDelayMs:0,sleep:async()=>{},fetchImpl:async(url,opts)=>{
      assert.deepEqual(url.searchParams.getAll('exclude'),['fullText']);
      assert.equal(url.searchParams.has('exclude[]'),false);
      requests.push({url:String(url),headers:opts.headers});
      return {ok:true,json:async()=>({results:[{id:123,title:'CORE Study',doi:'10.1234/core',
        abstract:'abstract',yearPublished:2025,downloadUrl:'https://example.org/article.pdf',
        fullText:'private copyrighted full text'}]})};
    }});
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/api.core.ac.uk\/v3\/search\/works\/\?/);
  assert.equal(requests[0].headers.authorization,'Bearer private-core-key');
  assert.equal(requests[0].url.includes('private-core-key'),false);
  assert.equal(report.results[0].sources.core.records,1);
  assert.equal(report.results[0].sources.core.withAbstract,1);
  assert.equal(report.results[0].sources.core.withOpenAccessSignal,1);
  assert.equal(JSON.stringify(report).includes('private copyrighted full text'),false);
});
test('anonymous CORE searches also exclude full text',async()=>{
  const papers=await searchSource('core','science',1,{fetchImpl:async(url,opts)=>{
    assert.deepEqual(url.searchParams.getAll('exclude'),['fullText']);
    assert.equal(url.searchParams.has('exclude[]'),false);
    assert.equal(opts.headers.authorization,undefined);
    return {ok:true,json:async()=>({results:[]})};
  }});
  assert.deepEqual(papers,[]);
});
test('default benchmark visits all three sources for every query without leaking keys',async()=>{
  const hosts=[];
  const report=await benchmark({queries:['science','turbulence'],limit:1,
    openAlexKey:'alex-test',semanticScholarKey:'scholar-test',coreApiKey:'core-test',
    requestDelayMs:0,sleep:async()=>{},fetchImpl:async(url,opts)=>{
      hosts.push(url.hostname);
      if (url.hostname==='api.core.ac.uk') {
        assert.equal(opts.headers.authorization,'Bearer core-test');
        assert.equal(opts.headers['x-api-key'],undefined);
        assert.deepEqual(url.searchParams.getAll('exclude'),['fullText']);
        assert.equal(url.searchParams.has('exclude[]'),false);
      } else if (url.hostname==='api.openalex.org') {
        assert.equal(opts.headers.authorization,'Bearer alex-test');
        assert.equal(opts.headers['x-api-key'],undefined);
      } else {
        assert.equal(opts.headers['x-api-key'],'scholar-test');
        assert.equal(opts.headers.authorization,undefined);
      }
      return {ok:true,json:async()=>url.hostname==='api.semanticscholar.org'?{data:[]}:{results:[]}};
    }});
  assert.deepEqual(hosts,['api.openalex.org','api.semanticscholar.org','api.core.ac.uk',
    'api.openalex.org','api.semanticscholar.org','api.core.ac.uk']);
  assert.equal(report.results.length,2);
  for (const result of report.results) {
    assert.deepEqual(Object.keys(result.sources),['openalex','semantic-scholar','core']);
    for (const source of Object.values(result.sources)) assert.equal(source.status,'ok');
  }
});
test('CORE failures are isolated and pairwise DOI comparisons remain meaningful',async()=>{
  const report=await benchmark({sources:['openalex','semantic-scholar','core'],queries:['science'],limit:1,
    requestDelayMs:0,maxRetries:0,sleep:async()=>{},
    fetchImpl:async(url)=>{
      const str=String(url);
      if(str.includes('core.ac.uk')) return {ok:false,status:429};
      return {ok:true,json:async()=>str.includes('openalex')
        ? {results:[{id:'W1',display_name:'Study',doi:'10.1234/one'}]}
        : {data:[{paperId:'S1',title:'Study',externalIds:{DOI:'10.1234/one'}}]}};
    }});
  assert.equal(report.results[0].sources.core.httpStatus,429);
  assert.equal(report.results[0].sources.openalex.status,'ok');
  assert.equal(report.results[0].doiOverlap.commonDois,1);
  assert.equal(report.results[0].doiOverlaps['openalex__core'],null);
});
