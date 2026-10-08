import { createHash } from 'node:crypto';
import { ResearchError } from './errors.mjs';
import { GLUCOSE_PROTOCOL, makeGlucoseCases, simulate, forecast } from './glucose.mjs';

const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const factors = Object.freeze([0.7, 1, 1.3]);
const improves = metrics => metrics.every(m => m.adaptiveMse < m.fixedMse - 1e-8);
export const GLUCOSE_ROBUSTNESS_PROTOCOL = Object.freeze({
  id: 'synthetic-absorption-robustness-v1',
  hypothesis: 'Kvarstår fördelen med adaptiva 30–60-minutersprognoser när måltidsuppgifter och antagen insulinkänslighet är felaktiga?',
  rule: 'Tre absorptionstakter med samma verkliga dos, måltid, känslighet och mätfel. Per takt: 3 × 3 kombinationer av rapporterad måltid och antagen känslighet (0.7, 1, 1.3 gånger facit). Fördelen kräver lägre MSE vid BÅDE 30 och 60 minuter med marginal 1e-8. Klassificera de åtta felaktiga kombinationerna som adaptive_improves_all, adaptive_improves_some eller adaptive_improves_none. Den korrekta kombinationen är separat kontroll. Inga signifikanstester; Oraklets förslag bedöms separat.',
  assumptions: GLUCOSE_PROTOCOL.assumptions + ' Felen gäller endast prognosmodellernas indata; simuleringens verkliga fysiologi och förlopp hålls fasta. Fast och adaptiv modell får samma felaktiga uppgifter och samma observationer. Felen är fasta under varje förlopp.',
  limitations: GLUCOSE_PROTOCOL.limitations + ' ±30 procent är förutbestämda stresstestnivåer, inte empiriska felintervall. Ingen osäkerhet i måltidstid, dos eller aktivitet testas. Andelen förbättrade kombinationer är inte en patientsannolikhet. Överlappande prognosursprung är inte oberoende replikat. Alla sanna absorptionstakter finns i kandidatgridden.',
});

export function makeGlucoseRobustnessCases(seed) {
  return makeGlucoseCases(seed).map(f => ({ id: f.id,
    input: { parameters: f.input, mode: 'grid' },
    commitment: hash({ seed, parameters: f.input, protocol: GLUCOSE_ROBUSTNESS_PROTOCOL, factors }),
  }));
}

export function evaluateGlucoseRobustness(input, solver = 'rk4', step = 0.25) {
  if (!input || Object.keys(input).sort().join(',') !== 'mode,parameters'
      || !['grid', 'clean'].includes(input.mode)) throw new ResearchError('invalid_tool_evidence');
  const p = input.parameters;
  // simulate validates the true parameters. Only the forecast inputs below change.
  const curve = simulate(p, solver, step);
  const observations = curve.map((r, j) => ({ minute: r.minute,
    glucose: r.glucose + p.noise * Math.sin(j * 1.7) }));
  const { rate, ...known } = p;
  const selected = input.mode === 'grid' ? factors : [1];
  const conditions = [];
  for (const mealFactor of selected) for (const sensitivityFactor of selected) {
    const reported = { ...known, meal: known.meal * mealFactor,
      sensitivity: known.sensitivity * sensitivityFactor };
    // The predictor receives neither the true rate nor true meal/sensitivity.
    const forecasts = forecast(observations, reported, solver, step);
    const horizonMetrics = [30, 60].map(horizon => {
      let fixed = 0, adaptive = 0;
      for (const row of forecasts) {
        const truth = curve[(row.minute + horizon) / 5].glucose;
        fixed += (row.predictions[horizon].fixed - truth) ** 2;
        adaptive += (row.predictions[horizon].adaptive - truth) ** 2;
      }
      return { horizon, fixedMse: fixed / forecasts.length,
        adaptiveMse: adaptive / forecasts.length, count: forecasts.length };
    });
    conditions.push({ mealFactor, sensitivityFactor, reported, horizonMetrics,
      decision: improves(horizonMetrics) ? 'adaptive_improves_both' : 'mixed_or_no_improvement', forecasts });
  }
  const clean = conditions.find(c => c.mealFactor === 1 && c.sensitivityFactor === 1);
  for (const c of conditions) {
    c.mseDifferenceFromClean = c.horizonMetrics.map((m, i) => ({ horizon: m.horizon,
      fixed: m.fixedMse - clean.horizonMetrics[i].fixedMse,
      adaptive: m.adaptiveMse - clean.horizonMetrics[i].adaptiveMse }));
  }
  const stress = conditions.filter(c => c !== clean);
  const improved = stress.filter(c => c.decision === 'adaptive_improves_both').length;
  const decision = !stress.length ? 'clean_control'
    : improved === stress.length ? 'adaptive_improves_all'
    : improved ? 'adaptive_improves_some' : 'adaptive_improves_none';
  const robustness = clean.decision !== 'adaptive_improves_both' ? 'no_clean_advantage'
    : !stress.length ? 'not_tested' : improved === stress.length ? 'preserved_all'
    : improved ? 'preserved_some' : 'lost_all';
  return { decision, robustness, cleanDecision: clean.decision,
    improvedConditions: improved, stressConditions: stress.length, conditions, curve, observations };
}

