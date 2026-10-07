import { createProblemBankClient } from './problem-bank.mjs';
import { proposeCatalogProblems, renderProposals } from './oraklet-propose-problems.mjs';
import { writeFile } from 'node:fs/promises';

const url=process.env.SUPABASE_URL;
const secretKey=process.env.SUPABASE_SECRET_KEY;
if (!url||!secretKey) throw new Error('missing_problem_bank_environment');
createProblemBankClient({url,secretKey}); // Validate URL and credentials shape.
const endpoint=new URL('/rest/v1/research_problem',url);
endpoint.searchParams.set('select','id');
endpoint.searchParams.set('limit','1000');
const response=await fetch(endpoint,{headers:{apikey:secretKey}});
if (!response.ok) throw new Error('problem_bank_inventory_failed:'+response.status);
const rows=await response.json();
if (!Array.isArray(rows)||rows.length>=1000||!rows.every(r=>typeof r.id==='string'))
  throw new Error('problem_bank_inventory_incomplete');
const proposals=proposeCatalogProblems({existingIds:rows.map(r=>r.id),limit:3});
const markdown=renderProposals(proposals);
await writeFile('oraklet-proposals.md',markdown,'utf8');
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,markdown,{flag:'a'});
console.log(JSON.stringify({ok:true,proposal_count:proposals.length,proposal_ids:proposals.map(p=>p.id),registered:false}));
