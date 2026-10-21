// Rewrites the generated "provider / model" dropdowns in workflow files from the
// Worker catalog. Only text between the BEGIN/END markers is ever changed.
import {readFile,writeFile,readdir,appendFile} from 'node:fs/promises';
import {explicitModels,aliasModels,isMenuModelId,rootLabel} from './explicit-models.mjs';
import {rankings,recommendations,rankingMarkdown} from './model-scores.mjs';

export const PROVIDERS=['hip','blablador'];
export const PLACEHOLDER='REFRESH_MODEL_MENU_FIRST';
// Only the Scientific v3 runner resolves aliases; the HIP runner accepts explicit IDs only.
const ALIAS_PROVIDERS=['blablador'];
// " all" adds "<provider> / alla"; " all=12" adds it only while the provider has at most 12 models.
const BEGIN=/^( *)# BEGIN GENERATED RESEARCH MODEL OPTIONS providers=([a-z,]+)(?:( all)(?:=(\d{1,3}))?)?$/;
const END=/^ *# END GENERATED RESEARCH MODEL OPTIONS$/;
const MAX_OPTIONS=120;

// Fresh catalog IDs where discovery succeeded; otherwise the last committed snapshot,
// so one provider's outage never wipes its models from the menus. Menu models are the
// explicit IDs followed by one alias per backing model; aliasRoots maps alias -> root.
export function mergeCatalog(fresh,previous={},previousAliases={}){
 const merged={},aliasRoots={},sources={};
 for(const name of PROVIDERS){
  const p=fresh?.providers?.[name];
  const isFresh=p?.status==='catalog_unverified'&&Array.isArray(p.models);
  const ids=isFresh?p.models:(Array.isArray(previous?.[name])?previous[name]:[]);
  const picked=ALIAS_PROVIDERS.includes(name)?aliasModels(isFresh?p.aliases:previousAliases?.[name]):{};
  aliasRoots[name]=Object.fromEntries(Object.entries(picked).filter(([alias])=>ids.includes(alias)));
  merged[name]=[...explicitModels(ids),...Object.keys(aliasRoots[name])];
  sources[name]=isFresh?'fresh':'previous_snapshot';
 }
 return {models:merged,aliasRoots,sources};
}
// An alias entry shows the model it runs: "blablador / alias-fast = gpt-oss-120b".
const entry=(name,id,aliasRoots)=>name+' / '+id+(aliasRoots?.[name]?.[id]?' = '+rootLabel(aliasRoots[name][id]):'');
// Recommended entries come first and duplicate a plain entry, so the plain
// "provider / model" values that API callers send stay stable.
export const recommendedLabel=(name,r,aliasRoots)=>`${entry(name,r.model,aliasRoots)} (rekommenderad ${r.correct}/${r.attempts})`;
export function optionsFor(models,providers,all,recommended={},allLimit=Infinity,aliasRoots={}){
 const options=[];
 for(const name of providers){
  if(!PROVIDERS.includes(name))throw Error('unknown_menu_provider');
  const r=recommended[name];
  if(r&&models[name].includes(r.model))options.push(recommendedLabel(name,r,aliasRoots));
 }
 for(const name of providers){
  if(all&&models[name].length&&models[name].length<=allLimit)options.push(name+' / alla');
  for(const id of models[name])options.push(entry(name,id,aliasRoots));
 }
 if(options.length>MAX_OPTIONS)throw Error('model_menu_too_large');
 return options.length?options:[PLACEHOLDER];
}
export function rewriteWorkflow(text,models,recommended={},aliasRoots={}){
 const lines=text.split('\n'),out=[];let blocks=0;
 for(let i=0;i<lines.length;i++){
  const begin=lines[i].match(BEGIN);
  if(!begin){
   if(END.test(lines[i]))throw Error('unmatched_model_menu_end');
   out.push(lines[i]);continue;
  }
  let j=i+1;
  while(j<lines.length&&!END.test(lines[j])){if(BEGIN.test(lines[j]))throw Error('nested_model_menu');j++;}
  if(j===lines.length)throw Error('unterminated_model_menu');
  const indent=begin[1];
  const options=optionsFor(models,begin[2].split(','),Boolean(begin[3]),recommended,begin[4]?Number(begin[4]):Infinity,aliasRoots);
  const preselect=options[0].includes(' (rekommenderad ')?[indent+'default: '+JSON.stringify(options[0])]:[];
  out.push(lines[i],indent+'options:',...options.map(o=>indent+'  - '+JSON.stringify(o)),...preselect,lines[j]);
  i=j;blocks++;
 }
 return {text:out.join('\n'),blocks};
}
// "hip / GLM-5.2-AWQ-INT4" -> {provider,model}; "hip / alla" -> {provider,model:null}.
// The " = <root>" alias label and a trailing "(rekommenderad 9/10)" label are ignored.
export function parseChoice(value){
 const match=typeof value==='string'&&value.match(/^(hip|blablador) \/ (\S{1,200})(?: = [A-Za-z0-9_.:+-]{1,200})?(?: \(rekommenderad \d{1,6}\/\d{1,6}\))?$/);
 if(!match)throw Error('invalid_model_choice');
 if(match[2]==='alla')return {provider:match[1],model:null};
 if(!isMenuModelId(match[2]))throw Error('invalid_model_choice');
 return {provider:match[1],model:match[2]};
}

// A Worker-wide outage leaves no discovery file: treat every provider as failed so the
// snapshot fallback applies. Any other read or parse error still fails the step.
export async function readFreshCatalog(path,read=readFile){
 try{return JSON.parse(await read(path,'utf8'));}
 catch(error){if(error?.code==='ENOENT')return {providers:{}};throw error;}
}

if(process.argv[1]?.endsWith('/model-menu.mjs')){
 const fresh=await readFreshCatalog('reports/provider-catalog/catalog.json');
 let snapshot={};
 try{snapshot=JSON.parse(await readFile('research/model-catalog.json','utf8'));}catch{}
 const {models,aliasRoots,sources}=mergeCatalog(fresh,snapshot.providers??{},snapshot.aliasRoots??{});
 let runs={};
 try{runs=JSON.parse(await readFile('research/model-scores.json','utf8')).runs??{};}catch{}
 const ranked=rankings(runs,models);
 const recommended=recommendations(ranked);
 const markdown=rankingMarkdown(ranked,models,aliasRoots);
 await writeFile('research/MODEL-RANKING.md',markdown);
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,markdown);
 await writeFile('research/model-catalog.json',JSON.stringify({schemaVersion:1,
  note:'Generated by the model-menu workflow from the Cloudflare Worker catalog. Do not edit by hand.',
  providers:models,aliasRoots},null,2)+'\n');
 const dir='.github/workflows';
 for(const file of (await readdir(dir)).filter(f=>/\.ya?ml$/.test(f)).sort()){
  const original=await readFile(dir+'/'+file,'utf8');
  const {text,blocks}=rewriteWorkflow(original,models,recommended,aliasRoots);
  if(blocks&&text!==original){await writeFile(dir+'/'+file,text);console.log('updated',file);}
 }
 for(const name of PROVIDERS)console.log(name,models[name].length,'models from',sources[name],
  recommended[name]?'recommended: '+recommended[name].model:'no recommendation yet');
}
