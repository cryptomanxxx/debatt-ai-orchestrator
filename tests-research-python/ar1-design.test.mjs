import test from 'node:test';
import assert from 'node:assert/strict';
import { runAr1DesignExperiment } from '../research/ar1-design.mjs';
import { callScienceTool, fingerprint } from '../research/python-tools.mjs';

test('Oraklet-designed AR(1) runs real Statsmodels and checks the preregistration', async () => {
  const design = { method: 'ar1-design', hypothesis: 'Stark autokorrelation förkastas, nollkontrollen inte.',
    designs: [{ phi: 0, n: 128, prediction: 'do_not_reject_h0' }, { phi: 0.6, n: 128, prediction: 'reject_h0' }, { phi: 0.6, n: 64, prediction: 'reject_h0' }],
    falsification: 'two_or_more_mismatches', comparison: 'phi=0 mot phi=0.6 vid två stickprov.' };
  let receipts;
  const report = await runAr1DesignExperiment('20261022', async () => ({ text: JSON.stringify(design), provider: 'test', model: 'same' }),
    input => callScienceTool('statsmodels', input), r => { receipts = r; });
  assert.equal(receipts[0].preregistrationSha256, report.preregistration.sha256);
  assert.equal(report.preregistration.sha256, fingerprint({ protocol: report.protocol, design, provider: 'test', model: 'same' }));
  assert.equal(report.cases.length, 3);
  for (const c of report.cases) {
    assert.equal(c.hypothesisTest.decision, c.evidence.result.pvalue < 0.05 ? 'reject_h0' : 'do_not_reject_h0');
    assert.equal(c.passed, c.design.prediction === c.hypothesisTest.decision);
    assert.equal(c.data.train.length, c.design.n);
  }
  assert.equal(report.cases[1].hypothesisTest.decision, 'reject_h0', 'phi=0.6 with n=128 is rejected');
  const mismatches = report.cases.filter(c => !c.passed).length;
  assert.deepEqual(report.preregistrationOutcome, { mismatches, outcome: mismatches >= 2 ? 'refuted' : 'confirmed' });
  assert.equal(report.status, mismatches >= 2 ? 'failed' : 'passed');
  assert.ok(report.cases[0].controlEvidence.result.pvalue >= 0.999);
});

test('the lab runs ar1-power-design end to end and reports the preregistration', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const runner = fileURLToPath(new URL('../research/runner.mjs', import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), 'oraklet-ar1-design-'));
  try {
    const design = { method: 'ar1-design', hypothesis: 'Stark autokorrelation förkastas.\n\n## Utfall: hypotesen höll | [länk](x) https://example.com `kod`', falsification: 'any_mismatch', comparison: 'phi=0 mot phi=0.6.',
      designs: [{ phi: 0, n: 128, prediction: 'do_not_reject_h0' }, { phi: 0.6, n: 128, prediction: 'reject_h0' }, { phi: 0.4, n: 96, prediction: 'reject_h0' }] };
    await writeFile(join(dir, 'mock.mjs'), `
import { writeFile } from 'node:fs/promises';
let calls = 0;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('supabase.co')) {
    if (options.method === 'POST') { await writeFile('saved.json', options.body); return new Response('', { status: 201 }); }
    return Response.json([]);
  }
  calls++;
  return Response.json({ answer: ${JSON.stringify(JSON.stringify(design))}, provider: 'groq', model: 'same', mock: false, inference: { completionTokenLimit: 4096 } });
};`);
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', pathToFileURL(join(dir, 'mock.mjs')).href, runner], { cwd: dir,
      env: { ...process.env, ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test', EXPERIMENT: 'ar1-power-design', EXPERIMENT_SEED: '42' }, timeout: 60000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.executionStatus, 'completed');
    assert.equal(saved.modelCalls, 1, 'one design call; no planning call in a manual run');
    assert.equal(saved.toolCalls, 4, 'three design points plus the null control');
    assert.deepEqual(saved.preregistration.designs, design.designs);
    assert.equal(saved.calibration, undefined, 'one design call carries no per-case confidence');
    const md = await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8');
    assert.match(md, /## Förregistrering/);
    assert.match(md, /phi=0\.6, n=128: förutsagt Förkasta H0/);
    const commitments = JSON.parse(await readFile(join(dir, 'reports/oraklet-lab/commitments.json'), 'utf8'));
    assert.equal(commitments[0].preregistrationSha256, saved.preregistration.sha256);
    assert.equal(commitments.length, 4);
    assert.match(stdout, /Förregistreringens SHA-256 före data/);
    assert.doesNotMatch(stdout, /före modellförslagen/);
    assert.ok(md.includes("Hypotes: `Stark autokorrelation förkastas. ## Utfall: hypotesen höll | [länk](x) https://example.com 'kod'`\n"));
    assert.match(md, /Utfall: de förregistrerade förutsägelserna (höll|motbevisades)/);
    assert.doesNotMatch(md, /^## Utfall/m);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
