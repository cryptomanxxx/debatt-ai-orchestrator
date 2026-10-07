import { createProblemBankClient } from './problem-bank.mjs';
import { CATALOG } from './catalog.mjs';

const url=process.env.SUPABASE_URL;
const secretKey=process.env.SUPABASE_SECRET_KEY;
const id=process.env.PROBLEM_BANK_ID;
const version=Number(process.env.PROBLEM_BANK_VERSION||'1');
if (!url||!secretKey||!id||!Number.isInteger(version)||version<1) throw new Error('missing_problem_bank_runner_environment');

const client=createProblemBankClient({url,secretKey});
const problem=await client.getProblem(id,version);
const experimentId=problem?.source?.experiment_id;
const entry=CATALOG.find(item=>item.id===experimentId);
if (!entry) throw new Error('problem_bank_experiment_not_supported');
if (problem.question!==entry.question) throw new Error('problem_bank_question_experiment_mismatch');
process.stdout.write(entry.id);
