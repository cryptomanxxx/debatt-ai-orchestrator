import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { agenticTreeSearch } from './agentic-tree-search.mjs';
import { makeSympyCases, parseSympyProposal, quadraticOracle } from './sympy.mjs';

// An experimental method benchmark, NOT an autonomous scientific discovery engine.
// The model never sees the solution or hidden truth before submitting an answer.
const PROMPT_VERSION = 'quadratic-reasoning-tree-v1';
const SYSTEM = 'You are Professor Oraklet. Solve a*x^2+b*x+c=0 over the real numbers. '
  + 'Return ONLY JSON with exactly method:"sympy", roots:[exact simplified rational strings], '
  + 'reason:"short explanation". Distinct roots only; use [] if no real roots. No markdown.';
const STRATEGIES = Object.freeze({
  direct: 'Solve directly without external hints.',
  discriminant: 'Use b^2 - 4ac and consider repeated or non-real roots.',
  factoring: 'Try exact factorization to calculate every real root.',
  crosscheck: 'Reconsider the previous candidate using a different mathematical approach.',
});
const ROOT_ACTIONS = Object.freeze([
  { id: 'discriminant', label: 'Discriminant analysis' },
  { id: 'factoring', label: 'Exact factorization' },
]);
const FOLLOW_UP = Object.freeze([{ id: 'crosscheck', label: 'Alternative cross-check' }]);
const bound = (n, lo, hi, label) => {
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error('invalid_' + label);
};
const validateModes = modes => {
  if (!Array.isArray(modes) || modes.length === 0 || modes.length > 2
      || new Set(modes).size !== modes.length
      || !modes.every(m => m === 'default' || m === 'reasoning')) throw new Error('invalid_benchmark_modes');
};
export function plannedBenchmark({ seed = '20261016', modes = ['default'], maxTreeNodes = 3, maxCalls = 24 } = {}) {
  validateModes(modes);
  bound(maxTreeNodes, 1, 3, 'tree_nodes');
  bound(maxCalls, 1, 24, 'model_calls');
  const fixtures = makeSympyCases(seed);
  const worstCaseCalls = fixtures.length * modes.length * (1 + maxTreeNodes);
  if (maxCalls < worstCaseCalls) throw new Error('insufficient_model_call_budget');
  return { schemaVersion: 1, promptVersion: PROMPT_VERSION,
    mode: 'experimental-bounded-comparison', seed, modes, maxTreeNodes, maxCalls, worstCaseCalls,
    cases: fixtures.map(f => ({ case: f.id, commitment: f.commitment, coefficients: f.input.coefficients })),
    limitations: 'Three synthetic quadratic problems; not a statistical study or scientific discovery. Direct and tree strategies spend different model-call budgets.' };
}
function promptFor(coefficients, strategy, path = [], feedback = []) {
  return JSON.stringify({ system: SYSTEM, instruction: STRATEGIES[strategy],
    coefficients, previous_attempts: feedback.slice(-1), strategy_path: path });
}
function checkProposal(answer, coefficients) {
  const proposal = parseSympyProposal(answer);
  if (!proposal) return { verified: false, score: 0, result: { status: 'invalid_proposal' } };
  try {
    const checked = quadraticOracle({ coefficients, candidates: proposal.roots });
    return { verified: checked.accepted, score: checked.accepted ? 1 : 0,
      result: { status: checked.accepted ? 'verified' : 'falsified',
        proposal: { roots: proposal.roots, reason: proposal.reason.slice(0, 300) },
        verifier: 'existing-exact-bigint-quadratic-oracle' } };
  } catch {
    return { verified: false, score: 0, result: { status: 'invalid_proposal' } };
  }
}
export async function runDeepReasoningBenchmark(options = {}) {
  const plan = plannedBenchmark(options);
  if (typeof options.propose !== 'function') throw new Error('missing_model_callback');
  const report = { ...plan, status: 'running', actualModelCalls: 0, results: [], modelIdentities: {} };
  const ask = async (mode, coefficients, strategy, path = [], feedback = []) => {
    if (report.actualModelCalls >= plan.maxCalls) throw new Error('model_call_budget_exhausted');
    report.actualModelCalls++;
    const reply = await options.propose({ mode, message: promptFor(coefficients, strategy, path, feedback) });
    if (!reply || reply.mock !== false || typeof reply.answer !== 'string'
      || typeof reply.provider !== 'string' || !reply.provider
      || typeof reply.model !== 'string' || !reply.model) throw new Error('invalid_real_model_response');
    const identity = reply.provider + '/' + reply.model;
    if (report.modelIdentities[mode] && report.modelIdentities[mode] !== identity) throw new Error('model_identity_changed');
    report.modelIdentities[mode] = identity;
    return { answer: reply.answer, identity };
  };
  try {
    for (const mode of plan.modes) {
      for (const fixture of makeSympyCases(plan.seed)) {
        const coefficients = fixture.input.coefficients;
        const directReply = await ask(mode, coefficients, 'direct');
        const direct = checkProposal(directReply.answer, coefficients);
        const attempts = new Map();
        const tree = await agenticTreeSearch({
          maxNodes: plan.maxTreeNodes, maxDepth: 2, maxChildren: 2,
          expand: parent => parent.depth === 0 ? ROOT_ACTIONS : FOLLOW_UP,
          evaluate: async node => {
            const parent = attempts.get(node.parentId);
            // Only the prior branch's own answer and accepted/rejected flag are
            // revealed. The exact verifier's hidden roots never enter the prompt.
            const feedback = parent ? [{
              strategy: parent.actionId, roots: parent.result?.proposal?.roots ?? null,
              verifier_status: parent.result?.status ?? 'invalid_proposal' }] : [];
            const reply = await ask(mode, coefficients, node.actionId, node.path, feedback);
            const verdict = checkProposal(reply.answer, coefficients);
            attempts.set(node.id, { ...verdict, actionId: node.actionId });
            return verdict;
          },
        });
        report.results.push({ mode, case: fixture.id, commitment: fixture.commitment,
          coefficients, modelIdentity: directReply.identity, direct, tree });
        await options.onProgress?.(structuredClone(report));
      }
    }
    report.status = 'completed';
    report.summary = Object.fromEntries(plan.modes.map(mode => {
      const rows = report.results.filter(x => x.mode === mode);
      return [mode, { cases: rows.length, directVerified: rows.filter(x => x.direct.verified).length,
        treeVerified: rows.filter(x => x.tree.verifiedNodeId !== null).length,
        treeNodesEvaluated: rows.reduce((n, x) => n + x.tree.evaluatedNodes, 0) }];
    }));
    return report;
  } catch (error) {
    report.status = 'failed';
    report.failureCode = ['model_call_budget_exhausted', 'model_identity_changed',
      'invalid_real_model_response'].includes(error?.message) ? error.message : 'benchmark_execution_failed';
    await options.onProgress?.(structuredClone(report));
    throw error;
  }
}
export function orchestratorProposer({ apiUrl, apiKey, fetchImpl = fetch }) {
  if (typeof apiKey !== 'string' || apiKey.length < 24) throw new Error('missing_orchestrator_key');
  let url;
  try { url = new URL(apiUrl); } catch { throw new Error('invalid_orchestrator_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.pathname.endsWith('/v1/query')) throw new Error('invalid_orchestrator_url');
  return async ({ mode, message }) => {
    const response = await fetchImpl(url.href, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(55000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ message, mode, completionTokenLimit: 4096 }) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('orchestrator_http_' + response.status); }
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > 65536) throw new Error('oversized_orchestrator_response');
    const data = JSON.parse(raw);
    return { mock: data.mock, answer: data.answer, provider: data.provider, model: data.model };
  };
}
async function main() {
  const seed = process.env.BENCHMARK_SEED || '20261016';
  const mode = process.env.BENCHMARK_MODE || 'default';
  const modes = mode === 'both' ? ['default', 'reasoning'] : [mode];
  const maxTreeNodes = Number(process.env.BENCHMARK_TREE_NODES || '3');
  const maxCalls = Number(process.env.BENCHMARK_MAX_CALLS || '24');
  const plan = plannedBenchmark({ seed, modes, maxTreeNodes, maxCalls });
  const output = 'reports/deep-reasoning/report.json';
  await mkdir('reports/deep-reasoning', { recursive: true });
  if (process.argv.includes('--offline')) {
    await writeFile(output, JSON.stringify({ ...plan, status: 'offline-plan-only', actualModelCalls: 0 }, null, 2) + '\n');
    console.log('Offline plan validated: no inference calls were made.');
    return;
  }
  const apiUrl = process.env.ORCHESTRATOR_API_URL
    || 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/query';
  const key = process.env.ORCHESTRATOR_API_KEY || '';
  const propose = orchestratorProposer({ apiUrl, apiKey: key });
  if (modes.includes('reasoning')) {
    const profileUrl = apiUrl.replace(/\/v1\/query$/, '/v1/model-profile');
    const response = await fetch(profileUrl, { headers: { Authorization: 'Bearer ' + key },
      redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('reasoning_model_profile_unavailable'); }
    const profile = await response.json();
    if (profile?.reasoningAvailable !== true) throw new Error('reasoning_mode_not_configured');
  }
  let snapshot = { ...plan, status: 'running', actualModelCalls: 0, results: [] };
  try {
    const report = await runDeepReasoningBenchmark({ seed, modes, maxTreeNodes, maxCalls, propose,
      onProgress: async partial => {
        snapshot = partial;
        await writeFile(output, JSON.stringify(partial, null, 2) + '\n');
      } });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, actualModelCalls: report.actualModelCalls, summary: report.summary }));
  } catch {
    const safe = { ...snapshot, status: 'failed', failureCode: snapshot.failureCode || 'benchmark_execution_failed' };
    await writeFile(output, JSON.stringify(safe, null, 2) + '\n');
    throw new Error(safe.failureCode);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('Deep reasoning benchmark failed:', error.message); process.exitCode = 1; });
}
