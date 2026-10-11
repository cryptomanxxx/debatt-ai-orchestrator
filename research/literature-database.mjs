import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SOURCES, normalizeDoi, normalizeArxivId, safeSourceUrl } from './literature-benchmark.mjs';
import { validLiteratureTime } from './literature-dates.mjs';

const boundedText=(value,max)=>typeof value==='string' && value.trim() && value.length<=max;
const optionalTime=(value,requireTime=false)=>{
  if (value==null) return null;
  if (!validLiteratureTime(value,{requireTime})) throw Error('invalid_literature_timestamp');
  return value;
};
const optionalInteger=value=>{
  if (value==null) return null;
  if (!Number.isInteger(value) || value<0 || value>2147483647) throw Error('invalid_literature_integer');
  return value;
};

export function literaturePayload(report,{runKey,originUrl=null}={}) {
  if (!boundedText(runKey,200) || !Array.isArray(report?.sourceNames) || !report.sourceNames.length
    || new Set(report.sourceNames).size!==report.sourceNames.length || report.sourceNames.some(s=>!SOURCES.includes(s))
    || !Array.isArray(report.results) || report.results.length<1 || report.results.length>20) throw Error('invalid_literature_report');
  const searches=[];
  for (const [queryIndex,result] of report.results.entries()) {
    if (!boundedText(result.query,200)) throw Error('invalid_literature_query');
    for (const source of report.sourceNames) {
      const v=result.sources?.[source];
      if (!v || !['ok','error'].includes(v.status)) throw Error('invalid_literature_source_result');
      if (v.status==='ok' && (!Array.isArray(v.papers) || v.papers.length>100 || v.records!==v.papers.length)) throw Error('missing_literature_records');
      if (v.status==='error' && v.papers?.length) throw Error('invalid_literature_error_records');
      const papers=(v.status==='ok'?v.papers:[]).map(p=>{
        if (!boundedText(p.title,1000) || !boundedText(p.sourceId,500) || p.source!==source) throw Error('invalid_literature_paper');
        const doi=normalizeDoi(p.doi), arxivId=normalizeArxivId(p.arxivId ?? (source==='arxiv'?p.sourceId:null));
        if (p.doi!=null && !doi || p.arxivId!=null && !arxivId) throw Error('invalid_literature_identifier');
        return {sourceId:p.sourceId,title:p.title,doi,arxivId,sourceUrl:safeSourceUrl(p.sourceUrl),
          year:optionalInteger(p.year),published:optionalTime(p.published),updated:optionalTime(p.updated,true),
          hasAbstract:p.hasAbstract===true,hasOpenAccessSignal:p.hasOpenAccessSignal===true};
      });
      searches.push({queryIndex,query:result.query,source,status:v.status,fetchedAt:optionalTime(v.fetchedAt,true),
        attempts:optionalInteger(v.attempts),httpStatus:optionalInteger(v.httpStatus),latencyMs:optionalInteger(v.latencyMs),papers});
    }
  }
  const payload={runKey,originUrl:safeSourceUrl(originUrl),searches};
  return {...payload,contentHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}

export async function persistLiteratureReport(report,{url,secretKey,runKey,originUrl,fetchImpl=fetch}={}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url??'')) throw Error('invalid_supabase_url');
  if (typeof secretKey!=='string' || !secretKey.startsWith('sb_secret_')) throw Error('missing_supabase_secret_key');
  const payload=literaturePayload(report,{runKey,originUrl});
  let response;
  try {
    response=await fetchImpl(new URL('/rest/v1/rpc/ingest_literature_run',url),{method:'POST',
      headers:{apikey:secretKey,'content-type':'application/json'},body:JSON.stringify({p_payload:payload}),signal:AbortSignal.timeout(30000)});
  } catch { throw Error('literature_database_transport_failed'); }
  if (!response.ok) throw Error('literature_database_write_failed:'+response.status);
  let result;
  try { result=await response.json(); } catch { throw Error('invalid_literature_database_response'); }
  if (!result || typeof result.runId!=='string' || typeof result.replayed!=='boolean') throw Error('invalid_literature_database_response');
  return result;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const report=JSON.parse(await readFile(process.argv[2],'utf8'));
    const {GITHUB_REPOSITORY:repo,GITHUB_RUN_ID:runId,GITHUB_RUN_ATTEMPT:attempt='1'}=process.env;
    const runKey=process.env.LITERATURE_RUN_KEY ?? (repo && runId ? `github:${repo}:${runId}:${attempt}` : null);
    const originUrl=repo && runId ? `https://github.com/${repo}/actions/runs/${runId}` : null;
    const result=await persistLiteratureReport(report,{url:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY,runKey,originUrl});
    console.log('Literature database: '+(result.replayed?'existing import confirmed':'saved')+'; run '+result.runId);
  } catch(e) {
    console.error(/^(invalid_|missing_|literature_)/.test(e.message)?e.message:'literature_import_failed');
    process.exitCode=1;
  }
}
