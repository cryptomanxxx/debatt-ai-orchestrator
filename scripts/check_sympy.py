"""Fixed installation checks; no user expressions or executable model output."""
import importlib.metadata
import json
from pathlib import Path


def check():
    manifest = json.loads((Path(__file__).resolve().parents[1]
                           / 'research/sympy-toolchain.json').read_text())
    lock = (Path(__file__).resolve().parents[1]
            / 'research/sympy-requirements.lock').read_text().splitlines()
    if dict(line.split('==') for line in lock) != manifest['packages']:
        raise RuntimeError('sympy_lock_manifest_mismatch')
    if any(importlib.metadata.version(name) != version
           for name, version in manifest['packages'].items()):
        raise RuntimeError('sympy_dependency_drift')
    import sympy as sp
    x = sp.Symbol('x')
    roots = sp.solveset(x**2 - 5*x + 6, x, domain=sp.S.Reals)
    if roots != sp.FiniteSet(2, 3) or any(root**2 - 5*root + 6 != 0 for root in roots):
        raise RuntimeError('sympy_equation_check_failed')
    expression = x**3 + sp.Rational(1, 3)*x
    if sp.diff(expression, x) != 3*x**2 + sp.Rational(1, 3):
        raise RuntimeError('sympy_derivative_check_failed')
    if sp.integrate(sp.diff(expression, x), x) != expression:
        raise RuntimeError('sympy_integral_check_failed')
    print('SymPy locked installation: equation, exact derivative and integral checks passed')


if __name__ == '__main__':
    check()
