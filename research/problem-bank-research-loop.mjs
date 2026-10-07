import { createResearchProblem, addHypothesis, recordAttempt, recordResult, researchFingerprint } from './research-loop.mjs';
import { problemFingerprint, runnerView } from './problem-bank.mjs';

function assertBankProblem(problem) {
  const view=runnerView(problem);
  if (!view.id || !view.question || !view.domain || !Number.isInteger(view.version) || typeof view.fingerprint!=='string') throw new Error('invalid_problem_bank_problem');
  if (problemFingerprint(view)!==view.fingerprint) throw new Error('problem_fingerprint_mismatch');
  if (view.status!=='active') throw new Error('problem_not_active');
  return view;
}
function sameJson(a,b) { return JSON.stringify(a)===JSON.stringify(b); }
function descendsFrom(research,started) {
  if (research.fingerprint===started.fingerprint) return true;
  if (research.schemaVersion!==started.schemaVersion || research.id!==started.id
    || research.question!==started.question || research.domain!==started.domain
    || !sameJson(research.source,started.source) || !sameJson(research.computeBudget,started.computeBudget)) return false;
  if (!sameJson(research.hypotheses.slice(0,started.hypotheses.length),started.hypotheses)
    || !sameJson(research.attempts.slice(0,started.attempts.length),started.attempts)
    || !sameJson(research.results.slice(0,started.results.length),started.results)
    || !sameJson(research.revisions.slice(0,started.revisions.length),started.revisions)) return false;
  let replayed=started, h=started.hypotheses.length, a=started.attempts.length, r=started.results.length;
  try {
    for (let i=started.revisions.length;i<research.revisions.length;i++) {
      const revision=research.revisions[i];
      if (revision.version!==i+1 || revision.previousFingerprint!==replayed.fingerprint) return false;
      if (revision.reason==='hypothesis_added') {
        if (h>=research.hypotheses.length) return false;
        replayed=addHypothesis(replayed,research.hypotheses[h++]);
      } else if (revision.reason==='attempt_recorded') {
        if (a>=research.attempts.length) return false;
        replayed=recordAttempt(replayed,research.attempts[a++]);
      } else if (revision.reason==='result_recorded') {
        if (r>=research.results.length) return false;
        replayed=recordResult(replayed,research.results[r++]);
      } else return false;
      if (!sameJson(replayed.revisions[i],revision)) return false;
    }
  } catch { return false; }
  return h===research.hypotheses.length && a===research.attempts.length && r===research.results.length
    && replayed.fingerprint===research.fingerprint && sameJson(replayed,research);
}
function assertRunLineage(run,problem,researchFingerprintValue,runBinding) {
  if (!run || typeof run.id!=='string' || !run.id
    || run.problem_id!==problem.id || run.problem_version!==problem.version || run.problem_fingerprint!==problem.fingerprint)
    throw new Error('research_run_lineage_mismatch');
  if (!run.state || run.state.research_fingerprint!==researchFingerprintValue || run.state.run_binding!==runBinding)
    throw new Error('research_run_state_mismatch');
}
export function researchProblemFromBank(problem,{maxAttempts=3}={}) {
  const view=assertBankProblem(problem);
  return createResearchProblem({id:view.id,question:view.question,domain:view.domain,source:{problem_bank:{kind:view.kind,version:view.version,
    fingerprint:view.fingerprint,source:view.source??null,verifier_ids:view.verifier_ids??[],difficulty:view.difficulty??null}},computeBudget:{maxAttempts}});
}
export async function startBankResearchRun(client,problem,options={}) {
  if (!client || typeof client.startRun!=='function') throw new Error('invalid_problem_bank_client');
  const view=assertBankProblem(problem), research=researchProblemFromBank(view,options);
  const runBinding=crypto.randomUUID();
  const run=await client.startRun(view,{phase:'research_loop',run_binding:runBinding,research_fingerprint:research.fingerprint,research});
  assertRunLineage(run,view,research.fingerprint,runBinding);
  return Object.freeze({problem:view,run,research,runBinding});
}
export async function finishBankResearchRun(client,session,{status='completed',research=session?.research}={}) {
  if (!client || typeof client.finishRun!=='function') throw new Error('invalid_problem_bank_client');
  if (!session?.run?.id || !session?.problem?.fingerprint || !session?.research?.fingerprint || !session?.runBinding) throw new Error('invalid_research_session');
  assertRunLineage(session.run,session.problem,session.research.fingerprint,session.runBinding);
  if (!research || researchFingerprint(research)!==research.fingerprint) throw new Error('invalid_problem_fingerprint');
  const lineage=research.source?.problem_bank;
  if (research.id!==session.problem.id || lineage?.version!==session.problem.version || lineage?.fingerprint!==session.problem.fingerprint)
    throw new Error('research_problem_lineage_mismatch');
  if (!descendsFrom(research,session.research)) throw new Error('research_state_lineage_mismatch');
  return client.finishRun(session.run.id,status,{phase:'research_loop_finished',run_binding:session.runBinding,
    problem_fingerprint:session.problem.fingerprint,research_fingerprint:research.fingerprint,research},{
    problem_id:session.problem.id,problem_version:session.problem.version,
    problem_fingerprint:session.problem.fingerprint,run_binding:session.runBinding,
    research_fingerprint:session.research.fingerprint
  });
}
