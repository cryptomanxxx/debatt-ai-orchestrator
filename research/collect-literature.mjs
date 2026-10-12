import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {benchmark,DEFAULT_QUERIES,SOURCES,wait} from './literature-benchmark.mjs';
import {persistLiteratureReport} from './literature-database.mjs';
import {createLiteratureEvidenceClient,createLiteratureAbstractLoader} from './literature-evidence.mjs';
import {createAbstractArchiveClient,createArchivedAbstractLoader} from './literature-abstract-archive.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE=new Set(['collection_metadata_storage_unavailable','collection_no_usable_abstract','invalid_collection_run','invalid_abstract_lookup','invalid_archived_abstract','invalid_abstract_archive_response',
  'abstract_identity_mismatch','invalid_arxiv_response','abstract_outside_bounds','invalid_abstract_index',
  'abstract_archive_transport_error','literature_transport_error','literature_database_transport_failed',
  'invalid_literature_database_response','response_too_large','invalid_json_response','invalid_literature_search_response',
  'invalid_canonical_article_response','invalid_literature_hit_response','inconsistent_canonical_article_response']);
const reason=e=>SAFE.has(e?.message)||/^(?:abstract_archive_http_|literature_http_)\d{3}$/.test(e?.message??'')
  ||/^literature_database_write_failed:\d{3}$/.test(e?.message??'')?e.message:'collection_operation_failed';
