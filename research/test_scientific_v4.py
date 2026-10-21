"""Offline tests for the Scientific v4 domain suite; no Worker or provider calls."""
import json
import os
import re
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path
from unittest.mock import patch

from sympy import Matrix, Poly, Symbol, diff, nroots, solve, symbols

import domain_tasks
import scientific_v4
from cloudflare_benchmark_client import GatewayError

KEY = "test-orchestrator-secret-value-12345"


class SuiteTests(unittest.TestCase):
    def test_suite_is_deterministic_unique_and_balanced(self):
        suite = domain_tasks.tasks(8)
        self.assertEqual(suite, domain_tasks.tasks(8))
        self.assertEqual(len(suite), 40)
        self.assertEqual(len({q for _, _, q, _ in suite}), 40)
        for domain in domain_tasks.DOMAINS:
            self.assertEqual(sum(d == domain for d, *_ in suite), 8)
        self.assertEqual(len(domain_tasks.tasks(4)), 20)
        with self.assertRaises(ValueError):
            domain_tasks.tasks(5)

    def test_expected_answers_are_exact_and_independently_reproduced(self):
        for domain, task, question, expected in domain_tasks.tasks(8):
            with self.subTest(task=task):
                if expected not in domain_tasks.CHOICES:
                    self.assertRegex(expected, r"^-?\d+(?:/\d+)?$")
                    value = Fraction(expected)
                    self.assertEqual(str(value) if value.denominator > 1 else str(value.numerator), expected)
                kind = task.split(".")[1]
                if kind == "det4":
                    rows = json.loads(re.search(r"(\[\[.*\]\])", question).group(1))
                    self.assertEqual(Fraction(expected), Fraction(int(Matrix(rows).det(method="berkowitz"))))
                elif kind == "vieta":
                    m = re.search(r"x\^3 ([+-]) (\d+)x\^2 ([+-]) (\d+)x ([+-]) (\d+)", question)
                    a, b, c = (int(m.group(i + 1) + m.group(i + 2)) for i in (0, 2, 4))
                    roots = nroots(Poly([1, a, b, c], Symbol("x")))
                    self.assertAlmostEqual(complex(sum(r**2 for r in roots)).real, float(Fraction(expected)), places=6)
                elif kind in ("slope", "intercept", "r_squared"):
                    pts = [tuple(map(int, p)) for p in re.findall(r"\((-?\d+),(-?\d+)\)", question)]
                    a, b = symbols("a b")
                    loss = sum((y - a - b * x) ** 2 for x, y in pts)
                    fit = solve([diff(loss, a), diff(loss, b)], [a, b])
                    if kind == "slope":
                        self.assertEqual(Fraction(str(fit[b])), Fraction(expected))
                    elif kind == "intercept":
                        self.assertEqual(Fraction(str(fit[a])), Fraction(expected))
                    else:
                        mean = Fraction(sum(y for _, y in pts), len(pts))
                        sse = sum((Fraction(y) - Fraction(str(fit[a])) - Fraction(str(fit[b])) * x) ** 2 for x, y in pts)
                        sst = sum((y - mean) ** 2 for _, y in pts)
                        self.assertEqual(1 - sse / sst, Fraction(expected))
                elif kind == "role":
                    z, x = re.search(r"classify (\w+) relative to the effect of (\w+)", question).groups()
                    edges = set(re.search(r"DAG (.*?), classify", question).group(1).split(", "))
                    role = ("confounder" if f"{z} -> {x}" in edges else
                            "mediator" if f"{x} -> {z}" in edges and any(e.startswith(f"{z} -> ") for e in edges) else
                            "collider")
                    self.assertEqual(role, expected)

    def test_bayes_matches_natural_frequencies(self):
        _, _, question, expected = next(t for t in domain_tasks.tasks(8) if ".bayes." in t[1])
        prev, sens, spec = map(int, re.findall(r"(\d+)%", question))
        sick_pos = prev * sens
        healthy_pos = (100 - prev) * (100 - spec)
        self.assertEqual(Fraction(sick_pos, sick_pos + healthy_pos), Fraction(expected))


