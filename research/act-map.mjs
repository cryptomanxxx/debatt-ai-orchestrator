import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ResearchError } from './errors.mjs';
import { canonical } from './python-tools.mjs';

// ACT-MAP with Oraklet as the proposer (research/ACT-MAP-LAB.md). A known source mechanism
// s_0 -> s_1 -> s_2 (plus s_0 -> s_2) and a target system with random names. Oraklet chooses up to
// three interventions, sees their outcomes and proposes which target variable and intervention
// correspond to which source role, or that the mechanism does not transfer. The lab replays the
// outcomes, and the evidence gate in research/act_map_benchmark.py (PR #91) decides independently
// whether the claim may be stored as provisionally supported. The same gate also runs the
// enumeration baseline on the same fixture.

const sha = text => createHash('sha256').update(text).digest('hex');
// Same bytes as Python's json.dumps(sort_keys=True, separators=(',', ':')) for these fixtures.
export const digest = value => sha(JSON.stringify(canonical(value)));

export const ACT_MAP_LEVELS = Object.freeze([2, 3, 4]);
export const VALUES = Object.freeze([1, -1, 2]);
export const HOLDOUT_VALUES = Object.freeze([-2, 3]);
export const MAX_EXPERIMENTS = 3;
export const DECISIONS = Object.freeze(['full', 'partial', 'none']);
const GATE_ADAPTER = 'act-map-gate-v1';

export const ACT_MAP_PROTOCOL = Object.freeze({
  id: 'act-map-oraklet-v1',
  hypothesis: 'Kan Oraklet själv välja ingrepp i ett okänt system, hitta vilka variabler och ingrepp som motsvarar en känd orsaksmekanism, och avstå när mekanismen inte går att överföra?',
  rule: 'Tre fall: nivå 2 (okänd variabelkoppling), nivå 3 (även okänd ingreppskoppling) och nivå 4 (bara s_0 → s_1 överförs, eller inget). Oraklet får högst tre ingrepp med värden 1, −1 eller 2. Ett fall godkänns när beslutet (full, partiell eller ingen överföring) är rätt och, vid full eller partiell överföring, när evidensgrinden godkänner påståendet med de dolda ingreppsstorlekarna −2 och 3 och kopplingen är rätt. Uppräkningsbaslinjen från PR #91 körs på samma fall.',
  assumptions: 'Linjära, brusfria syntetiska mekanismer med tre variabler. Källmekanismens ekvationer och koefficienter visas; målsystemets namn är slumpade och säger inget om rollerna.',
  limitations: 'Syntetiska tre-variabel-system i samma linjära familj; ingen verklig vetenskaplig upptäckt. Uppräkningsbaslinjen löser i stort sett alla fall, så testet mäter om modellen kan resonera fram det som en enkel uppräkning hittar. "Preliminärt stött" gäller bara inom den här syntetiska familjen.',
});

// The budget variant: same fixtures, at most two interventions. With three roles and a gate that
// needs the root and the mediator covered, two interventions leave no room for trial and error:
// Oraklet has to plan which two are informative.
export const BUDGET_EXPERIMENTS = 2;
export const ACT_MAP_BUDGET_PROTOCOL = Object.freeze({
  id: 'act-map-budget-v1',
  hypothesis: 'Kan Oraklet planera sina ingrepp när han bara får två, och ändå hitta eller avvisa överföringen av en känd orsaksmekanism?',
  rule: 'Samma tre fall och samma godkännande som act-map-oraklet-v1 på samma seed, men högst två ingrepp per fall. Evidensgrinden kräver att roten och mediatorn täcks och att minst två olika ingrepp gjorts; uppräkningsbaslinjens antal ingrepp redovisas för jämförelse.',
  assumptions: ACT_MAP_PROTOCOL.assumptions,
  limitations: 'Samma syntetiska familj som act-map-oraklet-v1. Uppräkningsbaslinjen får fortfarande upp till tre ingrepp; rapporten visar om den klarade sig med två. Ingen verklig vetenskaplig upptäckt.',
});

