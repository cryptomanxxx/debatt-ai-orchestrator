#!/usr/bin/env python3
"""E6: rerun openai/math's own verification packages every week, in throwaway copies.

Experiment E6 in research/openai-math/RAPPORT.md. The packages are the ones the report replicated on
2026-11-04: each runs its documented command (Python standard library, SymPy, NumPy or SciPy) and is
judged by its own success text. The result says, per package, pass, fail, timeout, missing (the
directory is gone at the current commit), or for a known defect whether it still stands.

  python3 replication.py --repo /path/to/openai-math --out reports/openai-math-replication/result.json

The repository only needs the listed preprint directories (a sparse checkout); `directories()` lists
them. A pass shows that the collection's finite computation reproduces, not that a theorem holds.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

TIMEOUT = 900


def _compare_371(work, original):
    """The comparison from the package's verification guide: preserved fields equal, file identities OK."""
    v = work / 'verification'
    current = json.loads((v / 'current-results.json').read_text())
    historical = json.loads((v / 'certificates' / 'RESULTS.json').read_text())
    for key, source in (('adapted_verifier_sha256', 'certificates/exact_verifier.py'),
                        ('original_verifier_sha256', 'certificates/original_exact_certificates.py')):
        if current.get(key) != hashlib.sha256((v / source).read_bytes()).hexdigest():
            return False
        current.pop(key, None)
        historical.pop(key, None)
    for key in ('input_sha256', 'input_bytes', 'input_lines'):
        if key in current:
            return False
        historical.pop(key, None)
    canonical = lambda x: json.dumps(x, sort_keys=True, separators=(',', ':'), allow_nan=False)
    if canonical(current) != canonical(historical):
        return False
    for line in (v / 'certificates' / 'CURRENT-SHA256SUMS').read_text().splitlines():
        if line.strip():
            digest, name = line.split(maxsplit=1)
            if hashlib.sha256((v / 'certificates' / name.strip().lstrip('*')).read_bytes()).hexdigest() != digest:
                return False
    return True


# family, id, directory, command (run with bash in a copy of the directory), success patterns.
PACKAGES = [
    ('189', 'cykel–klick-Ramsey', 'Cycle-clique-Ramsey-numbers-September-25-2026',
     'python3 verification/code/verify.py --output ../out', [r'zero unresolved']),
    ('187', 'Snaky på 21 drag', 'Snaky-in-21-Maker-moves-September-25-2026',
     'python3 -B verification/verify_certificate.py && python3 -B verification/supporting/verify_all.py --output-dir ../out',
     [r'PASS: three distinct literal certificates']),
    ('361', 'harmonisk dimension', 'A-counterexample-to-integer-degree-harmonic-dimension-comparison-September-25-2026',
     'python3 verification/counting-check.py', [r'exact count proves \(3\): True']),
    ('153', 'Bernoulli-faltningar, grad 31', 'Arithmetic-classification-and-non-Pisot-singularity-for-Bernoulli-convolutions-October-3-2026',
     'python3 verification/verify_degree31.py', [r'PASS: all degree-31 finite arithmetic checks passed']),
    ('101', 'isotropa konstanter', 'A-sharp-entropy-bound-and-the-simplex-inequality-for-isotropic-constants-October-5-2026',
     'python3 verification/verify_scalar.py', [r'ALL CHECKS PASSED']),
    ('352', 'Calabi-flödets singularitet', 'A-finite-time-singularity-of-Calabi-flow-on-projective-space-September-24-2026',
     'python3 -B verification/certificate.py && python3 -B verification/arithmetic_allowances.py && python3 -B verification/tail-check.py',
     [r'"all_exact_rational_checks_pass": true', r'checks passed exactly']),
    ('348', 'positivt krökta Einstein-mångfalder', 'Positively-curved-Einstein-four-manifolds-September-23-2026',
     'python3 -B verification/verify.py --check', [r'"all_passed": true']),
    ('348', 'nollplansstelhet', 'Zero-Plane-Rigidity-for-Einstein-Four-Manifolds-October-4-2026',
     'python3 -B verification/verify.py --check', [r'"all_passed": true']),
    ('272', 'sammanflätning utan nyckel', 'Entanglement-with-zero-distillable-secret-key-in-local-dimension-ten-September-27-2026',
     'python3 verification/combinatorics_exact_checks.py > ../c.out && cmp verification/combinatorics_exact_checks.json "$ORIG/verification/combinatorics_exact_checks.json"'
     ' && python3 verification/gadget_exact_check.py > ../g.json && cmp ../g.json "$ORIG/verification/gadget_exact_check.json"'
     ' && python3 verification/exact_certificate.py > ../cert.txt && cmp ../cert.txt "$ORIG/verification/certificate-output.txt" && echo ALL-CMP-OK',
     [r'ALL-CMP-OK']),
    ('067', 'Campana–Peternell', 'The-Campana-Peternell-conjecture-in-dimension-six-September-25-2026',
     'python3 -u verification/verify.py', [r'(?m)^pass$']),
    ('059', 'Zariskis multiplicitet', 'Ambiently-homeomorphic-isolated-hypersurfaces-of-multiplicities-two-and-three-September-24-2026',
     'python3 verification/support/supplied_finite_rank.py && python3 verification/validation/explicit_relation.py'
     ' verification/support/explicit-relation.json ../rel.json && echo REL-OK', [r'REL-OK']),
    ('371', 'Schrödinger-blowup', 'Stable-Self-Similar-Blowup-for-a-Supercritical-Defocusing-Schrodinger-Equation-on-the-Torus-September-24-2026',
     'cd verification && python3 -B certificates/exact_verifier.py > current-results.json && echo VERIFIER-OK', [r'VERIFIER-OK'], _compare_371),
    ('266', 'Fourier-certifikat, Hadamard', 'Exact-Fourier-certificates-for-complex-Hadamard-matrices-of-order-six-September-24-2026',
     'python3 verification/run.py', [r'rank table: 8871 909 897', r'rank table: 46041 3429 2767', r'-613302797399911/6480 179721388988719/6480']),
    ('266', 'opartiska baser, sparad körning', 'The-maximum-number-of-mutually-unbiased-bases-in-dimension-six-September-24-2026',
     'cd verification/saved-run && python3 execution/check_records.py', [r'PASS within numerical consistency scope']),
    ('268', 'Haldane-gap med randfält', 'A-boundary-field-gap-for-the-spin-one-Heisenberg-chain-September-24-2026',
     'mkdir -p o && python3 -B verification/scalar_checks.py o && python3 -B verification/trial_verify.py o'
     ' && (cd o && python3 -B ../verification/thermal_certificate_check.py)', [r'both thermal conclusions certified']),
    ('210', 'Foulkes, sjätte potensen (--check)', 'Foulkes-Conjecture-for-the-Sixth-Symmetric-Power-September-25-2026',
     'python3 -B verification/verify_computations.py --check', [r'(?m)^PASS']),
    ('107', 'matrismultiplikation, indata och rektangulära kontroller', 'Complex-Matrix-Multiplication-Below-2.258-and-Rectangular-Bounds-September-24-2026',
     'python3 -B verification/scripts/check_certificate.py && python3 -B verification/certificates/checks/run_checks.py', [r'"status": "passed"']),
]
# A defect found on 2026-11-04: the documented command fails because the manifest file is missing. It
# still stands only while that file is absent and the failure names it; any other failure is a failure.
KNOWN_DEFECTS = {'The-Mahler-Conjecture-for-General-Convex-Bodies-September-22-2026':
                 {'absent': 'verification/SOURCE-MANIFEST.json', 'pattern': r'No such file or directory: .*SOURCE-MANIFEST\.json'}}
