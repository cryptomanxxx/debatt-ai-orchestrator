import test from 'node:test';
import assert from 'node:assert/strict';
import { replayEvidence } from '../research/evidence-replay-verifier.mjs';
import { evidencePrompt,hashText } from '../research/literature-evidence.mjs';

const VERSION='12345678-1234-4234-8234-123456789012';
const ARTICLE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SOURCE='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ANALYSIS='cccccccc-dddd-4eee-8fff-222222222222';
const abstract='This scientific abstract presents a reproducible methodology and a controlled study of evidence. It contains a clear quotation with sufficient context and precise measurements.';
const paper={article_id:ARTICLE,title:'Reproducible methodology',status:'summarized',analysis:{id:ANALYSIS},source_hits:[{source_record_id:SOURCE}],archive:{version_id:VERSION,source_record_id:SOURCE},
  findings:[{quote:'reproducible methodology and a controlled study'}],
  content:{provider:'openalex',url:'https://openalex.org/W123',sha256:hashText(abstract),
    analyzed_sha256:hashText(evidencePrompt({title:'Reproducible methodology'},abstract).source_text),
    truncated:false}};
const originalFindings=structuredClone(paper.findings);
const analysis=async id=>{assert.equal(id,ANALYSIS);return {id,findings:structuredClone(originalFindings)};};
const version={abstract,archive:{version_id:VERSION,source_record_id:SOURCE},
  content:{provider:'openalex',url:'https://openalex.org/W123',sha256:hashText(abstract)}};
test('verifies an exact archived version without persisting full text',async()=>{
  const rows=await replayEvidence({papers:[paper]},{readVersion:async id=>{
    assert.equal(id,VERSION);return version;},readAnalysis:analysis});
  assert.equal(rows[0].status,'verified');
  assert.ok(!JSON.stringify(rows).includes(abstract));
});
test('legacy reports without an archive version remain unverifiable',async()=>{
  const old=structuredClone(paper);delete old.archive;
  const rows=await replayEvidence({papers:[old]},{readVersion:async()=>{throw Error('unexpected read');}});
  assert.equal(rows[0].status,'unverifiable');
});
test('rejects mismatched source hashes and fabricated citations',async()=>{
  const altered=structuredClone(version);altered.abstract+=' Extra words.';
  assert.equal((await replayEvidence({papers:[paper]},{readVersion:async()=>altered}))[0].status,'rejected');
  const fabricated=structuredClone(paper);fabricated.findings=[{quote:'This quotation was never included in the paper.'}];
  assert.equal((await replayEvidence({papers:[fabricated]},{readVersion:async()=>version}))[0].status,'rejected');
});
test('missing immutable version is unverifiable, never substituted',async()=>{
  assert.equal((await replayEvidence({papers:[paper]},{readVersion:async()=>null}))[0].status,'unverifiable');
});

test('rejects a matching abstract borrowed from another source record',async()=>{
  const other=structuredClone(version);
  other.archive.source_record_id='cccccccc-dddd-4eee-8fff-111111111111';
  assert.equal((await replayEvidence({papers:[paper]},{readVersion:async()=>other}))[0].status,'rejected');
});
test('classifies archive integrity errors as rejected, but transport errors as unverifiable',async()=>{
  const corrupt=await replayEvidence({papers:[paper]},{readVersion:async()=>{throw Error('invalid_abstract_archive_response');}});
  assert.equal(corrupt[0].status,'rejected');
  const offline=await replayEvidence({papers:[paper]},{readVersion:async()=>{throw Error('abstract_archive_transport_error');}});
  assert.equal(offline[0].status,'unverifiable');
});

test('canonical OpenAlex enrichment can own an archived abstract',async()=>{
  const enriched=structuredClone(paper);
  const canonical='dddddddd-eeee-4fff-8aaa-222222222222';
  enriched.lookup_identifiers={openalex_records:[{source_record_id:canonical,source_id:enriched.content.url}]};
  enriched.archive.source_record_id=canonical;
  const loaded=structuredClone(version);loaded.archive.source_record_id=canonical;
  assert.equal((await replayEvidence({papers:[enriched]},{readVersion:async()=>loaded,readAnalysis:analysis}))[0].status,'verified');
  enriched.lookup_identifiers.openalex_records[0].source_id='https://openalex.org/W999';
  assert.equal((await replayEvidence({papers:[enriched]},{readVersion:async()=>loaded}))[0].status,'rejected');
});

test('rejects a different valid quotation even when the archived text still contains it',async()=>{
  const altered=structuredClone(paper);
  altered.findings[0].quote='It contains a clear quotation with sufficient context';
  const rows=await replayEvidence({papers:[altered]},{readVersion:async()=>version,readAnalysis:analysis});
  assert.equal(rows[0].status,'rejected');
  assert.equal(rows[0].reason,'analysis_findings_mismatch');
});
test('missing historical analysis is never silently certified',async()=>{
  const rows=await replayEvidence({papers:[paper]},{readVersion:async()=>version});
  assert.equal(rows[0].status,'unverifiable');
  assert.equal(rows[0].reason,'analysis_version_unavailable');
});
test('archive-matched findings reject corrupt immutable analysis records',async()=>{
  const rows=await replayEvidence({papers:[paper]},{readVersion:async()=>version,
    readAnalysis:async()=>{throw Error('invalid_analysis_registry_response');}});
  assert.equal(rows[0].status,'rejected');
  assert.equal(rows[0].reason,'analysis_integrity_failure');
});
