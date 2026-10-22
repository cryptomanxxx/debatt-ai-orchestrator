import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readJson } from './lab-client.mjs';
import { digest } from './act-map.mjs';

// VEM-Sci register (research/ACT-MAP-LAB.md): every answer Oraklet gives in the lab is a claim.
// It is "proposed", goes "under_test", and only the experiment's own independent verifier moves it
// to provisionally_supported, rejected or unresolved. The runner derives these records from the
// verified cases; a model answer never writes its own status. They are saved with the report in
// oraklet_experiment, so they form Oraklet's memory across runs.
export const VEM_SCHEMA = 'vem-sci-register-v1';
export const VEM_STATUSES = Object.freeze(['provisionally_supported', 'rejected', 'unresolved']);

export function vemClaims(report) {
  const claims = [];
  for (const c of Array.isArray(report?.cases) ? report.cases : []) {
    const base = { experimentId: report.experimentId ?? null, seed: report.seed ?? null, case: c?.case ?? null };
    // An experiment with its own epistemic record (ACT-MAP) supplies it; null means no claim was made.
    if (c && Object.hasOwn(c, 'vem')) {
      if (c.vem) claims.push({ ...base, ...c.vem });
      continue;
    }
    if (typeof c?.passed !== 'boolean') continue;
    const verified = c.hypothesisTest ? c.hypothesisTest.independentlyVerified !== false : true;
    const statusOf = passed => !verified ? 'unresolved' : passed ? 'provisionally_supported' : 'rejected';
    // The verifier's results live in different fields per experiment (evidence, ratfit, rankscreen,
    // ...), so the claim is bound to the whole verified case except the model's own answer.
    const verifiedCase = Object.fromEntries(Object.entries(c).filter(([k]) => !['proposal', 'provider', 'model', 'attempts'].includes(k)));
    const claim = (proposal, passed, attempt) => {
      const status = statusOf(passed);
      return { ...base, ...(attempt ? { attempt } : {}), claimId: digest({ ...base, attempt: attempt ?? null, proposal: proposal ?? null }), kind: 'answer',
        transitions: ['proposed', 'under_test', status], status, evidenceSha256: digest(verifiedCase),
        verifier: c.hypothesisTest?.verificationScope ?? report.toolId ?? null };
    };
    // A verified first answer that was then corrected is its own claim (Ratfit feedback).
    if (Array.isArray(c.attempts) && c.attempts.length > 1 && typeof c.initialPassed === 'boolean') {
      claims.push(claim(c.attempts[0]?.proposal, c.initialPassed, 'initial'), claim(c.proposal ?? c.design, c.passed, 'final'));
    } else claims.push(claim(c.proposal ?? c.design, c.passed));
  }
  return claims;
}

export function vemState(report) {
  const claims = vemClaims(report);
  return { schema: VEM_SCHEMA, claims, counts: Object.fromEntries(VEM_STATUSES.map(s => [s, claims.filter(c => c.status === s).length])) };
}

export function vemLine(state) {
  if (!state?.claims?.length) return '';
  const { provisionally_supported: s, rejected: r, unresolved: u } = state.counts;
  return `\nVEM-Sci: ${state.claims.length} påståenden i registret: ${s} preliminärt stödda, ${r} avvisade, ${u} olösta.\n`;
}

// The register across saved runs: rows are {skapad, experimentId, vem} from oraklet_experiment.
export function vemRegisterSummary(rows) {
  const experiments = new Map();
  let runs = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.vem?.schema !== VEM_SCHEMA || !Array.isArray(row.vem.claims)) continue;
    runs++;
    for (const claim of row.vem.claims) {
      if (!VEM_STATUSES.includes(claim?.status)) continue;
      const id = typeof claim.experimentId === 'string' ? claim.experimentId : row.experimentId ?? 'okänt';
      const e = experiments.get(id) ?? { experimentId: id, provisionally_supported: 0, rejected: 0, unresolved: 0, abstentions: 0, noAnswers: 0, latest: null };
      e[claim.status]++;
      if (claim.kind === 'abstention') e.abstentions++;
      if (claim.kind === 'no_answer') e.noAnswers++;
      if (!e.latest || String(row.skapad) > e.latest) e.latest = String(row.skapad ?? '');
      experiments.set(id, e);
    }
  }
  const list = [...experiments.values()].sort((a, b) => a.experimentId < b.experimentId ? -1 : 1);
  const total = s => list.reduce((n, e) => n + e[s], 0);
  return { schema: VEM_SCHEMA, runs, experiments: list,
    totals: Object.fromEntries(VEM_STATUSES.map(s => [s, total(s)])) };
}

