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
        self.assertEqual(len(act._candidate_set(act.make_fixture("3", 1, 0))), 6)
        self.assertIsNone(act._candidate_set(act.make_fixture("3", 2, 0)))

    def test_synthetic_null_not_certified_as_transfer(self):
        for seed in ("2", "42", "99", "20261016"):
            for i in (1, 3, 5):
                fixture = act.make_fixture(seed, 4, i)
                if fixture["truth"]["scope"] != "none":
                    continue
                for strategy in act.STRATEGIES:
                    decision = act.evaluate(fixture, strategy)
                    self.assertFalse(decision["gate"]["accepted"])
                    self.assertEqual(decision["decision"], "no_supported_transfer")

    def test_partial_transfer_only_certifies_restricted_scope(self):
        fixture = next(act.make_fixture("20261016", 4, i) for i in range(100)
                       if act.make_fixture("20261016", 4, i)["truth"]["scope"] == "partial")
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

    def test_random_policy_is_hidden_truth_independent(self):
        import random
        f = act.make_fixture("20261016", 3, 2)
        altered = json.loads(json.dumps(f))
        altered["truth"]["mapping"] = list(reversed(altered["truth"]["mapping"]))
        altered["commitment"] = act.digest({"view": altered["view"], "truth": altered["truth"]})
        # First probe must depend only on identical public view.
        def first_probe(fixture):
            view = fixture["view"]
            rng = random.Random(int(act.digest(["probe-policy-v1", view, "random"])[:16], 16))
            return act._selection(view, act.hypotheses(view), set(), "random", rng)
        self.assertEqual(first_probe(f), first_probe(altered))

    def test_active_fulfills_known_acceptance_coverage(self):
        f = act.make_fixture("20261016", 0, 0)
        h = act._candidate_set(f)[0]
        first = act._selection(f["view"], [h], set(), "active", __import__("random").Random(0))
        second = act._selection(f["view"], [h], {first}, "active", __import__("random").Random(0))
        roles = {h["mapping"].index(h["action_to_target"][a]) for a in (first, second)}
        self.assertEqual(roles, {0, 1})
        self.assertEqual(act.evaluate(f, "active")["experiment_cost"], 2)

    def test_level_one_candidates_do_not_reveal_truth_by_position(self):
        positions = []
        for i in range(20):
            f = act.make_fixture("20261016", 1, i)
            candidates = act._candidate_set(f)
            correct = act.hypothesis("full", tuple(f["truth"]["mapping"]),
                                     tuple(f["truth"]["action_to_target"]))
            positions.append(candidates.index(correct))
        self.assertGreater(len(set(positions)), 1)

    def test_fixture_integrity_and_discovery_budget(self):
        f = act.make_fixture("20261016", 3, 1)
        h = act.hypothesis("full", tuple(f["truth"]["mapping"]), tuple(f["truth"]["action_to_target"]))
        history = [{"action": a, "value": 1, "outcome": act.experiment(f, a, 1)} for a in range(3)]
        over_budget = history + [{"action": 0, "value": -1, "outcome": act.experiment(f, 0, -1)}]
        self.assertEqual(act.evidence_gate(f, h, over_budget)["reason"], "discovery_budget_exceeded")
        tampered = json.loads(json.dumps(f))
        tampered["truth"]["target_coefficients"][0] += 1
        with self.assertRaisesRegex(ValueError, "fixture_commitment_mismatch"):
            act.evaluate(tampered)
        self.assertEqual(act.evidence_gate(tampered, h, history)["reason"], "fixture_commitment_mismatch")

    def test_accepted_claim_records_only_certified_action_roles(self):
        for level, index in ((3, 1), (4, None)):
            if index is None:
                index = next(i for i in range(100) if act.make_fixture("20261016", 4, i)["truth"]["scope"] == "partial")
            f = act.make_fixture("20261016", level, index)
            result = act.evaluate(f, "active")
            self.assertTrue(result["gate"]["accepted"])
            claim = result["epistemic_state"]["accepted_claims"][0]
            certified = claim["certified_action_to_target"]
            expected_roles = {0, 1, 2} if level == 3 else {0, 1}
            self.assertEqual({entry["source_role"] for entry in certified}, expected_roles)
            for entry in certified:
                self.assertEqual(entry["target"], f["truth"]["action_to_target"][entry["action"]])

    def test_observations_are_role_independent_negative_controls(self):
        f = act.make_fixture("20261016", 3, 2)
        for row in f["view"]["observations"]:
            self.assertEqual(len(row), 3)
            self.assertTrue(all(-2 <= x <= 2 for x in row))
        # A counterfactual remapping cannot change the public controls.
        changed = json.loads(json.dumps(f))
        changed["truth"]["mapping"].reverse()
        self.assertEqual(changed["view"]["observations"], f["view"]["observations"])

    def test_candidate_order_not_public_replayable(self):
        positions = []
        for i in range(50):
            f = act.make_fixture("20261016", 1, i)
            candidates = act._candidate_set(f)
            correct = act.hypothesis("full", tuple(f["truth"]["mapping"]),
                                     tuple(f["truth"]["action_to_target"]))
            positions.append(candidates.index(correct))
        self.assertEqual(set(positions), set(range(6)))

    def test_level_four_scopes_are_not_instance_parity(self):
        scopes = [act.make_fixture("20261016", 4, i)["truth"]["scope"] for i in range(40)]
        self.assertEqual(set(scopes), {"partial", "none"})
        self.assertTrue(any(scopes[i] == scopes[i + 1] for i in range(len(scopes) - 1)))
        report = act.run_benchmark("20261016", 12)
        level4 = [r["evaluation"]["truth_scope"] for r in report["cases"]
                  if r["level"] == 4 and r["strategy"] == "active"]
        self.assertNotEqual(level4, scopes[:12])



    def test_balanced_scope_and_malformed_gate(self):
        for seed in ("4", "5", "20261016"):
            report = act.run_benchmark(seed, 2)
            scopes = [r["evaluation"]["truth_scope"] for r in report["cases"]
                      if r["level"] == 4 and r["strategy"] == "active"]
            self.assertEqual(sorted(scopes), ["none", "partial"])
        f = act.make_fixture("42", 3, 1)
        bad = {"scope": "full", "mapping": [0, "x", 2], "action_to_target": [0, 1, 2]}
        self.assertEqual(act.evidence_gate(f, bad, [])["reason"], "invalid_hypothesis_schema")
        h = act.hypothesis("full", tuple(f["truth"]["mapping"]),
                           tuple(f["truth"]["action_to_target"]))
        excluded = next(a for a in range(3)
                        if h["mapping"].index(h["action_to_target"][a]) == 2)
        history = [{"action": a, "value": 1, "outcome": act.experiment(f, a, 1)}
                   for a in range(3) if a != excluded]
        # Root and mediator are present; omission of either must be rejected.
        root = next(a for a in range(3)
                    if h["mapping"].index(h["action_to_target"][a]) == 0)
        lacking_root = [{"action": a, "value": 1, "outcome": act.experiment(f, a, 1)}
                        for a in range(3) if a != root]
        self.assertEqual(act.evidence_gate(f, h, lacking_root)["reason"],
                         "insufficient_intervention_coverage")

    def test_gate_tool_verifies_a_lab_case_and_runs_the_baseline(self):
        f = act.make_fixture("42", 3, 1)
        fixture = {"view": f["view"], "truth": f["truth"], "commitment": f["commitment"]}
        h = act.hypothesis("full", tuple(f["truth"]["mapping"]), tuple(f["truth"]["action_to_target"]))
        history = [{"action": a, "value": 1, "outcome": act.experiment(f, a, 1)} for a in range(3)]
        result = act.gate_tool({"fixture": fixture, "proposed": h, "history": history})
        self.assertEqual(result["gate"]["status"], "provisionally_supported")
        self.assertTrue(result["baseline"]["scope_correct"])
        forged = [dict(history[0], outcome=[9, 9, 9])] + history[1:]
        self.assertEqual(act.gate_tool({"fixture": fixture, "proposed": h, "history": forged})["gate"]["reason"],
                         "invalid_evidence_provenance")
        self.assertEqual(act.gate_tool({"fixture": fixture, "proposed": None, "history": []})["gate"]["status"], "unresolved")
        with self.assertRaises(ValueError):
            act.gate_tool({"fixture": fixture, "proposed": h})
        with self.assertRaises(ValueError):
            act.gate_tool({"fixture": dict(fixture, view=dict(f["view"], level=1)), "proposed": h, "history": history})


if __name__ == "__main__":
    unittest.main()
