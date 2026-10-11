import test from 'node:test';
import assert from 'node:assert/strict';
import { selectQueryEvidence,createLiteratureEvidenceClient,decodeAbstract,fetchOpenAlexAbstract,
  validateFindings,buildEvidenceReport,renderEvidenceReport,hashText,evidencePrompt,EVIDENCE_MESSAGE_LIMIT } from '../research/literature-evidence.mjs';
import { createEvidenceSummarizer,main } from '../research/run-literature-evidence.mjs';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { literaturePayload } from '../research/literature-database.mjs';

const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const abstract='We compare a physics-informed estimator with a conventional filter. Performance improves on synthetic flows. Validation on real flows remains future work.';
const index=text=>{const out={};text.split(' ').forEach((word,i)=>(out[word]??=[]).push(i));return out;};
const findings=[{kind:'method',claim:'The authors compare estimators.',quote:'We compare a physics-informed estimator with a conventional filter.'},
  {kind:'limitation',claim:'Real-flow validation is not included.',quote:'Validation on real flows remains future work.'}];
const summary={text:JSON.stringify({findings}),provider:'test-model',model:'test'};
function search(source='openalex',article=1,rank=1) {
  // Use the production importer, rather than inventing a persisted metadata shape.
  const sourceId=source==='openalex'?'https://openalex.org/W123':'other-id';
  const payload=literaturePayload({sourceNames:[source],results:[{query:'fluid estimation',sources:{[source]:{
    status:'ok',records:1,papers:[{title:'Physics-informed flow estimation',source,sourceId,doi:'10.1234/example'}]
  }}}]},{runKey:'evidence-fixture'});
  return {id:uid(SOURCES.indexOf(source)+10),query:'fluid estimation',source,status:'ok',http_status:null,fetched_at:null,
    literature_hit:[{rank,source_record_id:uid(SOURCES.indexOf(source)+20),metadata:payload.searches[0].papers[0],
      literature_source_record:{id:uid(SOURCES.indexOf(source)+20),source,source_id:sourceId,article_id:uid(article),
        canonical:{id:uid(article),doi:'10.1234/example',arxiv_id:null,openalex_records:[]}}}]};
}
const SOURCES=['openalex','semantic-scholar','core','arxiv'];
const input=()=>selectQueryEvidence({id:uid(100)},[search(),search('core')]);
const loadAbstract=async()=>({status:'available',abstract,content:{provider:'openalex',url:'https://openalex.org/W123',scope:'abstract_only',sha256:hashText(abstract),fetched_at:'2026-10-11T16:00:00Z'}});

test('production metadata without source is accepted and relational provenance mismatches are rejected',()=>{
  const stored=search();assert.equal(Object.hasOwn(stored.literature_hit[0].metadata,'source'),false);
  assert.equal(selectQueryEvidence({id:uid(100)},[stored]).papers[0].source_hits[0].source,'openalex');
  for (const replacement of [{source:'core'},{source_id:'different-provider-id'},{id:uid(99)}]) {
    const invalid=search();Object.assign(invalid.literature_hit[0].literature_source_record,replacement);
    assert.throws(()=>selectQueryEvidence({id:uid(100)},[invalid]),/invalid_literature_hit_response/);
  }
});

