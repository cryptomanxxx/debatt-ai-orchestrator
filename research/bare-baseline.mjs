// The bare arm (BARE-BASELINE.md). After a completed lab run, the same model answers the same cases
// once more with only the task definition, the data and the answer format: no persona, no method
// guidance or protocol rationale, no calibration rule, feedback or correction. Each answer is scored
// with the experiment's own pass rule against the evidence the lab run produced, re-verified here.
import { createHash } from 'node:crypto';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { ResearchError, diagnostic } from './errors.mjs';
import { createLabClient, readJson } from './lab-client.mjs';
import { checkHoldoutProposal, trainingContext, validateHoldout, holdoutPasses, CLASSES } from './perturbseq-holdout.mjs';
import { parseSympyProposal, validateSympy, sympyPasses } from './sympy.mjs';
import { parseDowhyProposal, validateDowhy, dowhyPasses, DOWHY_PROTOCOL } from './dowhy.mjs';

// Frozen before the first bare run; its SHA-256 is stored with every bare result.
export const BARE_ANALYSIS_PLAN = 'Bare-baseline v1. Primärt mått per experiment och modell: andelen godkända fall i labbet (slutligt förslag efter labbets eventuella korrigering) minus andelen godkända fall i den raka varianten, över parade fall från samma körning, samma seed och samma modellidentitet. Test: exakt tvåsidigt McNemar-test på de diskordanta paren, alfa 0,05. Ingen slutsats dras före 30 parade fall per experiment och modell. Alla parade fall räknas; ett svar i den raka varianten som inte går att tolka räknas som underkänt och redovisas även separat som formatfel. Körningar där den raka varianten fick en annan modellidentitet räknas inte. Sekundärt mått: labbets första förslag (före korrigering) mot den raka varianten.';
export const BARE_PROTOCOL = Object.freeze({ id: 'bare-baseline-v1',
  analysisPlanSha256: createHash('sha256').update(BARE_ANALYSIS_PLAN).digest('hex') });
export const MIN_PAIRS = 30;

const json = format => `Svara endast med JSON i formatet ${format}.`;
// Per experiment: the task as a plain request, the experiment's parser, and its pass rule applied to
// lab evidence that is re-verified first (a forged or edited report fails before any model call).
export const BARE_ARMS = Object.freeze({
  'perturbseq-holdout': {
    verify: c => validateHoldout(c.evidence, { genes: c.data.genes }),
    messages: (c, report) => [
      { role: 'system', content: 'Förutsäg för varje gen hur många gener som ändrar uttryck (DEG, BH-justerat Wilcoxon p < 0.05) i talamiska glutamaterga neuroner (151 TH Prkcd Grin2c Glut) när genen slås ut med CRISPR i mushjärna: "none" = 0 DEG, "weak" = 1–49 DEG, "strong" = minst 50 DEG. '
        + json(JSON.stringify({ predictions: { GenA: CLASSES[0], GenB: CLASSES[1] }, reason: '...' })) },
      { role: 'user', content: JSON.stringify({ training: { ...trainingContext(report.seed), note: 'strongest och sample är [gen, DEG-antal] för andra utslagningar i samma celltyp.' }, genes: c.data.genes }) },
    ],
    parse: (text, c) => checkHoldoutProposal(text, c.data.genes),
    passes: (proposal, measured) => holdoutPasses(proposal.predictions, measured).passed,
  },
  'sympy-quadratic': {
    verify: c => validateSympy(c.evidence, c.data),
    messages: c => [
      { role: 'system', content: 'Lös a*x^2+b*x+c=0 över reella tal. Ange alla distinkta reella rötter som kanoniska rationella strängar (t.ex. "-2", "1/2"), tom lista om inga reella rötter finns. ' + json('{"method":"sympy","roots":[...],"reason":"..."}') },
      { role: 'user', content: JSON.stringify({ coefficients: c.data.coefficients }) },
    ],
    parse: text => { const proposal = parseSympyProposal(text); return proposal ? { proposal } : { problem: 'invalid_answer' }; },
    passes: sympyPasses,
  },
  'dowhy-backdoor': {
    verify: c => validateDowhy(c.evidence, c.data),
    messages: c => [
      { role: 'system', content: 'Ange justeringsvariabler och effekten av do(t=1) minus do(t=0) under det givna orsaksdiagrammet och en linjär additiv modell. ' + json('{"method":"dowhy","adjustment":[] eller ["z"],"effect":tal,"reason":"..."}') },
      { role: 'user', content: JSON.stringify({ graph: DOWHY_PROTOCOL.graph, columns: ['z', 't', 'y'], rows: c.data.rows }) },
    ],
    parse: text => { const proposal = parseDowhyProposal(text); return proposal ? { proposal } : { problem: 'invalid_answer' }; },
    passes: dowhyPasses,
  },
});

