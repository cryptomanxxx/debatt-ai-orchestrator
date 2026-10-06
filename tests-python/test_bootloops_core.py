"""Compare the optimized bridge with the original parser and upstream defaults."""
import random
import re
import sys
import unittest
from fractions import Fraction
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from bootloops_core import compute, load_tool, parse_rational, validate


def original_validate(data):
    if not isinstance(data, dict) or set(data) != {'banked', 'holdout'}:
        raise ValueError('Invalid input')
    seen, result = set(), {}
    for name, low, high in [('banked', 4, 12), ('holdout', 2, 8)]:
        rows = data[name]
        if not isinstance(rows, list) or not low <= len(rows) <= high:
            raise ValueError('Invalid row count')
        out = []
        for row in rows:
            if not isinstance(row, list) or len(row) != 2:
                raise ValueError('Invalid row')
            if any(not isinstance(v, str) or re.fullmatch(
                    r'-?\d{1,24}(?:/[1-9]\d{0,23})?', v, flags=re.ASCII) is None for v in row):
                raise ValueError('Exact rational strings required')
            x, y = map(Fraction, row)
            if x in seen:
                raise ValueError('Duplicate or overlapping sample point')
            seen.add(x)
            out.append((x, y))
        result[name] = out
    return result


def original_compute(data, tool):
    rows = original_validate(data)
    xs, ys = zip(*rows['banked'])
    cf = tool.fit(xs, ys, max_fit=min(8, len(xs)))
    if cf is None:
        return dict(accepted=False, depth=None, checked=0, failed=0)
    report = tool.gate(cf, rows['holdout'])
    return dict(accepted=report['fail'] == 0, depth=cf.depth,
                checked=len(rows['holdout']), failed=report['fail'])


def samples(function, xs=None, holdout=None):
    xs = xs if xs is not None else [0, 1, 2, 3, 6, 7]
    holdout = holdout if holdout is not None else [4, 5]
    return {name: [[str(x), str(function(Fraction(x)))] for x in points]
            for name, points in [('banked', xs), ('holdout', holdout)]}


class BridgeParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tool = load_tool()

    def assert_parity(self, data):
        expected = original_compute(data, self.tool)
        self.assertEqual(compute(data, self.tool), expected)

    def test_parser_preserves_grammar_and_normalization(self):
        valid = ['0', '-0', '-0/2', '001/2', '-12/24', '9' * 24,
                 '1/' + '9' * 24, '-' + '9' * 24 + '/' + '9' * 24]
        invalid = ['', '+1', ' 1', '1 ', '1\n', '1.0', '1/0', '1/-2',
                   '1/02', '1/2/3', '١', '１', '1_000', '1e3', 'NaN',
                   '9' * 25, '1/' + '9' * 25, 1, 0.5, None, True]
        for value in valid:
            with self.subTest(value=value):
                self.assertEqual(parse_rational(value), Fraction(value))
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_rational(value)

    def test_validation_limits_and_overlap_are_unchanged(self):
        good = samples(lambda x: (x + 1) / (x + 2))
        self.assertEqual(validate(good), original_validate(good))
        bad = [None, [], {**good, 'extra': []}, {'banked': good['banked']},
               {**good, 'banked': good['banked'][:3]},
               {**good, 'banked': good['banked'] * 3},
               {**good, 'holdout': good['holdout'][:1]},
               {**good, 'holdout': good['holdout'] * 5},
               {**good, 'holdout': [['0/2', '1'], ['5', '1']]},
               {**good, 'holdout': [['4', '1'], ['8/2', '1']]},
               {**good, 'holdout': [['4'], ['5', '1']]},
               {**good, 'holdout': [[4, '1'], ['5', '1']]}]
        for data in bad:
            with self.subTest(data=data):
                for validator in [validate, original_validate]:
                    with self.assertRaises(ValueError):
                        validator(data)

    def test_fit_and_rejections_match_original_across_families(self):
        rng = random.Random(20261006)
        cases = [samples(lambda x: Fraction(7, 3)), samples(lambda x: x),
                 samples(lambda x: x * x, [-3, -2, -1, 0, 1, 2], [3, 4]),
                 samples(lambda x: (x + 1) / (x + 2))]
        for _ in range(64):
            a, b, c = [rng.randint(-5, 5) for _ in range(3)]
            d = rng.randint(1, 5)
            xs = list(range(12))
            rng.shuffle(xs)
            size = rng.choice([4, 6, 8, 12])
            cases.append(samples(lambda x: (a * x * x + b * x + c) / (x * x + d),
                                 xs[:size], list(range(13, 13 + rng.choice([2, 4, 8])))))
        # A true pole at a holdout point must remain a rejection.
        pole = samples(lambda x: 1 / (x - 4), holdout=[5, 8])
        pole['holdout'][0] = ['4', '0']
        cases.append(pole)
        for data in cases:
            with self.subTest(banked=data['banked']):
                self.assert_parity(data)
                corrupt = {**data, 'holdout': [[x, str(Fraction(y) + 1)]
                                              for x, y in data['holdout']]}
                self.assert_parity(corrupt)
                self.assertFalse(compute(corrupt, self.tool)['accepted'])
                damaged = {**data, 'banked': [row[:] for row in data['banked']]}
                damaged['banked'][-1][1] = str(Fraction(damaged['banked'][-1][1]) + 1)
                self.assert_parity(damaged)

    def test_redundant_evaluations_are_removed(self):
        data = samples(lambda x: (x + 1) / (x + 2))
        original_call = self.tool.ThieleCF.__call__
        calls = []

        def counted(cf, x):
            calls.append(x)
            return original_call(cf, x)

        self.tool.ThieleCF.__call__ = counted
        try:
            expected = original_compute(data, self.tool)
            before = len(calls)
            calls.clear()
            self.assertEqual(compute(data, self.tool), expected)
            self.assertLess(len(calls), before)
            self.assertEqual(expected, dict(accepted=True, depth=3, checked=2, failed=0))
        finally:
            self.tool.ThieleCF.__call__ = original_call


if __name__ == '__main__':
    unittest.main()
