// Professor Oraklet's daily literature research (LITERATURE-DAY.md). Runs without a person:
// the research pipeline in today's field, the agentic tree-search review queue and the
// citation-graph novelty check on its candidate, automatic Problem Bank registration of
// literature-backed catalog problems, and a Swedish report in ai-bus/ built only from saved
// reports. A failing stage is recorded and the day continues; nothing claims a discovery.
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { main as pipelineMain } from './research-pipeline.mjs';
import { main as treeMain } from './research-tree-planner.mjs';
import { main as noveltyMain } from './citation-novelty.mjs';
import { readRecentLiteratureReports } from './run-oraklet-proposals.mjs';
import { literatureProblemProposals } from './literature-problem-proposals.mjs';
import { makeCatalogProblem, createOrVerifyCatalogProblem } from './problem-bank-create-catalog.mjs';
import { createProblemBankClient } from './problem-bank.mjs';

// The fields Oraklet reads, one per day in turn.
export const LITERATURE_FIELDS = Object.freeze(['AI for scientific discovery', 'Causal inference']);
const FIELD_NAMES = Object.freeze({ 'AI for scientific discovery': 'AI för vetenskaplig upptäckt', 'Causal inference': 'Kausal inferens' });
export const DAILY_MODEL_BUDGET = 10;

export function fieldForDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')))
    throw Error('invalid_literature_day_date');
  return LITERATURE_FIELDS[Math.floor(Date.parse(date + 'T00:00:00Z') / 86_400_000) % LITERATURE_FIELDS.length];
}

// Literature-backed proposals for an automatic catalog experiment are registered; others wait for a person.
// Registration goes through createOrVerifyCatalogProblem, so a retired version is reported, never counted.
export async function registerLiteratureProblems(client, reports) {
  const results = [];
  for (const p of literatureProblemProposals(reports, { limit: 20 })) {
    const row = { id: p.id, experiment_id: p.experiment_id, research_question: p.literature.research_question,
      evidence_articles: p.literature.evidence_article_ids.length };
    const expected = makeCatalogProblem({ id: p.id, experimentId: p.experiment_id, domain: p.domain, difficulty: 2 });
    if (!p.automatic) {
      let existing = null;
      try { existing = await client.getProblem(p.id, expected.version); }
      catch (error) { if (error?.message !== 'problem_not_found') throw error; }
      results.push({ ...row, action: existing?.status === 'active' ? 'already_registered' : 'requires_human_approval' });
      continue;
    }
    try {
      const { created } = await createOrVerifyCatalogProblem(client, expected);
      results.push({ ...row, action: created ? 'registered' : 'already_registered' });
    } catch (error) {
      if (error?.message !== 'existing_problem_retired_create_new_version') throw error;
      results.push({ ...row, action: 'retired' });
    }
  }
  return results;
}

const LAB_DB = 'https://fmwxftnistkoqazfwnuj.supabase.co/rest/v1/oraklet_experiment';
// The lab's saved reports from the 24 hours before the given time (bounded).
export const LAB_REPORT_LIMIT = 20;
export async function readRecentLabReports(serviceKey, since, fetchImpl = fetch) {
  // One row more than shown reveals whether the day had more runs than the report lists.
  const url = `${LAB_DB}?select=rapport,skapad&skapad=gte.${encodeURIComponent(since)}&order=skapad.desc&limit=${LAB_REPORT_LIMIT + 1}`;
  const response = await fetchImpl(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) { await response.body?.cancel(); throw Error('lab_reports_unavailable'); }
  const text = await response.text();
  if (text.length > 20_000_000) throw Error('lab_reports_too_large');
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw Error('lab_reports_invalid');
  const runs = rows.slice(0, LAB_REPORT_LIMIT).map(r => r?.rapport).filter(Boolean).map(r => ({
    title: r.title ?? null, experimentId: r.experimentId ?? null, seed: r.seed ?? null, status: r.status ?? null,
    executionStatus: r.executionStatus ?? null, createdAt: r.createdAt ?? null,
    cases: Array.isArray(r.cases) ? r.cases.length : 0,
    passed: Array.isArray(r.cases) ? r.cases.filter(c => c?.passed === true).length : 0,
    problemBank: r.problemBank?.id ?? null,
    baseline: r.baseline?.status === 'completed' ? r.baseline.summary : r.baseline ? { status: r.baseline.status } : null,
  }));
  return { runs, truncated: rows.length > LAB_REPORT_LIMIT };
}