const tally = cases => ({ pairs: cases.length,
  labPassed: cases.filter(c => c.labPassed).length, barePassed: cases.filter(c => c.barePassed).length,
  labOnly: cases.filter(c => c.labPassed && !c.barePassed).length,
  bareOnly: cases.filter(c => !c.labPassed && c.barePassed).length,
  bareFormatFailures: cases.filter(c => c.formatProblem).length });

// One bare answer per lab case, with one shared locked identity that must match the lab's.
export async function runBareBaseline(report, propose) {
  const base = { protocol: BARE_PROTOCOL, experimentId: report?.experimentId ?? null };
  if (report?.executionStatus !== 'completed' || !Array.isArray(report.cases) || !report.cases.length)
    return { ...base, status: 'skipped', reason: 'lab_run_not_completed' };
  const arm = BARE_ARMS[report.experimentId];
  if (!arm) return { ...base, status: 'unsupported' };
  const lab = report.cases[0], cases = [];
  try {
    for (const c of report.cases) {
      const measured = arm.verify(c);
      const ai = await propose(arm.messages(c, report));
      if (ai.provider !== lab.provider || ai.model !== lab.model)
        return { ...base, status: 'model_mismatch', lab: { provider: lab.provider, model: lab.model }, cases };
      const { proposal, problem } = arm.parse(ai.text, c);
      cases.push({ case: c.case, labPassed: c.passed === true, labInitialPassed: c.initialPassed === true,
        barePassed: proposal ? arm.passes(proposal, measured) : false, formatProblem: problem ?? null, proposal: proposal ?? null });
    }
  } catch (error) {
    return { ...base, status: 'error', failure: diagnostic(error, { case: cases.length + 1 }), provider: lab.provider, model: lab.model,
      cases, summary: tally(cases) };
  }
  return { ...base, status: 'completed', provider: lab.provider, model: lab.model, cases, summary: tally(cases) };
}

