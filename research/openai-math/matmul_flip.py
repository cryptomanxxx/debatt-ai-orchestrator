#!/usr/bin/env python3
"""Small matrix multiplication schemes over GF(2): an exact checker and a flip-graph search.

Experiment E4 in research/openai-math/RAPPORT.md (family 107). A scheme of rank r for the format
<n, m, p> (an n x m matrix times an m x p matrix) is a list of r terms (a, b, c): bit masks of an
n x m, an m x p and a p x n matrix. It is correct when, over GF(2),

    sum_r a_r (x) b_r (x) c_r  =  sum_{i,j,k} e_(i,j) (x) e_(j,k) (x) e_(k,i),

which `check` tests exactly by counting every index triple mod 2. The search is the flip-graph random
walk of Kauers and Moosbauer: start from the standard algorithm (rank n m p), apply random flips

    a (x) b (x) c + a (x) b' (x) c'  =  a (x) (b + b') (x) c + a (x) b' (x) (c + c')

(and the same with the shared factor in the second or third place), drop a term whose factor
becomes zero, merge two terms that share two factors, and when the rank has not fallen for a while
apply a "plus" step that raises it by one to leave a plateau. Every scheme it reports passes `check`.

Standard library only.
"""
import random
from collections import Counter


def matmul_tensor(n, m, p):
    """The set of index triples (a-bit, b-bit, c-bit) of the matrix multiplication tensor."""
    return {(i * m + j, j * p + k, k * n + i) for i in range(n) for j in range(m) for k in range(p)}


def bits(x):
    out, i = [], 0
    while x:
        if x & 1:
            out.append(i)
        x >>= 1
        i += 1
    return out


def check(scheme, n, m, p):
    """True when the scheme computes <n, m, p> exactly over GF(2)."""
    count = Counter()
    for a, b, c in scheme:
        for x in bits(a):
            for y in bits(b):
                for z in bits(c):
                    count[(x, y, z)] ^= 1
    return {t for t, v in count.items() if v} == matmul_tensor(n, m, p)


def standard(n, m, p):
    return [(1 << (i * m + j), 1 << (j * p + k), 1 << (k * n + i)) for i in range(n) for j in range(m) for k in range(p)]


# Strassen's seven products, written for <2, 2, 2> in this file's convention (a: A, b: B, c: C^T).
def strassen():
    A = lambda *e: sum(1 << (i * 2 + j) for i, j in e)
    B = lambda *e: sum(1 << (j * 2 + k) for j, k in e)
    C = lambda *e: sum(1 << (k * 2 + i) for i, k in e)   # c holds C^T: bit (k, i) for entry C[i][k]
    return [
        (A((0, 0), (1, 1)), B((0, 0), (1, 1)), C((0, 0), (1, 1))),
        (A((1, 0), (1, 1)), B((0, 0)), C((1, 0), (1, 1))),
        (A((0, 0)), B((0, 1), (1, 1)), C((0, 1), (1, 1))),
        (A((1, 1)), B((1, 0), (0, 0)), C((0, 0), (1, 0))),
        (A((0, 0), (0, 1)), B((1, 1)), C((0, 0), (0, 1))),
        (A((1, 0), (0, 0)), B((0, 0), (0, 1)), C((1, 1))),
        (A((0, 1), (1, 1)), B((1, 0), (1, 1)), C((0, 0))),
    ]


def search(n, m, p, steps, seed, plateau=20000):
    """Random flip-graph walk from the standard algorithm; returns (best rank, best scheme, steps used)."""
    rng = random.Random(seed)
    terms = standard(n, m, p)
    best = list(terms)
    since = 0
    for step in range(1, steps + 1):
        r = len(terms)
        i = rng.randrange(r)
        axis = rng.randrange(3)
        # Partners sharing the chosen factor with term i.
        partners = [j for j in range(r) if j != i and terms[j][axis] == terms[i][axis]]
        if partners:
            j = rng.choice(partners)
            ti, tj = list(terms[i]), list(terms[j])
            u, v = [x for x in range(3) if x != axis]
            ti[u] ^= tj[u]                 # factor u of i becomes the sum
            tj[v] ^= ti[v]                 # factor v of j absorbs i's factor v
            terms[i], terms[j] = tuple(ti), tuple(tj)
            terms = reduce(terms)
        elif since > plateau and r >= 2:
            # Plus step: a (x) b (x) c = (a + a') (x) b (x) c + a' (x) b (x) c, rank + 1, opens new flips.
            k = rng.randrange(r)
            while k == i:
                k = rng.randrange(r)
            ai, bi, ci = terms[i]
            ak = terms[k][0]
            if ai != ak:
                terms[i] = (ai ^ ak, bi, ci)
                terms.append((ak, bi, ci))
                since = 0
        if len(terms) < len(best):
            best, since = list(terms), 0
        else:
            since += 1
    return len(best), best, steps


def reduce(terms):
    """Drop zero terms and merge terms that share two factors, until nothing changes."""
    changed = True
    while changed:
        changed = False
        terms = [t for t in terms if t[0] and t[1] and t[2]]
        seen = {}
        for idx, (a, b, c) in enumerate(terms):
            for key, other in (((0, a, b), c), ((1, a, c), b), ((2, b, c), a)):
                if key in seen:
                    j = seen[key]
                    ta = list(terms[j])
                    ta[2 - key[0]] ^= other    # the unshared factor of j absorbs this one
                    terms[j] = tuple(ta)
                    terms = terms[:idx] + terms[idx + 1:]
                    changed = True
                    break
                seen[key] = idx
            if changed:
                break
    return terms
