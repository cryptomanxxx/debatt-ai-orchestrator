"""ACT-MAP with a mechanism Oraklet designs himself (research/ACT-MAP-LAB.md).

Oraklet writes a declarative spec, never code: a linear, noise-free causal
mechanism over 3-4 variables (a DAG whose edges run from lower to higher
index, with integer coefficients) and a preregistered prediction about it.
This module is the independent verifier for the Node lab (act-map-design.mjs):

- ``analyze`` checks the spec and computes, by enumeration, whether the
  mechanism is identifiable from value-1 interventions and the fewest such
  interventions that leave exactly one correspondence;
- ``gate`` rechecks a fixture's commitment, replays Oraklet's interventions,
  applies the evidence gate (coverage, fit, held-out intervention sizes) and
  runs the enumeration baseline on the same fixture.

Python standard library only. Synthetic; no claim of real-world discovery.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import sys
from typing import Any

PROTOCOL = "act-map-design-v1"
ADAPTER = "act-map-design-v1"
VALUES = (1, -1, 2)
HOLDOUT_VALUES = (-2, 3)
COEFFICIENTS = (-4, -3, -2, -1, 1, 2, 3, 4)
# The fixed ACT-MAP source (s_0 -> s_1 -> s_2 plus s_0 -> s_2) is not a new design.
STANDARD_EDGES = ((0, 1), (0, 2), (1, 2))


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def validate_spec(spec: Any) -> dict:
    """{"variables": n, "edges": [[u, v, coef], ...]} with the lab's bounds, or ValueError."""
    if not isinstance(spec, dict) or set(spec) != {"variables", "edges"}:
        raise ValueError("invalid_spec")
    n, edges = spec["variables"], spec["edges"]
    if type(n) is not int or n not in (3, 4) or not isinstance(edges, list) or not 2 <= len(edges) <= 6:
        raise ValueError("invalid_spec")
    seen = set()
    for e in edges:
        if (not isinstance(e, list) or len(e) != 3 or any(type(x) is not int for x in e)
                or not 0 <= e[0] < e[1] < n or e[2] not in COEFFICIENTS or (e[0], e[1]) in seen):
            raise ValueError("invalid_spec")
        seen.add((e[0], e[1]))
    if [e[:2] for e in edges] != sorted(e[:2] for e in edges):
        raise ValueError("invalid_spec")
    if any(not any(e[1] == k for e in edges) for k in range(1, n)):
        raise ValueError("invalid_spec")  # s_0 is the only root
    if n == 3 and tuple(sorted(seen)) == STANDARD_EDGES:
        raise ValueError("standard_mechanism")
    return {"variables": n, "edges": [list(e) for e in edges]}


def simulate(n: int, edges: list, coefficients: list, role: int, value: int) -> list:
    """Set source role ``role`` to ``value``; every other variable follows its equation."""
    x = [0] * n
    for k in range(n):
        x[k] = value if k == role else sum(c * x[e[0]] for e, c in zip(edges, coefficients) if e[1] == k)
    return x


def coefficients_of(spec: dict) -> list:
    return [e[2] for e in spec["edges"]]


def experiment(fixture: dict, action: int, value: int) -> list:
    """Private intervention oracle on the hidden target: outcomes indexed by target variable."""
    spec, truth = fixture["view"]["spec"], fixture["truth"]
    n = spec["variables"]
    if not 0 <= action < n or value not in VALUES + HOLDOUT_VALUES:
        raise ValueError("invalid_intervention")
    role = truth["mapping"].index(truth["action_to_target"][action])
    x = simulate(n, spec["edges"], truth["target_coefficients"], role, value)
    observed = [0] * n
    for k, v in enumerate(x):
        observed[truth["mapping"][k]] = v
    return observed


