"""Bounded conjugate Bayesian AR(1) adapter. No caller-provided model or code."""
import importlib.metadata
import json
import math
from pathlib import Path
import re
import sys
import tempfile
import os

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'research/pymc-toolchain.json').read_text())
PRIOR = {'betaMean': [0, 0], 'betaScale': [[100, 0], [0, 1]], 'shape': 3, 'scale': 16}


def compute(data):
    if not isinstance(data, dict) or set(data) != {'train', 'seed'} or not isinstance(data['seed'], str) or not re.fullmatch(r'\d{1,9}', data['seed']):
        raise ValueError('invalid input')
    values = data['train']
    if not isinstance(values, list) or not 64 <= len(values) <= 128 or not all(
        isinstance(v, str) and re.fullmatch(r'-?\d{1,5}(\.\d{1,8})?', v) and abs(float(v)) <= 10000 for v in values
    ):
        raise ValueError('invalid series')
    versions = {p: importlib.metadata.version(p) for p in MANIFEST['packages']}
    if versions != MANIFEST['packages']:
        raise ValueError('dependency drift')
    import numpy as np
    import pymc as pm
    import arviz as az
    from scipy.stats import t
    from scipy.special import gammaln
    train = np.asarray(values, dtype=float)
    if np.ptp(train[:-1]) <= 1e-10:
        raise ValueError('degenerate series')
    x = np.column_stack([np.ones(len(train)-1), train[:-1]])
    y = train[1:]
    precision = np.diag([.01, 1.]) + x.T @ x
    covariance = np.linalg.inv(precision)
    mean = covariance @ x.T @ y
    shape = 3 + len(y)/2
    # Residual form avoids subtracting large, near-equal quadratic forms.
    residual = y-x@mean
    scale = 16 + .5*(residual@residual + mean@np.diag([.01, 1.])@mean)
    df = 2*shape
    phi_scale = math.sqrt(scale/shape*covariance[1, 1])
    interval = list(map(float, t.ppf([.025, .975], df, loc=mean[1], scale=phi_scale)))
    probability = float(t.cdf(mean[1]/phi_scale, df))
    probes = []
    with pm.Model() as model:
        variance = pm.InverseGamma('variance', alpha=3, beta=16)
        beta = pm.MvNormal('beta', mu=np.zeros(2), cov=variance*np.diag([100., 1.]), shape=2)
        pm.Normal('observed', mu=beta[0]+beta[1]*x[:, 1], sigma=pm.math.sqrt(variance), observed=y)
        logp = model.compile_logp(jacobian=False)
        for coefficients, s2 in [([0., 0.], 1.), ([1., .2], 4.), ([-1., -.1], 9.)]:
            b = np.asarray(coefficients)
            expected = 3*math.log(16)-gammaln(3)-4*math.log(s2)-16/s2
            expected += -math.log(2*math.pi)-math.log(s2)-.5*math.log(100)-.5*(b@np.diag([.01, 1.])@b)/s2
            expected += -.5*len(y)*math.log(2*math.pi*s2)-.5*np.sum((y-x@b)**2)/s2
            actual = float(logp({'variance_log__': math.log(s2), 'beta': b}))
            if not math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-7):
                raise ValueError('model density disagreement')
            probes.append({'beta': coefficients, 'variance': s2, 'logDensity': actual})
        sample = pm.sample(draws=1000, tune=1000, chains=4, cores=1, random_seed=int(data['seed']),
                           target_accept=.95, progressbar=False, nuts_sampler='pymc', quiet=True, compile_kwargs={'mode': 'NUMBA'})
    # ArviZ 1.x/PyMC 6 return an xarray DataTree.
    posterior = sample['posterior'].dataset
    statistics = sample['sample_stats'].dataset
    rhat = az.rhat(sample, var_names=['beta', 'variance'])
    bulk = az.ess(sample, var_names=['beta', 'variance'], method='bulk')
    tail = az.ess(sample, var_names=['beta', 'variance'], method='tail')
    flatten = lambda ds: np.concatenate([np.asarray(v).ravel() for v in ds.data_vars.values()])
    max_rhat, min_bulk, min_tail = float(np.max(flatten(rhat))), float(np.min(flatten(bulk))), float(np.min(flatten(tail)))
    divergences = int(np.asarray(statistics['diverging']).sum())
    phi = np.asarray(posterior['beta'])[:, :, 1]
    phi_mcse = float(np.asarray(az.mcse(sample, var_names=['beta'], method='mean')['beta'])[1])
    if not all(math.isfinite(v) for v in [max_rhat, min_bulk, min_tail, phi_mcse]) or max_rhat > 1.01 or min_bulk < 400 or min_tail < 400 or divergences:
        raise ValueError('sampler diagnostics failed')
    mcmc_mean, mcmc_sd, mcmc_probability = float(phi.mean()), float(phi.std(ddof=1)), float(np.mean(phi > 0))
    exact_sd = phi_scale*math.sqrt(df/(df-2))
    if abs(mcmc_mean-mean[1]) > 5*phi_mcse or abs(mcmc_sd/exact_sd-1) > 5*math.sqrt(2/min_bulk) or abs(mcmc_probability-probability) > 5*math.sqrt(probability*(1-probability)/min_bulk)+.005:
        raise ValueError('posterior disagreement')
    result = {'prior': PRIOR, 'trainCount': len(train), 'posteriorMean': list(map(float, mean)),
              'posteriorCovarianceScale': covariance.tolist(), 'posteriorShape': shape, 'posteriorScale': float(scale),
              'phiScale': phi_scale, 'phiInterval95': interval, 'probabilityPositive': probability,
              'decision': 'positive' if interval[0] > 0 else 'negative' if interval[1] < 0 else 'inconclusive',
              'densityProbes': probes, 'mcmc': {'phiMean': mcmc_mean, 'phiSd': mcmc_sd, 'probabilityPositive': mcmc_probability,
              'meanMcse': phi_mcse, 'maximumRhat': max_rhat, 'minimumEssBulk': min_bulk, 'minimumEssTail': min_tail,
              'divergences': divergences, 'chains': 4, 'draws': 1000, 'tune': 1000}}
    import hashlib
    return {'tool': 'pymc', 'adapterVersion': MANIFEST['adapterVersion'], 'runtime': 'github-actions-python',
            'versions': versions, 'inputSha256': hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'result': result}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384 or len(sys.argv) != 1:
            raise ValueError('invalid request')
        with tempfile.TemporaryDirectory(prefix='oraklet-pymc-') as cache:
            os.environ['PYTENSOR_FLAGS'] = 'cxx=,linker=py,compiledir='+cache
            print(json.dumps(compute(json.loads(raw)), allow_nan=False))
    except Exception:
        print(json.dumps({'error': 'pymc_tool_execution_failed'}))
        sys.exit(1)
