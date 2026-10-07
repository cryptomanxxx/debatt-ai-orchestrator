import { createProblem, createProblemBankClient } from './problem-bank.mjs';

const url=process.env.SUPABASE_URL;
const secretKey=process.env.SUPABASE_SECRET_KEY;
if (!url||!secretKey) throw new Error('missing_problem_bank_environment');

const client=createProblemBankClient({url,secretKey});
const expected=createProblem({
  id:'problem-bank-smoke-fixture',
  kind:'open',
  domain:'integration-test',
  question:'Can the Problem Bank persist and complete a research run end to end?',
  difficulty:1,
  verifier_ids:[]
});

let problem;
try {
  problem=await client.getProblem(expected.id,expected.version);
  if (problem.fingerprint!==expected.fingerprint) throw new Error('smoke_fixture_mismatch');
  console.log(JSON.stringify({ok:true,created:false,problem_id:problem.id,version:problem.version}));
} catch (error) {
  if (error?.message!=='problem_not_found') throw error;
  problem=await client.putProblem(expected);
  if (problem.fingerprint!==expected.fingerprint) throw new Error('smoke_fixture_fingerprint_mismatch');
  console.log(JSON.stringify({ok:true,created:true,problem_id:problem.id,version:problem.version}));
}
