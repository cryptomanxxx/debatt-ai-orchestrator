import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceExecutor } from '../src/tools/bootloops-service.ts';
import { validateRatfitInput } from '../src/tools/bootloops.ts';
const input = validateRatfitInput({ banked: [['0','1/2'],['1','2/3'],['2','3/4'],['3','4/5']],
  holdout: [['4','5/6'],['5','6/7']] });

test('service adapter carries only data and rejects bad or oversized responses', async () => {
  const report = { accepted: true, depth: 3, checked: 2, failed: 0 };
  const run = serviceExecutor({ fetch: async request => {
    assert.equal(request.url, 'https://bootloops.internal/v1/ratfit');
    assert.equal(request.headers.has('Authorization'), false);
    assert.deepEqual(await request.json(), input);
    return Response.json(report);
  } });
  assert.deepEqual(await run(input), report);
  for (const response of [new Response('secret', { status: 500 }),
    new Response('not JSON'), Response.json({ ...report, accepted: false }),
    new Response('x'.repeat(16385))])
    await assert.rejects(serviceExecutor({ fetch: async () => response })(input));
});
