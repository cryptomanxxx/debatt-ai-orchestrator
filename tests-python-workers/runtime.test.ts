import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const input = { banked: [['0','1/2'],['1','2/3'],['2','3/4'],['3','4/5'],['6','7/8'],['7','8/9']],
  holdout: [['4','5/6'],['5','6/7']] };
const key = 'python-worker-test-key-at-least-24-characters';

test('real Python Worker runs behind an authenticated orchestrator service binding', { timeout: 240000 }, async () => {
  const child = spawn('uvx', ['--from', 'workers-py==1.17.6', 'pywrangler', 'dev',
    '--ip', '127.0.0.1', '--port', '8788', '--local', '--show-interactive-dev-session=false'],
    { cwd: 'bootloops-worker', detached: true, stdio: ['ignore','pipe','pipe'] });
  let logs = '', exited = false;
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-65536); });
  child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-65536); });
  child.on('exit', () => { exited = true; });
  child.on('error', error => { logs += error.message; exited = true; });
  let runtime: Miniflare | undefined;
  const direct = (body: unknown, type = 'application/json', path = '/v1/ratfit') =>
    fetch('http://127.0.0.1:8788' + path, { method: 'POST',
      headers: { 'Content-Type': type }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
  try {
    let ready = false;
    for (let i = 0; i < 180 && !exited; i++) {
      try {
        const response = await direct(input);
        if (response.status === 200) { ready = true; break; }
        if (response.status !== 503) throw new Error('Python startup returned ' + response.status + ': ' + await response.text());
      } catch (error) {
        if (String(error).includes('Python startup')) throw error;
      }
      await delay(1000);
    }
    assert.ok(ready, 'Python Worker did not start: ' + logs);
    const good = await direct(input);
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { accepted: true, depth: 3, checked: 2, failed: 0 });
    const corrupt = { ...input, holdout: [['4','0'],['5','6/7']] };
    assert.equal((await direct(corrupt)).status, 422);
    const constant = { banked: input.banked.map(([x]) => [x, '7/3']),
      holdout: input.holdout.map(([x]) => [x, '7/3']) };
    const constantResult = await direct(constant);
    assert.equal(constantResult.status, 200);
    assert.deepEqual(await constantResult.json(), { accepted: true, depth: 1, checked: 2, failed: 0 });
    const square = { banked: [-3,-2,-1,0,1,2].map(x => [String(x), String(x*x)]),
      holdout: [["3","9"],["4","16"]] };
    const squareResult = await direct(square);
    assert.equal(squareResult.status, 200);
    assert.equal((await squareResult.json()).failed, 0);
    const largeFraction = '999999999999999999999999/999999999999999999999998';
    assert.equal((await direct({ banked: constant.banked.map(([x]) => [x, largeFraction]),
      holdout: constant.holdout.map(([x]) => [x, largeFraction]) })).status, 200);
    assert.equal((await direct({ ...input, holdout: [['4','1/02'],['5','6/7']] })).status, 400);
    assert.equal((await direct({ ...input, holdout: [['0/2','1'],['5','1']] })).status, 400);
    assert.equal((await direct(input, 'text/plain')).status, 415);
    assert.equal((await direct(input, 'application/json', '/other')).status, 404);
    assert.equal((await direct(input, 'application/json', '/v1/ratfit?x=1')).status, 404);
    assert.equal((await direct({ extra: 'x'.repeat(17000) })).status, 413);
    for (const stage of ['transport','json','validate','fit','full']) {
      const diagnostic = await direct(input, 'application/json', '/v1/diagnostics/bootloops/' + stage);
      assert.equal(diagnostic.status, 200);
      assert.deepEqual(await diagnostic.json(), { diagnostic: true, stage, fixture: 'rational-v1' });
    }
    assert.equal((await direct(corrupt, 'application/json', '/v1/diagnostics/bootloops/full')).status, 400);
    assert.equal((await direct(input, 'application/json', '/v1/diagnostics/bootloops/unknown')).status, 404);
    assert.equal((await direct(input, 'application/json', '/v1/diagnostics/bootloops/full?x=1')).status, 404);
    assert.equal((await direct({ extra: 'x'.repeat(17000) }, 'application/json', '/v1/diagnostics/bootloops/transport')).status, 413);
    runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true, scriptPath: '.worker-build/worker.js', compatibilityDate: '2026-10-05',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { ORCHESTRATOR_API_KEY: key, MODEL_PROVIDER: 'mock' },
      serviceBindings: { BOOTLOOPS: async (request: Request) => {
        assert.equal(request.headers.has('Authorization'), false);
        const path = new URL(request.url).pathname;
        assert.ok(path === '/v1/ratfit' || path.startsWith('/v1/diagnostics/bootloops/'));
        return direct(await request.json(), 'application/json', path);
      } }
    }));
    const query = (args: unknown, auth = key) => runtime!.dispatchFetch('https://orchestrator.test/v1/query', {
      method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'bootloops_ratfit', input: args }) });
    assert.equal((await query(input, 'wrong')).status, 401);
    const result = await query(input);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).verification.scope, 'exact_rational_holdout');
    const rejected = await query(corrupt);
    assert.equal(rejected.status, 422);
    assert.equal((await rejected.json()).verification.status, 'failed');
    const diagnosticRequest = (stage: string, auth = key) => runtime!.dispatchFetch('https://orchestrator.test/v1/diagnostics/bootloops', {
      method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }) });
    assert.equal((await diagnosticRequest('full', 'wrong')).status, 401);
    for (const stage of ['transport','json','validate','fit','full']) {
      const result = await diagnosticRequest(stage);
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { diagnostic: true, stage, fixture: 'rational-v1' });
    }
    console.log('Real Python Worker: truth, constant, degeneracy and bounded large fractions passed; corruption and invalid input refused; service binding passed.');
    console.log('Real Python Worker diagnostics: all five fixed-fixture stages and authenticated service binding passed.');
  } finally {
    if (runtime) await runtime.dispose();
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    }
  }
});
