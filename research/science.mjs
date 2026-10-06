import { createHash } from 'node:crypto';
import { fingerprint, validateScienceEnvelope } from './python-tools.mjs';
import { ResearchError, diagnostic } from './errors.mjs';

export const PROTOCOLS = Object.freeze({
  annihilator: { id: 'exact-recurrence-v2', hypothesis: 'Det finns en linjär rekursion med konstanta koefficienter av ordning högst två.',
    alternative: 'Ingen sådan rekursion stöds av de undanhållna termerna.',
    rule: 'Passa endast träningsprefixet vid två primtal, rekonstruera exakt och kontrollera sex externa holdouttermer.',
    fixtures: 'Tre olika serier per körning. Vid parameterkollision ökas det andra startvärdet deterministiskt; geometriska serier undviks.',
    limitations: 'Ändligt många exakta termer bevisar inte en universell lag. Syntetiska data; verktyget söker en begränsad formelklass.' },
  mixalot: { id: 'frozen-mixture-v2', h0: 'iid kategoridata med kända sannolikheter [1/5,4/5].',
    h1: 'iid kategoridata från en konvex blandning av de fasta signaturerna [1/5,4/5] och [4/5,1/5].',
    prior: 'Blandningsvikt uniform: Dirichlet(1,1); lika priorodds för H0 och H1.',
    rule: 'BF10 >= 10 stödjer H1, BF10 <= 1/10 stödjer H0; annars otillräcklig evidens.',
    control: 'Före modellförslaget väljs [12,12] med förväntat H1-stöd om exakt primärevidens stödjer H0; annars [0,24] med förväntat H0-stöd. Kontrollens beslut måste verifieras och skilja sig från primärbeslutet.',
    limitations: 'Evidensen gäller dessa två modeller och priorer. Kategoriska iid data identifierar inte generellt antalet verkliga populationer. Bayesfaktor är inte ett p-värde.' },
  statsmodels: { id: 'ar1-test-v1', h0: 'phi=0 i y[t]=intercept+phi*y[t-1]+epsilon[t].', h1: 'phi skiljer sig från noll.',
    assumptions: 'AR(1) med iid homoskedastiska innovationer; nominal villkorlig OLS/t-inferens. Ingen kausal slutsats.',
    rule: 'Förutbestämd lagg 1, intercept och tvåsidigt test med alpha=0.05. Tre fall i en familj; Holm korrigerar familjens p-värden.',
    holdout: '16 sista observationer används endast för prognosutvärdering; ingen modellselektion på holdout.',
    limitations: 'Syntetiskt metodtest. Utebliven förkastning bevisar inte H0. Inferens för autoregression är inte ett universellt exakt småstickprovstest. Familjekorrigeringen omfattar endast de tre fallen, inte upprepade dagskörningar.' },
});