export function vemRegisterMarkdown(summary, { limit } = {}) {
  const t = summary.totals;
  return '# Oraklets VEM-Sci-register\n\n'
    + `${summary.runs} sparade körningar${limit ? ` (de senaste ${limit} med register lästes)` : ''}. `
    + `Påståenden: ${t.provisionally_supported} preliminärt stödda, ${t.rejected} avvisade, ${t.unresolved} olösta. `
    + 'Bara experimentets egen oberoende verifiering flyttar ett påstående; "preliminärt stött" gäller bara det testade fallet.\n\n'
    + (summary.experiments.length
      ? '| Experiment | Preliminärt stödda | Avvisade | Olösta (avstått / utan svar) | Senast |\n| --- | --- | --- | --- | --- |\n'
        + summary.experiments.map(e => `| ${e.experimentId} | ${e.provisionally_supported} | ${e.rejected} | ${e.unresolved} (${e.abstentions} / ${e.noAnswers ?? 0}) | ${e.latest?.slice(0, 10) ?? ''} |`).join('\n') + '\n'
      : 'Inga körningar med register ännu.\n');
}

// What the planner learns from the register. Each experiment's claims are [provisionally
// supported, rejected, unresolved]. Its learning priority is the smoothed share of claims that did
// not hold, (rejected + unresolved + 1) / (claims + 2): an experiment without claims scores 0.5,
// repeated failures score higher and repeated support lower. The lab computes it, not the model.
export const learningPriority = ([s, r, u] = [0, 0, 0]) => (r + u + 1) / (s + r + u + 2);
const claimsOf = e => [e.provisionally_supported, e.rejected, e.unresolved];
// {experimentId: [s, r, u]} for the given experiments that have claims, highest priority first.
export function vemKnowledge(summary, experimentIds) {
  const byId = new Map((summary?.experiments ?? []).map(e => [e.experimentId, claimsOf(e)]));
  return Object.fromEntries(experimentIds.filter(id => byId.has(id)).map(id => [id, byId.get(id)])
    .sort(([a, x], [b, y]) => learningPriority(y) - learningPriority(x) || (a < b ? -1 : 1)));
}
// How the planner's choice relates to the register: its claims, its learning priority and its
// rank among the offered experiments (1 = nothing had a higher priority).
export function knowledgeChoice(knowledge, experimentIds, chosen) {
  const priority = learningPriority(knowledge[chosen]);
  return { claims: knowledge[chosen] ?? null, priority: Math.round(priority * 1e4) / 1e4,
    rank: 1 + experimentIds.filter(id => learningPriority(knowledge[id]) > priority).length, of: experimentIds.length };
}
export function knowledgeLine(k) {
  if (!k) return '';
  if (k.unavailable) return '\nKunskapsminne: VEM-Sci-registret kunde inte läsas; planeringen valde utan det.\n';
  const claims = k.claims ? `${k.claims[0]}/${k.claims[1]}/${k.claims[2]} (stödda/avvisade/olösta)` : 'inga tidigare påståenden';
  const shown = k.shown?.omitted ? ` Planeringen såg ${k.shown.entries} poster (${k.shown.omitted} utelämnade för utrymmet)${k.claims && !k.shown.chosenShown ? '; det valda experimentets post var bland de utelämnade' : ''}.` : '';
  return `\nKunskapsminne: planeringen såg registret från ${k.runs} körningar. Valt experiment: ${claims}; lärprioritet ${k.priority}, plats ${k.rank} av ${k.of}.${shown}\n`;
}

export const REGISTER_LIMIT = 200;
const DB = 'https://fmwxftnistkoqazfwnuj.supabase.co/rest/v1/oraklet_experiment';
export async function readVemRegister(serviceKey, fetchImpl = fetch) {
  const response = await fetchImpl(`${DB}?select=skapad,experimentId:rapport->>experimentId,vem:rapport->vem&rapport->vem=not.is.null&order=skapad.desc&limit=${REGISTER_LIMIT}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('vem_register_unavailable'); }
  const rows = await readJson(response, 8_000_000);
  if (!Array.isArray(rows)) throw new Error('vem_register_unavailable');
  return rows;
}

// CLI: reads the register after a lab run and writes it to the artifact and the step summary.
// A read failure is reported but never fails the lab run.
export async function main(env = process.env, fetchImpl = fetch) {
  const directory = 'reports/oraklet-lab';
  await mkdir(directory, { recursive: true });
  let markdown;
  try {
    const summary = vemRegisterSummary(await readVemRegister(env.SUPABASE_SERVICE_ROLE_KEY || '', fetchImpl));
    await writeFile(`${directory}/vem-register.json`, JSON.stringify(summary, null, 2));
    markdown = vemRegisterMarkdown(summary, { limit: REGISTER_LIMIT });
  } catch {
    markdown = '# Oraklets VEM-Sci-register\n\nRegistret kunde inte läsas den här gången; körningens egna påståenden finns i rapporten.\n';
  }
  await writeFile(`${directory}/vem-register.md`, markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, '\n' + markdown);
  console.log(markdown);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
