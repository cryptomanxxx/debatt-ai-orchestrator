// Export provider-scoped model IDs only; no credentials, inference, or provider metadata.
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {explicitModels,aliasModels,rootLabel} from './explicit-models.mjs';
const url='https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/research/models';
const key=process.env.ORCHESTRATOR_API_KEY;
if(typeof key!=='string'||key.length<24)throw Error('missing_orchestrator_key');
let response;
try{response=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(40000),
  headers:{Authorization:'Bearer '+key,Accept:'application/json'}});}catch{throw Error('worker_transport_failed');}
if(!response.ok){await response.body?.cancel();throw Error('worker_http_'+response.status);}
const reader=response.body?.getReader();if(!reader)throw Error('invalid_catalog_response');
let size=0;const chunks=[];
try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>262144){await reader.cancel();throw Error('catalog_too_large');}chunks.push(value);}
}finally{reader.releaseLock();}
const bytes=new Uint8Array(size);let offset=0;
for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
catch{throw Error('invalid_catalog_json');}
if(parsed?.status!=='discovered_unverified'||!parsed?.providers||typeof parsed.providers!=='object')throw Error('invalid_catalog_shape');
const result={schemaVersion:1,githubSha:process.env.GITHUB_SHA||null,providers:{}};
for(const name of ['hip','blablador']){
 const p=parsed.providers[name];
 if(p?.status==='catalog_unverified' && p.provider===name && p.backendIdentityVerified===false &&
   Array.isArray(p.models) && p.models.length<=200 &&
   p.models.every(id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,199}$/.test(id))){
     const aliases=aliasModels(p.aliases);
     result.providers[name]={status:'catalog_unverified',models:p.models,explicitChatModels:explicitModels(p.models),
       aliases:Object.fromEntries(Object.entries(aliases).filter(([alias])=>p.models.includes(alias)))};
 }else{
     // The Worker's fixed error code says why (no upstream text): an outage, a rejected key…
     const error=typeof p?.error==='string'&&/^[a-z_]{3,60}$/.test(p.error)?p.error:'invalid_provider_entry';
     result.providers[name]={status:'failed',error};
 }
}
await mkdir('reports/provider-catalog',{recursive:true});
await writeFile('reports/provider-catalog/catalog.json',JSON.stringify(result,null,2)+'\n');
for(const [name,p] of Object.entries(result.providers))console.log(name,p.status,p.models?.length??0,'models',p.error??'');
// Catalog IDs are character-validated above, so they are safe inside Markdown code spans.
const summary=['# Research model catalog','','Chat model IDs offered in the workflow menus; an alias shows the model it runs. Catalog presence is not proof of chat capability.',''];
for(const [name,p] of Object.entries(result.providers)){
 summary.push('## '+name,'');
 summary.push(p.status==='failed'?'Discovery failed (`'+p.error+'`); the last committed models are kept.':([...p.explicitChatModels.map(id=>'- `'+id+'`'),
  ...Object.entries(p.aliases).map(([alias,root])=>'- `'+alias+'` = `'+rootLabel(root)+'`')].join('\n')||'No chat model IDs.'),'');
}
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary.join('\n')+'\n');
if(Object.values(result.providers).some(p=>p.status==='failed'))process.exitCode=1;