class EvaluateTests(unittest.TestCase):
    def test_numeric_answers(self):
        cases = [("Work...\nFINAL_ANSWER: 2/13", "2/13", "correct", True),
                 ("FINAL_ANSWER: 4/26", "2/13", "correct", True),
                 ("FINAL_ANSWER: \\frac{2}{13}", "2/13", "correct", True),
                 ("FINAL_ANSWER: -\\frac{9}{50}", "-9/50", "correct", True),
                 ("FINAL_ANSWER: $\\boxed{1458}$", "1458", "correct", True),
                 ("FINAL_ANSWER: 658,008", "658008", "correct", True),
                 ("FINAL_ANSWER: 0.5", "1/2", "correct", True),
                 ("FINAL_ANSWER: 0.333", "1/3", "incorrect", True),
                 ("FINAL_ANSWER: 3", "2/13", "incorrect", True),
                 ("FINAL_ANSWER: about two thirteenths", "2/13", "unverified", True),
                 ("The answer is 2/13", "2/13", "unverified", False),
                 ("FINAL_ANSWER: 2/13\nThanks!", "2/13", "correct", False)]
        for content, expected, verdict, compliant in cases:
            with self.subTest(content=content):
                got = domain_tasks.evaluate(content, expected)
                self.assertEqual(got[:2], (verdict, compliant))

    def test_word_answers(self):
        self.assertEqual(domain_tasks.evaluate("FINAL_ANSWER: **Yes**", "yes")[0], "correct")
        self.assertEqual(domain_tasks.evaluate("FINAL_ANSWER: confounder", "mediator")[0], "incorrect")
        self.assertEqual(domain_tasks.evaluate("FINAL_ANSWER: it is a mediator", "mediator")[0], "unverified")


class RunnerTests(unittest.TestCase):
    def run_main(self, reply, env_extra=None):
        calls = []

        def stub(key, path, payload=None, provider="blablador"):
            if path == "/models":
                return {"data": [{"id": "Qwen3.8-27B"}, {"id": "alias-fast", "root": "openai/gpt-oss-120b"}]}
            calls.append(payload)
            return reply(payload)

        env = {"ORCHESTRATOR_API_KEY": KEY, "BENCHMARK_MODEL": "hip / Qwen3.8-27B", "TASKS_PER_DOMAIN": "4",
               "BENCHMARK_REPEATS": "1", **(env_extra or {})}
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                with patch.dict(os.environ, env, clear=False), patch.object(scientific_v4, "api", side_effect=stub), \
                     patch.object(scientific_v4.time, "sleep"):
                    try:
                        scientific_v4.main()
                    except SystemExit:
                        pass
                report = json.loads(Path("scientific-v4.json").read_text())
            finally:
                os.chdir(previous)
        return report, calls

    def test_end_to_end_scores_every_domain(self):
        answers = {q: e for _, _, q, e in domain_tasks.tasks(4)}

        def reply(payload):
            self.assertEqual(payload["temperature"], 0)
            self.assertEqual(payload["max_tokens"], 768)
            self.assertIn("FINAL_ANSWER", payload["messages"][0]["content"])
            return {"choices": [{"message": {"content": "FINAL_ANSWER: " + answers[payload["messages"][1]["content"]]},
                                 "finish_reason": "stop"}], "usage": {}, "_completion_latency_seconds": 0.5}

        report, calls = self.run_main(reply)
        self.assertEqual(len(calls), 20)
        self.assertEqual(report["schema_version"], 4)
        self.assertEqual(report["suite"], domain_tasks.SUITE_VERSION)
        self.assertEqual({r["domain"] for r in report["results"]}, set(domain_tasks.DOMAINS))
        self.assertTrue(all(r["scientific_verdict"] == "correct" for r in report["results"]))

    def test_truncation_errors_and_unlisted_models(self):
        def reply(payload):
            if "determinant" in payload["messages"][1]["content"]:
                raise GatewayError("benchmark_model_identity_mismatch")
            return {"choices": [{"message": {"content": "partial"}, "finish_reason": "length"}], "usage": {},
                    "_completion_latency_seconds": 1}

        report, _ = self.run_main(reply)
        statuses = {r["status"] for r in report["results"]}
        self.assertEqual(statuses, {"gateway_benchmark_model_identity_mismatch", "truncated"})
        self.assertFalse(any(r["scientific_verdict"] == "correct" for r in report["results"]))
        report, calls = self.run_main(reply, {"BENCHMARK_MODEL": "hip / Kimi-K2.6"})
        self.assertEqual(calls, [])
        self.assertEqual({r["status"] for r in report["results"]}, {"not_listed"})

    def test_settings_validate_inputs(self):
        for bad in ({"TASKS_PER_DOMAIN": "5"}, {"BENCHMARK_REPEATS": "3"}, {"BENCHMARK_MODEL": "hip / ../x"}):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                scientific_v4.settings({"BENCHMARK_MODEL": "hip / Qwen3.8-27B", **bad})
        self.assertEqual(scientific_v4.settings({"BENCHMARK_MODEL": "blablador / alias-fast = gpt-oss-120b"}),
                         ("blablador", ["alias-fast"], 8, 1))


if __name__ == "__main__":
    unittest.main()
