"""Bounded Actions-only adapter for the pinned sparse Rankscreen modules."""
import hashlib
import json
from pathlib import Path
import re
import sys
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[1] / 'vendor/bootloops/rankscreen'
UPSTREAM = '66b680ce742e654cfe86da4f072a69061fe182b1'
PINS = json.loads((ROOT / 'pins.json').read_text())


def load_tool():
    for name, expected in PINS.items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
            raise ValueError('source fingerprint mismatch')
    sys.path.insert(0, str(ROOT))
    from screen import screen_rows
    return screen_rows


def parse_input(data):
    if not isinstance(data, dict) or set(data) != {'rows'}:
        raise ValueError('invalid input')
    raw = data['rows']
    if not isinstance(raw, list) or not 2 <= len(raw) <= 12:
        raise ValueError('invalid rows')
    width = len(raw[0]) if isinstance(raw[0], list) else 0
    if not 2 <= width <= 5:
        raise ValueError('invalid width')
    rows = []
    for row in raw:
        if not isinstance(row, list) or len(row) != width or not all(
            isinstance(v, str) and re.fullmatch(r'-?\d{1,9}', v) for v in row
        ):
            raise ValueError('invalid row')
        rows.append(({i: Fraction(v) for i, v in enumerate(row[:-1]) if int(v)}, Fraction(row[-1])))
    return rows, width - 1


def compute(data):
    rows, ncols = parse_input(data)
    verdict = load_tool()(rows, ncols=ncols, k=3, backend='sparse', nproc=3)
    return {'tool': 'bootloops_rankscreen', 'upstreamCommit': UPSTREAM,
            'sourceSha256': PINS, 'runtime': 'github-actions-python',
            'scope': 'multi_prime_rank_screen', 'factualityChecked': False,
            'inputSha256': hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'receipt': verdict}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError('oversized input')
        print(json.dumps(compute(json.loads(raw))))
    except Exception:
        # Never publish raw exceptions or arbitrary input in runner diagnostics.
        print(json.dumps({'error': 'rankscreen_execution_failed'}))
        sys.exit(1)