const fail = error => ({ status: 'error', code: /^[a-z_]{3,60}$/.test(error?.message ?? '') ? error.message : 'stage_failed' });
const stage = (p, name) => p?.stages?.find(s => s.name === name) ?? null;

export async function runLiteratureDay(env, { date, now = new Date().toISOString(), pipeline, tree, novelty, register, labReports }) {
  const field = fieldForDate(date);
  const day = { schema_version: 'oraklet-literature-day-1', date, field, model_budget: DAILY_MODEL_BUDGET };
  try {
    day.pipeline = await pipeline({ ...env, RESEARCH_AREA: field, PIPELINE_MODEL_BUDGET: String(DAILY_MODEL_BUDGET),
      PIPELINE_REQUEST_ID: '', RESEARCH_DASHBOARD_ENABLED: 'false' });
  } catch (error) { day.pipeline = fail(error); }
  const initialId = stage(day.pipeline, 'initial_evidence')?.report_id ?? null;
  const candidateId = day.pipeline?.candidate_id ?? null;
  if (initialId) {
    try { day.tree = await tree({ ...env, RESEARCH_TREE_REPORT_ID: initialId, RESEARCH_TREE_INPUT_FILE: '' }); }
    catch (error) { day.tree = fail(error); }
  }
  if (initialId && candidateId) {
    try { day.novelty = await novelty({ ...env, PLANNER_REPORT_ID: initialId, RESEARCH_CANDIDATE_ID: candidateId }); }
    catch (error) { day.novelty = fail(error); }
  }
  try { day.problem_bank = await register(env); } catch (error) { day.problem_bank = fail(error); }
  try { day.lab = await labReports(env, new Date(Date.parse(now) - 86_400_000).toISOString()); } catch (error) { day.lab = fail(error); }
  day.errors = ['pipeline', 'tree', 'novelty', 'problem_bank', 'lab'].filter(k => day[k]?.status === 'error');
  return day;
}

