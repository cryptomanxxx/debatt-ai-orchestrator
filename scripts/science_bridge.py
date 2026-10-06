"""Fixed, bounded Actions-only scientific operations. No model-provided code."""
import hashlib
import importlib.util
import importlib.metadata
import json
import math
from pathlib import Path
import re
import sys
from fractions import Fraction as F

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'research/toolchain.json').read_text())


def pinned_module(path):
    source = ROOT / 'vendor/bootloops' / path
    if hashlib.sha256(source.read_bytes()).hexdigest() != MANIFEST['sourceSha256'][path]:
        raise ValueError('source drift')
    spec = importlib.util.spec_from_file_location(path.replace('/', '_').replace('.', '_'), source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def integers(values, minimum, maximum):
    if not isinstance(values, list) or not minimum <= len(values) <= maximum or not all(
        isinstance(v, str) and re.fullmatch(r'-?\d{1,60}', v) for v in values
    ):
        raise ValueError('invalid sequence')
    return [F(v) for v in values]


def annihilator(data):
    if not isinstance(data, dict) or set(data) != {'train', 'holdout'}:
        raise ValueError('invalid input')
    train = integers(data['train'], 20, 32)
    holdout = integers(data['holdout'], 4, 8)
    if not any(train):
        raise ValueError('degenerate series')
    module = pinned_module('annihilator/annihilator.py')
    # Small primes avoid int64 product overflow. No external holdout enters either fit.
    primes = [1000003, 1000033]
    fits = [module.pf_from_series(train, rmax=2, smax=0, nverify=5, mode='auto', p=p) for p in primes]
    if all(f is None for f in fits):
        return {'found': False, 'accepted': False, 'coefficients': None, 'primes': primes,
                'trainCount': len(train), 'holdoutCount': len(holdout), 'checked': 0, 'failed': 0}
    if any(f is None or f[2] is None for f in fits):
        raise ValueError('unverified reconstruction')
    normalized = []
    for order, degree, coeffs, verified in fits:
        if degree != 0 or verified != 5:
            raise ValueError('unexpected reconstruction')
        vector = [coeffs.get((j, 0), F(0)) for j in range(order + 1)]
        vector = [c / vector[-1] for c in vector]
        normalized.append((order, vector))
    if normalized[0] != normalized[1]:
        raise ValueError('prime disagreement')
    order, coefficients = normalized[0]
    values = train + holdout
    residuals = [sum(coefficients[j] * values[n+j] for j in range(order+1))
                 for n in range(len(train)-order, len(values)-order)]
    failed = sum(v != 0 for v in residuals)
    return {'found': True, 'accepted': failed == 0, 'order': order,
            'coefficients': [str(c) for c in coefficients], 'primes': primes,
            'trainCount': len(train), 'holdoutCount': len(holdout),
            'checked': len(residuals), 'failed': failed}


def mixalot(data):
    if not isinstance(data, dict) or set(data) != {'counts'}:
        raise ValueError('invalid input')
    counts = data['counts']
    if not isinstance(counts, list) or len(counts) != 2 or not all(
        type(v) is int and 0 <= v <= 40 for v in counts
    ) or not 4 <= sum(counts) <= 40:
        raise ValueError('invalid counts')
    p0 = [F(1,5), F(4,5)]
    p1 = [F(4,5), F(1,5)]
    primary = pinned_module('mixalot/frozen_comp_v1.py')
    secondary = pinned_module('mixalot/frozen_comp_blind.py')
    z0 = primary.evidence([p0], [F(1)], counts)
    z1 = primary.evidence([p0, p1], [F(1), F(1)], counts)
    if z0 != secondary.evidence_blind([p0], [F(1)], counts) or z1 != secondary.evidence_blind([p0,p1], [F(1),F(1)], counts):
        raise ValueError('evidence disagreement')
    bf = z1 / z0
    decision = 'supports_h1' if bf >= 10 else 'supports_h0' if bf <= F(1,10) else 'inconclusive'
    return {'evidenceH0': str(z0), 'evidenceH1': str(z1), 'bayesFactor10': str(bf),
            'posteriorH1': str(bf/(1+bf)), 'decision': decision,
            'convention': 'sequence_evidence', 'independentRouteMatched': True}


def series(values, minimum, maximum):
    if not isinstance(values, list) or not minimum <= len(values) <= maximum or not all(
        isinstance(v, str) and re.fullmatch(r'-?\d{1,5}(\.\d{1,8})?', v) and abs(float(v)) <= 10000 for v in values
    ):
        raise ValueError('invalid series')
    return [float(v) for v in values]


def statsmodels(data):
    if not isinstance(data, dict) or set(data) != {'train', 'holdout'}:
        raise ValueError('invalid input')
    train = series(data['train'], 64, 128)
    holdout = series(data['holdout'], 4, 16)
    if max(train[:-1])-min(train[:-1]) <= 1e-10:
        raise ValueError('degenerate series')
    from statsmodels.tsa.ar_model import AutoReg
    from scipy.stats import linregress
    import numpy as np
    fitted = AutoReg(train, lags=1, trend='c').fit(use_t=True)
    # Independent fitting code in SciPy; the same statistical assumptions still apply.
    oracle = linregress(train[:-1], train[1:])
    intercept, phi = map(float, fitted.params)
    if not all(math.isclose(a,b,rel_tol=1e-8,abs_tol=1e-10) for a,b in [
        (phi,oracle.slope), (intercept,oracle.intercept),
        (float(fitted.bse[1]),oracle.stderr), (float(fitted.pvalues[1]),oracle.pvalue)
    ]):
        raise ValueError('independent regression disagreement')
    predicted = [float(v) for v in fitted.predict(start=len(train), end=len(train)+len(holdout)-1, dynamic=False)]
    expected = []; value = train[-1]
    for _ in holdout:
        value = intercept + phi * value
        expected.append(value)
    if not np.allclose(predicted, expected, rtol=1e-9, atol=1e-10):
        raise ValueError('forecast disagreement')
    pvalue = float(fitted.pvalues[1])
    output = {'intercept': intercept, 'phi': phi, 'standardError': float(fitted.bse[1]),
              'tStatistic': float(fitted.tvalues[1]), 'pvalue': pvalue,
              'confidenceInterval95': list(map(float, fitted.conf_int(alpha=.05)[1])),
              'alpha': .05, 'decision': 'reject_h0' if pvalue < .05 else 'do_not_reject_h0',
              'dfResidual': int(fitted.df_resid), 'forecast': predicted,
              'holdoutRmse': float(np.sqrt(np.mean((np.array(holdout)-predicted)**2))),
              'persistenceRmse': float(np.sqrt(np.mean((np.array(holdout)-train[-1])**2))),
              'independentRouteMatched': True}
    if not all(math.isfinite(output[key]) for key in ['intercept','phi','standardError','tStatistic','pvalue','holdoutRmse','persistenceRmse']) or output['standardError'] <= 0:
        raise ValueError('degenerate regression')
    return output


OPERATIONS = {'annihilator': annihilator, 'mixalot': mixalot, 'statsmodels': statsmodels}


def compute(tool, data):
    if tool not in OPERATIONS:
        raise ValueError('unknown operation')
    versions = {p: importlib.metadata.version(p) for p in MANIFEST['packages']}
    if versions != MANIFEST['packages']:
        raise ValueError('dependency drift')
    result = OPERATIONS[tool](data)
    sources = {p: sha for p,sha in MANIFEST['sourceSha256'].items() if p.startswith(tool+'/')}
    return {'tool': tool, 'adapterVersion': MANIFEST['adapterVersion'], 'runtime': 'github-actions-python',
            'upstreamCommit': MANIFEST['upstreamCommit'] if tool != 'statsmodels' else None,
            'sourceSha256': sources, 'versions': versions, 'factualityChecked': False,
            'inputSha256': hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'result': result}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384 or len(sys.argv) != 2:
            raise ValueError('invalid request')
        print(json.dumps(compute(sys.argv[1], json.loads(raw)), allow_nan=False))
    except Exception:
        print(json.dumps({'error': 'science_tool_execution_failed'}))
        sys.exit(1)
