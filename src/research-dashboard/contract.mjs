// Fixed choices shared by the Worker and research runner. No arbitrary workflow/ref inputs.
export const RESEARCH_CHOICES = ['PINNs and turbulence','Experiment design','Kalman state estimation','Causal inference','Model evaluation'];
export const PIPELINE_STAGES = ['preflight','collection','initial_evidence','follow_up_search','follow_up_selection','follow_up_evidence'];
export const RESEARCH_REPOSITORY = 'cryptomanxxx/debatt-ai-orchestrator';
export const PIPELINE_WORKFLOW = 'research-pipeline.yml';
export const uuid = value => typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const pipelineStatus = ['running','completed','partial','insufficient_evidence','insufficient_relevant_hits','insufficient_abstract_identifiers','error'];
export const isStart = value => value&&Object.keys(value).sort().join(',')==='area,id,model_budget'
  &&uuid(value.id)&&RESEARCH_CHOICES.includes(value.area)&&[5,10].includes(value.model_budget);
export function isSnapshot(r) {
  return r&&r.schema_version==='research-pipeline-1'&&uuid(r.id)&&RESEARCH_CHOICES.includes(r.area)
    &&pipelineStatus.includes(r.status)&&r.execution_enabled===false&&[5,10].includes(r.budget?.maximum_model_calls)
    &&Number.isInteger(r.budget.known_model_calls)&&r.budget.known_model_calls>=0
    &&r.budget.known_model_calls<=r.budget.maximum_model_calls&&Number.isInteger(r.checkpoint_sequence)&&r.checkpoint_sequence>=1
    &&Array.isArray(r.stages)&&r.stages.length<=6&&r.stages.every((s,i)=>s.name===PIPELINE_STAGES[i])
    &&(r.github_run_id===null||/^[1-9]\d{0,19}$/.test(r.github_run_id))
    &&Number.isInteger(r.github_run_attempt)&&r.github_run_attempt>=1;
}
