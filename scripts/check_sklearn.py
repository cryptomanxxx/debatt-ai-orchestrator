"""Fixed installation checks; no external datasets or model-generated code."""
import importlib.metadata
import json
from pathlib import Path


def check():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'research/sklearn-toolchain.json').read_text())
    lock = (root / 'research/sklearn-requirements.lock').read_text().splitlines()
    if dict(line.split('==') for line in lock) != manifest['packages']:
        raise RuntimeError('sklearn_lock_manifest_mismatch')
    if any(importlib.metadata.version(name) != version
           for name, version in manifest['packages'].items()):
        raise RuntimeError('sklearn_dependency_drift')

    import numpy as np
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from threadpoolctl import threadpool_limits

    with threadpool_limits(limits=1):
        # Known line y=2*x+1; predictions use points excluded from fitting.
        regression = LinearRegression().fit([[-2], [-1], [0], [1], [2]],
                                            [-3, -1, 1, 3, 5])
        if not (np.allclose(regression.coef_, [2], rtol=0, atol=1e-12)
                and np.isclose(regression.intercept_, 1, rtol=0, atol=1e-12)
                and np.allclose(regression.predict([[3], [4]]), [7, 9],
                                rtol=0, atol=1e-12)):
            raise RuntimeError('sklearn_regression_check_failed')
        # Fit preprocessing on training points only, then classify held-out points.
        classification = make_pipeline(StandardScaler(), LogisticRegression(
            solver='lbfgs', random_state=0, max_iter=200))
        classification.fit([[-4], [-3], [-2], [2], [3], [4]], [0, 0, 0, 1, 1, 1])
        if not np.array_equal(classification.predict([[-5], [5]]), [0, 1]):
            raise RuntimeError('sklearn_classification_check_failed')
    print('Scikit-learn locked installation: regression and classification checks passed')


if __name__ == '__main__':
    check()
