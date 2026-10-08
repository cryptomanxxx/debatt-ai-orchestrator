import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ResearchError } from './errors.mjs';
import { WARMING_DATA_SHA256, forecastWarmingRows } from './insulin-warming.mjs';

// Importing the original adapter checks the same immutable digitization bytes.
const data = JSON.parse(readFileSync(new URL('./data/insulin-aspart-warming.json', import.meta.url)));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ARMS = ['unheated', 'heated'], ORIGINS = [30, 60, 90];
const GRID = Array.from({ length: 86 }, (_, i) => 10 + 2 * i);
const PATTERNS = ['central', 'both_up', 'both_down', 'heated_up', 'heated_down'];
export const CURVE_PROTOCOL = Object.freeze({
  id: 'insulin-curve-shape-v1', dataSha256: WARMING_DATA_SHA256,
  hypothesis: 'Ger en förutbestämd alternativ kurvform bättre 30–60-minutersprognoser än både den ursprungliga kurvformen och senaste avlästa värdet?',
  rule: 'Utforskande efterhandsanalys av samma publicerade figur som insulin-warming-forecast; tidigare resultat är redan kända. Tre överlappande ursprung: 30, 60 och 90 minuter. Primär kandidat: separat höjd och tid per grupp med fast formexponent 2. Jämför med exponent 1 med samma fyra skattade parametrar och med persistens. Fördel kräver lägre MSE än BÅDA referenserna vid BÅDE +30 och +60 minuter, marginal 1e-8. Alla modeller och fem avläsningsmönster redovisas; ingen modell väljs på framtida punkter. Inga signifikanstester.',
  assumptions: 'C(t)=A*(t/tau)^p*exp(p*(1-t/tau)); p=1 eller p=2 är fasta modellval, inte skattade parametrar. A>=0 och tau=10,12,...,180 minuter skattas separat per grupp från enbart punkter till och med prognosursprunget. Den gamla modellen med gemensam höjd och separata tider redovisas också, tillsammans med övriga gamla modeller. Samma låsta manuella figuravläsning, målminuter och ±2 uU/mL-stresstest används. Tau anger empirisk kurvtidsskala, inte en identifierad absorptionskonstant.',
  limitations: 'Utforskande återanalys efter att resultaten i samma figur redan har setts; ingen oberoende bekräftelse eller blind patientprognos. Gruppmedelvärden, inte individdata. Clamp höll glukos konstant; målet är plasma-insulininkrement, inte blodsocker eller doser. Uppvärmningen avslutades efter 60–90 minuter; dessa enkla kurvor saknar en explicit avstängningsmekanism. Fem valda avläsningsmönster är inte ett osäkerhetsintervall eller oberoende replikat. En bättre anpassning identifierar inte upptag, clearance eller en temperaturfunktion. Ingen PINN eller Kalmanmodell. Seed ändrar åtagandets identitet, inte data. Numerisk verifiering kontrollerar beräkningar, inte diagramavläsning eller biologisk giltighet.',
});

function curve(t, tau, power, alternate = false) {
  if (!t) return 0;
  const x = t / tau;
  return alternate ? Math.exp(power * (Math.log(x) + 1 - x)) : x ** power * Math.exp(power * (1 - x));
}