test('database query preserves hit provenance, deduplicates canonical identities and bounds selection',()=>{
  const a=search('arxiv',2),b=search('openalex',1),c=search('core',1);
  const x=selectQueryEvidence({id:uid(100)},[a,b,c],{maxPapers:1});
  assert.equal(x.total_articles,2);assert.equal(x.papers.length,1);assert.equal(x.papers[0].source_hits.length,2);
  assert.equal(x.source_statuses.find(s=>s.source==='semantic-scholar').status,'not_searched');
  assert.deepEqual(x,selectQueryEvidence({id:uid(100)},[c,b,a],{maxPapers:1}));
  assert.throws(()=>selectQueryEvidence({id:uid(100)},[b,b]),/invalid/);
  assert.throws(()=>selectQueryEvidence({id:uid(100)},[b],{maxPapers:11}),/invalid/);
});
test('failed searches remain failures without being conflated with successful zero results',()=>{
  const failed={...search('semantic-scholar'),status:'error',http_status:429,literature_hit:[]};
  const x=selectQueryEvidence({id:uid(100)},[search(),failed]);
  assert.equal(x.source_statuses[1].status,'error');assert.equal(x.source_statuses[1].http_status,429);
  assert.throws(()=>selectQueryEvidence({id:uid(100)},[{...failed,literature_hit:search().literature_hit}]),/invalid/);
});
test('read stored query uses backend header, explicit run, nested single statement and bounded requests',async()=>{
  const calls=[];
  const client=createLiteratureEvidenceClient({url:'https://example.supabase.co',secretKey:'secret',fetchImpl:async(url,opts)=>{
    calls.push({url:String(url),opts});return calls.length===1?json([{id:uid(100)}]):json([search()]);
  }});
  const x=await client.readQuery({runId:uid(100),queryIndex:2});
  assert.equal(x.query_index,2);assert.equal(calls.length,2);
  for (const call of calls) {assert.equal(call.opts.headers.apikey,'secret');assert.equal(call.opts.headers.Authorization,undefined);assert.equal(call.opts.redirect,'error');}
  const params=new URL(calls[1].url).searchParams;
  assert.equal(params.get('query_index'),'eq.2');assert.match(params.get('select'),/literature_hit.*article_id/);
  assert.match(params.get('select'),/canonical:literature_article.*openalex_records/);
  assert.equal(params.get('literature_hit.literature_source_record.canonical.openalex_records.source'),'eq.openalex');
  await assert.rejects(client.readQuery({runId:'not-a-uuid'}),/invalid/);assert.equal(calls.length,2);
});
test('historical DOI-less hit resolves through later canonical DOI or OpenAlex enrichment without rewriting provenance',async()=>{
  for (const withOpenAlex of [false,true]) {
    const old=search('arxiv');old.literature_hit[0].metadata.doi=null;
    const canonical=old.literature_hit[0].literature_source_record.canonical;
    if (withOpenAlex) {
      canonical.doi=null;
      canonical.openalex_records=[{id:uid(99),source:'openalex',source_id:'https://openalex.org/W987'}];
    }
    const paper=selectQueryEvidence({id:uid(100)},[old]).papers[0];let endpoint;
    const result=await fetchOpenAlexAbstract(paper,{fetchImpl:async url=>{
      endpoint=String(url);return json({id:'https://openalex.org/W987',doi:'10.1234/example',abstract_inverted_index:index(abstract)});
    }});
    assert.equal(result.status,'available');
    assert.match(endpoint,withOpenAlex?/works\/W987/:/doi.org\/10.1234%2Fexample/);
    assert.equal(paper.source_hits[0].doi,null);assert.equal(paper.source_hits[0].source,'arxiv');
    assert.equal(paper.source_hits[0].source_id,'other-id');
  }
  const wrong=search();wrong.literature_hit[0].literature_source_record.canonical.id=uid(99);
  assert.throws(()=>selectQueryEvidence({id:uid(100)},[wrong]),/canonical/);
});
test('OpenAlex reconstructs bounded abstracts, validates work identity and keeps credentials in headers',async()=>{
  let call;
  const result=await fetchOpenAlexAbstract(input().papers[0],{apiKey:'private-key',fetchImpl:async(url,opts)=>{
    call={url:String(url),opts};return json({id:'https://openalex.org/W123',doi:'https://doi.org/10.1234/example',abstract_inverted_index:index(abstract)});
  }});
  assert.equal(result.abstract,abstract);assert.equal(result.content.sha256,hashText(abstract));
  assert.equal(call.opts.headers.Authorization,'Bearer private-key');assert.ok(!call.url.includes('private-key'));
  await assert.rejects(fetchOpenAlexAbstract(input().papers[0],{fetchImpl:async()=>json({id:'https://openalex.org/W456'})}),/identity/);
  assert.throws(()=>decodeAbstract({same:[0],other:[0]}),/invalid/);
  assert.throws(()=>decodeAbstract({same:[0,2]}),/invalid/);
  assert.equal(decodeAbstract(null),null);
});
test('DOI lookup validates the returned DOI and records content URL separately from discovery source',async()=>{
  const p=selectQueryEvidence({id:uid(100)},[search('core')]).papers[0];
  let endpoint;
  const x=await fetchOpenAlexAbstract(p,{fetchImpl:async url=>{endpoint=String(url);return json({id:'https://openalex.org/W987',doi:'10.1234/example',abstract_inverted_index:index(abstract)});}});
  assert.match(endpoint,/works\/https:\/\/doi.org\/10.1234%2Fexample/);assert.equal(x.content.url,'https://openalex.org/W987');
  await assert.rejects(fetchOpenAlexAbstract(p,{fetchImpl:async()=>json({id:'https://openalex.org/W987',doi:'10.1234/different'})}),/identity/);
});
test('summary rejects fabricated quotation, unsupported output fields and excessive findings',()=>{
  assert.equal(validateFindings(summary.text,abstract).length,2);
  for (const text of [JSON.stringify({findings:[{...findings[0],quote:'This statement does not exist in the abstract.'}]}),
    JSON.stringify({findings,novelty:'proven'}),JSON.stringify({findings:[...findings,...findings]})]) {
    assert.throws(()=>validateFindings(text,abstract),/evidence/);
  }
});
test('complete serialized prompts fit the 8000-character contract including JSON escaping and Unicode',()=>{
  assert.equal(evidencePrompt({title:'Short title'},abstract).source_text,abstract);
  assert.equal(evidencePrompt({title:'Short title'},abstract).source_text_is_truncated,false);
  for (const text of ['a'.repeat(12000),'α"\\\n😀'.repeat(1500)]) {
    const prompt=evidencePrompt({title:'"\\'.repeat(500)},text);
    assert.ok(JSON.stringify(prompt).length<=EVIDENCE_MESSAGE_LIMIT);
    assert.equal(prompt.source_text_is_truncated,true);
    assert.ok(text.startsWith(prompt.source_text));
    assert.ok(!/[\uD800-\uDBFF]$/.test(prompt.source_text));
    assert.ok(prompt.source_text.length>20);
  }
});
test('truncated evidence reports preserve full and analyzed hashes and reject quotations from unseen text',async()=>{
  const tail='Only the final unseen part mentions this limitation.';
  const text=findings[0].quote+' '+('padding '.repeat(1300))+tail;
  const load=async()=>({status:'available',abstract:text,content:{provider:'openalex',url:'https://openalex.org/W123',sha256:hashText(text)}});
  let sent;
  const report=await buildEvidenceReport(input(),{id:uid(200),loadAbstract:load,summarize:async prompt=>{
    sent=prompt;return {...summary,text:JSON.stringify({findings:[findings[0]]})};
  }});
  assert.equal(report.status,'completed');assert.equal(report.papers[0].content.truncated,true);
  assert.equal(report.papers[0].content.sha256,hashText(text));
  assert.equal(report.papers[0].content.analyzed_sha256,hashText(sent.source_text));
  assert.equal(report.planner.proposals[0].evidence[0].evidence_scope,'abstract_prefix');
  assert.ok(!sent.source_text.includes(tail));assert.ok(!JSON.stringify(report).includes(sent.source_text));
  const rejected=await buildEvidenceReport(input(),{id:uid(201),loadAbstract:load,summarize:async()=>({...summary,
    text:JSON.stringify({findings:[{kind:'limitation',claim:'A limitation.',quote:tail}]})})});
  assert.equal(rejected.papers[0].reason,'unmatched_evidence_quote');
});
test('summarizer refuses oversized serialized input before HTTP and sends fitted long prompts unchanged',async()=>{
  let calls=0,sent;
  const summarize=createEvidenceSummarizer({key:'x'.repeat(24),fetchImpl:async(url,o)=>{
    calls++;sent=JSON.parse(o.body).message;
    return json({mock:false,answer:summary.text,provider:'groq',model:'m',inference:{completionTokenLimit:4096}});
  }});
  await assert.rejects(summarize({source_text:'x'.repeat(8000)}),/evidence_prompt_too_large/);assert.equal(calls,0);
  const prompt=evidencePrompt({title:'Title'},'x'.repeat(12000));
  await summarize(prompt);assert.equal(calls,1);assert.equal(sent,JSON.stringify(prompt));assert.ok(sent.length<=8000);
});
test('planner receives matched evidence, unknown scores and tentative gaps without saving raw abstract',async()=>{
  const report=await buildEvidenceReport(input(),{id:uid(200),loadAbstract,summarize:async()=>summary});
  assert.equal(report.status,'completed');assert.equal(report.budget.model_calls,1);
  const proposal=report.planner.proposals[0];assert.equal(proposal.id,'arp-fluid-state-estimation');
  assert.equal(proposal.scores.novelty,null);assert.equal(proposal.priority_score,null);
  assert.equal(proposal.gap_candidates[0].status,'candidate_needs_literature_review');
  assert.equal(proposal.evidence[0].source_hits.length,2);assert.equal(report.planner.execution_enabled,false);
  assert.ok(!JSON.stringify(report).includes(abstract));assert.match(renderEvidenceReport(report),/Human review required/);
});
test('missing abstracts and failed model responses are isolated with no invented evidence or leaked errors',async()=>{
  const x=selectQueryEvidence({id:uid(100)},[search(),search('arxiv',2)]);
  let modelCalls=0;
  const report=await buildEvidenceReport(x,{id:uid(200),loadAbstract:async p=>p.article_id===uid(1)?loadAbstract():({status:'unavailable',reason:'abstract_missing'}),
    summarize:async()=>{modelCalls++;throw new Error('secret payload private-key');}});
  assert.equal(report.status,'insufficient_evidence');assert.equal(modelCalls,1);assert.equal(report.planner.proposals.length,0);
  assert.equal(report.papers[0].reason,'evidence_processing_failed');assert.ok(!JSON.stringify(report).includes('private-key'));
});
test('a malformed summary cannot erase an independently successful paper',async()=>{
  const x=selectQueryEvidence({id:uid(100)},[search(),search('core',2)]);let calls=0;
  const r=await buildEvidenceReport(x,{id:uid(200),loadAbstract,summarize:async()=>++calls===1?summary:{...summary,text:'not json'}});
  assert.equal(r.status,'partial');assert.equal(r.coverage.summarized,1);assert.equal(r.planner.proposals[0].evidence_count,1);
});
test('orchestrator calls enforce real model responses and requested completion budget',async()=>{
  let opts;
  const summarize=createEvidenceSummarizer({key:'x'.repeat(24),fetchImpl:async(url,o)=>{opts=o;return json({mock:false,answer:summary.text,provider:'groq',model:'m',inference:{completionTokenLimit:4096}});}});
  assert.equal((await summarize({source_text:abstract})).provider,'groq');assert.equal(JSON.parse(opts.body).completionTokenLimit,4096);
  for (const payload of [{mock:true,answer:'x'},{mock:false,answer:'x',provider:'groq',model:'m',inference:{completionTokenLimit:1024}}]) {
    await assert.rejects(createEvidenceSummarizer({key:'x'.repeat(24),fetchImpl:async()=>json(payload)})({}),/invalid_model_response|model_budget_not_applied/);
  }
});
test('report persistence is one guarded backend insert and retains no update capability',async()=>{
  const report=await buildEvidenceReport(input(),{id:uid(200),loadAbstract,summarize:async()=>summary});let saved;
  const client=createLiteratureEvidenceClient({url:'https://example.supabase.co',secretKey:'secret',fetchImpl:async(url,o)=>{
    saved={url:String(url),options:o};return json([{id:report.id}]);
  }});
  await client.saveReport(report);assert.equal(saved.options.method,'POST');
  assert.equal(JSON.parse(saved.options.body).literature_run_id,uid(100));assert.match(saved.url,/literature_planner_run$/);
  assert.equal(saved.options.headers.Authorization,undefined);
});
test('manual runner completes the database-to-model-to-planner flow and preserves artifacts on failed storage',async()=>{
  const cwd=process.cwd(),fetchOriginal=globalThis.fetch,directory=await mkdtemp(join(tmpdir(),'literature-evidence-'));
  let failSave=false;
  globalThis.fetch=async(url,o)=>{
    const target=String(url);
    if (target.includes('/rest/v1/literature_run')) return json([{id:uid(100)}]);
    if (target.includes('/rest/v1/literature_search')) return json([search()]);
    if (target.includes('api.openalex.org')) return json({id:'https://openalex.org/W123',abstract_inverted_index:index(abstract)});
    if (target.includes('/v1/query')) return json({mock:false,answer:summary.text,provider:'groq',model:'m',inference:{completionTokenLimit:4096}});
    if (target.includes('/rest/v1/literature_planner_run')) {
      if (!o.method) return json([]);
      if (failSave) return new Response('database unavailable',{status:503});
      const payload=JSON.parse(o.body);return json([{id:payload.id}]);
    }
    throw new Error('Unexpected request');
  };
  try {
    process.chdir(directory);
    const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'secret',ORCHESTRATOR_API_KEY:'x'.repeat(24),LITERATURE_RUN_ID:uid(100)};
    await main(env);
    let report=JSON.parse(await readFile('reports/literature-evidence/report.json','utf8'));
    assert.equal(report.status,'completed');assert.equal(report.planner.proposals.length,1);
    failSave=true;await assert.rejects(main(env),/literature_http_503/);
    report=JSON.parse(await readFile('reports/literature-evidence/report.json','utf8'));
    assert.equal(report.coverage.summarized,1);
    assert.match(await readFile('reports/literature-evidence/report.md','utf8'),/Source excerpt/);
  } finally {globalThis.fetch=fetchOriginal;process.chdir(cwd);await rm(directory,{recursive:true,force:true});}
});