const hashBytes = label => createHash('sha256').update(label).digest();
function rng(label) {
  let index = 0;
  return () => { const b = hashBytes(`${label}:${index++}`); return (b.readUInt32BE(0)+.5)/4294967296; };
}
export function makeScienceCases(seed, toolId) {
  if (!/^\d{1,9}$/.test(seed) || !PROTOCOLS[toolId]) throw new ResearchError('invalid_plan');
  const usedRecurrences = new Set();
  return [0,1,2].map(index => {
    const b = hashBytes(`science-v1:${toolId}:${seed}:${index}`);
    let input, control, truth, controlExpectation;
    if (toolId === 'annihilator') {
      const u = 1+b[0]%3, v = 1+b[1]%2;
      let second = 3+b[2]%6;
      // At most two previous fixtures can collide; keep genuine order two.
      while (second*second === u*second+v || usedRecurrences.has(`${u}:${v}:${second}`)) second++;
      usedRecurrences.add(`${u}:${v}:${second}`);
      const values = [1n, BigInt(second)];
      while (values.length < 30) values.push(BigInt(u)*values.at(-1)+BigInt(v)*values.at(-2));
      input = { train: values.slice(0,24).map(String), holdout: values.slice(24).map(String) };
      control = structuredClone(input); control.holdout[0] = String(BigInt(control.holdout[0])+1n);
      truth = { coefficients: [String(-v),String(-u),'1'], generator: 'known_order_two_recurrence' };
    } else if (toolId === 'mixalot') {
      const p = [.2,.5,.8][index], random = rng(`mixture:${seed}:${index}`);
      const successes = Array.from({length:24}, () => random()<p).filter(Boolean).length;
      input = { counts: [successes,24-successes] };
      // Choose a known contrasting anchor before the model or either tool call.
      const supportsH0 = mixtureOracle(input).decision === 'supports_h0';
      control = { counts: supportsH0 ? [12,12] : [0,24] };
      controlExpectation = { decision: supportsH0 ? 'supports_h1' : 'supports_h0' };
      truth = { generatingProbability: p, synthetic: true };
    } else {
      const phi = [0,.4,.8][index], random = rng(`ar1:${seed}:${index}`);
      let value = 0; const values = [];
      for (let i=0;i<168;i++) {
        const noise = Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
        value = .2+phi*value+noise;
        if (i>=64) values.push(value.toFixed(6));
      }
      input = { train: values.slice(0,88), holdout: values.slice(88) };
      // Numerical negative control with analytically zero lag covariance.
      control = { train: Array.from({length:65}, (_,i)=>String([1,0,-1,0][i%4])), holdout:['0','-1','0','1'] };
      truth = { phi, intercept:.2, synthetic:true, burnIn:64 };
    }
    const controls = controlExpectation ? {controlExpectation} : {};
    return { id:index+1, input, control, truth, ...controls,
      commitment:fingerprint({input,control,truth,...controls,protocol:PROTOCOLS[toolId]}) };
  });
}

export function sciencePrompt(toolId, input) {
  const formats = {
    annihilator: '{"method":"annihilator","coefficients":["c0","c1","c2"],"reason":"kort svensk motivering"}; heltalskoefficienter mellan -999 och 999, c2!=0, så att c0*a[n]+c1*a[n+1]+c2*a[n+2]=0',
    mixalot: '{"method":"mixalot","decision":"supports_h1","reason":"kort svensk motivering"}; välj exakt en decision: supports_h1, supports_h0 eller inconclusive',
    statsmodels: '{"method":"statsmodels","decision":"reject_h0","reason":"kort svensk motivering"}; välj exakt en decision: reject_h0 eller do_not_reject_h0. Förutsäg det okorrigerade enskilda testets beslut, inte familjebeslutet',
  };
  const visible = toolId === 'annihilator' ? { observed:input.train.slice(0,12) }
    : toolId === 'statsmodels' ? { train:input.train } : input;
  return [{role:'system',content:`Du är Professor Oraklet. Föreslå ett strukturerat svar för detta förutbestämda syntetiska hypotesexperiment. Verktyget körs efter att ditt svar låsts. Du får inte ändra protokoll, priorer, beslutströskel eller skriva kod. Svara bara med JSON i följande format: ${formats[toolId]}. Du har inte sett verktygsresultat, facit eller holdout. reason är en hypotesmotivering, inte ett påstående att ett resultat redan verifierats.`},
    {role:'user',content:JSON.stringify({protocol:PROTOCOLS[toolId], data:visible})}];
}
export function parseScienceProposal(text, toolId) {
  try {
    const p = JSON.parse(text);
    const keys = toolId === 'annihilator' ? 'coefficients,method,reason' : 'decision,method,reason';
    if (!p || Object.keys(p).sort().join(',') !== keys || p.method !== toolId
      || typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length>800) return null;
    if (toolId === 'annihilator') {
      if (!Array.isArray(p.coefficients) || p.coefficients.length!==3
        || !p.coefficients.every(v=>typeof v==='string' && /^-?\d{1,3}$/.test(v)) || BigInt(p.coefficients[2])===0n) return null;
    } else if (!(toolId==='mixalot' ? ['supports_h1','supports_h0','inconclusive'] : ['reject_h0','do_not_reject_h0']).includes(p.decision)) return null;
    return {...p,reason:p.reason.trim()};
  } catch { return null; }
}

