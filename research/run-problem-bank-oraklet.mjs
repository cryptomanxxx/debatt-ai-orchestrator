import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createProblemBankClient } from './problem-bank.mjs';
import { CATALOG } from './catalog.mjs';
import { runProblemBankOraklet } from './oraklet-problem-bank.mjs';

const execFileAsync=promisify(execFile);
const url=process.env.SUPABASE_URL;
const secretKey=process.env.SUPABASE_SECRET_KEY;
const problemId=process.env.PROBLEM_BANK_ID;
const version=Number(process.env.PROBLEM_BANK_VERSION||'1');
if (!url||!secretKey||!problemId||!Number.isInteger(version)||version<1) throw new Error('missing_problem_bank_runner_environment');

const client=createProblemBankClient({url,secretKey});
const problem=await client.getProblem(problemId,version);
const runner=fileURLToPath(new URL('./runner.mjs',import.meta.url));

const result=await runProblemBankOraklet({
  client,problem,catalog:CATALOG,
  execute:async entry=>{
    let childError;
    try {
      await execFileAsync(process.execPath,[runner],{
        cwd:process.cwd(),
        env:{...process.env,EXPERIMENT:entry.id},
        maxBuffer:1024*1024*4
      });
    } catch (error) { childError=error; }
    let report;
    try { report=JSON.parse(await readFile('reports/oraklet-lab/report.json','utf8')); }
    catch { if (childError) throw childError; throw new Error('oraklet_report_missing'); }
    if (childError && report.executionStatus!=='error') throw childError;
    return report;
  }
});
console.log(JSON.stringify({ok:result.report.executionStatus==='completed',problem_id:problem.id,problem_version:problem.version,
  experiment_id:result.entry.id,research_run_id:result.run.id,research_status:result.research.status}));
if (result.report.executionStatus!=='completed') throw new Error('oraklet_problem_bank_experiment_failed');
