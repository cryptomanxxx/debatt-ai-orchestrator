import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

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

export function normalizePaper(source, p) {
  if (!p || typeof p !== 'object') return null;
  const title = source === 'openalex' ? p.display_name : p.title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const doi = normalizeDoi(p.doi ?? p.externalIds?.DOI);
  const id = String(source === 'openalex' ? p.id ?? '' : p.paperId ?? '');
  if (!id) return null;
  const abstract = source === 'openalex' ? abstractFromIndex(p.abstract_inverted_index) : p.abstract ?? null;
  const oa = source === 'openalex' ? Boolean(p.best_oa_location?.landing_page_url || p.best_oa_location?.pdf_url || p.open_access?.is_oa) : Boolean(p.openAccessPdf?.url || p.isOpenAccess);
  return { source, sourceId:id, doi, title:title.trim(), year:p.publication_year ?? p.year ?? null,
    hasAbstract:typeof abstract === 'string' && abstract.trim().length > 0, hasOpenAccessSignal:oa };
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

export async function fetchJson(url, { apiKey, authBearer, fetchImpl=fetch }={}) {
  const headers = { accept:'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (authBearer) headers.authorization = 'Bearer ' + authBearer;
  const response = await fetchImpl(url, { headers, signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('HTTP '+response.status);
  return response.json();
}

export async function searchSource(source, query, limit, options={}) {
  if (!['openalex','semantic-scholar'].includes(source)) throw new Error('Unsupported source');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1..100');
  const u = new URL(source === 'openalex' ? 'https://api.openalex.org/works' : 'https://api.semanticscholar.org/graph/v1/paper/search');
  if (source === 'openalex') {
    u.searchParams.set('search',query); u.searchParams.set('per-page',String(limit));
    u.searchParams.set('select','id,doi,display_name,publication_year,abstract_inverted_index,open_access,best_oa_location');
  } else {
    u.searchParams.set('query',query); u.searchParams.set('limit',String(limit));
    u.searchParams.set('fields','title,year,abstract,externalIds,isOpenAccess,openAccessPdf');
  }
  const json = await fetchJson(u,{apiKey:source === 'semantic-scholar' ? options.semanticScholarKey : undefined,
    authBearer:source === 'openalex' ? options.openAlexKey : undefined,fetchImpl:options.fetchImpl});
  const records = source === 'openalex' ? json.results : json.data;
  if (!Array.isArray(records)) throw new Error('Invalid API response from '+source);
  return records.map(p=>normalizePaper(source,p)).filter(Boolean);
}

export async function benchmark({ queries=DEFAULT_QUERIES, limit=10, fetchImpl=fetch, openAlexKey, semanticScholarKey }={}) {
  if (!Array.isArray(queries) || queries.length===0 || queries.length>20 || queries.some(q=>typeof q!=='string'||!q.trim()||q.length>200)) throw new Error('Invalid queries');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1..100');
  const results=[];
  for (const query of queries) {
    const sources={}; const raw={};
    for (const source of ['openalex','semantic-scholar']) {
      const start=performance.now();
      try {
        raw[source]=await searchSource(source,query,limit,{fetchImpl,openAlexKey,semanticScholarKey});
        sources[source]={status:'ok',latencyMs:Math.round(performance.now()-start),...summarize(raw[source])};
      } catch(e) {
        raw[source]=[];
        sources[source]={status:'error',latencyMs:Math.round(performance.now()-start),error:String(e.message).slice(0,160)};
      }
    }
    results.push({query,sources,doiOverlap:sources.openalex.status==='ok'&&sources['semantic-scholar'].status==='ok' ? overlap(raw.openalex,raw['semantic-scholar']) : null});
  }
  return {schemaVersion:1,method:'metadata-only; source-specific ranking; no relevance or novelty ground truth',limit,results};
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
      const result=await benchmark({limit,openAlexKey:process.env.OPENALEX_API_KEY,semanticScholarKey:process.env.SEMANTIC_SCHOLAR_API_KEY});
      await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
      console.log('Wrote '+output);
    } catch(e) { console.error(e.message); process.exitCode=1; }
  }
}
