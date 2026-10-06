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

test('runner preserves partial results and bounded diagnostics for model and tool failures', async () => {
  for (const scenario of ['success', 'model_changed', 'invalid_proposal', 'tool_http_error', 'model_output_truncated', 'duplicate_plan', 'model_budget_not_applied']) {
    const changeModel = scenario === 'model_changed';
    const successful = ['success', 'duplicate_plan'].includes(scenario);
    const dir = await mkdtemp(join(tmpdir(), 'oraklet-runner-'));
    try {
      const mock = `
import { writeFile } from 'node:fs/promises';
import { makeCases, UPSTREAM } from ${JSON.stringify(core)};
const cases = makeCases(${JSON.stringify(scenario === 'duplicate_plan' ? '124' : '123')}); let modelCalls = 0;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('supabase.co')) {
    if (options.method === 'POST') { await writeFile('saved.json', options.body); return new Response('', { status: 201 }); }
    return Response.json(${JSON.stringify(scenario === 'duplicate_plan' ? [{ experimentId: 'ratfit-feedback', seed: '123', status: 'failed' }] : [])});
  }
  const body = JSON.parse(options.body);
  if (body.tool) {
    if (${JSON.stringify(scenario)} === 'tool_http_error') return Response.json({ error: 'SECRET upstream error' }, { status: 502 });
    const fixture = cases.find(c => JSON.stringify(c.input.banked) === JSON.stringify(body.input.banked));
    const accepted = JSON.stringify(fixture.input.holdout) === JSON.stringify(body.input.holdout);
    return Response.json({ provider: 'bootloops', mock: false,
      toolResult: { tool: 'bootloops_ratfit', upstreamCommit: UPSTREAM, accepted, depth: 3, checked: 3, failed: accepted ? 0 : 1 },
      verification: { status: accepted ? 'passed' : 'failed', scope: 'exact_rational_holdout', factualityChecked: false } }, { status: accepted ? 200 : 422 });
  }
  if (${JSON.stringify(scenario)} === 'model_output_truncated' && modelCalls === 1) return Response.json({ error: 'model_output_truncated', raw: 'SECRET' }, { status: 502 });
  if (body.completionTokenLimit !== 4096) throw new Error('Unexpected completion budget');
  const messages = JSON.parse(body.message).messages;
  let answer;
  if (modelCalls++ === 0) answer = { experimentId: 'ratfit-feedback', seed: '123', reason: 'Nästa test.' };
  else {
    const banked = JSON.parse(messages[1].content).banked;
    answer = { method: 'bootloops_ratfit', coefficients: cases.find(c => JSON.stringify(c.input.banked) === JSON.stringify(banked)).truth, reason: 'Förslag.' };
  }
  if (${JSON.stringify(scenario)} === 'invalid_proposal' && modelCalls === 3) answer = { error: 'SECRET malformed answer' };
  return Response.json({ answer: JSON.stringify(answer), provider: 'groq', model: ${changeModel} && modelCalls > 1 ? 'changed' : 'same', mock: false, inference: { completionTokenLimit: ${JSON.stringify(scenario)} === 'model_budget_not_applied' ? 1024 : 4096 } });
};`;
      const preload = join(dir, 'mock.mjs'); await writeFile(preload, mock);
      const process = run(globalThis.process.execPath, ['--import', pathToFileURL(preload).href, runner], {
        cwd: dir, env: { ...globalThis.process.env, ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test',
          EXPERIMENT: 'auto', EXPERIMENT_SEED: '123' }, timeout: 15000 });
      if (!successful) await assert.rejects(process, error => {
        assert.ok(!error.stdout.includes('SECRET') && !error.stderr.includes('SECRET'));
        return true;
      }); else await process;
      const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8'));
      assert.equal(saved.rapport.executionStatus, !successful ? 'error' : 'completed');
      assert.equal(saved.rapport.inferenceSettings.completionTokenLimit, 4096);
      assert.equal(saved.rapport.status, !successful ? 'failed' : 'passed');
      assert.equal(saved.rapport.cases.length, successful ? 3 : scenario === 'invalid_proposal' ? 1 : 0);
      if (!successful) {
        const failure = saved.rapport.failure;
        assert.equal(failure.code, scenario === 'invalid_proposal' ? 'invalid_model_proposal' : scenario);
        assert.equal(failure.case, scenario === 'model_budget_not_applied' ? undefined : scenario === 'invalid_proposal' ? 2 : 1);
        assert.equal(failure.operation, scenario === 'model_budget_not_applied' ? undefined : scenario === 'tool_http_error' ? 'positive_control' : 'initial_proposal');
        if (scenario === 'tool_http_error') assert.equal(failure.httpStatus, 502);
        assert.ok(!JSON.stringify(saved).includes('SECRET'));
      }
      if (scenario === 'duplicate_plan') {
        assert.equal(saved.rapport.seed, '124');
        assert.deepEqual(saved.rapport.plan.seedAdjustment, { reason: 'duplicate_in_recent_history', originalSeed: '123' });
        assert.equal(saved.rapport.cases[0].commitment, (await import(core)).makeCases('124')[0].commitment);
        assert.ok(saved.rapport.planCommitment);
      }
      if (scenario === 'invalid_proposal') {
        const checkpoint = JSON.parse(await readFile(join(dir, 'reports/oraklet-lab/progress.json'), 'utf8'));
        assert.equal(checkpoint.cases.length, 1);
        assert.equal(checkpoint.cases[0].passed, true);
      }
      if (scenario === 'model_budget_not_applied') {
        assert.equal(saved.rapport.failedStage, 'planning');
        await assert.rejects(readFile(join(dir, 'reports/oraklet-lab/plan.json'), 'utf8'), { code: 'ENOENT' });
      } else {
        assert.ok(await readFile(join(dir, 'reports/oraklet-lab/plan.json'), 'utf8'));
        assert.ok(await readFile(join(dir, 'reports/oraklet-lab/commitments.json'), 'utf8'));
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
