import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Only calibration cases and mechanics run here: the new cases' outcomes stay unseen until the
// weekly workflow runs them against the predictions registered in experiments.py.
const py = code => JSON.parse(execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, 'research/openai-math')\nimport experiments as x\n${code}`], { encoding: 'utf8' }));

test('E1 calibration reproduces the golden-ratio dimension 0.995713; every case has one root in (0, 1) and a prediction', () => {
  const r = py("c = x.e1_case(x.E1_CALIBRATION[0]); print(json.dumps(c))");
  assert.ok(Math.abs(r.estimate_ratio - 0.995713) < 1e-5);
  assert.ok(r.upper_bound_ratio > r.estimate_ratio, 'H_n/n bounds h from above');
  const roots = py("print(json.dumps([[c['id'], x.root_in_unit_interval(c['poly']), x.e1_prediction(c)] for c in x.E1_CASES]))");
  assert.deepEqual(roots.map(r => r[0]), ['salem4', 'tribonacci', 'plastic', 'salem4b', 'lehmer']);
  for (const [, lam, prediction] of roots) { assert.ok(lam > 0 && lam < 1); assert.equal(prediction, 'below_one'); }
  assert.ok(Math.abs(roots[0][1] - 1 / 1.7220838) < 1e-6 && Math.abs(roots[4][1] - 1 / 1.17628082) < 1e-6);
});

test('E2: a perfect channel keeps full information, a useless one none, and the Ising calibration lands on Kesten-Stigum', () => {
  const r = py(`import numpy as np
print(json.dumps([x.potts_overlap(5, 2, 1.0, np.random.default_rng(1), 2000, 10), x.potts_overlap(5, 2, 0.0, np.random.default_rng(1), 2000, 10),
  x.e2_case(x.E2_CALIBRATION[0], 20261104)]))`);
  assert.ok(Math.abs(r[0] - 1) < 1e-12);
  assert.ok(Math.abs(r[1]) < 1e-12);
  assert.equal(r[2].outcome, 'equal_to_ks');
  assert.ok(Math.abs(r[2].ratio - 1) <= 0.03);
  const p = py("print(json.dumps([[c['q'], x.e2_prediction(c)] for c in x.E2_CASES]))");
  assert.ok(p.every(([q, pr]) => pr === (q <= 4 ? 'equal_to_ks' : 'below_ks')));
});

test('E3: exact diagonalisation separates the Haldane gap from the gapless Takhtajan-Babujian point', () => {
  const r = py("print(json.dumps([x.e3_case(c) for c in x.E3_CALIBRATION]))");
  assert.deepEqual(r.map(c => c.outcome), ['gapped', 'gapless_like']);
  // Two-site check: S·S on two spin-1 sites has eigenvalues -2 (singlet), -1 (triplet), 1 (quintet).
  const ev = py("import numpy as np\nP, _ = x.spin1_bond(); print(json.dumps(sorted(set(round(v, 9) for v in np.linalg.eigvalsh(P)))))");
  assert.deepEqual(ev, [-2, -1, 1]);
  assert.ok(r[0].gaps['12'] > 0.41 && r[0].gaps['12'] < 0.5, 'the L = 12 ring gap lies above the infinite-chain value 0.4105');
  const p = py("print(json.dumps([[c['theta_pi'], x.e3_prediction(c)] for c in x.E3_CASES]))");
  assert.ok(p.every(([t, pr]) => pr === (t > -0.25 && t < 0.25 ? 'gapped' : 'gapless_like')));
});

test('the week picks one new case per experiment in turn; agreement and rendering follow fixed rules', () => {
  const w = py("print(json.dumps([x.week_of('2026-11-09'), x.week_of('2026-11-16'), x.agrees('below_one', 'below_one_numerical'), x.agrees('below_one', 'undecided'), x.agrees('below_ks', 'equal_to_ks')]))");
  assert.equal(w[1], w[0] + 1);
  assert.deepEqual(w.slice(2), [true, null, false]);
  const md = execFileSync('python3', ['-c', `import sys; sys.path.insert(0, 'research/openai-math')
import experiments as x
r = {'date': '2026-11-09', 'experiments': {'E2': {'calibration': [{'q': 2, 'd': 2, 'threshold': 0.71, 'ratio': 1.004, 'calibration_passed': True}],
  'case': {'q': 5, 'd': 2, 'seed': 1, 'threshold': 0.6, 'resolution': 0.002, 'kesten_stigum': 0.7071, 'ratio': 0.85, 'outcome': 'below_ks', 'prediction': 'below_ks', 'agrees': True}}}}
print(x.render(r))`], { encoding: 'utf8' });
  assert.match(md, /# Oraklets beräkningsexperiment – 2026-11-09/);
  assert.match(md, /Utfall: under Kesten–Stigum\. Förutsägelse: under Kesten–Stigum\. Bedömning: stämmer\./);
  assert.match(md, /Kalibreringar: 1 av 1 godkända/);
});

test('the index lists every dated run, newest first', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'berakningar-'));
  await mkdir(join(dir, 'berakningar'));
  for (const d of ['2026-11-09', '2026-11-16']) await writeFile(join(dir, 'berakningar', `${d}.md`), '# x\n');
  execFileSync('python3', ['research/openai-math/experiments.py', '--index', dir]);
  const index = await readFile(join(dir, 'berakningar', 'README.md'), 'utf8');
  assert.ok(index.indexOf('[2026-11-16]') < index.indexOf('[2026-11-09]'));
  assert.doesNotMatch(index, /README/);
});
