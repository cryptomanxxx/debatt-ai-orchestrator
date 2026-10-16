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


def make_fixture(seed: str, level: int, instance: int) -> dict:
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
    truth_scope = "full" if level < 4 else ("partial" if instance % 2 == 0 else "none")
    ta, tb, tc = a, b, c
    if truth_scope == "partial":
        tb -= 7
        tc += 6  # only source root -> mediator submechanism transfers
    if truth_scope == "none":
        ta += 7
        tb -= 7
        tc += 6
    observational = []
    for _ in range(8):
        # Exogenous disturbances make observation-only, zero-intercept inference
        # uninformative for the zero-noise intervention oracle. No true alignment leaks.
        x0 = rng.randint(-2, 2)
        x1 = ta * x0 + rng.randint(-2, 2)
        x2 = tb * x1 + tc * x0 + rng.randint(-2, 2)
        source_order = (x0, x1, x2)
        measured = [0] * 3
        for si, ti in enumerate(permutation):
            measured[ti] = source_order[si]
        observational.append(measured)
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
            and sorted(proposed["mapping"]) == [0, 1, 2]
            and sorted(proposed["action_to_target"]) == [0, 1, 2]
            and all(type(x) is int for x in proposed["mapping"] + proposed["action_to_target"]))


def evidence_gate(fixture: dict, proposed: dict | None, history: list[dict]) -> dict:
    """Verifier is separate from proposer; hidden holdouts are never in `view`."""
    if proposed is None:
        return {"status": "unresolved", "accepted": False, "reason": "no_unique_supported_mapping"}
    if not _valid_hypothesis(proposed):
        return {"status": "rejected", "accepted": False, "reason": "invalid_hypothesis_schema"}
    view = fixture["view"]
    if digest({"view": view, "truth": fixture["truth"]}) != fixture["commitment"]:
        return {"status": "rejected", "accepted": False, "reason": "fixture_commitment_mismatch"}
    if not isinstance(history, list) or len(history) > view["max_experiments"]:
        return {"status": "rejected", "accepted": False, "reason": "discovery_budget_exceeded"}
    # The verifier replays provenance independently: the proposer cannot submit
    # fabricated discovery observations as evidence.
    if any(not isinstance(r, dict) or not isinstance(r.get("action"), int)
           or r.get("action") not in range(3) or r.get("value") not in VALUES
           or r.get("outcome") != experiment(fixture, r["action"], r["value"])
           for r in history):
        return {"status": "rejected", "accepted": False, "reason": "invalid_evidence_provenance"}
    if proposed["scope"] not in ("full", "partial") or len({r["action"] for r in history}) < 2:
        return {"status": "rejected", "accepted": False, "reason": "insufficient_evidence"}
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
    others = [c for c in hypotheses({**fixture["view"], "level": 2}) if c != correct]
    rnd = _random("314159", level, len(fixture["view"]["observations"]))
    candidates = [correct, *rnd.sample(others, 2)]
    # A separately seeded shuffle prevents list position from revealing truth.
    order_rng = random.Random(int(digest(["candidate-order-v1", fixture["view"]])[:16], 16))
    order_rng.shuffle(candidates)
    return candidates


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
    fixtures = [make_fixture(seed, level, index) for level in LEVELS for index in range(cases_per_level)]
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


def main() -> None:
    parser = argparse.ArgumentParser(description="ACT-MAP / VEM-Sci synthetic CPU research pilot")
    parser.add_argument("--seed", default="20261016")
    parser.add_argument("--cases-per-level", type=int, default=6)
    parser.add_argument("--output", default="reports/act-map/report.json")
    args = parser.parse_args()
    report = run_benchmark(args.seed, args.cases_per_level)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "seed": report["seed"],
                      "commitment": report["precommitted_fixture_root_sha256"],
                      "summary": report["summary"]}, sort_keys=True))


if __name__ == "__main__":
    main()
