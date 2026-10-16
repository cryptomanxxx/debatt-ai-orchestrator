import unittest
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

if __name__ == "__main__":
    unittest.main()
