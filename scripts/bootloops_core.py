"""Restricted JSON bridge to the pinned upstream Ratfit module; no user code."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
from fractions import Fraction

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'vendor/bootloops/thiele_gate.py'
EXPECTED_SHA256 = '091596dcda3f873118a48340c4c6787b3acd8f316780cd0787644a05876a1913'


def load_tool():
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SHA256:
        raise ValueError('BootLoops source integrity failure')
    spec = importlib.util.spec_from_file_location('bootloops_thiele_gate', SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate(data):
    if not isinstance(data, dict) or set(data) != {'banked', 'holdout'}:
        raise ValueError('Invalid input')
    seen = set()
    result = {}
    for name, low, high in [('banked', 4, 12), ('holdout', 2, 8)]:
        rows = data[name]
        if not isinstance(rows, list) or not low <= len(rows) <= high:
            raise ValueError('Invalid row count')
        out = []
        for row in rows:
            if not isinstance(row, list) or len(row) != 2:
                raise ValueError('Invalid row')
            if any(not isinstance(v, str) or re.fullmatch(r'-?\d{1,24}(?:/[1-9]\d{0,23})?', v, flags=re.ASCII) is None for v in row):
                raise ValueError('Exact rational strings required')
            x, y = map(Fraction, row)
            if x in seen:
                raise ValueError('Duplicate or overlapping sample point')
            seen.add(x)
            out.append((x, y))
        result[name] = out
    return result


def compute(data, tool=None):
    rows = validate(data)
    tool = tool or load_tool()
    xs, ys = zip(*rows['banked'])
    cf = tool.fit(xs, ys, max_fit=min(8, len(xs)))
    if cf is None:
        return dict(accepted=False, depth=None, checked=0, failed=0)
    report = tool.gate(cf, rows['holdout'])
    return dict(accepted=report['fail'] == 0, depth=cf.depth,
                checked=len(rows['holdout']), failed=report['fail'])

