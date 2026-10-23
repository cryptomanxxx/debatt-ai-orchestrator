import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ResearchError } from './errors.mjs';
import { digest, VALUES, HOLDOUT_VALUES, pythonEnv, parseJson, answer, named, namedClaim, checkDesign,
  actMapPasses, vemRecord, actMapOutcome } from './act-map.mjs';

// ACT-MAP with a mechanism Oraklet designs himself (research/ACT-MAP-LAB.md). Oraklet writes a
// declarative spec, never code: a linear, noise-free causal mechanism over 3-4 variables and a
// preregistered prediction about it (is it identifiable from value-1 interventions, and with how
// few). The spec and prediction are hashed before the lab analyses anything. The independent
// verifier (research/act_map_design.py, replayed here in Node) checks the prediction. When the
// design is identifiable, the lab hides it in two target systems (random names, unknown variable
// and intervention correspondence, one of them possibly with changed coefficients) and Oraklet
// investigates them as in ACT-MAP; the same verifier's evidence gate and enumeration baseline
// decide. Five model calls: the spec, then two calls per case.

export const ACT_MAP_DESIGN_PROTOCOL = Object.freeze({
  id: 'act-map-design-v1',
  hypothesis: 'Kan Oraklet själv utforma en orsaksmekanism, i förväg korrekt förutsäga om den går att identifiera med ingrepp, och sedan hitta den när labbet gömmer den i ett okänt system?',
  rule: 'Oraklet skriver en deklarativ specifikation (ingen kod): en linjär, brusfri mekanism över 3–4 variabler med heltalskoefficienter, skild från ACT-MAP:s fasta mekanism, och en förregistrerad förutsägelse: identifierbar med ingrepp med värdet 1 eller inte, och i så fall minsta antal ingrepp. Specifikationen hashas innan labbet analyserar den. Förutsägelsen godkänns när den oberoende uppräkningen ger samma svar. Är mekanismen identifierbar gömmer labbet den i två målsystem (det andra kan ha ändrade koefficienter) och Oraklet undersöker dem som i ACT-MAP; evidensgrinden prövar påståendet med dolda ingreppsstorlekar och uppräkningsbaslinjen körs på samma fall.',
  assumptions: 'Linjära, brusfria syntetiska mekanismer. Kanter går från lägre till högre index och s_0 är enda roten. Målsystemets namn är slumpade.',
  limitations: 'Syntetiskt och litet: högst fyra variabler och 576 möjliga kopplingar, så uppräkningsbaslinjen löser varje identifierbar design. Oraklet väljer själv svårigheten. Ingen verklig vetenskaplig upptäckt; "preliminärt stött" gäller bara den här familjen.',
});
export const DESIGN_COEFFICIENTS = Object.freeze([-4, -3, -2, -1, 1, 2, 3, 4]);
const STANDARD_EDGES = '0,1;0,2;1,2';

