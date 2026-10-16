// Review-only bridge: literature evidence -> bounded search -> Research Loop + portfolio queue.
// Neither a verifier nor an experiment executor. All branches are deterministic and allowlisted.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { agenticTreeSearch } from './agentic-tree-search.mjs';
import { createResearchProblem, addHypothesis } from './research-loop.mjs';
import { candidateProtocol, portfolioAssessment } from './research-candidate-protocols.mjs';
import { createFollowUpClient } from './literature-follow-up.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{64}$/i;
const ID = /^arp-[a-z0-9-]{1,76}$/;
const BRANCHES = Object.freeze([
  { id:'replication', label:'Independent replication with matched baseline' },
  { id:'null-test', label:'Falsification against a matched null baseline' },
]);
const DIMENSIONS = Object.keys(portfolioAssessment());
const assert = (condition, code) => { if (!condition) throw Error(code); };
const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const sorted = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const round = v => Math.round(v * 1000) / 1000;

export function validateTreeEvidence(report) {
  assert(report?.schema_version === 'literature-evidence-1' && UUID.test(report.id)
    && ['completed','partial','insufficient_evidence'].includes(report.status)
    && report.planner?.mode === 'abstract-evidence-baseline'
    && Array.isArray(report.papers) && report.papers.length <= 10
    && Array.isArray(report.planner.proposals) && report.planner.proposals.length <= 10
    && Buffer.byteLength(JSON.stringify(report)) <= 500_000, 'invalid_tree_evidence_report');
  const papers = new Map();
  for (const paper of report.papers) {
    assert(text(paper?.article_id, 250) && !papers.has(paper.article_id), 'invalid_tree_paper');
    papers.set(paper.article_id,paper);
  }
  const seen = new Set();
  const candidates = [];
  for (const p of report.planner.proposals) {
    assert(ID.test(p?.id ?? '') && p.id.length <= 40 && !seen.has(p.id)
      && p.status === 'candidate_unverified' && p.requires_human_approval === true
      && text(p.research_question, 2000) && text(p.hypothesis, 3000)
      && text(p.proposed_method, 3000)
      && Array.isArray(p.evidence) && p.evidence.length > 0 && p.evidence.length <= 10
      && p.priority_score === null
      && p.scores && DIMENSIONS.every(k => p.scores[k] === null)
      && p.portfolio_assessment && DIMENSIONS.every(k =>
        p.portfolio_assessment[k]?.status === 'unknown' && p.portfolio_assessment[k]?.value === null),
      'invalid_tree_candidate');
    seen.add(p.id);
    const used = new Set();
    for (const e of p.evidence) {
      const paper = papers.get(e?.id);
      assert(text(e?.id,250) && !used.has(e.id) && paper?.status === 'summarized'
        && SHA.test(e.analyzed_content_sha256 ?? '') && SHA.test(e.content_sha256 ?? '')
        && e.analyzed_content_sha256 === paper.content?.analyzed_sha256
        && e.content_sha256 === paper.content?.sha256
        && text(e.url,2048) && /^https:\/\//i.test(e.url)
        && e.url === paper.content?.url && e.verification === 'quote_match_only',
        'invalid_tree_citation');
      used.add(e.id);
    }
    assert(!p.gap_candidates || (Array.isArray(p.gap_candidates) && p.gap_candidates.length <= 30
      && p.gap_candidates.every(g => used.has(g.article_id)
      && g.status === 'candidate_needs_literature_review')), 'invalid_tree_gap');
    assert(p.experiment_protocol?.execution_ready === false
      && p.experiment_protocol?.status === 'draft_requires_specification',
      'invalid_tree_protocol');
    candidates.push(p);
  }
  return candidates.sort((a,b) => b.evidence.length-a.evidence.length
    || (b.gap_candidates?.length??0)-(a.gap_candidates?.length??0)
    || sorted(a.id,b.id));
}

