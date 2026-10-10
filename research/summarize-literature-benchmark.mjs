import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function formatBenchmarkSummary(report) {
  if (!report || !Array.isArray(report.results)) throw new Error('Invalid benchmark report');
  const rows=['## Literature source benchmark', '', '| Query | Source | Status | Papers | Abstracts | OA signals | Latency (ms) |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: |'];
  for (const item of report.results) {
    for (const source of ['openalex','semantic-scholar']) {
      const v=item.sources?.[source];
      if (!v) throw new Error('Missing source result');
      const clean=s=>String(s).replace(/[|\r\n]/g,' ').slice(0,90);
      rows.push('| '+[clean(item.query),source,v.status,v.records??'—',v.withAbstract??'—',
        v.withOpenAccessSignal??'—',v.latencyMs??'—'].join(' | ')+' |');
    }
  }
  rows.push('', 'Metadata coverage indicators only. Provider errors are not zero search results. No relevance or novelty ground truth.');
  return rows.join('\n')+'\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(formatBenchmarkSummary(JSON.parse(await readFile(process.argv[2],'utf8')))); }
  catch (e) { console.error(e.message); process.exitCode=1; }
}
