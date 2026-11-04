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

test('E4: the exact check accepts Strassen and refuses a corrupted scheme; the calibrations reach ranks 7 and 11', () => {
  const r = py(`import matmul_flip as f
bad = f.strassen(); bad[0] = (bad[0][0] ^ 1,) + bad[0][1:]
print(json.dumps([f.check(f.strassen(), 2, 2, 2), f.check(bad, 2, 2, 2), f.check(f.standard(2, 3, 4), 2, 3, 4), len(f.strassen()),
  [x.e4_case(c, 20261104) for c in x.E4_CALIBRATION]]))`);
  assert.deepEqual(r.slice(0, 4), [true, false, true, 7]);
  for (const c of r[4]) { assert.equal(c.outcome, 'reached_reference'); assert.ok(c.all_checked); assert.equal(c.found, c.reference); }
  const p = py("print(json.dumps([[c['id'], c['reference'], x.e4_prediction(c)] for c in x.E4_CASES] + [x.agrees('not_below_reference', 'above_reference'), x.agrees('not_below_reference', 'below_reference'), x.agrees('not_below_reference', 'unchecked')]))");
  assert.ok(p.slice(0, -3).every(([, ref, pr]) => ref > 0 && pr === 'not_below_reference'));
  assert.deepEqual(p.slice(-3), [true, false, null]);
});

test('E6: a package passes on its own success text, and a missing directory, a failure and the known defect are told apart', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'replication-'));
  for (const [d, script] of [['ok', 'print("ALL GOOD")'], ['bad', 'import sys; print("nope"); sys.exit(1)'], ['defect', 'import sys; print("missing SOURCE-MANIFEST.json"); sys.exit(1)']]) {
    await mkdir(join(repo, 'preprints', d), { recursive: true });
    await writeFile(join(repo, 'preprints', d, 'check.py'), script);
  }
  const r = JSON.parse(execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, 'research/openai-math')
import replication as rp
rp.KNOWN_DEFECTS['defect'] = {'absent': 'verification/SOURCE-MANIFEST.json', 'pattern': r'SOURCE-MANIFEST\\.json'}
rows = [rp.run_package(sys.argv[1], ('1', n, d, 'python3 check.py', [r'ALL GOOD'])) for n, d in [('a', 'ok'), ('b', 'bad'), ('c', 'defect'), ('d', 'gone')]]
print(json.dumps([[x['status'], x['tail']] for x in rows]))`, repo], { encoding: 'utf8' }));
  assert.deepEqual(r.map(x => x[0]), ['pass', 'fail', 'known_defect', 'missing']);
  assert.deepEqual(r[1][1], ['nope'], 'a failure keeps its last lines for reading');
  const dirs = execFileSync('python3', ['research/openai-math/replication.py', '--list-directories'], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(dirs.length, 18);
  assert.ok(dirs.every(d => d.startsWith('preprints/')) && dirs.includes('preprints/The-Mahler-Conjecture-for-General-Convex-Bodies-September-22-2026'));
  const md = execFileSync('python3', ['-c', `import sys; sys.path.insert(0, 'research/openai-math')
import experiments as x
print('\\n'.join(x.replication_lines({'commit': '4eaee87548250b26', 'packages': [{'family': '189', 'id': 'Ramsey', 'status': 'pass', 'seconds': 177.0}, {'family': '087', 'id': 'Mahler', 'status': 'known_defect', 'seconds': 4.0}]})))`], { encoding: 'utf8' });
  assert.match(md, /openai\/math vid commit `4eaee8754825`: 1 av 2 paket godkända, 1 känt fel kvar\./);
  assert.match(md, /\| 087 \| Mahler \| känt fel kvarstår \| 4 s \|/);
});

test('E6: a failing post-check, a timeout and a present manifest stay package failures, and a timeout ends the whole command', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'replication-'));
  const marker = join(repo, 'late-marker');
  await mkdir(join(repo, 'preprints', 'post', 'verification'), { recursive: true });
  await writeFile(join(repo, 'preprints', 'post', 'check.py'), 'print("ALL GOOD")');
  await mkdir(join(repo, 'preprints', 'slow'), { recursive: true });
  // The verifier is a child of bash; it must not outlive the timeout.
  await writeFile(join(repo, 'preprints', 'slow', 'check.py'), `import time, pathlib\ntime.sleep(3)\npathlib.Path(${JSON.stringify(marker)}).write_text("x")`);
  await mkdir(join(repo, 'preprints', 'manifest', 'verification'), { recursive: true });
  await writeFile(join(repo, 'preprints', 'manifest', 'verification', 'SOURCE-MANIFEST.json'), '{}');
  await writeFile(join(repo, 'preprints', 'manifest', 'check.py'), 'import sys; print("SOURCE-MANIFEST.json: checksum mismatch"); sys.exit(1)');
  const r = JSON.parse(execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, 'research/openai-math')
import replication as rp
def boom(work, original): raise FileNotFoundError('RESULTS.json')
rp.KNOWN_DEFECTS['manifest'] = {'absent': 'verification/SOURCE-MANIFEST.json', 'pattern': r'SOURCE-MANIFEST\\.json'}
rows = [rp.run_package(sys.argv[1], ('1', 'post', 'post', 'python3 check.py', [r'ALL GOOD'], boom)),
        rp.run_package(sys.argv[1], ('1', 'slow', 'slow', 'true && python3 check.py', [r'never']), timeout=1),
        rp.run_package(sys.argv[1], ('1', 'manifest', 'manifest', 'python3 check.py', [r'never']))]
print(json.dumps([[x['status'], x['tail']] for x in rows]))`, repo], { encoding: 'utf8' }));
  assert.deepEqual(r[0], ['fail', ['ALL GOOD', 'post-check failed: FileNotFoundError']]);
  assert.equal(r[1][0], 'timeout');
  assert.equal(r[2][0], 'fail', 'with the manifest present the failure is new, not the known defect');
  await new Promise(done => setTimeout(done, 3500));
  assert.equal(await readFile(marker, 'utf8').catch(() => null), null, 'the verifier was ended with its command');
});
