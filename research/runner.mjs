import { ResearchError, diagnostic } from './errors.mjs';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { CATALOG, choosePlan, lockModel } from './catalog.mjs';
import { runExperiment } from './ratfit.mjs';
import { runRankExperiment, callRankscreen } from './rankscreen.mjs';
import { runScienceExperiment } from './science.mjs';
import { callScienceTool } from './python-tools.mjs';
import { runPymcExperiment, callPymc } from './pymc.mjs';
import { runSympyExperiment, callSympy } from './sympy.mjs';
import { runSklearnExperiment, callSklearn } from './sklearn.mjs';

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

async function readJson(response, max = 65536) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Tomt serversvar');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw new Error('För stort serversvar'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

// Read only bounded summaries, never complete old datasets or hidden points.
const historyResponse = await fetch(`${DB}?select=titel,status,seed:rapport->>seed,experimentId:rapport->>experimentId&order=skapad.desc&limit=10`,
  { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
if (!historyResponse.ok) { await historyResponse.body?.cancel(); throw new Error('Labbet saknar databasåtkomst'); }
const history = await readJson(historyResponse);
if (!Array.isArray(history) || history.length > 10) throw new Error('Ogiltig historik');

let modelCalls = 0, toolCalls = 0;
async function query(body) {
  const kind = body.tool ? 'tool' : 'model';
  try {
    const response = await fetch(API, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!(body.tool ? [200, 422] : [200]).includes(response.status)) {
      let code = `${kind}_http_error`, upstreamStatus;
      try {
        const data = await readJson(response);
        if (kind === 'model' && ['model_upstream_http_error', 'model_output_truncated',
          'model_empty_response', 'model_invalid_response', 'model_transport_error'].includes(data?.error)) {
          code = data.error;
          upstreamStatus = data.upstreamStatus;
        }
      } catch { /* An untrusted body never becomes public diagnostic text. */ }
      throw new ResearchError(code, { httpStatus: response.status, upstreamStatus });
    }
    return { status: response.status, data: await readJson(response) };
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    throw new ResearchError(`${kind}_transport_error`);
  }
}
const propose = lockModel(async messages => {
  if (++modelCalls > 7) throw new ResearchError('model_budget_exceeded');
  const result = await query({ message: JSON.stringify({ instruction: 'Följ denna konversation och svara endast med begärd JSON.', messages }), mode: 'default', completionTokenLimit });
  if (result.status !== 200 || result.data.mock !== false) throw new ResearchError('invalid_model_response');
  if (result.data.inference?.completionTokenLimit !== completionTokenLimit) throw new ResearchError('model_budget_not_applied');
  return { text: result.data.answer, provider: result.data.provider, model: result.data.model };
});
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
try {
  plan = await choosePlan(selection, seed, history, propose);
  if (plan.seedAdjustment) console.log('Seed ändrad före datagenerering:', JSON.stringify(plan.seedAdjustment), '→', plan.seed);
  planCommitment = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  await writeFile(`${directory}/plan.json`, JSON.stringify({ plan, planCommitment, ...metadata }, null, 2));
  console.log('Experimentplanens SHA-256 före körning:', planCommitment);
  stage = 'experiment';
  const entry = CATALOG.find(e => e.id === plan.experimentId);
  const runners = { ratfit: runExperiment, rankscreen: runRankExperiment,
    annihilator: runScienceExperiment, mixalot: runScienceExperiment, statsmodels: runScienceExperiment, pymc: runPymcExperiment, sympy: runSympyExperiment, 'scikit-learn': runSklearnExperiment };
  const execute = runners[entry.toolId];
  if (!execute) throw new ResearchError('invalid_plan');
  const tool = entry.toolId === 'ratfit' ? callTool : async input => {
    if (++toolCalls > 6) throw new ResearchError('tool_budget_exceeded');
    return entry.toolId === 'rankscreen' ? callRankscreen(input) : entry.toolId === 'pymc' ? callPymc(input) : entry.toolId === 'sympy' ? callSympy(input) : entry.toolId === 'scikit-learn' ? callSklearn(input) : callScienceTool(entry.toolId, input);
  };
  report = await execute(plan.seed, propose, tool, async commitments => {
    await writeFile(`${directory}/commitments.json`, JSON.stringify(commitments, null, 2));
    console.log('Datans SHA-256 före modellförslagen:', JSON.stringify(commitments));
  }, { experimentId: entry.id, toolId: entry.toolId, feedback: entry.feedback, onProgress: async cases => {
    completedCases = cases;
    await writeFile(`${directory}/progress.json`, JSON.stringify({ cases, ...metadata }, null, 2));
  } });
  Object.assign(report, { experimentId: plan.experimentId, toolId: entry.toolId,
    toolRuntime: entry.toolId === 'ratfit' ? 'orchestrator-api' : 'github-actions-python', plan, planCommitment });
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
Object.assign(report, metadata, { reportId, modelCalls, toolCalls,
  executionStatus: executionFailed ? 'error' : 'completed' });
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
const hypothesisRows = report.cases.filter(c => c.hypothesisTest);
const decisionLabel = value => ({ supports_h1: 'Stöd för H1', supports_h0: 'Stöd för H0', inconclusive: 'Otillräcklig evidens',
  reject_h0: 'Förkasta H0', do_not_reject_h0: 'Förkasta inte H0', supported_on_holdout: 'Stöd på holdout',
  pending_all_three_cases: 'Ofullständigt', completed: 'Slutfört', positive:'Positiv koefficient',negative:'Negativ koefficient', prefer_linear:'Välj linjär modell',prefer_quadratic:'Välj kvadratisk modell', real_solutions:'Reella lösningar',no_real_solutions:'Inga reella lösningar' })[value] || value;
const protocol = report.protocol || hypothesisRows[0]?.hypothesisTest.protocol;
const protocolMarkdown = protocol ? `\n\nProtokoll: ${protocol.hypothesis || protocol.h0} ${protocol.h1 || protocol.alternative || ''}\n\nBeslutskriterium: ${protocol.rule}\n` : '';
const hypothesisMarkdown = hypothesisRows.length ? protocolMarkdown + '\n\n## Hypotesresultat\n\nModellförslagets träffsäkerhet ovan är separat från den uppmätta evidensen nedan.\n\n| Fall | Uppmätt beslut | Evidens | Familjebeslut |\n| --- | --- | --- | --- |\n' + hypothesisRows.map(c => {
  const h = c.hypothesisTest, m = h.measured;
  const evidence = Array.isArray(m.models) ? `Validerings-MSE: grad 1=${m.models[0].validationMse.toPrecision(5)}, grad 2=${m.models[1].validationMse.toPrecision(5)}; vald grad=${m.selectedDegree}; separat test-MSE=${m.selectedTestMse.toPrecision(5)}` : Array.isArray(m.roots) ? `Rötter: ${m.roots.length ? m.roots.join(', ') : 'tom mängd'}, diskriminant=${m.discriminant}, exakt verifierat` : m.probabilityPositive !== undefined ? `P(phi>0)=${m.probabilityPositive.toPrecision(5)}, 95% posteriorintervall=[${m.phiInterval95.map(v=>v.toPrecision(4)).join(', ')}], Rhat=${m.mcmc.maximumRhat.toPrecision(4)}, ESS=${m.mcmc.minimumEssBulk.toFixed(0)}` : m.bayesFactor10 ? `BF10=${m.bayesFactor10}` : m.pvalue !== undefined ? `p=${m.pvalue.toPrecision(4)}, Holm=${h.holmAdjustedPvalue?.toPrecision(4) || 'ej klar'}` : `${m.checked} holdouttermer, ${m.failed} avvikelser`;
  return `| ${c.case} | ${decisionLabel(h.decision)} | ${evidence} | ${decisionLabel(h.familyDecision || h.familyInference || 'Ej tillämpligt')} |`;
}).join('\n') : '';
const markdown = `# ${report.title}\n\n${report.question}\n\nExperiment: ${report.experimentId || 'planering'}. Seed: ${report.seed}.\n\n` +
  (report.cases.length ? '| Fall | Första förslag | Korrigering | Slutligt förslag | Samma modell |\n| --- | --- | --- | --- | --- |\n' +
    report.cases.map(c => `| ${c.case} | ${c.initialPassed ? 'Godkänt' : 'Underkänt'} | ${c.correctionAttempted ? 'Ja' : 'Nej'} | ${c.passed ? 'Godkänt' : 'Underkänt'} | ${c.sameModel ? 'Ja' : 'Nej'} |`).join('\n') : report.method) +
  hypothesisMarkdown + `\n\n${executionFailed ? 'Driftfel: ' + JSON.stringify(report.failure) + '. Slutförda fall är delresultat; experimentet är avbrutet.\n\n' : ''}${report.limitations}\n\nModellanrop: ${modelCalls}/7. Verktygsanrop: ${toolCalls}/6. Fullständig plan och rapport finns i artefakten.\n`;
await writeFile(`${directory}/report.md`, markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
const saved = await fetch(DB, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ id: reportId, titel: report.title, status: report.status, rapport: report, skapad: report.createdAt }),
  redirect: 'error', signal: AbortSignal.timeout(10000) });
await saved.body?.cancel();
if (!saved.ok) throw new Error('Rapporten kunde inte sparas; rapportfilerna finns i artefakten');
if (executionFailed) throw new Error('Experimentet avbröts; en driftfelsrapport har sparats');
console.log('Rapport sparad. Godkända förslag:', report.cases.filter(c => c.passed).length, 'av', report.cases.length);
