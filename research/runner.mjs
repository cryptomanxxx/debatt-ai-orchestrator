import { runWaterExperiment, callWater, waterSummary, waterMarkdown } from './shallow-water.mjs';
import { ResearchError, diagnostic } from './errors.mjs';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { CATALOG, choosePlan } from './catalog.mjs';
import { createLabClient, readJson } from './lab-client.mjs';
import { loadResearchChoices, chosenResearchModel } from './lab-models.mjs';
import { loadOpenProblems } from './open-problems.mjs';
import { startBankResearchRun, finishBankResearchRun } from './problem-bank-research-loop.mjs';
import { researchStateFromOrakletReport } from './oraklet-problem-bank.mjs';
import { calibrated, markProgress, calibrationReport } from './calibration.mjs';
import { runExperiment } from './ratfit.mjs';
import { runRankExperiment, callRankscreen } from './rankscreen.mjs';
import { runScienceExperiment } from './science.mjs';
import { callScienceTool } from './python-tools.mjs';
import { runPymcExperiment, callPymc } from './pymc.mjs';
import { runSympyExperiment, callSympy } from './sympy.mjs';
import { runSklearnExperiment, callSklearn } from './sklearn.mjs';
import { runDowhyExperiment, callDowhy } from './dowhy.mjs';
import { runAr1DesignExperiment } from './ar1-design.mjs';

import { runGlucoseExperiment, callGlucose } from './glucose.mjs';
import { runGlucoseRobustnessExperiment, callGlucoseRobustness, glucoseRobustnessMarkdown } from './glucose-robustness.mjs';
import { runTemperatureExperiment, callTemperature, temperatureSummary, temperatureMarkdown } from './glucose-temperature.mjs';

import { runWarmingExperiment, callWarming, warmingSummary, warmingMarkdown } from './insulin-warming.mjs';

import { runCurveShapeExperiment, callCurveShape, curveSummary, curveMarkdown } from './insulin-curve-shape.mjs';

import { runExternalCurveExperiment, callExternalCurve, externalSummary, externalMarkdown } from './insulin-external-curve.mjs';

import { runHoldoutExperiment, callHoldout, holdoutSummary, holdoutMarkdown } from './perturbseq-holdout.mjs';
import { runActMapExperiment, callActMap, actMapSummary, actMapMarkdown, ACT_MAP_PROTOCOL } from './act-map.mjs';
import { runActMapTreeExperiment, actMapTreeSummary, actMapTreeMarkdown, ACT_MAP_TREE_PROTOCOL } from './act-map-tree.mjs';
import { vemState, vemLine, readVemRegister, vemRegisterSummary, vemKnowledge, knowledgeChoice, knowledgeLine, VEM_SCHEMA } from './vem-sci.mjs';

// Catalog viewing needs no model or database credentials.
if (process.env.EXPERIMENT === 'catalog-only') {
  await import('./show-catalog.mjs');
  process.exit(0);
}

const API = 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/query';
const DB = 'https://fmwxftnistkoqazfwnuj.supabase.co/rest/v1/oraklet_experiment';
const key = process.env.ORCHESTRATOR_API_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (key.length < 24 || !serviceKey) throw new Error('Orchestrator- och databasnycklar krävs');
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const directory = 'reports/oraklet-lab';
const completionTokenLimit = 4096;
await mkdir(directory, { recursive: true });


