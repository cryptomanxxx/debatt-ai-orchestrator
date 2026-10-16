#!/usr/bin/env python3
"""GitHub Actions model router for fixed scientific pilots. No Cloudflare dependency."""
import datetime
import http.client
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

PROVIDERS = {
    "blablador": {
        "base": "https://api.blablador.fz-juelich.de/v1",
        "secret": "BLABLADOR_API_KEY",
        "models": ("alias-kimi-k3-1m", "alias-glm-5.3-flash", "alias-deepseek-v41-flash-booster",
                   "alias-mimo-v2.6-pro", "alias-qwen3.8-flash-next", "alias-fast"),
    },
    "hip": {
        "base": "https://llm-service.ai.tu-darmstadt.de/v1",
        "secret": "HIP_API_KEY",
        "models": ("Kimi-K2.6", "GLM-5.2-AWQ-INT4", "Mistral-Medium-3.5-128B",
                   "Qwen3.8-27B", "Ministral-3-14B-Instruct-2512"),
    },
}
# Operator-owned priority profiles: not scientific performance rankings.
PROFILES = {
    "reasoning": (("blablador", "alias-kimi-k3-1m"), ("hip", "Kimi-K2.6"),
                  ("blablador", "alias-glm-5.3-flash")),
    "literature": (("hip", "Mistral-Medium-3.5-128B"), ("blablador", "alias-kimi-k3-1m")),
    "coding": (("blablador", "alias-glm-5.3-flash"), ("hip", "GLM-5.2-AWQ-INT4")),
    "fast": (("blablador", "alias-fast"), ("hip", "Ministral-3-14B-Instruct-2512")),
}
PROMPTS = {
    "reasoning": "Solve this exactly, showing a short check: for x^2 - 5x + 6 = 0, list both real roots.",
    "literature": "Explain how one can distinguish a hypothesis from evidence in a scientific literature review. State two limitations.",
    "coding": "Explain how to test a Python function for edge cases, then provide one simple test for a pure square function.",
    "fast": "Give a concise explanation of the difference between correlation and causation.",
}
MAX_RESPONSE_BYTES = 65536

class RouterError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def http_json(base, key, path, payload=None, opener=None):
    if not key or len(key) < 8 or any(x.isspace() for x in key):
        raise RouterError("invalid_api_key")
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Authorization": "Bearer " + key, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(base + path, data=data, headers=headers,
                                     method="POST" if data is not None else "GET")
    opener = opener or urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=45) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise RouterError("oversized_response")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        status = e.code
        e.close()
        raise RouterError("http_" + str(status)) from None
    except (urllib.error.URLError, OSError, ValueError, TypeError,
            http.client.HTTPException):
        raise RouterError("transport_or_json_error") from None

def discovered_ids(data):
    rows = data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise RouterError("invalid_model_discovery")
    return {row["id"] for row in rows if isinstance(row, dict) and
            isinstance(row.get("id"), str) and 0 < len(row["id"]) <= 200}

def candidates(task, provider="auto"):
    if task not in PROFILES or provider not in ("auto", *PROVIDERS):
        raise ValueError("invalid_route_options")
    return [(p, m) for p, m in PROFILES[task] if provider == "auto" or p == provider]

def choose_model(task, keys, provider="auto", discover=http_json):
    errors = []
    checked = set()
    for name, model in candidates(task, provider):
        key = keys.get(PROVIDERS[name]["secret"], "")
        if not key:
            errors.append({"provider": name, "error": "key_not_configured"})
            continue
        if name not in checked:
            try:
                data = discover(PROVIDERS[name]["base"], key, "/models")
                ids = discovered_ids(data)
                keys["__discovered_" + name] = ids
            except RouterError as error:
                errors.append({"provider": name, "error": str(error)})
                checked.add(name)
                continue
            checked.add(name)
        if model in keys.get("__discovered_" + name, set()):
            return {"provider": name, "model": model, "reason": "fixed_profile_priority_and_discovery",
                    "discovery_issues": errors}
        errors.append({"provider": name, "model": model, "error": "not_listed"})
    raise RouterError("no_available_allowlisted_model")

def run(task, env, discover=http_json, complete=http_json):
    provider = env.get("ROUTER_PROVIDER", "auto")
    if task not in PROMPTS:
        raise ValueError("invalid_task")
    keys = {v["secret"]: env.get(v["secret"], "") for v in PROVIDERS.values()}
    selection = choose_model(task, keys, provider, discover)
    name, model = selection["provider"], selection["model"]
    started = time.monotonic()
    # Fixed maximum of ONE completion. Explicit task prompts only, not executable code.
    result = complete(PROVIDERS[name]["base"], keys[PROVIDERS[name]["secret"]],
                      "/chat/completions", {"model": model,
                      "messages": [{"role": "user", "content": PROMPTS[task]}],
                      "max_tokens": 512, "temperature": 0})
    try:
        answer = result["choices"][0]["message"]["content"]
        finish = result["choices"][0].get("finish_reason")
        returned_model = result.get("model")
        if not isinstance(answer, str) or not answer.strip() or len(answer) > 16000:
            raise ValueError()
        if not isinstance(returned_model, str) or returned_model != model:
            raise RouterError("model_identity_unverified")
        if finish != "stop":
            raise RouterError("response_not_complete")
    except (KeyError, IndexError, TypeError, ValueError):
        raise RouterError("invalid_model_response") from None
    # Never confuse a completed response with scientifically verified correctness.
    return {"schema_version": 1, "status": "completed_unverified",
            "task": task, "prompt": PROMPTS[task],
            "selected": {"provider": name, "model": model, "reason": selection["reason"]},
            "discovery_issues": selection["discovery_issues"],
            "latency_seconds": round(time.monotonic() - started, 3),
            "answer": answer[:6000], "finish_reason": finish,
            "scientifically_verified": False,
            "limitations": "A manual routed inference smoke test, not an evidence-trained model selector."}

def main():
    env = dict(os.environ)
    task = env.get("ROUTER_TASK", "reasoning")
    dest = Path("reports/scientific-model-router")
    dest.mkdir(parents=True, exist_ok=True)
    report = {"schema_version": 1, "status": "preflight", "task": task,
              "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    def save():
        text = json.dumps(report, indent=2, ensure_ascii=False)
        for p in PROVIDERS.values():
            secret = env.get(p["secret"], "")
            if secret:
                text = text.replace(secret, "[REDACTED]")
        (dest / "report.json").write_text(text + "\n", encoding="utf-8")
    save()
    try:
        report = run(task, env)
        save()
        print("Selected:", report["selected"]["provider"], report["selected"]["model"],
              "| result: completed (not scientifically verified)")
    except (RouterError, ValueError) as error:
        safe = str(error)
        report["status"] = "failed"
        report["error"] = safe if re.fullmatch(r"[a-z0-9_]+", safe) else "execution_failed"
        save()
        raise SystemExit("Model routing failed: " + report["error"]) from None

if __name__ == "__main__":
    main()
