import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ResearchError } from './errors.mjs';
import { forecastShapeRows } from './insulin-curve-shape.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const EXTERNAL_DATA_SHA256 = 'c5247714f0b7ab7cee2e1d73ed86ac48f31d826910f060542bdbe774f17b0173';
const bytes = readFileSync(new URL('./data/insulin-aspart-external.json', import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !== EXTERNAL_DATA_SHA256)
  throw new ResearchError('invalid_tool_evidence');
const data = JSON.parse(bytes);
const lockBytes = readFileSync(new URL('./data/insulin-external-analysis-lock.md', import.meta.url));
if (createHash('sha256').update(lockBytes).digest('hex') !== data.analysisLock.sha256)
  throw new ResearchError('invalid_tool_evidence');
const ARMS = ['unheated', 'heated'], ORIGINS = [30, 60, 90];
const PATTERNS = ['central', 'both_up', 'both_down', 'heated_up', 'heated_down'];
export const EXTERNAL_PROTOCOL = Object.freeze({
  id: 'insulin-external-curve-v1', dataSha256: EXTERNAL_DATA_SHA256, analysisLockSha256: data.analysisLock.sha256,
  hypothesis: 'Håller exponent-2-kurvans prognosfördel på en separat publicerad aspartfigur, i båda grupperna och vid både 30 och 60 minuter?',
  rule: 'Specifikation låst lokalt före figuravläsning och första prognosberäkning. Samma fasta exponenter 1/2, fyra parametrar, tau-grid 10,12,...,180 och ursprung 30/60/90 minuter som tidigare. Endast prefix anpassas. Primär fördel kräver lägre kvadratfel än BÅDE exponent 1 och persistens vid BÅDA horisonterna i BÅDA grupperna, marginal 1e-8. Sammanvägd MSE och gruppbeslut redovisas separat. Fem fasta ±2 uU/mL-mönster; inga signifikanstester eller modellval på framtida fel.',
  assumptions: 'Figur 2, DOI 10.1089/dia.2013.0187; manuellt avlästa insulininkrement, 16 deltagare för PK. Lokal uppvärmning till 40 °C från -15 till +60 minuter. C(t)=A*(t/tau)^p*exp(p*(1-t/tau)), p=1 eller 2 låst; A>=0 och tau skattas separat per grupp från observationer till och med ursprunget. Prognosmål är avlästa gruppmedelvärden exakt +30/+60, inga interpolerade mål. Tau är empirisk kurvtidsskala.',
  limitations: 'Retrospektivt test på separat publikation och figur från samma forskargrupp; deltagaröverlapp är inte klarlagt. Ingen bekräftad oberoende biologisk replikation, prospektiv förregistrering eller blind patientvalidering. Publicerade sammanfattningar lästes före låsning; framtida punkter finns offentligt men visas inte i Oraklets prompt. Gruppmedelvärden, inga individdata. Clamp höll glukos konstant; inga glukosprognoser, doser, PINN eller Kalmanfilter. Kurvorna modellerar inte värmens avstängning explicit och identifierar inte absorption eller clearance. Avläsningsstresstest är inte SEM, konfidensintervall eller fullständig osäkerhet. Överlappande ursprung är inte oberoende replikat. Seed ändrar åtagandet, inte data. Verifieringen kontrollerar numerik, inte avläsning eller biologi.',
});

// Reuse exactly the already-fixed fitting code; no additional tuning or model selection.
export function forecastExternalRows(rows, origin, alternate = false) {
  return forecastShapeRows(rows, origin, alternate).filter(m => ['both', 'shape2'].includes(m.kind));
}
export function classifyExternalMetrics(metrics) {
  const wins = r => r.shape2SquaredError < r.bothSquaredError-1e-8 && r.shape2SquaredError < r.persistenceSquaredError-1e-8;
  const armDecisions = Object.fromEntries(ARMS.map(a => [a, metrics.every(m => wins(m.armMetrics.find(r => r.arm === a)))
    ? 'shape_beats_both_references' : 'mixed_or_no_improvement']));
  return { decision: ARMS.every(a => armDecisions[a] === 'shape_beats_both_references')
    ? 'shape_improves_all_arms' : 'mixed_or_no_improvement', armDecisions,
    pooledDecision: metrics.every(m => m.shape2Mse < m.bothMse-1e-8 && m.shape2Mse < m.persistenceMse-1e-8)
      ? 'shape_beats_both_references' : 'mixed_or_no_improvement' };
}
export function scoreExternalRows(rows, origin, alternate = false) {
  const models = forecastExternalRows(rows, origin, alternate), last = rows.find(r => r.minute === origin);
  const metrics = [30,60].map(horizon => {
    const target = rows.find(r => r.minute === origin+horizon);
    if (!target) throw new ResearchError('invalid_tool_evidence');
    const armMetrics = ARMS.map(arm => {
      const bothPrediction = models[0].predictions.find(p => p.horizon === horizon)[arm];
      const shape2Prediction = models[1].predictions.find(p => p.horizon === horizon)[arm];
      const persistencePrediction = last[arm], observed = target[arm];
      const bothError = bothPrediction-observed, shape2Error = shape2Prediction-observed, persistenceError = persistencePrediction-observed;
      return {arm,observed,bothPrediction,shape2Prediction,persistencePrediction,
        bothError,shape2Error,persistenceError,
        bothAbsoluteError:Math.abs(bothError),shape2AbsoluteError:Math.abs(shape2Error),persistenceAbsoluteError:Math.abs(persistenceError),
        bothSquaredError:bothError**2,shape2SquaredError:shape2Error**2,persistenceSquaredError:persistenceError**2};
    });
    const mse = name => armMetrics.reduce((s,r) => s+r[name+'SquaredError'],0)/2;
    return {horizon,minute:target.minute,points:2,observed:{unheated:target.unheated,heated:target.heated},
      bothMse:mse('both'),shape2Mse:mse('shape2'),persistenceMse:mse('persistence'),armMetrics};
  });
  return {models,metrics,...classifyExternalMetrics(metrics)};
}
function rowsFor(mode, pattern) {
  return data.points.map(r => {
    const row = {minute:r.minute,unheated:r.unheated,heated:mode === 'null-control' ? r.unheated : r.heated};
    if (r.minute && pattern !== 'central') {
      const sign = pattern.endsWith('up') ? 1 : -1, e = data.digitization.assumedErrorUuPerMl;
      row.heated += sign*e; row.unheated += sign*e*(pattern.startsWith('both') ? 1 : -1);
    }
    return row;
  });
}
function analyse(input, alternate = false) {
  if (!input || Object.keys(input).sort().join(',') !== 'mode,origin'
    || !ORIGINS.includes(input.origin) || !['observed','null-control'].includes(input.mode))
    throw new ResearchError('invalid_tool_evidence');
  const scenarios = (input.mode === 'observed' ? PATTERNS : ['central']).map(pattern => ({pattern,...scoreExternalRows(rowsFor(input.mode,pattern),input.origin,alternate)}));
  const central = scenarios[0], wins = scenarios.filter(s => s.decision === 'shape_improves_all_arms').length;
  const rows = rowsFor(input.mode,'central');
  return {endpoint:'baseline-subtracted-plasma-insulin',analysisKind:'separate-publication-fixed-model-check',
    dataKind:input.mode === 'observed' ? 'digitized-published-group-means' : 'synthetic-identical-arm-control',
    origin:input.origin,decision:central.decision,armDecisions:central.armDecisions,pooledDecision:central.pooledDecision,
    robustness:wins === scenarios.length ? 'all_tested_patterns' : wins ? 'some_tested_patterns' : 'no_tested_patterns',
    improvedPatterns:wins,testedPatterns:scenarios.length,horizonMetrics:central.metrics,scenarios,
    plot:{points:rows.filter(r => r.minute <= input.origin+60),curves:central.models.map(m => ({kind:m.kind,shapePower:m.shapePower,
      points:Array.from({length:input.origin+61},(_,minute) => ({minute,...Object.fromEntries(ARMS.map(a => {
        const x = minute/m.tauMinutes[a];
        return [a,minute ? m.peakScale[a]*(alternate ? Math.exp(m.shapePower*(Math.log(x)+1-x)) : x**m.shapePower*Math.exp(m.shapePower*(1-x))) : 0];
      }))}))}))},separatePublication:true,participantOverlap:'not-established',
    physiologicalAbsorptionIdentified:false,clinicalForecastValidated:false,independentReplication:false};
}
export const evaluateExternalCurve = input => analyse(input);
export async function callExternalCurve(input) {
  return {tool:'insulin-external-curve',adapterVersion:EXTERNAL_PROTOCOL.id,dataSha256:EXTERNAL_DATA_SHA256,inputSha256:hash(input),result:analyse(input)};
}
function closeTree(a,b) {
  if (typeof a === 'number') return typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a-b) <= 1e-7*Math.max(1,Math.abs(a));
  if (a === null || typeof a !== 'object') return a === b;
  return b !== null && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
    && Object.keys(a).join(',') === Object.keys(b).join(',') && Object.keys(a).every(k => closeTree(a[k],b[k]));
}
export function validateExternalCurve(e,input) {
  if (e?.tool !== 'insulin-external-curve' || e.adapterVersion !== EXTERNAL_PROTOCOL.id
    || e.dataSha256 !== EXTERNAL_DATA_SHA256 || e.inputSha256 !== hash(input)
    || !closeTree(e.result,analyse(input,true))) throw new ResearchError('invalid_tool_evidence');
  return e.result;
}
export function makeExternalCases(seed) {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  return ORIGINS.map((origin,i) => {const input = {origin,mode:'observed'};
    return {id:i+1,input,commitment:hash({seed,input,protocol:EXTERNAL_PROTOCOL})};});
}
export function parseExternalProposal(text) {
  try {const p = JSON.parse(text);
    return p && Object.keys(p).sort().join(',') === 'decision,reason,robustness'
      && ['shape_improves_all_arms','mixed_or_no_improvement'].includes(p.decision)
      && ['all_tested_patterns','some_tested_patterns','no_tested_patterns'].includes(p.robustness)
      && typeof p.reason === 'string' && p.reason.trim() && p.reason.length <= 800 ? p : null;
  } catch {return null;}
}
export async function runExternalCurveExperiment(seed,propose,callTool,onCommit,options={}) {
  const fixtures = makeExternalCases(seed), cases = [];
  await onCommit(fixtures.map(f => ({case:f.id,sha256:f.commitment,protocol:EXTERNAL_PROTOCOL})));
  for (const f of fixtures) {
    const ai = await propose([
      {role:'system',content:'Du är Professor Oraklet. Förutsäg ett låst test på en separat publicerad insulinkurva innan verktyget körs. Framtida punkter visas inte, men finns offentligt. Ingen patientvalidering eller bekräftad oberoende biologisk replikation. Svara endast JSON med exakt decision:"shape_improves_all_arms"|"mixed_or_no_improvement", robustness:"all_tested_patterns"|"some_tested_patterns"|"no_tested_patterns", reason:kort svensk motivering. Fördel kräver att exponent 2 slår BÅDE exponent 1 och persistens vid BÅDA horisonterna i BÅDA grupperna. Pooled MSE räcker inte. Ändra inte protokollet.'},
      {role:'user',content:JSON.stringify({protocol:EXTERNAL_PROTOCOL,origin:f.input.origin,source:data.source,digitization:data.digitization,
        training:data.points.filter(r => r.minute <= f.input.origin).map(({minute,unheated,heated}) => ({minute,unheated,heated}))})},
    ]);
    const proposal = parseExternalProposal(ai.text); if (!proposal) throw new ResearchError('invalid_model_proposal');
    const evidence = await callTool(f.input), measured = validateExternalCurve(evidence,f.input);
    const controlInput = {...f.input,mode:'null-control'}, controlEvidence = await callTool(controlInput);
    const control = validateExternalCurve(controlEvidence,controlInput);
    for (const m of control.scenarios[0].models) {
      if (Math.abs(m.peakScale.unheated-m.peakScale.heated) > 1e-7 || m.tauMinutes.unheated !== m.tauMinutes.heated)
        throw new ResearchError('invalid_tool_evidence');
    }
    const passed = proposal.decision === measured.decision && proposal.robustness === measured.robustness;
    cases.push({case:f.id,commitment:f.commitment,data:{...f.input,source:structuredClone(data.source),digitization:structuredClone(data.digitization),
      analysisLock:structuredClone(data.analysisLock),points:structuredClone(data.points),dataSha256:EXTERNAL_DATA_SHA256},proposal,provider:ai.provider,model:ai.model,evidence,controlEvidence,
      hypothesisTest:{protocol:EXTERNAL_PROTOCOL,decision:measured.decision,measured,independentlyVerified:true,
        verificationScope:'alternative-arithmetic-and-direct-residual-check-not-source-or-biological-validation',familyInference:null},
      initialPassed:passed,passed,correctionAttempted:false,sameModel:true});
    await options.onProgress?.(structuredClone(cases));
  }
  return {schemaVersion:2,promptVersion:EXTERNAL_PROTOCOL.id,researcher:'Professor Oraklet',
    title:'Insulin aspart: låsta kurvmodeller på en separat publikation',question:EXTERNAL_PROTOCOL.hypothesis,
    method:'Separat låst figur; oförändrad exponent-1/2-anpassning, prefixprognoser, persistens och gruppvis avläsningsstresstest.',
    seed,status:cases.every(c => c.passed) ? 'passed' : 'failed',protocol:EXTERNAL_PROTOCOL,limitations:EXTERNAL_PROTOCOL.limitations,cases};
}
export function externalSummary(m) {
  return `Gruppbeslut: utan värme ${m.armDecisions.unheated}, med värme ${m.armDecisions.heated}; sammanvägt ${m.pooledDecision}. `
    + m.horizonMetrics.map(r => `${r.horizon} min: p=1 MSE=${r.bothMse.toPrecision(5)}, p=2 MSE=${r.shape2Mse.toPrecision(5)}, persistens MSE=${r.persistenceMse.toPrecision(5)}`).join('; ')
    +`; primär fördel i ${m.improvedPatterns}/${m.testedPatterns} mönster.`;
}
export function externalMarkdown(cases) {
  const selected = cases.filter(c => c.hypothesisTest?.protocol?.id === EXTERNAL_PROTOCOL.id);
  if (!selected.length) return '';
  return '\n\n## Separat publikation: gruppvis prognoskontroll\n\n[Källa: Figur 2, DOI 10.1089/dia.2013.0187](https://pmc.ncbi.nlm.nih.gov/articles/PMC3887414/). 16 deltagare för PK; avlästa gruppmedelvärden. Separat figur, samma forskargrupp, deltagaröverlapp ej klarlagt. Fel i uU/mL, kvadratfel i (uU/mL)². Negativt fel betyder underskattning. Primär fördel kräver förbättring i båda grupperna vid båda horisonterna mot båda referenserna.\n\n'
    + selected.map(c => {const m = c.hypothesisTest.measured;
      return `### Fall ${c.case}: observationer till ${m.origin} minuter\n\n${externalSummary(m)}\n\n`
        + '| Mönster | Grupp | Horisont | Modell | Avläst | Prognos | Fel | Absolutfel | Kvadratfel |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
        + m.scenarios.flatMap(s => s.metrics.flatMap(h => h.armMetrics.flatMap(r => ['both','shape2','persistence'].map(k => `| ${s.pattern} | ${r.arm === 'heated' ? 'Med värme' : 'Utan värme'} | ${h.horizon} min | ${{both:'p=1',shape2:'p=2',persistence:'Persistens'}[k]} | ${r.observed} | ${r[k+'Prediction'].toFixed(2)} | ${r[k+'Error'].toFixed(2)} | ${r[k+'AbsoluteError'].toFixed(2)} | ${r[k+'SquaredError'].toFixed(2)} |`)))).join('\n')
        + '\n\n| Mönster | Horisont | p=1 MSE | p=2 MSE | Persistens MSE | Utan värme: båda horisonter | Med värme: båda horisonter | Primär slutsats | Sammanvägd slutsats |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
        + m.scenarios.flatMap(s => s.metrics.map(r => `| ${s.pattern} | ${r.horizon} min | ${r.bothMse.toFixed(3)} | ${r.shape2Mse.toFixed(3)} | ${r.persistenceMse.toFixed(3)} | ${s.armDecisions.unheated} | ${s.armDecisions.heated} | ${s.decision} | ${s.pooledDecision} |`)).join('\n')
        + '\n\n| Modell | Parametrar | Tau utan värme | Tau med värme | Höjd utan värme | Höjd med värme | Tränings-MSE | Gränsträff |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'
        + m.scenarios[0].models.map(x => `| p=${x.shapePower} | ${x.parameters} | ${x.tauMinutes.unheated} | ${x.tauMinutes.heated} | ${x.peakScale.unheated.toFixed(3)} | ${x.peakScale.heated.toFixed(3)} | ${x.trainingMse.toFixed(3)} | ${x.atGridBoundary ? 'Ja' : 'Nej'} |`).join('\n');
    }).join('\n\n') + '\n\nGrafer: `external-curve-origin-30/60/90.png` och `.svg` i Actions-artefakten. Solid linje är anpassning, streckad linje prognos; centrala avläsningar utan osäkerhetsband. Ingen oberoende klinisk validering.\n';
}
