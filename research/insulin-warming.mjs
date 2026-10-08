import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ResearchError } from './errors.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytes = readFileSync(new URL('./data/insulin-aspart-warming.json', import.meta.url));
export const WARMING_DATA_SHA256 = 'd2bf4f391efd43544362bc09cd82c2d321ad4368520247eb661ef4e348ff78f3';
if (createHash('sha256').update(bytes).digest('hex') !== WARMING_DATA_SHA256)
  throw new ResearchError('invalid_tool_evidence');
const data = JSON.parse(bytes);
export const WARMING_PROTOCOL = Object.freeze({
  id: 'insulin-warming-forecast-v1', dataSha256: WARMING_DATA_SHA256,
  hypothesis: 'Förbättrar separata tidsparametrar för lokal uppvärmning 30–60-minutersprognoser för publicerade gruppkurvor av insulin aspart?',
  rule: 'Tre överlappande prognosursprung: 30, 60 och 90 minuter. Anpassa enbart punkter till och med ursprunget; förutse två gruppmedelvärden vid +30 och +60 minuter. Huvudjämförelse: gemensam kurvhöjd och tidsskala mot gemensam höjd men separata tidsskalor. Fördel kräver lägre MSE vid båda horisonterna, marginal 1e-8. Separata höjder samt höjd+tid är fördefinierade diagnostiska modeller, inte valda på testdata. Fem fasta avläsningsvarianter redovisas. Persistens (senaste värdet per grupp) är en separat enkel prognosreferens. Inga signifikanstester.',
  assumptions: 'Figur 2, DOI 10.1111/pedi.12001; manuellt avlästa gruppmedelvärden, inga individdata. Empirisk kurva C(t)=A*(t/tau)*exp(1-t/tau). Tau är en kurvtidsskala, inte en identifierad absorptionskonstant. Grid tau=10,12,...,180 minuter; A>=0 skattas med minsta kvadrat. Endast 0–150 minuter används för anpassning/prognos; senare negativa baseline-subtraherade värden behålls i källfilen. Uppvärmning slutade efter 60–90 minuter; modellen förenklar detta förlopp.',
  limitations: 'Deskriptiv efterhandsutvärdering av en redan publicerad gruppkurva, inte blind patientprognos, klinisk validering eller oberoende replikat. Clamp höll glukos konstant; experimentet prognostiserar insulininkrement, inte blodsocker. Lokal behandling jämförs med ingen behandling, inte en kontinuerlig temperatur- eller årstidslag. Avläsningsmarginal ±2 uU/mL är ett valt stresstest, inte SEM eller konfidensintervall; fem mönster uttömmer inte osäkerheten. Kurvhöjd, clearance och upptag kan inte särskiljas fysiologiskt här. Ingen dosoptimering, PINN eller Kalmanfilter. Seed ändrar åtagandets identitet, inte data eller analys. Kontroller verifierar numerik och protokoll, inte diagramavläsningen eller biologin.',
});
const ORIGINS = [30, 60, 90];
const KINDS = ['shared', 'timing', 'amplitude', 'both'];
const ARMS = ['unheated', 'heated'];
const GRID = Array.from({ length: 86 }, (_, i) => 10 + 2 * i);
const PATTERNS = ['central', 'both_up', 'both_down', 'heated_up', 'heated_down'];
function shape(t, tau, alternate = false) {
  if (t === 0) return 0;
  const x = t / tau;
  return alternate ? Math.exp(Math.log(x) + 1 - x) : x * Math.exp(1 - x);
}
function validRows(rows) {
  if (!Array.isArray(rows) || rows.length < 3 || rows.length > 60
    || rows.some((r, i) => !r || typeof r !== 'object' || !Number.isFinite(r.minute) || r.minute < 0 || r.minute > 300
      || (i && r.minute <= rows[i - 1].minute)
      || ARMS.some(a => !Number.isFinite(r[a]) || Math.abs(r[a]) > 1000)))
    throw new ResearchError('invalid_tool_evidence');
}
// Sufficient-statistic fitting; the verifier evaluates candidate residuals directly.
function fit(rows, kind, alternate = false) {
  const stats = ARMS.map(arm => GRID.map(tau => {
    let xx = 0, xy = 0, yy = 0;
    for (const row of rows) { const x = shape(row.minute, tau, alternate), y = row[arm]; xx += x*x; xy += x*y; yy += y*y; }
    return { xx, xy, yy };
  }));
  let best;
  const consider = (i, j) => {
    const s = stats[0][i], h = stats[1][j];
    const pooled = Math.max(0, (s.xy + h.xy) / (s.xx + h.xx));
    const amplitudes = kind === 'shared' || kind === 'timing' ? [pooled, pooled]
      : [Math.max(0, s.xy/s.xx), Math.max(0, h.xy/h.xx)];
    let sse;
    if (alternate) {
      sse = 0;
      for (const r of rows) for (let a = 0; a < 2; a++)
        sse += (r[ARMS[a]] - amplitudes[a] * shape(r.minute, GRID[a ? j : i], true)) ** 2;
    } else sse = [s,h].reduce((total, v, a) => total + v.yy - 2*amplitudes[a]*v.xy + amplitudes[a]**2*v.xx, 0);
    // Ties use the first grid pair, including the identical-arm null control.
    if (!best || sse < best.sse - 1e-9) best = { sse, tau: [GRID[i],GRID[j]], amplitudes };
  };
  for (let i=0;i<GRID.length;i++) {
    if (kind === 'shared' || kind === 'amplitude') consider(i,i);
    else for (let j=0;j<GRID.length;j++) consider(i,j);
  }
  return { kind, parameters: kind==='shared'?2:kind==='both'?4:3,
    tauMinutes: { unheated:best.tau[0],heated:best.tau[1] },
    peakScale: { unheated:best.amplitudes[0],heated:best.amplitudes[1] },
    trainingMse: Math.max(0,best.sse/(2*rows.length)),
    atGridBoundary: best.tau.some(t => t===GRID[0] || t===GRID.at(-1)) };
}
export function forecastWarmingRows(rows, origin, alternate = false) {
  validRows(rows);
  if (!ORIGINS.includes(origin)) throw new ResearchError('invalid_tool_evidence');
  const training = rows.filter(r => r.minute<=origin);
  if (training.length<3 || training.at(-1).minute !== origin || !training.some(r=>r.minute>0))
    throw new ResearchError('invalid_tool_evidence');
  return KINDS.map(kind => {
    const f = fit(training,kind,alternate);
    return { ...f, predictions: [30,60].map(horizon=>({ horizon,minute:origin+horizon,
      unheated:f.peakScale.unheated*shape(origin+horizon,f.tauMinutes.unheated,alternate),
      heated:f.peakScale.heated*shape(origin+horizon,f.tauMinutes.heated,alternate) })) };
  });
}
function perturbedRows(mode, pattern) {
  return data.points.map(r => {
    const row = {minute:r.minute,unheated:r.unheated,heated:mode==='null-control'?r.unheated:r.heated};
    if (!r.minute || pattern==='central') return row;
    const e=data.digitization.assumedErrorUuPerMl;
    const sign=pattern.endsWith('up')?1:-1;
    row.heated += e*sign;
    row.unheated += e*sign*(pattern.startsWith('both')?1:-1);
    return row;
  });
}
function decision(metrics) {
  return metrics.every(m=>m.timingMse < m.sharedMse-1e-8) ? 'timing_improves_both' : 'mixed_or_no_improvement';
}
function validInput(input) {
  if (!input || Object.keys(input).sort().join(',') !== 'mode,origin'
    || !ORIGINS.includes(input.origin) || !['observed','null-control'].includes(input.mode))
    throw new ResearchError('invalid_tool_evidence');
}
function analyse(input, alternate=false) {
  validInput(input);
  // Null controls retain identical arms in every pattern; no artificial difference.
  const patterns=input.mode==='null-control'?['central']:PATTERNS;
  const scenarios=patterns.map(pattern=>{
    const rows=perturbedRows(input.mode,pattern);
    const models=forecastWarmingRows(rows,input.origin,alternate);
    const last=rows.find(r=>r.minute===input.origin);
    const metrics=[30,60].map(horizon=>{
      const target=rows.find(r=>r.minute===input.origin+horizon);
      if(!target)throw new ResearchError('invalid_tool_evidence');
      const mse=kind=>{const p=models.find(m=>m.kind===kind).predictions.find(p=>p.horizon===horizon);
        return ARMS.reduce((s,a)=>s+(p[a]-target[a])**2,0)/2;};
      return {horizon,minute:target.minute,points:2,observed:{unheated:target.unheated,heated:target.heated},
        sharedMse:mse('shared'),timingMse:mse('timing'),amplitudeMse:mse('amplitude'),bothMse:mse('both'),
        persistencePrediction:{unheated:last.unheated,heated:last.heated},
        persistenceMse:ARMS.reduce((s,a)=>s+(last[a]-target[a])**2,0)/2};
    });
    return {pattern,models,metrics,decision:decision(metrics)};
  });
  const central=scenarios[0], wins=scenarios.filter(s=>s.decision==='timing_improves_both').length;
  return {dataKind:input.mode==='observed'?'digitized-published-group-means':'synthetic-identical-arm-control',
    endpoint:'baseline-subtracted-plasma-insulin',origin:input.origin,
    trainingMinutes:data.points.filter(p=>p.minute<=input.origin).map(p=>p.minute),
    decision:central.decision,
    robustness:wins===scenarios.length?'all_tested_patterns':wins?'some_tested_patterns':'no_tested_patterns',
    improvedPatterns:wins,testedPatterns:scenarios.length,
    horizonMetrics:central.metrics,scenarios,
    timingBeatsPersistenceBoth:central.metrics.every(m=>m.timingMse<m.persistenceMse-1e-8),
    physiologicalAbsorptionIdentified:false,clinicalForecastValidated:false};
}
export const evaluateWarming=input=>analyse(input);
export async function callWarming(input) {
  return {tool:'insulin-warming-forecast',adapterVersion:WARMING_PROTOCOL.id,
    dataSha256:WARMING_DATA_SHA256,inputSha256:hash(input),result:analyse(input)};
}
function closeTree(a,b) {
  if(typeof a==='number')return typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b)
    &&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a));
  if(a===null||typeof a!=='object')return a===b;
  return b!==null&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)
    &&Object.keys(a).join(',')===Object.keys(b).join(',')&&Object.keys(a).every(k=>closeTree(a[k],b[k]));
}
export function validateWarming(e,input) {
  if(e?.tool!=='insulin-warming-forecast'||e.adapterVersion!==WARMING_PROTOCOL.id
    ||e.dataSha256!==WARMING_DATA_SHA256||e.inputSha256!==hash(input)
    ||!closeTree(e.result,analyse(input,true)))throw new ResearchError('invalid_tool_evidence');
  return e.result;
}
export function makeWarmingCases(seed) {
  if(typeof seed!=='string'||!/^\d{1,9}$/.test(seed))throw new ResearchError('invalid_plan');
  return ORIGINS.map((origin,i)=>{const input={origin,mode:'observed'};
    return {id:i+1,input,commitment:hash({seed,input,protocol:WARMING_PROTOCOL})};});
}
export function parseWarmingProposal(text) {
  try {const p=JSON.parse(text);
    if(!p||Object.keys(p).sort().join(',')!=='decision,reason,robustness'
      ||!['timing_improves_both','mixed_or_no_improvement'].includes(p.decision)
      ||!['all_tested_patterns','some_tested_patterns','no_tested_patterns'].includes(p.robustness)
      ||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>800)return null;
    return p;
  }catch{return null;}
}
export async function runWarmingExperiment(seed,propose,callTool,onCommit,options={}) {
  const fixtures=makeWarmingCases(seed),cases=[];
  await onCommit(fixtures.map(f=>({case:f.id,sha256:f.commitment,protocol:WARMING_PROTOCOL})));
  for(const f of fixtures){
    const ai=await propose([
      {role:'system',content:'Du är Professor Oraklet. Förutsäg resultatet av en låst deskriptiv modelljämförelse innan verktyg körs. Endast träningspunkter visas; framtida punkter är publicerade men undanhållna i denna prompt, inte genuint blind klinisk data. Svara endast JSON: decision:"timing_improves_both"|"mixed_or_no_improvement", robustness:"all_tested_patterns"|"some_tested_patterns"|"no_tested_patterns", reason:kort svensk motivering. Robusthet gäller endast de fem testade mönstren. Du får inte ändra modeller eller protokoll.'},
      {role:'user',content:JSON.stringify({protocol:WARMING_PROTOCOL,origin:f.input.origin,
        source:data.source,digitization:data.digitization,
        training:data.points.filter(p=>p.minute<=f.input.origin).map(({minute,unheated,heated})=>({minute,unheated,heated}))})},
    ]);
    const proposal=parseWarmingProposal(ai.text);if(!proposal)throw new ResearchError('invalid_model_proposal');
    const evidence=await callTool(f.input),measured=validateWarming(evidence,f.input);
    const controlInput={...f.input,mode:'null-control'},controlEvidence=await callTool(controlInput);
    const control=validateWarming(controlEvidence,controlInput);
    if(control.decision!=='mixed_or_no_improvement'||control.horizonMetrics.some(m=>Math.abs(m.sharedMse-m.timingMse)>1e-7))
      throw new ResearchError('invalid_tool_evidence');
    const passed=proposal.decision===measured.decision&&proposal.robustness===measured.robustness;
    cases.push({case:f.id,commitment:f.commitment,data:{...f.input,source:structuredClone(data.source),digitization:structuredClone(data.digitization),
      points:structuredClone(data.points),dataSha256:WARMING_DATA_SHA256},proposal,provider:ai.provider,model:ai.model,evidence,controlEvidence,
      hypothesisTest:{protocol:WARMING_PROTOCOL,decision:measured.decision,measured,independentlyVerified:true,
        verificationScope:'alternative-curve-arithmetic-and-direct-residual-grid-check-not-source-validation',familyInference:null},
      initialPassed:passed,passed,correctionAttempted:false,sameModel:true});
    await options.onProgress?.(structuredClone(cases));
  }
  return {schemaVersion:2,promptVersion:WARMING_PROTOCOL.id,researcher:'Professor Oraklet',
    title:'Insulin aspart: lokal uppvärmning och prognoser av avlästa gruppkurvor',question:WARMING_PROTOCOL.hypothesis,
    method:'Låsta figuravläsningar; kausala prefix, fyra fördefinierade kurvmodeller, 30–60-minutersholdout, avläsningsstresstest och identiska-armkontroller.',
    seed,status:cases.every(c=>c.passed)?'passed':'failed',protocol:WARMING_PROTOCOL,limitations:WARMING_PROTOCOL.limitations,cases};
}
export function warmingSummary(m) {
  return m.horizonMetrics.map(v=>`${v.horizon} min: gemensam MSE=${v.sharedMse.toPrecision(5)}, separat tid MSE=${v.timingMse.toPrecision(5)}, persistens MSE=${v.persistenceMse.toPrecision(5)}`).join('; ')
    +`; fördel vid båda horisonter i ${m.improvedPatterns}/${m.testedPatterns} avläsningsmönster.`;
}
export function warmingMarkdown(cases) {
  const selected=cases.filter(c=>c.hypothesisTest?.protocol?.id===WARMING_PROTOCOL.id);
  if(!selected.length)return '';
  return '\n\n## Insulinkurvor: undanhållna prognoser och avläsningskänslighet\n\n'
    +'[Källa: Figur 2, DOI 10.1111/pedi.12001](https://pmc.ncbi.nlm.nih.gov/articles/PMC3572265/). Manuellt avlästa gruppmedelvärden (12 deltagare för insulin), inte råa individdata. MSE i (uU/mL)². Gemensam = samma höjd och tid; tid = separat tid; höjd = separat höjd; båda = separata höjder och tider. De tre ursprungen överlappar och är inte oberoende replikat.\n\n'
    +selected.map(c=>{const m=c.hypothesisTest.measured;
      return `### Fall ${c.case}: observationer till ${m.origin} minuter\n\n`
        +'| Avläsningsmönster | Horisont | Gemensam MSE | Tid MSE | Höjd MSE | Båda MSE | Persistens MSE |\n| --- | --- | --- | --- | --- | --- | --- |\n'
        +m.scenarios.flatMap(s=>s.metrics.map(r=>`| ${s.pattern} | ${r.horizon} min | ${r.sharedMse.toFixed(3)} | ${r.timingMse.toFixed(3)} | ${r.amplitudeMse.toFixed(3)} | ${r.bothMse.toFixed(3)} | ${r.persistenceMse.toFixed(3)} |`)).join('\n')
        +'\n\n| Grupp | Målminut | Avläst | Gemensam prognos | Separat tid | Persistens |\n| --- | --- | --- | --- | --- | --- |\n'
        +m.horizonMetrics.flatMap(r=>ARMS.map(a=>`| ${a} | ${r.minute} | ${r.observed[a]} | ${m.scenarios[0].models[0].predictions.find(p=>p.horizon===r.horizon)[a].toFixed(2)} | ${m.scenarios[0].models[1].predictions.find(p=>p.horizon===r.horizon)[a].toFixed(2)} | ${r.persistencePrediction[a].toFixed(2)} |`)).join('\n')
        +`\n\nGränsträff i central anpassning: ${m.scenarios[0].models.filter(x=>x.atGridBoundary).map(x=>x.kind).join(', ')||'ingen'}. Parametrar och varje prognos finns i JSON-rapporten.`;
    }).join('\n\n');
}
