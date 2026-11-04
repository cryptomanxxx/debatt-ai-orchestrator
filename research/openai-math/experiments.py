#!/usr/bin/env python3
"""Weekly computational experiments E1-E4 and the E6 replication report, from research/openai-math/RAPPORT.md.

No model calls. Each week runs, per experiment, its calibration cases (known answers) and one new
case from a fixed list, chosen by the ISO week. Every new case carries a prediction registered in
this file (PREDICTIONS) before any run. The outcome is a number with a fixed decision rule; it is a
numerical estimate, not a proof, except where the rule says rigorous.

  python3 experiments.py --date 2026-11-09 --out reports/openai-math-experiments --ai-bus ai-bus
  python3 experiments.py --index ai-bus      # rebuild ai-bus/berakningar/README.md only

E1 Garsia entropy of Bernoulli convolutions (families 148, 153): exact enumeration in Z[lambda].
E2 Reconstruction thresholds for the q-state Potts channel on d-ary trees (family 229): population
   dynamics of belief propagation, started from perfect information.
E3 Spectral gap of spin-1 bilinear-biquadratic rings (family 268): exact diagonalisation.
E4 Small matrix multiplication schemes over GF(2) (family 107): flip-graph search, exact check.
E6 The replication of openai/math's own verification packages (replication.py), read with --replication.
"""
import argparse
import datetime
import json
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from garsia_entropy import entropy_profile, root_in_unit_interval  # noqa: E402
import matmul_flip  # noqa: E402

SCHEMA = 'oraklet-openai-math-experiments-1'

# ---------------------------------------------------------------- E1
# Monic minimal polynomials (highest degree first) of algebraic integers lambda in (0, 1), each with
# a single root there. n_max bounds the enumeration's memory.
E1_CALIBRATION = [{'id': 'golden', 'name': 'gyllene snittet, 1/phi', 'poly': [1, 1, -1], 'n_max': 24, 'known': 0.995713}]
E1_CASES = [
    {'id': 'salem4', 'name': '1/tau, tau = 1,72208 (kvartiskt Salem-tal)', 'poly': [1, -1, -1, -1, 1], 'n_max': 22, 'kind': 'Salem'},
    {'id': 'tribonacci', 'name': '1/tau, tau = 1,83929 (tribonacci, Pisot)', 'poly': [1, 1, 1, -1], 'n_max': 22, 'kind': 'Pisot'},
    {'id': 'plastic', 'name': '1/tau, tau = 1,32472 (plastiska talet, Pisot)', 'poly': [1, 1, 0, -1], 'n_max': 22, 'kind': 'Pisot'},
    {'id': 'salem4b', 'name': '1/tau, tau = 1,88320 (kvartiskt Salem-tal)', 'poly': [1, -2, 1, -2, 1], 'n_max': 22, 'kind': 'Salem'},
    {'id': 'lehmer', 'name': '1/tau, tau = 1,17628 (Lehmers tal, Salem)', 'poly': [1, 1, 0, -1, -1, -1, -1, -1, 0, 1, 1], 'n_max': 18, 'kind': 'Salem'},
]


def e1_case(case):
    lam = root_in_unit_interval(case['poly'])
    chi = math.log(1 / lam)
    rows, previous = [], 0.0
    for n, distinct, H in entropy_profile(case['poly'], case['n_max']):
        rows.append({'n': n, 'distinct': distinct, 'H': H, 'dH': H - previous})
        previous = H
    last = rows[-1]
    upper = min(r['H'] / r['n'] for r in rows) / chi        # rigorous: h = inf H_n / n
    estimate = last['dH'] / chi                               # numerical, not a bound
    drift = abs(rows[-1]['dH'] - rows[-2]['dH']) / chi
    # Decision rule (fixed before any new case ran):
    #   below_one_rigorous: the rigorous upper bound is below 1;
    #   below_one_numerical: the estimate is below 0.999 and changed by less than 1e-4 in the last step;
    #   undecided: anything else (the estimate is still above 1 or still moving).
    outcome = 'below_one_rigorous' if upper < 1 else 'below_one_numerical' if estimate < 0.999 and drift < 1e-4 else 'undecided'
    return {'id': case['id'], 'name': case['name'], 'lambda': lam, 'chi': chi, 'n_max': case['n_max'],
            'upper_bound_ratio': upper, 'estimate_ratio': estimate, 'last_step_change': drift, 'outcome': outcome,
            'distinct_last': last['distinct']}


