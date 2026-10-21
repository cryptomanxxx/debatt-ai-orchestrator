"""Offline regression: Cloudflare migration must preserve scientific v2 scoring and artifacts."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import blablador_scientific_v2 as benchmark


class ScientificV2Test(unittest.TestCase):
    def test_repeats_tasks_exact_scoring_and_gateway_metrics(self):
        answers = {question: expected for _, question, expected in benchmark.TASKS}
        calls = []

        def mock_api(key, path, payload=None):
            self.assertEqual(key, "test-orchestrator-secret-value-12345")
            if path == "/models":
                return {"data": [{"id": "alias-glm-5.3-flash"}]}
            self.assertEqual(path, "/chat/completions")
            self.assertEqual(payload["temperature"], 0)
            self.assertEqual(payload["max_tokens"], 384)
            self.assertEqual(payload["messages"][0]["role"], "system")
            calls.append(payload)
            return {"choices": [{"message": {"content": answers[payload["messages"][1]["content"]]}}],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 3},
                    "_completion_latency_seconds": 0.5, "_resolved_model": "zai-org/GLM-5.3-Flash"}

        with tempfile.TemporaryDirectory() as directory:
            previous = os.getcwd()
            try:
                os.chdir(directory)
                with patch.dict(os.environ, {"ORCHESTRATOR_API_KEY": "test-orchestrator-secret-value-12345",
                                             "BENCHMARK_MODELS": "alias-glm-5.3-flash",
                                             "BENCHMARK_REPEATS": "2"}), patch.object(benchmark, "api", side_effect=mock_api), patch.object(benchmark.time, "sleep"):
                    benchmark.main()
                report = json.loads(Path("blablador-scientific-v2.json").read_text())
            finally:
                os.chdir(previous)

        self.assertEqual(len(calls), 10)
        self.assertEqual(len(report["results"]), 10)
        self.assertTrue(all(item["correct"] and item["status"] == "ok" for item in report["results"]))
        self.assertTrue(all(item["latency_seconds"] == 0.5 for item in report["results"]))
        self.assertTrue(all(item["resolved_model"] == "zai-org/GLM-5.3-Flash" for item in report["results"]))
        self.assertEqual(report["transport"], "cloudflare-benchmark-v1")
        self.assertEqual(report["metadata_scope"], "catalog_ids_only")
        self.assertEqual(report["inference_timeout_seconds"], 60)
        self.assertEqual(report["scoring"], "case_sensitive_exact_match_after_whitespace_trim")

    def test_adapter_uses_only_gateway_routes(self):
        with patch.object(benchmark, "catalog_models", return_value={"data": []}) as discovery:
            self.assertEqual(benchmark.api("key", "/models"), {"data": []})
            discovery.assert_called_once_with("key", "blablador")
        with patch.object(benchmark, "benchmark_completion", return_value={"answer": "4"}) as inference:
            self.assertEqual(benchmark.api("key", "/chat/completions", {"model": "x"}), {"answer": "4"})
            inference.assert_called_once_with("key", "blablador", {"model": "x"})
        with self.assertRaises(benchmark.GatewayError):
            benchmark.api("key", "/other")

    def test_sanitized_errors(self):
        self.assertEqual(benchmark.safe_error(benchmark.GatewayError("gateway_http_403")), "gateway_gateway_http_403")
        self.assertEqual(benchmark.safe_error(benchmark.GatewayError("secret raw response")), "request_failed_GatewayError")


if __name__ == "__main__":
    unittest.main()