// Read only bounded summaries, never complete old datasets or hidden points.
const historyResponse = await fetch(`${DB}?select=titel,status,seed:rapport->>seed,experimentId:rapport->>experimentId&order=skapad.desc&limit=10`,
  { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
if (!historyResponse.ok) { await historyResponse.body?.cancel(); throw new Error('Labbet saknar databasåtkomst'); }
const history = await readJson(historyResponse);
if (!Array.isArray(history) || history.length > 10) throw new Error('Ogiltig historik');

// The workflow sets the spacing between model calls and the pause before repeating a request
// that failed transiently (lab-client.mjs); both default to 0 for local runs and tests.
const millis = name => /^\d{1,6}$/.test(process.env[name] || '') ? Number(process.env[name]) : 0;
const lab = createLabClient({ key, api: API, completionTokenLimit, spacingMs: millis('LAB_SPACING_MS'), retryDelayMs: millis('LAB_RETRY_DELAY_MS') });
const { query, proposer, researchProposer } = lab;
let toolCalls = 0;
// Every mode shares the seven-call ceiling. Each proposer locks its own provider/model identity.
const planningPropose = proposer('default');

// The planner may choose the reasoning model only when the orchestrator reports one configured.
async function plannerModelModes() {
  try {
    const response = await fetch(API.replace(/\/v1\/query$/, '/v1/model-profile'), {
      headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); return ['default']; }
    const profile = await readJson(response, 4096);
    return profile?.reasoningAvailable === true ? ['default', 'reasoning'] : ['default'];
  } catch { return ['default']; }
}
const callTool = async input => {
  if (++toolCalls > 6) throw new ResearchError('tool_budget_exceeded');
  return query({ tool: 'bootloops_ratfit', input });
};

const selection = process.env.EXPERIMENT || 'auto';
const seed = process.env.EXPERIMENT_SEED || new Date().toISOString().slice(0, 10).replaceAll('-', '');
const reportId = randomUUID();
const metadata = { createdAt: new Date().toISOString(), inferenceSettings: { completionTokenLimit }, codeCommit: process.env.GITHUB_SHA || null,
  runUrl: /^\d+$/.test(process.env.GITHUB_RUN_ID || '')
    ? `https://github.com/cryptomanxxx/debatt-ai-orchestrator/actions/runs/${process.env.GITHUB_RUN_ID}` : null };
let completedCases = [];
let plan, planCommitment, report, executionFailed = false, stage = 'planning';
let openProblems = { client: null, open: [] }, linkedProblem = null, bankSession = null, bankOutcome = null;
const calibrationLog = { calls: [], marks: [] };
try {
  const modelModes = selection === 'auto' ? await plannerModelModes() : ['default'];
  const researchChoices = selection === 'auto' ? await loadResearchChoices() : {};
  if (selection === 'auto') openProblems = await loadOpenProblems(process.env, CATALOG);
  // Oraklet's memory: the planner sees the VEM-Sci register of earlier verified claims. A register
  // outage never stops the run; the plan then records that it chose without it.
  const offered = CATALOG.filter(e => e.automatic !== false).map(e => e.id);
  let register = null, knowledge = {};
  if (selection === 'auto') {
    try { register = vemRegisterSummary(await readVemRegister(serviceKey)); knowledge = vemKnowledge(register, offered); }
    catch { register = null; }
  }
  plan = await choosePlan(selection, seed, history, planningPropose, modelModes, researchChoices, openProblems.open.map(o => o.summary), knowledge);
  // How the choice relates to the register is committed with the plan, before any experiment call.
  const { knowledgeShown, ...chosen } = plan;
  plan = chosen;
  if (selection === 'auto') plan.knowledge = register
    ? { source: VEM_SCHEMA, runs: register.runs, ...knowledgeChoice(knowledge, offered, plan.experimentId),
      shown: knowledgeShown ?? { entries: 0, omitted: 0, chosenShown: false } }
    : { source: VEM_SCHEMA, unavailable: true };
  // An approved Problem Bank problem the plan works on is committed with the plan, with its literature support.
  linkedProblem = plan.problemBankId ? openProblems.open.find(o => o.summary.problemBankId === plan.problemBankId) ?? null : null;
  if (linkedProblem) plan.problemBank = { id: linkedProblem.problem.id, version: linkedProblem.problem.version,
    fingerprint: linkedProblem.problem.fingerprint, literature: linkedProblem.summary.literature };
  const domain = CATALOG.find(e => e.id === plan.experimentId)?.domain;
  const ranked = chosenResearchModel(plan.modelMode, domain, researchChoices);
  // The evidence behind a ranked choice is committed with the plan, before any experiment call.
  if (ranked) plan.modelChoice = { domain, provider: ranked.provider, model: ranked.model, ...(ranked.root ? { root: ranked.root } : {}),
    evidence: { suite: 'Scientific benchmark v4', correct: ranked.correct, attempts: ranked.attempts } };
  // A default-mode plan keeps the planning identity lock, exactly as before model choice existed.
  // Every experiment answer also states its confidence of passing verification (calibration.mjs).
  // A design experiment answers all its predictions in one call, so a single confidence has no
  // per-case outcome to score; its preregistered criterion is the self-assessment instead.
  const experimentPropose = ranked ? researchProposer(ranked)
    : (plan.modelMode ?? 'default') === 'default' ? planningPropose : proposer(plan.modelMode);
  const propose = CATALOG.find(e => e.id === plan.experimentId)?.design ? experimentPropose : calibrated(experimentPropose, calibrationLog);
  if (plan.seedAdjustment) console.log('Seed ändrad före datagenerering:', JSON.stringify(plan.seedAdjustment), '→', plan.seed);
  planCommitment = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  await writeFile(`${directory}/plan.json`, JSON.stringify({ plan, planCommitment, ...metadata }, null, 2));
  console.log('Experimentplanens SHA-256 före körning:', planCommitment);
  // A Problem Bank outage never stops the experiment; the report says the run was not recorded there.
  if (linkedProblem) {
    try { bankSession = await startBankResearchRun(openProblems.client, linkedProblem.problem, { maxAttempts: 1 }); }
    catch { bankOutcome = { recorded: false, reason: 'start_failed' }; }
  }
  stage = 'experiment';
  const entry = CATALOG.find(e => e.id === plan.experimentId);
  const runners = { 'act-map': runActMapExperiment, 'perturbseq-holdout': runHoldoutExperiment, 'shallow-water-hybrid': runWaterExperiment, 'insulin-external-curve': runExternalCurveExperiment, 'insulin-curve-shape': runCurveShapeExperiment, 'insulin-warming-forecast': runWarmingExperiment, 'temperature-evidence': runTemperatureExperiment, 'glucose-robustness-simulator': runGlucoseRobustnessExperiment, 'glucose-simulator': runGlucoseExperiment, ratfit: runExperiment, rankscreen: runRankExperiment,
    annihilator: runScienceExperiment, mixalot: runScienceExperiment, statsmodels: runScienceExperiment, pymc: runPymcExperiment, sympy: runSympyExperiment, 'scikit-learn': runSklearnExperiment, dowhy: runDowhyExperiment };
  // Design experiments let Oraklet choose bounded parameters and preregister before data exist.
  // A method variant runs the same tool and verifier with another reasoning protocol.
  const execute = entry.design === 'ar1' ? runAr1DesignExperiment : entry.method === 'tree' ? runActMapTreeExperiment : runners[entry.toolId];
  if (!execute) throw new ResearchError('invalid_plan');
  const tool = entry.toolId === 'ratfit' ? callTool : async input => {
    if (++toolCalls > 6) throw new ResearchError('tool_budget_exceeded');
    return entry.toolId === 'act-map' ? callActMap(input) : entry.toolId === 'perturbseq-holdout' ? callHoldout(input) : entry.toolId === 'shallow-water-hybrid' ? callWater(input) : entry.toolId === 'insulin-external-curve' ? callExternalCurve(input) : entry.toolId === 'insulin-curve-shape' ? callCurveShape(input) : entry.toolId === 'insulin-warming-forecast' ? callWarming(input) : entry.toolId === 'temperature-evidence' ? callTemperature(input) : entry.toolId === 'glucose-robustness-simulator' ? callGlucoseRobustness(input) : entry.toolId === 'glucose-simulator' ? callGlucose(input) : entry.toolId === 'rankscreen' ? callRankscreen(input) : entry.toolId === 'pymc' ? callPymc(input) : entry.toolId === 'sympy' ? callSympy(input) : entry.toolId === 'scikit-learn' ? callSklearn(input) : entry.toolId === 'dowhy' ? callDowhy(input) : callScienceTool(entry.toolId, input);
  };
  report = await execute(plan.seed, propose, tool, async commitments => {
    await writeFile(`${directory}/commitments.json`, JSON.stringify(commitments, null, 2));
    console.log(entry.design ? 'Förregistreringens SHA-256 före data (sedan datans):' : 'Datans SHA-256 före modellförslagen:', JSON.stringify(commitments));
  }, { experimentId: entry.id, toolId: entry.toolId, feedback: entry.feedback, staged: entry.staged, designPropose: experimentPropose, onProgress: async cases => {
    markProgress(calibrationLog, cases.length);
    completedCases = cases;
    await writeFile(`${directory}/progress.json`, JSON.stringify({ cases, ...metadata }, null, 2));
  } });
  Object.assign(report, { experimentId: plan.experimentId, modelMode: plan.modelMode ?? 'default', toolId: entry.toolId,
    toolRuntime: ['perturbseq-holdout','glucose-simulator','glucose-robustness-simulator','temperature-evidence','insulin-warming-forecast','insulin-curve-shape','insulin-external-curve'].includes(entry.toolId) ? 'github-actions-node' : entry.toolId === 'ratfit' ? 'orchestrator-api' : entry.toolId === 'dowhy' ? 'github-actions-python-isolated' : 'github-actions-python', plan, planCommitment });
} catch (error) {
  const failure = diagnostic(error);
  console.error('Experimentets felkod:', JSON.stringify(failure));
  executionFailed = true;
  // No raw upstream responses, credentials or exception strings in public reports.
  report = { schemaVersion: 2, researcher: 'Professor Oraklet', title: 'Oraklets experiment kunde inte slutföras',
    question: plan ? CATALOG.find(e => e.id === plan.experimentId)?.question : 'Välja nästa experiment',
    method: 'Avbruten körning; detta är ett driftfel, inte ett underkänt vetenskapligt resultat.',
    limitations: 'Kontrollera körningens status. Ingen slutsats om modellens förmåga kan dras.',
    status: 'failed', executionStatus: 'error', experimentId: plan?.experimentId || null,
    toolId: plan ? CATALOG.find(e => e.id === plan.experimentId)?.toolId : null,
    seed: plan?.seed || seed, plan: plan || null, planCommitment: planCommitment || null, failedStage: stage, failure, cases: completedCases };
}
Object.assign(report, metadata, { reportId, modelCalls: lab.modelCalls(), modelRetries: lab.modelRetries(), toolCalls,
  executionStatus: executionFailed ? 'error' : 'completed' });
if (calibrationLog.calls.length) report.calibration = calibrationReport(calibrationLog, report.cases);
// Oraklet's claims enter the VEM-Sci register only through the verified cases (vem-sci.mjs).
report.vem = vemState(report);
// The verdict goes back to the Problem Bank problem: verified/falsified by the experiment's own
// verifier when the run completed consistently, otherwise undecided (see oraklet-problem-bank.mjs).
if (bankSession) {
  const entry = CATALOG.find(e => e.id === plan.experimentId);
  try {
    const research = researchStateFromOrakletReport(bankSession.research, entry, report);
    const run = await finishBankResearchRun(openProblems.client, bankSession,
      { status: report.executionStatus === 'completed' ? 'completed' : 'failed', research });
    bankOutcome = { recorded: true, runId: run.id, researchStatus: research.status };
  } catch {
    bankOutcome = { recorded: false, reason: 'finish_failed' };
    try { await finishBankResearchRun(openProblems.client, bankSession, { status: 'failed', research: bankSession.research }); }
    catch { /* The open run stays visible in Problem Bank. */ }
  }
}
if (linkedProblem) report.problemBank = { id: linkedProblem.problem.id, version: linkedProblem.problem.version, ...bankOutcome };
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
const hypothesisRows = report.cases.filter(c => c.hypothesisTest);
const decisionLabel = value => ({ supports_h1: 'Stöd för H1', supports_h0: 'Stöd för H0', inconclusive: 'Otillräcklig evidens',
  reject_h0: 'Förkasta H0', do_not_reject_h0: 'Förkasta inte H0', supported_on_holdout: 'Stöd på holdout',
  pending_all_three_cases: 'Ofullständigt', completed: 'Slutfört', positive:'Positiv koefficient',negative:'Negativ koefficient', null_effect:'Nolleffekt under modellen', beats_baselines:'Slår båda baslinjerna',correct_transfer_decision:'Rätt överföringsbeslut',incorrect_transfer_decision:'Fel överföringsbeslut',does_not_beat_baselines:'Slår inte båda baslinjerna',prefer_linear:'Välj linjär modell',prefer_quadratic:'Välj kvadratisk modell', real_solutions:'Reella lösningar',no_real_solutions:'Inga reella lösningar' })[value] || value;
const protocol = report.protocol || hypothesisRows[0]?.hypothesisTest.protocol;
const protocolMarkdown = protocol ? `\n\nProtokoll: ${protocol.hypothesis || protocol.h0} ${protocol.h1 || protocol.alternative || ''}\n\nBeslutskriterium: ${protocol.rule}\n${protocol.assumptions ? `\nAntaganden: ${protocol.assumptions}\n` : ''}` : '';
const hypothesisMarkdown = hypothesisRows.length ? protocolMarkdown + '\n\n## Hypotesresultat\n\nModellförslagets träffsäkerhet ovan är separat från den uppmätta evidensen nedan.\n\n| Fall | Uppmätt beslut | Evidens | Familjebeslut |\n| --- | --- | --- | --- |\n' + hypothesisRows.map(c => {
  const h = c.hypothesisTest, m = h.measured;
  const evidence = h.protocol?.id === 'ar1-design-v1' ? `phi=${c.design.phi}, n=${c.design.n}: förutsagt ${decisionLabel(c.design.prediction)}, p=${m.pvalue.toPrecision(4)}`
    : h.protocol?.id === ACT_MAP_PROTOCOL.id ? actMapSummary(m) : h.protocol?.id === ACT_MAP_TREE_PROTOCOL.id ? actMapTreeSummary(m) : h.protocol?.id === 'perturbseq-holdout-v1' ? holdoutSummary(m) : h.protocol?.id === 'shallow-water-hybrid-v1' ? waterSummary(m) : h.protocol?.id === 'insulin-external-curve-v1' ? externalSummary(m) : h.protocol?.id === 'insulin-curve-shape-v1' ? curveSummary(m) : m.endpoint === 'baseline-subtracted-plasma-insulin' ? warmingSummary(m) : m.studyId && m.temperatureKind ? temperatureSummary(m) : m.conditions ? `Fördel i ${m.improvedConditions}/${m.stressConditions} felaktiga kombinationer; korrekt kontroll: ${m.cleanDecision}; robusthet: ${m.robustness}. Alla kombinationer redovisas nedan.` : m.horizonMetrics ? m.horizonMetrics.map(v => `${v.horizon} min: fast MSE=${v.fixedMse.toPrecision(5)}, adaptiv MSE=${v.adaptiveMse.toPrecision(5)}`).join('; ') : m.adjustmentVariables ? `Justerat för ${m.adjustmentVariables.join(', ')}: effekt=${m.effect.toPrecision(5)}; ojusterad association=${m.naiveEffect.toPrecision(5)}; residual-MSE=${m.residualMse.toPrecision(5)}` : Array.isArray(m.models) ? `Validerings-MSE: grad 1=${m.models[0].validationMse.toPrecision(5)}, grad 2=${m.models[1].validationMse.toPrecision(5)}; vald grad=${m.selectedDegree}; separat test-MSE=${m.selectedTestMse.toPrecision(5)}` : Array.isArray(m.roots) ? `Rötter: ${m.roots.length ? m.roots.join(', ') : 'tom mängd'}, diskriminant=${m.discriminant}, exakt verifierat` : m.probabilityPositive !== undefined ? `P(phi>0)=${m.probabilityPositive.toPrecision(5)}, 95% posteriorintervall=[${m.phiInterval95.map(v=>v.toPrecision(4)).join(', ')}], Rhat=${m.mcmc.maximumRhat.toPrecision(4)}, ESS=${m.mcmc.minimumEssBulk.toFixed(0)}` : m.bayesFactor10 ? `BF10=${m.bayesFactor10}` : m.pvalue !== undefined ? `p=${m.pvalue.toPrecision(4)}, Holm=${h.holmAdjustedPvalue?.toPrecision(4) || 'ej klar'}` : `${m.checked} holdouttermer, ${m.failed} avvikelser`;
  return `| ${c.case} | ${decisionLabel(h.decision)} | ${evidence} | ${decisionLabel(h.familyDecision || h.familyInference || 'Ej tillämpligt')} |`;
}).join('\n') : '';
const markdown = `# ${report.title}\n\n${report.question}\n\nExperiment: ${report.experimentId || 'planering'}. Seed: ${report.seed}.\n\n` +
  (report.cases.length ? '| Fall | Första förslag | Korrigering | Slutligt förslag | Samma modell |\n| --- | --- | --- | --- | --- |\n' +
    report.cases.map(c => `| ${c.case} | ${c.initialPassed ? 'Godkänt' : 'Underkänt'} | ${c.correctionAttempted ? 'Ja' : 'Nej'} | ${c.passed ? 'Godkänt' : 'Underkänt'} | ${c.sameModel ? 'Ja' : 'Nej'} |`).join('\n') : report.method) +
  hypothesisMarkdown + actMapMarkdown(report.cases) + actMapTreeMarkdown(report.cases) + holdoutMarkdown(report.cases) + waterMarkdown(report.cases) + glucoseRobustnessMarkdown(report.cases) + temperatureMarkdown(report.cases) + warmingMarkdown(report.cases) + curveMarkdown(report.cases) + externalMarkdown(report.cases) + `\n\n${executionFailed ? 'Driftfel: ' + JSON.stringify(report.failure) + '. Slutförda fall är delresultat; experimentet är avbrutet.\n\n' : ''}${report.limitations}\n\nModellanrop: ${lab.modelCalls()}/7${lab.modelRetries() ? ` (${lab.modelRetries()} upprepade efter tillfälligt fel)` : ''}. Verktygsanrop: ${toolCalls}/6. Fullständig plan och rapport finns i artefakten.\n`;
const statusLabel = { verified: 'verifierat', falsified: 'falsifierat', inconclusive: 'ofullständigt', needs_external_verification: 'kräver extern verifiering' };
const calibrationMarkdown = report.calibration?.scoredCases ? `\nKalibrering: angiven säkerhet i snitt ${report.calibration.meanConfidence} mot andel godkända första förslag ${report.calibration.passRate} (Brier ${report.calibration.brierScore}, ${report.calibration.scoredCases} fall).\n` : '';
// Model text is rendered as one code span: no Markdown, HTML, autolinks or line breaks reach the report.
const inertText = v => '`' + String(v ?? '').replace(/`/g, "'").replace(/\s+/g, ' ').trim() + '`';
const preregistrationMarkdown = report.preregistration ? `\n\n## Förregistrering\n\nHypotes: ${inertText(report.preregistration.hypothesis)}\n\nJämförelse: ${inertText(report.preregistration.comparison)}\n\n` +
  `Falsifieringskriterium: ${report.preregistration.falsification === 'any_mismatch' ? 'en felaktig förutsägelse' : 'två eller fler felaktiga förutsägelser'} motbevisar förutsägelserna. SHA-256 före data: \`${report.preregistration.sha256}\`.\n\n` +
  (report.preregistrationOutcome ? `Utfall: ${report.preregistrationOutcome.outcome === 'confirmed' ? 'de förregistrerade förutsägelserna höll' : 'de förregistrerade förutsägelserna motbevisades'} (${report.preregistrationOutcome.mismatches} av ${report.preregistration.designs.length} förutsägelser fel).\n` : '') : '';
const bankMarkdown = report.problemBank ? `\nProblem Bank: ${report.problemBank.id} (v${report.problemBank.version})` +
  (plan?.problemBank?.literature ? ` med stöd i litteraturkandidaten "${plan.problemBank.literature.researchQuestion}" (${plan.problemBank.literature.articles} artiklar)` : '') +
  (report.problemBank.recorded ? `; utfallet sparades som ${statusLabel[report.problemBank.researchStatus] ?? report.problemBank.researchStatus}.\n` : '; körningen kunde inte sparas i Problem Bank.\n') : '';
const memoryMarkdown = vemLine(report.vem) + knowledgeLine(plan?.knowledge);
await writeFile(`${directory}/report.md`, markdown + calibrationMarkdown + memoryMarkdown + preregistrationMarkdown + bankMarkdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown + calibrationMarkdown + memoryMarkdown + preregistrationMarkdown + bankMarkdown);
const saved = await fetch(DB, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ id: reportId, titel: report.title, status: report.status, rapport: report, skapad: report.createdAt }),
  redirect: 'error', signal: AbortSignal.timeout(10000) });
await saved.body?.cancel();
if (!saved.ok) throw new Error('Rapporten kunde inte sparas; rapportfilerna finns i artefakten');
if (executionFailed) throw new Error('Experimentet avbröts; en driftfelsrapport har sparats');
console.log('Rapport sparad. Godkända förslag:', report.cases.filter(c => c.passed).length, 'av', report.cases.length);