function gcd(a,b) { a=a<0n?-a:a; while(b) [a,b]=[b,a%b]; return a; }
function q(n,d=1n) { if(d===0n) throw new ResearchError('invalid_tool_evidence'); if(d<0n) [n,d]=[-n,-d]; const g=gcd(n,d); return [n/g,d/g]; }
function parseQ(value) { const [n,d='1']=value.split('/'); return q(BigInt(n),BigInt(d)); }
function add(a,b) { return q(a[0]*b[1]+b[0]*a[1],a[1]*b[1]); }
function mul(a,b) { return q(a[0]*b[0],a[1]*b[1]); }
function pow(a,n) { return q(a[0]**BigInt(n),a[1]**BigInt(n)); }
function qs(a) { return a[1]===1n?String(a[0]):`${a[0]}/${a[1]}`; }
export function mixtureOracle(input) {
  // One-dimensional polynomial integration over uniform w, not Dirichlet DP or urn recursion.
  let poly=[[1n,1n]];
  for (let category=0;category<2;category++) for(let i=0;i<input.counts[category];i++) {
    const constant=category===0?q(1n,5n):q(4n,5n), slope=category===0?q(3n,5n):q(-3n,5n);
    const next=Array.from({length:poly.length+1},()=>[0n,1n]);
    poly.forEach((c,j)=>{ next[j]=add(next[j],mul(c,constant)); next[j+1]=add(next[j+1],mul(c,slope)); });
    poly=next;
  }
  const z1=poly.reduce((s,c,i)=>add(s,mul(c,q(1n,BigInt(i+1)))),[0n,1n]);
  const z0=mul(pow(q(1n,5n),input.counts[0]),pow(q(4n,5n),input.counts[1]));
  const bf=mul(z1,q(z0[1],z0[0]));
  return {evidenceH0:qs(z0), evidenceH1:qs(z1), bayesFactor10:qs(bf), posteriorH1:qs(q(bf[0],bf[0]+bf[1])),
    decision:bf[0]>=10n*bf[1]?'supports_h1':10n*bf[0]<=bf[1]?'supports_h0':'inconclusive'};
}
export function recurrenceChecks(coefficients, values) {
  const c=coefficients.map(parseQ), a=values.map(v=>parseQ(v));
  return Array.from({length:a.length-c.length+1},(_,n)=>c.reduce((s,v,j)=>add(s,mul(v,a[n+j])),[0n,1n])[0]===0n);
}
export function verifyRecurrence(coefficients, values) {
  return recurrenceChecks(coefficients, values).every(Boolean);
}
// Student-t tail via regularized incomplete beta, independent of SciPy/statsmodels.
function logGamma(z) {
  const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
  if(z<.5) return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
  z--; let x=.99999999999980993; c.forEach((v,i)=>{x+=v/(z+i+1);});
  const t=z+7.5; return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
}
function betaFraction(a,b,x) {
  const tiny=1e-300; let c=1,d=1-(a+b)*x/(a+1); if(Math.abs(d)<tiny)d=tiny; d=1/d; let h=d;
  for(let m=1;m<=200;m++) {
    let aa=m*(b-m)*x/((a+2*m-1)*(a+2*m));
    d=1+aa*d; if(Math.abs(d)<tiny)d=tiny; c=1+aa/c; if(Math.abs(c)<tiny)c=tiny; d=1/d; h*=d*c;
    aa=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));
    d=1+aa*d; if(Math.abs(d)<tiny)d=tiny; c=1+aa/c; if(Math.abs(c)<tiny)c=tiny; d=1/d; const delta=d*c; h*=delta;
    if(Math.abs(delta-1)<1e-14) return h;
  }
  throw new ResearchError('invalid_tool_evidence');
}
export function studentTwoSidedPvalue(t,df) {
  const x=df/(df+t*t),a=df/2,b=.5;
  if(x>=1)return 1; if(x<=0)return 0;
  const factor=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
  return x<(a+1)/(a+b+2)?factor*betaFraction(a,b,x)/a:1-factor*betaFraction(b,a,1-x)/b;
}

