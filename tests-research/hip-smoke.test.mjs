import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { testHip, hipMarkdown, HIP_BASE_URL } from '../research/hip-smoke.mjs';
const key = 'hip-test-secret-only', model = 'GLM-5.2-AWQ-INT4';
const listed = () => Response.json({ data: [{ id: model }, { id: 'embedding-model' }] });

test('HIP discovery is one authenticated request to fixed origin, without inference', async () => {
  let calls = 0;
  const report = await testHip({ apiKey: key, fetchImpl: async (url, opts) => {
    calls++; assert.equal(url, HIP_BASE_URL + '/models');
    assert.equal(opts.headers.Authorization, `Bearer ${key}`); assert.equal(opts.redirect, 'error');
    assert.equal(opts.method, 'GET'); return listed();
  } });
  assert.equal(calls, 1); assert.equal(report.inference, null); assert.equal(report.scientificBenchmark, false);
  assert.deepEqual(report.modelIds, [model, 'embedding-model']);
  assert.ok(!JSON.stringify(report).includes(key)); assert.match(hipMarkdown(report), /Ingen inferens beställd/);
});

test('HIP inference makes one bounded synthetic call and records model, tokens and latency', async () => {
  let calls = 0;
  const report = await testHip({ apiKey: key, mode: 'smoke-test', model, fetchImpl: async (url, opts) => {
    if (++calls === 1) return listed();
    assert.equal(url, HIP_BASE_URL + '/chat/completions');
    const body = JSON.parse(opts.body); assert.equal(body.model, model); assert.equal(body.max_tokens, 1024);
    assert.equal(body.messages.length, 1); assert.match(body.messages[0].content, /exactly the word OK/);
    return Response.json({ model, choices: [{ finish_reason: 'stop', message: { content: 'OK' } }],
      usage: { prompt_tokens: 15, completion_tokens: 1, total_tokens: 16 } });
  } });
  assert.equal(calls, 2); assert.equal(report.inference.responseMatched, true);
  assert.equal(report.inference.usage.total_tokens, 16); assert.ok(report.inference.latencyMs >= 0);
});

test('HIP failures reject invalid inputs, unsafe lists, absent models, redirects and oversized bodies', async () => {
  const base = { apiKey: key, fetchImpl: async () => { throw new Error('not called'); } };
  for (const bad of [{ apiKey: '' }, { mode: 'unknown' }, { mode: 'smoke-test', model: '' },
    { mode: 'smoke-test', model: 'a\n::warning::unsafe' }])
    await assert.rejects(testHip({ ...base, ...bad }), /missing_or_invalid|invalid_mode|invalid_model/);
  for (const data of [[], [{ id: '<script>' }], [{ id: 'secret-' + key }], [null]])
    await assert.rejects(testHip({ apiKey: key, fetchImpl: async () => Response.json({ data }) }), /invalid_model_list/);
  let requests = 0;
  await assert.rejects(testHip({ apiKey: key, mode: 'smoke-test', model: 'missing', fetchImpl: async () => { requests++; return listed(); } }), /model_not_accessible/);
  assert.equal(requests, 1);
  for (const response of [new Response('secret ' + key, { status: 401 }), new Response('', { status: 302, headers: { Location: 'https://example.com' } })])
    await assert.rejects(testHip({ apiKey: key, fetchImpl: async () => response }), e => e.code === 'hip_http_error' && !JSON.stringify(e).includes(key));
  await assert.rejects(testHip({ apiKey: key, fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)) }), /response_too_large/);
  await assert.rejects(testHip({ apiKey: key, fetchImpl: async () => { throw new Error(key); } }), e => e.code === 'hip_transport_error' && !e.message.includes(key));
  await assert.rejects(testHip({ apiKey: key, fetchImpl: async () => new Response('{') }), /invalid_json/);
});

test('HIP truncated reasoning and malformed replies do not masquerade as successful inference', async () => {
  for (const reply of [
    { model, choices: [{ finish_reason: 'length', message: { content: 'OK' } }] },
    { model, choices: [{ finish_reason: 'stop', message: { content: '' } }] },
    { model, choices: [{ finish_reason: 'stop', message: { content: 'OK' } }], usage: { total_tokens: -1 } },
    { model: key, choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] },
  ]) {
    let calls = 0;
    await assert.rejects(testHip({ apiKey: key, mode: 'smoke-test', model,
      fetchImpl: async () => ++calls === 1 ? listed() : Response.json(reply) }), /output_truncated|unexpected_completion|invalid_usage|invalid_response_model/);
    assert.equal(calls, 2, 'no retries or implicit model changes');
  }
});

test('HIP CLI persists bounded diagnostics when the Actions secret is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hip-cli-'));
  try {
    const run = promisify(execFile), env = { ...process.env }; delete env.HIP_API_KEY;
    await assert.rejects(run(process.execPath, [fileURLToPath(new URL('../research/hip-smoke.mjs', import.meta.url))], { cwd: dir, env }));
    const report = JSON.parse(await readFile(join(dir, 'reports/hip-test/report.json'), 'utf8'));
    assert.equal(report.status, 'error'); assert.equal(report.failure.code, 'missing_or_invalid_hip_api_key');
    const workflow = await readFile(new URL('../.github/workflows/hip-smoke.yml', import.meta.url), 'utf8');
    assert.match(workflow, /HIP_API_KEY: \$\{\{ secrets.HIP_API_KEY \}\}/);
    assert.doesNotMatch(workflow, /pull_request_target|schedule:|workflow_run:/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
