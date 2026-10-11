import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmark, searchSource, parseArxivAtom, normalizePaper } from '../research/literature-benchmark.mjs';

const feed=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:a="http://arxiv.org/schemas/atom">
<entry><id>http://arxiv.org/abs/2610.01234v2</id><title> AI &amp; turbulence
 study </title><summary>Abstract only</summary><published>2026-10-01T00:00:00Z</published>
<updated>2026-10-02T00:00:00Z</updated><a:doi>10.1234/ABC</a:doi><link title="pdf" href="https://arxiv.org/pdf/2610.01234"/></entry>
<entry><id>http://arxiv.org/abs/math.GT/0309136v1</id><title>Old identifier</title></entry></feed>`;

test('arXiv parses namespaces, entities and optional DOI without fetching PDFs or leaking credentials',async()=>{
  const delays=[];const requests=[];
  const papers=await searchSource('arxiv','AI turbulence',2,{sleep:async ms=>delays.push(ms),
    coreApiKey:'secret',semanticScholarKey:'secret',openAlexKey:'secret',fetchImpl:async(url,opts)=>{
      requests.push(url);
      assert.equal(url.origin,'https://export.arxiv.org');
      assert.equal(url.searchParams.get('search_query'),'all:"AI" AND all:"turbulence"');
      assert.equal(url.searchParams.get('max_results'),'2');
      assert.equal(url.searchParams.get('sortBy'),'submittedDate');
      assert.equal(url.searchParams.get('sortOrder'),'descending');
      assert.equal(opts.headers.authorization,undefined);
      assert.equal(opts.headers['x-api-key'],undefined);
      return {ok:true,text:async()=>feed};
    }});
  assert.deepEqual(delays,[3000]);assert.equal(requests.length,1);
  assert.equal(papers[0].title,'AI & turbulence study');
  assert.equal(papers[0].doi,'10.1234/abc');
  assert.equal(papers[0].sourceUrl,'https://arxiv.org/abs/2610.01234v2');
  assert.equal(papers[0].hasAbstract,true);
  assert.equal(papers[0].repositoryType,'preprint');
  assert.equal(papers[1].doi,null);
  assert.equal(papers[1].sourceUrl,'https://arxiv.org/abs/math.GT/0309136v1');
  assert.equal('abstract' in papers[0],false);
});

test('invalid XML and Atom error entries fail, while a valid empty feed succeeds',async()=>{
  for (const xml of ['<html/>','<feed>',
    '<!DOCTYPE feed [<!ENTITY x "abc">]><feed xmlns="http://www.w3.org/2005/Atom"/>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/api/errors#incorrect_id_format</id><title>Error</title></entry></feed>']) {
    await assert.rejects(()=>parseArxivAtom(xml),/Invalid arXiv/);
  }
  assert.deepEqual(await parseArxivAtom('<feed xmlns="http://www.w3.org/2005/Atom"/>'),[]);
});

test('arXiv retries remain paced and failures do not erase other providers',async()=>{
  let arxivCalls=0;const delays=[];
  const report=await benchmark({sources:['arxiv','core'],queries:['AI'],maxRetries:1,maxBackoffMs:0,
    requestDelayMs:0,sleep:async ms=>delays.push(ms),fetchImpl:async url=>{
      if (url.hostname==='export.arxiv.org') {arxivCalls++;return {ok:false,status:503};}
      return {ok:true,json:async()=>({results:[{id:1,title:'CORE paper'}]})};
    }});
  assert.equal(arxivCalls,2);assert.deepEqual(delays,[3000,0,3000]);
  assert.equal(report.results[0].sources.arxiv.httpStatus,503);
  assert.equal(report.results[0].sources.core.papers[0].title,'CORE paper');
  assert.equal(report.results[0].doiOverlaps['arxiv__core'],null);
});

test('default four-source benchmark retains metadata and computes arXiv DOI overlaps',async()=>{
  const report=await benchmark({queries:['AI'],limit:2,requestDelayMs:0,sleep:async()=>{},
    fetchImpl:async url=>{
      if (url.hostname==='export.arxiv.org') return {ok:true,text:async()=>feed};
      if (url.hostname==='api.semanticscholar.org') return {ok:true,json:async()=>({data:[{paperId:'a'.repeat(40),title:'S2 paper',externalIds:{DOI:'10.1234/abc'}}]})};
      return {ok:true,json:async()=>({results:[url.hostname==='api.openalex.org'
        ? {id:'https://openalex.org/W1',display_name:'Alex paper',doi:'10.1234/abc'}
        : {id:1,title:'CORE paper',doi:'10.1234/abc',fullText:'never retain this'}]})};
    }});
  assert.deepEqual(report.sourceNames,['openalex','semantic-scholar','core','arxiv']);
  for (const source of report.sourceNames) {
    assert.equal(report.results[0].sources[source].status,'ok');
    assert.ok(report.results[0].sources[source].papers[0].sourceUrl);
  }
  assert.equal(report.results[0].doiOverlaps['openalex__arxiv'].commonDois,1);
  assert.equal(JSON.stringify(report).includes('never retain this'),false);
});

test('unsafe source links and malformed arXiv identifiers are not retained',()=>{
  assert.equal(normalizePaper('semantic-scholar',{paperId:'invalid',title:'Paper',url:'javascript:alert(1)'}).sourceUrl,null);
  assert.equal(normalizePaper('arxiv',{id:'https://evil.test/abs/2610.01234',title:'Paper'}),null);
});