const sha = text => createHash('sha256').update(text).digest('hex');
function stream(seed, label) {
  let i = 0;
  return () => parseInt(sha(`${ACT_MAP_DESIGN_PROTOCOL.id}:${seed}:${label}:${i++}`).slice(0, 12), 16);
}
function shuffle(next, values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The lab's bounds on a spec, the same as act_map_design.validate_spec. Returns a problem code or null.
export function specProblem(spec) {
  if (!spec || typeof spec !== 'object' || Object.keys(spec).sort().join() !== 'edges,variables') return 'invalid_spec';
  const { variables: n, edges } = spec;
  if (![3, 4].includes(n) || !Array.isArray(edges) || edges.length < 2 || edges.length > 6) return 'invalid_spec';
  const seen = new Set();
  for (const e of edges) {
    if (!Array.isArray(e) || e.length !== 3 || !e.every(Number.isInteger) || !(e[0] >= 0 && e[0] < e[1] && e[1] < n)
      || !DESIGN_COEFFICIENTS.includes(e[2]) || seen.has(`${e[0]},${e[1]}`)) return 'invalid_spec';
    seen.add(`${e[0]},${e[1]}`);
  }
  const order = edges.map(e => e[0] * 10 + e[1]);
  if (order.some((v, i) => i && v < order[i - 1])) return 'invalid_spec';
  for (let k = 1; k < n; k++) if (!edges.some(e => e[1] === k)) return 'invalid_spec';
  if (n === 3 && [...seen].sort().join(';') === STANDARD_EDGES) return 'standard_mechanism';
  return null;
}

const names = n => Array.from({ length: n }, (_, i) => `s_${i}`);
export function specEquations(spec) {
  return names(spec.variables).slice(1).map((s, k) => `${s} = ` + spec.edges.filter(e => e[1] === k + 1)
    .map(e => `${e[2]}*s_${e[0]}`).join(' + ').replace(/\+ -/g, '- '));
}

// The answer format shown to Oraklet; it is itself a valid spec (tests check it parses).
export const SPEC_TEMPLATE = '{"variables":3,"edges":[{"from":"s_0","to":"s_1","coef":2},{"from":"s_0","to":"s_2","coef":-1}],"prediction":{"identifiable":true,"minInterventions":1},"reason":"kort svensk motivering"}';
export function specMessages() {
  return [
    { role: 'system', content: 'Du är Professor Oraklet och utformar själv ett experiment. Skriv en orsaksmekanism som en deklarativ specifikation, ingen kod: '
      + 'variables är 3 eller 4 (s_0, s_1, …), edges är 2–6 kanter {"from":"s_i","to":"s_j","coef":c} med i < j och heltal c i allowedCoefficients; s_0 är enda roten, så varje annan variabel har minst en förälder. '
      + 'Mekanismen är linjär och brusfri: varje variabel är summan av coef gånger föräldern, och ett ingrepp sätter en variabel till ett värde och bryter dess egen ekvation. Den får inte vara ACT-MAP:s fasta mekanism (tre variabler med kanterna s_0→s_1, s_1→s_2 och s_0→s_2). '
      + 'Labbet gömmer sedan mekanismen i ett okänt system med slumpade namn, där varken variablerna eller ingreppen är kända, och du ska hitta den med egna ingrepp. '
      + 'Förregistrera innan labbet analyserar: identifiable = om exakt en koppling (vilken målvariabel som är vilken s_i och vilket ingrepp som sätter vilken variabel) stämmer med utfallen när varje ingrepp görs en gång med värdet 1; '
      + 'minInterventions = det minsta antalet olika sådana ingrepp som räcker för att bara en koppling ska stämma, eller null om den inte är identifierbar. En symmetrisk mekanism kan vara omöjlig att identifiera. '
      + 'Svara endast JSON i det här formatet (exemplets värden visar bara formatet; förutsägelsen i exemplet är inte kontrollerad): '
      + SPEC_TEMPLATE + '.' },
    { role: 'user', content: JSON.stringify({ protocol: ACT_MAP_DESIGN_PROTOCOL.id, allowedVariables: [3, 4], allowedCoefficients: DESIGN_COEFFICIENTS, maxEdges: 6 }) },
  ];
}

// Oraklet's spec in the lab's form ({variables, edges: [[from, to, coef]]}, sorted) and his prediction.
export function checkSpec(text) {
  let p;
  try { p = parseJson(text); } catch { return { problem: 'not_json' }; }
  if (Object.keys(p).some(k => !['variables', 'edges', 'prediction', 'reason'].includes(k))) return { problem: 'extra_fields' };
  const index = v => typeof v === 'string' && /^s_[0-3]$/.test(v.trim()) ? Number(v.trim().slice(2)) : -1;
  if (!Array.isArray(p.edges) || p.edges.some(e => !e || typeof e !== 'object' || Object.keys(e).sort().join() !== 'coef,from,to'))
    return { problem: 'invalid_spec' };
  const edges = p.edges.map(e => [index(e.from), index(e.to), e.coef]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const spec = { variables: p.variables, edges };
  const problem = specProblem(spec);
  if (problem) return { problem };
  const pr = p.prediction;
  if (!pr || typeof pr !== 'object' || Object.keys(pr).sort().join() !== 'identifiable,minInterventions' || typeof pr.identifiable !== 'boolean'
    || (pr.identifiable ? !(Number.isInteger(pr.minInterventions) && pr.minInterventions >= 1 && pr.minInterventions <= spec.variables) : pr.minInterventions !== null))
    return { problem: 'invalid_prediction' };
  if (typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return { problem: 'invalid_reason' };
  return { spec, prediction: { identifiable: pr.identifiable, minInterventions: pr.minInterventions }, reason: p.reason.trim() };
}

function simulate(spec, coefficients, role, value) {
  const x = Array(spec.variables).fill(0);
  for (let k = 0; k < spec.variables; k++)
    x[k] = k === role ? value : spec.edges.reduce((sum, e, i) => e[1] === k ? sum + coefficients[i] * x[e[0]] : sum, 0);
  return x;
}
const sourceCoefficients = spec => spec.edges.map(e => e[2]);
const place = (x, mapping) => { const out = Array(x.length).fill(0); x.forEach((v, k) => { out[mapping[k]] = v; }); return out; };
// The private oracle on the hidden target, and what a full-transfer hypothesis predicts.
export function interveneDesign(fixture, action, value) {
  const { spec } = fixture.view, t = fixture.truth;
  if (!(action >= 0 && action < spec.variables) || ![...VALUES, ...HOLDOUT_VALUES].includes(value)) throw new ResearchError('invalid_tool_evidence');
  return place(simulate(spec, t.target_coefficients, t.mapping.indexOf(t.action_to_target[action]), value), t.mapping);
}
export const predictDesign = (spec, h, action, value) =>
  place(simulate(spec, sourceCoefficients(spec), h.mapping.indexOf(h.action_to_target[action]), value), h.mapping);
function permutations(n) {
  if (n === 1) return [[0]];
  return permutations(n - 1).flatMap(p => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}
const hypotheses = n => permutations(n).flatMap(mapping => permutations(n).map(action_to_target => ({ mapping, action_to_target })));
const same = (a, b) => String(a) === String(b);
const fitsAll = (spec, h, history) => history.every(r => same(predictDesign(spec, h, r.action, r.value), r.outcome));
const hasChild = (spec, role) => spec.edges.some(e => e[0] === role);

// The Node replay of act_map_design.analyze: the result is only accepted when both agree.
export function analyzeSpec(spec) {
  const n = spec.variables, identity = [...Array(n).keys()];
  const canonicalFixture = { view: { spec }, truth: { mapping: identity, action_to_target: identity, target_coefficients: sourceCoefficients(spec) } };
  const outcome = identity.map(a => interveneDesign(canonicalFixture, a, 1)), all = hypotheses(n);
  const consistent = actions => all.filter(h => fitsAll(spec, h, actions.map(a => ({ action: a, value: 1, outcome: outcome[a] })))).length;
  const subsets = k => k === 0 ? [[]] : identity.flatMap(a => subsets(k - 1).filter(s => !s.length || s[0] > a).map(s => [a, ...s]));
  const remaining = consistent(identity);
  let minimum = null;
  if (remaining === 1) for (let k = 1; k <= n && minimum === null; k++) if (subsets(k).some(s => consistent(s) === 1)) minimum = k;
  return { identifiable: remaining === 1, minInterventions: minimum, consistentAfterAll: remaining };
}

// Two hidden targets for an identifiable design. Instance 0 transfers fully; instance 1 is drawn
// as full or none. "None" changes one coefficient so that no correspondence fits all value-1
// interventions, which the lab checks before committing.
export function makeDesignFixture(seed, spec, instance) {
  const next = stream(seed, `${digest(spec)}:${instance}`), n = spec.variables;
  const label = prefix => Array.from({ length: n }, () => `${prefix}_${next().toString(16).padStart(12, '0').slice(-9)}`);
  const targetVariables = label('v'), targetInterventions = label('act');
  if (new Set([...targetVariables, ...targetInterventions]).size !== 2 * n) throw new ResearchError('invalid_tool_evidence');
  const mapping = shuffle(next, [...Array(n).keys()]), actionToTarget = shuffle(next, [...Array(n).keys()]);
  const scope = instance === 0 ? 'full' : ['full', 'none'][next() % 2];
  let coefficients = sourceCoefficients(spec);
  const view = { protocol: ACT_MAP_DESIGN_PROTOCOL.id, spec, max_experiments: n, target_variables: targetVariables, target_interventions: targetInterventions };
  if (scope === 'none') {
    const candidates = spec.edges.flatMap((e, i) => [5, -5, 6].map(d => coefficients.map((c, j) => j === i ? c + d : c)));
    coefficients = candidates.find(cs => {
      const f = { view, truth: { mapping, action_to_target: actionToTarget, target_coefficients: cs } };
      const history = [...Array(n).keys()].map(a => ({ action: a, value: 1, outcome: interveneDesign(f, a, 1) }));
      return !hypotheses(n).some(h => fitsAll(spec, h, history));
    });
    if (!coefficients) throw new ResearchError('invalid_tool_evidence');
  }
  const truth = { mapping, action_to_target: actionToTarget, scope, target_coefficients: coefficients };
  return { view, truth, commitment: digest({ view, truth }) };
}

// The Node replay of the evidence gate; its status must equal the Python gate's.
export function gateDesign(fixture, proposed, history) {
  if (proposed === null) return { status: 'unresolved', accepted: false };
  const { view } = fixture, { spec } = view, n = spec.variables;
  const perm = list => Array.isArray(list) && list.length === n && same([...list].sort(), [...Array(n).keys()]) && list.every(Number.isInteger);
  const reject = { status: 'rejected', accepted: false };
  if (proposed?.scope !== 'full' || !perm(proposed.mapping) || !perm(proposed.action_to_target)) return reject;
  if (history.length > view.max_experiments || history.some(r => !VALUES.includes(r.value) || !same(r.outcome, interveneDesign(fixture, r.action, r.value)))) return reject;
  if (new Set(history.map(r => r.action)).size < 2) return reject;
  const roleOf = a => proposed.mapping.indexOf(proposed.action_to_target[a]);
  const tested = new Set(history.map(r => roleOf(r.action)));
  if ([...Array(n).keys()].some(role => hasChild(spec, role) && !tested.has(role))) return reject;
  if (!fitsAll(spec, proposed, history)) return reject;
  for (let a = 0; a < n; a++) if (hasChild(spec, roleOf(a)))
    for (const value of HOLDOUT_VALUES) if (!same(predictDesign(spec, proposed, a, value), interveneDesign(fixture, a, value))) return reject;
  return { status: 'provisionally_supported', accepted: true };
}

const designScript = fileURLToPath(new URL('./act_map_design.py', import.meta.url));
export function callActMapDesign(input) {
  const raw = JSON.stringify(input);
  if (Buffer.byteLength(raw) > 16384) return Promise.reject(new ResearchError('invalid_tool_evidence'));
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.RESEARCH_PYTHON || 'python3', ['-I', designScript],
      { timeout: 30000, maxBuffer: 65536, env: pythonEnv() }, (error, stdout) => {
        if (error) return reject(new ResearchError('tool_transport_error'));
        try { resolve({ ...JSON.parse(stdout), inputSha256: digest(input) }); }
        catch { reject(new ResearchError('invalid_tool_evidence')); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(raw);
  });
}
const checkEvidence = (evidence, input) => {
  if (evidence?.tool !== 'act-map-design' || evidence.adapterVersion !== ACT_MAP_DESIGN_PROTOCOL.id || evidence.inputSha256 !== digest(input) || !evidence.result)
    throw new ResearchError('invalid_tool_evidence');
  return evidence.result;
};
export function validateAnalysis(evidence, input) {
  const a = checkEvidence(evidence, input).analysis, mine = analyzeSpec(input.spec);
  if (!a || digest(a.spec) !== digest(input.spec) || a.identifiable !== mine.identifiable
    || a.minInterventions !== mine.minInterventions || a.consistentAfterAll !== mine.consistentAfterAll) throw new ResearchError('invalid_tool_evidence');
  return mine;
}
export function validateDesignGate(evidence, input) {
  const result = checkEvidence(evidence, input), gate = result.gate, baseline = result.baseline;
  if (digest({ view: input.fixture.view, truth: input.fixture.truth }) !== input.fixture.commitment
    || !gate || typeof gate.accepted !== 'boolean' || typeof gate.status !== 'string'
    || !baseline || !['full', 'none', 'unresolved'].includes(baseline.decision) || typeof baseline.mapping_correct !== 'boolean')
    throw new ResearchError('invalid_tool_evidence');
  const alternate = gateDesign(input.fixture, input.proposed, input.history);
  if (alternate.status !== gate.status || alternate.accepted !== gate.accepted) throw new ResearchError('invalid_tool_evidence');
  return result;
}

// What Oraklet sees when he investigates: his own mechanism, the target names and the budget.
export function designTask(fixture) {
  const { view } = fixture;
  return { protocol: view.protocol, source: { equations: specEquations(view.spec), note: 'Din egen mekanism. Brusfritt. Utan ingrepp är alla variabler 0. Ett ingrepp sätter en variabel till ett värde och bryter dess egen ekvation.' },
    targetVariables: view.target_variables, targetInterventions: view.target_interventions, allowedValues: VALUES,
    maxExperiments: view.max_experiments, allowedDecisions: ['full', 'none'] };
}
const DESIGN_SYSTEM = 'Du är Professor Oraklet och undersöker om mekanismen du själv utformade finns i ett okänt målsystem. Målsystemets namn är slumpade och säger inget om rollerna. Ett ingrepp sätter en målvariabel till ett värde; du ser sedan alla målvariablernas värden. ';
export function investigationMessages(fixture) {
  return [
    { role: 'system', content: DESIGN_SYSTEM + `Välj först dina experiment: 1–${fixture.view.max_experiments} ingrepp, vart och ett ett av targetInterventions med ett av allowedValues. Svara endast JSON: {"experiments":[{"intervention":"<namn>","value":1}],"reason":"kort svensk motivering"}.` },
    { role: 'user', content: JSON.stringify(designTask(fixture)) },
  ];
}
export function claimMessages(fixture, results) {
  const roles = names(fixture.view.spec.variables);
  return [
    { role: 'system', content: DESIGN_SYSTEM + 'Du ser resultaten av dina ingrepp. Avgör om din mekanism finns i målsystemet. "full": den gäller med dina koefficienter; ange vilken målvariabel som motsvarar '
      + roles.join(', ') + ' och vilken målvariabel varje ingrepp sätter. "none": den stöds inte; då är mapping och interventions null. Ditt påstående prövas med ingreppsstorlekar du inte har sett. '
      + `Svara endast JSON: {"decision":"full","mapping":{${roles.map(r => `"${r}":"<målvariabel>"`).join(',')}},"interventions":{"<ingrepp>":"<målvariabel>"},"reason":"kort svensk motivering"}.` },
    { role: 'user', content: JSON.stringify({ task: designTask(fixture), results }) },
  ];
}
export function checkClaim(text, fixture) {
  let p;
  try { p = parseJson(text); } catch { return { problem: 'not_json' }; }
  if (Object.keys(p).some(k => !['decision', 'mapping', 'interventions', 'reason'].includes(k))) return { problem: 'extra_fields' };
  const decision = typeof p.decision === 'string' ? p.decision.trim().toLowerCase() : null;
  if (!['full', 'none'].includes(decision)) return { problem: 'invalid_decision' };
  if (typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return { problem: 'invalid_reason' };
  if (decision === 'none') return { claim: { decision, proposed: null, reason: p.reason.trim() } };
  const { target_variables: variables, target_interventions: actions } = fixture.view, roles = names(fixture.view.spec.variables);
  const index = name => variables.indexOf(typeof name === 'string' ? name.trim() : null);
  const mapping = roles.map(s => index(p.mapping?.[s]));
  if (!p.mapping || typeof p.mapping !== 'object' || Object.keys(p.mapping).length !== roles.length || mapping.includes(-1) || new Set(mapping).size !== roles.length)
    return { problem: 'invalid_mapping' };
  const actionToTarget = actions.map(a => index(p.interventions?.[a]));
  if (!p.interventions || typeof p.interventions !== 'object' || Object.keys(p.interventions).length !== actions.length
    || actionToTarget.includes(-1) || new Set(actionToTarget).size !== actions.length) return { problem: 'invalid_interventions' };
  return { claim: { decision, proposed: { scope: 'full', mapping, action_to_target: actionToTarget }, reason: p.reason.trim() } };
}

export async function runActMapDesignExperiment(seed, propose, callTool, onCommit, options = {}) {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  const protocol = ACT_MAP_DESIGN_PROTOCOL, cases = [];
  // The spec is a claim with a confidence; the investigation's design call is not.
  const designPropose = options.designPropose ?? propose;
  const written = await answer(propose, specMessages());
  const checked = written.ai ? checkSpec(written.ai.text) : written;
  const identity = written.ai ? { provider: written.ai.provider, model: written.ai.model } : { provider: null, model: null };
  const same = next => { if (identity.provider && (next.provider !== identity.provider || next.model !== identity.model)) throw new ResearchError('model_changed'); };
  // The spec and the prediction are committed, in full, before the lab analyses them: a failed or
  // inconvenient analysis can never make the prediction disappear. The targets are committed
  // separately once built, before the investigation.
  const preregistration = checked.spec ? { spec: checked.spec, prediction: checked.prediction, sha256: digest({ protocol: protocol.id, spec: checked.spec, prediction: checked.prediction }) } : null;
  const committed = { protocol: protocol.id, preregistration, fixtures: [] };
  await onCommit(structuredClone(committed));
  let analysis = null, fixtures = [];
  if (preregistration) {
    analysis = validateAnalysis(await callTool({ op: 'analyze', spec: checked.spec }), { op: 'analyze', spec: checked.spec });
    if (analysis.identifiable) fixtures = [0, 1].map(i => makeDesignFixture(seed, checked.spec, i));
    if (fixtures.length) await onCommit({ ...committed, fixtures: fixtures.map((f, i) => ({ case: i + 2, sha256: f.commitment })) });
  }
  const predicted = preregistration && checked.prediction.identifiable === analysis.identifiable && checked.prediction.minInterventions === analysis.minInterventions;
  const reason = !preregistration ? null : checked.prediction.identifiable !== analysis.identifiable ? 'identifiability_mispredicted'
    : checked.prediction.minInterventions !== analysis.minInterventions ? 'min_interventions_mispredicted' : null;
  const status = preregistration ? (predicted ? 'provisionally_supported' : 'rejected') : 'unresolved';
  const formatProblem = checked.problem ? `spec:${checked.problem}` : null;
  cases.push({ case: 1, kind: 'design', data: { protocol: protocol.id }, provider: identity.provider, model: identity.model,
    proposal: { spec: checked.spec ?? null, equations: checked.spec ? specEquations(checked.spec) : null, prediction: checked.prediction ?? null, reason: checked.reason ?? null },
    preregistration, analysis,
    hypothesisTest: { protocol, decision: predicted ? 'correct_design_prediction' : 'incorrect_design_prediction',
      measured: { kind: 'design', analysis, prediction: checked.prediction ?? null, investigated: fixtures.length > 0 },
      independentlyVerified: true, verificationScope: 'python-enumeration-and-node-replay', familyInference: null },
    vem: preregistration
      ? { claimId: preregistration.sha256, kind: 'design', statement: { equations: specEquations(checked.spec), prediction: checked.prediction },
        transitions: ['proposed', 'under_test', status], status, evidenceSha256: digest(analysis), verifier: 'act-map-design-analysis', ...(reason ? { reason } : {}) }
      : { claimId: digest({ protocol: protocol.id, noAnswer: formatProblem }), kind: 'no_answer', transitions: ['unanswered'], status: 'unresolved', reason: formatProblem, evidenceSha256: digest(null) },
    ...(formatProblem ? { formatProblem } : {}), initialPassed: Boolean(predicted), passed: Boolean(predicted), correctionAttempted: false, sameModel: true });
  await options.onProgress?.(structuredClone(cases));

  for (const [i, fixture] of fixtures.entries()) {
    let history = [], claim = null, problem = null, ai = identity;
    const design = await answer(designPropose, investigationMessages(fixture));
    if (design.ai) same(design.ai);
    const plan = design.ai ? checkDesign(design.ai.text, fixture) : design;
    if (plan.problem) problem = `design:${plan.problem}`;
    else {
      history = plan.design.experiments.map(e => ({ ...e, outcome: interveneDesign(fixture, e.action, e.value) }));
      const inference = await answer(propose, claimMessages(fixture, named(fixture, history)));
      if (inference.ai) { same(inference.ai); ai = inference.ai; }
      const result = inference.ai ? checkClaim(inference.ai.text, fixture) : inference;
      if (result.problem) problem = `inference:${result.problem}`;
      else claim = result.claim;
    }
    const input = { op: 'gate', fixture, proposed: claim?.proposed ?? null, history };
    const evidence = await callTool(input), result = validateDesignGate(evidence, input);
    const passed = actMapPasses(claim, fixture, result.gate);
    const truth = { scope: fixture.truth.scope, ...namedClaim(fixture, { mapping: fixture.truth.mapping, action_to_target: fixture.truth.action_to_target }) };
    // Level 3 in DeepRAP terms: neither the variables nor the interventions are known.
    const measured = { level: 3, variables: fixture.view.spec.variables, truth, gate: result.gate, baseline: result.baseline,
      baselinePassed: result.baseline.scope_correct && (fixture.truth.scope === 'none' || result.baseline.mapping_correct),
      falseCertification: result.gate.accepted && !passed, experimentsUsed: history.length };
    cases.push({ case: i + 2, kind: 'investigation', level: 3, commitment: fixture.commitment, data: designTask(fixture),
      proposal: { design: plan.design ?? null, decision: claim?.decision ?? null, ...namedClaim(fixture, claim?.proposed ?? null), reason: claim?.reason ?? null },
      provider: ai.provider, model: ai.model, experiments: named(fixture, history), evidence,
      hypothesisTest: { protocol, decision: passed ? 'correct_transfer_decision' : 'incorrect_transfer_decision', measured,
        independentlyVerified: true, verificationScope: 'python-evidence-gate-and-node-replay', familyInference: null },
      vem: vemRecord(fixture, claim, history, result.gate, problem, protocol.id, actMapOutcome(protocol.id, measured, passed)),
      ...(problem ? { formatProblem: problem } : {}), initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
    await options.onProgress?.(structuredClone(cases));
  }
  return { schemaVersion: 2, promptVersion: protocol.id, researcher: 'Professor Oraklet',
    title: 'ACT-MAP: Oraklet utformar en egen orsaksmekanism och undersöker den',
    question: protocol.hypothesis,
    method: 'Oraklet skriver en deklarativ mekanism och en förregistrerad förutsägelse om dess identifierbarhet. Labbet kontrollerar förutsägelsen med uppräkning, gömmer en identifierbar mekanism i två målsystem och låter Oraklet undersöka dem; evidensgrinden och uppräkningsbaslinjen avgör.',
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed', protocol, limitations: protocol.limitations, cases };
}

export function actMapDesignSummary(m) {
  if (m.kind === 'design') return m.analysis
    ? `egen mekanism: ${m.analysis.identifiable ? `identifierbar med minst ${m.analysis.minInterventions} ingrepp` : `inte identifierbar (${m.analysis.consistentAfterAll} kopplingar stämmer)`}; Oraklet förutsade ${m.prediction.identifiable ? `identifierbar med ${m.prediction.minInterventions}` : 'inte identifierbar'}`
    : 'ingen giltig mekanism';
  return `egen mekanism, ${m.variables} variabler: facit ${m.truth.scope === 'full' ? 'full' : 'ingen'}; grinden: ${m.gate.status}; ${m.experimentsUsed} ingrepp; uppräkningsbaslinjen ${m.baselinePassed ? 'rätt' : 'fel'} (${m.baseline.experiment_cost} ingrepp)`;
}
const inert = v => '`' + String(v ?? '').replace(/`/g, "'").replace(/\s+/g, ' ').trim() + '`';
export function actMapDesignMarkdown(cases) {
  const selected = cases.filter(c => c.hypothesisTest?.protocol?.id === ACT_MAP_DESIGN_PROTOCOL.id);
  const design = selected.find(c => c.kind === 'design');
  if (!design) return '';
  const p = design.proposal, a = design.analysis;
  const lines = ['\n\n## ACT-MAP: Oraklets egen mekanism\n'];
  if (!p.spec) lines.push(`Ingen giltig mekanism (${design.formatProblem}).`);
  else {
    lines.push(`Mekanism (förregistrerad, SHA-256 \`${design.preregistration.sha256.slice(0, 12)}…\`): ${p.equations.map(inert).join(', ')}.`, '',
      `Oraklets förutsägelse: ${p.prediction.identifiable ? `identifierbar med minst ${p.prediction.minInterventions} ingrepp` : 'inte identifierbar'}. `
      + `Uppräkningen: ${a.identifiable ? `identifierbar med minst ${a.minInterventions} ingrepp` : `inte identifierbar; ${a.consistentAfterAll} kopplingar stämmer efter alla ingrepp`}. `
      + `Förutsägelsen ${design.passed ? 'stämde' : 'stämde inte'}.`, '');
    const inv = selected.filter(c => c.kind === 'investigation');
    if (!inv.length) lines.push('Mekanismen är inte identifierbar, så labbet gömde den inte i något målsystem.');
    else lines.push('| Fall | Oraklets ingrepp | Oraklets beslut | Facit | Grinden | Baslinjen |', '| --- | --- | --- | --- | --- | --- |',
      ...inv.map(c => { const m = c.hypothesisTest.measured;
        return `| ${c.case} | ${c.experiments.map(e => `${e.intervention}=${e.value}`).join(', ') || '–'} | ${c.formatProblem ? 'oläsbart (' + c.formatProblem + ')' : c.proposal.decision === 'full' ? 'full' : 'ingen'} | ${m.truth.scope === 'full' ? 'full' : 'ingen'} | ${m.gate.status} | ${m.baseline.decision} (${m.baseline.experiment_cost} ingrepp) |`; }));
    if (p.reason) lines.push('', `Oraklets motivering för mekanismen: ${inert(p.reason)}`);
  }
  return lines.join('\n');
}
