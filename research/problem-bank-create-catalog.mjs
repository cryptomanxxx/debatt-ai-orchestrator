import { CATALOG } from './catalog.mjs';
import { createProblem, createProblemBankClient } from './problem-bank.mjs';

export function canonicalVersion(value) {
  const text=String(value);
  if (!/^[1-9][0-9]*$/.test(text)) throw new Error('invalid_canonical_problem_version');
  const number=Number(text);
  if (!Number.isSafeInteger(number) || number > 2147483647) throw new Error('invalid_canonical_problem_version');
  return number;
}

export function makeCatalogProblem({id,experimentId,domain,kind='open',difficulty=2,version=1}) {
  const entry=CATALOG.find(item=>item.id===experimentId);
  if (!entry) throw new Error('unsupported_catalog_experiment');
  if (typeof domain!=='string'||!domain.trim()) throw new Error('invalid_problem_domain');
  return createProblem({
    id,kind,domain,question:entry.question,
    source:{experiment_id:entry.id},
    verifier_ids:[entry.toolId],
    difficulty:Number(difficulty),version:canonicalVersion(version)
  });
}

export async function createOrVerifyCatalogProblem(client,expected) {
  const verify=(existing)=>{
    if (existing.fingerprint!==expected.fingerprint) throw new Error('existing_problem_fingerprint_mismatch');
    if (existing.status!=='active') throw new Error('existing_problem_retired_create_new_version');
    return {created:false,problem:existing};
  };
  let existing;
  try {
    existing=await client.getProblem(expected.id,expected.version);
  } catch (error) {
    if (error?.message!=='problem_not_found') throw error;
  }
  if (existing) return verify(existing);
  try {
    const created=await client.putProblem(expected);
    if (created.fingerprint!==expected.fingerprint||created.status!=='active') throw new Error('created_problem_integrity_mismatch');
    return {created:true,problem:created};
  } catch (error) {
    if (!/409|23505/.test(String(error?.message))) throw error;
    return verify(await client.getProblem(expected.id,expected.version));
  }
}

export async function main(env=process.env) {
  const expected=makeCatalogProblem({
    id:env.PROBLEM_ID,experimentId:env.EXPERIMENT_ID,
    domain:env.PROBLEM_DOMAIN,kind:env.PROBLEM_KIND||'open',
    difficulty:env.PROBLEM_DIFFICULTY||'2',version:env.PROBLEM_VERSION||'1'
  });
  const client=createProblemBankClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  const {created,problem}=await createOrVerifyCatalogProblem(client,expected);
  console.log(JSON.stringify({ok:true,created,problem_id:problem.id,version:problem.version,experiment_id:expected.source.experiment_id,fingerprint:problem.fingerprint}));
}

if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
