"""Scientific v4 task suite: deterministic, exactly scored tasks per research domain.

Every task is generated from a fixed suite version and index, so all models get identical
questions, and every expected answer is computed here with exact arithmetic (fractions and
SymPy), never typed by hand. Domains match the kinds of work Oraklet's experiments need.
"""
import math
import random
import re
from fractions import Fraction

from sympy import Matrix, Rational, Symbol, diff, integrate

SUITE_VERSION = "domains-v1"
DOMAINS = ("symbolic", "probability", "causal", "statistics", "discrete")
ANSWER_FORMAT = ("Give an exact answer: an integer or a reduced fraction p/q, no decimals, "
                 "or the single requested word.")


def _rng(domain, index, attempt=0):
    return random.Random(f"{SUITE_VERSION}:{domain}:{index}:{attempt}")


def _num(value):
    value = Fraction(value)
    return str(value.numerator) if value.denominator == 1 else f"{value.numerator}/{value.denominator}"


# --- symbolic -----------------------------------------------------------------------------
def _det4(r):
    rows = [[r.randint(-4, 4) for _ in range(4)] for _ in range(4)]
    return f"Compute the determinant of the 4x4 matrix {rows}.", _num(int(Matrix(rows).det()))


def _vieta(r):
    a, b, c = (r.choice([n for n in range(-9, 10) if n]) for _ in range(3))
    poly = f"x^3 {'+' if a > 0 else '-'} {abs(a)}x^2 {'+' if b > 0 else '-'} {abs(b)}x {'+' if c > 0 else '-'} {abs(c)}"
    return (f"Let r1, r2, r3 be the three complex roots of {poly}. Compute r1^2 + r2^2 + r3^2.",
            _num(a * a - 2 * b))


def _integral(r):
    p, q, s, k = r.randint(1, 9), r.randint(-9, 9), r.randint(-9, 9), r.randint(2, 5)
    x = Symbol("x")
    value = integrate(p * x**3 + q * x + s, (x, 0, k))
    return f"Compute the definite integral of {p}x^3 + ({q})x + ({s}) from x = 0 to x = {k}.", _num(Fraction(str(value)))


def _quotient_derivative(r):
    x = Symbol("x")
    while True:
        a, b, c, d, k = r.randint(1, 6), r.randint(-6, 6), r.randint(1, 5), r.randint(-6, 6), r.randint(-3, 3)
        if c * k + d:
            break
    value = diff((a * x**2 + b) / (c * x + d), x).subs(x, k)
    return (f"Let f(x) = ({a}x^2 + ({b})) / ({c}x + ({d})). Compute f'({k}).", _num(Fraction(str(Rational(value)))))


# --- probability --------------------------------------------------------------------------
def _bayes(r):
    prev, sens, spec = r.randint(1, 10), r.randint(80, 99), r.randint(85, 99)
    p, se, sp = Fraction(prev, 100), Fraction(sens, 100), Fraction(spec, 100)
    value = p * se / (p * se + (1 - p) * (1 - sp))
    return (f"A disease has prevalence {prev}%. A test has sensitivity {sens}% and specificity {spec}%. "
            "Compute P(disease | positive test).", _num(value))


def _hypergeometric(r):
    red, blue = r.randint(3, 8), r.randint(3, 8)
    k = r.randint(2, 4)
    j = r.randint(1, min(k, red))
    value = Fraction(math.comb(red, j) * math.comb(blue, k - j), math.comb(red + blue, k))
    return (f"An urn holds {red} red and {blue} blue balls. {k} balls are drawn without replacement. "
            f"Compute the probability that exactly {j} are red.", _num(value))


def _dice_sum(r):
    n = r.randint(4, 12)
    s = r.randint(3, 2 * n - 1)
    ways = sum(1 for a in range(1, n + 1) for b in range(1, n + 1) if a + b == s)
    return (f"Two fair {n}-sided dice (faces 1 to {n}) are rolled. Compute the probability that the sum is {s}.",
            _num(Fraction(ways, n * n)))


def _at_least_one(r):
    m, n = r.randint(3, 8), r.randint(3, 7)
    value = 1 - Fraction(m - 1, m) ** n
    return (f"Each of {n} independent trials succeeds with probability 1/{m}. "
            "Compute the probability of at least one success.", _num(value))


