// Reads the newest saved lab reports (bounded) and writes the per-model calibration summary.
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { calibrationSummary, calibrationMarkdown } from './calibration.mjs';
import { bareBaselineSummary, bareSummaryMarkdown } from './bare-baseline.mjs';

const DB = 'https://fmwxftnistkoqazfwnuj.supabase.co/rest/v1/oraklet_experiment';
export async function readReports(serviceKey, fetchImpl = fetch, limit = 200) {
  const response = await fetchImpl(`${DB}?select=rapport&order=skapad.desc&limit=${limit}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('reports_unavailable'); }
  const text = await response.text();
  if (text.length > 20_000_000) throw new Error('reports_too_large');
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error('reports_invalid');
  return rows.map(r => r?.rapport).filter(Boolean);
}

if (process.argv[1]?.endsWith('/calibration-summary.mjs')) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key) throw new Error('Databasnyckel krävs');
  const reports = await readReports(key);
  const summary = calibrationSummary(reports), bare = bareBaselineSummary(reports);
  const markdown = calibrationMarkdown(summary) + '\n' + bareSummaryMarkdown(bare);
  await mkdir('reports/calibration', { recursive: true });
  await writeFile('reports/calibration/summary.json', JSON.stringify(summary, null, 2));
  await writeFile('reports/calibration/bare-baseline.json', JSON.stringify(bare, null, 2));
  await writeFile('reports/calibration/summary.md', markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log('Kalibrerade modeller:', summary.length, 'Parade grupper labbet/rak fråga:', bare.length);
}
