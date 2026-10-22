import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabClient, MAX_MODEL_RETRIES } from '../research/lab-client.mjs';

const ok = () => Response.json({ mock: false, provider: 'hip', model: 'm', inference: { completionTokenLimit: 4096 }, answer: '{}' });
const rateLimited = () => Response.json({ error: 'model_upstream_http_error', upstreamStatus: 429 }, { status: 502 });
const gatewayOk = () => Response.json({ status: 'completed_unverified', provider: 'hip', model: 'm', answer: '{}', finish_reason: 'stop' });
// Replaces fetch with a script of responses; returns the request count.
function script(responses) {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return responses.shift()(); };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('a rate-limited model call is repeated once after a pause and does not use another budget call', async () => {
  const { calls, restore } = script([ok, rateLimited, ok, ok]);
  const pauses = [];
  try {
    const lab = createLabClient({ key: 'k', spacingMs: 10, retryDelayMs: 45, maxModelCalls: 3, sleep: async ms => { pauses.push(ms); } });
    const propose = lab.proposer('default');
    for (let i = 0; i < 3; i++) assert.equal((await propose([])).model, 'm');
    assert.equal(calls.length, 4);
    assert.equal(lab.modelCalls(), 3, 'the repeat is the same request, not another answer');
    assert.equal(lab.modelRetries(), 1);
    assert.deepEqual(pauses, [10, 45, 10], 'spacing before the second and third call; one pause before the repeat');
    await assert.rejects(propose([]), /model_budget_exceeded/);
  } finally { restore(); }
});

test('a second failure stops the run with the original code; other errors are never repeated', async () => {
  let s = script([rateLimited, rateLimited]);
  try {
    const lab = createLabClient({ key: 'k' });
    await assert.rejects(lab.proposer('default')([]), /model_upstream_http_error/);
    assert.equal(s.calls.length, 2);
    assert.equal(lab.modelRetries(), 1);
  } finally { s.restore(); }
  s = script([() => Response.json({ error: 'model_output_truncated' }, { status: 502 })]);
  try {
    const lab = createLabClient({ key: 'k' });
    await assert.rejects(lab.proposer('default')([]), /model_output_truncated/);
    assert.equal(s.calls.length, 1);
    assert.equal(lab.modelRetries(), 0);
  } finally { s.restore(); }
  s = script([() => Response.json({ mock: true, answer: '{}' })]);
  try {
    await assert.rejects(createLabClient({ key: 'k' }).proposer('default')([]), /invalid_model_response/);
    assert.equal(s.calls.length, 1);
  } finally { s.restore(); }
});

test('repeats are capped per run, apply to ranked research models and can be switched off', async () => {
  const failing = Array(2 * (MAX_MODEL_RETRIES + 1)).fill(() => Response.json({ error: 'benchmark_upstream_rate_limited' }, { status: 429 }));
  let s = script([...failing]);
  try {
    const lab = createLabClient({ key: 'k', maxModelCalls: 7 });
    const propose = lab.researchProposer({ provider: 'hip', model: 'm' });
    for (let i = 0; i < MAX_MODEL_RETRIES; i++) await assert.rejects(propose([]), /model_upstream_http_error/);
    assert.equal(lab.modelRetries(), MAX_MODEL_RETRIES);
    const before = s.calls.length;
    await assert.rejects(propose([]), /model_upstream_http_error/);
    assert.equal(s.calls.length - before, 1, 'no repeat once the cap is reached');
  } finally { s.restore(); }
  s = script([() => { throw new TypeError('reset'); }, gatewayOk]);
  try {
    const lab = createLabClient({ key: 'k' });
    assert.equal((await lab.researchProposer({ provider: 'hip', model: 'm' })([])).model, 'm', 'a dropped connection is repeated');
    assert.equal(lab.modelRetries(), 1);
  } finally { s.restore(); }
  s = script([rateLimited]);
  try {
    const lab = createLabClient({ key: 'k', maxRetries: 0 });
    await assert.rejects(lab.proposer('default')([]), /model_upstream_http_error/);
    assert.equal(s.calls.length, 1);
  } finally { s.restore(); }
});

test('a rejected key, an exhausted quota or a gateway rejection stops at once without a repeat', async () => {
  for (const [error, status] of [['benchmark_upstream_auth_rejected', 502], ['benchmark_upstream_quota_exhausted', 502],
    ['benchmark_model_not_listed', 400], [undefined, 500]]) {
    const s = script([() => Response.json({ error }, { status })]), pauses = [];
    try {
      const lab = createLabClient({ key: 'k', retryDelayMs: 45, sleep: async ms => { pauses.push(ms); } });
      await assert.rejects(lab.researchProposer({ provider: 'hip', model: 'm' })([]), /model_upstream_http_error/);
      assert.equal(s.calls.length, 1, String(error)); assert.deepEqual(pauses, []); assert.equal(lab.modelRetries(), 0);
    } finally { s.restore(); }
  }
  for (const upstreamStatus of [401, 402, 403]) {
    const s = script([() => Response.json({ error: 'model_upstream_http_error', upstreamStatus }, { status: 502 })]);
    try {
      const lab = createLabClient({ key: 'k' });
      await assert.rejects(lab.proposer('default')([]), /model_upstream_http_error/);
      assert.equal(s.calls.length, 1, String(upstreamStatus));
    } finally { s.restore(); }
  }
  const s = script([() => Response.json({ error: 'benchmark_upstream_failed' }, { status: 502 }), gatewayOk]);
  try {
    const lab = createLabClient({ key: 'k' });
    assert.equal((await lab.researchProposer({ provider: 'hip', model: 'm' })([])).model, 'm', 'a failed upstream request is repeated');
  } finally { s.restore(); }
});
