"""Fixed synthetic identification/estimation checks; no user graphs or code."""
import importlib.metadata
import itertools
import json
import logging
from pathlib import Path


def check():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'research/dowhy-toolchain.json').read_text())
    lock = (root / 'research/dowhy-requirements.lock').read_text().splitlines()
    if dict(line.split('==') for line in lock) != manifest['packages']:
        raise RuntimeError('dowhy_lock_manifest_mismatch')
    if any(importlib.metadata.version(name) != version
           for name, version in manifest['packages'].items()):
        raise RuntimeError('dowhy_dependency_drift')

    import networkx as nx
    import numpy as np
    import pandas as pd
    from dowhy import CausalModel
    from threadpoolctl import threadpool_limits

    logging.getLogger('dowhy').setLevel(logging.ERROR)
    graph = nx.DiGraph([('z', 't'), ('z', 'y'), ('t', 'y')])
    with threadpool_limits(limits=1):
        for effect in [3, 0]:
            # Balanced factorial: u is independent of observed confounder z.
            data = pd.DataFrame([{'z': z, 't': z + u, 'y': effect*(z + u) + 2*z}
                                 for z, u in itertools.product([-2, -1, 0, 1, 2], repeat=2)])
            model = CausalModel(data=data, treatment='t', outcome='y', graph=graph)
            identified = model.identify_effect(proceed_when_unidentifiable=False)
            if set(identified.get_backdoor_variables()) != {'z'}:
                raise RuntimeError('dowhy_identification_check_failed')
            estimated = model.estimate_effect(identified, method_name='backdoor.linear_regression',
                                             control_value=0, treatment_value=1,
                                             test_significance=False, confidence_intervals=False)
            if not np.isclose(estimated.value, effect, rtol=0, atol=1e-10):
                raise RuntimeError('dowhy_adjusted_effect_check_failed')
            # Omitting z produces bias +1 in this exact synthetic design.
            naive = np.linalg.lstsq(np.column_stack([np.ones(len(data)), data['t']]),
                                   data['y'].to_numpy(), rcond=None)[0][1]
            if not np.isclose(naive, effect + 1, rtol=0, atol=1e-10):
                raise RuntimeError('dowhy_confounding_control_failed')
    print('DoWhy locked installation: backdoor identification, known effect, null and confounding checks passed')


if __name__ == '__main__':
    check()
