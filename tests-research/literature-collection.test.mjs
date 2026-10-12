import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectSavedAbstracts,sanitizeBenchmark,validateCollectionLimit,main} from '../research/collect-literature.mjs';
import {hashText} from '../research/literature-evidence.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const paper=n=>({article_id:uid(n),title:'Flow estimation '+n});
const loaded=(cached=false)=>({status:'available',content:{provider:'openalex',url:'https://openalex.org/W123',sha256:'a'.repeat(64)},
  archive:{version_id:uid(900),source_record_id:uid(20),cache_hit:cached,inserted_version:!cached,inserted_blob:!cached,stored_bytes:cached?0:100}});

test('collection enforces a 50-article cap, deduplicates queries and records cache/new storage without raw text',async()=>{
  let calls=0;const progress=[];
  const report=await collectSavedAbstracts({runId:uid(100),queryCount:5,maxAbstracts:15,
    readQuery:async({queryIndex,maxPapers})=>{assert.equal(maxPapers,10);return {papers:Array.from({length:10},(_,i)=>paper(queryIndex*5+i+1))};},
    loadAbstract:async()=>{calls++;return {...loaded(calls%2===0),abstract:'This raw content must not appear in reports.'};},
    onProgress:async r=>progress.push(r.abstracts.selected)});
  assert.equal(calls,15);assert.equal(report.abstracts.selected,15);assert.equal(report.abstracts.duplicates_skipped,5);
  assert.equal(report.abstracts.reused,7);assert.equal(report.abstracts.new_versions,8);assert.equal(report.abstracts.new_content_bytes,800);
  assert.equal(progress.length,15);assert.ok(!JSON.stringify(report).includes('raw content'));
  for(const bad of [0,51,-1,1.5,NaN]) assert.throws(()=>validateCollectionLimit(bad));
});
test('provider/storage and query failures stay visible, successful abstracts survive and errors never leak',async()=>{
  const report=await collectSavedAbstracts({runId:uid(100),queryCount:2,
    readQuery:async({queryIndex})=>{if(queryIndex) throw new Error('secret token');return {papers:[paper(1),paper(2),paper(3)]};},
    loadAbstract:async p=>{if(p.article_id===uid(1)) return {status:'unavailable',reason:'abstract_missing'};
      if(p.article_id===uid(2)) throw new Error('abstract_archive_http_503');return loaded(true);}});
  assert.equal(report.abstracts.available,1);assert.equal(report.abstracts.errors,1);assert.equal(report.abstracts.unavailable,1);
  assert.equal(report.query_errors.length,1);assert.ok(!JSON.stringify(report).includes('secret token'));
});
test('time budget stops starting more work and reports saved progress',async()=>{
  let time=0,calls=0;
  const report=await collectSavedAbstracts({runId:uid(100),queryCount:1,deadline:10,clock:()=>time,
    readQuery:async()=>({papers:[paper(1),paper(2)]}),loadAbstract:async()=>{calls++;time=11;return loaded();}});
  assert.equal(calls,1);assert.equal(report.budget_exhausted,true);assert.equal(report.abstracts.available,1);
});
test('benchmark artifacts replace arbitrary errors with bounded provider status',()=>{
  const raw={results:[{query:'q',sources:{core:{status:'error',error:'secret',httpStatus:429}}}]};
  const clean=sanitizeBenchmark(raw);assert.ok(!JSON.stringify(clean).includes('secret'));
  assert.equal(clean.results[0].sources.core.failure_reason,'HTTP 429');assert.equal(raw.results[0].sources.core.error,'secret');
});
test('manual/scheduled runner persists metadata and cached abstracts without any model endpoint',async()=>{
  const original=globalThis.fetch,cwd=process.cwd(),dir=await mkdtemp(join(tmpdir(),'lit-collection-'));
  const text='Complete abstract describing a physics-informed estimator for turbulent flow.';
  let providerCalls=0,metadataWrites=0,cached=true,storageFails=false;const pauses=[];
  globalThis.fetch=async(url,options)=>{
    const u=new URL(String(url));
    assert.ok(!u.pathname.includes('/v1/query'));
    if(u.searchParams.get('limit')==='0') return new Response(storageFails?'': '[]',{status:storageFails?404:200});
    if(u.pathname==='/rest/v1/rpc/ingest_literature_run') {
      metadataWrites++;const p=JSON.parse(options.body).p_payload;
      assert.ok(p.runKey.includes(':collection:'));return new Response(JSON.stringify({runId:uid(100),replayed:false}));
    }
    if(u.pathname==='/rest/v1/literature_run') return new Response(JSON.stringify([{id:uid(100)}]));
    if(u.pathname==='/rest/v1/literature_search') return new Response(JSON.stringify([{id:uid(10),query:'flow',source:'openalex',status:'ok',literature_hit:[{
      rank:1,source_record_id:uid(20),metadata:{title:'Flow estimation',sourceId:'https://openalex.org/W123',doi:null},
      literature_source_record:{id:uid(20),source:'openalex',source_id:'https://openalex.org/W123',article_id:uid(1),
        canonical:{id:uid(1),doi:null,arxiv_id:null,openalex_records:[{id:uid(20),source:'openalex',source_id:'https://openalex.org/W123'}]}}
    }]}]));
    if(u.pathname==='/rest/v1/literature_abstract_version'&&!cached) return new Response('[]');
    if(u.hostname==='api.openalex.org') {
      providerCalls++;const index={};text.split(' ').forEach((word,i)=>(index[word]??=[]).push(i));
      return new Response(JSON.stringify({id:'https://openalex.org/W123',abstract_inverted_index:index}));
    }
    if(u.pathname==='/rest/v1/rpc/save_literature_abstract') {
      const p=JSON.parse(options.body).p_payload;
      return new Response(JSON.stringify({id:uid(30),sourceRecordId:p.sourceRecordId,provider:p.provider,lookupId:p.lookupId,
        sourceUrl:p.sourceUrl,contentHash:p.contentHash,fetchedAt:p.fetchedAt,lastFetchedAt:p.fetchedAt,
        insertedBlob:true,insertedVersion:true,byteCount:Buffer.byteLength(text)}));
    }
    if(u.pathname==='/rest/v1/literature_abstract_version') return new Response(JSON.stringify([{id:uid(30),source_record_id:uid(20),
      provider:'openalex',lookup_id:'https://openalex.org/W123',source_url:'https://openalex.org/W123',content_hash:hashText(text),
      fetched_at:new Date().toISOString(),last_fetched_at:new Date().toISOString(),
      literature_abstract_blob:{content_hash:hashText(text),abstract_text:text,byte_count:Buffer.byteLength(text)}}]));
    providerCalls++;throw new Error('Unexpected external request');
  };
  try {
    process.chdir(dir);
    const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture',
      GITHUB_REPOSITORY:'cryptomanxxx/debatt-ai-orchestrator',GITHUB_RUN_ID:'123',LITERATURE_MAX_ABSTRACTS:'50'};
    const deps={pause:async ms=>pauses.push(ms),runBenchmark:async options=>{
        assert.equal(options.limit,10);assert.equal(options.maxRetries,1);assert.equal(options.queries.length,5);
        return {sourceNames:['openalex'],results:[{query:'flow',sources:{openalex:{status:'ok',records:1,papers:[{
          source:'openalex',title:'Flow estimation',sourceId:'https://openalex.org/W123',sourceUrl:'https://openalex.org/W123',doi:null
        }]}}}]};
      }};
    const report=await main(env,deps);
    assert.equal(report.status,'completed');assert.equal(report.abstracts.reused,1);assert.equal(report.model_calls,0);
    assert.equal(providerCalls,0);assert.equal(metadataWrites,1);assert.deepEqual(pauses,[]);
    assert.ok(!(await readFile('reports/literature-collection/collection.json','utf8')).includes(text));
    const md=await readFile('reports/literature-collection/collection.md','utf8');assert.match(md,/Model calls: 0/);
    cached=false;const fresh=await main(env,deps);
    assert.equal(fresh.abstracts.new_versions,1);assert.equal(fresh.abstracts.new_content_bytes,Buffer.byteLength(text));
    assert.equal(providerCalls,1);assert.equal(fresh.provider_abstract_attempts,1);assert.deepEqual(pauses,[3000]);
    storageFails=true;await assert.rejects(main(env,deps),/literature_collection_failed/);
    const failed=JSON.parse(await readFile('reports/literature-collection/collection.json','utf8'));
    assert.equal(failed.status,'error');assert.equal(providerCalls,1);assert.equal(metadataWrites,2);
  } finally {globalThis.fetch=original;process.chdir(cwd);await rm(dir,{recursive:true,force:true});}
});