def predict(spec: dict, h: dict, action: int, value: int) -> list:
    """What a full-transfer hypothesis predicts with the source's own coefficients."""
    n = spec["variables"]
    role = h["mapping"].index(h["action_to_target"][action])
    x = simulate(n, spec["edges"], coefficients_of(spec), role, value)
    observed = [0] * n
    for k, v in enumerate(x):
        observed[h["mapping"][k]] = v
    return observed


def hypotheses(n: int) -> list:
    perms = [list(p) for p in itertools.permutations(range(n))]
    return [{"mapping": m, "action_to_target": a} for m in perms for a in perms]


def fits(spec: dict, h: dict, history: list) -> bool:
    return all(predict(spec, h, r["action"], r["value"]) == r["outcome"] for r in history)


def parents_role(spec: dict, role: int) -> bool:
    return any(e[0] == role for e in spec["edges"])


def covered(spec: dict, h: dict, history: list) -> bool:
    """Every source role with an outgoing edge was set by some intervention."""
    tested = {h["mapping"].index(h["action_to_target"][r["action"]]) for r in history}
    return all(role in tested for role in range(spec["variables"]) if parents_role(spec, role))


def valid_hypothesis(proposed: Any, n: int) -> bool:
    return (isinstance(proposed, dict) and set(proposed) == {"scope", "mapping", "action_to_target"}
            and proposed["scope"] == "full"
            and all(isinstance(proposed[k], list) and all(type(x) is int for x in proposed[k])
                    and sorted(proposed[k]) == list(range(n)) for k in ("mapping", "action_to_target")))


def evidence_gate(fixture: dict, proposed: Any, history: Any) -> dict:
    view = fixture["view"]
    spec = view["spec"]
    n = spec["variables"]
    if proposed is None:
        return {"status": "unresolved", "accepted": False, "reason": "no_unique_supported_mapping"}
    if not valid_hypothesis(proposed, n):
        return {"status": "rejected", "accepted": False, "reason": "invalid_hypothesis_schema"}
    if digest({"view": view, "truth": fixture["truth"]}) != fixture["commitment"]:
        return {"status": "rejected", "accepted": False, "reason": "fixture_commitment_mismatch"}
    if not isinstance(history, list) or len(history) > view["max_experiments"]:
        return {"status": "rejected", "accepted": False, "reason": "discovery_budget_exceeded"}
    if any(not isinstance(r, dict) or type(r.get("action")) is not int or r.get("action") not in range(n)
           or type(r.get("value")) is not int or r.get("value") not in VALUES
           or r.get("outcome") != experiment(fixture, r["action"], r["value"]) for r in history):
        return {"status": "rejected", "accepted": False, "reason": "invalid_evidence_provenance"}
    if len({r["action"] for r in history}) < 2:
        return {"status": "rejected", "accepted": False, "reason": "insufficient_evidence"}
    if not covered(spec, proposed, history):
        return {"status": "rejected", "accepted": False, "reason": "insufficient_intervention_coverage"}
    if not fits(spec, proposed, history):
        return {"status": "rejected", "accepted": False, "reason": "contradicted_by_discovery"}
    for action in range(n):
        if not parents_role(spec, proposed["mapping"].index(proposed["action_to_target"][action])):
            continue
        for value in HOLDOUT_VALUES:
            if predict(spec, proposed, action, value) != experiment(fixture, action, value):
                return {"status": "rejected", "accepted": False, "reason": "heldout_intervention_mismatch"}
    return {"status": "provisionally_supported", "accepted": True, "reason": "independent_heldout_interventions_passed"}


