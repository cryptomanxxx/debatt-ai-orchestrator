import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { benchmark, SOURCES } from './literature-benchmark.mjs';
import { persistLiteratureReport } from './literature-database.mjs';
import { boundedJson } from './literature-evidence.mjs';
import { reportedResponse,effectiveLimitationStatus } from './limitation-review.mjs';
import { qualitySeeds,originArticles,reviewHit } from './follow-up-quality.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const keywords = text => [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
  .filter(word => word.length > 2 && !['does','the','with','and','under','which','from','for','how','can','are'].includes(word))
  .slice(0,12).join(' ').slice(0,200).trim();

export function followUpPlan(report, candidateId, {articleId = '', findingIndex = ''} = {}) {
  if (report?.schema_version !== 'literature-evidence-1' || !uuid(report.id)
    || !Array.isArray(report.papers) || report.papers.length > 10
    || !Array.isArray(report.planner?.proposals) || report.planner.proposals.length > 10
    || typeof candidateId !== 'string' || !/^arp-[a-z-]{1,80}$/.test(candidateId)) throw Error('invalid_follow_up_input');
  const matches = report.planner.proposals.filter(p => p.id === candidateId);
  if (matches.length !== 1) throw Error('candidate_not_found');
  const candidate = matches[0];
  if (typeof candidate.research_question !== 'string' || candidate.research_question.length > 2000
    || !Array.isArray(candidate.evidence) || !candidate.evidence.length || candidate.evidence.length > 10) throw Error('invalid_candidate');
  // Query generation is deterministic. Source content never becomes a URL or code.
  const explicit = articleId !== '' || findingIndex !== '';
  const evidenceIds = new Set(candidate.evidence.map(e => e.id));
  let limitation;
  if (explicit) {
    if (typeof articleId !== 'string' || !evidenceIds.has(articleId)
      || !/^[0-2]$/.test(String(findingIndex))) throw Error('invalid_limitation_selection');
    const paper = report.papers.find(p => p.article_id === articleId);
    const index = Number(findingIndex), finding = paper?.findings?.[index];
    if (finding?.kind !== 'limitation') throw Error('limitation_not_found');
    limitation = {paper,finding,index};
  } else {
    // Prefer an ambiguous reported response, then a remaining limitation.
    const choices = report.papers.filter(p => evidenceIds.has(p.article_id)).flatMap(p =>
      (p.findings ?? []).map((finding,index) => ({paper:p,finding,index})))
      .filter(({finding}) => finding.kind === 'limitation' && finding.limitation_status !== 'prior_work');
    limitation = choices.find(({finding}) => reportedResponse(finding)) ??
      choices.find(({finding}) => effectiveLimitationStatus(finding) === 'remaining');
  }
  const paper = limitation?.paper ?? report.papers.find(p => p.article_id === candidate.evidence[0].id);
  if (!paper || typeof paper.title !== 'string' || paper.title.length > 1000) throw Error('invalid_seed_reference');
  let seeds = [candidate.research_question,paper.title];
  if (limitation) {
    const f = limitation.finding;
    if (typeof f.claim !== 'string' || f.claim.length > 500 || typeof f.quote !== 'string'
      || f.quote.length > 280 || (f.context_quote != null && (typeof f.context_quote !== 'string' || f.context_quote.length > 280)))
      throw Error('invalid_limitation_seed');
    const response = reportedResponse(f);
    seeds = [f.claim, response?.solution_seed ?? f.context_quote ?? paper.title];
  }
  const quality = qualitySeeds({paper,limitation:limitation?.finding,candidate,researchQuery:report.query??''});
  const queries = quality.queries.length ? quality.queries : [...new Set(seeds.map(keywords))];
  if (queries.some(q => q.length < 3)) throw Error('empty_follow_up_query');
  return { parent_report_id: report.id, candidate_id: candidateId,
    research_question: candidate.research_question, seed_article_id: paper.article_id, queries,
    quality_context:quality.quality_context,
    origin_articles:originArticles(report.papers.filter(p => evidenceIds.has(p.article_id))),
    query_origin: limitation ? 'deterministic_keywords_from_limitation_and_reported_response_or_context' : 'deterministic_keywords_from_candidate_question_and_first_evidence_title',
    ...(limitation ? {finding_ref:{article_id:paper.article_id,finding_index:limitation.index},
      model_limitation_status:limitation.finding.limitation_status ?? 'unclear',
      limitation_review:reportedResponse(limitation.finding)?.assessment ?? 'unverified_model_interpretation'} : {}),
    limitations: ['Keyword truncation and provider ranking can omit relevant work.',
      'These searches retrieve metadata leads, not verified gaps, contradictions or novelty.'] };
}

