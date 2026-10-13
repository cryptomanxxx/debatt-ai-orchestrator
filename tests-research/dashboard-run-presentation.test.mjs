import test from 'node:test';
import assert from 'node:assert/strict';
import {githubRunUrl,runMessage} from '../src/research-dashboard/page.ts';
const row={github_run_id:'38320243526',github_run_attempt:1,dispatch_status:'accepted',report:null};
test('run link uses the exact run identity, remains available without GitHub lookup and refuses malformed IDs',()=>{
  assert.equal(githubRunUrl(row,null),'https://github.com/cryptomanxxx/debatt-ai-orchestrator/actions/runs/38320243526');
  assert.equal(githubRunUrl(row,{run_id:'38320243527'}),'https://github.com/cryptomanxxx/debatt-ai-orchestrator/actions/runs/38320243527');
  for(const id of [null,'../other','123?token=secret','0','-1','https://attacker.example'])assert.equal(githubRunUrl({github_run_id:id},null),null);
});
test('queued start progresses to final technical outcome while preserving separate evidence status',()=>{
  assert.match(runMessage(row,null),/beställd/);
  assert.match(runMessage(row,{status:'in_progress',run_attempt:1}),/pågår/);
  const final={...row,report:{finished_at:'2026-10-13T08:44:00Z',status:'partial'}};
  const technical={status:'completed',conclusion:'success',run_attempt:1};
  assert.equal(runMessage(final,technical),'Körningen är slutförd. Evidensstatus: Delvis underlag.');
  assert.doesNotMatch(runMessage(final,technical),/beställd/);
  for(const [conclusion,word] of [['failure','misslyckad'],['cancelled','avbruten'],['timed_out','tidsgränsen']])
    assert.ok(runMessage(final,{...technical,conclusion}).includes(word));
});
test('missing final checkpoints, newer attempts and unavailable execution status never imply verified completion',()=>{
  const final={...row,report:{finished_at:'now',status:'completed'}};
  const technical={status:'completed',conclusion:'success',run_attempt:1};
  assert.match(runMessage(row,technical),/slutligt forskningsresultat.*saknas/);
  assert.match(runMessage(final,{...technical,run_attempt:2}),/slutligt forskningsresultat.*saknas/);
  assert.match(runMessage(final,{status:'in_progress',run_attempt:2}),/tidigare version/);
  assert.match(runMessage(final,null),/GitHubs aktuella körstatus kunde inte kontrolleras/);
  assert.match(runMessage({...row,dispatch_status:'uncertain'},null),/okänt/);
  assert.match(runMessage({...row,dispatch_status:'failed'},null),/accepterade inte/);
});
