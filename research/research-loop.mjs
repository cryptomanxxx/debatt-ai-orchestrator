import { createHash } from 'node:crypto';

export const RESEARCH_STATUSES = Object.freeze(['verified','falsified','inconclusive','needs_external_verification']);

function jsonValue(value, path='value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('invalid_json_value:' + path);
    return value;
  }
  if (Array.isArray(value)) return value.map((v,i)=>jsonValue(v,path+'['+i+']'));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out={};
    for (const key of Object.keys(value).sort()) {
      const v=value[key];
      if (v === undefined || ['function','symbol','bigint'].includes(typeof v)) throw new Error('invalid_json_value:' + path+'.'+key);
      out[key]=jsonValue(v,path+'.'+key);
    }
    return out;
  }
  throw new Error('invalid_json_value:' + path);
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
export function researchFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(jsonValue(value))).digest('hex');
}
function immutableResearchState(value) {
  const copy=jsonValue(value);
  return deepFreeze({...copy,fingerprint:researchFingerprint(copy)});
}
function verificationEnvelope(value) {
  const v=jsonValue(value,'verification');
  if (!v || typeof v !== 'object' || Array.isArray(v)
    || typeof v.tool !== 'string' || !v.tool.trim()
    || v.independent !== true
    || !Object.hasOwn(v,'result')) throw new Error('invalid_verification');
  return v;
}
function requiredText(value, name, max=4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid_' + name);
  return value.trim();
}
export function createResearchProblem({ id, question, domain, source=null, computeBudget={ maxAttempts:3 } }) {
  const maxAttempts=Number(computeBudget?.maxAttempts);
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(id||'')) throw new Error('invalid_problem_id');
  if (!Number.isInteger(maxAttempts) || maxAttempts<1 || maxAttempts>20) throw new Error('invalid_compute_budget');
  const problem={schemaVersion:1,id,question:requiredText(question,'question'),domain:requiredText(domain,'domain',120),source:jsonValue(source,'source'),
    status:'inconclusive',computeBudget:{maxAttempts},hypotheses:[],attempts:[],results:[],revisions:[]};
  return immutableResearchState(problem);
}
export function addHypothesis(problem, hypothesis) {
  const h={id:requiredText(hypothesis.id,'hypothesis_id',120),statement:requiredText(hypothesis.statement,'hypothesis',3000),
    rationale:requiredText(hypothesis.rationale,'rationale',3000),parentId:hypothesis.parentId??null,status:'proposed'};
  if(problem.hypotheses.some(x=>x.id===h.id)) throw new Error('duplicate_hypothesis');
  return evolve(problem,{hypotheses:[...problem.hypotheses,h]},'hypothesis_added');
}
export function recordAttempt(problem, attempt) {
  if(problem.attempts.length>=problem.computeBudget.maxAttempts) throw new Error('compute_budget_exhausted');
  const a={id:requiredText(attempt.id,'attempt_id',120),hypothesisId:requiredText(attempt.hypothesisId,'hypothesis_id',120),
    method:requiredText(attempt.method,'method',200),toolId:attempt.toolId?requiredText(attempt.toolId,'tool_id',120):null,
    outcome:requiredText(attempt.outcome,'outcome'),evidence:jsonValue(attempt.evidence??null,'evidence'),verification:jsonValue(attempt.verification??null,'verification')};
  if(!problem.hypotheses.some(h=>h.id===a.hypothesisId)) throw new Error('unknown_hypothesis');
  if(problem.attempts.some(x=>x.id===a.id)) throw new Error('duplicate_attempt');
  return evolve(problem,{attempts:[...problem.attempts,a]},'attempt_recorded');
}
export function recordResult(problem, result) {
  const status=result.status;
  if(!RESEARCH_STATUSES.includes(status)) throw new Error('invalid_research_status');
  let verification=jsonValue(result.verification??null,'verification');
  if(status==='verified'||status==='falsified') {
    if(!result.verification) throw new Error('verification_required');
    verification=verificationEnvelope(result.verification);
  }
  const r={id:requiredText(result.id,'result_id',120),claim:requiredText(result.claim,'claim'),status,
    significance:jsonValue(result.significance??null,'significance'),verification,parentResultId:result.parentResultId??null};
  if(problem.results.some(x=>x.id===r.id)) throw new Error('duplicate_result');
  return evolve(problem,{results:[...problem.results,r],status},'result_recorded');
}
function evolve(problem, patch, reason) {
  const base={...problem,...patch}; delete base.fingerprint;
  const revision={version:problem.revisions.length+1,reason,previousFingerprint:problem.fingerprint};
  base.revisions=[...problem.revisions,revision];
  return immutableResearchState(base);
}
export function researchSummary(problem) {
  return {id:problem.id,status:problem.status,attempts:String(problem.attempts.length)+'/'+String(problem.computeBudget.maxAttempts),
    hypotheses:problem.hypotheses.length,results:problem.results.length,fingerprint:problem.fingerprint};
}
