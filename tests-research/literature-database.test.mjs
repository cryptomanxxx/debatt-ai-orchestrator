import test from 'node:test';
import assert from 'node:assert/strict';
import {literaturePayload,persistLiteratureReport} from '../research/literature-database.mjs';
import {normalizeArxivId,normalizePaper} from '../research/literature-benchmark.mjs';
import {validLiteratureTime} from '../research/literature-dates.mjs';
const report=()=>({sourceNames:['core','arxiv'],results:[{query:'AI',sources:{
 core:{status:'ok',records:1,attempts:1,fetchedAt:'2026-10-11T13:00:00Z',papers:[{source:'core',sourceId:'1',title:'Paper',doi:'10.1234/ABC',year:2026,fullText:'drop me',abstract:'drop me too'}]},
 arxiv:{status:'error',httpStatus:429,attempts:3,error:'potentially sensitive error'}
}}]});
test('database payload preserves metadata, errors, query index and ranking without storing raw content',()=>{
 const p=literaturePayload(report(),{runKey:'test'});
 assert.equal(p.searches[0].papers[0].doi,'10.1234/abc');
 assert.equal(p.searches[1].status,'error');assert.deepEqual(p.searches[1].papers,[]);
 assert.equal(p.searches[0].queryIndex,0);
 assert.equal(JSON.stringify(p).includes('drop me'),false);
 assert.equal(JSON.stringify(p).includes('potentially sensitive'),false);
 assert.equal(p.contentHash,literaturePayload(report(),{runKey:'test'}).contentHash);
});
test('arXiv identity excludes versions and normalizes both repository and external IDs',()=>{
 assert.equal(normalizeArxivId('http://arxiv.org/abs/2610.01234v2'),'2610.01234');
 assert.equal(normalizeArxivId('ARXIV:math.GT/0309136v1'),'math.GT/0309136');
 assert.equal(normalizeArxivId('https://evil.test/2610.01234'),null);
});
test('retains provider publication dates and leaves missing dates unknown',()=>{
 assert.equal(normalizePaper('openalex',{id:'https://openalex.org/W1',display_name:'Paper',publication_date:'2026-10-01'}).published,'2026-10-01');
 assert.equal(normalizePaper('semantic-scholar',{paperId:'s1',title:'Paper',publicationDate:'2026-10-02'}).published,'2026-10-02');
 assert.equal(normalizePaper('core',{id:1,title:'Paper',yearPublished:2026}).published,null);
});
test('rejects calendar rollover, informal dates and invalid timestamp ranges before RPC writes',async()=>{
 for (const value of ['unknown','2023-02-29','1900-02-29','2026-04-31','0000-01-01','2026-13-01',
   '2026-01-01T24:00:00Z','2026-01-01T12:60:00Z','2026-01-01T12:00:60Z',
   '2026-01-01T12:00:00+16:00','2026-01-01T12:00:00','01/02/2026']) {
   assert.equal(validLiteratureTime(value),false,value);
   for (const field of ['published','updated','fetchedAt']) {
     const r=report();
     if (field==='fetchedAt') r.results[0].sources.core[field]=value;
     else r.results[0].sources.core.papers[0][field]=value;
     assert.throws(()=>literaturePayload(r,{runKey:'test'}),/invalid_literature_timestamp/,field+': '+value);
   }
 }
 for (const value of ['2024-02-29','2000-02-29','2026-01-01T12:00:00Z','2024-02-29T23:59:59.123+02:00']) {
   assert.equal(validLiteratureTime(value),true,value);
 }
 assert.equal(validLiteratureTime('2024-02-29',{requireTime:true}),false);
 for (const field of ['updated','fetchedAt']) {
   const r=report();
   if (field==='fetchedAt') r.results[0].sources.core[field]='2024-02-29';
   else r.results[0].sources.core.papers[0][field]='2024-02-29';
   assert.throws(()=>literaturePayload(r,{runKey:'test'}),/invalid_literature_timestamp/);
 }
 const bad=report();bad.results[0].sources.core.papers[0].published='2023-02-29';
 let calls=0;
 await assert.rejects(()=>persistLiteratureReport(bad,{url:'https://test.supabase.co',secretKey:'sb_secret_test',runKey:'test',fetchImpl:async()=>{calls++;}}),/invalid_literature_timestamp/);
 assert.equal(calls,0);
 assert.equal(normalizePaper('openalex',{id:'https://openalex.org/W1',display_name:'Paper',publication_date:'2023-02-29'}).published,null);
 const arxiv=normalizePaper('arxiv',{id:'http://arxiv.org/abs/2610.01234',title:'Paper',published:'2023-02-29T00:00:00Z',updated:'2026-04-31T00:00:00Z'});
 assert.equal(arxiv.published,null);assert.equal(arxiv.year,null);assert.equal(arxiv.updated,null);
});
test('rejects aggregate-only, malformed and inconsistent results before writes',()=>{
 const old=report();delete old.results[0].sources.core.papers;
 assert.throws(()=>literaturePayload(old,{runKey:'test'}),/missing_literature_records/);
 const mismatch=report();mismatch.results[0].sources.core.records=2;
 assert.throws(()=>literaturePayload(mismatch,{runKey:'test'}),/missing_literature_records/);
 const invalid=report();invalid.results[0].sources.core.papers[0].doi='invalid';
 assert.throws(()=>literaturePayload(invalid,{runKey:'test'}),/invalid_literature_identifier/);
});
test('writes one atomic RPC with backend secret only in header and no arbitrary errors',async()=>{
 let calls=0;
 const result=await persistLiteratureReport(report(),{url:'https://test.supabase.co',secretKey:'sb_secret_test',runKey:'test',fetchImpl:async(url,opts)=>{
  calls++;assert.equal(url.pathname,'/rest/v1/rpc/ingest_literature_run');
  assert.equal(opts.headers.apikey,'sb_secret_test');assert.equal(opts.headers.authorization,undefined);
  assert.equal(opts.body.includes('sb_secret_test'),false);assert.equal(opts.body.includes('drop me'),false);
  assert.equal(JSON.parse(opts.body).p_payload.runKey,'test');
  return {ok:true,json:async()=>({runId:'test-id',replayed:false})};
 }});
 assert.equal(calls,1);assert.equal(result.replayed,false);
 await assert.rejects(()=>persistLiteratureReport(report(),{url:'https://test.supabase.co',secretKey:'sb_secret_test',runKey:'test',fetchImpl:async()=>{throw Error('sb_secret_test');}}),/^Error: literature_database_transport_failed$/);
 await assert.rejects(()=>persistLiteratureReport(report(),{url:'https://test.supabase.co',secretKey:'sb_secret_test',runKey:'test',fetchImpl:async()=>({ok:false,status:403})}),/write_failed:403/);
});
