import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';

export const SOURCES = ['openalex','semantic-scholar','core','arxiv'];

export function safeSourceUrl(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return null;
  try {
    const u=new URL(value);
    return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

export function parseArxivAtom(xml) {
  if (typeof xml!=='string' || Buffer.byteLength(xml)>2_000_000) return Promise.reject(new Error('Invalid arXiv Atom response'));
  return new Promise((resolve,reject)=>{
    const child=execFile('python3',[fileURLToPath(new URL('./parse-arxiv-feed.py',import.meta.url))],
      {timeout:5000,maxBuffer:2_000_000},(error,stdout)=>{
        if (error) return reject(new Error('Invalid arXiv Atom response'));
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Invalid arXiv Atom response')); }
      });
    child.stdin.on('error',()=>{});
    child.stdin.end(xml);
  });
}

export const DEFAULT_QUERIES = [
  'physics informed neural networks turbulence',
  'active learning scientific experiment design',
  'Kalman filter neural state estimation',
  'causal inference machine learning',
  'mixture of experts model evaluation',
];

export function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const doi = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:/i, '').toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}

export function abstractFromIndex(index) {
  if (!index || typeof index !== 'object') return null;
  const tokens = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (Number.isInteger(p) && p >= 0 && p < 100000) tokens.push([p, word]);
  }
  return tokens.sort((a,b) => a[0]-b[0]).map(x => x[1]).join(' ') || null;
}

export function arxivPublicationYear(value) {
  if (typeof value!=='string') return null;
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/i);
  if (!match) return null;
  const [,y,m,d,h,minute,second,,offsetHour,offsetMinute]=match;
  const year=Number(y),month=Number(m),day=Number(d);
  const leap=year%4===0 && (year%100!==0 || year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if (month<1 || month>12 || day<1 || day>days[month-1] || Number(h)>23 || Number(minute)>59 || Number(second)>59
    || Number(offsetHour??0)>23 || Number(offsetMinute??0)>59) return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime()) ? date.getUTCFullYear() : null;
}

export function normalizePaper(source, p) {
  if (!p || typeof p !== 'object') return null;
  const title = source === 'openalex' ? p.display_name : p.title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const doi = normalizeDoi(p.doi ?? p.externalIds?.DOI ?? (Array.isArray(p.identifiers) ? p.identifiers.find(v=>typeof v==='string' && /^10\./.test(v)) : null));
  const id = String(source === 'semantic-scholar' ? p.paperId ?? '' : p.id ?? '');
  if (!id) return null;
  let sourceUrl=null;
  if (source==='openalex' && /^https:\/\/openalex.org\/W\d+$/.test(id)) sourceUrl=id;
  if (source==='semantic-scholar') sourceUrl=safeSourceUrl(p.url) ?? (/^[a-f0-9]{40}$/i.test(id) ? 'https://www.semanticscholar.org/paper/'+id : null);
  if (source==='core' && /^\d+$/.test(id)) sourceUrl='https://core.ac.uk/works/'+id;
  if (source==='arxiv') {
    const match=id.match(/^https?:\/\/arxiv.org\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/);
    if (!match) return null;
    sourceUrl='https://arxiv.org/abs/'+match[1];
  }
  const abstract = source === 'openalex' ? abstractFromIndex(p.abstract_inverted_index) : p.abstract ?? null;
  const arxivYear=source==='arxiv' ? arxivPublicationYear(p.published) : null;
  const oa = source === 'arxiv' ? true : source === 'openalex' ? Boolean(p.best_oa_location?.landing_page_url || p.best_oa_location?.pdf_url || p.open_access?.is_oa) : source === 'core' ? Boolean(p.downloadUrl || p.sourceFulltextUrls?.length || p.fullTextLink) : Boolean(p.openAccessPdf?.url || p.isOpenAccess);
  return { source, sourceId:id, sourceUrl, doi, title:title.trim().replace(/\s+/g,' ').slice(0,1000), year:source==='arxiv' ? arxivYear : p.publication_year ?? p.year ?? (typeof p.yearPublished==='number'?p.yearPublished:null),
    ...(source==='arxiv'?{published:p.published,updated:p.updated,repositoryType:'preprint'}:{}),
    hasAbstract:source==='arxiv' ? p.hasAbstract===true : typeof abstract === 'string' && abstract.trim().length > 0, hasOpenAccessSignal:oa };
}

