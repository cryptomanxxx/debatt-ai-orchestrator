import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import manifest from './pymc-toolchain.json' with {type:'json'};
import dataset from './macrodata.json' with {type:'json'};
import { fingerprint } from './python-tools.mjs';
import { studentTwoSidedPvalue } from './science.mjs';
import { pilotData } from './hypothesis-pilot.mjs';
import { ResearchError } from './errors.mjs';

export const PYMC_PROTOCOL=Object.freeze({id:'pymc-conjugate-gdp-ar1-v1',
  hypothesis:'Tillväxten i real BNP har en positiv lagg-1-koefficient.',
  model:'Conditional Gaussian AR(1) with intercept; initial observation treated as fixed.',
  prior:{betaMean:[0,0],betaScale:[[100,0],[0,1]],shape:3,scale:16},
  priorMeaning:'variance ~ InverseGamma(3,16); [intercept,phi] | variance ~ Normal([0,0], variance*diag(100,1)).',
  rule:'Positive or negative only if the equal-tailed 95% posterior interval excludes zero; otherwise inconclusive.',
  sampling:manifest.sampling,
  limitations:'Exploratory follow-up on the same historical GDP data, not independent replication. Posterior probability is conditional on the specified model and priors, not a p-value. Prior permits nonstationary coefficients; no causal or novelty claim. Homoskedastic Gaussian AR(1) assumptions and structural stability are not established. Holdout is recorded but not fitted or evaluated in this posterior-only experiment.'});

export function conjugateOracle(input) {
  if(!input || Object.keys(input).sort().join(',')!=='seed,train' || typeof input.seed!=='string' || !/^\d{1,9}$/.test(input.seed)
    || !Array.isArray(input.train) || input.train.length<64 || input.train.length>128
    || !input.train.every(v=>typeof v==='string' && /^-?\d{1,5}(\.\d{1,8})?$/.test(v) && Math.abs(Number(v))<=10000))throw new ResearchError('invalid_tool_evidence');
  const a=input.train.map(Number),x=a.slice(0,-1),y=a.slice(1),n=x.length;
  const sx=x.reduce((s,v)=>s+v,0),sxx=x.reduce((s,v)=>s+v*v,0),sy=y.reduce((s,v)=>s+v,0),sxy=x.reduce((s,v,i)=>s+v*y[i],0);
  if(Math.max(...x)-Math.min(...x)<=1e-10)throw new ResearchError('invalid_tool_evidence');
  const p00=n+.01,p11=sxx+1,det=p00*p11-sx*sx;
  const v=[[p11/det,-sx/det],[-sx/det,p00/det]],mean=[v[0][0]*sy+v[0][1]*sxy,v[1][0]*sy+v[1][1]*sxy];
  const shape=3+n/2,scale=16+.5*(y.reduce((s,z,i)=>s+(z-mean[0]-mean[1]*x[i])**2,0)+.01*mean[0]**2+mean[1]**2);
  const phiScale=Math.sqrt(scale/shape*v[1][1]),df=2*shape;
  const t=mean[1]/phiScale,tail=studentTwoSidedPvalue(t,df)/2,probabilityPositive=t>=0?1-tail:tail;
  let lo=0,hi=10;
  while(studentTwoSidedPvalue(hi,df)>.05)hi*=2;
  for(let i=0;i<70;i++){const mid=(lo+hi)/2;if(studentTwoSidedPvalue(mid,df)>.05)lo=mid;else hi=mid;}
  const interval=[mean[1]-hi*phiScale,mean[1]+hi*phiScale];
  return {prior:PYMC_PROTOCOL.prior,trainCount:a.length,posteriorMean:mean,posteriorCovarianceScale:v,
    posteriorShape:shape,posteriorScale:scale,phiScale,phiInterval95:interval,probabilityPositive,
    decision:interval[0]>0?'positive':interval[1]<0?'negative':'inconclusive'};
}
const near=(a,b)=>typeof a==='number' && Number.isFinite(a) && Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(b));
function matches(a,b){return Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>matches(a[i],v))
  :typeof b==='number'?near(a,b):b&&typeof b==='object'?a&&Object.entries(b).every(([k,v])=>matches(a[k],v)):a===b;}
