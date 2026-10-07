import { createHash } from 'node:crypto';

export const PROBLEM_KINDS=Object.freeze(['open','benchmark_hidden_solution','solved_training','verified_reference','failed_attempt']);

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('invalid_problem_json');
    return Object.is(value,-0)?0:value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out={};
    for (const key of Object.keys(value).sort()) Object.defineProperty(out,key,{value:canonical(value[key]),enumerable:true,writable:true,configurable:true});
    return out;
  }
  throw new Error('invalid_problem_json');
}
export function problemFingerprint(problem) {
  const value=canonical(problem);
  delete value.fingerprint;
  delete value.created_at;
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function createProblem(input) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(input?.id??'')) throw new Error('invalid_problem_id');
  if (!PROBLEM_KINDS.includes(input.kind)) throw new Error('invalid_problem_kind');
  if (typeof input.domain!=='string'||!input.domain.trim()) throw new Error('invalid_problem_domain');
  if (typeof input.question!=='string'||!input.question.trim()) throw new Error('invalid_problem_question');
  const problem=canonical({id:input.id,kind:input.kind,domain:input.domain.trim(),question:input.question.trim(),source:input.source??null,
    verifier_ids:input.verifier_ids??[],difficulty:input.difficulty??null,status:input.status??'active',version:input.version??1});
  return Object.freeze({...problem,fingerprint:problemFingerprint(problem)});
}
export function runnerView(row) {
  const allowed=['id','kind','domain','question','source','verifier_ids','difficulty','status','version','fingerprint'];
  const view={};
  for (const key of allowed) if (Object.hasOwn(row,key)) view[key]=canonical(row[key]);
  return Object.freeze(view);
}
export function assertNoHiddenReference(value) {
  for (const key of ['reference_solution','reference_fingerprint','solution','answer'])
    if (Object.hasOwn(value??{},key)) throw new Error('hidden_reference_leak');
  return value;
}
export function createProblemBankClient({url,secretKey,fetchImpl=fetch}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url??'')) throw new Error('invalid_supabase_url');
  if (typeof secretKey!=='string'||!secretKey) throw new Error('missing_supabase_secret');
  const headers={apikey:secretKey,Authorization:`Bearer ${secretKey}`};
  return Object.freeze({
    async getProblem(id) {
      const endpoint=new URL('/rest/v1/research_problem',url);
      endpoint.searchParams.set('id',`eq.${id}`);
      endpoint.searchParams.set('select','id,kind,domain,question,source,verifier_ids,difficulty,status,version,fingerprint');
      const response=await fetchImpl(endpoint,{headers});
      if (!response.ok) throw new Error('problem_bank_read_failed:'+response.status);
      const rows=await response.json();
      if (!Array.isArray(rows)||rows.length!==1) throw new Error('problem_not_found');
      return assertNoHiddenReference(runnerView(rows[0]));
    }
  });
}
