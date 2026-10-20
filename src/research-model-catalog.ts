// Read-only, credential-scoped discovery for two fixed research providers.
// Model IDs are untrusted data: bounded and character validated before exporting.
import type { ResearchKeys } from './research-inference.ts';
const SOURCES = {
  hip: {base:'https://llm-service.ai.tu-darmstadt.de/v1',secret:'HIP_API_KEY'},
  blablador: {base:'https://api.blablador.fz-juelich.de/v1',secret:'BLABLADOR_API_KEY'}
} as const;
type Provider = keyof typeof SOURCES;
const MAX_BYTES=65536;
const MODEL_ID=/^[a-zA-Z0-9][a-zA-Z0-9_./:+-]{0,127}$/;
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
    if(!Array.isArray(parsed?.data) || parsed.data.length>200 ||
       parsed.data.some((item:unknown)=> !item || typeof item!=='object' ||
         (typeof (item as {id?:unknown}).id !== 'string' ||
          !MODEL_ID.test((item as {id:string}).id) ||
          (item as {id:string}).id.includes(key))))
       return {status:502,data:{error:'model_catalog_invalid_response'}};
    const ids=[...new Set(parsed.data.map((x:{id:string})=>x.id))].sort();
    return {status:200,data:{status:'catalog_unverified',provider,models:ids,
      modelCount:ids.length,backendIdentityVerified:false}};
  }catch{return {status:502,data:{error:'model_catalog_invalid_response'}};}
}
