import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeQuery } from '../src/query.ts';
import { loadConfig } from '../src/config.ts';
import { validateRatfitInput } from '../src/tools/bootloops.ts';

const config = loadConfig({ ORCHESTRATOR_API_KEY: 'test-key-at-least-24-characters' });
const input = { banked: [['0', '1/2'], ['1', '2/3'], ['2', '3/4'], ['3', '4/5']],
  holdout: [['4', '5/6'], ['5', '6/7']] };

test('BootLoops accepts only bounded exact data and disjoint holdouts', () => {
  assert.deepEqual(validateRatfitInput(input), input);
  for (const bad of [null, { ...input, command: 'id' }, { ...input, holdout: [] },
    { ...input, holdout: [['0/2', '1'], ['5', '1']] },
    { ...input, holdout: [['4', 0.5], ['5', '1']] },
    { ...input, holdout: [['4', '1/0'], ['5', '1']] },
    { ...input, holdout: [['4', '__import__("os")'], ['5', '1']] }])
    assert.throws(() => validateRatfitInput(bad), /invalid_bootloops_input/);
});

test('query tool routing refuses unavailable runtimes and never falls back to inference', async () => {
  const req = { tool: 'bootloops_ratfit', input };
  assert.deepEqual(await executeQuery(req, config), { status: 503, data: { error: 'bootloops_runtime_unavailable' } });
  assert.equal((await executeQuery({ ...req, message: 'Hej' }, config)).status, 400);
  assert.equal((await executeQuery({ ...req, tool: 'shell' }, config)).status, 400);
  const ok = await executeQuery(req, config, async () => ({ accepted: true, depth: 2, checked: 2, failed: 0 }));
  assert.equal(ok.status, 200);
  assert.equal(ok.data.mock, false);
  assert.equal(ok.data.verification.scope, 'exact_rational_holdout');
  const refused = await executeQuery(req, config, async () => ({ accepted: false, depth: 2, checked: 2, failed: 1 }));
  assert.equal(refused.status, 422);
  assert.equal(refused.data.verification.status, 'failed');
  const tampered = await executeQuery(req, config, async () => ({ accepted: true, depth: 2, checked: 2, failed: 1 }));
  assert.deepEqual(tampered, { status: 502, data: { error: 'bootloops_execution_failed' } });
  assert.equal((await executeQuery(req, config, async () => { throw new Error('private secret'); })).status, 502);
});