// Model and literature text is untrusted: one line, no Markdown, HTML or table syntax.
const md = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
  .replace(/[\\`*_[\]|#]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = v => Number.isInteger(v) && v >= 0 ? v : 0;
const STATUS = { completed: 'slutförd', partial: 'delvis slutförd', insufficient_evidence: 'otillräckligt underlag',
  insufficient_relevant_hits: 'inga tillräckligt relevanta uppföljningsträffar', insufficient_abstract_identifiers: 'inga hämtbara sammanfattningar',
  error: 'fel', review_required: 'granskningskö skapad', verification_required: 'kräver verifiering', invalid_evidence: 'underlaget avvisades',
  possible_overlap_found: 'möjlig överlappning hittad', no_overlap_found_within_budget: 'ingen överlappning hittad inom budgeten' };
const status = s => STATUS[s] ?? md(s ?? 'okänd', 60);

export function renderAiBus(day) {
  const p = day.pipeline ?? {}, collection = stage(p, 'collection')?.summary, initial = stage(p, 'initial_evidence')?.summary,
    final = stage(p, 'follow_up_evidence')?.summary;
  const analyzed = num(initial?.coverage?.summarized) + num(final?.coverage?.summarized);
  const papers = [...(initial?.papers ?? []), ...(final?.papers ?? [])];
  const findings = papers.reduce((n, x) => n + (x.findings?.length ?? 0), 0);
  const queue = Array.isArray(day.tree?.review_queue) ? day.tree.review_queue : [];
  const bank = Array.isArray(day.problem_bank) ? day.problem_bank : [];
  const lab = Array.isArray(day.lab?.runs) ? day.lab.runs : [];
  const labScope = day.lab?.truncated ? `de ${LAB_REPORT_LIMIT} senaste körningarna (fler kördes)` : 'senaste dygnet';
  const L = [`# Professor Oraklets dag – ${day.date}`, '',
    '*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*', '',
    '## Sammanfattning', '',
    `- **Fält i dag:** ${FIELD_NAMES[day.field] ?? md(day.field)}${p.query ? ` (sökfråga: ${md(p.query, 120)})` : ''}`,
    `- **Litteratur:** ${num(collection?.metadata?.returned_records)} träffar hittade, ${num(collection?.abstracts?.available)} sammanfattningar arkiverade, ${analyzed} sammanfattningar analyserade, ${findings} citerade fynd. Modellanrop: ${num(p.budget?.known_model_calls)} av ${day.model_budget}.`,
    `- **Ny hypoteskandidat:** ${p.candidate ? '1' : 'ingen'}${queue.length ? `; granskningskö med ${queue.length} förslag till studier` : ''}`,
    `- **Problem Bank:** ${bank.filter(b => b.action === 'registered').length} nya problem registrerade automatiskt, ${bank.filter(b => b.action === 'requires_human_approval').length} väntar på ditt godkännande`,
    `- **Experiment ${labScope}:** ${lab.length} körningar, ${lab.reduce((n, r) => n + r.passed, 0)} av ${lab.reduce((n, r) => n + r.cases, 0)} fall godkända`,
    ...(day.errors?.length ? [`- **Driftfel:** ${day.errors.map(e => md(e, 30)).join(', ')} (se nedan)`] : []), ''];

  L.push('## Litteratur', '', `Pipelinen: ${status(p.status)}.`, '');
  if (papers.length) {
    L.push('| Artikel | Status | Fynd |', '| --- | --- | --- |');
    for (const x of papers.slice(0, 20)) L.push(`| ${md(x.title, 160)} | ${md(x.status, 30)} | ${num(x.findings?.length)} |`);
    L.push('');
    const quoted = papers.flatMap(x => (x.findings ?? []).map(f => ({ ...f, title: x.title }))).slice(0, 8);
    if (quoted.length) {
      L.push('### Utdrag ur fynden', '');
      for (const f of quoted) L.push(`- **${md(f.kind, 30)}:** ${md(f.claim, 300)} *(${md(f.title, 100)})*`);
      L.push('');
    }
  } else L.push('Inga sammanfattningar analyserades i dag.', '');

  L.push('## Hypoteskandidat', '');
  if (p.candidate) {
    L.push(`**Fråga:** ${md(p.candidate.question, 500)}`, '', `**Hypotes:** ${md(p.candidate.hypothesis, 500)}`, '',
      `Underlag: ${num(p.candidate.evidence_articles)} artiklar, ${num(p.candidate.gap_review_count)} rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.`, '');
  } else L.push('Ingen kandidat med tillräckligt underlag i dag.', '');

  L.push('## Granskningskö (agentisk trädsökning)', '');
  if (day.tree?.status === 'error') L.push(`Trädsökningen misslyckades (${md(day.tree.code, 60)}).`, '');
  else if (!day.tree) L.push('Ingen evidensrapport att söka i.', '');
  else {
    L.push(`Status: ${status(day.tree.status)}.`, '');
    if (queue.length) {
      L.push('| # | Gren | Hypotes |', '| --- | --- | --- |');
      for (const r of queue.slice(0, 6)) L.push(`| ${num(r.rank)} | ${md(r.branch_kind, 30)} | ${md(r.hypothesis, 240)} |`);
      L.push('');
    }
  }

  L.push('## Nyhetskontroll (citeringsgraf)', '');
  if (day.novelty?.status === 'error') L.push(`Nyhetskontrollen misslyckades (${md(day.novelty.code, 60)}).`, '');
  else if (!day.novelty) L.push('Ingen kandidat att kontrollera.', '');
  else {
    L.push(`${status(day.novelty.novelty?.status)}; ${num(day.novelty.leads?.length)} senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.`, '');
    for (const l of (day.novelty.leads ?? []).slice(0, 5)) L.push(`- ${md(l.title, 200)} (${md(l.year ?? '?', 6)})`);
    if (day.novelty.leads?.length) L.push('');
  }

  L.push('## Problem Bank', '');
  if (day.problem_bank?.status === 'error') L.push(`Registreringen misslyckades (${md(day.problem_bank.code, 60)}).`, '');
  else if (!bank.length) L.push('Inga litteraturkandidater låg i samma område som ett katalogexperiment.', '');
  else {
    const label = { registered: 'registrerad i dag', already_registered: 'redan registrerad', requires_human_approval: 'väntar på godkännande (manuellt experiment)',
      retired: 'pensionerad version; kräver en ny version innan labbet kan använda den' };
    for (const b of bank) L.push(`- \`${md(b.id, 80)}\` → \`${md(b.experiment_id, 60)}\`: ${label[b.action]}. Litteratur: ${md(b.research_question, 200)} (${num(b.evidence_articles)} artiklar)`);
    L.push('', 'Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.', '');
  }

  L.push(`## Experiment ${labScope}`, '');
  if (day.lab?.status === 'error') L.push(`Labbrapporterna kunde inte läsas (${md(day.lab.code, 60)}).`, '');
  else if (!lab.length) L.push('Inga experiment kördes.', '');
  else {
    L.push('| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |', '| --- | --- | --- | --- | --- |');
    for (const r of lab) {
      const b = r.baseline;
      const bare = !b ? '–' : b.pairs !== undefined ? `${num(b.labPassed)}/${num(b.barePassed)} av ${num(b.pairs)}` : md(b.status, 30);
      L.push(`| ${md(r.experimentId ?? r.title, 60)} | ${md(r.seed, 12)} | ${r.executionStatus === 'error' ? 'driftfel' : md(r.status, 20)} | ${r.passed} av ${r.cases} | ${bare} |`);
    }
    L.push('');
  }

  L.push('## Begränsningar', '',
    '- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.',
    '- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.',
    '- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.', '');
  return L.join('\n');
}

