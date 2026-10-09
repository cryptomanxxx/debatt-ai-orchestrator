import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fingerprint } from './python-tools.mjs';
import { ResearchError } from './errors.mjs';
import cfg from './shallow-water-config.json' with { type: 'json' };
import pins from './shallow-water-toolchain.json' with { type: 'json' };
const bridge = fileURLToPath(new URL('../scripts/shallow_water.py',import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new ResearchError('invalid_tool_evidence'); };
if(sha(readFileSync(bridge))!==pins.sourceSha256 || sha(readFileSync(new URL('./shallow-water-config.json',import.meta.url)))!==pins.configSha256) invalid();
export const WATER_METHODS = Object.freeze(['physics-fixed','physics-adaptive','pinn-fixed','pinn-adaptive']);
export const WATER_PROTOCOL = Object.freeze({
  id:cfg.id, sourceSha256:pins.sourceSha256, configSha256:pins.configSha256,
  hypothesis:'Förbättrar ett diskret fysikinformerat nätverk med adaptivt UKF tillståndsskattning och korta prognoser för släta kanalvågor med få sensorer och förändrat mätbrus?',
  rule:'Fyra låsta metoder på samma observationer. Primär hybridfördel kräver minst 5% lägre MSE (och absolut skillnad >1e-10) än alla tre referenser för både vattennivå och hastighet, i filtrering efter 40 s samt vid prognoser +4/+8 s. Alla fel och osäkerhetsmått visas även när kriteriet inte nås. Inga signifikanstester eller val av hyperparametrar på testfallen.',
  assumptions:'Linjära ekvationer för grunt vatten: periodisk, platt kanal 200 m, djup 2 m, medelström 0.3 m/s, känt linjärt motstånd. En spatial Fourier-mod, fyra tillstånd. Två nivåsensorer, inga hastighetssensorer. 160 s simulering, dt=2 s. Offline nätverk 4–16–4, tanh, 2000 epoker; RK4-träningspar och separat diskret fysikresidual. Facit via analytisk linjär övergång, kontrollerat med fin RK4. UKF med nio sigma-punkter; endast R anpassas kausalt, Q är fast. Prognoser använder inga framtida observationer.',
  limitations:'Syntetisk reducerad pilot med känd fysik, inte fulla olinjära vattenekvationer, turbulens, floddata, vind eller verklig validering. Diskret fysikinformerat övergångsnätverk, inte artikelns kontinuerliga PINN-arkitektur, parameteraugmentation eller MC-dropout. Nätverket tränas på samma kända fysik; en liten klassisk modell kan vara bättre. UKF är redundant i den linjära gränsen men verifieras mot vanligt Kalmanfilter. Bara tre scenarier med en seedad bana vardera. Tids- och rumsfel är beroende observationer. 95% band gäller filterkovarians under modellen och inkluderar inte nätverksvikters eller fysikparametrars osäkerhet; täckning mäts, kalibrering garanteras inte. Massa bevaras av konstruktionen. Ingen biologisk eller fysisk validering genom beräkningskontroller.',
});
export function validateWaterInput(input) {
  if(!input || Object.keys(input).sort().join(',')!=='case,seed' || typeof input.seed!=='string'
    || !/^\d{1,9}$/.test(input.seed) || ![0,1,2].includes(input.case)) invalid();
}
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const transpose=a=>a[0].map((_,i)=>a.map(r=>r[i]));
const mv=(a,x)=>a.map(r=>dot(r,x));
const mm=(a,b)=>{const bt=transpose(b); return a.map(r=>bt.map(c=>dot(r,c)));};
const ma=(a,b)=>a.map((r,i)=>add(r,b[i]));
const ms=(a,b)=>a.map((r,i)=>sub(r,b[i]));
const ident=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
const diag=(values)=>values.map((v,i)=>values.map((_,j)=>i===j?v:0));
function cholesky(a) {
  const l=a.map(r=>r.map(()=>0));
  for(let i=0;i<a.length;i++)for(let j=0;j<=i;j++) {
    const v=a[i][j]-dot(l[i].slice(0,j),l[j].slice(0,j));
    if(i===j) {if(!(v>0))invalid(); l[i][j]=Math.sqrt(v);} else l[i][j]=v/l[j][j];
  }
  return l;
}
function minimumEigenvalue(matrix) {
  const a=matrix.map(r=>[...r]);
  for(let iter=0;iter<60;iter++) {
    let p=0,q=1;
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}
    if(Math.abs(a[p][q])<1e-18)break;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);
    const pp=a[p][p],qq=a[q][q],pq=a[p][q];
    for(let k=0;k<4;k++)if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp-s*kq;a[k][q]=a[q][k]=s*kp+c*kq;}
    a[p][p]=c*c*pp-2*c*s*pq+s*s*qq;a[q][q]=s*s*pp+2*c*s*pq+c*c*qq;a[p][q]=a[q][p]=0;
  }
  return Math.min(...a.map((r,i)=>r[i]));
}
function inverse(a) {
  const rows=a.map((r,i)=>[...r,...ident(a.length)[i]]),n=a.length;
  for(let i=0;i<n;i++) {
    if(Math.abs(rows[i][i])<1e-20)invalid();
    rows[i]=scale(rows[i],1/rows[i][i]);
    for(let j=0;j<n;j++)if(j!==i)rows[j]=sub(rows[j],scale(rows[i],rows[j][i]));
  }
  return rows.map(r=>r.slice(n));
}
const outer=(a,b)=>a.map(x=>scale(b,x));
const covariance=(rows,weights)=>rows.reduce((p,r,i)=>ma(p,outer(r,scale(r,weights[i]))),diag(rows[0].map(()=>0)));
export function waterMatrix() {
  const k=2*Math.PI/cfg.lengthM,u=k*cfg.currentMps,c=k*Math.sqrt(cfg.gravityMps2*cfg.depthM),r=cfg.dragPerSecond;
  return [[0,-u,0,-c],[u,0,c,0],[0,-c,-r,-u],[c,0,u,-r]];
}
// Independent real Taylor matrix exponential; Python truth uses complex eigensystem.
export function waterExactMatrix() {
  const a=waterMatrix().map(r=>scale(r,cfg.dtSeconds)); let term=ident(4),sum=ident(4);
  for(let n=1;n<=30;n++){term=mm(term,a).map(r=>scale(r,1/n));sum=ma(sum,term);}
  return sum;
}
const midpoint=()=>{const a=waterMatrix(),dt=cfg.dtSeconds; return ma(ma(ident(4),a.map(r=>scale(r,dt))),mm(a,a).map(r=>scale(r,dt*dt/2)));};
function neural(weights,q) {
  const [w,b,v,d]=weights,s=cfg.network.stateScale;
  const hidden=add(mv(transpose(w),scale(q,1/s)),b).map(Math.tanh);
  return add(q,scale(add(mv(transpose(v),hidden),d),.3*s));
}
function predict(mean,p,transition) {
  const root=cholesky(p.map(r=>scale(r,4))),columns=transpose(root);
  const points=[mean,...columns.map(r=>add(mean,r)),...columns.map(r=>sub(mean,r))];
  const wm=[0,...Array(8).fill(1/8)],wc=[2,...Array(8).fill(1/8)];
  const ys=points.map(transition),m=ys.reduce((s,y,i)=>add(s,scale(y,wm[i])),[0,0,0,0]);
  return {mean:m,covariance:ma(covariance(ys.map(y=>sub(y,m)),wc),diag(Array(4).fill(cfg.ukf.processVariance)))};
}
function update(m,p,y,active,r,adaptive) {
  if(!active.length)return {mean:m,covariance:p,rNext:r};
  // Linear measurement map means this independently written KF update must
  // agree with the Python unscented measurement transformation.
  const state=active.map(i=>active.map(j=>p[i][j]));
  const s=ma(state,diag(active.map(i=>r[i]))),inv=inverse(s);
  const cross=p.map(row=>active.map(i=>row[i])),gain=mm(cross,inv);
  const innovation=active.map(i=>y[i]-m[i]);
  const mean=add(m,mv(gain,innovation)),pcov=ms(p,mm(mm(gain,s),transpose(gain))),next=[...r];
  if(adaptive)for(let j=0;j<active.length;j++) {
    const candidate=Math.min(cfg.ukf.maximumMeasurementVariance,Math.max(cfg.ukf.measurementVariance,innovation[j]**2-state[j][j]));
    next[active[j]]=(1-cfg.ukf.adaptiveRate)*r[active[j]]+cfg.ukf.adaptiveRate*candidate;
  }
  return {mean,covariance:pcov,rNext:next,nis:dot(innovation,mv(inv,innovation))/active.length};
}
function close(a,b) {
  if(typeof b==='number') {if(typeof a!=='number'||!Number.isFinite(a)||Math.abs(a-b)>2e-10*Math.max(.001,Math.abs(b)))invalid();}
  else if(Array.isArray(b)){if(!Array.isArray(a)||a.length!==b.length)invalid();b.forEach((v,i)=>close(a[i],v));}
  else if(b && typeof b==='object'){if(!a||typeof a!=='object')invalid();for(const k of Object.keys(b))close(a[k],b[k]);}
  else if(a!==b)invalid();
}
export function waterMetrics(records) {
  const sums={heightMse:0,velocityMse:0,heightCoverage95:0,velocityCoverage95:0,origins:records.length};
  for(const r of records)for(let i=0;i<32;i++) {
    const b=[Math.cos(i*2*Math.PI/32),Math.sin(i*2*Math.PI/32)];
    for(const [field,start,factor]of [['height',0,cfg.depthM],['velocity',2,Math.sqrt(cfg.gravityMps2*cfg.depthM)]]){
      const error=factor*dot(b,sub(r.mean,r.truth).slice(start,start+2));
      const block=r.covariance.slice(start,start+2).map(row=>row.slice(start,start+2));
      const sd=factor*Math.sqrt(Math.max(0,dot(b,mv(block,b))));
      sums[field+'Mse']+=error**2/(records.length*32);
      sums[field+'Coverage95']+=+(Math.abs(error)<=1.96*sd)/(records.length*32);
    }
  }
  return sums;
}
export function classifyWater(metrics) {
  for(const endpoint of ['filter','forecast4','forecast8'])for(const field of ['heightMse','velocityMse'])
    for(const method of WATER_METHODS.slice(0,3)) {
      const a=metrics['pinn-adaptive'][endpoint][field],b=metrics[method][endpoint][field];
      if(!(a<=(1-cfg.primaryRelativeGain)*b && b-a>cfg.primaryAbsoluteGain))return 'mixed_or_no_improvement';
    }
  return 'hybrid_improves_all';
}
function testDataHash(truth,observations) {
  const chunks=[];
  const number=v=>{const b=Buffer.alloc(8);b.writeDoubleLE(v);chunks.push(b);};
  for(const row of truth)for(const v of row)number(v);
  for(const row of observations) {
    const step=Buffer.alloc(4);step.writeUInt32LE(row.step);chunks.push(step);
    for(const v of row.values){chunks.push(Buffer.from([+(v!==null)]));number(v===null?0:v);}
    number(row.trueNoiseStdM);
  }
  return sha(Buffer.concat(chunks));
}
export function validateWater(e,input) {
  validateWaterInput(input);
  if(e?.tool!=='shallow-water-hybrid' || e.adapterVersion!==cfg.id || e.sourceSha256!==pins.sourceSha256
    || e.configSha256!==pins.configSha256 || e.inputSha256!==fingerprint(input) || e.versions?.numpy!=='2.3.5'
    || e.runtime!=='github-actions-python'||e.factualityChecked!==false)invalid();
  const r=e.result;
  const finiteTree=value=>{if(typeof value==='number'&&!Number.isFinite(value))invalid();if(value&&typeof value==='object')for(const v of Object.values(value))finiteTree(v);};
  finiteTree(r);
  if(!r || r.caseName!==cfg.cases[input.case] || r.realWorldValidated!==false || r.turbulenceSimulated!==false)invalid();
  if(r.testTruth?.length!==81 || r.observations?.length!==81 || !(r.runtimeSeconds>=0))invalid();
  let truth=r.testTruth[0];
  if(!Array.isArray(truth)||truth.length!==4||!truth.every(v=>Number.isFinite(v)&&Math.abs(v)<=.025))invalid();
  const exact=waterExactMatrix(),phys=midpoint();
  for(let i=0;i<=80;i++) {
    close(r.testTruth[i],truth);
    if(r.observations[i].step!==i)invalid();
    const obs=r.observations[i];
    const std=Math.sqrt(cfg.ukf.measurementVariance)*cfg.depthM*(input.case>0 && i>=40?4:1);
    close(obs.trueNoiseStdM,std);
    if(obs.values?.length!==2)invalid();
    for(let j=0;j<2;j++) {
      const missing=i===0 || input.case===2&&(i%5===0||j===1&&i%3===0);
      if(missing ? obs.values[j]!==null : !Number.isFinite(obs.values[j]))invalid();
    }
    truth=mv(exact,truth);
  }
  if(r.testDataSha256!==testDataHash(r.testTruth,r.observations))invalid();
  const t=r.training,weights=t?.weights;
  if(!weights||weights.length!==4)invalid();
  const shapes=[[4,16],[16],[16,4],[4]];
  for(let i=0;i<4;i++) {
    if(weights[i].length!==shapes[i][0])invalid();
    if(shapes[i].length===2)for(const row of weights[i]){if(row.length!==shapes[i][1]||!row.every(Number.isFinite))invalid();}
    else if(!weights[i].every(Number.isFinite))invalid();
  }
  if(t.activation!=='tanh'||JSON.stringify(t.architecture)!=='[4,16,4]'||t.flowMap!=='q + 0.3*scale*MLP(q/scale)'||t.epochs!==2000||t.trainingUsesTestObservations!==false||!(t.finalLoss<t.initialLoss)
    || !['dataLoss','physicsLoss','validationTransitionMse','validationPhysicsResidualMse','trainingSeconds'].every(k=>Number.isFinite(t[k])&&t[k]>=0))invalid();
  const checks=r.controls;
  for(const [key,limit]of [['referenceAgainstRk4MaxError',1e-9],['rk4StepHalvingMaxError',1e-9],['linearUkfAgainstKalmanMaxError',1e-10],['networkGradientMaxError',1e-7]])
    if(!Number.isFinite(checks?.[key])||checks[key]<0||checks[key]>limit)invalid();
  if(checks.zeroModeMassConservedByConstruction!==true)invalid();
  for(const method of WATER_METHODS) {
    const result=r.methods?.[method];
    if(result?.trace?.length!==80 || result.forecasts?.length!==22)invalid();
    const transition=method.startsWith('pinn')?q=>neural(weights,q):q=>mv(phys,q);
    let mean=[0,0,0,0],p=diag(Array(4).fill(cfg.ukf.initialVariance)),rd=Array(2).fill(cfg.ukf.measurementVariance);
    let forecastIndex=0,maximumSigma=0,minimumDepth=Infinity;
    for(let step=1;step<=80;step++) {
      const root=cholesky(p.map(r=>scale(r,4))),cols=transpose(root);
      for(const q of [mean,...cols.map(r=>add(mean,r)),...cols.map(r=>sub(mean,r))])maximumSigma=Math.max(maximumSigma,...q.map(Math.abs));
      const prediction=predict(mean,p,transition),used=[...rd],obs=r.observations[step].values;
      const active=[0,1].filter(i=>obs[i]!==null);
      const up=update(prediction.mean,prediction.covariance,obs,active,rd,method.endsWith('adaptive'));
      ({mean}=up);p=up.covariance;rd=up.rNext;
      cholesky(p);
      for(let i=0;i<32;i++)minimumDepth=Math.min(minimumDepth,cfg.depthM*(1+mean[0]*Math.cos(i*2*Math.PI/32)+mean[1]*Math.sin(i*2*Math.PI/32)));
      const row=result.trace[step-1];
      close(row,{step,seconds:step*2,mean,covariance:p,truth:r.testTruth[step],rUsed:used,rNext:rd,nisPerObservedSensor:active.length?up.nis:null});
      if(cfg.forecastOrigins.includes(step)) {
        let fm=mean,fp=p;
        for(let ahead=1;ahead<=4;ahead++) {
          const root=cholesky(fp.map(r=>scale(r,4))),cols=transpose(root);
          for(const q of [fm,...cols.map(r=>add(fm,r)),...cols.map(r=>sub(fm,r))])maximumSigma=Math.max(maximumSigma,...q.map(Math.abs));
          const f=predict(fm,fp,transition);fm=f.mean;fp=f.covariance;
          if(cfg.horizonSteps.includes(ahead))close(result.forecasts[forecastIndex++],{originStep:step,horizonSeconds:ahead*2,targetStep:step+ahead,mean:fm,covariance:fp,truth:r.testTruth[step+ahead]});
        }
      }
    }
    const metrics=result.metrics;
    close(metrics.filter,waterMetrics(result.trace.filter(v=>v.step>=20)));
    for(const h of [4,8])close(metrics['forecast'+h],waterMetrics(result.forecasts.filter(v=>v.horizonSeconds===h)));
    const nis=result.trace.map(v=>v.nisPerObservedSensor).filter(v=>v!==null);
    close(metrics.meanNisPerObservedSensor,nis.reduce((s,v)=>s+v,0)/nis.length);
    close(metrics.maximumAbsoluteSigmaCoordinate,maximumSigma);
    close(metrics.minimumEstimatedDepthM,minimumDepth);
    if(metrics.sigmaOutsideTrainingBox!==(maximumSigma>cfg.network.stateScale))invalid();
    close(metrics.minimumCovarianceEigenvalue,Math.min(...result.trace.map(v=>minimumEigenvalue(v.covariance))));
    if(!(metrics.runtimeSeconds>=0)||!(metrics.minimumEstimatedDepthM>0)||!(metrics.minimumCovarianceEigenvalue>0))invalid();
    close(r.metrics[method],metrics);
  }
  const minimumTruth=Math.min(...r.testTruth.flatMap(q=>Array.from({length:32},(_,i)=>cfg.depthM*(1+q[0]*Math.cos(i*2*Math.PI/32)+q[1]*Math.sin(i*2*Math.PI/32)))));
  close(r.minimumTrueDepthM,minimumTruth);
  if(!(r.minimumTrueDepthM>0))invalid();
  if(r.decision!==classifyWater(r.metrics))invalid();
  return r;
}
export function callWater(input) {
  validateWaterInput(input);
  return new Promise((resolve,reject)=>{
    const child=execFile(process.env.RESEARCH_PYTHON||'python3',['-I',bridge],
      {timeout:60000,maxBuffer:1_048_576,env:{PATH:process.env.PATH,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}},(error,stdout)=>{
        if(error)return reject(new ResearchError('tool_transport_error'));
        try{const e=JSON.parse(stdout);validateWater(e,input);resolve(e);}catch{reject(new ResearchError('invalid_tool_evidence'));}
      });
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
  });
}
export function makeWaterCases(seed) {
  if(typeof seed!=='string'||!/^\d{1,9}$/.test(seed))throw new ResearchError('invalid_plan');
  return cfg.cases.map((name,i)=>{const input={seed,case:i};return {id:i+1,name,input,commitment:fingerprint({input,protocol:WATER_PROTOCOL})};});
}
export function parseWaterProposal(text) {
  try{const p=JSON.parse(text);return p && Object.keys(p).sort().join(',')==='decision,reason'
    && ['hybrid_improves_all','mixed_or_no_improvement'].includes(p.decision)
    && typeof p.reason==='string'&&p.reason.trim()&&p.reason.length<=800?p:null;}catch{return null;}
}
export async function runWaterExperiment(seed,propose,callTool,onCommit,options={}) {
  const fixtures=makeWaterCases(seed),cases=[];
  await onCommit(fixtures.map(f=>({case:f.id,sha256:f.commitment,protocol:WATER_PROTOCOL})));
  for(const f of fixtures) {
    const ai=await propose([{role:'system',content:'Du är Professor Oraklet. Förutsäg resultatet av ett låst syntetiskt kanaltest före beräkningen. Följ protokollet; ingen fri kod eller parameterändring. Svara endast JSON med exakt decision:"hybrid_improves_all"|"mixed_or_no_improvement", reason:kort svensk motivering. Ett komplext nätverk behöver inte slå känd fysik. Endast scenario och konstruktion visas, inga testobservationer eller framtida resultat.'},
      {role:'user',content:JSON.stringify({protocol:WATER_PROTOCOL,scenario:f.name,config:cfg})}]);
    const proposal=parseWaterProposal(ai.text);if(!proposal)throw new ResearchError('invalid_model_proposal');
    const evidence=await callTool(f.input),measured=validateWater(evidence,f.input);
    const passed=proposal.decision===measured.decision;
    // Preserve full trace once, not twice in a multi-megabyte report.
    const {result,...envelope}=evidence;
    cases.push({case:f.id,commitment:f.commitment,data:f.input,proposal,provider:ai.provider,model:ai.model,evidence:envelope,
      hypothesisTest:{protocol:WATER_PROTOCOL,decision:measured.decision,measured,independentlyVerified:true,
        verificationScope:'independent-javascript-truth-ukf-replay-and-metric-check-not-training-or-physical-validation',familyInference:null},
      initialPassed:passed,passed,correctionAttempted:false,sameModel:true});
    await options.onProgress?.(structuredClone(cases));
  }
  return {schemaVersion:2,promptVersion:cfg.id,researcher:'Professor Oraklet',title:'Kanalvågor: fysikinformerat nätverk och adaptivt UKF',
    question:WATER_PROTOCOL.hypothesis,method:'Tre syntetiska scenarier; fyra låsta metoder, kausala prognoser och oberoende numerisk replay.',
    seed,status:cases.every(c=>c.passed)?'passed':'failed',protocol:WATER_PROTOCOL,limitations:WATER_PROTOCOL.limitations,cases};
}
export function waterSummary(m) {return `${m.caseName}: ${m.decision}; träning ${m.training.trainingSeconds.toFixed(2)} s, total ${m.runtimeSeconds.toFixed(2)} s. Alla fyra metoder och osäkerhetsmått nedan.`;}
export function waterMarkdown(cases) {
  const selected=cases.filter(c=>c.hypothesisTest?.protocol?.id===cfg.id);if(!selected.length)return '';
  return '\n\n## Kanalvågor: mätfel, prognoser och osäkerhet\n\nMSE för nivå i m² och hastighet i (m/s)². Täckning av modellens nominella 95%-band mäts över beroende rums- och tidpunkter. Träningstid ingår separat; filternas tider gäller 80 steg och 22 prognoser.\n\n'
    +selected.map(c=>{const m=c.hypothesisTest.measured;
      return `### Fall ${c.case}: ${m.caseName}\n\n${waterSummary(m)}\n\n`
        +'| Metod | Mått | Nivå MSE | Hastighet MSE | Nivå: täckning | Hastighet: täckning |\n| --- | --- | --- | --- | --- | --- |\n'
        +WATER_METHODS.flatMap(k=>['filter','forecast4','forecast8'].map(e=>{const r=m.metrics[k][e];return `| ${k} | ${e} | ${r.heightMse.toExponential(4)} | ${r.velocityMse.toExponential(4)} | ${(r.heightCoverage95*100).toFixed(1)}% | ${(r.velocityCoverage95*100).toFixed(1)}% |`;})).join('\n')
        +'\n\n| Metod | Filter + prognoser, sekunder | Medel-NIS per observerad sensor | Sigma-punkt utanför träningsbox |\n| --- | --- | --- | --- |\n'
        +WATER_METHODS.map(k=>`| ${k} | ${m.metrics[k].runtimeSeconds.toFixed(3)} | ${m.metrics[k].meanNisPerObservedSensor.toFixed(3)} | ${m.metrics[k].sigmaOutsideTrainingBox?'Ja':'Nej'} |`).join('\n')
        +`\n\nNätverkets slutliga träningsförlust: ${m.training.finalLoss.toExponential(3)}; separat övergångsvalidering MSE: ${m.training.validationTransitionMse.toExponential(3)}. Band inkluderar inte nätverksviktsosäkerhet. Fulla vikter, filterkovarianser, observationer och prognoser finns i JSON-artefakten. Grafer finns i PNG/SVG.\n`;
    }).join('\n');
}