# ---------------------------------------------------------------- E2
# Ising (q = 2) has its threshold exactly at Kesten-Stigum for every d (Evans, Kenyon, Peres and Schulman).
E2_CALIBRATION = [{'id': 'q2-d2', 'q': 2, 'd': 2}, {'id': 'q2-d3', 'q': 2, 'd': 3}]
E2_CASES = [{'id': f'q{q}-d{d}', 'q': q, 'd': d} for q, d in
            [(3, 2), (4, 2), (5, 2), (5, 3), (6, 2), (7, 2), (8, 2), (5, 4), (6, 3), (8, 3)]]
E2_POPULATION, E2_DEPTHS, E2_STEPS = 20000, (80, 160), 9
# Rule 2 (from 2026-11-09, set on the Ising calibrations only): reconstruction when the overlap at
# depth 160 is above the noise floor 0.01 and at least 0.8 times the overlap at depth 80, so it has
# settled at a positive value instead of decaying. Rule 1 (an overlap above 0.05 at depth 80) missed
# reconstruction just above Kesten-Stigum for q = 5, where the settled overlap is small.
E2_FLOOR, E2_SETTLED = 0.01, 0.8


def potts_overlap(q, d, lam, rng, population=E2_POPULATION, depth=E2_DEPTHS[0]):
    """Mean overlap (q m(true) - 1)/(q - 1) of the root posterior after `depth` levels."""
    return potts_overlaps(q, d, lam, rng, population, (depth,))[0]


def potts_overlaps(q, d, lam, rng, population=E2_POPULATION, depths=E2_DEPTHS):
    """The mean overlap after each of `depths` levels, from one run of the population dynamics."""
    import numpy as np
    M = lam * np.eye(q) + (1 - lam) / q
    pop = np.zeros((population, q))
    pop[:, 0] = 1.0                                           # perfect information at the leaves
    out = []
    for level in range(1, max(depths) + 1):
        colours = rng.choice(q, size=(population, d), p=M[0])
        msgs = pop[rng.integers(population, size=(population, d))]       # (P, d, q), each given colour 0
        perm = np.broadcast_to(np.arange(q), msgs.shape).copy()
        # The child's message given its colour c is the colour-0 message with colours 0 and c swapped.
        np.put_along_axis(perm, colours[:, :, None], 0, axis=2)
        perm[:, :, 0] = colours
        msgs = np.take_along_axis(msgs, perm, axis=2)
        up = msgs @ M.T
        new = np.prod(up, axis=1)
        pop = new / new.sum(axis=1, keepdims=True)
        if level in depths:
            out.append(float(((q * pop[:, 0] - 1) / (q - 1)).mean()))
    return out


def reconstructs(early, late):
    return late > E2_FLOOR and late >= E2_SETTLED * early


def e2_case(case, seed):
    import numpy as np
    q, d = case['q'], case['d']
    ks = 1 / math.sqrt(d)
    lo, hi = 0.0, 1.0                                         # reconstruction at hi, not at lo
    for step in range(E2_STEPS):
        mid = (lo + hi) / 2
        early, late = potts_overlaps(q, d, mid, np.random.default_rng(seed + step))
        if reconstructs(early, late):
            hi = mid
        else:
            lo = mid
    threshold = (lo + hi) / 2
    ratio = threshold / ks
    # Decision rule: within 3 % of Kesten-Stigum counts as equal; below 0.97 as below. Above 1.03 is
    # impossible (reconstruction always holds above Kesten-Stigum), so it is a method error, not judged.
    outcome = 'equal_to_ks' if abs(ratio - 1) <= 0.03 else 'below_ks' if ratio < 0.97 else 'method_error'
    return {'id': case['id'], 'q': q, 'd': d, 'threshold': threshold, 'kesten_stigum': ks, 'ratio': ratio,
            'resolution': 1 / 2 ** E2_STEPS, 'outcome': outcome}


