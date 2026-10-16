import unittest
import tempfile
import os
import json
from pathlib import Path
from unittest.mock import patch
from scientific_model_router import (RouterError, candidates, choose_model, discovered_ids,
                                     run, http_json, PROFILES)

class RouterTests(unittest.TestCase):
    def test_profiles_are_explicit_and_bounded(self):
        self.assertEqual(candidates("reasoning")[0], ("blablador", "alias-kimi-k3-1m"))
        self.assertEqual(candidates("reasoning", "hip"), [("hip", "Kimi-K2.6")])
        with self.assertRaises(ValueError):
            candidates("unknown")

    def test_fallback_to_hip_if_blablador_missing(self):
        calls = []
        def discovery(base, key, path):
            calls.append((base, path))
            return {"data": [{"id": "Kimi-K2.6"}]}
        selected = choose_model("reasoning", {"HIP_API_KEY": "example-key-12345"}, discover=discovery)
        self.assertEqual(selected["provider"], "hip")
        self.assertEqual(selected["model"], "Kimi-K2.6")
        self.assertEqual(len(calls), 1)
        self.assertEqual(selected["discovery_issues"][0]["error"], "key_not_configured")

    def test_missing_discovered_model_fails_closed(self):
        with self.assertRaisesRegex(RouterError, "no_available_allowlisted_model"):
            choose_model("reasoning", {"HIP_API_KEY": "example-key-12345"},
                         discover=lambda *args: {"data": [{"id": "unknown"}]})

    def test_model_identity_and_finish_reason_must_be_verified(self):
        secret = {"BLABLADOR_API_KEY": "example-key-12345", "ROUTER_TASK": "reasoning"}
        discover = lambda *args: {"data": [{"id": "alias-kimi-k3-1m"}]}
        def reply(base, key, path, payload):
            self.assertEqual(payload["model"], "alias-kimi-k3-1m")
            self.assertEqual(payload["max_tokens"], 512)
            return {"model": "alias-kimi-k3-1m",
                    "choices": [{"finish_reason": "stop", "message": {"content": "roots: 2, 3"}}]}
        result = run("reasoning", secret, discover=discover, complete=reply)
        self.assertEqual(result["status"], "completed_unverified")
        self.assertFalse(result["scientifically_verified"])
        self.assertNotIn(secret["BLABLADOR_API_KEY"], str(result))
        def wrong(base, key, path, payload):
            return {"model": "different", "choices": [{"finish_reason": "stop",
                                                        "message": {"content": "hello"}}]}
        with self.assertRaisesRegex(RouterError, "model_identity_unverified"):
            run("reasoning", secret, discover=discover, complete=wrong)

    def test_invalid_discovery_is_rejected(self):
        for value in ({}, {"data": {}}, {"data": None}):
            with self.assertRaisesRegex(RouterError, "invalid_model_discovery"):
                discovered_ids(value)

    def test_failures_retain_sanitized_discovery_diagnostics(self):
        def discovery(base, key, path):
            raise RouterError("http_503")
        with self.assertRaisesRegex(RouterError, "no_available_allowlisted_model") as raised:
            choose_model("reasoning", {"BLABLADOR_API_KEY": "example-secret-123",
                                        "HIP_API_KEY": "example-secret-456"},
                         discover=discovery)
        self.assertIn({"provider": "blablador", "error": "http_503"}, raised.exception.issues)
        self.assertIn({"provider": "hip", "error": "http_503"}, raised.exception.issues)

    def test_success_timestamp_and_escaped_secret_are_redacted(self):
        from scientific_model_router import main
        secret = 'abc"\\\\keySECRET1234'
        with tempfile.TemporaryDirectory() as root:
            previous = os.getcwd()
            os.chdir(root)
            try:
                env = {"ROUTER_TASK": "reasoning", "BLABLADOR_API_KEY": secret}
                fake = {"schema_version": 1, "status": "completed_unverified",
                        "selected": {"provider": "blablador", "model": "alias-kimi-k3-1m"},
                        "answer": "the key is " + secret}
                with patch.dict(os.environ, env, clear=True), patch("scientific_model_router.run", return_value=fake):
                    main()
                data = Path("reports/scientific-model-router/report.json").read_text()
                obj = json.loads(data)
                self.assertIn("generated_utc", obj)
                self.assertEqual(obj["answer"], "the key is [REDACTED]")
                self.assertNotIn(secret, data)
                self.assertNotIn(json.dumps(secret)[1:-1], data)
            finally:
                os.chdir(previous)

if __name__ == "__main__":
    unittest.main()
