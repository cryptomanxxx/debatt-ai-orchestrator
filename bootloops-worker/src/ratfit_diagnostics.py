"""Fixed-fixture stages; CPU time is measured by Cloudflare, not Python timers."""
import json
from ratfit_core import compute, validate

STAGES = frozenset(['transport', 'json', 'validate', 'fit', 'full'])
FIXTURE = {'banked': [['0', '1/2'], ['1', '2/3'], ['2', '3/4'], ['3', '4/5'],
                      ['6', '7/8'], ['7', '8/9']], 'holdout': [['4', '5/6'], ['5', '6/7']]}


def diagnose(stage, raw, tool):
    if stage not in STAGES:
        raise ValueError('Unknown diagnostic stage')
    if stage != 'transport':
        data = json.loads(raw)
        if data != FIXTURE:
            raise ValueError('Only the fixed diagnostic fixture is allowed')
        if stage == 'full':
            if compute(data, tool) != dict(accepted=True, depth=3, checked=2, failed=0):
                raise ValueError('Diagnostic control failed')
        elif stage in ('validate', 'fit'):
            rows = validate(data)
            if stage == 'fit':
                xs, ys = zip(*rows['banked'])
                cf = tool.fit(xs, ys, max_fit=min(8, len(xs)), probe=0)
                if cf is None or cf.depth != 3:
                    raise ValueError('Diagnostic fit failed')
    return dict(diagnostic=True, stage=stage, fixture='rational-v1')
