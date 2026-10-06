import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);
const runner = fileURLToPath(new URL('../research/runner.mjs', import.meta.url));
const core = new URL('../research/ratfit.mjs', import.meta.url).href;

test('daily auto runner saves plan and compatible report; changed model is a persisted execution error', async () => {
  for (const changeModel of [false, true]) {
    const dir = await mkdtemp(join(tmpdir(), 'oraklet-runner-'));
    try {
      const mock = `
import { writeFile } from 'node:fs/promises';
import { makeCases, UPSTREAM } from ${JSON.stringify(core)};
const cases = makeCases('123'); let modelCalls = 0;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('supabase.co')) {
    if (options.method === 'POST') { await writeFile('saved.json', options.body); return new Response('', { status: 201 }); }
    return Response.json([]);
  }
  const body = JSON.parse(options.body);
  if (body.tool) {
    const fixture = cases.find(c => JSON.stringify(c.input.banked) === JSON.stringify(body.input.banked));
    const accepted = JSON.stringify(fixture.input.holdout) === JSON.stringify(body.input.holdout);
    return Response.json({ provider: 'bootloops', mock: false,
      toolResult: { tool: 'bootloops_ratfit', upstreamCommit: UPSTREAM, accepted, depth: 3, checked: 3, failed: accepted ? 0 : 1 },
      verification: { status: accepted ? 'passed' : 'failed', scope: 'exact_rational_holdout', factualityChecked: false } }, { status: accepted ? 200 : 422 });
  }
  const messages = JSON.parse(body.message).messages;
  let answer;
  if (modelCalls++ === 0) answer = { experimentId: 'ratfit-feedback', seed: '123', reason: 'Nästa test.' };
  else {
    const banked = JSON.parse(messages[1].content).banked;
    answer = { method: 'bootloops_ratfit', coefficients: cases.find(c => JSON.stringify(c.input.banked) === JSON.stringify(banked)).truth, reason: 'Förslag.' };
  }
  return Response.json({ answer: JSON.stringify(answer), provider: 'groq', model: ${changeModel} && modelCalls > 1 ? 'changed' : 'same', mock: false });
};`;
      const preload = join(dir, 'mock.mjs'); await writeFile(preload, mock);
      const process = run(globalThis.process.execPath, ['--import', pathToFileURL(preload).href, runner], {
        cwd: dir, env: { ...globalThis.process.env, ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test',
          EXPERIMENT: 'auto', EXPERIMENT_SEED: '123' }, timeout: 15000 });
      if (changeModel) await assert.rejects(process); else await process;
      const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8'));
      assert.equal(saved.rapport.executionStatus, changeModel ? 'error' : 'completed');
      assert.equal(saved.rapport.status, changeModel ? 'failed' : 'passed');
      assert.equal(saved.rapport.cases.length, changeModel ? 0 : 3);
      assert.ok(await readFile(join(dir, 'reports/oraklet-lab/plan.json'), 'utf8'));
      assert.ok(await readFile(join(dir, 'reports/oraklet-lab/commitments.json'), 'utf8'));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