export async function main(env = process.env, { now = new Date().toISOString(), deps = {} } = {}) {
  const date = now.slice(0, 10);
  const pipeline = deps.pipeline ?? (async e => {
    // The pipeline writes its report before it throws on a failed stage; that report is the record.
    try { return await pipelineMain(e); } catch { return JSON.parse(await readFile('reports/research-pipeline/pipeline.json', 'utf8')); }
  });
  // Every Problem Bank request fails within a bounded interval, as in open-problems.mjs.
  const bounded = (url, options = {}) => fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(15000) });
  const register = deps.register ?? (async e => registerLiteratureProblems(
    createProblemBankClient({ url: e.SUPABASE_URL, secretKey: e.SUPABASE_SECRET_KEY, fetchImpl: bounded }),
    await readRecentLiteratureReports({ url: e.SUPABASE_URL, secretKey: e.SUPABASE_SECRET_KEY })));
  const labReports = deps.labReports ?? ((e, since) => readRecentLabReports(e.SUPABASE_SERVICE_ROLE_KEY, since));
  const day = await runLiteratureDay(env, { date, now, pipeline, register, labReports,
    tree: deps.tree ?? treeMain, novelty: deps.novelty ?? (e => noveltyMain(e)) });
  const markdown = renderAiBus(day);
  await mkdir('reports/literature-day', { recursive: true });
  await writeFile('reports/literature-day/day.json', JSON.stringify(day, null, 2) + '\n');
  await mkdir('ai-bus', { recursive: true });
  await writeFile(`ai-bus/${date}.md`, markdown);
  await writeFile('ai-bus/senaste.md', markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown);
  console.log(JSON.stringify({ date, field: day.field, pipeline: day.pipeline?.status ?? null, errors: day.errors }));
  return day;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(day => { if (day.errors.length) process.exitCode = 2; })
    .catch(() => { console.error('Literature day failed before its report was written.'); process.exitCode = 1; });
}