export async function callGlucoseRobustness(input) {
  return { tool: 'glucose-robustness-simulator', adapterVersion: GLUCOSE_ROBUSTNESS_PROTOCOL.id,
    inputSha256: hash(input), result: evaluateGlucoseRobustness(input) };
}
function closeTree(a, b, tolerance) {
  if (typeof a === 'number') return Number.isFinite(a) && typeof b === 'number'
    && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
  if (a === null || typeof a !== 'object') return a === b;
  return b !== null && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
    && Object.keys(a).join(',') === Object.keys(b).join(',')
    && Object.keys(a).every(k => closeTree(a[k], b[k], tolerance));
}
export function validateGlucoseRobustness(e, input) {
  if (e?.tool !== 'glucose-robustness-simulator'
      || e.adapterVersion !== GLUCOSE_ROBUSTNESS_PROTOCOL.id || e.inputSha256 !== hash(input)
      || !closeTree(e.result, evaluateGlucoseRobustness(input, 'midpoint', 0.125), 0.0001)
      || !closeTree(e.result, evaluateGlucoseRobustness(input, 'rk4', 0.125), 0.000001))
    throw new ResearchError('invalid_tool_evidence');
  return e.result;
}
export function parseGlucoseRobustnessProposal(text) {
  try {
    const p = JSON.parse(text);
    if (Object.keys(p).sort().join(',') !== 'cleanDecision,reason,stressDecision'
        || !['adaptive_improves_both', 'mixed_or_no_improvement'].includes(p.cleanDecision)
        || !['adaptive_improves_all', 'adaptive_improves_some', 'adaptive_improves_none'].includes(p.stressDecision)
        || typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return null;
    return p;
  } catch { return null; }
}

export async function runGlucoseRobustnessExperiment(seed, propose, callTool, onCommit, options = {}) {
  const fixtures = makeGlucoseRobustnessCases(seed), cases = [];
  await onCommit(fixtures.map(f => ({ case: f.id, sha256: f.commitment,
    protocol: GLUCOSE_ROBUSTNESS_PROTOCOL, factors })));
  for (const f of fixtures) {
    const ai = await propose([
      { role: 'system', content: 'Du är Professor Oraklet. Förutsäg det låsta syntetiska stresstestets utfall innan resultat visas. Svara endast JSON: cleanDecision:"adaptive_improves_both"|"mixed_or_no_improvement", stressDecision:"adaptive_improves_all"|"adaptive_improves_some"|"adaptive_improves_none", reason:kort svensk motivering. Inga kliniska slutsatser.' },
      { role: 'user', content: JSON.stringify({ protocol: GLUCOSE_ROBUSTNESS_PROTOCOL,
        input: f.input, factors,
        equations: 'S1=-ka*S1; S2=ka*(S1-S2); I=ka*S2-0.04*I; X=0.03*(sensitivity*I-X); G=-0.012*G-X+0.025*M; M=-0.025*M',
        forecastMethod: 'Filterbank ka=[0.012,0.024,0.048], likformig prior. Skalär Kalmanuppdatering av G var femte minut (initial varians 0.001, processvarians 0.00005, mätvarians noise²). Fast ka=0.024. Båda får samma felaktiga måltid/känslighet och samma sinusbrus noise*sin(j*1.7). Ursprung 30–240 minuter var femte minut. Endast absorption anpassas; inga framtida observationer används.' }) },
    ]);
    const proposal = parseGlucoseRobustnessProposal(ai.text);
    if (!proposal) throw new ResearchError('invalid_model_proposal');
    const evidence = await callTool(f.input), measured = validateGlucoseRobustness(evidence, f.input);
    const controlInput = { parameters: f.input.parameters, mode: 'clean' };
    const controlEvidence = await callTool(controlInput);
    const control = validateGlucoseRobustness(controlEvidence, controlInput);
    const clean = measured.conditions.find(c => c.mealFactor === 1 && c.sensitivityFactor === 1);
    if (!closeTree(clean, control.conditions[0], 0) || !closeTree(measured.curve, control.curve, 0)
        || !closeTree(measured.observations, control.observations, 0)) throw new ResearchError('invalid_tool_evidence');
    const passed = proposal.cleanDecision === measured.cleanDecision && proposal.stressDecision === measured.decision;
    cases.push({ case: f.id, commitment: f.commitment, data: f.input, proposal,
      provider: ai.provider, model: ai.model, evidence, controlEvidence,
      hypothesisTest: { protocol: GLUCOSE_ROBUSTNESS_PROTOCOL, decision: measured.decision,
        measured, independentlyVerified: true, familyInference: null },
      initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
    await options.onProgress?.(structuredClone(cases));
  }
  return { schemaVersion: 2, promptVersion: GLUCOSE_ROBUSTNESS_PROTOCOL.id,
    researcher: 'Professor Oraklet', title: 'Insulinabsorption: robusthet mot felaktiga måltids- och känslighetsuppgifter',
    question: GLUCOSE_ROBUSTNESS_PROTOCOL.hypothesis,
    method: 'Låst 3 × 3 stresstest per absorptionstakt, parade fasta/adaptiva prognoser, separat korrekt kontroll och två numeriska kontrollmetoder. passed gäller Oraklets förslag.',
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed',
    protocol: GLUCOSE_ROBUSTNESS_PROTOCOL, limitations: GLUCOSE_ROBUSTNESS_PROTOCOL.limitations, cases };
}

export function glucoseRobustnessMarkdown(cases) {
  const rows = cases.filter(c => c.hypothesisTest?.protocol?.id === GLUCOSE_ROBUSTNESS_PROTOCOL.id);
  if (!rows.length) return '';
  return '\n\n## Alla stresstestkombinationer\n\nMultiplikatorerna gäller prognosindata, inte det verkliga förloppet. 1 × 1 är korrekt kontroll. Varje MSE beräknas över 43 överlappande prognosursprung. Negativ MSE-skillnad betyder förbättring jämfört med samma metod med korrekta uppgifter.\n\n'
    + rows.map(c => {
      const m = c.hypothesisTest.measured;
      return `### Fall ${c.case}: absorption ${c.data.parameters.rate}\n\nAdaptiv fördel i ${m.improvedConditions}/${m.stressConditions} felaktiga kombinationer. Robusthet från korrekt kontroll: ${m.robustness}.\n\n`
        + '| Måltid × | Känslighet × | Horisont | Fast MSE | Adaptiv MSE | Δ fast mot korrekt | Δ adaptiv mot korrekt | Fördel vid båda horisonterna |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'
        + m.conditions.flatMap(condition => condition.horizonMetrics.map((v, i) => {
          const d = condition.mseDifferenceFromClean[i];
          return `| ${condition.mealFactor} | ${condition.sensitivityFactor} | ${v.horizon} min | ${v.fixedMse.toPrecision(5)} | ${v.adaptiveMse.toPrecision(5)} | ${d.fixed.toPrecision(5)} | ${d.adaptive.toPrecision(5)} | ${condition.decision === 'adaptive_improves_both' ? 'Ja' : 'Nej'} |`;
        })).join('\n');
    }).join('\n\n');
}
