import { normalizeArxivId,normalizeDoi } from './literature-benchmark.mjs';
import { boundedJson,hashText,createLiteratureAbstractLoader } from './literature-evidence.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORK=/^https:\/\/openalex.org\/W\d+$/;
const DAY=24*60*60*1000;
const timestamp=value=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));
export function abstractLookup(paper) {
  const direct=paper.lookup_identifiers?.openalex_records?.[0]??paper.source_hits.find(h=>h.source==='openalex'&&WORK.test(h.source_id));
  const doi=paper.lookup_identifiers?.doi??paper.source_hits.map(h=>normalizeDoi(h.doi)).find(Boolean);
  const arxiv=normalizeArxivId(paper.lookup_identifiers?.arxiv_id);
  const provider=direct||doi?'openalex':arxiv?'arxiv':null;
  if (!provider) return null;
  const anchor=direct??paper.source_hits.find(h=>provider==='arxiv'&&h.source==='arxiv')??paper.source_hits[0];
  const key={sourceRecordId:anchor?.source_record_id,provider,lookupId:direct?.source_id??doi??arxiv};
  if (!UUID.test(key.sourceRecordId??'')||!key.lookupId||key.lookupId.length>500) throw new Error('invalid_abstract_lookup');
  return key;
}
function validateLoaded(loaded,key) {
  const c=loaded?.content,text=loaded?.abstract;
  const arxivId=c?.url?.startsWith('https://arxiv.org/abs/')?normalizeArxivId(c.url):null;
  if (loaded?.status!=='available'||typeof text!=='string'||text.length<40||text.length>12000||text.includes('\u0000')
    ||c?.provider!==key.provider||c.sha256!==hashText(text)||typeof c.url!=='string'||c.url.length>512||/\s/.test(c.url)
    ||!timestamp(c.fetched_at)
    ||(key.provider==='openalex'?(!WORK.test(c.url)||(WORK.test(key.lookupId)&&c.url!==key.lookupId)):arxivId!==key.lookupId))
    throw new Error('invalid_archived_abstract');
  return loaded;
}
export function createAbstractArchiveClient({url,secretKey,fetchImpl=fetch}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url??'')||typeof secretKey!=='string'||!secretKey)
    throw new Error('invalid_literature_database_environment');
  const headers={apikey:secretKey};
  async function request(endpoint,options={}) {
    let response;
    try {response=await fetchImpl(new URL(endpoint,url),{...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(55000)});}
    catch {throw new Error('abstract_archive_transport_error');}
    if (!response.ok) {await response.body?.cancel();throw new Error('abstract_archive_http_'+response.status);}
    return boundedJson(response,200_000);
  }
  return {
    async checkStorage() {
      for (const table of ['literature_abstract_blob','literature_abstract_version']) {
        const rows=await request('/rest/v1/'+table+'?select='+ (table.endsWith('blob')?'content_hash':'id')+'&limit=0');
        if (!Array.isArray(rows)||rows.length) throw new Error('invalid_abstract_archive_response');
      }
    },
    async read(key,{now=Date.now()}={}) {
      // Scalar eq consumes the entire value literally; adding list/logic quotes
      // changes the lookup key. URLSearchParams handles URL encoding separately.
      const params=new URLSearchParams({select:'id,source_record_id,provider,lookup_id,source_url,content_hash,fetched_at,last_fetched_at,literature_abstract_blob(content_hash,abstract_text,byte_count)',
        source_record_id:'eq.'+key.sourceRecordId,provider:'eq.'+key.provider,lookup_id:'eq.'+key.lookupId,
        order:'last_fetched_at.desc,created_at.desc,id.asc',limit:'1'});
      const rows=await request('/rest/v1/literature_abstract_version?'+params);
      if (!Array.isArray(rows)||rows.length>1) throw new Error('invalid_abstract_archive_response');
      if (!rows.length) return null;
      const row=rows[0],blob=row.literature_abstract_blob;
      if (!UUID.test(row.id??'')||row.source_record_id!==key.sourceRecordId||row.provider!==key.provider||row.lookup_id!==key.lookupId
        ||blob?.content_hash!==row.content_hash||typeof blob?.abstract_text!=='string'||blob.byte_count!==Buffer.byteLength(blob.abstract_text,'utf8'))
        throw new Error('invalid_abstract_archive_response');
      const loaded=validateLoaded({status:'available',abstract:blob.abstract_text,content:{provider:row.provider,url:row.source_url,
        scope:'abstract_only',sha256:row.content_hash,fetched_at:row.fetched_at}},key);
      const last=Date.parse(row.last_fetched_at);
      if (!timestamp(row.last_fetched_at)||last>now+300_000) throw new Error('invalid_abstract_archive_response');
      if (now-last>=DAY) return null;
      return {...loaded,archive:{version_id:row.id,source_record_id:key.sourceRecordId,
        last_fetched_at:row.last_fetched_at,cache_hit:true,inserted_blob:false,inserted_version:false,stored_bytes:0}};
    },
    async save(key,loaded) {
      validateLoaded(loaded,key);
      const result=await request('/rest/v1/rpc/save_literature_abstract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_payload:{
        ...key,sourceUrl:loaded.content.url,abstract:loaded.abstract,contentHash:loaded.content.sha256,fetchedAt:loaded.content.fetched_at}})});
      if (!UUID.test(result?.id??'')||result.contentHash!==loaded.content.sha256||result.sourceRecordId!==key.sourceRecordId
        ||result.provider!==key.provider||result.lookupId!==key.lookupId||result.sourceUrl!==loaded.content.url
        ||result.byteCount!==Buffer.byteLength(loaded.abstract,'utf8')||typeof result.insertedBlob!=='boolean'||typeof result.insertedVersion!=='boolean'
        ||!timestamp(result.fetchedAt)||!timestamp(result.lastFetchedAt))
        throw new Error('invalid_abstract_archive_response');
      return {...loaded,content:{...loaded.content,fetched_at:result.fetchedAt},archive:{version_id:result.id,source_record_id:key.sourceRecordId,
        last_fetched_at:result.lastFetchedAt,cache_hit:false,inserted_blob:result.insertedBlob,
        inserted_version:result.insertedVersion,stored_bytes:result.insertedBlob?result.byteCount:0}};
    }
  };
}
export function createArchivedAbstractLoader({client,loadAbstract=createLiteratureAbstractLoader(),now=Date.now}={}) {
  return async paper=>{
    const key=abstractLookup(paper);
    if (!key) return {status:'unavailable',reason:'no_abstract_identifier'};
    const cached=await client.read(key,{now:now()});
    if (cached) return cached;
    const loaded=await loadAbstract(paper);
    if (loaded.status!=='available') return loaded;
    // Persistence must succeed before the abstract is sent to a paid model.
    return client.save(key,loaded);
  };
}
