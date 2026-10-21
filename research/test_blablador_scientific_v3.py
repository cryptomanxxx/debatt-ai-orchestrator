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
        expected_tasks = (
            ("determinant", "Compute the determinant of [[2,4,6],[1,2,3],[0,1,1]].", "0"),
            ("bayes", "Disease prevalence is 1%, sensitivity 90%, specificity 95%. Give P(disease | positive) as a reduced fraction.", "2/13"),
            ("causal", "In DAG X -> M -> Y and X -> Y, classify M for the total causal effect X on Y: mediator, confounder, or collider.", "mediator"),
            ("slope", "Find the OLS slope with intercept for points (1,2),(2,4),(3,6).", "2"),
            ("sequence", "A geometric sequence starts 2,6,18,54, and each term is three times its predecessor. Find term 7.", "1458"),
        )
        self.assertEqual(benchmark.TASKS, expected_tasks)
        answers = {q: expected for _task, q, expected in expected_tasks}
        def stub(key, path, payload=None):
            self.assertEqual(key, "test-orchestrator-secret-value-12345")
            if path == "/models":
                return {"data": [{"id": "Qwen3.8-27B"}]}
            self.assertEqual(path, "/chat/completions")
            self.assertEqual(payload["temperature"], 0)
            self.assertEqual(payload["max_tokens"], 768)
            self.assertEqual(payload["messages"][0], {"role": "system", "content": "Solve the scientific question. End with one separate line exactly FINAL_ANSWER: <answer>. No text after that line."})
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
                                             "BENCHMARK_MODELS": "Qwen3.8-27B",
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

    def test_explicit_model_id_validation(self):
        self.assertTrue(benchmark.explicit_model_id("Qwen3.8-27B"))
        self.assertTrue(benchmark.explicit_model_id("deepseek-v4.1-flash-at-hzdr"))
        for name in ["alias-fast", "ALIAS-default", "", "../ a", "model;bad"]:
            self.assertFalse(benchmark.explicit_model_id(name))

    def test_retry_429_and_preserve_length(self):
        calls=[]
        def completion(key,provider,payload,*,allow_truncated=False):
            self.assertTrue(allow_truncated)
            calls.append(payload)
            if len(calls)<3:
                raise benchmark.GatewayError("gateway_http_429")
            return {"choices":[{"message":{"content":"partial"},"finish_reason":"length"}]}
        with patch.object(benchmark, "benchmark_completion",side_effect=completion),patch.object(benchmark.time,"sleep") as sleeper:
            result=benchmark.api("secret","/chat/completions",{"model":"x"})
        self.assertEqual(result["choices"][0]["finish_reason"],"length")
        self.assertEqual(len(calls),3)
        self.assertEqual([x.args[0] for x in sleeper.call_args_list],[5,15])

    def test_gateway_route_and_safe_errors(self):
        with patch.object(benchmark, "catalog_models", return_value={"data": []}) as discovery:
            benchmark.api("secret", "/models")
            discovery.assert_called_once_with("secret", "blablador")
        with patch.object(benchmark, "benchmark_completion", return_value={}) as inference:
            benchmark.api("secret", "/chat/completions", {"model": "x"})
            inference.assert_called_once_with("secret", "blablador", {"model": "x"}, allow_truncated=True)
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