export function regressionOracle(input) {
  const x=input.train.slice(0,-1).map(Number), y=input.train.slice(1).map(Number), n=x.length;
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length, mx=mean(x),my=mean(y);
  const sxx=x.reduce((s,v)=>s+(v-mx)**2,0), sxy=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0);
  const phi=sxy/sxx, intercept=my-phi*mx;
  const sse=y.reduce((s,v,i)=>s+(v-intercept-phi*x[i])**2,0), standardError=Math.sqrt(sse/(n-2)/sxx);
  const forecast=[]; let value=Number(input.train.at(-1));
  for(const _ of input.holdout) { value=intercept+phi*value; forecast.push(value); }
  const rmse=(pred)=>Math.sqrt(input.holdout.reduce((s,v,i)=>s+(Number(v)-pred[i])**2,0)/input.holdout.length);
  return {phi,intercept,standardError,tStatistic:phi/standardError,dfResidual:n-2,forecast,
    holdoutRmse:rmse(forecast), persistenceRmse:rmse(input.holdout.map(()=>Number(input.train.at(-1))))};
}
function nearProbability(a,b) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<=1e-8*Math.max(1e-300,Math.abs(b)); }
function near(a,b) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)); }
export function validateScienceResult(evidence,toolId,input, expectedAccepted=true) {
  const r=validateScienceEnvelope(evidence,toolId,input);
  let valid=false;
  if(toolId==='annihilator') {
    valid=r.found===true && r.order===2 && Array.isArray(r.coefficients) && r.coefficients.length===3
      && r.coefficients.every(v=>typeof v==='string' && /^-?\d{1,60}(\/\d{1,60})?$/.test(v))
      && r.coefficients[2]==='1' && JSON.stringify(r.primes)==='[1000003,1000033]'
      && verifyRecurrence(r.coefficients,input.train)
      && verifyRecurrence(r.coefficients,[...input.train.slice(-2),...input.holdout])===expectedAccepted
      && r.accepted===expectedAccepted && r.trainCount===input.train.length && r.holdoutCount===input.holdout.length
      && r.checked===input.holdout.length
      && r.failed===recurrenceChecks(r.coefficients,[...input.train.slice(-2),...input.holdout]).filter(v=>!v).length;
  } else if(toolId==='mixalot') {
    const oracle=mixtureOracle(input);
    valid=Object.entries(oracle).every(([key,value])=>r[key]===value)
      && r.convention==='sequence_evidence' && r.independentRouteMatched===true;
  } else {
    const oracle=regressionOracle(input);
    valid=Object.entries(oracle).every(([key,value])=>Array.isArray(value)
      ? Array.isArray(r[key]) && r[key].length===value.length && r[key].every((v,i)=>near(v,value[i])) : near(r[key],value))
      && nearProbability(r.pvalue,studentTwoSidedPvalue(oracle.tStatistic,oracle.dfResidual)) && r.pvalue>=0 && r.pvalue<=1 && r.alpha===.05
      && r.decision===(r.pvalue<.05?'reject_h0':'do_not_reject_h0') && r.independentRouteMatched===true
      && Array.isArray(r.confidenceInterval95) && r.confidenceInterval95.length===2
      && r.confidenceInterval95.every(Number.isFinite) && r.confidenceInterval95[0]<r.phi && r.confidenceInterval95[1]>r.phi
      && near((r.confidenceInterval95[0]+r.confidenceInterval95[1])/2,r.phi)
      && nearProbability(studentTwoSidedPvalue((r.confidenceInterval95[1]-r.phi)/r.standardError,r.dfResidual),.05);
  }
  if(!valid) throw new ResearchError('invalid_tool_evidence');
  return r;
}
export function holm(pvalues) {
  const ranked=pvalues.map((p,index)=>({p,index})).sort((a,b)=>a.p-b.p);
  let previous=0;
  return ranked.reduce((out,{p,index},i)=>{ previous=Math.max(previous,Math.min(1,p*(pvalues.length-i))); out[index]=previous; return out; },[]);
}
export async function runScienceExperiment(seed,propose,callTool,onCommit,options) {
  const toolId=options.toolId, protocol=PROTOCOLS[toolId], fixtures=makeScienceCases(seed,toolId), results=[];
  await onCommit(fixtures.map(f=>({case:f.id,sha256:f.commitment,protocol})));
  for(const f of fixtures) {
    let operation='initial_proposal';
    try {
      const ai=await propose(sciencePrompt(toolId,f.input)), proposal=parseScienceProposal(ai.text,toolId);
      if(!proposal) throw new ResearchError('invalid_model_proposal');
      operation='positive_control'; const evidence=await callTool(f.input), measured=validateScienceResult(evidence,toolId,f.input);
      operation='negative_control'; const controlEvidence=await callTool(f.control), control=validateScienceResult(controlEvidence,toolId,f.control,toolId!=='annihilator');
      if(toolId==='mixalot' && (control.decision!==f.controlExpectation.decision || control.decision===measured.decision)) throw new ResearchError('invalid_tool_evidence');
      if(toolId==='statsmodels' && (Math.abs(control.phi)>1e-10 || control.pvalue<.999)) throw new ResearchError('invalid_tool_evidence');
      const passed=toolId==='annihilator'?verifyRecurrence(proposal.coefficients,[...f.input.train,...f.input.holdout]):proposal.decision===measured.decision;
      const decision=toolId==='annihilator'?'supported_on_holdout':measured.decision;
      results.push({case:f.id,commitment:f.commitment,data:f.input,controlData:f.control,truth:f.truth,
        ...(f.controlExpectation ? {controlExpectation:f.controlExpectation} : {}),
        proposal,provider:ai.provider,model:ai.model,evidence,controlEvidence,
        hypothesisTest:{protocol,decision,measured,independentlyVerified:true,familyInference:toolId==='statsmodels'?'pending_all_three_cases':null},
        initialPassed:passed,passed,correctionAttempted:false,sameModel:true});
      await options.onProgress?.(structuredClone(results));
    } catch(error) {
      const info=diagnostic(error,{case:f.id,operation}); throw new ResearchError(info.code,info);
    }
  }
  if(toolId==='statsmodels') {
    const adjusted=holm(results.map(c=>c.hypothesisTest.measured.pvalue));
    results.forEach((c,i)=>Object.assign(c.hypothesisTest,{familyInference:'completed',holmAdjustedPvalue:adjusted[i],
      familyDecision:adjusted[i]<.05?'reject_h0':'do_not_reject_h0'}));
    await options.onProgress?.(structuredClone(results));
  }
  return {schemaVersion:2,promptVersion:'science-hypotheses-v1',researcher:'Professor Oraklet',
    title:{annihilator:'Kan Oraklet och Annihilator återfinna en dold rekursion?',mixalot:'Vilken av två specificerade sannolikhetsmodeller stöds av data?',statsmodels:'Finns tidsberoende i den syntetiska tidsserien?'}[toolId],
    question:protocol.hypothesis || `${protocol.h0} Alternativ: ${protocol.h1}`,
    method:'Tre seedade syntetiska fall. Hypotes, metod och beslutskriterium låses före modellförslag och verktygskörning. Verktygsresultat och parade kontroller verifieras oberoende. Rapportens passed/failed avser modellförslagens träffsäkerhet, inte att en verklig vetenskaplig hypotes bevisats.',
    seed,status:results.every(c=>c.passed)?'passed':'failed',protocol,
    limitations:protocol.limitations+' Ingen slutsats om verkliga data eller vetenskaplig nyhet följer av dessa metodtester.',cases:results};
}
