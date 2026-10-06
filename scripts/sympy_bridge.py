"""Bounded rational quadratic solving; no expression parser or caller code."""
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import re
import sys
from fractions import Fraction

MANIFEST = json.loads((Path(__file__).resolve().parents[1] / 'research/sympy-toolchain.json').read_text())


def compute(data):
    if not isinstance(data, dict) or set(data) != {'coefficients', 'candidates'}:
        raise ValueError('invalid input')
    coefficients, candidates = data['coefficients'], data['candidates']
    if not isinstance(coefficients, list) or len(coefficients) != 3 or not all(
        isinstance(v, str) and re.fullmatch(r'-?(0|[1-9][0-9]{0,4})', v) and abs(int(v)) <= 10000 for v in coefficients
    ):
        raise ValueError('invalid coefficients')
    if not isinstance(candidates, list) or len(candidates) > 2 or not all(
        isinstance(v, str) and re.fullmatch(r'-?(0|[1-9][0-9]{0,5})(/[1-9][0-9]{0,5})?', v) for v in candidates
    ):
        raise ValueError('invalid candidates')
    proposed = [Fraction(v) for v in candidates]
    if len(set(proposed)) != len(proposed) or any(str(v) != raw for v, raw in zip(proposed, candidates)):
        raise ValueError('noncanonical candidates')
    a, b, c = map(int, coefficients)
    discriminant = b*b-4*a*c
    if a == 0 or (discriminant >= 0 and math.isqrt(discriminant)**2 != discriminant):
        raise ValueError('unsupported polynomial')
    versions = {p: importlib.metadata.version(p) for p in MANIFEST['packages']}
    if versions != MANIFEST['packages']:
        raise ValueError('dependency drift')
    import sympy as sp
    x = sp.Symbol('x')
    expression = a*x*x+b*x+c
    solutions = sp.solveset(expression, x, domain=sp.S.Reals)
    if solutions != sp.S.EmptySet and not isinstance(solutions, sp.FiniteSet):
        raise ValueError('unsupported result')
    roots = [str(v) for v in sorted(solutions)]
    if any(sp.expand(expression.subs(x, v)) != 0 for v in solutions):
        raise ValueError('root substitution failed')
    result = {'roots': roots, 'discriminant': str(discriminant), 'accepted': set(candidates) == set(roots),
              'distinctRootCount': len(roots), 'decision': 'real_solutions' if roots else 'no_real_solutions'}
    return {'tool': 'sympy', 'adapterVersion': MANIFEST['adapterVersion'], 'runtime': 'github-actions-python',
            'versions': versions, 'inputSha256': hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'result': result}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(4097)
        if len(raw) > 4096 or len(sys.argv) != 1:
            raise ValueError('invalid request')
        print(json.dumps(compute(json.loads(raw)), allow_nan=False))
    except Exception:
        print(json.dumps({'error': 'sympy_tool_execution_failed'}))
        sys.exit(1)
