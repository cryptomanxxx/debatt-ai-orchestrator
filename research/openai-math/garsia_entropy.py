#!/usr/bin/env python3
"""Garsia entropy and dimension of an unbiased Bernoulli convolution, by exact enumeration.

Pilot for experiment E1 in research/openai-math/RAPPORT.md. For an algebraic integer
lambda in (0, 1) with monic integer minimal polynomial, every sum sum_{k<n} e_k lambda^k
(e_k = -1 or +1) is kept exactly as an integer coefficient vector modulo the minimal
polynomial, so two sign sequences give the same point exactly when their vectors agree.

The entropy-rate dimension formula (openai/math family 148; for algebraic lambda already
known from Varju's work) gives dim = min(1, h / chi), with h the entropy rate per step in
nats and chi = log(1/lambda). The script prints the finite-n estimate h ~ H_n - H_{n-1}.

  python3 garsia_entropy.py golden 28    # calibration: expect 0.995713 (Alexander-Zagier)
  python3 garsia_entropy.py salem4 24    # 1/tau, tau the smallest quartic Salem number

Standard library only. Memory grows with the number of distinct sums (about 5 million at
salem4, n = 24); larger n needs a compiled implementation.
"""
import math
import sys
from collections import defaultdict

# name: (monic minimal polynomial, highest degree first; lambda as the root in (0, 1))
CASES = {
    'golden': [1, 1, -1],             # x^2 + x - 1, lambda = (sqrt 5 - 1) / 2
    'salem4': [1, -1, -1, -1, 1],     # x^4 - x^3 - x^2 - x + 1, lambda = 1 / 1.72208...
}


def root_in_unit_interval(poly):
    """The unique root in (0, 1), by bisection on a sign change (both cases have one)."""
    f = lambda x: sum(c * x ** (len(poly) - 1 - i) for i, c in enumerate(poly))
    lo, hi = 1e-9, 1 - 1e-9
    assert f(lo) * f(hi) < 0, 'no sign change in (0, 1)'
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def entropy_profile(poly, n_max):
    """Yield (n, distinct sums, H_n) for n = 1 .. n_max, H_n the Shannon entropy in nats."""
    d = len(poly) - 1
    low = list(reversed(poly[1:]))  # x^d = -(low[0] + low[1] x + ... + low[d-1] x^(d-1))

    def times_x(v):
        top = v[-1]
        shifted = (0,) + v[:-1]
        return tuple(shifted[i] - top * low[i] for i in range(d))

    power = (1,) + (0,) * (d - 1)
    dist = {(0,) * d: 1}
    for n in range(1, n_max + 1):
        new = defaultdict(int)
        for v, c in dist.items():
            new[tuple(a + b for a, b in zip(v, power))] += c
            new[tuple(a - b for a, b in zip(v, power))] += c
        dist, power = new, times_x(power)
        total = 2 ** n
        yield n, len(dist), -sum(c / total * math.log(c / total) for c in dist.values())


def main(argv):
    name = argv[1] if len(argv) > 1 else 'golden'
    n_max = int(argv[2]) if len(argv) > 2 else 24
    poly = CASES[name]
    lam = root_in_unit_interval(poly)
    chi = math.log(1 / lam)
    print(f'{name}: lambda = {lam:.12f}, chi = log(1/lambda) = {chi:.6f}')
    previous = 0.0
    for n, distinct, H in entropy_profile(poly, n_max):
        dH = H - previous
        previous = H
        if n > n_max - 6:
            print(f'n={n:2d} distinct={distinct:9d} h~dH={dH:.6f} h/chi={dH / chi:.6f} dim~{min(1.0, dH / chi):.6f}')


if __name__ == '__main__':
    main(sys.argv)