# --- causal -------------------------------------------------------------------------------
_NAMES = ("smoking", "exercise", "income", "age", "diet", "stress", "sleep", "dosage", "education", "region")
_ROLES = {
    "confounder": "{z} -> {x}, {z} -> {y}, {x} -> {y}",
    "mediator": "{x} -> {z}, {z} -> {y}, {x} -> {y}",
    "collider": "{x} -> {z}, {y} -> {z}, {x} -> {y}",
}


def _names(r):
    x, y, z = r.sample(_NAMES, 3)
    return x, y, z


def _role(r):
    x, y, z = _names(r)
    role = r.choice(sorted(_ROLES))
    return (f"In the causal DAG {_ROLES[role].format(x=x, y=y, z=z)}, classify {z} relative to the effect of "
            f"{x} on {y}. Answer with one word: mediator, confounder or collider.", role)


def _adjust(r):
    x, y, z = _names(r)
    role = r.choice(sorted(_ROLES))
    answer = "yes" if role == "confounder" else "no"
    return (f"In the causal DAG {_ROLES[role].format(x=x, y=y, z=z)}, should you adjust for {z} to estimate the "
            f"total causal effect of {x} on {y}? Answer with one word: yes or no.", answer)


def _backdoor_table(r):
    pz = Fraction(r.randint(2, 8), 10)
    table = {(x, z): Fraction(r.randint(1, 9), 10) for x in (0, 1) for z in (0, 1)}
    text = (f"Binary Z confounds binary treatment X and outcome Y (Z -> X, Z -> Y, X -> Y), and Z is the only "
            f"confounder. P(Z=1) = {_num(pz)}. P(Y=1 | X=x, Z=z) is {_num(table[1, 1])} for x=1,z=1; "
            f"{_num(table[1, 0])} for x=1,z=0; {_num(table[0, 1])} for x=0,z=1; {_num(table[0, 0])} for x=0,z=0.")
    do = {x: table[x, 1] * pz + table[x, 0] * (1 - pz) for x in (0, 1)}
    return text, do


def _do_probability(r):
    text, do = _backdoor_table(r)
    return text + " Compute P(Y=1 | do(X=1)).", _num(do[1])


def _ate(r):
    text, do = _backdoor_table(r)
    return text + " Compute the average treatment effect P(Y=1 | do(X=1)) - P(Y=1 | do(X=0)).", _num(do[1] - do[0])


# --- statistics ---------------------------------------------------------------------------
def _points(r, n=5):
    while True:
        xs = list(range(1, n + 1))
        ys = [r.randint(-5, 15) for _ in xs]
        if len(set(ys)) > 1:
            return xs, ys


def _ols(xs, ys):
    n = len(xs)
    mx, my = Fraction(sum(xs), n), Fraction(sum(ys), n)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    slope = sxy / sxx
    return slope, my - slope * mx, sxy * sxy / (sxx * syy)


def _pairs(xs, ys):
    return ", ".join(f"({x},{y})" for x, y in zip(xs, ys))


def _slope(r):
    xs, ys = _points(r)
    return f"Fit ordinary least squares y = a + b x to the points {_pairs(xs, ys)}. Compute the slope b.", _num(_ols(xs, ys)[0])


def _intercept(r):
    xs, ys = _points(r)
    return f"Fit ordinary least squares y = a + b x to the points {_pairs(xs, ys)}. Compute the intercept a.", _num(_ols(xs, ys)[1])


def _r_squared(r):
    xs, ys = _points(r)
    return (f"Fit ordinary least squares y = a + b x to the points {_pairs(xs, ys)}. "
            "Compute the coefficient of determination R^2.", _num(_ols(xs, ys)[2]))


def _sample_variance(r):
    values = [r.randint(-10, 20) for _ in range(6)]
    mean = Fraction(sum(values), len(values))
    value = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    return f"Compute the unbiased sample variance (divide by n - 1) of {values}.", _num(value)


