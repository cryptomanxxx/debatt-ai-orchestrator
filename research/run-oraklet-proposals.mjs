import { CATALOG } from './catalog.mjs';
import { createProblemBankClient } from './problem-bank.mjs';
import { proposeCatalogProblems, renderProposals } from './oraklet-propose-problems.mjs';
import { writeFile } from 'node:fs/promises';

export async function findExistingCandidateIds(client, candidates) {
  const existing=[];
  for (const candidate of candidates) {
    try {
      await client.getProblem(candidate.id,candidate.version);
      existing.push(candidate.id);
    } catch (error) {
      if (error?.message!=='problem_not_found') throw error;
    }
  }
  return existing;
}

export async function main(env=process.env) {
  if (!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY) throw new Error('missing_problem_bank_environment');
  const client=createProblemBankClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  const candidates=proposeCatalogProblems({limit:CATALOG.filter(e=>e.automatic!==false).length});
  const existingIds=await findExistingCandidateIds(client,candidates);
  const proposals=proposeCatalogProblems({existingIds,limit:3});
  const markdown=renderProposals(proposals);
  await writeFile('oraklet-proposals.md',markdown,'utf8');
  if (env.GITHUB_STEP_SUMMARY) await writeFile(env.GITHUB_STEP_SUMMARY,markdown,{flag:'a'});
  console.log(JSON.stringify({ok:true,proposal_count:proposals.length,proposal_ids:proposals.map(p=>p.id),registered:false}));
}

if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
