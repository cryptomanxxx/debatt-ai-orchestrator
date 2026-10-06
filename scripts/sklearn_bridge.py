"""Bounded fixed polynomial OLS; never accepts code or caller-selected estimators."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

MANIFEST = json.loads((Path(__file__).resolve().parents[1] / 'research/sklearn-toolchain.json').read_text())


def compute(data):
    if not isinstance(data, dict) or set(data) != {'train', 'validation', 'test'}:
        raise ValueError('invalid input')
    seen = set()
    for key in ['train', 'validation', 'test']:
        rows = data[key]
        if not isinstance(rows, list) or not (6 if key == 'train' else 2) <= len(rows) <= (32 if key == 'train' else 16):
            raise ValueError('invalid row count')
        for row in rows:
            if (not isinstance(row, list) or len(row) != 2 or not all(type(v) is int for v in row)
                    or abs(row[0]) > 16 or abs(row[1]) > 10000 or row[0] in seen):
                raise ValueError('invalid or overlapping points')
            seen.add(row[0])
    versions = {p: importlib.metadata.version(p) for p in MANIFEST['packages']}
    if versions != MANIFEST['packages']:
        raise ValueError('dependency drift')

    import numpy as np
    from sklearn.linear_model import LinearRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import PolynomialFeatures
    from threadpoolctl import threadpool_limits

    train = np.asarray(data['train'], dtype=float)
    validation = np.asarray(data['validation'], dtype=float)
    test = np.asarray(data['test'], dtype=float)
    models = []
    with threadpool_limits(limits=1):
        for degree in [1, 2]:
            pipeline = make_pipeline(PolynomialFeatures(degree=degree, include_bias=False), LinearRegression())
            pipeline.fit(train[:, :1], train[:, 1])
            reg = pipeline.named_steps['linearregression']
            validation_predictions = pipeline.predict(validation[:, :1])
            test_predictions = pipeline.predict(test[:, :1])
            models.append({'degree': degree, 'coefficients': [float(reg.intercept_), *reg.coef_.tolist()],
                           'validationPredictions': validation_predictions.tolist(),
                           'testPredictions': test_predictions.tolist(),
                           'validationMse': float(np.mean((validation_predictions - validation[:, 1])**2)),
                           'testMse': float(np.mean((test_predictions - test[:, 1])**2))})
    selected = 2 if models[1]['validationMse'] < models[0]['validationMse'] - 1e-9 else 1
    result = {'models': models, 'selectedDegree': selected, 'selectedTestMse': models[selected-1]['testMse'],
              'decision': 'prefer_linear' if selected == 1 else 'prefer_quadratic'}
    return {'tool': 'scikit-learn', 'adapterVersion': MANIFEST['adapterVersion'],
            'runtime': 'github-actions-python', 'versions': versions,
            'inputSha256': hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'result': result}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(8193)
        if len(raw) > 8192 or len(sys.argv) != 1:
            raise ValueError('invalid request')
        print(json.dumps(compute(json.loads(raw)), allow_nan=False))
    except Exception:
        print(json.dumps({'error': 'sklearn_tool_execution_failed'}))
        sys.exit(1)
