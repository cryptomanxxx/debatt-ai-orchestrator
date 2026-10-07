import { createProblemBankClient } from './problem-bank.mjs';

const url=process.env.SUPABASE_URL;
const secretKey=process.env.SUPABASE_SECRET_KEY;
if (!url||!secretKey) throw new Error('missing_problem_bank_environment');

const client=createProblemBankClient({url,secretKey});
const suffix=Date.now().toString(36);
const input={id:`smoke-${suffix}`,kind:'open',domain:'integration-test',question:'Can the Problem Bank persist and complete a research run end to end?',difficulty:1,verifier_ids:[]};

const problem=await client.putProblem(input);
const started=await client.startRun(problem,{phase:'started',smoke:true});
const finished=await client.finishRun(started.id,'completed',{phase:'completed',smoke:true});
const loaded=await client.getProblem(problem.id,problem.version);

if (finished.status!=='completed') throw new Error('smoke_run_not_completed');
if (!finished.completed_at) throw new Error('smoke_missing_database_completion_time');
if (loaded.fingerprint!==problem.fingerprint) throw new Error('smoke_problem_fingerprint_changed');

console.log(JSON.stringify({ok:true,problem_id:problem.id,run_id:started.id,status:finished.status,completed_at:finished.completed_at}));
