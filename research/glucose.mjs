import { createHash } from 'node:crypto';
import { ResearchError } from './errors.mjs';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const GLUCOSE_PROTOCOL = Object.freeze({
  id: 'synthetic-absorption-v1',
  hypothesis: 'Hur ändrar absorptionstakten glukoskurvan, och förbättrar ett kausalt adaptivt filter 30–60-minutersprognoser jämfört med fast absorption?',
  rule: 'Tre seedade virtuella fall. Samma dimensionslösa dos, måltid och fysiologi; endast absorption varierar. Prognosförbättring kräver lägre medelkvadratfel vid BÅDE 30 och 60 minuter. Annars mixed_or_no_improvement. Oraklets förslag bedöms separat.',
  assumptions: 'Pedagogisk linjär glukos–insulinmodell, inga verkliga personer. Dos och tillstånd är dimensionslösa, tid i minuter. En måltid och en bolus vid t=0; inga senare interventioner. Konstant insulinkänslighet och aktivitet. Inga temperaturdata.',
  limitations: 'Syntetiskt metodtest, inte validerad patientmodell, temperaturmodell, klinisk prognos eller dosoptimering. Inga medicinska doser eller hypoglykemigränser. Adaptiv gridbaserad filterbank med skalära Kalmanuppdateringar, inget neuralt nätverk. Absorption och känslighet identifieras inte samtidigt. Facit skapas med RK4; midpoint och steghalvering kontrollerar numeriken, inte biologin.',
});
const rates = [0.012, 0.024, 0.048];
function valid(p) {
  if (!p || Object.keys(p).sort().join(',') !== 'dose,meal,noise,rate,sensitivity'
      || !rates.includes(p.rate) || ![0.8, 1, 1.2].includes(p.dose)
      || ![1, 1.25, 1.5].includes(p.meal) || ![0.025, 0.035, 0.045].includes(p.sensitivity)
      || p.noise !== 0.015) throw new ResearchError('invalid_tool_evidence');
}
// State [subcutaneous depot1, depot2, plasma insulin deviation,
// insulin action, glucose deviation from baseline, gut meal depot].
export function derivative(y, p, rate = p.rate) {
  const [s1,s2,i,x,g,m] = y;
  return [-rate*s1, rate*(s1-s2), rate*s2-0.04*i,
    0.03*(p.sensitivity*i-x), -0.012*g-x+0.025*m, -0.025*m];
}
const add = (a,b,f) => a.map((v,i)=>v+f*b[i]);
export function advance(y, p, rate, dt, solver = 'rk4') {
  const k1 = derivative(y,p,rate), k2 = derivative(add(y,k1,dt/2),p,rate);
  if (solver === 'midpoint') return add(y,k2,dt);
  const k3 = derivative(add(y,k2,dt/2),p,rate), k4 = derivative(add(y,k3,dt),p,rate);
  return y.map((v,i)=>v+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
}
function integrate(y,p,rate,minutes,step,solver) {
  for(let t=0;t<minutes;t+=step) y=advance(y,p,rate,Math.min(step,minutes-t),solver);
  return y;
}
export function simulate(p, solver='rk4', step=0.25, rate=p.rate) {
  valid(p); let y=[p.dose,0,0,0,0,p.meal]; const curve=[{minute:0,glucose:0,absorbed:0}];
  for(let t=5;t<=360;t+=5) {
    y=integrate(y,p,rate,5,step,solver);
    curve.push({minute:t,glucose:y[4],absorbed:p.dose-y[0]-y[1]});
  }
  return curve;
}
export function makeGlucoseCases(seed) {
  if(typeof seed!=='string'||!/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  const h=hash({seed,protocol:GLUCOSE_PROTOCOL.id});
  return rates.map((rate,i)=>{
    const input={rate,dose:[0.8,1,1.2][parseInt(h.slice(0,2),16)%3],
      meal:[1,1.25,1.5][parseInt(h.slice(2,4),16)%3],
      sensitivity:[0.025,0.035,0.045][parseInt(h.slice(4,6),16)%3],noise:0.015};
    return {id:i+1,input,commitment:hash({input,seed,protocol:GLUCOSE_PROTOCOL})};
  });
}
function metrics(curve) {
  const min=curve.reduce((a,b)=>b.glucose<a.glucose?b:a);
  return {minimumGlucoseDeviation:min.glucose,minuteOfMinimum:min.minute,
    absorbedAt60:curve[12].absorbed,absorbedAt360:curve.at(-1).absorbed};
}
// Prediction bank never receives the generator's true rate or future observations.
// Known scenario inputs: initial bolus/meal and fixed physiology; the ONLY unknown
// estimated by the bank is absorption. Common glucose covariance is deliberate.
export function forecast(observations, known, solver='rk4', step=0.25) {
  const bank=rates.map(rate=>({rate,y:[known.dose,0,0,0,0,known.meal],logWeight:0}));
  let variance=0.001; const origins=[];
  for(let j=0;j<observations.length;j++) {
    if(j) for(const b of bank) b.y=integrate(b.y,known,b.rate,5,step,solver);
    variance=variance*Math.exp(-2*0.012*5)+0.00005;
    const innovationVariance=variance+known.noise**2, gain=variance/innovationVariance;
    for(const b of bank) {
      const residual=observations[j].glucose-b.y[4];
      b.logWeight-=0.5*residual**2/innovationVariance;
      b.y[4]+=gain*residual;
    }
    variance*=1-gain;
    const max=Math.max(...bank.map(b=>b.logWeight));
    const weights=bank.map(b=>Math.exp(b.logWeight-max)); const sum=weights.reduce((a,b)=>a+b,0);
    const normalized=weights.map(w=>w/sum);
    // Fixed origins before the minimum; endpoint scoring uses true synthetic
    // glucose, outside this function. No future glucose used for prediction.
    if(j>=6 && j<=48) {
      const row={minute:observations[j].minute,estimatedRate:bank.reduce((v,b,i)=>v+normalized[i]*b.rate,0),predictions:{}};
      for(const horizon of [30,60]) {
        const candidates=bank.map(b=>integrate([...b.y],known,b.rate,horizon,step,solver)[4]);
        row.predictions[horizon]={fixed:candidates[1],adaptive:candidates.reduce((v,x,i)=>v+normalized[i]*x,0)};
      }
      origins.push(row);
    }
  }
  return origins;
}
export function evaluateGlucose(input, solver='rk4',step=0.25) {
  valid(input);
  const curve=simulate(input,solver,step), baseline=simulate(input,solver,step,0.024);
  // Deterministic bounded measurement error, identical for every estimator.
  const observations=curve.map((r,j)=>({minute:r.minute,glucose:r.glucose+input.noise*Math.sin(j*1.7)}));
  const {rate,...known}=input;
  const forecasts=forecast(observations,known,solver,step);
  const horizonMetrics=[30,60].map(horizon=>{
    let fixed=0,adaptive=0;
    for(const row of forecasts) {
      const truth=curve[(row.minute+horizon)/5].glucose;
      fixed+=(row.predictions[horizon].fixed-truth)**2;
      adaptive+=(row.predictions[horizon].adaptive-truth)**2;
    }
    return {horizon,fixedMse:fixed/forecasts.length,adaptiveMse:adaptive/forecasts.length,count:forecasts.length};
  });
  return {mechanism:{changed:metrics(curve),baseline:metrics(baseline)},horizonMetrics,
    decision:horizonMetrics.every(m=>m.adaptiveMse<m.fixedMse-1e-8)?'adaptive_improves_both':'mixed_or_no_improvement',
    curve,baselineCurve:baseline,observations,forecasts};
}
export async function callGlucose(input) {
  return {tool:'glucose-simulator',adapterVersion:GLUCOSE_PROTOCOL.id,inputSha256:hash(input),
    result:evaluateGlucose(input)};
}
function closeTree(a,b,tolerance) {
  if(typeof a==='number') return Number.isFinite(a)&&typeof b==='number'&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance;
  if(a===null||typeof a!=='object') return a===b;
  return b!==null&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)
    &&Object.keys(a).join(',')===Object.keys(b).join(',')&&Object.keys(a).every(k=>closeTree(a[k],b[k],tolerance));
}
export function validateGlucose(e,input) {
  if(e?.tool!=='glucose-simulator'||e.adapterVersion!==GLUCOSE_PROTOCOL.id||e.inputSha256!==hash(input)
      ||!closeTree(e.result,evaluateGlucose(input,'midpoint',0.125),0.0001)
      ||!closeTree(e.result,evaluateGlucose(input,'rk4',0.125),0.000001)) throw new ResearchError('invalid_tool_evidence');
  return e.result;
}
export function parseGlucoseProposal(text) {
  try { const p=JSON.parse(text);
    if(Object.keys(p).sort().join(',')!=='absorptionAt60,forecastDecision,reason'
      ||!['higher','same','lower'].includes(p.absorptionAt60)
      ||!['adaptive_improves_both','mixed_or_no_improvement'].includes(p.forecastDecision)
      ||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>800) return null;
    return p;
  }catch{return null;}
}
export async function runGlucoseExperiment(seed,propose,callTool,onCommit,options={}) {
  const fixtures=makeGlucoseCases(seed),cases=[];
  await onCommit(fixtures.map(f=>({case:f.id,sha256:f.commitment,protocol:GLUCOSE_PROTOCOL})));
  for(const f of fixtures) {
    const ai=await propose([{role:'system',content:'Du är Professor Oraklet. Förutsäg absorption efter 60 minuter jämfört med rate=0.024 och om adaptiva prognoser får lägre MSE vid BÅDE 30 och 60 minuter. Inga resultat visas före förslaget. Svara endast JSON med absorptionAt60:"higher"|"same"|"lower", forecastDecision:"adaptive_improves_both"|"mixed_or_no_improvement", reason:kort svensk motivering. Ingen klinisk slutsats.'},
      {role:'user',content:JSON.stringify({protocol:GLUCOSE_PROTOCOL,input:f.input,referenceRate:0.024,equations:'S1=-ka*S1; S2=ka*(S1-S2); I=ka*S2-0.04*I; X=0.03*(sensitivity*I-X); G=-0.012*G-X+0.025*M; M=-0.025*M',forecastMethod:'Filterbank ka=[0.012,0.024,0.048], likformig prior, skalär Kalmanuppdatering av G var femte minut; fast modell använder ka=0.024. Samma brusiga observationer; samma fysiologi och kända initiala dos/måltid. Prognosursprung 30–240 minuter.'})}]);
    const proposal=parseGlucoseProposal(ai.text); if(!proposal) throw new ResearchError('invalid_model_proposal');
    const evidence=await callTool(f.input),measured=validateGlucose(evidence,f.input);
    const controlInput={...f.input,rate:0.024},controlEvidence=await callTool(controlInput);
    const control=validateGlucose(controlEvidence,controlInput);
    if(!closeTree(control.curve,control.baselineCurve,0)) throw new ResearchError('invalid_tool_evidence');
    const absorptionAt60=f.input.rate===0.024?'same':measured.mechanism.changed.absorbedAt60>measured.mechanism.baseline.absorbedAt60?'higher':'lower';
    const passed=proposal.absorptionAt60===absorptionAt60&&proposal.forecastDecision===measured.decision;
    cases.push({case:f.id,commitment:f.commitment,data:f.input,proposal,provider:ai.provider,model:ai.model,evidence,controlEvidence,
      hypothesisTest:{protocol:GLUCOSE_PROTOCOL,decision:measured.decision,measured,independentlyVerified:true,familyInference:null},
      initialPassed:passed,passed,correctionAttempted:false,sameModel:true});
    await options.onProgress?.(structuredClone(cases));
  }
  return {schemaVersion:2,promptVersion:GLUCOSE_PROTOCOL.id,researcher:'Professor Oraklet',title:'Insulinabsorption: syntetisk mekanism och adaptiva prognoser',
    question:GLUCOSE_PROTOCOL.hypothesis,method:'Dimensionslös linjär modell, låsta förslag, tre absorptionstakter, fast/adaptiv kausal filterbank, 30/60-minuters holdoutprognoser och två numeriska kontrollmetoder. passed gäller Oraklets förslag.',
    seed,status:cases.every(c=>c.passed)?'passed':'failed',protocol:GLUCOSE_PROTOCOL,limitations:GLUCOSE_PROTOCOL.limitations,cases};
}
