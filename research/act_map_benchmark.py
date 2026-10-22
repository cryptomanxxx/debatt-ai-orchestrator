"""ACT-MAP / ACCL controlled benchmark prototype (Python standard library).

This is an intentionally small, fully synthetic three-variable SCM benchmark. It
separates hidden fixture generation, a budgeted hypothesis proposer, and a
held-out evidence gate. Nothing here demonstrates scientific novelty or real-
world causal transfer. The agent is a deterministic baseline, not an LLM.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
import random
import sys
from typing import Any

PROTOCOL = "act-map-latent-correspondence-v0.1"
VALUES = (1, -1, 2)
HOLDOUT_VALUES = (-2, 3)
LEVELS = (0, 1, 2, 3, 4)
STRATEGIES = ("active", "fixed", "random")


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def validated_seed(seed: str) -> int:
    if not isinstance(seed, str) or not seed.isascii() or not seed.isdecimal() or not 1 <= len(seed) <= 9:
        raise ValueError("invalid_seed")
    return int(seed)


def _random(seed: str, level: int, instance: int) -> random.Random:
    return random.Random(int(digest([PROTOCOL, seed, level, instance])[:16], 16))


def _scm(a: int, b: int, c: int, manipulated: int | None = None, value: int = 0) -> tuple[int, ...]:
    x0 = value if manipulated == 0 else 0
    x1 = value if manipulated == 1 else a * x0
    x2 = value if manipulated == 2 else b * x1 + c * x0
    return x0, x1, x2


def _scope_assignment(seed: str, count: int) -> list[str]:
    """Balanced fixture-private scope allocation, independent of presentation order."""
    labels = ["partial"] * (count // 2) + ["none"] * (count - count // 2)
    rng = random.Random(int(digest(["balanced-scope-v3", seed, count])[:16], 16))
    rng.shuffle(labels)
    return labels


def make_fixture(seed: str, level: int, instance: int, scope: str | None = None) -> dict:
    validated_seed(seed)
    if level not in LEVELS or not isinstance(instance, int) or instance < 0 or instance >= 1000:
        raise ValueError("invalid_case")
    rng = _random(seed, level, instance)
    # Unequal, mixed-sign parameters keep the initial structural motifs distinguishable.
    a, b, c = rng.choice((2, 3, 4)), rng.choice((-4, -3, -2)), rng.choice((1, 2))
    variable_names = [f"v_{rng.getrandbits(36):09x}" for _ in range(3)]
    instrument_names = [f"act_{rng.getrandbits(36):09x}" for _ in range(3)]
    permutation = list(range(3))
    rng.shuffle(permutation)  # private source-index -> observable target-index
    instruments = list(range(3))
    if level >= 3:
        rng.shuffle(instruments)  # private action-index -> target-index
    # Non-alternating, domain-separated deterministic scope assignment.
    # This is reproducible, not a cryptographic blind held-out split.
    truth_scope = "full" if level < 4 else (scope if scope is not None else _scope_assignment(seed, 50)[instance % 50])
    if truth_scope not in ("full", "partial", "none") or (level == 4 and truth_scope == "full"):
        raise ValueError("invalid_scope")
    ta, tb, tc = a, b, c
    if truth_scope == "partial":
        tb -= 7
        tc += 6  # only source root -> mediator submechanism transfers
    if truth_scope == "none":
        ta += 7
        tb -= 7
        tc += 6
    # Exchangeable negative-control observations, independently generated for
    # each public column. They are NOT SCM observations and have no causal
    # interpretation: this isolates the intervention-only discovery task.
    distractor_rng = random.Random(int(digest(["exchangeable-controls-v2", seed, level, instance])[:16], 16))
    observational = [[distractor_rng.randint(-2, 2) for _ in range(3)]
                     for _ in range(8)]
    public = {"protocol": PROTOCOL, "level": level,
              "source": {"variables": ["s_0", "s_1", "s_2"], "a": a, "b": b, "c": c,
                         "equations": ["s_1=a*s_0+u_1", "s_2=b*s_1+c*s_0+u_2"]},
              "target_variables": variable_names, "target_interventions": instrument_names,
              "observations": observational, "max_experiments": 3}
    truth = {"mapping": permutation, "action_to_target": instruments, "scope": truth_scope,
             "target_coefficients": [ta, tb, tc]}
    return {"view": public, "truth": truth, "commitment": digest({"view": public, "truth": truth})}


def experiment(fixture: dict, action: int, value: int) -> list[int]:
    """Private deterministic intervention oracle; never passed to the proposer."""
    if not 0 <= action < 3 or value not in VALUES + HOLDOUT_VALUES:
        raise ValueError("invalid_intervention")
    mapping = fixture["truth"]["mapping"]
    target_affected = fixture["truth"]["action_to_target"][action]
    source_affected = mapping.index(target_affected)
    observed = [0] * 3
    for source_index, outcome in enumerate(_scm(*fixture["truth"]["target_coefficients"], source_affected, value)):
        observed[mapping[source_index]] = outcome
    return observed


def hypothesis(scope: str, mapping: tuple[int, ...], actions: tuple[int, ...]) -> dict:
    return {"scope": scope, "mapping": list(mapping), "action_to_target": list(actions)}


def hypotheses(view: dict, *, candidate_set: list[dict] | None = None) -> list[dict]:
    """Generate hypotheses from the public interface, never from ground truth.

    Level 0/1 may receive task-author-supplied candidates. Level 2-4 generate
    source-to-target correspondences and (level >=3) action correspondences.
    """
    if candidate_set is not None:
        return json.loads(canonical(candidate_set))
    mappings = list(itertools.permutations(range(3)))
    action_maps = [tuple(range(3))] if view["level"] < 3 else mappings
    full = [hypothesis("full", m, a) for m in mappings for a in action_maps]
    if view["level"] != 4:
        return full
    # The partial claim is specifically the source s0 -> s1 mechanism.
    partial = [hypothesis("partial", m, a) for m in mappings for a in action_maps]
    return full + partial + [hypothesis("null", (), ())]


def _predict(view: dict, h: dict, action: int, value: int) -> dict[int, int]:
    if h["scope"] == "null":
        return {}
    mapping = h["mapping"]
    action_map = h["action_to_target"]
    target_variable = action_map[action]
    if target_variable not in mapping:
        return {}
    j = mapping.index(target_variable)
    if h["scope"] == "partial" and j == 2:
        return {}
    source = view["source"]
    outcomes = _scm(source["a"], source["b"], source["c"], j, value)
    length = 3 if h["scope"] == "full" else 2
    return {mapping[i]: outcomes[i] for i in range(length)}


def _fits(view: dict, h: dict, history: list[dict]) -> bool:
    return all(all(record["outcome"][j] == value for j, value in
                   _predict(view, h, record["action"], record["value"]).items())
               for record in history)


def _probe_score(view: dict, candidates: list[dict], action: int, value: int) -> tuple:
    # Distinguish FULL claims first. This is a conventional active model-
    # discrimination heuristic, not a claimed innovation.
    full = [c for c in candidates if c["scope"] == "full"]
    relevant = full or [c for c in candidates if c["scope"] == "partial"]
    groups = [canonical(_predict(view, c, action, value)) for c in relevant]
    count = {k: groups.count(k) for k in set(groups)}
    n = len(groups)
    gini = 1 - sum((v / n) ** 2 for v in count.values()) if n else 0
    return (round(gini, 8), len(count))


def _selection(view: dict, candidates: list[dict], used: set[int], strategy: str,
               rnd: random.Random) -> int:
    untested = [i for i in range(3) if i not in used]
    if strategy == "fixed":
        return untested[0]
    if strategy == "random":
        return rnd.choice(untested)
    # Once discrimination is exhausted, cover the root/mediator roles required
    # for acceptance instead of falling back to arbitrary action order.
    if candidates and all(_probe_score(view, candidates, i, 1)[0] == 0 for i in untested):
        eligible = [h for h in candidates if h["scope"] in ("full", "partial")]
        if len(eligible) == 1:
            h = eligible[0]
            required_actions = [a for a in untested
                                if h["mapping"].index(h["action_to_target"][a]) in (0, 1)]
            if required_actions:
                return required_actions[0]
    return max(untested, key=lambda i: (_probe_score(view, candidates, i, 1), -i))


def _choose(view: dict, surviving: list[dict], history: list[dict]) -> dict | None:
    # Do not certify simply because one candidate survived. Require coverage,
    # independent holdouts and nontrivial causal evidence.
    for scope in ("full", "partial"):
        possible = [h for h in surviving if h["scope"] == scope]
        if len(possible) != 1:
            if possible:
                return None  # An unresolved higher-fidelity correspondence.
            continue
        h = possible[0]
        tested_roles = {h["mapping"].index(h["action_to_target"][r["action"]])
                        for r in history}
        required = {0, 1}  # root and mediator interventions; heldout gate tests all roles
        if not required.issubset(tested_roles):
            return None
        if not any(r["outcome"][h["mapping"][1]] != 0 for r in history
                   if h["action_to_target"][r["action"]] == h["mapping"][0]):
            return None
        return h
    return None


def _valid_hypothesis(proposed: dict) -> bool:
    return (isinstance(proposed, dict) and set(proposed) == {"scope", "mapping", "action_to_target"}
            and proposed["scope"] in ("full", "partial")
            and isinstance(proposed["mapping"], list)
            and isinstance(proposed["action_to_target"], list)
            and all(type(x) is int for x in proposed["mapping"] + proposed["action_to_target"])
            and sorted(proposed["mapping"]) == [0, 1, 2]
            and sorted(proposed["action_to_target"]) == [0, 1, 2])


def evidence_gate(fixture: dict, proposed: dict | None, history: list[dict]) -> dict:
    """Verifier is separate from proposer; hidden holdouts are never in `view`."""
    if proposed is None:
        return {"status": "unresolved", "accepted": False, "reason": "no_unique_supported_mapping"}
    if not _valid_hypothesis(proposed):
        return {"status": "rejected", "accepted": False, "reason": "invalid_hypothesis_schema"}
    view = fixture["view"]
    if proposed["scope"] == "partial" and view["level"] != 4:
        return {"status": "rejected", "accepted": False, "reason": "invalid_scope_for_level"}
    if digest({"view": view, "truth": fixture["truth"]}) != fixture["commitment"]:
        return {"status": "rejected", "accepted": False, "reason": "fixture_commitment_mismatch"}
    if not isinstance(history, list) or len(history) > view["max_experiments"]:
        return {"status": "rejected", "accepted": False, "reason": "discovery_budget_exceeded"}
    # The verifier replays provenance independently: the proposer cannot submit
    # fabricated discovery observations as evidence.
    if any(not isinstance(r, dict) or type(r.get("action")) is not int
           or r.get("action") not in range(3) or type(r.get("value")) is not int or r.get("value") not in VALUES
           or type(r.get("outcome")) is not list
           or len(r["outcome"]) != 3
           or any(type(v) is not int for v in r["outcome"])
           or r["outcome"] != experiment(fixture, r["action"], r["value"])
           for r in history):
        return {"status": "rejected", "accepted": False, "reason": "invalid_evidence_provenance"}
    if proposed["scope"] not in ("full", "partial") or len({r["action"] for r in history}) < 2:
        return {"status": "rejected", "accepted": False, "reason": "insufficient_evidence"}
    tested_roles = {proposed["mapping"].index(proposed["action_to_target"][r["action"]]) for r in history}
    if not {0, 1}.issubset(tested_roles):
        return {"status": "rejected", "accepted": False, "reason": "insufficient_intervention_coverage"}
    if not _fits(view, proposed, history):
        return {"status": "rejected", "accepted": False, "reason": "contradicted_by_discovery"}
    relevant = [a for a in range(3) if _predict(view, proposed, a, 1)]
    if len(relevant) < 2:
        return {"status": "rejected", "accepted": False, "reason": "insufficient_intervention_coverage"}
    for action in relevant:
        for value in HOLDOUT_VALUES:
            actual = experiment(fixture, action, value)
            if any(actual[j] != answer for j, answer in _predict(view, proposed, action, value).items()):
                return {"status": "rejected", "accepted": False, "reason": "heldout_intervention_mismatch"}
    return {"status": "provisionally_supported", "accepted": True,
            "reason": "independent_heldout_interventions_passed", "scope": proposed["scope"],
            "holdout_probes": len(relevant) * len(HOLDOUT_VALUES),
            "certified_source_roles": [0, 1, 2] if proposed["scope"] == "full" else [0, 1]}


def _candidate_set(fixture: dict) -> list[dict] | None:
    level = fixture["view"]["level"]
    if level not in (0, 1):
        return None
    # Candidate sets are a *separate* privileged baseline condition. Unknown-
    # correspondence conditions NEVER receive the hidden mapping.
    truth = fixture["truth"]
    correct = hypothesis("full", tuple(truth["mapping"]), tuple(truth["action_to_target"]))
    if level == 0:
        return [correct]
    # Symmetric independently specified hypotheses: no hidden-truth-dependent RNG.
    # The six candidates are a public, fixed set; only the oracle reveals truth.
    # All mappings must be represented fairly across fixtures.
    mappings = list(itertools.permutations(range(3)))
    return [hypothesis("full", tuple(m), (0, 1, 2)) for m in mappings]



def evaluate(fixture: dict, strategy: str = "active") -> dict:
    if strategy not in STRATEGIES:
        raise ValueError("invalid_strategy")
    if digest({"view": fixture["view"], "truth": fixture["truth"]}) != fixture["commitment"]:
        raise ValueError("fixture_commitment_mismatch")
    view = json.loads(canonical(fixture["view"]))
    candidates = hypotheses(view, candidate_set=_candidate_set(fixture))
    initially = len(candidates)
    history: list[dict] = []
    # Random selection depends only on public inputs, not the hidden truth or commitment.
    rnd = random.Random(int(digest(["probe-policy-v1", view, strategy])[:16], 16))
    for _ in range(view["max_experiments"]):
        viable = [h for h in candidates if _fits(view, h, history)]
        candidate = _choose(view, viable, history)
        if candidate is not None:
            break
        action = _selection(view, viable, {h["action"] for h in history}, strategy, rnd)
        result = experiment(fixture, action, 1)
        history.append({"action": action, "value": 1, "outcome": result})
    viable = [h for h in candidates if _fits(view, h, history)]
    proposed = _choose(view, viable, history)
    gate = evidence_gate(fixture, proposed, history)
    if gate["accepted"]:
        decision = proposed["scope"]
    elif not [h for h in viable if h["scope"] != "null"] and len(history) == 3:
        decision = "no_supported_transfer"  # NOT a universal proof of no transfer
    else:
        decision = "unresolved"
    # VEM-Sci evidence-gated epistemic state. A model/proposer cannot write
    # directly into `accepted_claims`: it is derived only from verifier output.
    accepted_claims = []
    if gate["accepted"]:
        certified_roles = gate["certified_source_roles"]
        accepted_claims.append({
            "claim_id": digest({"proposal": proposed, "scope": decision, "fixture": fixture["commitment"]}),
            "scope": decision, "certified_source_to_target": [
                {"source": j, "target": proposed["mapping"][j]} for j in certified_roles],
            "certified_action_to_target": [
                {"action": a, "target": proposed["action_to_target"][a],
                 "source_role": proposed["mapping"].index(proposed["action_to_target"][a])}
                for a in range(3)
                if proposed["mapping"].index(proposed["action_to_target"][a]) in certified_roles],
            "evidence_commitment": digest(history),
            "heldout_probes": gate["holdout_probes"],
            "status": "provisionally_supported",
        })
    epistemic_state = {"transition": ["proposed", "under_test", gate["status"]],
                       "commitment": fixture["commitment"],
                       "accepted_claims": accepted_claims,
                       "unresolved": not gate["accepted"],
                       "review_required_for_real_world_claims": True}
    true = fixture["truth"]
    correspondence_correct = (proposed is not None
                              and proposed["mapping"] == true["mapping"]
                              and proposed["action_to_target"] == true["action_to_target"])
    false_certification = bool(gate["accepted"] and
                               (decision != true["scope"] or not correspondence_correct))
    return {"level": view["level"], "strategy": strategy, "precommitment": fixture["commitment"],
            "public_fixture": view,
            "candidate_count": initially, "remaining_candidate_count": len(viable),
            "experiments": history, "experiment_cost": len(history),
            "proposal": proposed, "gate": gate, "decision": decision,
            "epistemic_state": epistemic_state,
            # Revealed ONLY after the gate has finished; never used to choose actions.
            "evaluation": {"truth_scope": true["scope"], "truth_mapping": true["mapping"],
                           "truth_action_to_target": true["action_to_target"],
                           "truth_target_coefficients": true["target_coefficients"],
                           "mapping_correct": correspondence_correct,
                           "scope_correct": (decision == true["scope"] or (true["scope"] == "none"
                                               and decision == "no_supported_transfer")),
                           "false_certification": false_certification,
                           "null_abstention_correct": true["scope"] == "none" and decision == "no_supported_transfer"}}


def run_benchmark(seed: str = "20261016", cases_per_level: int = 6) -> dict:
    validated_seed(seed)
    if not isinstance(cases_per_level, int) or not 2 <= cases_per_level <= 50:
        raise ValueError("invalid_cases_per_level")
    scopes = _scope_assignment(seed, cases_per_level)
    fixtures = [make_fixture(seed, level, index, scopes[index] if level == 4 else None)
                for level in LEVELS for index in range(cases_per_level)]
    # Shuffle presentation order independently of the scope assignment stream.
    schedule_rng = random.Random(int(digest(["schedule-v2", seed, cases_per_level])[:16], 16))
    schedule_rng.shuffle(fixtures)
    committed = digest([f["commitment"] for f in fixtures])
    records = [evaluate(f, strategy) for f in fixtures for strategy in STRATEGIES]
    summary = {}
    for strategy in STRATEGIES:
        rows = [r for r in records if r["strategy"] == strategy]
        summary[strategy] = {
            "number_of_cases": len(rows),
            "full_or_partial_accepted": sum(r["gate"]["accepted"] for r in rows),
            "correct_scope": sum(r["evaluation"]["scope_correct"] for r in rows),
            "correct_correspondences": sum(r["evaluation"]["mapping_correct"] and r["gate"]["accepted"] for r in rows),
            "false_certifications": sum(r["evaluation"]["false_certification"] for r in rows),
            "correct_null_abstentions": sum(r["evaluation"]["null_abstention_correct"] for r in rows),
            "total_discovery_probes": sum(r["experiment_cost"] for r in rows),
            "discovery_only_levels_2_to_4_probes": sum(r["experiment_cost"] for r in rows if r["level"] >= 2),
            "privileged_control_levels_0_to_1_probes": sum(r["experiment_cost"] for r in rows if r["level"] <= 1),
            "mean_discovery_probes": round(sum(r["experiment_cost"] for r in rows) / len(rows), 3),
        }
    return {"schema_version": 1, "protocol": PROTOCOL, "researcher": "Professor Oraklet",
            "status": "completed", "seed": seed, "cases_per_level": cases_per_level,
            "precommitted_fixture_root_sha256": committed,
            "limitations": ["CPU-only, deterministic synthetic linear SCMs with 3 variables and zero-noise interventions.",
                "The benchmark mechanism family is known to the baseline; there is no model learning from real observations.",
                "Intervention correspondence is represented as an unknown permutation, not compositional action semantics.",
                "Held-out magnitudes in the same linear family are a methodological gate, not independent real-world evidence.",
                "The active method is established model discrimination; no novelty or state-of-the-art claim.",
                "No LLM inference, DoWhy fitting, cross-domain biological evidence, or real scientific discovery.",
                "Accepted means provisionally supported within this synthetic family, never established science."],
            "summary": summary, "cases": records}


GATE_ADAPTER = "act-map-gate-v1"


def gate_tool(payload: Any) -> dict:
    """Independent verifier for Oraklet's lab (research/act-map.mjs).

    The Node lab builds the fixture, runs Oraklet's chosen interventions and
    sends the fixture, Oraklet's proposal and the discovery record here. This
    module rechecks the commitment, replays every intervention, applies the
    evidence gate and runs the enumeration baseline on the same fixture.
    """
    if not isinstance(payload, dict) or set(payload) != {"fixture", "proposed", "history"}:
        raise ValueError("invalid_gate_input")
    fixture = payload["fixture"]
    if not isinstance(fixture, dict) or set(fixture) != {"view", "truth", "commitment"}:
        raise ValueError("invalid_gate_input")
    view, truth = fixture["view"], fixture["truth"]
    if (not isinstance(view, dict) or view.get("level") not in (2, 3, 4)
            or view.get("max_experiments") != 3 or not isinstance(view.get("source"), dict)
            or any(type(view["source"].get(k)) is not int for k in ("a", "b", "c"))
            or not isinstance(truth, dict)
            or set(truth) != {"mapping", "action_to_target", "scope", "target_coefficients"}):
        raise ValueError("invalid_gate_input")
    gate = evidence_gate(fixture, payload["proposed"], payload["history"])
    baseline = evaluate(fixture, "active")
    return {"gate": gate,
            "baseline": {"strategy": "active", "decision": baseline["decision"],
                         "accepted": baseline["gate"]["accepted"],
                         "experiment_cost": baseline["experiment_cost"],
                         "mapping_correct": baseline["evaluation"]["mapping_correct"],
                         "scope_correct": baseline["evaluation"]["scope_correct"],
                         "false_certification": baseline["evaluation"]["false_certification"]}}


def main() -> None:
    parser = argparse.ArgumentParser(description="ACT-MAP / VEM-Sci synthetic CPU research pilot")
    parser.add_argument("--seed", default="20261016")
    parser.add_argument("--cases-per-level", type=int, default=6)
    parser.add_argument("--output", default="reports/act-map/report.json")
    parser.add_argument("--gate", action="store_true", help="read one lab case as JSON on stdin and verify it")
    args = parser.parse_args()
    if args.gate:
        raw = sys.stdin.read(65536)
        result = gate_tool(json.loads(raw))
        print(canonical({"tool": "act-map", "adapterVersion": GATE_ADAPTER, "result": result}))
        return
    report = run_benchmark(args.seed, args.cases_per_level)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "seed": report["seed"],
                      "commitment": report["precommitted_fixture_root_sha256"],
                      "summary": report["summary"]}, sort_keys=True))


if __name__ == "__main__":
    main()