export function createFollowUpClient({url, secretKey, fetchImpl = fetch}) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url ?? '')
    || typeof secretKey !== 'string' || !secretKey.startsWith('sb_secret_')) throw Error('invalid_follow_up_environment');
  async function request(path, params, body) {
    const endpoint = new URL('/rest/v1/' + path, url);
    for (const [key,value] of Object.entries(params)) endpoint.searchParams.set(key,value);
    const response = await fetchImpl(endpoint, {redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{apikey:secretKey, ...(body ? {'Content-Type':'application/json',Prefer:'return=representation'} : {})},
      ...(body ? {method:'POST',body:JSON.stringify(body)} : {})});
    if (!response.ok) { await response.body?.cancel(); throw Error('follow_up_database_http_' + response.status); }
    return boundedJson(response,600000);
  }
  return {
    async checkStorage() {
      const rows = await request('literature_follow_up_run',{select:'id',limit:'0'});
      if (!Array.isArray(rows) || rows.length) throw Error('invalid_follow_up_storage');
    },
    async readReport(id) {
      if (!uuid(id)) throw Error('invalid_parent_report_id');
      id = id.toLowerCase(); // PostgreSQL returns UUIDs in canonical lowercase.
      const rows = await request('literature_planner_run',{id:'eq.' + id,select:'id,report',limit:'1'});
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== id || rows[0].report?.id !== id) throw Error('parent_report_not_found');
      return rows[0].report;
    },
    async readFollowUp(id) {
      if (!uuid(id)) throw Error('invalid_follow_up_report_id');
      id=id.toLowerCase();
      const rows=await request('literature_follow_up_run',{id:'eq.'+id,select:'id,report',limit:'1'});
      if (!Array.isArray(rows)||rows.length!==1||rows[0].id!==id||rows[0].report?.id!==id
        ||rows[0].report.schema_version!=='literature-follow-up-1') throw Error('follow_up_report_not_found');
      return rows[0].report;
    },
    async saveReport(report) {
      if (!uuid(report.id) || !uuid(report.parent_report_id) || !uuid(report.literature_run_id)
        || Buffer.byteLength(JSON.stringify(report)) > 500000) throw Error('invalid_follow_up_report');
      const rows = await request('literature_follow_up_run',{}, {id:report.id,parent_report_id:report.parent_report_id,
        literature_run_id:report.literature_run_id,candidate_id:report.candidate_id,report});
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== report.id) throw Error('follow_up_save_failed');
    }
  };
}

export async function runFollowUp(plan, {search = benchmark, persist, id = randomUUID(), now = () => new Date().toISOString(), searchOptions = {}}) {
  const searches = await search({...searchOptions,queries:plan.queries,sources:SOURCES,limit:10,
    requestDelayMs:3000,maxRetries:1,maxBackoffMs:5000,semanticScholarMode:'bulk'});
  // Provider exceptions may contain URLs or secrets; retain bounded status only.
  for (const result of searches.results) for (const value of Object.values(result.sources)) delete value.error;
  if (plan.quality_context) for (const result of searches.results) for (const value of Object.values(result.sources))
    for (const paper of value.papers ?? []) paper.selection_review=reviewHit(paper,plan.quality_context,plan.origin_articles);
  const receipt = await persist(searches);
  if (!uuid(receipt?.runId)) throw Error('invalid_follow_up_import_receipt');
  const values = searches.results.flatMap(r => Object.values(r.sources));
  const successful = values.filter(v => v.status === 'ok').length;
  return {schema_version:'literature-follow-up-1',id,...plan,literature_run_id:receipt.runId,created_at:now(),
    status:successful === values.length ? 'completed' : successful ? 'partial' : 'failed',
    budget:{max_queries:2,max_records_per_source:10,max_search_attempts:16,model_calls:0},
    searches,assessment:null,novelty:'unknown',execution_enabled:false};
}