export function validatePymc(evidence,input) {
  const oracle=conjugateOracle(input),r=evidence?.result;
  if(evidence?.tool!=='pymc' || evidence.adapterVersion!==manifest.adapterVersion || evidence.runtime!=='github-actions-python'
    || fingerprint(evidence.versions)!==fingerprint(manifest.packages) || evidence.inputSha256!==fingerprint(input)
    || !matches(r,oracle))throw new ResearchError('invalid_tool_evidence');
  const m=r.mcmc,df=2*r.posteriorShape,sd=r.phiScale*Math.sqrt(df/(df-2));
  if(!m || !['phiMean','phiSd','probabilityPositive','meanMcse','maximumRhat','minimumEssBulk','minimumEssTail'].every(k=>Number.isFinite(m[k]))
    || m.chains!==4 || m.draws!==1000 || m.tune!==1000 || m.divergences!==0 || m.maximumRhat>1.01 || m.maximumRhat<.9
    || m.minimumEssBulk<400 || m.minimumEssTail<400 || m.meanMcse<=0 || m.meanMcse>sd/Math.sqrt(400)*2
    || m.probabilityPositive<0 || m.probabilityPositive>1 || m.phiSd<=0
    || Math.abs(m.phiMean-r.posteriorMean[1])>5*m.meanMcse
    || Math.abs(m.phiSd/sd-1)>5*Math.sqrt(2/m.minimumEssBulk)
    || Math.abs(m.probabilityPositive-r.probabilityPositive)>5*Math.sqrt(r.probabilityPositive*(1-r.probabilityPositive)/m.minimumEssBulk)+.005
    || !Array.isArray(r.densityProbes) || r.densityProbes.length!==3)
    throw new ResearchError('invalid_tool_evidence');
  const probes=[[[0,0],1],[[1,.2],4],[[-1,-.1],9]],values=input.train.map(Number),n=values.length-1;
  probes.forEach(([beta,variance],i)=>{
    const residual=values.slice(1).reduce((s,y,j)=>s+(y-beta[0]-beta[1]*values[j])**2,0);
    const logDensity=3*Math.log(16)-Math.log(2)-4*Math.log(variance)-16/variance
      -Math.log(2*Math.PI)-Math.log(variance)-.5*Math.log(100)-.5*(.01*beta[0]**2+beta[1]**2)/variance
      -.5*n*Math.log(2*Math.PI*variance)-.5*residual/variance;
    if(!matches(r.densityProbes[i],{beta,variance,logDensity}))throw new ResearchError('invalid_tool_evidence');
  });
  return r;
}
export function callPymc(input) {
  conjugateOracle(input);
  return new Promise((resolve,reject)=>{
    const child=execFile(process.env.RESEARCH_PYMC_PYTHON||'python3',[ '-I',fileURLToPath(new URL('../scripts/pymc_bridge.py',import.meta.url))],
      {timeout:180000,maxBuffer:65536,env:{PATH:process.env.PATH,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',NUMBA_NUM_THREADS:'1'}},(error,stdout)=>{
        if(error)return reject(new ResearchError('tool_transport_error'));
        try{const evidence=JSON.parse(stdout);validatePymc(evidence,input);resolve(evidence);}catch{reject(new ResearchError('invalid_tool_evidence'));}
      });
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
  });
}
export async function runPymcExperiment(seed,propose,callTool,onCommit,options={}) {
  const {input:data,periods}=pilotData('realgdp'),input={train:data.train,seed},control={train:Array.from({length:65},(_,i)=>String([1,0,-1,0][i%4])),seed};
  const commitment=fingerprint({input,control,holdout:data.holdout,periods,datasetSha256:fingerprint(dataset),protocol:PYMC_PROTOCOL});
  await onCommit([{case:1,sha256:commitment,protocol:PYMC_PROTOCOL}]);
  const ai=await propose([{role:'system',content:'Du är Professor Oraklet. Förutsäg ett bayesianskt AR(1)-resultat för historisk BNP-tillväxt. Hypotes, priorer och metod är låsta. Svara endast JSON med exakt method:"pymc", decision:"positive", "negative" eller "inconclusive", reason:kort svensk motivering. Förslaget är en gissning, inte ett uppmätt resultat.'},
    {role:'user',content:JSON.stringify({protocol:PYMC_PROTOCOL,dataset:dataset.metadata,periods})}]);
  let proposal;try{proposal=JSON.parse(ai.text);}catch{throw new ResearchError('invalid_model_proposal');}
  if(!proposal || Object.keys(proposal).sort().join(',')!=='decision,method,reason' || proposal.method!=='pymc'
    || !['positive','negative','inconclusive'].includes(proposal.decision) || typeof proposal.reason!=='string' || !proposal.reason.trim() || proposal.reason.length>800)
    throw new ResearchError('invalid_model_proposal');
  const evidence=await callTool(input),measured=validatePymc(evidence,input),controlEvidence=await callTool(control),c=validatePymc(controlEvidence,control);
  if(c.decision!=='inconclusive' || Math.abs(c.probabilityPositive-.5)>1e-8)throw new ResearchError('invalid_tool_evidence');
  const passed=proposal.decision===measured.decision;
  const cases=[{case:1,commitment,data:input,holdout:data.holdout,controlData:control,proposal,provider:ai.provider,model:ai.model,evidence,controlEvidence,
    hypothesisTest:{protocol:PYMC_PROTOCOL,decision:measured.decision,measured,independentlyVerified:true,familyInference:null},
    initialPassed:passed,passed,correctionAttempted:false,sameModel:true}];
  await options.onProgress?.(cases);
  return {schemaVersion:2,promptVersion:'pymc-gdp-v1',researcher:'Professor Oraklet',title:'Bayesiansk uppföljning av BNP-tillväxt',
    question:PYMC_PROTOCOL.hypothesis,method:'Låst konjugat normal/inverse-gamma AR(1). PyMC MCMC, modellens logdensitet och oberoende analytisk posterior måste stämma.',
    seed,status:passed?'passed':'failed',protocol:PYMC_PROTOCOL,dataset:dataset.metadata,datasetSha256:fingerprint(dataset),periods,
    limitations:PYMC_PROTOCOL.limitations,cases};
}