PACKAGES.append(('087', 'Mahler-förmodan', 'The-Mahler-Conjecture-for-General-Convex-Bodies-September-22-2026',
                 'python3 verification/reproduce.py --output ../out', [r'PASS segment-large-tail-audit\.py']))


def directories():
    return sorted({p[2] for p in PACKAGES})


def run_package(repo, package, timeout=TIMEOUT):
    family, name, directory, command, patterns, *post = package
    original = Path(repo) / 'preprints' / directory
    row = {'family': family, 'id': name, 'directory': directory, 'seconds': 0.0}
    if not original.is_dir():
        return {**row, 'status': 'missing', 'tail': []}
    with tempfile.TemporaryDirectory(prefix='openai-math-replication-') as tmp:
        work = Path(tmp) / 'paper'
        shutil.copytree(original, work)
        env = {k: v for k, v in os.environ.items() if k != 'PYTHONOPTIMIZE'}
        env['ORIG'] = str(original.resolve())
        start = time.monotonic()
        # Its own session, so a timeout ends the whole command (bash and the verifiers it started).
        proc = subprocess.Popen(['bash', '-c', command], cwd=work, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, start_new_session=True)
        try:
            output = proc.communicate(timeout=timeout)[0]
            passed = proc.returncode == 0 and all(re.search(p, output) for p in patterns)
            if passed and post:
                # A comparison that cannot even read its inputs is this package's failure, not the run's.
                try:
                    passed = bool(post[0](work, original))
                except Exception as error:   # noqa: BLE001
                    passed, output = False, output + f'\npost-check failed: {type(error).__name__}'
            status = 'pass' if passed else 'fail'
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            output = (proc.communicate()[0] or '') + '\ntimeout'
            status = 'timeout'
        row['seconds'] = round(time.monotonic() - start, 1)
    defect = KNOWN_DEFECTS.get(directory)
    if defect:
        standing = not (original / defect['absent']).exists() and re.search(defect['pattern'], output)
        status = 'defect_fixed' if status == 'pass' else 'known_defect' if status == 'fail' and standing else status
    # Only the last lines of output are kept, for reading a failure; they are the package's own text.
    return {**row, 'status': status, 'tail': [l for l in output.splitlines() if l.strip()][-3:] if status not in ('pass', 'defect_fixed') else []}


def commit_of(repo):
    try:
        return subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--repo', help='checkout of openai/math (the listed preprint directories suffice)')
    p.add_argument('--out')
    p.add_argument('--jobs', type=int, default=4)
    p.add_argument('--list-directories', action='store_true', help='print the preprint directories to check out, one per line')
    a = p.parse_args(argv)
    if a.list_directories:
        print('\n'.join(f'preprints/{d}' for d in directories()))
        return 0
    def safe(pkg):
        # Whatever one package does, the others' results are still written.
        try:
            return run_package(a.repo, pkg)
        except Exception as error:   # noqa: BLE001
            return {'family': pkg[0], 'id': pkg[1], 'directory': pkg[2], 'seconds': 0.0, 'status': 'fail',
                    'tail': [f'replication error: {type(error).__name__}']}
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as pool:
        rows = list(pool.map(safe, PACKAGES))
    result = {'schema': 'oraklet-openai-math-replication-1', 'commit': commit_of(a.repo), 'packages': rows}
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    for r in rows:
        print(f"{r['status']:13s} {r['seconds']:7.1f}s  {r['family']} {r['id']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