// Exactly four estimated parameters, matching the original separate-height/time model.
export function forecastShapeRows(rows, origin, alternate = false) {
  // Reuse the original row/prefix validation and chronological restrictions.
  const legacy = forecastWarmingRows(rows, origin, alternate);
  const training = rows.filter(r => r.minute <= origin);
  const fits = ARMS.map(arm => {
    let best;
    for (const tau of GRID) {
      let xx = 0, xy = 0, yy = 0;
      for (const r of training) { const x = curve(r.minute, tau, 2, alternate), y = r[arm]; xx += x*x; xy += x*y; yy += y*y; }
      const A = Math.max(0, xy / xx);
      const sse = alternate ? training.reduce((s,r) => s + (r[arm] - A * curve(r.minute, tau, 2, true)) ** 2, 0)
        : yy - 2*A*xy + A*A*xx;
      if (!best || sse < best.sse - 1e-9) best = { A, tau, sse };
    }
    return best;
  });
  const alternative = { kind: 'shape2', parameters: 4, shapePower: 2,
    tauMinutes: Object.fromEntries(ARMS.map((a,i) => [a,fits[i].tau])),
    peakScale: Object.fromEntries(ARMS.map((a,i) => [a,fits[i].A])),
    trainingMse: Math.max(0, fits.reduce((s,f) => s + f.sse, 0) / (2*training.length)),
    atGridBoundary: fits.some(f => f.tau === GRID[0] || f.tau === GRID.at(-1)),
    predictions: [30,60].map(horizon => ({ horizon, minute: origin+horizon,
      ...Object.fromEntries(ARMS.map((a,i) => [a,fits[i].A*curve(origin+horizon,fits[i].tau,2,alternate)])) })) };
  return [...legacy.map(m => ({...m,shapePower:1})), alternative];
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
function decide(metrics) {
  return metrics.every(m => m.shape2Mse < m.bothMse-1e-8 && m.shape2Mse < m.persistenceMse-1e-8)
    ? 'shape_beats_both_references' : 'mixed_or_no_improvement';
}
function analyse(input, alternate = false) {
  if (!input || Object.keys(input).sort().join(',') !== 'mode,origin'
    || !ORIGINS.includes(input.origin) || !['observed','null-control'].includes(input.mode))
    throw new ResearchError('invalid_tool_evidence');
  const scenarios = (input.mode === 'observed' ? PATTERNS : ['central']).map(pattern => {
    const rows = rowsFor(input.mode,pattern), models = forecastShapeRows(rows,input.origin,alternate);
    const last = rows.find(r => r.minute === input.origin);
    const metrics = [30,60].map(horizon => {
      const target = rows.find(r => r.minute === input.origin+horizon);
      const errors = Object.fromEntries(models.map(m => {
        const p = m.predictions.find(p => p.horizon === horizon);
        return [m.kind+'Mse', ARMS.reduce((s,a) => s + (p[a]-target[a])**2,0)/2];
      }));
      return {horizon,minute:target.minute,points:2,observed:{unheated:target.unheated,heated:target.heated},...errors,
        persistencePrediction:{unheated:last.unheated,heated:last.heated},
        persistenceMse:ARMS.reduce((s,a) => s+(last[a]-target[a])**2,0)/2};
    });
    return {pattern,models,metrics,decision:decide(metrics)};
  });
  const central = scenarios[0], wins = scenarios.filter(s => s.decision === 'shape_beats_both_references').length;
  const centralRows = rowsFor(input.mode,'central');
  return {endpoint:'baseline-subtracted-plasma-insulin', analysisKind:'exploratory-same-figure-followup',
    dataKind:input.mode === 'observed' ? 'digitized-published-group-means' : 'synthetic-identical-arm-control',
    origin:input.origin,decision:central.decision,
    robustness:wins === scenarios.length ? 'all_tested_patterns' : wins ? 'some_tested_patterns' : 'no_tested_patterns',
    improvedPatterns:wins,testedPatterns:scenarios.length,horizonMetrics:central.metrics,scenarios,
    // Plot samples depend only on fitted parameters, not future observed values.
    plot:{points:centralRows.filter(r => r.minute <= input.origin+60),
      curves:central.models.map(m => ({kind:m.kind,shapePower:m.shapePower,
        points:Array.from({length:input.origin+61},(_,minute) => ({minute,
          ...Object.fromEntries(ARMS.map(a => [a,m.peakScale[a]*curve(minute,m.tauMinutes[a],m.shapePower,alternate)]))}))}))},
    physiologicalAbsorptionIdentified:false,clinicalForecastValidated:false,independentReplication:false};
}
export const evaluateCurveShape = input => analyse(input);
export async function callCurveShape(input) {
  return {tool:'insulin-curve-shape',adapterVersion:CURVE_PROTOCOL.id,dataSha256:WARMING_DATA_SHA256,
    inputSha256:hash(input),result:analyse(input)};
}
function closeTree(a,b) {
  if (typeof a === 'number') return typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a-b) <= 1e-7*Math.max(1,Math.abs(a));
  if (a === null || typeof a !== 'object') return a === b;
  return b !== null && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
    && Object.keys(a).join(',') === Object.keys(b).join(',') && Object.keys(a).every(k => closeTree(a[k],b[k]));
}
export function validateCurveShape(e,input) {
  if (e?.tool !== 'insulin-curve-shape' || e.adapterVersion !== CURVE_PROTOCOL.id
    || e.dataSha256 !== WARMING_DATA_SHA256 || e.inputSha256 !== hash(input)
    || !closeTree(e.result,analyse(input,true))) throw new ResearchError('invalid_tool_evidence');
  return e.result;
}
export function makeCurveCases(seed) {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  return ORIGINS.map((origin,i) => {const input = {origin,mode:'observed'};
    return {id:i+1,input,commitment:hash({seed,input,protocol:CURVE_PROTOCOL})};});
}
export function parseCurveProposal(text) {
  try {const p = JSON.parse(text);
    return p && Object.keys(p).sort().join(',') === 'decision,reason,robustness'
      && ['shape_beats_both_references','mixed_or_no_improvement'].includes(p.decision)
      && ['all_tested_patterns','some_tested_patterns','no_tested_patterns'].includes(p.robustness)
      && typeof p.reason === 'string' && p.reason.trim() && p.reason.length <= 800 ? p : null;
  } catch {return null;}
}
export async function runCurveShapeExperiment(seed,propose,callTool,onCommit,options={}) {
  const fixtures = makeCurveCases(seed), cases = [];
  await onCommit(fixtures.map(f => ({case:f.id,sha256:f.commitment,protocol:CURVE_PROTOCOL})));
  for (const f of fixtures) {
    const ai = await propose([
      {role:'system',content:'Du är Professor Oraklet. Förutsäg en låst utforskande modelljämförelse innan beräkningsverktyget körs. Samma publicerade figur har redan analyserats; detta är inte oberoende eller kliniskt blind forskning. Framtida punkter visas inte i prompten. Svara endast JSON med exakt decision:"shape_beats_both_references"|"mixed_or_no_improvement", robustness:"all_tested_patterns"|"some_tested_patterns"|"no_tested_patterns", reason:kort svensk motivering. Fördel kräver att exponent-2-modellen slår BÅDE exponent-1-modellen med separata höjder/tider och persistens vid BÅDA horisonterna. Ändra inte protokollet.'},
      {role:'user',content:JSON.stringify({protocol:CURVE_PROTOCOL,origin:f.input.origin,source:data.source,digitization:data.digitization,
        training:data.points.filter(r => r.minute <= f.input.origin).map(({minute,unheated,heated}) => ({minute,unheated,heated}))})},
    ]);
    const proposal = parseCurveProposal(ai.text); if (!proposal) throw new ResearchError('invalid_model_proposal');
    const evidence = await callTool(f.input), measured = validateCurveShape(evidence,f.input);
    const controlInput = {...f.input,mode:'null-control'}, controlEvidence = await callTool(controlInput);
    const control = validateCurveShape(controlEvidence,controlInput);
    // Null tests equality of arm fits, not an absence of shape improvements.
    for (const m of control.scenarios[0].models) {
      if (Math.abs(m.peakScale.unheated-m.peakScale.heated) > 1e-7 || m.tauMinutes.unheated !== m.tauMinutes.heated)
        throw new ResearchError('invalid_tool_evidence');
    }
    const passed = proposal.decision === measured.decision && proposal.robustness === measured.robustness;
    cases.push({case:f.id,commitment:f.commitment,data:{...f.input,source:structuredClone(data.source),digitization:structuredClone(data.digitization),
      points:structuredClone(data.points),dataSha256:WARMING_DATA_SHA256},proposal,provider:ai.provider,model:ai.model,evidence,controlEvidence,
      hypothesisTest:{protocol:CURVE_PROTOCOL,decision:measured.decision,measured,independentlyVerified:true,
        verificationScope:'alternative-arithmetic-and-direct-residual-check-not-independent-data-or-source-validation',familyInference:null},
      initialPassed:passed,passed,correctionAttempted:false,sameModel:true});
    await options.onProgress?.(structuredClone(cases));
  }
  return {schemaVersion:2,promptVersion:CURVE_PROTOCOL.id,researcher:'Professor Oraklet',
    title:'Insulin aspart: utforskande jämförelse av kurvformer',question:CURVE_PROTOCOL.hypothesis,
    method:'Samma låsta figur; empiriska exponent-1/2-kurvor, kronologiska prefix, persistensreferens och avläsningsstresstest.',
    seed,status:cases.every(c => c.passed) ? 'passed' : 'failed',protocol:CURVE_PROTOCOL,limitations:CURVE_PROTOCOL.limitations,cases};
}
export function curveSummary(m) {
  return m.horizonMetrics.map(r => `${r.horizon} min: ursprunglig separat höjd/tid MSE=${r.bothMse.toPrecision(5)}, ny form MSE=${r.shape2Mse.toPrecision(5)}, persistens MSE=${r.persistenceMse.toPrecision(5)}`).join('; ')
    +`; slår båda referenserna vid båda horisonterna i ${m.improvedPatterns}/${m.testedPatterns} avläsningsmönster.`;
}
export function curveMarkdown(cases) {
  const selected = cases.filter(c => c.hypothesisTest?.protocol?.id === CURVE_PROTOCOL.id);
  if (!selected.length) return '';
  return '\n\n## Utforskande kurvformsjämförelse\n\nSamma figur som tidigare; ingen oberoende validering. [Källa: figur 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC3572265/). MSE i (uU/mL)². Gamla modeller har exponent 1; ny form har fast exponent 2. Båda primära kurvmodellerna skattar fyra parametrar. Samtliga modeller och mönster visas utan val på framtida punkter.\n\n'
    + selected.map(c => {const m = c.hypothesisTest.measured;
      return `### Fall ${c.case}: observationer till ${m.origin} minuter\n\n`
        + '| Mönster | Horisont | Gemensam | Separat tid | Separat höjd | Separat höjd+tid | Ny form | Persistens |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'
        + m.scenarios.flatMap(s => s.metrics.map(r => `| ${s.pattern} | ${r.horizon} min | ${r.sharedMse.toFixed(3)} | ${r.timingMse.toFixed(3)} | ${r.amplitudeMse.toFixed(3)} | ${r.bothMse.toFixed(3)} | ${r.shape2Mse.toFixed(3)} | ${r.persistenceMse.toFixed(3)} |`)).join('\n')
        + '\n\n| Modell | Formexponent | Parametrar | Tau utan värme | Tau med värme | Höjd utan värme | Höjd med värme | Tränings-MSE | Gränsträff |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
        + m.scenarios[0].models.map(x => `| ${x.kind} | ${x.shapePower} | ${x.parameters} | ${x.tauMinutes.unheated} | ${x.tauMinutes.heated} | ${x.peakScale.unheated.toFixed(3)} | ${x.peakScale.heated.toFixed(3)} | ${x.trainingMse.toFixed(3)} | ${x.atGridBoundary ? 'Ja' : 'Nej'} |`).join('\n')
        + '\n\n| Grupp | Målminut | Avläst | Ursprunglig höjd+tid | Ny form | Persistens |\n| --- | --- | --- | --- | --- | --- |\n'
        + m.horizonMetrics.flatMap(r => ARMS.map(a => {const pred = kind => m.scenarios[0].models.find(x => x.kind === kind).predictions.find(p => p.horizon === r.horizon)[a];
          return `| ${a} | ${r.minute} | ${r.observed[a]} | ${pred('both').toFixed(2)} | ${pred('shape2').toFixed(2)} | ${r.persistencePrediction[a].toFixed(2)} |`;})).join('\n');
    }).join('\n\n') + '\n\nGrafer sparas i Actions-artefakten: `curve-shape-origin-30/60/90.png` och `.svg`. Solida linjer är anpassning, streckade linjer är prognos. Grafen använder centrala avläsningar; de fem stresstesten redovisas i tabellerna. Gränsträffar bevisar inte dålig biologisk identifikation, men visar att optimum begränsas av det valda gridet.\n';
}
