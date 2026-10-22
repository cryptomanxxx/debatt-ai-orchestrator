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
      const e = experiments.get(id) ?? { experimentId: id, provisionally_supported: 0, rejected: 0, unresolved: 0, abstentions: 0, latest: null };
      e[claim.status]++;
      if (claim.kind === 'abstention') e.abstentions++;
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
      ? '| Experiment | Preliminärt stödda | Avvisade | Olösta (varav avstått) | Senast |\n| --- | --- | --- | --- | --- |\n'
        + summary.experiments.map(e => `| ${e.experimentId} | ${e.provisionally_supported} | ${e.rejected} | ${e.unresolved} (${e.abstentions}) | ${e.latest?.slice(0, 10) ?? ''} |`).join('\n') + '\n'
      : 'Inga körningar med register ännu.\n');
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
