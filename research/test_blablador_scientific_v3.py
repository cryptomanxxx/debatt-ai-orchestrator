"""Offline regression tests for scientific answer validation; no Blablador calls."""
import unittest
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch
import blablador_scientific_v3 as benchmark
from blablador_scientific_v3 import evaluate


class ScientificValidatorTests(unittest.TestCase):
    def test_migrated_end_to_end_offline(self):
        calls = []
        answers = {q: expected for _task, q, expected in benchmark.TASKS}
        def stub(key, path, payload=None):
            self.assertEqual(key, "test-orchestrator-secret-value-12345")
            if path == "/models":
                return {"data": [{"id": "alias-glm-5.3-flash"}]}
            self.assertEqual(path, "/chat/completions")
            self.assertEqual(payload["temperature"], 0)
            self.assertEqual(payload["max_tokens"], 768)
            self.assertEqual(payload["messages"][0]["role"], "system")
            calls.append(payload)
            return {
                "choices": [{"message": {"content": "FINAL_ANSWER: " + answers[payload["messages"][1]["content"]]},
                             "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 18, "completion_tokens": 8},
                "_completion_latency_seconds": 0.42
            }
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                with patch.dict(os.environ, {"ORCHESTRATOR_API_KEY": "test-orchestrator-secret-value-12345",
                                             "BENCHMARK_MODELS": "alias-glm-5.3-flash",
                                             "BENCHMARK_REPEATS": "1"}), patch.object(benchmark, "api", side_effect=stub), patch.object(benchmark.time, "sleep"):
                    benchmark.main()
                report = json.loads(Path("blablador-scientific-v3.json").read_text())
            finally:
                os.chdir(previous)
        self.assertEqual(len(calls), 5)
        self.assertEqual(len(report["results"]), 5)
        self.assertTrue(all(x["scientific_verdict"] == "correct" for x in report["results"]))
        self.assertTrue(all(x["format_compliant"] for x in report["results"]))
        self.assertTrue(all(x["latency_seconds"] == 0.42 for x in report["results"]))
        self.assertEqual(report["transport"], "cloudflare-benchmark-v1")
        self.assertEqual(report["metadata_scope"], "catalog_ids_only")

    def test_gateway_route_and_safe_errors(self):
        with patch.object(benchmark, "catalog_models", return_value={"data": []}) as discovery:
            benchmark.api("secret", "/models")
            discovery.assert_called_once_with("secret", "blablador")
        with patch.object(benchmark, "benchmark_completion", return_value={}) as inference:
            benchmark.api("secret", "/chat/completions", {"model": "x"})
            inference.assert_called_once_with("secret", "blablador", {"model": "x"})
        self.assertEqual(benchmark.safe_error(benchmark.GatewayError("gateway_http_403")), "gateway_gateway_http_403")
        self.assertEqual(benchmark.safe_error(benchmark.GatewayError("raw upstream secret")), "request_failed_GatewayError")

    def test_equivalent_fraction(self):
        self.assertEqual(evaluate("FINAL_ANSWER: 4/26", "2/13")[:2], ("correct", True))

    def test_decimal_equivalence(self):
        self.assertEqual(evaluate("FINAL_ANSWER: 2.0", "2")[:2], ("correct", True))

    def test_wrong_math(self):
        self.assertEqual(evaluate("FINAL_ANSWER: 3", "2")[:2], ("incorrect", True))

    def test_verbose_with_final_line(self):
        self.assertEqual(evaluate("Calculation gives 2.\nFINAL_ANSWER: 2", "2")[:2],
                         ("correct", False))

    def test_ambiguous_verbose(self):
        self.assertEqual(evaluate("Try 1 then 2 then 3", "2")[0], "unverified")

    def test_causal_case(self):
        self.assertEqual(evaluate("FINAL_ANSWER: Mediator", "mediator")[:2],
                         ("correct", True))


    def test_punctuation(self):
        self.assertEqual(evaluate("FINAL_ANSWER: 2.", "2")[:2], ("correct", True))

    def test_marker_case_affects_format_only(self):
        self.assertEqual(evaluate("final_answer: 2", "2")[:2], ("correct", False))

    def test_marker_spacing_affects_format_only(self):
        self.assertEqual(evaluate("FINAL_ANSWER : 2", "2")[:2], ("correct", False))

    def test_unrecognized_causal_prose(self):
        self.assertEqual(evaluate("I cannot determine this", "mediator")[0], "unverified")

    def test_recognized_wrong_causal_label(self):
        self.assertEqual(evaluate("FINAL_ANSWER: collider", "mediator")[:2], ("incorrect", True))

if __name__ == "__main__":
    unittest.main()
