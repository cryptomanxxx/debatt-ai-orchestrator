import { createProblem, createProblemBankClient } from './problem-bank.mjs';

const url=process.env.SUPABASE_URL;
const secretKey=process.env.SUPABASE_SECRET_KEY;
if (!url||!secretKey) throw new Error('missing_problem_bank_environment');

const client=createProblemBankClient({url,secretKey});
const expected=createProblem({
  id:'oraklet-sympy-quadratic-001',
  kind:'open',
  domain:'symbolic-mathematics',
  question:'Kan Oraklet ange exakt alla distinkta reella rötter och avvisa felaktiga rotmängder?',
  source:{experiment_id:'sympy-quadratic'},
  difficulty:2,
  verifier_ids:['sympy']
});

let problem;
try {
  problem=await client.getProblem(expected.id,expected.version);
  if (problem.fingerprint!==expected.fingerprint) throw new Error('oraklet_problem_mismatch');
  console.log(JSON.stringify({ok:true,created:false,problem_id:problem.id,version:problem.version,fingerprint:problem.fingerprint}));
} catch (error) {
  if (error?.message!=='problem_not_found') throw error;
  problem=await client.putProblem(expected);
  if (problem.fingerprint!==expected.fingerprint) throw new Error('oraklet_problem_fingerprint_mismatch');
  console.log(JSON.stringify({ok:true,created:true,problem_id:problem.id,version:problem.version,fingerprint:problem.fingerprint}));
}
