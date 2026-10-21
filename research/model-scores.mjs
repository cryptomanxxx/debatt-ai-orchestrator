// Aggregates scientific benchmark artifacts (Scientific v3 and HIP scientific) into
// research/model-scores.json and a readable ranking, used to mark recommended models.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {isMenuModelId,rootLabel} from './explicit-models.mjs';

export const PROVIDERS=['hip','blablador'];
const MAX_RUNS=40;
const MIN_ATTEMPTS=5;
// Rows that say nothing about the model itself: discovery outages, models missing from
// the catalog, and quota or credential stops. Model-attributable failures still count.
const NOT_MODEL_ATTEMPT=new Set(['discovery_failed','not_listed','not_started','rate_limited',
 'http_401','http_403','http_429','gateway_http_401','gateway_http_403','gateway_http_429',
 'gateway_benchmark_upstream_auth_rejected','gateway_benchmark_upstream_quota_exhausted']);

const median=values=>{
 const v=values.filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
 if(!v.length)return null;
 const m=Math.floor(v.length/2);
 return v.length%2?v[m]:(v[m-1]+v[m])/2;
};
// Benchmark reports are our own artifacts, but still validated: explicit model IDs only,
// bounded row counts, and only fields the ranking needs.
export function tallyReport(fileName,report){
 let provider=null;
 if(fileName==='blablador-scientific-v3.json')provider=report?.provider??'blablador';
 else if(fileName==='results.json'&&report?.provider==='hessian.AI HIP')provider='hip';
 if(!PROVIDERS.includes(provider)||!Array.isArray(report?.results)||report.results.length>2000)return null;
 const models={};
 for(const row of report.results){
  const id=row?.model;
  // Scientific v3 prefixes gateway codes once more ("gateway_gateway_http_401").
  const status=typeof row.status==='string'?row.status.replace(/^(?:gateway_)+/,'gateway_'):row.status;
  if(!isMenuModelId(id)||NOT_MODEL_ATTEMPT.has(status))continue;
  // An alias's evidence belongs to the model it ran: key it "alias@root", using the verified
  // resolved_model or the root recorded at discovery. Alias rows with no known root are dropped.
  let key=id;
  if(id.toLowerCase().startsWith('alias-')){
   const root=row.resolved_model??report.model_metadata?.[id]?.root;
   if(typeof root!=='string'||!/^[A-Za-z0-9_./:+-]{1,300}$/.test(root))continue;
   key=id+'@'+root;
  }
  const m=models[key]??={correct:0,attempts:0,latencies:[]};
  m.attempts++;
  if(row.scientific_verdict==='correct')m.correct++;
  const latency=row.latency_seconds;
  if(row.status==='ok'&&typeof latency==='number'&&Number.isFinite(latency)&&latency>=0&&m.latencies.length<500)
   m.latencies.push(Math.round(latency*100)/100);
 }
 const out={};
 // Individual latencies are kept so totals across runs use the median of all calls.
 for(const [id,m] of Object.entries(models))out[id]={correct:m.correct,attempts:m.attempts,latencies:m.latencies};
 return Object.keys(out).length?{provider,models:out}:null;
}
// Runs are keyed by Actions run ID, so re-ingesting an artifact never double counts.
// The newest MAX_RUNS are kept per provider, so a rarely benchmarked provider keeps its history.
export function mergeRuns(existing,fresh){
 const runs={...(existing??{}),...fresh};
 const ids=Object.keys(runs).filter(id=>/^\d{1,20}$/.test(id)&&PROVIDERS.includes(runs[id]?.provider))
  .sort((a,b)=>Number(b)-Number(a));
 const keep=PROVIDERS.flatMap(p=>ids.filter(id=>runs[id].provider===p).slice(0,MAX_RUNS));
 return Object.fromEntries(keep.sort((a,b)=>Number(b)-Number(a)).map(id=>[id,runs[id]]));
}
export function rankings(runs,catalog,aliasRoots={}){
 const result={};
 for(const provider of PROVIDERS){
  const totals={};
  for(const run of Object.values(runs??{})){
   if(run?.provider!==provider)continue;
   for(const [id,m] of Object.entries(run.models??{})){
    const t=totals[id]??={correct:0,attempts:0,latencies:[]};
    t.correct+=m.correct;t.attempts+=m.attempts;
    if(Array.isArray(m.latencies))t.latencies.push(...m.latencies);
   }
  }
  const listed=new Set(catalog?.[provider]??[]);
  // Alias evidence only counts for the alias's current root; a remapped alias starts afresh.
  const current=([key])=>{
   const [id,root]=key.split('@');
   return listed.has(id)&&(root??null)===(aliasRoots?.[provider]?.[id]??null);
  };
  result[provider]=Object.entries(totals).filter(current).map(([key,t])=>({model:key.split('@')[0],correct:t.correct,
   attempts:t.attempts,rate:t.attempts?t.correct/t.attempts:0,medianLatency:median(t.latencies)}))
   .sort((a,b)=>b.rate-a.rate||b.attempts-a.attempts||(a.medianLatency??1e9)-(b.medianLatency??1e9)||a.model.localeCompare(b.model,'en'));
 }
 return result;
}
// The best catalog model with enough evidence; none until it has at least MIN_ATTEMPTS answers.
export function recommendations(ranked){
 const rec={};
 for(const provider of PROVIDERS){
  const best=(ranked[provider]??[]).find(r=>r.attempts>=MIN_ATTEMPTS);
  if(best)rec[provider]={model:best.model,correct:best.correct,attempts:best.attempts};
 }
 return rec;
}
export function rankingMarkdown(ranked,catalog,aliasRoots={}){
 const name=(provider,id)=>'`'+id+'`'+(aliasRoots?.[provider]?.[id]?' = `'+rootLabel(aliasRoots[provider][id])+'`':'');
 const lines=['# HIP/Blablador model ranking','',
  'Generated by *Refresh HIP/Blablador model menu* from Scientific v3 and HIP scientific benchmark runs. Same five scientific tasks; rate = correct answers / all attempts, so failed calls count against a model. A screening signal, not proof of the best research model.',''];
 for(const provider of PROVIDERS){
  const rows=ranked[provider]??[];
  const best=recommendations(ranked)[provider]?.model;
  lines.push('## '+provider,'','| # | Model | Correct / attempts | Rate | Median latency |','| ---: | --- | ---: | ---: | ---: |');
  rows.forEach((r,i)=>lines.push(`| ${i+1} | ${name(provider,r.model)}${r.model===best?' (rekommenderad)':''} | ${r.correct}/${r.attempts} | ${Math.round(r.rate*100)}% | ${r.medianLatency==null?'n/a':r.medianLatency.toFixed(2)+' s'} |`));
  const untested=(catalog?.[provider]??[]).filter(id=>!rows.some(r=>r.model===id));
  if(!rows.length)lines.push('| – | No benchmark results yet | | | |');
  lines.push('');
  if(untested.length)lines.push('Not yet benchmarked: '+untested.map(id=>name(provider,id)).join(', ')+'.','');
 }
 return lines.join('\n');
}
// A rerun uploads one artifact per attempt (…-<run id>-<attempt>); only the latest
// attempt's report is scored for a run.
export function attemptOf(dir){
 const m=String(dir).match(/-(\d{1,4})\/?$/);
 return m?Number(m[1]):0;
}
async function reportFiles(dir){
 const found=[];
 for(const entry of await readdir(dir,{withFileTypes:true,recursive:true}).catch(()=>[])){
  const parent=entry.parentPath??entry.path;
  if(entry.isFile()&&['blablador-scientific-v3.json','results.json'].includes(entry.name))
   found.push({name:entry.name,path:parent+'/'+entry.name,attempt:attemptOf(parent)});
 }
 return found.sort((a,b)=>a.attempt-b.attempt||a.path.localeCompare(b.path));
}

if(process.argv[1]?.endsWith('/model-scores.mjs')){
 // Layout from the workflow: reports/benchmarks/<run id>/<artifact>/<file>.json
 const base='reports/benchmarks';
 const fresh={};
 for(const run of await readdir(base).catch(()=>[])){
  if(!/^\d{1,20}$/.test(run))continue;
  for(const file of await reportFiles(base+'/'+run)){
   try{const t=tallyReport(file.name,JSON.parse(await readFile(file.path,'utf8')));if(t)fresh[run]=t;}
   catch{console.log('skipped unreadable report in run',run);}
  }
 }
 let existing={};
 try{existing=JSON.parse(await readFile('research/model-scores.json','utf8')).runs??{};}catch{}
 const runs=mergeRuns(existing,fresh);
 await writeFile('research/model-scores.json',JSON.stringify({schemaVersion:1,
  note:'Generated by the model-menu workflow from benchmark artifacts. Do not edit by hand.',runs},null,2)+'\n');
 console.log('benchmark runs ingested now:',Object.keys(fresh).length,'kept:',Object.keys(runs).length);
}