def baseline(fixture: dict) -> dict:
    """Active enumeration: value-1 interventions, each chosen to split the surviving hypotheses most."""
    view, truth = fixture["view"], fixture["truth"]
    spec, n = view["spec"], view["spec"]["variables"]
    candidates, history = hypotheses(n), []
    for _ in range(view["max_experiments"]):
        viable = [h for h in candidates if fits(spec, h, history)]
        if not viable or (len(viable) == 1 and covered(spec, viable[0], history) and len(history) >= 2):
            break
        untested = [a for a in range(n) if a not in {r["action"] for r in history}]
        if not untested:
            break
        action = max(untested, key=lambda a: (len({tuple(predict(spec, h, a, 1)) for h in viable}), -a))
        history.append({"action": action, "value": 1, "outcome": experiment(fixture, action, 1)})
    viable = [h for h in candidates if fits(spec, h, history)]
    proposed = {"scope": "full", **viable[0]} if len(viable) == 1 else None
    gate = evidence_gate(fixture, proposed, history)
    decision = "full" if gate["accepted"] else "none" if not viable else "unresolved"
    mapping_correct = bool(proposed) and proposed["mapping"] == truth["mapping"] and proposed["action_to_target"] == truth["action_to_target"]
    return {"strategy": "active", "decision": decision, "accepted": gate["accepted"], "experiment_cost": len(history),
            "mapping_correct": mapping_correct, "scope_correct": decision == truth["scope"],
            "false_certification": gate["accepted"] and not (truth["scope"] == "full" and mapping_correct)}


def analyze(spec: Any) -> dict:
    """Identifiability of a design from value-1 interventions, on a canonical full-transfer target."""
    spec = validate_spec(spec)
    n = spec["variables"]
    identity = list(range(n))
    fixture = {"view": {"spec": spec}, "truth": {"mapping": identity, "action_to_target": identity,
                                                  "target_coefficients": coefficients_of(spec)}}
    candidates = hypotheses(n)
    outcome = {a: experiment(fixture, a, 1) for a in range(n)}

    def consistent(actions: tuple) -> int:
        history = [{"action": a, "value": 1, "outcome": outcome[a]} for a in actions]
        return sum(fits(spec, h, history) for h in candidates)

    remaining = consistent(tuple(range(n)))
    minimum = None
    if remaining == 1:
        minimum = next(k for k in range(1, n + 1)
                       if any(consistent(s) == 1 for s in itertools.combinations(range(n), k)))
    return {"spec": spec, "identifiable": remaining == 1, "minInterventions": minimum,
            "consistentAfterAll": remaining}


def tool(payload: Any) -> dict:
    if not isinstance(payload, dict) or payload.get("op") not in ("analyze", "gate"):
        raise ValueError("invalid_tool_input")
    if payload["op"] == "analyze":
        if set(payload) != {"op", "spec"}:
            raise ValueError("invalid_tool_input")
        return {"analysis": analyze(payload["spec"])}
    if set(payload) != {"op", "fixture", "proposed", "history"}:
        raise ValueError("invalid_tool_input")
    fixture = payload["fixture"]
    if (not isinstance(fixture, dict) or set(fixture) != {"view", "truth", "commitment"}
            or not isinstance(fixture["view"], dict) or fixture["view"].get("protocol") != PROTOCOL
            or not isinstance(fixture["truth"], dict)
            or set(fixture["truth"]) != {"mapping", "action_to_target", "scope", "target_coefficients"}
            or fixture["truth"]["scope"] not in ("full", "none")):
        raise ValueError("invalid_tool_input")
    spec = validate_spec(fixture["view"].get("spec"))
    if (fixture["view"]["spec"] != spec or fixture["view"].get("max_experiments") != spec["variables"]
            or len(fixture["truth"]["target_coefficients"]) != len(spec["edges"])):
        raise ValueError("invalid_tool_input")
    if digest({"view": fixture["view"], "truth": fixture["truth"]}) != fixture["commitment"]:
        raise ValueError("fixture_commitment_mismatch")
    return {"gate": evidence_gate(fixture, payload["proposed"], payload["history"]), "baseline": baseline(fixture)}


def main() -> None:
    raw = sys.stdin.read(65536)
    print(canonical({"tool": "act-map-design", "adapterVersion": ADAPTER, "result": tool(json.loads(raw))}))


if __name__ == "__main__":
    main()
