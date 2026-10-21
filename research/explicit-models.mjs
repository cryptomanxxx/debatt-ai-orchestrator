// Explicit chat model IDs from an untrusted Worker catalog. Aliases may retarget
// silently and fail the gateway's identity check, so they are never offered.
const invalid=/embedding|rerank|bge-|gte-|whisper|transcri|tts|audio|image|all-proxy|moderation|anonymiz/i;
const aliases=new Set(['default','fast','gpt-3.5-turbo','text-davinci-003','text-embedding-ada-002']);
export function explicitModels(models){
 if(!Array.isArray(models))throw Error('invalid_model_catalog');
 const valid=models.filter(m=>typeof m==='string' && /^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,199}$/.test(m) &&
 !m.toLowerCase().startsWith('alias-') && !m.split('/').includes('..') && !aliases.has(m.toLowerCase()) && !invalid.test(m));
 if(new Set(valid).size!==valid.length)throw Error('duplicate_model_ids');
 return valid.sort((a,b)=>a.localeCompare(b,'en'));
}