export function summarize(papers) {
  const ids = new Set(), doi = new Set();
  for (const p of papers) {
    ids.add(p.source + ':' + p.sourceId);
    if (p.doi) doi.add(p.doi);
  }
  return { records:papers.length, uniqueSourceIds:ids.size, uniqueDois:doi.size,
    withAbstract:papers.filter(p=>p.hasAbstract).length,
    withOpenAccessSignal:papers.filter(p=>p.hasOpenAccessSignal).length };
}

export function overlap(a,b) {
  const left = new Set(a.map(p=>p.doi).filter(Boolean)), right = new Set(b.map(p=>p.doi).filter(Boolean));
  return { commonDois:[...left].filter(d=>right.has(d)).length,
    onlyLeft:[...left].filter(d=>!right.has(d)).length,
    onlyRight:[...right].filter(d=>!left.has(d)).length };
}

export class ProviderHttpError extends Error {
  constructor(status, retryAfterMs=null) {
    super('HTTP ' + status);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function parseRetryAfter(value, now=Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed=value.trim();
  const isSeconds=/^\d+(?:\.\d+)?$/.test(trimmed);
  const isHttpDate=/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed);
  if (!isSeconds && !isHttpDate) return null;
  const milliseconds=isSeconds ? Number(trimmed)*1000 : Date.parse(trimmed)-now;
  return Number.isFinite(milliseconds) ? Math.max(0,Math.ceil(milliseconds)) : null;
}

export async function fetchJson(url, { apiKey, authBearer, fetchImpl=fetch }={}) {
  const headers = { accept:'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (authBearer) headers.authorization = 'Bearer ' + authBearer;
  const response = await fetchImpl(url, { headers, signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new ProviderHttpError(response.status,parseRetryAfter(response.headers?.get?.('retry-after')));
  return response.json();
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function retryTemporaryFailure(operation, { maxRetries=2, sleep=wait, maxBackoffMs=10000, requestTimeoutMs=15000 }={}) {
  let attempts=0;
  while (true) {
    attempts++;
    try { return {value:await operation(),attempts}; }
    catch (error) {
      if (!(error instanceof ProviderHttpError) || ![429,500,502,503,504].includes(error.status) || attempts>maxRetries) {
        error.attempts=attempts;
        throw error;
      }
      const backoff=error.status===429 ? 2000 * 2 ** (attempts-1) : 1000 * 2 ** (attempts-1);
      await sleep(Math.min(maxBackoffMs,Math.max(backoff,error.retryAfterMs??0)));
    }
  }
}

export async function searchSource(source, query, limit, options={}) {
  if (!SOURCES.includes(source)) throw new Error('Unsupported source');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1..100');
  if (typeof query!=='string' || !query.trim() || query.length>200) throw new Error('Invalid query');
  if (source==='arxiv') {
    const u=new URL('https://export.arxiv.org/api/query');
    u.searchParams.set('search_query',query.trim().split(/\s+/).map(word=>'all:"'+word.replace(/["\\]/g,'')+'"').join(' AND '));
    u.searchParams.set('start','0'); u.searchParams.set('max_results',String(limit));
    u.searchParams.set('sortBy','submittedDate'); u.searchParams.set('sortOrder','descending');
    // One connection and at least three seconds before every arXiv attempt,
    // including retries; the benchmark runs providers sequentially.
    await (options.sleep ?? wait)(3000);
    const response=await (options.fetchImpl ?? fetch)(u,{headers:{accept:'application/atom+xml',
      'user-agent':'Debatt-AI-Literature-Benchmark/0.4 (https://www.debatt-ai.se/universitet)'},signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new ProviderHttpError(response.status,parseRetryAfter(response.headers?.get?.('retry-after')));
    const records=await parseArxivAtom(await response.text());
    return records.slice(0,limit).map(p=>normalizePaper(source,p)).filter(Boolean);
  }
  const u = new URL(source === 'openalex' ? 'https://api.openalex.org/works' : source === 'core' ? 'https://api.core.ac.uk/v3/search/works/' : 'https://api.semanticscholar.org/graph/v1/paper/search');
  if (source === 'openalex') {
    u.searchParams.set('search',query); u.searchParams.set('per-page',String(limit));
    u.searchParams.set('select','id,doi,display_name,publication_year,abstract_inverted_index,open_access,best_oa_location');
  } else if (source === 'core') {
    u.searchParams.set('q',query); u.searchParams.set('limit',String(limit));
    // Serialize the exclusion array as repeated plain query keys (form/explode).
    u.searchParams.append('exclude','fullText');
  } else {
    u.searchParams.set('query',query); u.searchParams.set('limit',String(limit));
    u.searchParams.set('fields','title,year,url,abstract,externalIds,isOpenAccess,openAccessPdf');
  }
  const json = await fetchJson(u,{apiKey:source === 'semantic-scholar' ? options.semanticScholarKey : undefined,
    authBearer:source === 'openalex' ? options.openAlexKey : source === 'core' ? options.coreApiKey : undefined,fetchImpl:options.fetchImpl});
  const records = source === 'semantic-scholar' ? json.data : json.results;
  if (!Array.isArray(records)) throw new Error('Invalid API response from '+source);
  return records.slice(0,limit).map(p=>normalizePaper(source,p)).filter(Boolean);
}

export async function benchmark({ queries=DEFAULT_QUERIES, sources=SOURCES, limit=10, fetchImpl=fetch, openAlexKey, semanticScholarKey, coreApiKey, sleep=wait, clock=()=>performance.now(), requestDelayMs=1200, maxRetries=2, maxBackoffMs=10000 }={}) {
  if (!Array.isArray(sources) || !sources.length || new Set(sources).size!==sources.length || sources.some(source=>!SOURCES.includes(source))) throw new Error('Invalid sources');
  if (!Array.isArray(queries) || queries.length===0 || queries.length>20 || queries.some(q=>typeof q!=='string'||!q.trim()||q.length>200)) throw new Error('Invalid queries');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1..100');
  if (!Number.isInteger(requestDelayMs) || requestDelayMs<0 || requestDelayMs>10000) throw new Error('Invalid request delay');
  if (!Number.isInteger(maxRetries) || maxRetries<0 || maxRetries>3) throw new Error('Invalid retry count');
  if (!Number.isInteger(maxBackoffMs) || maxBackoffMs<0 || maxBackoffMs>60000) throw new Error('Invalid maximum backoff');
  const results=[];
  const sourceNames=sources;
  let requestsStarted=0;
  for (const query of queries) {
    const sources={}; const raw={};
    for (const source of sourceNames) {
      let start=clock();
      try {
        if (requestsStarted++ > 0 && requestDelayMs) await sleep(requestDelayMs);
        start=clock();
        const {value,attempts}=await retryTemporaryFailure(
          ()=>searchSource(source,query,limit,{fetchImpl,openAlexKey,semanticScholarKey,coreApiKey,sleep}),{maxRetries,sleep,maxBackoffMs});
        raw[source]=value;
        sources[source]={status:'ok',attempts,latencyMs:Math.round(clock()-start),...summarize(raw[source]),papers:value};
      } catch(e) {
        raw[source]=[];
        sources[source]={status:'error',attempts:e.attempts??1,httpStatus:e instanceof ProviderHttpError?e.status:null,
          latencyMs:Math.round(clock()-start),error:String(e.message).slice(0,160)};
      }
    }
    const doiOverlaps={};
    for (let i=0;i<sourceNames.length;i++) for (let j=i+1;j<sourceNames.length;j++) {
      const left=sourceNames[i],right=sourceNames[j];
      doiOverlaps[left+'__'+right]=sources[left].status==='ok'&&sources[right].status==='ok' ? overlap(raw[left],raw[right]) : null;
    }
    // Keep the legacy comparison oriented OpenAlex -> Semantic Scholar,
    // independently of the caller's provider ordering.
    const doiOverlap=sources.openalex?.status==='ok' && sources['semantic-scholar']?.status==='ok'
      ? overlap(raw.openalex,raw['semantic-scholar']) : null;
    results.push({query,sources,doiOverlap,doiOverlaps});
  }
  return {schemaVersion:1,method:'metadata-only; source-specific ranking; no relevance or novelty ground truth',limit,sourceNames,results};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);
  const limit=Number(args[0] ?? 10);
  const output=args[1];
  if (!output || !Number.isInteger(limit) || limit<1 || limit>100) {
    console.error('Usage: node research/literature-benchmark.mjs <limit:1..100> <output.json>');
    process.exitCode=2;
  } else {
    try {
      const result=await benchmark({limit,openAlexKey:process.env.OPENALEX_API_KEY,semanticScholarKey:process.env.SEMANTIC_SCHOLAR_API_KEY,coreApiKey:process.env.CORE_API_KEY});
      await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
      console.log('Wrote '+output);
    } catch(e) { console.error(e.message); process.exitCode=1; }
  }
}
