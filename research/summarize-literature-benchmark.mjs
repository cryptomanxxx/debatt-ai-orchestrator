import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { safeSourceUrl, normalizeDoi } from './literature-benchmark.mjs';

const clean=s=>String(s).replace(/[\r\n\s]+/g,' ').slice(0,400)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/[\\`*_[\]{}|]/g,c=>'\\'+c);
const link=(label,url)=>{
  const safe=safeSourceUrl(url);
  return safe ? '['+clean(label)+']('+safe.replace(/[()<>"'|\\[\]]/g,c=>'%'+c.charCodeAt(0).toString(16))+')' : '—';
};

export function formatBenchmarkSummary(report) {
  if (!report || !Array.isArray(report.results)) throw new Error('Invalid benchmark report');
  const rows=['## Literature source benchmark', '', '| Query | Source | Status | Papers | Abstracts | OA signals | Latency (ms) | Attempts | HTTP status |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const item of report.results) {
    for (const source of report.sourceNames ?? ['openalex','semantic-scholar']) {
      const v=item.sources?.[source];
      if (!v) throw new Error('Missing source result');
      rows.push('| '+[clean(item.query),clean(source),v.status,v.records??'—',v.withAbstract??'—',
        v.withOpenAccessSignal??'—',v.latencyMs??'—',v.attempts??'—',v.httpStatus??'—'].join(' | ')+' |');
    }
  }
  for (const item of report.results) {
    rows.push('', '### '+clean(item.query));
    for (const source of report.sourceNames ?? ['openalex','semantic-scholar']) {
      const v=item.sources[source];
      // Older aggregate-only artifacts remain readable.
      if (!Array.isArray(v.papers)) continue;
      rows.push('', '**'+clean(source)+(source==='arxiv'?' (preprint repository; newest submissions first)':'')+'**', '',
        '| Title | DOI | Source |', '| --- | --- | --- |');
      for (const paper of v.papers.slice(0,20)) {
        const doi=normalizeDoi(paper.doi);
        rows.push('| '+clean(paper.title)+' | '+(doi?link(doi,'https://doi.org/'+doi):'—')+' | '+link('View',paper.sourceUrl)+' |');
      }
      if (!v.papers.length) rows.push('| No returned records | — | — |');
      if (v.papers.length>20) rows.push('', 'First 20 records shown; all returned records are in the JSON artifact.');
    }
  }
  rows.push('', 'Metadata coverage indicators only. Provider errors are not zero search results. No relevance or novelty ground truth.');
  return rows.join('\n')+'\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(formatBenchmarkSummary(JSON.parse(await readFile(process.argv[2],'utf8')))); }
  catch (e) { console.error(e.message); process.exitCode=1; }
}
