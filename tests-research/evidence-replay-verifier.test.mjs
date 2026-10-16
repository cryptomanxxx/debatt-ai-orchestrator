import test from 'node:test';
import assert from 'node:assert/strict';
import { replayEvidence } from '../research/evidence-replay-verifier.mjs';
import { evidencePrompt,hashText } from '../research/literature-evidence.mjs';

const VERSION='12345678-1234-4234-8234-123456789012';
const ARTICLE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SOURCE='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const abstract='This scientific abstract presents a reproducible methodology and a controlled study of evidence. It contains a clear quotation with sufficient context and precise measurements.';
const paper={article_id:ARTICLE,title:'Reproducible methodology',status:'summarized',source_hits:[{source_record_id:SOURCE}],archive:{version_id:VERSION,source_record_id:SOURCE},
  findings:[{quote:'reproducible methodology and a controlled study'}],
  content:{provider:'openalex',url:'https://openalex.org/W123',sha256:hashText(abstract),
    analyzed_sha256:hashText(evidencePrompt({title:'Reproducible methodology'},abstract).source_text),
    truncated:false}};
const version={abstract,archive:{version_id:VERSION,source_record_id:SOURCE},
  content:{provider:'openalex',url:'https://openalex.org/W123',sha256:hashText(abstract)}};
test('verifies an exact archived version without persisting full text',async()=>{
  const rows=await replayEvidence({papers:[paper]},{readVersion:async id=>{
    assert.equal(id,VERSION);return version;}});
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
