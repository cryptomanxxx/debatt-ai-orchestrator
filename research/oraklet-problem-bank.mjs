import { addHypothesis, recordAttempt, recordResult } from './research-loop.mjs';
import { startBankResearchRun, finishBankResearchRun } from './problem-bank-research-loop.mjs';

function boundedText(value,max=3500) {
  const text=String(value??'').trim();
  return text.length>max ? text.slice(0,max) : text;
}
export function resolveProblemExperiment(problem,catalog) {
  const experimentId=problem?.source?.experiment_id;
  const entry=catalog.find(item=>item.id===experimentId);
  if (!entry) throw new Error('problem_bank_experiment_not_supported');
  if (problem.question!==entry.question) throw new Error('problem_bank_question_experiment_mismatch');
  return entry;
}
export function researchStateFromOrakletReport(started,entry,report) {
  let research=addHypothesis(started,{
    id:'catalog-experiment',
    statement:entry.question,
    rationale:'Run the locked Oraklet catalog experiment selected by the Problem Bank entry.'
  });
  const passed=Array.isArray(report?.cases)?report.cases.filter(c=>c?.passed===true).length:0;
  const total=Array.isArray(report?.cases)?report.cases.length:0;
  research=recordAttempt(research,{
    id:'oraklet-run',
    hypothesisId:'catalog-experiment',
    method:boundedText(report?.method||'Oraklet locked catalog experiment',200),
    toolId:report?.toolId||entry.toolId||null,
    outcome:boundedText(report?.executionStatus==='error'?'Execution failed':`Execution ${report?.executionStatus||'unknown'}; report status ${report?.status||'unknown'}; passed cases ${passed}/${total}`),
    evidence:{report_id:report?.reportId??null,experiment_id:report?.experimentId??entry.id,seed:report?.seed??null,
      execution_status:report?.executionStatus??null,report_status:report?.status??null,passed_cases:passed,total_cases:total},
    verification:null
  });
  return recordResult(research,{
    id:'oraklet-result',
    claim:report?.executionStatus==='completed'
      ? 'The locked Oraklet catalog experiment completed; its report is recorded as evidence for this Problem Bank run.'
      : 'The Oraklet catalog experiment did not complete successfully.',
    status:report?.executionStatus==='completed'?'needs_external_verification':'inconclusive',
    significance:{experiment_id:entry.id,report_id:report?.reportId??null},
    verification:null
  });
}
export async function runProblemBankOraklet({client,problem,catalog,execute}) {
  if (!client || typeof client.getProblem!=='function') throw new Error('invalid_problem_bank_client');
  if (typeof execute!=='function') throw new Error('invalid_oraklet_executor');
  const entry=resolveProblemExperiment(problem,catalog);
  const session=await startBankResearchRun(client,problem,{maxAttempts:1});
  let report;
  try {
    report=await execute(entry);
    const research=researchStateFromOrakletReport(session.research,entry,report);
    const terminal=report?.executionStatus==='completed'?'completed':'failed';
    const run=await finishBankResearchRun(client,session,{status:terminal,research});
    return {entry,report,research,run};
  } catch (error) {
    try {
      await finishBankResearchRun(client,session,{status:'failed',research:session.research});
    } catch { /* Preserve the original runner error. */ }
    throw error;
  }
}