function stream(seed, label) {
  let i = 0;
  return () => parseInt(sha(`${ACT_MAP_PROTOCOL.id}:${seed}:${label}:${i++}`).slice(0, 12), 16);
}
function shuffle(next, values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const validSeed = seed => {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
};

// One fixture in the shape the Python gate expects: {view, truth, commitment}.
export function makeActMapFixture(seed, level) {
  validSeed(seed);
  if (!ACT_MAP_LEVELS.includes(level)) throw new ResearchError('invalid_plan');
  const next = stream(seed, `level-${level}`);
  const pick = values => values[next() % values.length];
  const a = pick([2, 3, 4]), b = pick([-4, -3, -2]), c = pick([1, 2]);
  const names = prefix => Array.from({ length: 3 }, () => `${prefix}_${next().toString(16).padStart(12, '0').slice(-9)}`);
  const targetVariables = names('v'), targetInterventions = names('act');
  if (new Set([...targetVariables, ...targetInterventions]).size !== 6) throw new ResearchError('invalid_tool_evidence');
  const mapping = shuffle(next, [0, 1, 2]);
  const actionToTarget = level >= 3 ? shuffle(next, [0, 1, 2]) : [0, 1, 2];
  const scope = level === 4 ? pick(['partial', 'none']) : 'full';
  // Partial: only the s_0 -> s_1 submechanism carries over. None: no mechanism carries over.
  const coefficients = scope === 'full' ? [a, b, c] : scope === 'partial' ? [a, b - 7, c + 6] : [a + 7, b - 7, c + 6];
  const view = { protocol: ACT_MAP_PROTOCOL.id, level, max_experiments: MAX_EXPERIMENTS,
    source: { variables: ['s_0', 's_1', 's_2'], a, b, c, equations: ['s_1=a*s_0+u_1', 's_2=b*s_1+c*s_0+u_2'] },
    target_variables: targetVariables, target_interventions: targetInterventions };
  const truth = { mapping, action_to_target: actionToTarget, scope, target_coefficients: coefficients };
  return { view, truth, commitment: digest({ view, truth }) };
}
export const makeActMapCases = seed => ACT_MAP_LEVELS.map(level => makeActMapFixture(seed, level));

function scm([a, b, c], manipulated, value) {
  const x0 = manipulated === 0 ? value : 0;
  const x1 = manipulated === 1 ? value : a * x0;
  const x2 = manipulated === 2 ? value : b * x1 + c * x0;
  return [x0, x1, x2];
}
// The private intervention oracle: outcomes indexed by target variable.
export function intervene(fixture, action, value) {
  if (![0, 1, 2].includes(action) || ![...VALUES, ...HOLDOUT_VALUES].includes(value)) throw new ResearchError('invalid_tool_evidence');
  const { mapping, action_to_target: actionToTarget, target_coefficients: coefficients } = fixture.truth;
  const outcomes = scm(coefficients, mapping.indexOf(actionToTarget[action]), value), observed = [0, 0, 0];
  outcomes.forEach((v, source) => { observed[mapping[source]] = v; });
  return observed;
}

// What a hypothesis predicts for one intervention: {targetIndex: value}; partial claims say nothing about s_2.
export function predict(view, h, action, value) {
  const j = h.mapping.indexOf(h.action_to_target[action]);
  if (h.scope === 'partial' && j === 2) return {};
  const outcomes = scm([view.source.a, view.source.b, view.source.c], j, value);
  return Object.fromEntries(outcomes.slice(0, h.scope === 'full' ? 3 : 2).map((v, i) => [h.mapping[i], v]));
}

// Alternate path for the gate's decision, written separately from the Python verifier: the Python
// result is only accepted when both agree on status. Its reason codes are the gate's own.
export function gateDecision(fixture, proposed, history) {
  if (proposed === null) return { status: 'unresolved', accepted: false };
  const { view } = fixture;
  const perm = list => Array.isArray(list) && list.length === 3 && [...list].sort().join() === '0,1,2' && list.every(Number.isInteger);
  if (!['full', 'partial'].includes(proposed?.scope) || !perm(proposed.mapping) || !perm(proposed.action_to_target)
    || (proposed.scope === 'partial' && view.level !== 4)) return { status: 'rejected', accepted: false };
  if (history.length > MAX_EXPERIMENTS || history.some(r => String(r.outcome) !== String(intervene(fixture, r.action, r.value))))
    return { status: 'rejected', accepted: false };
  const roles = new Set(history.map(r => proposed.mapping.indexOf(proposed.action_to_target[r.action])));
  if (new Set(history.map(r => r.action)).size < 2 || !roles.has(0) || !roles.has(1)) return { status: 'rejected', accepted: false };
  const fits = (action, value, outcome) => Object.entries(predict(view, proposed, action, value)).every(([t, v]) => outcome[t] === v);
  if (!history.every(r => fits(r.action, r.value, r.outcome))) return { status: 'rejected', accepted: false };
  const relevant = [0, 1, 2].filter(a => Object.keys(predict(view, proposed, a, 1)).length);
  if (relevant.length < 2) return { status: 'rejected', accepted: false };
  for (const action of relevant) for (const value of HOLDOUT_VALUES)
    if (!fits(action, value, intervene(fixture, action, value))) return { status: 'rejected', accepted: false };
  return { status: 'provisionally_supported', accepted: true };
}

const gateScript = fileURLToPath(new URL('./act_map_benchmark.py', import.meta.url));
// The gate gets no credentials, only what is needed to find the interpreter. Version-manager
// shims (asdf in the Cloudflare build image, pyenv) need HOME and their own variables besides PATH.
export const pythonEnv = (env = process.env) =>
  Object.fromEntries(Object.entries(env).filter(([k]) => /^(PATH|HOME|ASDF_\w+|PYENV_\w+)$/.test(k)));
export function callActMap(input) {
  const raw = JSON.stringify(input);
  if (Buffer.byteLength(raw) > 16384) return Promise.reject(new ResearchError('invalid_tool_evidence'));
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.RESEARCH_PYTHON || 'python3', ['-I', gateScript, '--gate'],
      { timeout: 20000, maxBuffer: 65536, env: pythonEnv() }, (error, stdout) => {
        if (error) return reject(new ResearchError('tool_transport_error'));
        try { resolve({ ...JSON.parse(stdout), inputSha256: digest(input) }); }
        catch { reject(new ResearchError('invalid_tool_evidence')); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(raw);
  });
}

export function validateActMap(evidence, input) {
  const gate = evidence?.result?.gate, baseline = evidence?.result?.baseline;
  if (evidence?.tool !== 'act-map' || evidence.adapterVersion !== GATE_ADAPTER || evidence.inputSha256 !== digest(input)
    || digest({ view: input.fixture.view, truth: input.fixture.truth }) !== input.fixture.commitment
    || !gate || typeof gate.accepted !== 'boolean' || typeof gate.status !== 'string'
    || !baseline || !['full', 'partial', 'no_supported_transfer', 'unresolved'].includes(baseline.decision)
    || typeof baseline.scope_correct !== 'boolean' || typeof baseline.mapping_correct !== 'boolean')
    throw new ResearchError('invalid_tool_evidence');
  const alternate = gateDecision(input.fixture, input.proposed, input.history);
  if (alternate.status !== gate.status || alternate.accepted !== gate.accepted) throw new ResearchError('invalid_tool_evidence');
  return evidence.result;
}

// What Oraklet sees: the source mechanism, the target names and, at level 2, which target
// variable each intervention sets. Never the mapping, the coefficients of the target or the scope.
export function publicTask(fixture, maxExperiments = MAX_EXPERIMENTS) {
  const { view } = fixture;
  return { protocol: ACT_MAP_PROTOCOL.id, level: view.level,
    source: { equations: [`s_1 = ${view.source.a}*s_0`, `s_2 = ${view.source.b}*s_1 + ${view.source.c}*s_0`],
      note: 'Brusfritt. Utan ingrepp är alla variabler 0. Ett ingrepp sätter en variabel till ett värde och bryter dess egen ekvation.' },
    targetVariables: view.target_variables, targetInterventions: view.target_interventions,
    ...(view.level === 2 ? { interventionSets: Object.fromEntries(view.target_interventions.map((a, i) => [a, view.target_variables[fixture.truth.action_to_target[i]]])) } : {}),
    allowedValues: VALUES, maxExperiments,
    allowedDecisions: view.level === 4 ? DECISIONS : ['full', 'none'] };
}

export const ACT_MAP_SYSTEM = 'Du är Professor Oraklet och undersöker om en känd orsaksmekanism (källan, variablerna s_0, s_1, s_2) finns i ett okänt målsystem med tre variabler. Målsystemets namn är slumpade och säger inget om vilken roll variablerna har. Ett ingrepp sätter en målvariabel till ett värde; du ser sedan alla tre målvariablernas värden. ';
export function designMessages(fixture, maxExperiments = MAX_EXPERIMENTS) {
  return [
    { role: 'system', content: ACT_MAP_SYSTEM + `Välj först dina experiment: 1–${maxExperiments} ingrepp, vart och ett ett av targetInterventions med ett av allowedValues. Svara endast JSON: {"experiments":[{"intervention":"<namn>","value":1}],"reason":"kort svensk motivering"}.` },
    { role: 'user', content: JSON.stringify(publicTask(fixture, maxExperiments)) },
  ];
}
// The inference request; `extra` adds the tree-search evaluation of Oraklet's own hypotheses
// (act-map-tree.mjs) without changing the answer format.
export function inferenceMessages(fixture, results, extra = null, maxExperiments = MAX_EXPERIMENTS) {
  const level4 = fixture.view.level === 4;
  return [
    { role: 'system', content: ACT_MAP_SYSTEM + 'Du har valt dina experiment och ser resultaten. Avgör nu om källmekanismen finns i målsystemet. ' +
      '"full": hela mekanismen gäller; ange vilken målvariabel som motsvarar s_0, s_1 och s_2 och vilken målvariabel varje ingrepp sätter. ' +
      (level4 ? '"partial": bara s_0 → s_1 gäller, inte ekvationen för s_2; ange ändå hela kopplingen. ' : '') +
      '"none": mekanismen stöds inte; då är mapping och interventions null. Ditt påstående prövas med ingreppsstorlekar du inte har sett. ' +
      (extra ? extra.system : '') +
      'Svara endast JSON: {"decision":"full","mapping":{"s_0":"<målvariabel>","s_1":"...","s_2":"..."},"interventions":{"<ingrepp>":"<målvariabel>"},"reason":"kort svensk motivering"}.' },
    { role: 'user', content: JSON.stringify({ task: publicTask(fixture, maxExperiments), results, ...(extra ? extra.payload : {}) }) },
  ];
}

export function parseJson(text) {
  const t = String(text).trim().replace(/^<think>[\s\S]*?<\/think>\s*/, '');
  const fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  const value = JSON.parse(fenced ? fenced[1] : t);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not_object');
  return value;
}
const validReason = r => typeof r === 'string' && r.trim() && r.length <= 800;

// A design answer becomes the lab's discovery record: [{action, value}], or a fixed problem code.
export function checkDesign(text, fixture, maxExperiments = MAX_EXPERIMENTS) {
  let p;
  try { p = parseJson(text); } catch { return { problem: 'not_json' }; }
  if (Object.keys(p).some(k => !['experiments', 'reason'].includes(k))) return { problem: 'extra_fields' };
  if (!Array.isArray(p.experiments) || p.experiments.length < 1 || p.experiments.length > maxExperiments) return { problem: 'invalid_experiments' };
  const names = fixture.view.target_interventions, experiments = [];
  for (const e of p.experiments) {
    const action = names.indexOf(typeof e?.intervention === 'string' ? e.intervention.trim() : null);
    const value = typeof e?.value === 'string' && /^-?\d+$/.test(e.value.trim()) ? Number(e.value) : e?.value;
    if (action < 0 || !VALUES.includes(value)) return { problem: 'invalid_experiments' };
    if (experiments.some(x => x.action === action && x.value === value)) return { problem: 'duplicate_experiment' };
    experiments.push({ action, value });
  }
  if (!validReason(p.reason)) return { problem: 'invalid_reason' };
  return { design: { experiments, reason: p.reason.trim() } };
}

// An inference answer becomes the gate's hypothesis: {scope, mapping, action_to_target}, or null for "none".
export function checkInference(text, fixture) {
  let p;
  try { p = parseJson(text); } catch { return { problem: 'not_json' }; }
  if (Object.keys(p).some(k => !['decision', 'mapping', 'interventions', 'reason'].includes(k))) return { problem: 'extra_fields' };
  const decision = typeof p.decision === 'string' ? p.decision.trim().toLowerCase() : null;
  if (!publicTask(fixture).allowedDecisions.includes(decision)) return { problem: 'invalid_decision' };
  if (!validReason(p.reason)) return { problem: 'invalid_reason' };
  if (decision === 'none') return { claim: { decision, proposed: null, reason: p.reason.trim() } };
  const { target_variables: variables, target_interventions: actions, level } = fixture.view;
  const index = name => variables.indexOf(typeof name === 'string' ? name.trim() : null);
  const mapping = ['s_0', 's_1', 's_2'].map(s => index(p.mapping?.[s]));
  if (!p.mapping || typeof p.mapping !== 'object' || Object.keys(p.mapping).length !== 3 || mapping.includes(-1) || new Set(mapping).size !== 3)
    return { problem: 'invalid_mapping' };
  // At level 2 the intervention targets are given; Oraklet may omit them.
  const given = level === 2 && (p.interventions === undefined || p.interventions === null);
  const actionToTarget = given ? [...fixture.truth.action_to_target]
    : actions.map(a => index(p.interventions?.[a]));
  if (!given && (!p.interventions || typeof p.interventions !== 'object' || Object.keys(p.interventions).length !== 3
    || actionToTarget.includes(-1) || new Set(actionToTarget).size !== 3)) return { problem: 'invalid_interventions' };
  return { claim: { decision, proposed: { scope: decision, mapping, action_to_target: actionToTarget }, reason: p.reason.trim() } };
}

const PROBLEM_TEXT = Object.freeze({
  not_json: 'svaret var inte giltig JSON', extra_fields: 'svaret hade fält som inte efterfrågades',
  invalid_experiments: 'experiments var inte 1–3 ingrepp med kända namn och tillåtna värden', duplicate_experiment: 'samma ingrepp och värde förekom två gånger',
  invalid_decision: 'decision var inte ett tillåtet beslut', invalid_mapping: 'mapping angav inte tre olika målvariabler för s_0, s_1 och s_2',
  truncated: 'svaret klipptes vid labbets tokengräns', invalid_interventions: 'interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen', invalid_reason: 'reason saknades eller var längre än 800 tecken',
});
export const problemText = code => PROBLEM_TEXT[code] ?? code;

export const named = (fixture, history) => history.map(r => ({ intervention: fixture.view.target_interventions[r.action], value: r.value,
  observed: Object.fromEntries(fixture.view.target_variables.map((v, i) => [v, r.outcome[i]])) }));
export const namedClaim = (fixture, proposed) => proposed && {
  mapping: Object.fromEntries(proposed.mapping.map((t, s) => [`s_${s}`, fixture.view.target_variables[t]])),
  interventions: Object.fromEntries(proposed.action_to_target.map((t, a) => [fixture.view.target_interventions[a], fixture.view.target_variables[t]])) };

// The pass rule. Full/partial: the gate accepted the claim and the correspondence is right.
// None: the transfer really does not hold (only possible at level 4).
export function actMapPasses(claim, fixture, gate) {
  if (!claim) return false;
  const { truth } = fixture;
  if (claim.decision === 'none') return truth.scope === 'none';
  return gate.accepted && claim.decision === truth.scope
    && String(claim.proposed.mapping) === String(truth.mapping) && String(claim.proposed.action_to_target) === String(truth.action_to_target);
}

// The case's VEM-Sci record: a proposal is "proposed", goes "under_test" and only the evidence
// gate moves it on. Abstention ("none") is never an accepted claim. A case without a readable
// answer is remembered too, as unresolved with the reason, so the planner sees where Oraklet fails.
// `outcome` carries the verified case facts the DeepRAP scoreboard (deeprap.mjs) measures.
export function vemRecord(fixture, claim, history, gate, formatProblem, protocol = ACT_MAP_PROTOCOL.id, outcome = undefined) {
  if (!claim) return { claimId: digest({ protocol, fixture: fixture.commitment, noAnswer: formatProblem }),
    kind: 'no_answer', transitions: ['unanswered'], status: 'unresolved', reason: formatProblem, evidenceSha256: digest(history), ...(outcome ? { outcome } : {}) };
  const statement = { decision: claim.decision, ...namedClaim(fixture, claim.proposed) };
  return { claimId: digest({ protocol, fixture: fixture.commitment, statement }),
    kind: claim.decision === 'none' ? 'abstention' : 'transfer', statement,
    transitions: ['proposed', 'under_test', gate.status], status: gate.status,
    evidenceSha256: digest(history), verifier: 'act-map-evidence-gate', ...(gate.reason ? { reason: gate.reason } : {}), ...(outcome ? { outcome } : {}) };
}

// An answer cut off at the lab's token limit never arrived: like an unreadable answer it fails
// the case and makes no claim, and the run goes on. Repeating it would only repeat the long answer.
export async function answer(send, messages) {
  try { return { ai: await send(messages) }; } catch (error) {
    if (error instanceof ResearchError && error.message === 'model_output_truncated') return { problem: 'truncated' };
    throw error;
  }
}

export const actMapOutcome = (protocol, measured, passed) => ({ protocol, level: measured.level, passed,
  experimentsUsed: measured.experimentsUsed, baselineExperiments: measured.baseline.experiment_cost,
  baselinePassed: measured.baselinePassed, falseCertification: measured.falseCertification });

export async function runActMapExperiment(seed, propose, callTool, onCommit, options = {}) {
  // `budget` runs the same fixtures with at most two interventions (act-map-budget-v1).
  const protocol = options.budget ? ACT_MAP_BUDGET_PROTOCOL : ACT_MAP_PROTOCOL;
  const maxExperiments = options.budget ? BUDGET_EXPERIMENTS : MAX_EXPERIMENTS;
  const fixtures = makeActMapCases(seed), cases = [];
  // The design call carries no confidence: calibration scores the claim, which the inference call makes.
  const designPropose = options.designPropose ?? propose;
  await onCommit(fixtures.map((f, i) => ({ case: i + 1, level: f.view.level, sha256: f.commitment, protocol })));
  for (const [i, fixture] of fixtures.entries()) {
    const design = await answer(designPropose, designMessages(fixture, maxExperiments));
    const checkedDesign = design.ai ? checkDesign(design.ai.text, fixture, maxExperiments) : design;
    let history = [], claim = null, formatProblem = null, ai = design.ai ?? { provider: null, model: null };
    if (checkedDesign.problem) formatProblem = `design:${checkedDesign.problem}`;
    else {
      history = checkedDesign.design.experiments.map(e => ({ ...e, outcome: intervene(fixture, e.action, e.value) }));
      const inference = await answer(propose, inferenceMessages(fixture, named(fixture, history), null, maxExperiments));
      if (inference.ai) {
        ai = inference.ai;
        if (ai.provider !== design.ai.provider || ai.model !== design.ai.model) throw new ResearchError('model_changed', { case: i + 1 });
      }
      const checked = inference.ai ? checkInference(ai.text, fixture) : inference;
      if (checked.problem) formatProblem = `inference:${checked.problem}`;
      else claim = checked.claim;
    }
    const input = { fixture, proposed: claim?.proposed ?? null, history };
    const evidence = await callTool(input), result = validateActMap(evidence, input);
    const passed = actMapPasses(claim, fixture, result.gate);
    const truth = { scope: fixture.truth.scope, ...namedClaim(fixture, { mapping: fixture.truth.mapping, action_to_target: fixture.truth.action_to_target }) };
    const measured = { level: fixture.view.level, truth, gate: result.gate, baseline: result.baseline,
      baselinePassed: result.baseline.scope_correct && (fixture.truth.scope === 'none' || result.baseline.mapping_correct && result.baseline.accepted),
      falseCertification: result.gate.accepted && !passed, experimentsUsed: history.length,
      ...(options.budget ? { baselineWithinBudget: result.baseline.experiment_cost <= maxExperiments } : {}) };
    cases.push({ case: i + 1, level: fixture.view.level, commitment: fixture.commitment, data: publicTask(fixture, maxExperiments),
      proposal: { design: checkedDesign.design ?? null, decision: claim?.decision ?? null, ...namedClaim(fixture, claim?.proposed ?? null), reason: claim?.reason ?? null },
      provider: ai.provider, model: ai.model, experiments: named(fixture, history), evidence,
      hypothesisTest: { protocol, decision: passed ? 'correct_transfer_decision' : 'incorrect_transfer_decision', measured,
        independentlyVerified: true, verificationScope: 'python-evidence-gate-and-node-replay', familyInference: null },
      vem: vemRecord(fixture, claim, history, result.gate, formatProblem, protocol.id, actMapOutcome(protocol.id, measured, passed)),
      ...(formatProblem ? { formatProblem } : {}),
      initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
    await options.onProgress?.(structuredClone(cases));
  }
  return { schemaVersion: 2, promptVersion: protocol.id, researcher: 'Professor Oraklet',
    title: options.budget ? 'ACT-MAP under budget: två ingrepp' : 'ACT-MAP: överföring av en orsaksmekanism till ett okänt system',
    question: protocol.hypothesis,
    method: `Oraklet väljer själv högst ${maxExperiments === MAX_EXPERIMENTS ? 'tre' : 'två'} ingrepp per fall, ser utfallen och föreslår en koppling eller avstår. Evidensgrinden prövar påståendet med dolda ingreppsstorlekar; uppräkningsbaslinjen körs på samma fall.`,
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed',
    protocol, limitations: protocol.limitations, cases };
}

const decisionText = { full: 'full', partial: 'partiell', none: 'ingen', no_supported_transfer: 'ingen', unresolved: 'olöst' };
export function actMapSummary(m) {
  return `nivå ${m.level}: facit ${decisionText[m.truth.scope]}; grinden: ${m.gate.status}; ${m.experimentsUsed} ingrepp; uppräkningsbaslinjen ${m.baselinePassed ? 'rätt' : 'fel'} (${decisionText[m.baseline.decision]}, ${m.baseline.experiment_cost} ingrepp)`;
}
// Model text is shown as one code span.
const inert = v => '`' + String(v ?? '').replace(/`/g, "'").replace(/\s+/g, ' ').trim() + '`';
export function actMapMarkdown(cases) {
  const ids = [ACT_MAP_PROTOCOL.id, ACT_MAP_BUDGET_PROTOCOL.id];
  const selected = cases.filter(c => ids.includes(c.hypothesisTest?.protocol?.id));
  if (!selected.length) return '';
  const budget = selected[0].hypothesisTest.protocol.id === ACT_MAP_BUDGET_PROTOCOL.id;
  const ok = selected.filter(c => c.passed).length, base = selected.filter(c => c.hypothesisTest.measured.baselinePassed).length;
  return `\n\n## ACT-MAP${budget ? ' under budget (två ingrepp)' : ''}: Oraklet mot uppräkningsbaslinjen\n\n`
    + (budget ? `Uppräkningsbaslinjen klarade sig med högst två ingrepp i ${selected.filter(c => c.hypothesisTest.measured.baselineWithinBudget).length} av ${selected.length} fall.\n\n` : '')
    + `Oraklet ${ok}/${selected.length} rätt, uppräkningsbaslinjen ${base}/${selected.length}. Felaktigt godkända påståenden: ${selected.filter(c => c.hypothesisTest.measured.falseCertification).length}.\n\n`
    + '| Fall | Nivå | Oraklets ingrepp | Oraklets beslut | Facit | Grinden | Baslinjen |\n| --- | --- | --- | --- | --- | --- | --- |\n'
    + selected.map(c => {
      const m = c.hypothesisTest.measured;
      return `| ${c.case} | ${c.level} | ${c.experiments.map(e => `${e.intervention}=${e.value}`).join(', ') || '–'} | ${c.formatProblem ? 'oläsbart (' + c.formatProblem + ')' : decisionText[c.proposal.decision]} | ${decisionText[m.truth.scope]} | ${m.gate.status} | ${decisionText[m.baseline.decision]} (${m.baseline.experiment_cost} ingrepp) |`;
    }).join('\n')
    + '\n\n' + selected.filter(c => c.proposal.reason).map(c => `Fall ${c.case}, Oraklets motivering: ${inert(c.proposal.reason)}`).join('\n\n');
}