# ---------------------------------------------------------------- E3
E3_CALIBRATION = [{'id': 'heisenberg', 'theta_pi': 0.0, 'expect': 'gapped'},
                  {'id': 'takhtajan-babujian', 'theta_pi': -0.25, 'expect': 'gapless_like'},
                  # The integrable SU(3) point, gapless; it calibrates the period-3 ring lengths.
                  {'id': 'uimin-lai-sutherland', 'theta_pi': 0.25, 'expect': 'gapless_like'}]
E3_CASES = [{'id': f'theta{t:+.4f}', 'theta_pi': t} for t in
            [math.atan(1 / 3) / math.pi, 0.05, 0.15, 0.2, -0.1, -0.2, 0.3, 0.4]]
E3_SIZES = (6, 8, 10, 12)
# For theta >= pi/4 (the critical phase with soft modes at momentum 2 pi / 3) only ring lengths
# divisible by 3 are comparable: 6 and 12 behave unlike 8 and 10 there (seen on 2026-11-04).
E3_SIZES_PERIOD3 = (6, 9, 12)


def spin1_bond():
    import numpy as np
    s = math.sqrt(2)
    Sz = np.diag([1.0, 0.0, -1.0])
    Sp = np.array([[0, s, 0], [0, 0, s], [0, 0, 0]], dtype=float)
    Sm = Sp.T
    P = np.kron(Sz, Sz) + 0.5 * (np.kron(Sp, Sm) + np.kron(Sm, Sp))
    return P, P @ P