export function renderFollowUp(report) {
  // Markdown contains only generated queries and controlled IDs/status; raw metadata is in JSON/DB.
  const safe = value => String(value).replace(/[\r\n`<>]/g,' ');
  return ['# Literature follow-up', '',`Status: ${safe(report.status)}.`,
    `Parent report: ${safe(report.parent_report_id)}. Candidate: ${safe(report.candidate_id)}.`,
    `Saved literature run: ${safe(report.literature_run_id)}.`, '',
    ...report.searches.results.flatMap((r,i) => [`Query ${i}: ${safe(r.query)}`,
      ...SOURCES.map(s => `${s}: ${r.sources[s].status}; records ${r.sources[s].records ?? 0}; HTTP ${r.sources[s].httpStatus ?? 'n/a'}.`),
      `Confirmed origin hits: ${Object.values(r.sources).flatMap(v=>v.papers??[]).filter(p=>p.selection_review?.origin_relation==='confirmed_origin').length}; possible title matches: ${Object.values(r.sources).flatMap(v=>v.papers??[]).filter(p=>p.selection_review?.origin_relation==='possible_origin_title').length}.`,'']),
    'Model calls: 0. Metadata only; novelty remains unknown. No experiments are enabled.',
    'Review related and subsequent work, contrary results and full-paper assumptions before assessing a gap.', ''].join('\n');
}

export function followUpOriginUrl(env) {
  const repository = env.GITHUB_REPOSITORY, runId = env.GITHUB_RUN_ID;
  if (typeof repository !== 'string' || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)
    || typeof runId !== 'string' || !/^[1-9][0-9]*$/.test(runId)) return null;
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

export async function main(env = process.env,{directory='reports/literature-follow-up'}={}) {
  const client = createFollowUpClient({url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY});
  await client.checkStorage(); // Fail before provider requests if migration is missing.
  const parent = await client.readReport(env.PLANNER_REPORT_ID);
  const plan = followUpPlan(parent,env.RESEARCH_CANDIDATE_ID,{
    articleId:env.LIMITATION_ARTICLE_ID ?? '',findingIndex:env.LIMITATION_FINDING_INDEX ?? ''});
  const id = randomUUID();
  await mkdir(directory,{recursive:true});
  const report = await runFollowUp(plan,{id,
    searchOptions:{openAlexKey:env.OPENALEX_API_KEY,semanticScholarKey:env.SEMANTIC_SCHOLAR_API_KEY,coreApiKey:env.CORE_API_KEY},
    persist:searches => persistLiteratureReport(searches,{url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY,
      runKey:'follow-up:' + id,originUrl:followUpOriginUrl(env)})});
  report.code_commit = env.GITHUB_SHA ?? null;
  await writeFile(directory + '/report.json',JSON.stringify(report,null,2) + '\n');
  const markdown = renderFollowUp(report);
  await writeFile(directory + '/report.md',markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,markdown);
  await client.saveReport(report);
  console.log(JSON.stringify({saved:true,id,status:report.status,literature_run_id:report.literature_run_id,model_calls:0}));
  if (report.status === 'failed') throw Error('all_follow_up_searches_failed');
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {console.error('Literature follow-up failed. Inspect report artifact and summary if available.');process.exitCode = 1;});
}
