#!/usr/bin/env python3
"""Manual, bounded comparison of Blablador chat models. Python standard library only."""
import json
import http.client
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from cloudflare_benchmark_client import catalog_models, benchmark_completion, GatewayError, SAFE_ERRORS

BASE = "https://api.blablador.fz-juelich.de/v1"
ALLOW = {
    "alias-kimi-k3-1m", "alias-glm-5.3-flash",
    "alias-deepseek-v41-flash-booster", "alias-mimo-v2.6-pro",
    "alias-mimo-v2.6-flash", "alias-qwen3.8-flash-next",
    "alias-fast",
}
TASKS = [
    ("algebra", "Solve 3*x + 7 = 22. Reply ONLY with the integer value of x.", "5"),
    ("probability", "A fair six-sided die is rolled once. What is the probability of rolling an even number? Reply ONLY with a reduced fraction a/b.", "1/2"),
    ("chemistry", "What is the chemical symbol for sodium? Reply ONLY with the chemical symbol.", "Na"),
]
# Strict exact-match tasks intentionally avoid subjective grading.
def query(key, path, payload=None):
    if path == "/models" and payload is None:
        return catalog_models(key, "blablador")
    if path == "/chat/completions" and payload is not None:
        return benchmark_completion(key, "blablador", payload)
    raise GatewayError("invalid_benchmark_route")

def main():
    key = os.getenv("ORCHESTRATOR_API_KEY", "")
    if not key:
        sys.exit("Missing ORCHESTRATOR_API_KEY research-inference environment secret.")
    names = [n.strip() for n in os.getenv("BENCHMARK_MODELS", "").split(",") if n.strip()]
    if not names or len(names) > 7 or len(names) != len(set(names)) or any(n not in ALLOW for n in names):
        sys.exit("Invalid model list: choose up to seven distinct allowlisted aliases.")
    try:
        discovered = query(key, "/models")
        metadata = {m.get("id"): {"root": m.get("root"), "max_model_len": m.get("max_model_len")} 
                    for m in discovered.get("data", []) if isinstance(m, dict) and isinstance(m.get("id"), str)} 
        ids = set(metadata)
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, TimeoutError, http.client.IncompleteRead,
            http.client.RemoteDisconnected, ConnectionResetError, AttributeError, TypeError, GatewayError) as error:
        code = str(error) if isinstance(error, GatewayError) and str(error) in SAFE_ERRORS else type(error).__name__
        sys.exit("Model discovery failed (" + code + ").")
    report = []
    for model in names:
        for task, prompt, expected in TASKS:
            result = {"model": model, "task": task, "expected": expected, "correct": False,
                      "latency_seconds": None, "prompt_tokens": None, "completion_tokens": None,
                      "status": "not_started"}
            if model not in ids:
                result["status"] = "not_listed"
                report.append(result)
                continue
            start = time.monotonic()
            try:
                response = query(key, "/chat/completions", {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 256, 
                    "temperature": 0 
                })
                result["latency_seconds"] = response.get("_completion_latency_seconds")
                if response.get("_resolved_model"):
                    result["resolved_model"] = response["_resolved_model"]
                raw = response.get("choices", [{}])[0].get("message", {}).get("content", "")
                answer = raw.strip() if isinstance(raw, str) else ""
                result["correct"] = answer == expected
                usage = response.get("usage") or {}
                result["prompt_tokens"] = usage.get("prompt_tokens")
                result["completion_tokens"] = usage.get("completion_tokens")
                result["status"] = "ok" if answer else "empty_response"
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError,
                    KeyError, IndexError, TypeError, AttributeError, http.client.IncompleteRead,
                    http.client.RemoteDisconnected, ConnectionResetError, GatewayError) as error:
                result["latency_seconds"] = None
                result["correct"] = False
                result["status"] = ("gateway_" + str(error) if isinstance(error, GatewayError) and str(error) in SAFE_ERRORS else "request_failed_" + type(error).__name__)
            report.append(result)
            print(f"{model}: {task}: {result['status']}, correct={result['correct']}, latency={result['latency_seconds']}s", flush=True)
            time.sleep(1.1)
    out = Path("blablador-benchmark.json")
    out.write_text(json.dumps({"schema_version": 1, "scoring": "strict_exact_match",
                               "models": names, "model_metadata": {n: metadata.get(n) for n in names}, 
                               "generation": {"temperature": 0, "max_tokens": 256}, "transport": "cloudflare-benchmark-v1", "metadata_scope": "catalog_ids_only", "inference_timeout_seconds": 60, "previous_inference_timeout_seconds": 75, "results": report}, indent=2) + "\n", encoding="utf-8")
    print("\n| Model | Correct/3 | Completed/3 | Avg latency (s) | Total tokens (reported) |")
    print("| --- | ---: | ---: | ---: | ---: |")
    for model in names:
        rows = [x for x in report if x["model"] == model]
        valid = [x for x in rows if x["status"] == "ok"]
        latencies = [x["latency_seconds"] for x in valid if x["latency_seconds"] is not None]
        tokens = [x[k] for x in rows for k in ("prompt_tokens", "completion_tokens") if isinstance(x[k], int)]
        avg = f"{sum(latencies)/len(latencies):.2f}" if latencies else "n/a"
        total = str(sum(tokens)) if len(tokens) == len(rows) * 2 else "incomplete"
        print(f"| {model} | {sum(x["correct"] for x in rows if x["status"] == "ok")}/3 | {len(valid)}/3 | {avg} | {total} |")
    if not any(x["status"] == "ok" for x in report):
        sys.exit("No successful completions. See status summary/artifact.")

if __name__ == "__main__":
    main()
