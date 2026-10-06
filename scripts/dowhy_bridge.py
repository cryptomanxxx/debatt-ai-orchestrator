"""Fixed observed-confounder DAG and linear backdoor estimator; no caller code."""
import hashlib
import importlib.metadata
import json
import logging
from pathlib import Path
import sys

MANIFEST = json.loads((Path(__file__).resolve().parents[1] / 'research/dowhy-toolchain.json').read_text())


def compute(data):
    if not isinstance(data, dict) or set(data) != {'rows'} or not isinstance(data['rows'], list) or not 25 <= len(data['rows']) <= 125:
        raise ValueError('invalid input')
    for row in data['rows']:
        if (not isinstance(row, list) or len(row) != 3 or not all(type(v) is int for v in row)
                or abs(row[0]) > 16 or abs(row[1]) > 32 or abs(row[2]) > 10000):
            raise ValueError('invalid points')
    rows = data['rows']
    n = len(rows)
    sums = [sum(row[i] for row in rows) for i in range(3)]
    def cov(i, j):
        return n*sum(row[i]*row[j] for row in rows)-sums[i]*sums[j]
    if cov(0, 0) <= 0 or cov(1, 1) <= 0 or cov(0, 0)*cov(1, 1)-cov(0, 1)**2 <= 0:
        raise ValueError('rank-deficient design')
    versions = {p: importlib.metadata.version(p) for p in MANIFEST['packages']}
    if versions != MANIFEST['packages']:
        raise ValueError('dependency drift')

    import networkx as nx
    import numpy as np
    import pandas as pd
    from dowhy import CausalModel
    from threadpoolctl import threadpool_limits
    logging.getLogger('dowhy').setLevel(logging.ERROR)
    frame = pd.DataFrame(rows, columns=['z', 't', 'y'])
    graph = nx.DiGraph([('z', 't'), ('z', 'y'), ('t', 'y')])
    with threadpool_limits(limits=1):
        model = CausalModel(data=frame, treatment='t', outcome='y', graph=graph)
        identified = model.identify_effect(proceed_when_unidentifiable=False)
        adjustment = sorted(identified.get_backdoor_variables())
        if adjustment != ['z']:
            raise ValueError('wrong adjustment')
        estimate = model.estimate_effect(identified, method_name='backdoor.linear_regression',
                                         control_value=0, treatment_value=1, test_significance=False,
                                         confidence_intervals=False)
        fitted = estimate.estimator.model
        coefficients = fitted.params.to_list()
        if len(coefficients) != 3:
            raise ValueError('wrong coefficient count')
        naive = np.linalg.lstsq(np.column_stack([np.ones(n), frame['t']]), frame['y'].to_numpy(), rcond=None)[0][1]
        effect = float(estimate.value)
        residual_mse = float(np.mean(np.asarray(fitted.resid)**2))
    decision = 'positive' if effect > 1e-9 else 'negative' if effect < -1e-9 else 'null_effect'
    result = {'adjustmentVariables': adjustment, 'coefficients': [float(v) for v in coefficients],
              'effect': effect, 'naiveEffect': float(naive), 'residualMse': residual_mse,
              'decision': decision, 'rowCount': n}
    return {'tool': 'dowhy', 'adapterVersion': MANIFEST['adapterVersion'],
            'runtime': 'github-actions-python-isolated', 'versions': versions,
            'inputSha256': hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'result': result}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(8193)
        if len(raw) > 8192 or len(sys.argv) != 1:
            raise ValueError('invalid request')
        print(json.dumps(compute(json.loads(raw)), allow_nan=False))
    except Exception:
        print(json.dumps({'error': 'dowhy_tool_execution_failed'}))
        sys.exit(1)
