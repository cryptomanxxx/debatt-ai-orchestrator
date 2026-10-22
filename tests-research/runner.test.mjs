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
  for (const scenario of ['success', 'reasoning_choice', 'model_changed', 'invalid_proposal', 'tool_http_error', 'model_output_truncated', 'duplicate_plan', 'model_budget_not_applied']) {
    const changeModel = scenario === 'model_changed';
    const successful = ['success', 'reasoning_choice', 'duplicate_plan'].includes(scenario);
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
  if (String(url).endsWith('/v1/model-profile'))
    return Response.json({ provider: 'groq', model: 'same', mode: 'default', reasoningAvailable: ${JSON.stringify(scenario === 'reasoning_choice')} });
  const body = JSON.parse(options.body);
  if (!body.tool) {
    const expected = ${JSON.stringify(scenario)} === 'reasoning_choice' && modelCalls > 0 ? 'reasoning' : 'default';
    if (body.mode !== expected) throw new Error('Unexpected model mode ' + body.mode);
  }
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
  if (modelCalls++ === 0) answer = { experimentId: 'ratfit-feedback', seed: '123', reason: 'Nästa test.',
    ...(${JSON.stringify(scenario)} === 'reasoning_choice' ? { modelMode: 'reasoning' } : {}) };
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
      if (successful) assert.equal(saved.rapport.modelMode, scenario === 'reasoning_choice' ? 'reasoning' : 'default');
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

for (const variant of ['explicit', 'alias', 'alias_remapped', 'gateway_error']) test(`runner calls a benchmark-ranked model chosen by the planner through the lab gateway profile (${variant})`, async () => {
  const alias = variant !== 'explicit';
  const provider = alias ? 'blablador' : 'hip', model = alias ? 'alias-fast' : 'GLM-5.2-AWQ-INT4', choice = `${provider} / ${model}`;
  const dir = await mkdtemp(join(tmpdir(), 'oraklet-runner-ranked-'));
  try {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'research'));
    const domains = { symbolic: { correct: 8, attempts: 8, latencies: [3] } };
    await writeFile(join(dir, 'research/model-scores.json'), JSON.stringify({ runs: { '9': { provider, suite: 'domains-v1',
      models: { [alias ? 'alias-fast@openai/gpt-oss-120b' : model]: { correct: 8, attempts: 8, latencies: [3], domains } } } } }));
    await writeFile(join(dir, 'research/model-catalog.json'), JSON.stringify({ providers: { hip: alias ? [] : [model], blablador: alias ? [model] : [] },
      aliasRoots: alias ? { blablador: { 'alias-fast': 'openai/gpt-oss-120b' } } : {} }));
    const mock = `
import { writeFile } from 'node:fs/promises';
import { makeCases, UPSTREAM } from ${JSON.stringify(core)};
const cases = makeCases('123'); let planned = false;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('supabase.co')) {
    if (options.method === 'POST') { await writeFile('saved.json', options.body); return new Response('', { status: 201 }); }
    return Response.json([]);
  }
  if (String(url).endsWith('/v1/model-profile')) return Response.json({ reasoningAvailable: false });
  const body = JSON.parse(options.body);
  if (body.tool) {
    const fixture = cases.find(c => JSON.stringify(c.input.banked) === JSON.stringify(body.input.banked));
    const accepted = JSON.stringify(fixture.input.holdout) === JSON.stringify(body.input.holdout);
    return Response.json({ provider: 'bootloops', mock: false,
      toolResult: { tool: 'bootloops_ratfit', upstreamCommit: UPSTREAM, accepted, depth: 3, checked: 3, failed: accepted ? 0 : 1 },
      verification: { status: accepted ? 'passed' : 'failed', scope: 'exact_rational_holdout', factualityChecked: false } }, { status: accepted ? 200 : 422 });
  }
  if (String(url).endsWith('/v1/research/benchmark')) {
    if (!planned) throw new Error('Lab gateway called before planning');
    if (body.profile !== 'lab' || body.max_tokens !== 4096 || body.provider !== ${JSON.stringify(provider)} || body.model !== ${JSON.stringify(model)})
      throw new Error('Unexpected lab request ' + JSON.stringify({ ...body, messages: undefined }));
    if (${JSON.stringify(variant)} === 'gateway_error') return Response.json({ error: 'benchmark_response_too_large' }, { status: 502 });
    const wrapped = JSON.parse(body.messages[0].content).messages;
    if (!wrapped.at(-1).content.includes('confidence')) throw new Error('Calibration rule missing');
    const banked = JSON.parse(wrapped[1].content).banked;
    const answer = { method: 'bootloops_ratfit', coefficients: cases.find(c => JSON.stringify(c.input.banked) === JSON.stringify(banked)).truth, reason: 'Förslag.', confidence: 0.75 };
    return Response.json({ status: 'completed_unverified', provider: ${JSON.stringify(provider)}, model: ${JSON.stringify(model)}, finish_reason: 'stop',
      ...(${alias} ? { resolved_model: ${JSON.stringify(variant === 'alias_remapped' ? 'Qwen/Qwen3.8-27B-FP8' : 'openai/gpt-oss-120b')} } : {}),
      answer: '\`\`\`json\\n' + JSON.stringify(answer) + '\\n\`\`\`', scientificallyVerified: false, backendIdentityVerified: false });
  }
  if (planned) throw new Error('Configured model used after a ranked choice');
  const prompt = JSON.parse(JSON.parse(body.message).messages[1].content);
  if (prompt.researchModels?.symbolic?.[0]?.modelMode !== ${JSON.stringify(choice)}) throw new Error('Ranked models missing from prompt');
  planned = true;
  return Response.json({ answer: JSON.stringify({ experimentId: 'ratfit-feedback', seed: '123', reason: 'Bäst rankad i symbolisk matematik.',
    modelMode: ${JSON.stringify(choice)} }), provider: 'groq', model: 'same', mock: false, inference: { completionTokenLimit: 4096 } });
};`;
    const preload = join(dir, 'mock.mjs'); await writeFile(preload, mock);
    const child = run(process.execPath, ['--import', pathToFileURL(preload).href, runner], {
      cwd: dir, env: { ...process.env, ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test',
        EXPERIMENT: 'auto', EXPERIMENT_SEED: '123' }, timeout: 15000 });
    const fails = { alias_remapped: 'model_identity_mismatch', gateway_error: 'oversized_provider_response' }[variant];
    if (fails) await assert.rejects(child); else await child;
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8'));
    assert.deepEqual(saved.rapport.plan.modelChoice, { domain: 'symbolic', provider, model, ...(alias ? { root: 'openai/gpt-oss-120b' } : {}),
      evidence: { suite: 'Scientific benchmark v4', correct: 8, attempts: 8 } });
    if (fails) {
      assert.equal(saved.rapport.executionStatus, 'error');
      assert.equal(saved.rapport.failure.code, fails);
      if (variant === 'gateway_error') assert.equal(saved.rapport.failure.httpStatus, 502);
      return;
    }
    assert.equal(saved.rapport.executionStatus, 'completed');
    assert.equal(saved.rapport.modelMode, choice);
    assert.deepEqual([saved.rapport.calibration.scoredCases, saved.rapport.calibration.meanConfidence, saved.rapport.calibration.passRate],
      [3, 0.75, 1], 'confidence is recorded per case and stripped before the strict Ratfit parser');
    assert.equal(saved.rapport.cases.length, 3);
    assert.ok(saved.rapport.modelCalls >= 4);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

for (const variant of ['recorded', 'bank_down']) test(`daily lab works on an approved, literature-linked Problem Bank problem (${variant})`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oraklet-runner-bank-'));
  try {
    const bankModule = new URL('../research/problem-bank.mjs', import.meta.url).href;
    const catalogModule = new URL('../research/catalog.mjs', import.meta.url).href;
    const mock = `
import { writeFile } from 'node:fs/promises';
import { makeCases, UPSTREAM } from ${JSON.stringify(core)};
import { createProblem } from ${JSON.stringify(bankModule)};
import { CATALOG } from ${JSON.stringify(catalogModule)};
const cases = makeCases('123'); let planned = false; const runs = [];
const problem = createProblem({ id: 'oraklet-ratfit-feedback-001', kind: 'open', domain: 'symbolic-regression',
  question: CATALOG.find(e => e.id === 'ratfit-feedback').question, source: { experiment_id: 'ratfit-feedback' }, verifier_ids: ['ratfit'], difficulty: 2 });
const literature = [{ report: { id: '11111111-1111-4111-8111-111111111111', planner: { proposals: [{ id: 'arp-symbolic-regression',
  research_question: 'Hur få punkter räcker för rationell rekonstruktion?', evidence: [{ id: 'W1' }], gap_candidates: [] }] } } }];
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes('/rest/v1/research_problem')) return Response.json([problem]);
  if (u.includes('/rest/v1/literature_planner_run')) return Response.json(literature);
  if (u.includes('/rest/v1/research_run')) {
    if (${JSON.stringify(variant)} === 'bank_down') return new Response('down', { status: 503 });
    const body = JSON.parse(options.body);
    if (options.method === 'POST') { const row = { id: 'run-7', ...body }; runs.push(row); return Response.json([row]); }
    await writeFile('bank-finish.json', options.body);
    return Response.json([{ ...runs[0], ...body }]);
  }
  if (u.includes('supabase.co')) {
    if (options.method === 'POST') { await writeFile('saved.json', options.body); return new Response('', { status: 201 }); }
    return Response.json([]);
  }
  if (u.endsWith('/v1/model-profile')) return Response.json({ reasoningAvailable: false });
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
  if (!planned) {
    const prompt = JSON.parse(messages[1].content);
    if (prompt.openProblems?.[0]?.problemBankId !== 'oraklet-ratfit-feedback-001' || !prompt.openProblems[0].literature)
      throw new Error('Open problems missing from prompt');
    planned = true;
    answer = { experimentId: 'ratfit-feedback', seed: '123', reason: 'Litteraturstött problem.', problemBankId: 'oraklet-ratfit-feedback-001' };
  } else {
    const banked = JSON.parse(messages[1].content).banked;
    answer = { method: 'bootloops_ratfit', coefficients: cases.find(c => JSON.stringify(c.input.banked) === JSON.stringify(banked)).truth, reason: 'Förslag.' };
  }
  return Response.json({ answer: JSON.stringify(answer), provider: 'groq', model: 'same', mock: false, inference: { completionTokenLimit: 4096 } });
};`;
    const preload = join(dir, 'mock.mjs'); await writeFile(preload, mock);
    await run(process.execPath, ['--import', pathToFileURL(preload).href, runner], {
      cwd: dir, env: { ...process.env, ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test',
        SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'secret', EXPERIMENT: 'auto', EXPERIMENT_SEED: '123' }, timeout: 15000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8'));
    assert.equal(saved.rapport.executionStatus, 'completed', 'a Problem Bank outage never stops the experiment');
    assert.equal(saved.rapport.plan.problemBank.id, 'oraklet-ratfit-feedback-001');
    assert.equal(saved.rapport.plan.problemBank.literature.articles, 1);
    if (variant === 'bank_down') {
      assert.deepEqual(saved.rapport.problemBank, { id: 'oraklet-ratfit-feedback-001', version: 1, recorded: false, reason: 'start_failed' });
      return;
    }
    assert.deepEqual(saved.rapport.problemBank, { id: 'oraklet-ratfit-feedback-001', version: 1, recorded: true, runId: 'run-7', researchStatus: 'verified' });
    const finish = JSON.parse(await readFile(join(dir, 'bank-finish.json'), 'utf8'));
    assert.equal(finish.status, 'completed');
    assert.equal(finish.state.research.results[0].status, 'verified');
    assert.equal(finish.state.research.attempts[0].evidence.report_id, saved.rapport.reportId);
    assert.match(await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8'), /Problem Bank: oraklet-ratfit-feedback-001.*sparades som verifierat/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
