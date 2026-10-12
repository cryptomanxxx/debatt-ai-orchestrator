import test from 'node:test';
import assert from 'node:assert/strict';
import {abstractLookup,createAbstractArchiveClient,createArchivedAbstractLoader} from '../research/literature-abstract-archive.mjs';
import {buildEvidenceReport,hashText} from '../research/literature-evidence.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const text='Full normalized abstract: compare a physics-informed estimator with a conventional filter.';
const date='2026-10-12T12:00:00Z';const current=Date.parse(date);
const key={sourceRecordId:uid(20),provider:'openalex',lookupId:'https://openalex.org/W123'};
const paper=()=>({article_id:uid(1),title:'Physics-informed flow estimation',lookup_identifiers:{doi:null,arxiv_id:null,
  openalex_records:[{source_record_id:uid(20),source_id:key.lookupId}]},source_hits:[{source_record_id:uid(20),source:'openalex',source_id:key.lookupId,doi:null}]});
const loaded=()=>({status:'available',abstract:text,content:{provider:'openalex',url:key.lookupId,scope:'abstract_only',sha256:hashText(text),fetched_at:date}});
const row=()=>({id:uid(30),source_record_id:key.sourceRecordId,provider:key.provider,lookup_id:key.lookupId,source_url:key.lookupId,
  content_hash:hashText(text),fetched_at:date,last_fetched_at:date,
  literature_abstract_blob:{content_hash:hashText(text),abstract_text:text,byte_count:Buffer.byteLength(text,'utf8')}});
const receipt=()=>({id:uid(30),sourceRecordId:key.sourceRecordId,provider:key.provider,lookupId:key.lookupId,sourceUrl:key.lookupId,
  contentHash:hashText(text),fetchedAt:date,lastFetchedAt:date,insertedBlob:true,insertedVersion:true,byteCount:Buffer.byteLength(text,'utf8')});
const json=value=>new Response(JSON.stringify(value));
const client=fetchImpl=>createAbstractArchiveClient({url:'https://example.supabase.co',secretKey:'private',fetchImpl});

test('cache keys use stable source records and current canonical enrichment',()=>{
  assert.deepEqual(abstractLookup(paper()),key);
  const p=paper();p.lookup_identifiers.openalex_records=[];p.source_hits=[];p.lookup_identifiers.doi='10.1234/test';
  p.source_hits=[{source_record_id:uid(21),source:'core',source_id:'7',doi:null}];
  assert.deepEqual(abstractLookup(p),{sourceRecordId:uid(21),provider:'openalex',lookupId:'10.1234/test'});
  p.lookup_identifiers.doi=null;p.lookup_identifiers.arxiv_id='2610.01234';
  assert.deepEqual(abstractLookup(p),{sourceRecordId:uid(21),provider:'arxiv',lookupId:'2610.01234'});
  p.lookup_identifiers.arxiv_id=null;assert.equal(abstractLookup(p),null);
});
test('fresh cache verifies complete text/hash/identity and preserves version without provider calls',async()=>{
  let calls=0,request;
  const db=client(async(url,options)=>{request={url:String(url),options};return json([row()]);});
  const loader=createArchivedAbstractLoader({client:db,now:()=>current+1000,loadAbstract:async()=>{calls++;throw Error('unexpected provider');}});
  const result=await loader(paper());assert.equal(result.abstract,text);assert.equal(result.archive.version_id,uid(30));
  assert.equal(result.archive.cache_hit,true);assert.equal(calls,0);
  assert.equal(request.options.headers.apikey,'private');assert.equal(request.options.headers.Authorization,undefined);
  assert.equal(request.options.redirect,'error');
  const params=new URL(request.url).searchParams;assert.equal(params.get('lookup_id'),'eq.'+JSON.stringify(key.lookupId));
  assert.equal(params.get('limit'),'1');assert.match(params.get('select'),/literature_abstract_blob/);
});
test('expired or absent cache retrieves and persists text before analysis; unchanged receipt retains ID',async()=>{
  const sequence=[];let expired=true;
  const db=client(async(url,options)=>{
    if (String(url).includes('/rpc/')) {
      sequence.push('save');const payload=JSON.parse(options.body).p_payload;
      assert.equal(payload.abstract,text);assert.equal(payload.contentHash,hashText(text));
      return json({...receipt(),insertedBlob:false,insertedVersion:false});
    }
    sequence.push('read');return json(expired?[row()]:[]);
  });
  const loader=createArchivedAbstractLoader({client:db,now:()=>current+24*60*60*1000,loadAbstract:async()=>{sequence.push('provider');return loaded();}});
  const first=await loader(paper());assert.deepEqual(sequence,['read','provider','save']);
  assert.equal(first.archive.version_id,uid(30));assert.equal(first.archive.stored_bytes,0);assert.equal(first.archive.cache_hit,false);
  expired=false;sequence.length=0;await loader(paper());assert.deepEqual(sequence,['read','provider','save']);
});
test('forged cached content, identity, timestamps and receipts are rejected',async()=>{
  const cases=[{...row(),content_hash:'0'.repeat(64)}, {...row(),lookup_id:'other'}, {...row(),source_url:'https://evil.invalid'},
    {...row(),last_fetched_at:'2099-01-01T00:00:00Z'}, {...row(),literature_abstract_blob:{...row().literature_abstract_blob,abstract_text:'wrong'}}];
  for (const value of cases) await assert.rejects(client(async()=>json([value])).read(key,{now:current}));
  await assert.rejects(client(async()=>json({...receipt(),id:'invalid'})).save(key,loaded()),/invalid_abstract_archive_response/);
  await assert.rejects(client(async()=>json(receipt())).save(key,{...loaded(),abstract:'forged'}),/invalid_archived_abstract/);
});
test('archive preflight and failed writes avoid paid calls; successful analysis references exact version',async()=>{
  let providerCalls=0,modelCalls=0;
  await assert.rejects(client(async()=>new Response('',{status:404})).checkStorage(),/abstract_archive_http_404/);
  const db=client(async(url)=>String(url).includes('/rpc/')?new Response('',{status:503}):json([]));
  const loader=createArchivedAbstractLoader({client:db,now:()=>current,loadAbstract:async()=>{providerCalls++;return loaded();}});
  const input={literature_run_id:uid(100),query_index:0,query:'fluid estimation',source_statuses:[],total_articles:1,papers:[paper()],selection:'fixture'};
  const summarize=async()=>{modelCalls++;return {provider:'test',model:'test',text:JSON.stringify({findings:[{kind:'method',claim:'Compare estimators.',quote:'compare a physics-informed estimator with a conventional filter.'}]})};};
  const failed=await buildEvidenceReport(input,{id:uid(200),loadAbstract:loader,summarize});
  assert.equal(failed.papers[0].reason,'abstract_archive_http_503');assert.equal(modelCalls,0);assert.equal(providerCalls,1);
  const cachedLoader=createArchivedAbstractLoader({client:client(async()=>json([row()])),now:()=>current,loadAbstract:async()=>{throw Error('unexpected');}});
  const report=await buildEvidenceReport(input,{id:uid(201),loadAbstract:cachedLoader,summarize});
  assert.equal(report.status,'completed');assert.equal(report.papers[0].archive.version_id,uid(30));
  assert.equal(report.planner.proposals[0].evidence[0].abstract_version_id,uid(30));
  assert.equal(report.archive_stats.reused_abstracts,1);assert.equal(report.archive_stats.new_content_bytes,0);
  assert.ok(!JSON.stringify(report).includes(text));
});