# --- discrete -----------------------------------------------------------------------------
def _recurrence(r):
    p, q = r.randint(1, 3), r.randint(-2, 2) or 1
    a0, a1 = r.randint(0, 3), r.randint(1, 4)
    seq = [a0, a1]
    for _ in range(9):
        seq.append(p * seq[-1] + q * seq[-2])
    return f"a(0) = {a0}, a(1) = {a1} and a(n) = {p} a(n-1) + ({q}) a(n-2) for n >= 2. Compute a(10).", _num(seq[10])


def _binomial(r):
    n = r.randint(20, 40)
    k = r.randint(3, 8)
    return f"Compute the binomial coefficient C({n}, {k}).", _num(math.comb(n, k))


def _weighted_power_sum(r):
    base, n = r.randint(2, 4), r.randint(5, 9)
    return f"Compute the sum of k * {base}^k for k = 1 to {n}.", _num(sum(k * base**k for k in range(1, n + 1)))


def _lcm(r):
    a, b, c = (r.randint(10, 60) for _ in range(3))
    return f"Compute the least common multiple of {a}, {b} and {c}.", _num(math.lcm(a, b, c))


GENERATORS = {
    "symbolic": (_det4, _vieta, _integral, _quotient_derivative),
    "probability": (_bayes, _hypergeometric, _dice_sum, _at_least_one),
    "causal": (_role, _adjust, _do_probability, _ate),
    "statistics": (_slope, _intercept, _r_squared, _sample_variance),
    "discrete": (_recurrence, _binomial, _weighted_power_sum, _lcm),
}
CHOICES = {"mediator", "confounder", "collider", "yes", "no"}


def tasks(per_domain=8):
    """[(domain, task_id, question, expected)], identical for every model and run."""
    if per_domain not in (4, 8):
        raise ValueError("per_domain must be 4 or 8")
    out, seen = [], set()
    for domain in DOMAINS:
        generators = GENERATORS[domain]
        for index in range(per_domain):
            generator = generators[index % len(generators)]
            # A repeated question is regenerated with the next deterministic attempt seed.
            for attempt in range(20):
                question, expected = generator(_rng(domain, index, attempt))
                if question not in seen:
                    break
            seen.add(question)
            out.append((domain, f"{domain}.{generator.__name__.lstrip('_')}.{index}", question, expected))
    return out


_FINAL = re.compile(r"(?im)^\s*FINAL_ANSWER\s*:\s*(.*?)\s*$")
_NUMBER = re.compile(r"^[+-]?\d+(?:/[+-]?\d+|\.\d+)?$")
_FRAC = re.compile(r"^\\[dt]?frac\{([+-]?\d+)\}\{([+-]?\d+)\}$")


def _clean(candidate):
    text = candidate.strip().strip("`*$ ").rstrip(".").strip()
    boxed = re.fullmatch(r"\\boxed\{(.*)\}", text)
    if boxed:
        text = boxed.group(1).strip()
    sign = ""
    if text.startswith("-\\"):
        sign, text = "-", text[1:]
    frac = _FRAC.fullmatch(text)
    if frac:
        text = f"{sign}{frac.group(1)}/{frac.group(2)}"
    elif sign:
        text = sign + text
    if re.fullmatch(r"[+-]?\d{1,3}(?:,\d{3})+", text):
        text = text.replace(",", "")
    return text.replace(" ", "")


def evaluate(content, expected):
    """(verdict, format_compliant, candidate). Only an unambiguous final answer is scored."""
    text = content.strip()
    markers = _FINAL.findall(text)
    candidate = markers[-1].strip() if markers else text
    compliant = bool(markers) and bool(re.fullmatch(r"FINAL_ANSWER: [^\r\n]+", text.splitlines()[-1].strip()))
    cleaned = _clean(candidate)
    if expected in CHOICES:
        word = cleaned.lower()
        if word in CHOICES:
            return ("correct" if word == expected else "incorrect"), compliant, candidate
        return "unverified", compliant, candidate
    if _NUMBER.fullmatch(cleaned):
        try:
            return ("correct" if Fraction(cleaned) == Fraction(expected) else "incorrect"), compliant, candidate
        except (ValueError, ZeroDivisionError):
            pass
    return "unverified", compliant, candidate
