import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import manifest from './sympy-toolchain.json' with {type:'json'};
import { fingerprint } from './python-tools.mjs';
import { ResearchError, diagnostic } from './errors.mjs';

export const SYMPY_PROTOCOL=Object.freeze({id:'exact-quadratic-v1',
  hypothesis:'Modellens förslag innehåller exakt alla distinkta reella rötter till den givna andragradsekvationen.',
  rule:'SymPy solveset över reella tal måste stämma med oberoende BigInt-diskriminant och exakt rationell insättning. Komplett rotmängd krävs; en förvanskad kontroll måste avvisas.',
  limitations:'Syntetiskt metodtest av andragradsekvationer med rationella rötter eller inga reella rötter. Distinkta rötter rapporteras, inte multiplicitet. Ingen generell symbolisk analys eller ny vetenskaplig upptäckt.'});
const invalid=()=>{throw new ResearchError('invalid_tool_evidence');};
function gcd(a,b){a=a<0n?-a:a;while(b)[a,b]=[b,a%b];return a;}
function rational(n,d=1n){if(d===0n)invalid();if(d<0n)[n,d]=[-n,-d];const g=gcd(n,d);return [n/g,d/g];}
const stringify=([n,d])=>d===1n?String(n):`${n}/${d}`;
function parseRoot(v){if(typeof v!=='string'||! /^-?(0|[1-9][0-9]{0,5})(\/[1-9][0-9]{0,5})?$/.test(v))invalid();const [n,d='1']=v.split('/');const q=rational(BigInt(n),BigInt(d));if(stringify(q)!==v)invalid();return q;}
export function canonicalRoots(values){if(!Array.isArray(values)||values.length>2)invalid();const q=values.map(parseRoot);if(new Set(values).size!==values.length)invalid();return q.sort((a,b)=>a[0]*b[1]<b[0]*a[1]?-1:a[0]*b[1]>b[0]*a[1]?1:0).map(stringify);}
function sqrt(n){if(n<0n)invalid();if(n<2n)return n;let x=n,y=(x+1n)/2n;while(y<x){x=y;y=(x+n/x)/2n;}return x;}
export function quadraticOracle(input){
  if(!input||Object.keys(input).sort().join(',')!=='candidates,coefficients'||!Array.isArray(input.coefficients)||input.coefficients.length!==3
    ||!input.coefficients.every(v=>typeof v==='string'&& /^-?(0|[1-9][0-9]{0,4})$/.test(v)&&BigInt(v)>=-10000n&&BigInt(v)<=10000n))invalid();
  const candidates=canonicalRoots(input.candidates),[a,b,c]=input.coefficients.map(BigInt),d=b*b-4n*a*c;
  if(a===0n)invalid();let roots=[];
  if(d>=0n){const s=sqrt(d);if(s*s!==d)invalid();roots=canonicalRoots([...new Set([stringify(rational(-b-s,2n*a)),stringify(rational(-b+s,2n*a))])]);}
  for(const root of roots){const [n,q]=parseRoot(root);if(a*n*n+b*n*q+c*q*q!==0n)invalid();}
  return {roots,discriminant:String(d),accepted:JSON.stringify(roots)===JSON.stringify(candidates),distinctRootCount:roots.length,decision:roots.length?'real_solutions':'no_real_solutions'};
}
export function validateSympy(evidence,input){
  const result=quadraticOracle(input);
  if(evidence?.tool!=='sympy'||evidence.adapterVersion!==manifest.adapterVersion||evidence.runtime!=='github-actions-python'
    ||fingerprint(evidence.versions)!==fingerprint(manifest.packages)||evidence.inputSha256!==fingerprint(input)
    ||fingerprint(evidence.result)!==fingerprint(result))invalid();
  return result;
}
export function callSympy(input){quadraticOracle(input);return new Promise((resolve,reject)=>{
  const child=execFile(process.env.RESEARCH_PYTHON||'python3',['-I',fileURLToPath(new URL('../scripts/sympy_bridge.py',import.meta.url))],
    {timeout:20000,maxBuffer:16384,env:{PATH:process.env.PATH}},(error,stdout)=>{if(error)return reject(new ResearchError('tool_transport_error'));
      try{const evidence=JSON.parse(stdout);validateSympy(evidence,input);resolve(evidence);}catch{reject(new ResearchError('invalid_tool_evidence'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
});}
export function makeSympyCases(seed){
  if(typeof seed!=='string'||! /^\d{1,9}$/.test(seed))throw new ResearchError('invalid_plan');
  return [0,1,2].map(i=>{
    const hash=fingerprint({seed,i,protocol:SYMPY_PROTOCOL.id}),r=Number.parseInt(hash.slice(0,4),16)%15-7;
    let s=r+1+Number.parseInt(hash.slice(4,8),16)%5;if(s===2*r)s++;
    // Distinct rational roots r and s/2; a repeated root; no real roots.
    const coefficients=(i===0?[2,-(2*r+s),r*s]:i===1?[1,-2*r,r*r]:[1,-2*r,r*r+1]).map(String);
    const roots=quadraticOracle({coefficients,candidates:[]}).roots;
    const input={coefficients,candidates:roots};
    const control={coefficients,candidates:roots.length?roots.slice(1):['0']};
    return {id:i+1,input,control,truth:{roots,synthetic:true},commitment:fingerprint({input,control,protocol:SYMPY_PROTOCOL})};
  });
}
export function parseSympyProposal(text){try{const p=JSON.parse(text);if(!p||Object.keys(p).sort().join(',')!=='method,reason,roots'||p.method!=='sympy'
  ||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>800)return null;return {...p,roots:canonicalRoots(p.roots),reason:p.reason.trim()};}catch{return null;}}
export async function runSympyExperiment(seed,propose,callTool,onCommit,options={}){
  const fixtures=makeSympyCases(seed),cases=[];
  await onCommit(fixtures.map(f=>({case:f.id,sha256:f.commitment,protocol:SYMPY_PROTOCOL})));
  for(const f of fixtures){let operation='initial_proposal';try{
    const ai=await propose([{role:'system',content:'Du är Professor Oraklet. Lös a*x^2+b*x+c=0 över reella tal. Svara endast JSON med exakt method:"sympy", roots:lista med alla distinkta reella rötter som kanoniska rationella strängar (t.ex. "-2", "1/2"), reason:kort svensk motivering. Tom lista om inga reella rötter finns. Ingen kod. Verktygsresultatet har inte visats.'},
      {role:'user',content:JSON.stringify({protocol:SYMPY_PROTOCOL,coefficients:f.input.coefficients})}]);
    const proposal=parseSympyProposal(ai.text);if(!proposal)throw new ResearchError('invalid_model_proposal');
    operation='positive_control';const evidence=await callTool(f.input),measured=validateSympy(evidence,f.input);
    operation='negative_control';const controlEvidence=await callTool(f.control),control=validateSympy(controlEvidence,f.control);
    if(!measured.accepted||control.accepted)invalid();
    const passed=JSON.stringify(proposal.roots)===JSON.stringify(measured.roots);
    cases.push({case:f.id,commitment:f.commitment,data:f.input,controlData:f.control,truth:f.truth,proposal,provider:ai.provider,model:ai.model,evidence,controlEvidence,
      hypothesisTest:{protocol:SYMPY_PROTOCOL,decision:measured.decision,measured,independentlyVerified:true,familyInference:null},
      initialPassed:passed,passed,correctionAttempted:false,sameModel:true});
    await options.onProgress?.(structuredClone(cases));
  }catch(error){const info=diagnostic(error,{case:f.id,operation});throw new ResearchError(info.code,info);}}
  return {schemaVersion:2,promptVersion:'sympy-quadratic-v1',researcher:'Professor Oraklet',title:'Kan Oraklet lösa exakta andragradsekvationer?',question:SYMPY_PROTOCOL.hypothesis,
    method:'Tre seedade syntetiska fall med två, en eller inga distinkta reella rötter. Förslaget låses före SymPy-körning; exakt BigInt-verifiering och positiva/negativa kontroller krävs. passed/failed gäller modellförslagets träffsäkerhet.',
    seed,status:cases.every(c=>c.passed)?'passed':'failed',protocol:SYMPY_PROTOCOL,limitations:SYMPY_PROTOCOL.limitations,cases};
}
