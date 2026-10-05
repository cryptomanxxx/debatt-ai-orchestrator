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
    '--ip', '127.0.0.1', '--port', '8788', '--local', '--no-interactive'],
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
    assert.equal((await direct({ ...input, holdout: [['0/2','1'],['5','1']] })).status, 400);
    assert.equal((await direct(input, 'text/plain')).status, 415);
    assert.equal((await direct(input, 'application/json', '/other')).status, 404);
    assert.equal((await direct(input, 'application/json', '/v1/ratfit?x=1')).status, 404);
    assert.equal((await direct({ extra: 'x'.repeat(17000) })).status, 413);
    runtime = new Miniflare(convertV4MiniflareOptions({
      modules: true, scriptPath: '.worker-build/worker.js', compatibilityDate: '2026-10-05',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { ORCHESTRATOR_API_KEY: key, MODEL_PROVIDER: 'mock' },
      serviceBindings: { BOOTLOOPS: async (request: Request) => {
        assert.equal(request.url, 'https://bootloops.internal/v1/ratfit');
        assert.equal(request.headers.has('Authorization'), false);
        return direct(await request.json());
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
    console.log('Real Python Worker: planted truth passed; corrupted holdout refused; service binding passed.');
  } finally {
    if (runtime) await runtime.dispose();
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    }
  }
});
