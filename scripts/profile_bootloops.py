"""Native development profile using public fixtures, never production requests.

These timings are host Python timings, NOT Cloudflare CPU-budget measurements.
"""
import argparse
import cProfile
import pstats
import timeit
from bootloops_core import compute, load_tool, validate

DATA = {'banked': [['0', '1/2'], ['1', '2/3'], ['2', '3/4'], ['3', '4/5'],
                   ['6', '7/8'], ['7', '8/9']], 'holdout': [['4', '5/6'], ['5', '6/7']]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repeat', type=int, default=1000)
    args = parser.parse_args()
    if not 1 <= args.repeat <= 10000:
        parser.error('--repeat must be between 1 and 10000')
    tool = load_tool()
    rows = validate(DATA)
    xs, ys = zip(*rows['banked'])
    cf = tool.fit(xs, ys, max_fit=min(8, len(xs)), probe=0)
    expected = dict(accepted=True, depth=3, checked=2, failed=0)
    assert compute(DATA, tool) == expected
    assert compute({**DATA, 'holdout': [['4', '0'], ['5', '6/7']]}, tool)['failed'] == 1
    print('Native Python only; inspect Cloudflare Observability for deployed CPU time.')
    stages = {'validate': lambda: validate(DATA),
              'fit / upstream default probe': lambda: tool.fit(xs, ys, max_fit=min(8, len(xs))),
              'fit / probe=0 (full validation)': lambda: tool.fit(xs, ys, max_fit=min(8, len(xs)), probe=0),
              'holdout gate': lambda: tool.gate(cf, rows['holdout']),
              'complete compute': lambda: compute(DATA, tool)}
    for name, action in stages.items():
        timings = timeit.repeat(action, number=args.repeat, repeat=3)
        print(f'{name}: best {min(timings) / args.repeat * 1e6:.1f} microseconds/call')
    profiler = cProfile.Profile()
    profiler.enable()
    for _ in range(args.repeat):
        compute(DATA, tool)
    profiler.disable()
    pstats.Stats(profiler).strip_dirs().sort_stats('cumulative').print_stats(12)


if __name__ == '__main__':
    main()
