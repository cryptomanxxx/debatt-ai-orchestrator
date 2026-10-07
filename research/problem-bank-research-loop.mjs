import { createResearchProblem, researchFingerprint } from './research-loop.mjs';
import { problemFingerprint, runnerView } from './problem-bank.mjs';

function assertBankProblem(problem) {
  const view=runnerView(problem);
  if (!view.id || !view.question || !view.domain || !Number.isInteger(view.version) || typeof view.fingerprint!=='string')
    throw new Error('invalid_problem_bank_problem');
  if (problemFingerprint(view)!==view.fingerprint) throw new Error('problem_fingerprint_mismatch');
  if (view.status!=='active') throw new Error('problem_not_active');
  return view;
}

export function researchProblemFromBank(problem,{maxAttempts=3}={}) {
  const view=assertBankProblem(problem);
  return createResearchProblem({
    id:view.id,
    question:view.question,
    domain:view.domain,
    source:{problem_bank:{kind:view.kind,version:view.version,fingerprint:view.fingerprint,source:view.source??null,
      verifier_ids:view.verifier_ids??[],difficulty:view.difficulty??null}},
    computeBudget:{maxAttempts}
  });
}

export async function startBankResearchRun(client,problem,options={}) {
  if (!client || typeof client.startRun!=='function') throw new Error('invalid_problem_bank_client');
  const view=assertBankProblem(problem);
  const research=researchProblemFromBank(view,options);
  const run=await client.startRun(view,{phase:'research_loop',research_fingerprint:research.fingerprint,research});
  return Object.freeze({problem:view,run,research});
}

export async function finishBankResearchRun(client,session,{status='completed',research=session?.research}={}) {
  if (!client || typeof client.finishRun!=='function') throw new Error('invalid_problem_bank_client');
  if (!session?.run?.id || !session?.problem?.fingerprint) throw new Error('invalid_research_session');
  if (!research || researchFingerprint(research)!==research.fingerprint) throw new Error('invalid_problem_fingerprint');
  const lineage=research.source?.problem_bank;
  if (research.id!==session.problem.id
    || lineage?.version!==session.problem.version
    || lineage?.fingerprint!==session.problem.fingerprint)
    throw new Error('research_problem_lineage_mismatch');
  return client.finishRun(session.run.id,status,{phase:'research_loop_finished',problem_fingerprint:session.problem.fingerprint,
    research_fingerprint:research.fingerprint,research});
}
