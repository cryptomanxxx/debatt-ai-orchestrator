// Model IDs offered in the research menus, from an untrusted Worker catalog.
// Explicit IDs answer under their own name. alias-* IDs answer under their backing model
// ("root"); the Worker gateway accepts that only when the reply matches the alias's root.
const invalid=/embedding|rerank|bge-|gte-|whisper|transcri|tts|audio|image|all-proxy|moderation|anonymiz/i;
const aliases=new Set(['default','fast','gpt-3.5-turbo','text-davinci-003','text-embedding-ada-002']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,199}$/;
const ROOT=/^[A-Za-z0-9_./:+-]{1,300}$/;
export function explicitModels(models){
 if(!Array.isArray(models))throw Error('invalid_model_catalog');
 const valid=models.filter(m=>typeof m==='string' && ID.test(m) &&
 !m.toLowerCase().startsWith('alias-') && !m.split('/').includes('..') && !aliases.has(m.toLowerCase()) && !invalid.test(m));
 if(new Set(valid).size!==valid.length)throw Error('duplicate_model_ids');
 return valid.sort((a,b)=>a.localeCompare(b,'en'));
}
export const isAliasId=m=>typeof m==='string'&&ID.test(m)&&m.toLowerCase().startsWith('alias-')&&
 m.toLowerCase()!=='alias-default'&&!m.split('/').includes('..')&&!invalid.test(m);
export const isMenuModelId=m=>explicitModels([m]).length===1||isAliasId(m);
// Several aliases often share one backing model; keep one per root (the longest name,
// usually the most descriptive) so menus and scores are not split across synonyms.
export function aliasModels(map){
 if(!map||typeof map!=='object'||Array.isArray(map))return {};
 const byRoot=new Map();
 for(const [alias,root] of Object.entries(map)){
  // The root must also yield a label the choice parsers accept (a root of only "/" does not).
  if(!isAliasId(alias)||typeof root!=='string'||!ROOT.test(root)||root==='None'||invalid.test(root)||
     !/^[A-Za-z0-9_.:+-]+$/.test(rootLabel(root))||!/[A-Za-z0-9]/.test(rootLabel(root)))continue;
  const current=byRoot.get(root);
  if(!current||alias.length>current.length||(alias.length===current.length&&alias<current))byRoot.set(root,alias);
 }
 return Object.fromEntries([...byRoot].map(([root,alias])=>[alias,root]).sort(([a],[b])=>a.localeCompare(b,'en')));
}
// "openai/gpt-oss-120b" -> "gpt-oss-120b"; a /p/scratch/... path -> its last segment.
// Capped at 80 characters so every generated label stays within the choice parsers' bounds.
export const rootLabel=root=>(String(root).split('/').filter(Boolean).pop()??String(root)).slice(0,80);