export function validateCollectionLimit(value=50) {
  if (!Number.isInteger(value)||value<1||value>50) throw new Error('invalid_collection_limit');
  return value;
}
export function sanitizeBenchmark(report) {
  return {...report,results:report.results.map(r=>({...r,sources:Object.fromEntries(Object.entries(r.sources).map(([name,v])=>{
    const {error,...safe}=v;
    return [name,{...safe,...(v.status==='error'?{failure_reason:Number.isInteger(v.httpStatus)?'HTTP '+v.httpStatus:'provider_request_failed'}:{})}];
  }))}))};
}
export async function collectSavedAbstracts({runId,queryCount,readQuery,loadAbstract,maxAbstracts=50,
  deadline=Infinity,clock=Date.now,onProgress=async()=>{}}) {
  validateCollectionLimit(maxAbstracts);
  if (!UUID.test(runId??'')||!Number.isInteger(queryCount)||queryCount<1||queryCount>5) throw new Error('invalid_collection_run');
  const items=[],queryErrors=[],seen=new Set();let duplicatesSkipped=0,budgetExhausted=false;
  const snapshot=()=>({items,query_errors:queryErrors,budget_exhausted:budgetExhausted,abstracts:{maximum:maxAbstracts,selected:items.length,
    available:items.filter(i=>['saved','reused'].includes(i.status)).length,
    unavailable:items.filter(i=>i.status==='unavailable').length,errors:items.filter(i=>i.status==='error').length,
    reused:items.filter(i=>i.status==='reused').length,new_versions:items.filter(i=>i.archive?.inserted_version).length,
    new_content_bytes:items.reduce((n,i)=>n+(i.archive?.stored_bytes??0),0),duplicates_skipped:duplicatesSkipped}});
  for (let queryIndex=0;queryIndex<queryCount&&items.length<maxAbstracts;queryIndex++) {
    if (clock()>=deadline) {budgetExhausted=true;break;}
    let input;
    try {input=await readQuery({runId,queryIndex,maxPapers:10});}
    catch(e) {queryErrors.push({query_index:queryIndex,reason:reason(e)});await onProgress(snapshot());continue;}
    for (const paper of input.papers) {
      if (items.length>=maxAbstracts) break;
      if (clock()>=deadline) {budgetExhausted=true;break;}
      if (seen.has(paper.article_id)) {duplicatesSkipped++;continue;}
      seen.add(paper.article_id);
      const item={article_id:paper.article_id,query_index:queryIndex,title:paper.title,status:'error'};
      try {
        const loaded=await loadAbstract(paper);
        if (loaded.status!=='available') {item.status='unavailable';item.reason=['no_abstract_identifier','no_openalex_id_or_doi','abstract_missing'].includes(loaded.reason)?loaded.reason:'abstract_unavailable';}
        else {
          // Keep complete text only in the database, never in the collection artifact.
          item.status=loaded.archive.cache_hit?'reused':'saved';
          item.archive=loaded.archive;item.provider=loaded.content.provider;
          item.source_url=loaded.content.url;item.content_hash=loaded.content.sha256;
        }
      } catch(e) {item.reason=reason(e);}
      items.push(item);await onProgress(snapshot());
    }
  }
  return snapshot();
}
export function renderCollection(report) {
  const s=report.abstracts;
  return ['# Daily literature collection',`Status: ${report.status}.`,
    'Semantic Scholar: bulk keyword search, newest publication dates first (not relevance ranking).',
    `Saved metadata run: ${report.literature_run_id??'not saved'}.`,
    report.metadata?`Searches: ${report.metadata.successful_searches} successful, ${report.metadata.failed_searches} failed.`:'Metadata collection not completed.',
    s?`Abstracts: ${s.available}/${s.selected} available; ${s.reused} reused; ${s.new_versions} new versions; ${s.new_content_bytes} new text bytes.`:'Abstract collection not completed.',
    `Provider abstract attempts: ${report.provider_abstract_attempts}. Model calls: 0.`,
    report.fatal_reason?`Failure: ${report.fatal_reason}.`:'',
    'This is a bounded sample of the predefined queries, not exhaustive coverage of new research. Inspect collection.json for missing content and source failures.',
    'Full text and PDFs are not downloaded.'].filter(Boolean).join('\n\n')+'\n';
}
export async function main(env=process.env,{runBenchmark=benchmark,pause=wait,queries=DEFAULT_QUERIES,directory='reports/literature-collection'}={}) {
  if (!Array.isArray(queries)||queries.length<1||queries.length>5||queries.some(q=>typeof q!=='string'||!q.trim()||q.length>200))
    throw Error('invalid_collection_queries');
  const maxAbstracts=validateCollectionLimit(Number(env.LITERATURE_MAX_ABSTRACTS??50));
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL??'')||!env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_'))
    throw new Error('invalid_collection_environment');
  const archive=createAbstractArchiveClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  const reader=createLiteratureEvidenceClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  const repo=env.GITHUB_REPOSITORY,id=env.GITHUB_RUN_ID,attempt=env.GITHUB_RUN_ATTEMPT??'1';
  if ((repo&&!/^[\w.-]+\/[\w.-]+$/.test(repo))||(id&&!/^\d+$/.test(id))||!/^\d+$/.test(attempt)) throw new Error('invalid_collection_origin');
  const originUrl=repo&&id?`https://github.com/${repo}/actions/runs/${id}`:null;
  const runKey=originUrl?`github:${repo}:collection:s2-bulk-date-desc:${id}:${attempt}`:'local:collection:s2-bulk-date-desc:'+randomUUID();
  await mkdir(directory,{recursive:true});
  const deadline=Date.now()+20*60*1000;
  const report={schema_version:'literature-collection-1',created_at:new Date().toISOString(),status:'running',
    queries,metadata:null,literature_run_id:null,provider_abstract_attempts:0,model_calls:0,
    code_commit:/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')?env.GITHUB_SHA:null};
  const checkpoint=()=>writeFile(directory+'/collection.json',JSON.stringify(report,null,2)+'\n');
  await checkpoint();
  let failure;
  try {
    // Verify storage availability before spending provider requests.
    await archive.checkStorage();
    for (const table of ['literature_article','literature_source_record','literature_run','literature_search','literature_hit']) {
      const column=table==='literature_hit'?'search_id':'id';
      const response=await fetch(new URL(`/rest/v1/${table}?select=${column}&limit=0`,env.SUPABASE_URL),{
        headers:{apikey:env.SUPABASE_SECRET_KEY},redirect:'error',signal:AbortSignal.timeout(30000)});
      if (!response.ok) {await response.body?.cancel();throw new Error('collection_metadata_storage_unavailable');}
      await response.body?.cancel();
    }
    const raw=await runBenchmark({queries,sources:SOURCES,semanticScholarMode:'bulk',limit:10,maxRetries:1,maxBackoffMs:5000,
      openAlexKey:env.OPENALEX_API_KEY,semanticScholarKey:env.SEMANTIC_SCHOLAR_API_KEY,coreApiKey:env.CORE_API_KEY});
    const metadata=sanitizeBenchmark(raw);
    report.source_methods=metadata.sourceMethods;
    report.catalog_run_key=runKey;
    await writeFile(directory+'/searches.json',JSON.stringify(metadata,null,2)+'\n');
    const statuses=raw.results.flatMap(r=>Object.values(r.sources));
    report.metadata={queries:raw.results.length,successful_searches:statuses.filter(s=>s.status==='ok').length,
      failed_searches:statuses.filter(s=>s.status==='error').length,returned_records:statuses.reduce((n,s)=>n+(s.records??0),0)};
    const saved=await persistLiteratureReport(metadata,{url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY,runKey,originUrl});
    report.literature_run_id=saved.runId;
    const sourceLoader=createLiteratureAbstractLoader({apiKey:env.OPENALEX_API_KEY||''});
    let firstProvider=true;
    const loader=createArchivedAbstractLoader({client:archive,loadAbstract:async paper=>{
      if (firstProvider) {firstProvider=false;await pause(3000);}
      report.provider_abstract_attempts++;return sourceLoader(paper);
    }});
    Object.assign(report,await collectSavedAbstracts({runId:saved.runId,queryCount:raw.results.length,
      readQuery:options=>reader.readQuery(options),loadAbstract:loader,maxAbstracts,deadline,
      onProgress:async snapshot=>{Object.assign(report,snapshot);await checkpoint();}}));
    report.status=report.abstracts.available===0?'insufficient_content':
      report.metadata.failed_searches||report.abstracts.unavailable||report.abstracts.errors||report.query_errors.length||report.budget_exhausted?'partial':'completed';
    if (report.status==='insufficient_content') failure=new Error('collection_no_usable_abstract');
  } catch(e) {report.status='error';report.fatal_reason=reason(e);failure=e;}
  await writeFile(directory+'/collection.json',JSON.stringify(report,null,2)+'\n');
  const markdown=renderCollection(report);await writeFile(directory+'/collection.md',markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,markdown);
  console.log(JSON.stringify({status:report.status,literature_run_id:report.literature_run_id,abstracts:report.abstracts,model_calls:0}));
  if (failure) throw new Error('literature_collection_failed');
  return report;
}
if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{console.error('Literature collection failed. Inspect the collection report artifact and step summary, if produced.');process.exitCode=1;});
}
