"""Pure-standard-library regression and adversarial evidence tests for ACT-MAP."""
import importlib.util
import json
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "research" / "act_map_benchmark.py"
spec = importlib.util.spec_from_file_location("act_map_benchmark", SOURCE)
act = importlib.util.module_from_spec(spec)
spec.loader.exec_module(act)


class ActMapBenchmarkTests(unittest.TestCase):
    def test_deterministic_fixture_and_report(self):
        self.assertEqual(act.make_fixture("20261016", 3, 2), act.make_fixture("20261016", 3, 2))
        report = act.run_benchmark("20261016", 4)
        self.assertEqual(act.digest(report), act.digest(act.run_benchmark("20261016", 4)))
        self.assertEqual(report["status"], "completed")
        self.assertEqual(len(report["cases"]), 5 * 4 * len(act.STRATEGIES))
        self.assertEqual(len(report["precommitted_fixture_root_sha256"]), 64)

    def test_all_levels_and_scopes(self):
        for level in act.LEVELS:
            for i in range(4):
                fixture = act.make_fixture("20261016", level, i)
                view = fixture["view"]
                self.assertNotIn("mapping", json.dumps(view))
                self.assertNotIn("truth", view)
                self.assertEqual(len(view["target_variables"]), 3)
                self.assertEqual(len(view["target_interventions"]), 3)
                for strategy in act.STRATEGIES:
                    run = act.evaluate(fixture, strategy)
                    self.assertLessEqual(run["experiment_cost"], 3)
                    self.assertEqual(run["precommitment"], fixture["commitment"])
                    self.assertEqual(run["evaluation"]["truth_scope"], fixture["truth"]["scope"])
                    self.assertFalse(run["evaluation"]["false_certification"], (level, i, strategy))
                    self.assertTrue(run["evaluation"]["scope_correct"])

    def test_unknown_correspondence_generated_from_public_input(self):
        for level, expected in ((2, 6), (3, 36), (4, 73)):
            view = act.make_fixture("321", level, 0)["view"]
            hypotheses = act.hypotheses(view)
            self.assertEqual(len(hypotheses), expected)
            self.assertFalse(any("truth" in h for h in hypotheses))
        self.assertEqual(len(act._candidate_set(act.make_fixture("3", 0, 0))), 1)
        self.assertEqual(len(act._candidate_set(act.make_fixture("3", 1, 0))), 3)
        self.assertIsNone(act._candidate_set(act.make_fixture("3", 2, 0)))

    def test_synthetic_null_not_certified_as_transfer(self):
        for seed in ("2", "42", "99", "20261016"):
            for i in (1, 3, 5):
                fixture = act.make_fixture(seed, 4, i)
                self.assertEqual(fixture["truth"]["scope"], "none")
                for strategy in act.STRATEGIES:
                    decision = act.evaluate(fixture, strategy)
                    self.assertFalse(decision["gate"]["accepted"])
                    self.assertEqual(decision["decision"], "no_supported_transfer")

    def test_partial_transfer_only_certifies_restricted_scope(self):
        fixture = act.make_fixture("20261016", 4, 0)
        for strategy in act.STRATEGIES:
            result = act.evaluate(fixture, strategy)
            self.assertTrue(result["gate"]["accepted"])
            self.assertEqual(result["gate"]["scope"], "partial")
            self.assertEqual(result["decision"], "partial")

    def test_gate_rejects_unsupported_claim_and_fake_evidence(self):
        fixture = act.make_fixture("20261016", 3, 1)
        correct = act.hypothesis("full", tuple(fixture["truth"]["mapping"]),
                                  tuple(fixture["truth"]["action_to_target"]))
        self.assertFalse(act.evidence_gate(fixture, correct, [])["accepted"])
        self.assertEqual(act.evidence_gate(fixture, correct, [])['reason'], 'insufficient_evidence')
        history = [{"action": a, "value": 1, "outcome": act.experiment(fixture, a, 1)} for a in range(3)]
        self.assertTrue(act.evidence_gate(fixture, correct, history)["accepted"])
        forged = json.loads(json.dumps(history))
        forged[0]["outcome"][0] += 1
        self.assertEqual(act.evidence_gate(fixture, correct, forged)["reason"], "invalid_evidence_provenance")
        wrong = act.hypothesis("full", tuple(reversed(correct["mapping"])),
                               tuple(correct["action_to_target"]))
        self.assertFalse(act.evidence_gate(fixture, wrong, history)["accepted"])
        self.assertEqual(act.evidence_gate(fixture, {"scope":"full", "mapping":[0,0,0],
                                "action_to_target":[0,1,2]}, history)["reason"], "invalid_hypothesis_schema")

    def test_discovery_and_heldout_values_disjoint(self):
        self.assertTrue(set(act.VALUES).isdisjoint(act.HOLDOUT_VALUES))
        for level in act.LEVELS:
            fixture = act.make_fixture("12", level, 0)
            report = act.evaluate(fixture)
            self.assertTrue(all(r["value"] in act.VALUES for r in report["experiments"]))

    def test_invalid_inputs_are_bounded(self):
        for seed in ("", "abc", "1234567890", "-1", "１２３"):
            with self.assertRaisesRegex(ValueError, "invalid_seed"):
                act.run_benchmark(seed, 4)
        with self.assertRaisesRegex(ValueError, "invalid_cases_per_level"):
            act.run_benchmark("1", 0)
        with self.assertRaisesRegex(ValueError, "invalid_case"):
            act.make_fixture("1", 5, 0)
        with self.assertRaisesRegex(ValueError, "invalid_strategy"):
            act.evaluate(act.make_fixture("1", 2, 0), "hack")

    def test_multiple_seeds_do_not_false_certify(self):
        for seed in ("1", "2", "42", "99", "123456789"):
            result = act.run_benchmark(seed, 8)
            for item in result["summary"].values():
                self.assertEqual(item["false_certifications"], 0)
                self.assertEqual(item["correct_scope"], item["number_of_cases"])


if __name__ == "__main__":
    unittest.main()
