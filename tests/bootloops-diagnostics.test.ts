import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseBootLoops, DIAGNOSTIC_STAGES } from '../src/tools/bootloops-diagnostics.ts';

test('diagnostics sends the same fixed fixture for every stage without credentials', async () => {
  const bodies: string[] = [];
  for (const stage of DIAGNOSTIC_STAGES) {
    const result = await diagnoseBootLoops({ stage }, { fetch: async request => {
      assert.equal(request.url, 'https://bootloops.internal/v1/diagnostics/bootloops/' + stage);
      assert.equal(request.headers.get('Content-Type'), 'application/json');
      assert.equal(request.headers.has('Authorization'), false);
      bodies.push(await request.text());
      return Response.json({ diagnostic: true, stage, fixture: 'rational-v1' });
    } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { diagnostic: true, stage, fixture: 'rational-v1' });
  }
  assert.equal(new Set(bodies).size, 1);
  const fixture = JSON.parse(bodies[0]);
  assert.deepEqual(fixture.holdout, [['4','5/6'],['5','6/7']]);
  assert.equal(fixture.banked.length, 6);
});

test('diagnostics rejects custom data and invalid stages before using the service', async () => {
  let calls = 0;
  const service = { fetch: async () => { calls++; return Response.json({}); } };
  for (const input of [null, [], {}, 'fit', { stage: null }, { stage: '../ratfit' },
    { stage: 'full', input: {} }, { stage: 'full', repeat: 1000 }]) {
    assert.equal((await diagnoseBootLoops(input, service)).status, 400);
  }
  assert.equal(calls, 0);
  assert.equal((await diagnoseBootLoops({ stage: 'full' })).status, 503);
});

test('diagnostics refuses failed, unexpected or oversized service responses', async () => {
  for (const response of [new Response('private detail', { status: 500 }),
    new Response('{'), new Response('x'.repeat(16385)),
    Response.json({ diagnostic: true, stage: 'fit', fixture: 'rational-v1' }),
    Response.json({ diagnostic: true, stage: 'full', fixture: 'rational-v1', accepted: true }),
    Response.json({ diagnostic: false, stage: 'full', fixture: 'rational-v1' })]) {
    assert.deepEqual(await diagnoseBootLoops({ stage: 'full' }, { fetch: async () => response }),
      { status: 502, data: { error: 'bootloops_diagnostic_failed' } });
  }
});
