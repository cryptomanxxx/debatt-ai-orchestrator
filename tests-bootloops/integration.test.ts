import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.ts';
import { loadConfig } from '../src/config.ts';
import { executeBootLoopsPython } from '../src/tools/bootloops-node.ts';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const key = 'bootloops-test-key-at-least-24-characters';
const data = { banked: [['0', '1/2'], ['1', '2/3'], ['2', '3/4'], ['3', '4/5'], ['6', '7/8'], ['7', '8/9']],
  holdout: [['4', '5/6'], ['5', '6/7']] };

test('vendored upstream bytes match the pinned source fingerprint', async () => {
  const bytes = await readFile(new URL('../vendor/bootloops/thiele_gate.py', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '091596dcda3f873118a48340c4c6787b3acd8f316780cd0787644a05876a1913');
});

test('real BootLoops reconstructs a planted rational function and detects corrupted holdouts', async () => {
  const good = await executeBootLoopsPython(data);
  assert.deepEqual(good, { accepted: true, depth: 3, checked: 2, failed: 0 });
  const bad = await executeBootLoopsPython({ ...data, holdout: [['4', '0'], ['5', '6/7']] });
  assert.equal(bad.accepted, false);
  assert.equal(bad.failed, 1);
  const constant = await executeBootLoopsPython({ banked: data.banked.map(([x]) => [x, '7/3']),
    holdout: data.holdout.map(([x]) => [x, '7/3']) });
  assert.equal(constant.accepted, true);
  assert.equal(constant.depth, 1);
  // The Python boundary must reject code and overlap even without TS validation.
  await assert.rejects(executeBootLoopsPython({ ...data, holdout: [['0/2', '1'], ['5', '1']] }));
  await assert.rejects(executeBootLoopsPython({ ...data, holdout: [['4', 'print(1)'], ['5', '1']] }));
});

test('authenticated Node HTTP request executes real Python and reports rejection without a model call', async () => {
  const server = createApp(loadConfig({ ORCHESTRATOR_API_KEY: key }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/v1/query`;
  const request = (input: unknown, auth = key) => fetch(url, { method: 'POST',
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'bootloops_ratfit', input }) });
  try {
    assert.equal((await request(data, 'wrong')).status, 401);
    const response = await request(data);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.provider, 'bootloops');
    assert.equal(result.model, null);
    assert.equal(result.mock, false);
    assert.equal(result.verification.status, 'passed');
    assert.equal(result.toolResult.checked, 2);
    const bad = await request({ ...data, holdout: [['4', '9'], ['5', '6/7']] });
    assert.equal(bad.status, 422);
    assert.equal((await bad.json()).verification.status, 'failed');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
