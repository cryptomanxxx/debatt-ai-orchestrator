import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisKey,createAnalysisRegistryClient } from '../research/literature-analysis-registry.mjs';
import { buildEvidenceReport,evidencePrompt,hashText,inspectFindings } from '../research/literature-evidence.mjs';
import { createEvidenceSummarizer,readEvidenceModelProfile } from '../research/run-literature-evidence.mjs';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const text='We compare estimators against a conventional filter. Validation on real flows remains future work. 😀';
const findings=[{kind:'limitation',claim:'Real flow validation remains to be done.',quote:'Validation on real flows remains future work.',
  limitation_status:'remaining',context_quote:'Validation on real flows remains future work.'}];
const checked=inspectFindings(JSON.stringify({findings}),text);
const profile={provider:'openai',model:'m',fingerprint:'a'.repeat(64),mode:'default',completionTokenLimit:4096};
const loaded={status:'available',abstract:text,content:{provider:'openalex',url:'https://openalex.org/W123',sha256:hashText(text),fetched_at:'2026-10-12T18:00:00Z'},
  archive:{version_id:uid(3),source_record_id:uid(4),cache_hit:true,stored_bytes:0}};
const paper={article_id:uid(1),title:'Physics-informed estimator',source_hits:[],lookup_identifiers:{}};
const input={literature_run_id:uid(2),query_index:0,query:'fluid estimation',papers:[paper],source_statuses:[],total_articles:1,selection:'fixture'};
const context=()=>({loaded,prompt:evidencePrompt(paper,text),profile});
const json=x=>Response.json(x);
function storeFixture() {
  const rows=new Map(),calls=[];
  const client=createAnalysisRegistryClient({url:'https://example.supabase.co',secretKey:'secret',fetchImpl:async(url,opts)=>{
    calls.push({url:String(url),opts});
    if (opts.method==='POST') {
      const p=JSON.parse(opts.body).p_payload;
      const k=[p.abstract_version_id,p.prompt_hash,p.contract_version,p.profile_hash].join(':');
      if (!rows.has(k)) rows.set(k,{...p,id:uid(rows.size+100),created_at:'2026-10-12T18:00:00Z'});
      return json(rows.get(k));
    }
    const params=new URL(url).searchParams;
    if (params.get('limit')==='0') return json([]);
    return json([...rows.values()].filter(row=>['abstract_version_id','prompt_hash','contract_version','profile_hash']
      .every(key=>params.get(key)==='eq.'+row[key])));
  }});
  return {client,rows,calls};
}
test('two reports share an immutable analysis; second run makes zero model calls',async()=>{
  const {client,rows,calls}=storeFixture();let modelCalls=0;
  const options={loadAbstract:async()=>loaded,analysisStore:client,modelProfile:profile,summarize:async()=>{
    modelCalls++;return {text:JSON.stringify({findings}),provider:profile.provider,model:profile.model};
  }};
  const first=await buildEvidenceReport(input,{...options,id:uid(5)});
  const second=await buildEvidenceReport({...input,literature_run_id:uid(6)},{...options,id:uid(7)});
  assert.equal(modelCalls,1);assert.equal(first.budget.model_calls,1);assert.equal(second.budget.model_calls,0);
  assert.equal(second.analysis_stats.reused,1);assert.equal(rows.size,1);
  assert.deepEqual(first.papers[0].findings,second.papers[0].findings);
  assert.equal(second.planner.proposals[0].evidence[0].analysis_id,first.papers[0].analysis.id);
  for (const call of calls) {
    assert.equal(call.opts.headers.apikey,'secret');assert.equal(call.opts.headers.Authorization,undefined);
    assert.equal(call.opts.redirect,'error');assert.ok(!call.url.includes('secret'));
  }
  assert.ok(!JSON.stringify(second).includes(text));
});
test('title, prompt instructions, model profile and archived version changes are cache misses',async()=>{
  const {client}=storeFixture(),original=context();await client.save(original,checked);
  const variants=[
    {...original,prompt:evidencePrompt({...paper,title:'Changed title'},text)},
    {...original,prompt:{...original.prompt,instruction:original.prompt.instruction+' Changed contract.'}},
    {...original,profile:{...profile,model:'different',fingerprint:'b'.repeat(64)}},
    {...original,loaded:{...loaded,archive:{...loaded.archive,version_id:uid(8)}}},
  ];
  for (const variant of variants) assert.equal(await client.read(variant),null);
  assert.equal(analysisKey(original).analyzed_characters,Array.from(text).length);
  assert.ok(analysisKey(original).analyzed_characters<text.length);
  assert.throws(()=>analysisKey({...original,loaded:{...loaded,abstract:text+' Changed'}}),/invalid_analysis_context/);
});
test('cached quotes and model metadata are revalidated before reuse',async()=>{
  for (const corrupt of [row=>row.findings[0].quote='A fabricated quotation absent from source.',
    row=>row.model_name='different',row=>row.content_hash='c'.repeat(64),row=>row.findings[0].verification='verified']) {
    const {client,rows}=storeFixture();await client.save(context(),checked);corrupt([...rows.values()][0]);
    await assert.rejects(client.read(context()),/invalid_analysis_registry_response/);
  }
});
test('registry failures are isolated and partial/invalid interpretations are never cached',async()=>{
  let saved=0,calls=0;
  const r=await buildEvidenceReport(input,{id:uid(5),loadAbstract:async()=>loaded,modelProfile:profile,
    analysisStore:{read:async()=>null,save:async()=>{saved++;}},summarize:async()=>{
      calls++;return {provider:profile.provider,model:profile.model,text:JSON.stringify({findings:[...findings,{...findings[0],quote:'This nonexistent statement is invented.'}]})};
    }});
  assert.equal(calls,1);assert.equal(saved,0);assert.equal(r.status,'partial');assert.equal(r.papers[0].findings.length,1);
  const failed=await buildEvidenceReport(input,{id:uid(6),loadAbstract:async()=>loaded,modelProfile:profile,
    analysisStore:{read:async()=>{throw new Error('analysis_registry_http_503');}},summarize:async()=>{calls++;}});
  assert.equal(calls,1);assert.equal(failed.papers[0].reason,'analysis_registry_http_503');
  assert.equal(failed.planner.proposals.length,0);
});
test('well-formed empty findings are cached without claiming usable evidence',async()=>{
  const {client}=storeFixture();let calls=0;
  const opts={loadAbstract:async()=>loaded,analysisStore:client,modelProfile:profile,summarize:async()=>{
    calls++;return {provider:profile.provider,model:profile.model,text:'{"findings":[]}'};
  }};
  const first=await buildEvidenceReport(input,{...opts,id:uid(5)});
  const second=await buildEvidenceReport(input,{...opts,id:uid(6)});
  assert.equal(calls,1);assert.equal(first.status,'insufficient_evidence');assert.equal(second.status,'insufficient_evidence');
  assert.equal(second.budget.model_calls,0);assert.deepEqual(second.planner.proposals,[]);
});
test('profile preflight rejects missing deployment/mock responses and inference is fingerprint guarded',async()=>{
  let request;
  assert.deepEqual(await readEvidenceModelProfile({key:'x'.repeat(24),fetchImpl:async(url,opts)=>{
    assert.match(url,/model-profile$/);assert.equal(opts.headers.Authorization,'Bearer '+'x'.repeat(24));return json(profile);
  }}),profile);
  await assert.rejects(readEvidenceModelProfile({key:'x'.repeat(24),fetchImpl:async()=>new Response('',{status:404})}),/model_profile_unavailable/);
  await assert.rejects(readEvidenceModelProfile({key:'x'.repeat(24),fetchImpl:async()=>json({...profile,provider:'mock'})}),/invalid_model_profile/);
  const summarize=createEvidenceSummarizer({key:'x'.repeat(24),profile,fetchImpl:async(url,opts)=>{
    request=JSON.parse(opts.body);return json({answer:'{"findings":[]}',mock:false,provider:'openai',model:'m',
      modelFingerprint:profile.fingerprint,inference:{completionTokenLimit:4096}});
  }});
  await summarize(context().prompt);assert.equal(request.expectedModelFingerprint,profile.fingerprint);
  await assert.rejects(createEvidenceSummarizer({key:'x'.repeat(24),profile,fetchImpl:async()=>json({
    answer:'{"findings":[]}',mock:false,provider:'openai',model:'m',modelFingerprint:'b'.repeat(64),inference:{completionTokenLimit:4096},
  })})(context().prompt),/model_profile_changed/);
});
test('protocols and portfolio assessments expose blockers and gap search has not run',async()=>{
  const report=await buildEvidenceReport(input,{id:uid(5),loadAbstract:async()=>loaded,summarize:async()=>({
    provider:'openai',model:'m',text:JSON.stringify({findings}),
  })});
  const p=report.planner.proposals[0];
  assert.equal(p.experiment_protocol.execution_ready,false);assert.equal(p.experiment_protocol.preregistered,false);
  assert.ok(p.experiment_protocol.baselines.includes('Conventional filter'));
  for (const field of ['dataset','sample_size','seeds','primary_outcome','decision_rule']) assert.equal(p.experiment_protocol[field],null);
  assert.deepEqual(p.experiment_protocol.evidence_article_ids,[paper.article_id]);
  assert.equal(p.gap_review_plan[0].status,'not_searched');assert.equal(p.gap_review_plan[0].assessment,null);
  assert.equal(p.gap_review_plan[0].finding_ref.finding_index,0);
  for (const assessment of Object.values(p.portfolio_assessment)) {
    assert.equal(assessment.status,'unknown');assert.equal(assessment.value,null);assert.ok(assessment.required_evidence);
  }
  assert.match(p.portfolio_assessment.opportunity_cost.required_evidence,/competing experiments/);
});