def ring_gap(L, theta):
    """E1 - E0 in the Sz = 0 sector of the periodic ring (every multiplet has an Sz = 0 member)."""
    import numpy as np
    from itertools import product
    from scipy.sparse import coo_matrix
    from scipy.sparse.linalg import eigsh
    P, P2 = spin1_bond()
    h = math.cos(theta) * P + math.sin(theta) * P2
    states = np.array([s for s in product(range(3), repeat=L) if sum(1 - x for x in s) == 0], dtype=np.int64)
    weights = 3 ** np.arange(L - 1, -1, -1, dtype=np.int64)
    codes = states @ weights                                  # sorted, since product() is lexicographic
    rows, cols, vals = [], [], []
    for i in range(L):
        j = (i + 1) % L
        a = 3 * states[:, i] + states[:, j]
        for b in range(9):
            v = h[b, a]
            keep = np.abs(v) > 1e-14
            if not keep.any():
                continue
            new = codes[keep] + (b // 3 - states[keep, i]) * weights[i] + (b % 3 - states[keep, j]) * weights[j]
            rows.append(np.searchsorted(codes, new))
            cols.append(np.nonzero(keep)[0])
            vals.append(v[keep])
    n = len(codes)
    H = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()
    e = np.sort(eigsh(H, k=2, which='SA', tol=1e-10)[0])
    return float(e[1] - e[0])


def e3_case(case):
    theta = case['theta_pi'] * math.pi
    sizes = E3_SIZES_PERIOD3 if case['theta_pi'] >= 0.25 else E3_SIZES
    gaps = {L: ring_gap(L, theta) for L in sizes}
    g = [gaps[L] for L in sizes]
    scaled = [L * gaps[L] for L in sizes]
    growth = [scaled[i + 1] / scaled[i] - 1 for i in range(1, len(scaled) - 1)]
    # Decision rule, set on the calibrations before any new case ran: a gap closing like 1/L keeps
    # L * gap constant. Gapped when L * gap grows by more than 5 % at each of the last size steps and
    # the largest ring keeps a gap above 0.05; gapless-like when it changes by less than 5 % at each.
    outcome = ('gapped' if min(growth) > 0.05 and g[-1] > 0.05 else
               'gapless_like' if max(abs(x) for x in growth) < 0.05 else 'undecided')
    return {'id': case['id'], 'theta_pi': case['theta_pi'], 'gaps': {str(L): gaps[L] for L in sizes},
            'scaled_growth': growth, 'outcome': outcome}


# ---------------------------------------------------------------- E4
# Reference ranks over GF(2): the best ranks known from the literature (Kauers and Moosbauer's flip
# graphs, Fawzi et al.'s AlphaTensor table). Calibrations are optimal ranks (Strassen; <2,2,3> = 11).
E4_CALIBRATION = [{'id': '2x2x2', 'format': (2, 2, 2), 'reference': 7, 'steps': 20000},
                  {'id': '2x2x3', 'format': (2, 2, 3), 'reference': 11, 'steps': 200000}]
E4_CASES = [{'id': f'{n}x{m}x{p}', 'format': (n, m, p), 'reference': ref, 'steps': 6_000_000} for n, m, p, ref in
            [(2, 2, 4, 14), (2, 3, 3, 15), (2, 2, 5, 18), (2, 3, 4, 20), (3, 3, 3, 23), (2, 3, 5, 25), (2, 4, 4, 26),
             (3, 3, 4, 29), (3, 3, 5, 36)]]
E4_SEEDS = 3


def e4_case(case, seed):
    n, m, p = case['format']
    runs = []
    for k in range(E4_SEEDS):
        rank, scheme, _ = matmul_flip.search(n, m, p, case['steps'], seed + k)
        runs.append({'seed': seed + k, 'rank': rank, 'checked': matmul_flip.check(scheme, n, m, p), 'scheme': scheme})
    checked = [x for x in runs if x['checked']]
    best = min(checked, key=lambda x: x['rank']) if checked else None
    found = best['rank'] if best else None
    # Decision rule: the lowest exactly checked rank against the reference rank.
    outcome = ('unchecked' if found is None else 'below_reference' if found < case['reference']
               else 'reached_reference' if found == case['reference'] else 'above_reference')
    return {'id': case['id'], 'format': list(case['format']), 'reference': case['reference'], 'steps': case['steps'],
            'ranks': [x['rank'] for x in runs], 'all_checked': all(x['checked'] for x in runs), 'found': found,
            'outcome': outcome, 'scheme': [list(t) for t in best['scheme']] if best else None}


# ---------------------------------------------------------------- predictions, registered before any new case ran
def e1_prediction(case):
    return 'below_one'      # h/chi < 1 for every case: dimension strictly below 1 (for Pisot already known)


def e2_prediction(case):
    return 'equal_to_ks' if case['q'] <= 4 else 'below_ks'


def e3_prediction(case):
    return 'gapped' if -0.25 < case['theta_pi'] < 0.25 else 'gapless_like'


def e4_prediction(case):
    return 'not_below_reference'   # a plain flip-graph walk does not beat the best known rank


def agrees(prediction, outcome):
    if outcome in ('undecided', 'method_error'):
        return None
    if prediction == 'below_one':
        return outcome.startswith('below_one')
    if prediction == 'not_below_reference':
        return None if outcome == 'unchecked' else outcome != 'below_reference'
    return prediction == outcome


def week_of(date):
    return datetime.date.fromisoformat(date).toordinal() // 7


def run(date, e1=True, e2=True, e3=True, e4=True, e3_sizes=None):
    week = week_of(date)
    out = {'schema': SCHEMA, 'date': date, 'week': week, 'experiments': {}}
    if e1:
        cal = [dict(e1_case(c), known=c['known']) for c in E1_CALIBRATION]
        for c in cal:
            c['calibration_passed'] = abs(c['estimate_ratio'] - c['known']) < 1e-5
        case = E1_CASES[week % len(E1_CASES)]
        new = e1_case(case)
        new.update(kind=case['kind'], prediction=e1_prediction(case), agrees=agrees(e1_prediction(case), new['outcome']))
        out['experiments']['E1'] = {'calibration': cal, 'case': new}
    if e2:
        seed = 20261104 + week
        cal = [e2_case(c, seed) for c in E2_CALIBRATION]
        for c in cal:
            c['calibration_passed'] = c['outcome'] == 'equal_to_ks'
        case = E2_CASES[week % len(E2_CASES)]
        new = e2_case(case, seed)
        new.update(prediction=e2_prediction(case), agrees=agrees(e2_prediction(case), new['outcome']), seed=seed)
        out['experiments']['E2'] = {'calibration': cal, 'case': new}
    if e3:
        global E3_SIZES
        if e3_sizes:
            E3_SIZES = tuple(e3_sizes)
        cal = [dict(e3_case(c), expect=c['expect']) for c in E3_CALIBRATION]
        for c in cal:
            c['calibration_passed'] = c['outcome'] == c['expect']
        case = E3_CASES[week % len(E3_CASES)]
        new = e3_case(case)
        new.update(prediction=e3_prediction(case), agrees=agrees(e3_prediction(case), new['outcome']))
        out['experiments']['E3'] = {'calibration': cal, 'case': new}
    if e4:
        seed = 20261104 + week
        cal = [e4_case(c, seed) for c in E4_CALIBRATION]
        for c in cal:
            c['calibration_passed'] = c['outcome'] == 'reached_reference' and c['all_checked']
        case = E4_CASES[week % len(E4_CASES)]
        new = e4_case(case, seed)
        new.update(prediction=e4_prediction(case), agrees=agrees(e4_prediction(case), new['outcome']), seed=seed)
        out['experiments']['E4'] = {'calibration': cal, 'case': new}
    return out


# ---------------------------------------------------------------- report
OUTCOMES = {'below_one_rigorous': 'under 1 (rigoröst)', 'below_one_numerical': 'under 1 (numeriskt)', 'undecided': 'oavgjort',
            'equal_to_ks': 'lika med Kesten–Stigum', 'below_ks': 'under Kesten–Stigum',
            'above_ks': 'över Kesten–Stigum', 'method_error': 'över Kesten–Stigum, vilket är omöjligt: metodfel, bedöms inte',
            'gapped': 'gap', 'gapless_like': 'gaplös-lik', 'below_one': 'under 1',
            'reached_reference': 'nådde referensrangen', 'above_reference': 'stannade över referensrangen',
            'below_reference': 'UNDER referensrangen (exakt kontrollerat; jämför med litteraturen innan något påstås)',
            'unchecked': 'inget schema klarade kontrollen', 'not_below_reference': 'inte under referensrangen'}
VERDICT = {True: 'stämmer', False: 'stämmer inte', None: 'oavgjort'}
f6 = lambda x: f'{x:.6f}'.replace('.', ',')
ok = lambda b: 'godkänd' if b else 'MISSLYCKADES'


def render(r):
    L = [f"# Oraklets beräkningsexperiment – {r['date']}", '',
         '*Veckovisa beräkningar utan modellanrop, från [research/openai-math/RAPPORT.md](../../research/openai-math/RAPPORT.md). '
         'Varje vecka körs kalibreringsfall med kända svar och ett nytt fall per experiment, med en förutsägelse som registrerades i '
         '[experiments.py](../../research/openai-math/experiments.py) innan något nytt fall kördes. Utfallen är numeriska uppskattningar, '
         'inte bevis, utom där det står rigoröst.*', '']
    ex = r['experiments']
    if 'E1' in ex:
        e = ex['E1']
        L += ['## E1. Bernoulli-faltningar: entropi och dimension', '', 'Kalibrering:', '']
        for c in e['calibration']:
            L.append(f"- {c['name']}: h/χ ≈ {f6(c['estimate_ratio'])} (känt {f6(c['known'])}), {ok(c['calibration_passed'])}")
        c = e['case']
        L += ['', f"Nytt fall: λ = {c['name']} ({c['kind']}), n ≤ {c['n_max']}.", '',
              f"- Rigorös övre gräns min H_n/(nχ): {f6(c['upper_bound_ratio'])}",
              f"- Skattning (H_n − H_(n−1))/χ: {f6(c['estimate_ratio'])} (ändring senaste steget {c['last_step_change']:.2e})",
              f"- Utfall: {OUTCOMES[c['outcome']]}. Förutsägelse: {OUTCOMES[c['prediction']]}. Bedömning: {VERDICT[c['agrees']]}.", '']
    if 'E2' in ex:
        e = ex['E2']
        L += ['## E2. Rekonstruktionströsklar för Potts-kanalen på träd', '', 'Kalibrering (Ising, q = 2, där tröskeln är exakt Kesten–Stigum för varje d):', '']
        for c in e['calibration']:
            L.append(f"- q = {c['q']}, d = {c['d']}: λ* ≈ {f6(c['threshold'])}, λ*/λ_KS = {f6(c['ratio'])}, {ok(c['calibration_passed'])}")
        c = e['case']
        L += ['', f"Nytt fall: q = {c['q']}, d = {c['d']} (frö {c['seed']}).", '',
              f"- λ* ≈ {f6(c['threshold'])} ± {c['resolution']:.4f}, Kesten–Stigum {f6(c['kesten_stigum'])}, kvot {f6(c['ratio'])}",
              f"- Utfall: {OUTCOMES[c['outcome']]}. Förutsägelse: {OUTCOMES[c['prediction']]}. Bedömning: {VERDICT[c['agrees']]}.", '']
    if 'E3' in ex:
        e = ex['E3']
        L += ['## E3. Spektralgap för spinn-1-ringar (bilinjär–bikvadratisk)', '', 'Kalibrering:', '']
        for c in e['calibration']:
            g = ', '.join(f"L={k}: {f6(v)}" for k, v in c['gaps'].items())
            L.append(f"- θ = {c['theta_pi']:+.4f}π: {g}; utfall {OUTCOMES[c['outcome']]} (väntat {OUTCOMES[c['expect']]}), {ok(c['calibration_passed'])}")
        c = e['case']
        g = ', '.join(f"L={k}: {f6(v)}" for k, v in c['gaps'].items())
        L += ['', f"Nytt fall: θ = {c['theta_pi']:+.4f}π.", '', f'- Gap: {g}',
              f"- Utfall: {OUTCOMES[c['outcome']]}. Förutsägelse: {OUTCOMES[c['prediction']]}. Bedömning: {VERDICT[c['agrees']]}.", '']
    if 'E4' in ex:
        e = ex['E4']
        fmt = lambda c: '⟨' + ','.join(map(str, c['format'])) + '⟩'
        L += ['## E4. Matrismultiplikation i litet format över GF(2)', '', 'Kalibrering (kända optimala ranger):', '']
        for c in e['calibration']:
            L.append(f"- {fmt(c)}: rang {c['found']} (referens {c['reference']}), {ok(c['calibration_passed'])}")
        c = e['case']
        steps = f"{c['steps']:,}".replace(',', ' ')
        L += ['', f"Nytt fall: {fmt(c)}, referensrang {c['reference']}, {E4_SEEDS} frön från {c['seed']} med {steps} steg vardera.", '',
              f"- Ranger per frö: {', '.join(map(str, c['ranks']))}; lägsta exakt kontrollerade: {c['found']}",
              f"- Utfall: {OUTCOMES[c['outcome']]}. Förutsägelse: {OUTCOMES[c['prediction']]}. Bedömning: {VERDICT[c['agrees']]}.",
              '- Det bästa schemat finns i körningens artefakt (result.json).', '']
    if r.get('replication'):
        L += replication_lines(r['replication'])
    calib = [c for e in ex.values() for c in e['calibration']]
    L += ['## Begränsningar', '',
          f"- Kalibreringar: {sum(c['calibration_passed'] for c in calib)} av {len(calib)} godkända. Ett nytt fall bedöms bara när dess experiments kalibrering är godkänd.",
          '- E2 och E3 är numeriska uppskattningar med ändlig population, djup och storlek. E1:s övre gräns är rigorös; skattningen är det inte.',
          '- E4:s scheman är exakt kontrollerade över GF(2), inte över heltalen; att ett schema saknas säger inget om att det inte finns.',
          '- Inget här verifierar en sats i openai/math.', '']
    return '\n'.join(L)


REPLICATION_STATUS = {'pass': 'godkänd', 'fail': 'MISSLYCKADES', 'known_defect': 'känt fel kvarstår', 'defect_fixed': 'känt fel åtgärdat, godkänd',
                      'missing': 'paketet saknas', 'timeout': 'tidsgränsen överskreds'}


def replication_lines(rep):
    rows = rep.get('packages', [])
    L = ['## E6. Omkörning av openai/math:s egna kontroller', '',
         f"openai/math vid commit `{str(rep.get('commit', '?'))[:12]}`: {sum(x['status'] in ('pass', 'defect_fixed') for x in rows)} av {len(rows)} paket godkända"
         f"{', ' + str(sum(x['status'] == 'known_defect' for x in rows)) + ' känt fel kvar' if any(x['status'] == 'known_defect' for x in rows) else ''}. "
         'En godkänd kontroll visar att samlingens ändliga beräkning går att återskapa, inte att satsen är bevisad.', '',
         '| Familj | Paket | Status | Tid |', '| --- | --- | --- | --- |']
    for x in rows:
        L.append(f"| {x['family']} | {x['id']} | {REPLICATION_STATUS.get(x['status'], x['status'])} | {x['seconds']:.0f} s |")
    return L + ['']


def index(ai_bus):
    d = Path(ai_bus) / 'berakningar'
    files = sorted((f.name for f in d.glob('*.md') if f.name != 'README.md' and len(f.stem) == 10), reverse=True) if d.exists() else []
    text = '\n'.join(['# Oraklets beräkningsexperiment', '',
                      'Veckovisa beräkningar (E1–E4) och omkörningar (E6) utan modellanrop, från [research/openai-math/RAPPORT.md](../../research/openai-math/RAPPORT.md). '
                      'Förutsägelserna registrerades i [experiments.py](../../research/openai-math/experiments.py) innan något nytt fall kördes.', '',
                      *([f'- [{f[:10]}]({f})' for f in files] or ['Inga körningar ännu.']), ''])
    d.mkdir(parents=True, exist_ok=True)
    (d / 'README.md').write_text(text, encoding='utf-8')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--date', default=datetime.datetime.now(datetime.timezone.utc).date().isoformat())
    p.add_argument('--out')
    p.add_argument('--ai-bus')
    p.add_argument('--index', metavar='AI_BUS')
    p.add_argument('--replication', metavar='RESULT_JSON', help='include the E6 replication report written by replication.py')
    a = p.parse_args(argv)
    if a.index:
        index(a.index)
        return 0
    r = run(a.date)
    if a.replication and Path(a.replication).exists():
        r['replication'] = json.loads(Path(a.replication).read_text(encoding='utf-8'))
    # A new case is judged only when its experiment's calibration passed.
    for e in r['experiments'].values():
        if not all(c['calibration_passed'] for c in e['calibration']):
            e['case']['agrees'] = None
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        Path(a.out, 'result.json').write_text(json.dumps(r, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    md = render(r)
    if a.ai_bus:
        d = Path(a.ai_bus) / 'berakningar'
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{r['date']}.md").write_text(md, encoding='utf-8')
        index(a.ai_bus)
    print(md)
    calib = [c for e in r['experiments'].values() for c in e['calibration']]
    return 0 if all(c['calibration_passed'] for c in calib) else 2


if __name__ == '__main__':
    sys.exit(main())
