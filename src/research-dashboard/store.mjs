import {isSnapshot,uuid} from './contract.mjs';
export async function readJson(response,limit=90000) {
  const reader=response.body?.getReader();let size=0;const chunks=[];
  try {
    if(reader) while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>limit) {await reader.cancel();throw Error('response_too_large');}chunks.push(value);}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } finally {reader?.releaseLock();}
}
export function createPipelineStore({url,secretKey,fetchImpl=fetch}) {
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url??'')||typeof secretKey!=='string'||!secretKey.startsWith('sb_secret_'))
    throw Error('dashboard_storage_not_configured');
  async function request(path,params={},method='GET',body=null) {
    const target=new URL('/rest/v1/'+path,url);for(const [k,v] of Object.entries(params))target.searchParams.set(k,v);
    return fetchImpl(target,{method,redirect:'manual',signal:AbortSignal.timeout(15000),
      headers:{apikey:secretKey,...(body?{'Content-Type':'application/json',Prefer:'return=representation'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
  }
  async function rows(params) {
    const response=await request('research_pipeline_run',params);
    if(!response.ok){await response.body?.cancel();throw Error('dashboard_storage_unavailable');}
    const value=await readJson(response,400000);if(!Array.isArray(value)||value.length>20)throw Error('invalid_pipeline_rows');return value;
  }
  return {
    async checkStorage(){await rows({select:'id',limit:'0'});},
    async list(){return rows({select:'id,area,model_budget,status,known_model_calls,created_at,updated_at,dispatch_status,github_run_id,github_run_attempt',order:'created_at.desc,id.desc',limit:'20'});},
    async get(id){if(!uuid(id))throw Error('invalid_pipeline_id');const row=(await rows({select:'*',id:'eq.'+id,limit:'1'}))[0]??null;
      if(row&&(row.id!==id||(row.report&&!isSnapshot(row.report))))throw Error('invalid_pipeline_row');return row;},
    async enqueue(input) {
      const response=await request('research_pipeline_run',{},'POST',input);
      if(response.status===409){await response.body?.cancel();const row=await this.get(input.id);
        if(!row||row.area!==input.area||row.model_budget!==input.model_budget)throw Error('start_id_conflict');
        return {created:false,row};}
      if(!response.ok){await response.body?.cancel();throw Error('dashboard_storage_unavailable');}
      const data=await readJson(response);if(!Array.isArray(data)||data.length!==1||data[0].id!==input.id)throw Error('invalid_start_receipt');
      return {created:true,row:data[0]};
    },
    async dispatched(id,dispatch_status,github_run_id=null) {
      const response=await request('research_pipeline_run',{id:'eq.'+id,dispatch_status:'eq.pending'},'PATCH',{dispatch_status,...(github_run_id?{github_run_id}:{})});
      if(!response.ok){await response.body?.cancel();throw Error('dashboard_storage_unavailable');}await response.body?.cancel();
    },
    async save(report){
      if(!isSnapshot(report)||new TextEncoder().encode(JSON.stringify(report)).byteLength>300000)throw Error('invalid_pipeline_snapshot');
      const response=await request('rpc/save_research_pipeline_checkpoint',{},'POST',{p_report:report});
      if(!response.ok){await response.body?.cancel();throw Error('dashboard_checkpoint_failed');}
      const saved=await readJson(response);if(saved!==report.id)throw Error('invalid_checkpoint_receipt');
    }
  };
}