// Exact two-sided McNemar test: binomial(b + c, 1/2) on the discordant pairs.
export function mcnemarExact(b, c) {
  const n = b + c;
  if (!n) return 1;
  let logChoose = 0, tail = 0;
  for (let k = 0; k <= Math.min(b, c); k++) {
    if (k) logChoose += Math.log(n - k + 1) - Math.log(k);
    tail += Math.exp(logChoose - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

// Pools completed bare results per experiment and model across saved lab reports.
export function bareBaselineSummary(reports) {
  const groups = new Map();
  for (const report of Array.isArray(reports) ? reports : []) {
    const b = report?.baseline;
    if (b?.status !== 'completed' || b.protocol?.analysisPlanSha256 !== BARE_PROTOCOL.analysisPlanSha256 || !Array.isArray(b.cases)) continue;
    const root = report.plan?.modelChoice?.root;
    const key = `${b.experimentId} · ${b.provider} / ${b.model}` + (typeof root === 'string' && root ? ` (${root})` : '');
    const g = groups.get(key) ?? { group: key, experimentId: b.experimentId, runs: 0, cases: [] };
    g.runs++;
    g.cases.push(...b.cases.filter(c => typeof c?.labPassed === 'boolean' && typeof c?.barePassed === 'boolean'));
    groups.set(key, g);
  }
  const round = v => Math.round(v * 1e4) / 1e4;
  return [...groups.values()].filter(g => g.cases.length).map(g => {
    const t = tally(g.cases), p = mcnemarExact(t.labOnly, t.bareOnly);
    return { group: g.group, experimentId: g.experimentId, runs: g.runs, ...t,
      labRate: round(t.labPassed / t.pairs), bareRate: round(t.barePassed / t.pairs),
      labInitialRate: round(g.cases.filter(c => c.labInitialPassed).length / t.pairs),
      difference: round((t.labPassed - t.barePassed) / t.pairs), mcnemarP: round(p),
      verdict: t.pairs < MIN_PAIRS ? 'too_few_pairs' : p >= 0.05 ? 'no_detected_difference'
        : t.labOnly > t.bareOnly ? 'lab_better' : 'bare_better' };
  }).sort((a, b) => a.group < b.group ? -1 : 1);
}

const VERDICT = { too_few_pairs: `för få par (minst ${MIN_PAIRS} krävs)`, no_detected_difference: 'ingen påvisad skillnad',
  lab_better: 'labbet bättre', bare_better: 'rak fråga bättre' };
export function bareSummaryMarkdown(summary) {
  const lines = ['# Labbet mot rak fråga', '',
    'Samma modell och samma fall, med och utan labbet. Exakt McNemar-test på parade fall enligt den låsta analysplanen (' + BARE_PROTOCOL.id + ').', ''];
  if (!summary.length) return lines.concat('Inga parade körningar ännu.', '').join('\n');
  lines.push('| Experiment och modell | Par | Labbet | Labbet, första förslag | Rak fråga | Bara labbet / bara rak | p | Slutsats |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const g of summary) lines.push(`| ${g.group} | ${g.pairs} | ${g.labRate} | ${g.labInitialRate} | ${g.bareRate} | ${g.labOnly} / ${g.bareOnly} | ${g.mcnemarP} | ${VERDICT[g.verdict]} |`);
  return lines.concat('').join('\n');
}

export function bareRunMarkdown(baseline) {
  if (baseline.status === 'unsupported' || baseline.status === 'skipped') return '';
  const head = `\n## Rak fråga (samma modell utan labbet)\n\n`;
  if (baseline.status === 'model_mismatch') return head + 'Den raka varianten fick en annan modellidentitet än labbet; körningen räknas inte som par.\n';
  const s = baseline.summary;
  return head + (baseline.status === 'error' ? `Avbröts: ${JSON.stringify(baseline.failure)}. ` : '')
    + `Godkända: labbet ${s.labPassed}/${s.pairs}, rak fråga ${s.barePassed}/${s.pairs}; formatfel i rak fråga: ${s.bareFormatFailures}.\n\n`
    + '| Fall | Labbet | Rak fråga | Formatfel |\n| --- | --- | --- | --- |\n'
    + baseline.cases.map(c => `| ${c.case} | ${c.labPassed ? 'Godkänt' : 'Underkänt'} | ${c.barePassed ? 'Godkänt' : 'Underkänt'} | ${c.formatProblem ?? '–'} |`).join('\n') + '\n';
}

const DB = 'https://fmwxftnistkoqazfwnuj.supabase.co/rest/v1/oraklet_experiment';
if (process.argv[1]?.endsWith('/bare-baseline.mjs')) {
  const key = process.env.ORCHESTRATOR_API_KEY || '', serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (key.length < 24 || !serviceKey) throw new Error('Orchestrator- och databasnycklar krävs');
  const path = 'reports/oraklet-lab/report.json';
  const report = JSON.parse(await readFile(path, 'utf8'));
  // The bare arm has its own seven-call budget and calls the lab run's model the same way.
  const client = createLabClient({ key });
  const choice = report.plan?.modelChoice;
  const propose = choice ? client.researchProposer({ provider: choice.provider, model: choice.model, root: choice.root })
    : client.proposer(report.modelMode ?? 'default');
  const baseline = await runBareBaseline(report, propose);
  await writeFile('reports/oraklet-lab/baseline.json', JSON.stringify({ ...baseline, modelCalls: client.modelCalls() }, null, 2));
  const markdown = bareRunMarkdown(baseline);
  if (process.env.GITHUB_STEP_SUMMARY && markdown) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log('Rak fråga:', baseline.status, baseline.summary ? JSON.stringify(baseline.summary) : '');
  if (['completed', 'model_mismatch', 'error'].includes(baseline.status)) {
    // The saved report gains the bare result; the lab's own fields are unchanged.
    const saved = await fetch(`${DB}?id=eq.${encodeURIComponent(report.reportId)}&select=id`, { method: 'PATCH',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ rapport: { ...report, baseline } }), redirect: 'error', signal: AbortSignal.timeout(10000) });
    let rows = null;
    try { rows = saved.ok ? await readJson(saved) : (await saved.body?.cancel(), null); } catch { rows = null; }
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Den raka varianten kunde inte sparas på rapporten; resultatet finns i artefakten');
  }
  if (baseline.status === 'error') throw new ResearchError(baseline.failure.code);
}