function coverage(p) {
  const cited_abstracts=p.evidence.length;
  const unreviewed_gap_leads=p.gap_candidates?.length??0;
  const has_baseline=Array.isArray(p.experiment_protocol?.baselines)
    && p.experiment_protocol.baselines.length>0;
  // A bounded routing heuristic, NEVER scientific confidence or merit.
  return { cited_abstracts,unreviewed_gap_leads,has_baseline };
}
function priority(basis, depth) {
  return round(Math.min(0.90,0.10+Math.min(basis.cited_abstracts,5)*0.10
    +Math.min(basis.unreviewed_gap_leads,3)*0.025
    +(basis.has_baseline?0.05:0)-(depth===2?0.01:0)));
}
function hypothesis(candidate, kind) {
  if (kind==='candidate') return candidate.hypothesis;
  if (kind==='replication') return 'Test whether the candidate intervention changes the primary outcome relative to a matched baseline on independent held-out data.';
  return 'Test whether the candidate intervention fails to improve the primary outcome over a matched baseline under pre-registered held-out conditions.';
}

export async function planResearchTree(report,{maxNodes=8,maxCandidates=3}={}) {
  assert(Number.isInteger(maxNodes) && maxNodes>=1 && maxNodes<=12
    && Number.isInteger(maxCandidates) && maxCandidates>=1 && maxCandidates<=4,
  'invalid_tree_limits');
  const candidates=validateTreeEvidence(report).slice(0,maxCandidates);
  const byId=new Map(candidates.map(c=>[c.id,c]));
  const nodeMeta=new Map();
  const search=await agenticTreeSearch({
    maxNodes,maxDepth:2,maxChildren:Math.max(2,maxCandidates),
    expand:parent => {
      if(parent.depth===0) return candidates.map(c=>({id:c.id,label:'Review candidate '+c.id}));
      return BRANCHES;
    },
    evaluate:node => {
      const candidate=byId.get(node.path[0]);
      assert(candidate && (node.depth===1 || BRANCHES.some(b=>b.id===node.actionId)),
        'invalid_tree_path');
      const basis=coverage(candidate);
      const kind=node.depth===1?'candidate':node.actionId;
      nodeMeta.set(node.id,{candidate,kind,basis});
      return {verified:false,score:priority(basis,node.depth),
        result:{status:'review_only',candidate_id:candidate.id,branch_kind:kind,
          routing_basis:basis,verification:'not_performed'}};
    },
  });
  let research=createResearchProblem({
    id:'tree-'+report.id.toLowerCase(),
    question:'Which literature-linked research directions should receive independent review?',
    domain:'scientific-research-planning',
    source:{kind:'abstract-evidence-review',report_id:report.id.toLowerCase(),
      report_sha256:createHash('sha256').update(JSON.stringify(report)).digest('hex')},
    computeBudget:{maxAttempts:3},
  });
  const hypothesisIds=new Map();
  const reviewQueue=[];
  for(const [index,node] of search.trace.entries()){
    const {candidate,kind,basis}=nodeMeta.get(node.id);
    const hId='tree-h'+String(index+1);
    const parentId=node.parentId==='root'?null:hypothesisIds.get(node.parentId);
    assert(node.parentId==='root'||parentId,'invalid_tree_parent');
    research=addHypothesis(research,{id:hId,parentId,statement:hypothesis(candidate,kind),
      rationale:'Unverified review lead from '+candidate.id+'; supporting abstract identifiers: '
        +candidate.evidence.map(e=>e.id).join(', ')+'. Branch: '+kind
        +'. No novelty, hypothesis correctness, or experimental outcome is established.'});
    hypothesisIds.set(node.id,hId);
    reviewQueue.push({rank:null,node_id:node.id,hypothesis_id:hId,parent_hypothesis_id:parentId,
      candidate_id:candidate.id,branch_kind:kind,question:candidate.research_question,
      hypothesis:hypothesis(candidate,kind),
      proposed_method:candidate.proposed_method,
      priority:node.score,priority_kind:'heuristic_evidence_coverage_not_scientific_merit',
      routing_basis:basis,review_status:'requires_human_approval',
      evidence_refs:candidate.evidence.map(e=>({article_id:e.id,content_sha256:e.content_sha256,
        analyzed_content_sha256:e.analyzed_content_sha256,url:e.url})),
      gap_review_tasks:(candidate.gap_review_plan??[]).map(g=>({
        gap_id:g.gap_id,status:g.status,finding_ref:g.finding_ref})),
      experiment_protocol:candidateProtocol(candidate),
      portfolio_assessment:portfolioAssessment(),
      execution_ready:false,verified:false});
  }
  reviewQueue.sort((a,b)=>b.priority-a.priority||sorted(a.node_id,b.node_id));
  reviewQueue.forEach((row,i)=>{row.rank=i+1;});
  return {schema_version:'research-tree-review-1',status:reviewQueue.length?'review_required':'insufficient_evidence',
    source_report_id:report.id,search,review_queue:reviewQueue,research,
    budget:{max_nodes:maxNodes,evaluated_nodes:search.evaluatedNodes,max_depth:2,
      max_candidates:maxCandidates,model_calls:0,tool_calls:0},
    execution_enabled:false,automatic_approval:false,verification_performed:false,
    limitations:['Abstract interpretations and citations are unverified leads, not established gaps.',
      'Priority is a deterministic coverage heuristic, not scientific merit, novelty or probability of success.',
      'Branch variants are pre-defined falsification/replication drafts, not model-invented discoveries.',
      'Research Loop records hypotheses only; no attempts or scientific results are recorded.',
      'A reviewer must validate claims, protocols, budget and independent verification before execution.']};
}
const escapeMd=v=>String(v).replace(/[\r\n|]/g,' ').replace(/[<>]/g,'').slice(0,600);
export function renderTreeReview(result) {
  const lines=['# Research Tree Search — review queue','',
    'Source evidence report: '+escapeMd(result.source_report_id),
    'Status: '+result.status+'. Evaluated nodes: '+result.budget.evaluated_nodes
      +'/'+result.budget.max_nodes+'. Inference calls: 0.','',
    'Priority is evidence-coverage routing only; no scientific ranking or verification.','',
    '| Rank | Candidate | Branch | Priority (heuristic) | Evidence articles |',
    '| ---: | --- | --- | ---: | ---: |'];
  for(const row of result.review_queue) lines.push('| '+row.rank+' | '+escapeMd(row.candidate_id)
    +' | '+escapeMd(row.branch_kind)+' | '+row.priority+' | '+row.routing_basis.cited_abstracts+' |');
  lines.push('','No experiments executed; every entry requires human approval.');
  return lines.join('\n')+'\n';
}
export async function main(env=process.env,{readReport,write=writeFile,mkdirImpl=mkdir}={}) {
  const local=env.RESEARCH_TREE_INPUT_FILE;
  const id=env.RESEARCH_TREE_REPORT_ID;
  if((local && id)||(!local&&!id)) throw Error('invalid_tree_input_selection');
  let evidence;
  if(local) {
    // Local, operator-controlled file only; report content is still validated.
    evidence=JSON.parse(await readFile(local,'utf8'));
  } else {
    assert(UUID.test(id), 'invalid_tree_report_id');
    const load=readReport??createFollowUpClient({
      url:env.SUPABASE_URL,secretKey:env.SUPABASE_SECRET_KEY}).readReport;
    evidence=await load(id);
  }
  const output='reports/research-tree-review';
  const result=await planResearchTree(evidence);
  await mkdirImpl(output,{recursive:true});
  await write(output+'/report.json',JSON.stringify(result,null,2)+'\n');
  const summary=renderTreeReview(result);
  await write(output+'/summary.md',summary);
  if(env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,summary);
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().then(r=>console.log('Research tree review: '+r.status+', nodes='+r.search.evaluatedNodes))
    .catch(e=>{console.error('Research tree review failed: '+(
      ['invalid_tree_limits','invalid_tree_evidence_report','invalid_tree_candidate',
        'invalid_tree_paper','invalid_tree_citation','invalid_tree_gap','invalid_tree_protocol',
        'invalid_tree_input_selection','invalid_tree_report_id','parent_report_not_found',
        'invalid_follow_up_environment'].includes(e?.message)?e.message:'tree_review_failed'));
      process.exitCode=1;});
}
