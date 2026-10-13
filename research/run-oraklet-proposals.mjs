import { CATALOG } from './catalog.mjs';
import { createProblemBankClient } from './problem-bank.mjs';
import { proposeCatalogProblems, renderProposals } from './oraklet-propose-problems.mjs';
import { literatureProblemProposals, renderLiteratureProposals } from './literature-problem-proposals.mjs';
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

// Reads the newest saved literature evidence reports (bounded) for review-only proposals.
export async function readRecentLiteratureReports({url,secretKey,fetchImpl=fetch,limit=10}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url??'')) throw new Error('invalid_literature_database_environment');
  const endpoint=new URL('/rest/v1/literature_planner_run',url);
  endpoint.searchParams.set('select','report');
  endpoint.searchParams.set('order','created_at.desc,id.asc');
  endpoint.searchParams.set('limit',String(limit));
  const response=await fetchImpl(endpoint,{headers:{apikey:secretKey},redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!response.ok) {await response.body?.cancel();throw new Error('literature_reports_unavailable');}
  const text=await response.text();
  if (text.length>8_000_000) throw new Error('literature_reports_too_large');
  const rows=JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error('literature_reports_invalid_response');
  return rows.map(row=>row?.report).filter(Boolean);
}

export async function main(env=process.env,fetchImpl=fetch) {
  if (!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY) throw new Error('missing_problem_bank_environment');
  const client=createProblemBankClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY,fetchImpl});
  const candidates=proposeCatalogProblems({limit:CATALOG.filter(e=>e.automatic!==false).length});
  const existingIds=await findExistingCandidateIds(client,candidates);
  const proposals=proposeCatalogProblems({existingIds,limit:3});
  const reports=await readRecentLiteratureReports({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY,fetchImpl});
  const literatureCandidates=literatureProblemProposals(reports,{limit:20});
  const registeredIds=await findExistingCandidateIds(client,literatureCandidates);
  const literature=literatureProblemProposals(reports,{existingProblemIds:registeredIds,limit:5});
  const markdown=renderProposals(proposals)+'\n'+renderLiteratureProposals(literature);
  await writeFile('oraklet-proposals.md',markdown,'utf8');
  if (env.GITHUB_STEP_SUMMARY) await writeFile(env.GITHUB_STEP_SUMMARY,markdown,{flag:'a'});
  console.log(JSON.stringify({ok:true,proposal_count:proposals.length,proposal_ids:proposals.map(p=>p.id),
    literature_proposal_ids:literature.map(p=>p.id),registered:false}));
}

if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
