// Read-only, credential-scoped discovery for two fixed research providers.
// Model IDs are untrusted data: bounded and character validated before exporting.
import type { ResearchKeys } from './research-inference.ts';
const SOURCES = {
  hip: {base:'https://llm-service.ai.tu-darmstadt.de/v1',secret:'HIP_API_KEY'},
  blablador: {base:'https://api.blablador.fz-juelich.de/v1',secret:'BLABLADOR_API_KEY'}
} as const;
type Provider = keyof typeof SOURCES;
const MAX_BYTES=65536;
const MODEL_ID=/^[a-zA-Z0-9][a-zA-Z0-9_./:+-]{0,199}$/;
// Backing model ("root") of a catalog entry, e.g. "openai/gpt-oss-120b" or a /p/scratch path.
const ROOT=/^[a-zA-Z0-9_./:+-]{1,300}$/;
// Display names such as "01 - GPT-OSS-120b - an open model…" may contain spaces; they are
// only used internally to match a completion's model against an alias's root.
const DISPLAY_ID=/^[\x20-\x7e]{1,300}$/;
export async function discoverResearchModels(provider: string, keys: ResearchKeys, transport: typeof fetch=fetch) {
  if(!Object.hasOwn(SOURCES,provider)) return {status:400,data:{error:'invalid_provider'}};
  const p=SOURCES[provider as Provider];
  const key=keys[p.secret];
  if(!key || key.length<8) return {status:503,data:{error:'research_provider_not_configured'}};
  let response:Response;
  try {
    response=await transport(p.base+'/models',{method:'GET',redirect:'manual',
      signal:AbortSignal.timeout(25000),
      headers:{Authorization:'Bearer '+key,Accept:'application/json'}});
  }catch {return {status:502,data:{error:'model_catalog_transport_failed'}};}
  if(!response.ok) {
    await response.body?.cancel().catch(()=>{});
    return {status:502,data:{error:'model_catalog_upstream_failed'}};
  }
  if(Number(response.headers.get('content-length')||0)>MAX_BYTES){
    await response.body?.cancel().catch(()=>{});
    return {status:502,data:{error:'model_catalog_invalid_response'}};
  }
  const reader=response.body?.getReader();
  if(!reader)return {status:502,data:{error:'model_catalog_invalid_response'}};
  let size=0;const chunks:Uint8Array[]=[];
  try {
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BYTES){await reader.cancel();return {status:502,data:{error:'model_catalog_invalid_response'}};}
      chunks.push(value);
    }
  }catch{return {status:502,data:{error:'model_catalog_transport_failed'}};}
  finally{reader.releaseLock();}
  try{
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!Array.isArray(parsed?.data) || parsed.data.length>500)
      return {status:502,data:{error:'model_catalog_invalid_response'}};
    // Reuse the established research router strategy: ignore malformed individual
    // rows, not the entire catalog. Keep strict output character and size bounds.
    const ids=[...new Set(parsed.data.flatMap((item:unknown)=>{
      if(!item || typeof item!=='object' || Array.isArray(item)) return [];
      const id=(item as {id?:unknown}).id;
      return typeof id==='string' && MODEL_ID.test(id) && !id.includes(key) ? [id] : [];
    }))].sort();
    if(ids.length>200 || (parsed.data.length>0 && ids.length===0))
      return {status:502,data:{error:'model_catalog_invalid_response'}};
    // roots: every entry's backing model (internal only, never returned to callers).
    // aliases: alias-* IDs with a usable root, exported so callers can show what an alias runs.
    const roots=new Map<string,string>();
    const aliases:Record<string,string>=Object.create(null);
    for(const item of parsed.data){
      if(!item || typeof item!=='object' || Array.isArray(item)) continue;
      const {id,root}=item as {id?:unknown;root?:unknown};
      if(typeof id!=='string' || typeof root!=='string' || !DISPLAY_ID.test(id) || !ROOT.test(root) ||
         root==='None' || id.includes(key) || root.includes(key)) continue;
      roots.set(id,root);
      if(id.startsWith('alias-') && MODEL_ID.test(id)) aliases[id]=root;
    }
    return {status:200,data:{status:'catalog_unverified',provider,models:ids,
      modelCount:ids.length,backendIdentityVerified:false,aliases:{...aliases}},roots};
  }catch{return {status:502,data:{error:'model_catalog_invalid_response'}};}
}
