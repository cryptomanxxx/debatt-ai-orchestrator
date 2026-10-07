import { createHash } from 'node:crypto';

export const PROBLEM_KINDS=Object.freeze(['open','benchmark_hidden_solution','solved_training','verified_reference','failed_attempt']);

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('invalid_problem_json');
    return Object.is(value,-0)?0:value;
  }
  if (Array.isArray(value)) {
    for (let i=0;i<value.length;i++) if (!Object.hasOwn(value,i)) throw new Error('invalid_problem_json');
    return value.map(canonical);
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out={};
    for (const key of Object.keys(value).sort()) Object.defineProperty(out,key,{value:canonical(value[key]),enumerable:true,writable:true,configurable:true});
    return out;
  }
  throw new Error('invalid_problem_json');
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
const HIDDEN_KEYS=new Set(['reference_solution','reference_fingerprint','solution','answer']);
const BENCHMARK_SOURCE_KEYS=new Set(['provider','collection','problem_id','url','citation','license']);
function scanHidden(value) {
  if (Array.isArray(value)) { for (const item of value) scanHidden(item); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key,child] of Object.entries(value)) {
    if (HIDDEN_KEYS.has(key)) throw new Error('hidden_reference_leak');
    scanHidden(child);
  }
}
function validateBenchmarkSource(source) {
  if (source === null) return;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('unsafe_benchmark_source');
  scanHidden(source);
  for (const [key,value] of Object.entries(source)) {
    if (!BENCHMARK_SOURCE_KEYS.has(key)) throw new Error('unsafe_benchmark_source');
    if (value !== null && typeof value !== 'string') throw new Error('unsafe_benchmark_source');
  }
}
export function problemFingerprint(problem) {
  const value=canonical(problem);
  delete value.fingerprint;
  delete value.created_at;
  delete value.status;
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function createProblem(input) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(input?.id??'')) throw new Error('invalid_problem_id');
  if (!PROBLEM_KINDS.includes(input.kind)) throw new Error('invalid_problem_kind');
  if (typeof input.domain!=='string'||!input.domain.trim()) throw new Error('invalid_problem_domain');
  if (typeof input.question!=='string'||!input.question.trim()) throw new Error('invalid_problem_question');
  if (!Array.isArray(input.verifier_ids??[]) || !(input.verifier_ids??[]).every(v=>typeof v==='string')) throw new Error('invalid_verifier_ids');
  if (input.difficulty!=null && (!Number.isInteger(input.difficulty)||input.difficulty<1||input.difficulty>5)) throw new Error('invalid_difficulty');
  if (!['active','retired'].includes(input.status??'active')) throw new Error('invalid_problem_status');
  if (!Number.isInteger(input.version??1)||(input.version??1)<1) throw new Error('invalid_problem_version');
  const problem=canonical({id:input.id,kind:input.kind,domain:input.domain.trim(),question:input.question.trim(),source:input.source??null,
    verifier_ids:input.verifier_ids??[],difficulty:input.difficulty??null,status:input.status??'active',version:input.version??1});
  if (problem.kind==='benchmark_hidden_solution') validateBenchmarkSource(problem.source);
  return deepFreeze({...problem,fingerprint:problemFingerprint(problem)});
}
export function runnerView(row) {
  const allowed=['id','kind','domain','question','source','verifier_ids','difficulty','status','version','fingerprint'];
  const view={};
  for (const key of allowed) if (Object.hasOwn(row,key)) view[key]=canonical(row[key]);
  return deepFreeze(view);
}
export function assertNoHiddenReference(value) { scanHidden(value); return value; }
export function createProblemBankClient({url,secretKey,fetchImpl=fetch}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url??'')) throw new Error('invalid_supabase_url');
  if (typeof secretKey!=='string'||!secretKey) throw new Error('missing_supabase_secret');
  const headers={apikey:secretKey};
  const jsonHeaders={...headers,'Content-Type':'application/json'};
  return Object.freeze({
    async putProblem(input) {
      const problem=createProblem(input);
      const endpoint=new URL('/rest/v1/research_problem',url);
      const response=await fetchImpl(endpoint,{method:'POST',headers:{...jsonHeaders,Prefer:'return=representation'},body:JSON.stringify(problem)});
      if (!response.ok) throw new Error('problem_bank_write_failed:'+response.status);
      const rows=await response.json();
      if (!Array.isArray(rows)||rows.length!==1) throw new Error('problem_bank_write_invalid_response');
      const view=runnerView(rows[0]);
      if (problemFingerprint(view)!==view.fingerprint) throw new Error('problem_fingerprint_mismatch');
      return view;
    },
    async startRun(problem,state={}) {
      const view=runnerView(problem);
      if (!view.id||!Number.isInteger(view.version)||typeof view.fingerprint!=='string') throw new Error('invalid_run_problem');
      if (problemFingerprint(view)!==view.fingerprint) throw new Error('problem_fingerprint_mismatch');
      const endpoint=new URL('/rest/v1/research_run',url);
      const safeState=canonical(state);
      const payload={problem_id:view.id,problem_version:view.version,problem_fingerprint:view.fingerprint,state:safeState,status:'running'};
      const response=await fetchImpl(endpoint,{method:'POST',headers:{...jsonHeaders,Prefer:'return=representation'},body:JSON.stringify(payload)});
      if (!response.ok) throw new Error('research_run_start_failed:'+response.status);
      const rows=await response.json();
      if (!Array.isArray(rows)||rows.length!==1) throw new Error('research_run_start_invalid_response');
      return deepFreeze(canonical(rows[0]));
    },
    async finishRun(runId,status,state,expected=null) {
      if (!['completed','failed'].includes(status)) throw new Error('invalid_terminal_run_status');
      if (typeof runId!=='string'||!runId) throw new Error('invalid_run_id');
      const safeState=canonical(state);
      const endpoint=new URL('/rest/v1/research_run',url);
      endpoint.searchParams.set('id',`eq.${runId}`);
      if (expected !== null) {
        const safeExpected=canonical(expected);
        if (typeof safeExpected.problem_id!=='string' || !Number.isInteger(safeExpected.problem_version)
          || typeof safeExpected.problem_fingerprint!=='string' || typeof safeExpected.run_binding!=='string' || !safeExpected.run_binding
          || typeof safeExpected.research_fingerprint!=='string' || !safeExpected.research_fingerprint)
          throw new Error('invalid_run_finish_guard');
        endpoint.searchParams.set('problem_id',`eq.${safeExpected.problem_id}`);
        endpoint.searchParams.set('problem_version',`eq.${safeExpected.problem_version}`);
        endpoint.searchParams.set('problem_fingerprint',`eq.${safeExpected.problem_fingerprint}`);
        endpoint.searchParams.set('state->>run_binding',`eq.${safeExpected.run_binding}`);
        endpoint.searchParams.set('state->>research_fingerprint',`eq.${safeExpected.research_fingerprint}`);
      }
      const response=await fetchImpl(endpoint,{method:'PATCH',headers:{...jsonHeaders,Prefer:'return=representation'},body:JSON.stringify({status,state:safeState})});
      if (!response.ok) throw new Error('research_run_finish_failed:'+response.status);
      const rows=await response.json();
      if (!Array.isArray(rows)||rows.length!==1) throw new Error('research_run_finish_invalid_response');
      return deepFreeze(canonical(rows[0]));
    },
    async getProblem(id,version=1) {
      if (!Number.isInteger(version)||version<1) throw new Error('invalid_problem_version');
      const endpoint=new URL('/rest/v1/research_problem',url);
      endpoint.searchParams.set('id',`eq.${id}`);
      endpoint.searchParams.set('version',`eq.${version}`);
      endpoint.searchParams.set('select','id,kind,domain,question,source,verifier_ids,difficulty,status,version,fingerprint');
      const response=await fetchImpl(endpoint,{headers});
      if (!response.ok) throw new Error('problem_bank_read_failed:'+response.status);
      const rows=await response.json();
      if (!Array.isArray(rows)||rows.length!==1) throw new Error('problem_not_found');
      const view=runnerView(rows[0]);
      if (view.kind==='benchmark_hidden_solution') validateBenchmarkSource(view.source);
      if (problemFingerprint(view)!==view.fingerprint) throw new Error('problem_fingerprint_mismatch');
      return view;
    }
  });
}
