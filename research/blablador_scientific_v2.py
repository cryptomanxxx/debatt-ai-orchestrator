#!/usr/bin/env python3
"""Manual scientific reasoning benchmark, with deterministic independent answer keys."""
import datetime
import http.client
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from cloudflare_benchmark_client import catalog_models, benchmark_completion, GatewayError, SAFE_ERRORS
from pathlib import Path

MODELS = ("alias-kimi-k3-1m", "alias-glm-5.3-flash",
          "alias-deepseek-v41-flash-booster", "alias-mimo-v2.6-pro",
          "alias-qwen3.8-flash-next", "alias-fast")
# Answers are checked independently of model claims; open-ended originality is not scored.
TASKS = (
    ("linear_algebra", "For matrix [[2,4,6],[1,2,3],[0,1,1]], give its exact determinant.", "0"),
    ("bayesian", "A disease has prevalence 1%, test sensitivity 90%, specificity 95%. For a positive test, give P(disease|positive) as a reduced fraction.", "2/13"),
    ("causal", "In DAG X -> M -> Y with X -> Y also present, is M a mediator, confounder, or collider for the total effect of X on Y? Reply with the single classification.", "mediator"),
    ("statistics", "For paired observations (x,y)=(1,2),(2,4),(3,6), what is the exact ordinary least squares slope with an intercept?", "2"),
    ("recurrence", "A geometric sequence starts 2, 6, 18, 54 and each term is three times its predecessor. What is the seventh term?", "1458"),
)
ERRORS = (urllib.error.HTTPError, urllib.error.URLError, TimeoutError,
          ValueError, TypeError, AttributeError, KeyError, IndexError,
          http.client.HTTPException, ConnectionError, OSError, GatewayError)

def api(key, path, payload=None):
    if path == "/models" and payload is None:
        return catalog_models(key, "blablador")
    if path == "/chat/completions" and payload is not None:
        return benchmark_completion(key, "blablador", payload)
    raise GatewayError("invalid_gateway_path")


def safe_error(error):
    if isinstance(error, GatewayError) and str(error) in SAFE_ERRORS:
        return "gateway_" + str(error)
    return "request_failed_" + type(error).__name__

def main():
    key = os.environ.get("ORCHESTRATOR_API_KEY", "")
    if not key:
        sys.exit("ORCHESTRATOR_API_KEY research-inference environment secret is missing.")
    raw = os.environ.get("BENCHMARK_MODELS", ",".join(MODELS))
    models = [x.strip() for x in raw.split(",") if x.strip()]
    repeats_text = os.environ.get("BENCHMARK_REPEATS", "2")
    if not repeats_text.isdigit() or int(repeats_text) not in (1, 2, 3):
        sys.exit("Repeats must be 1, 2 or 3.")
    repeats = int(repeats_text)
    if not models or len(models) > 6 or len(models) != len(set(models)) or any(m not in MODELS for m in models):
        sys.exit("Invalid model selection.")
    results = []
    metadata = {}
    discovery_error = None
    try:
        listing = api(key, "/models")
        metadata = {m["id"]: {"root": m.get("root"), "max_model_len": m.get("max_model_len")}
                    for m in listing["data"] if isinstance(m, dict) and isinstance(m.get("id"), str)}
    except ERRORS as error:
        discovery_error = safe_error(error)

    report_file = Path("blablador-scientific-v2.json")
    def save():
        report_file.write_text(json.dumps({
            "schema_version": 2, "transport": "cloudflare-benchmark-v1",
            "metadata_scope": "catalog_ids_only", "inference_timeout_seconds": 60,
            "previous_inference_timeout_seconds": 90,
            "utc_generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "model_metadata": {m: metadata.get(m) for m in models},
            "discovery_error": discovery_error, "temperature": 0,
            "scoring": "case_sensitive_exact_match_after_whitespace_trim",
            "repeats": repeats, "results": results
        }, indent=2) + "\n", encoding="utf-8")

    save()
    for model in models:
        for repetition in range(1, repeats + 1):
            for task_id, question, expected in TASKS:
                item = {"model": model, "repetition": repetition, "task": task_id,
                        "expected": expected, "observed_answer": None, "status": "not_started", "correct": False,
                        "latency_seconds": None, "prompt_tokens": None, "completion_tokens": None}
                if discovery_error or model not in metadata:
                    item["status"] = "discovery_failed" if discovery_error else "not_listed"
                else:
                    try:
                        response = api(key, "/chat/completions", {
                            "model": model,
                            "messages": [{"role": "system", "content": "Answer concisely. Output only the answer without explanation."},
                                         {"role": "user", "content": question}],
                            "temperature": 0, "max_tokens": 384
                        })
                        item["latency_seconds"] = response["_completion_latency_seconds"]
                        choice = response["choices"][0]
                        answer = choice["message"]["content"]
                        usage = response.get("usage") or {}
                        if not isinstance(answer, str) or not isinstance(usage, dict):
                            raise ValueError("Malformed completion")
                        item["prompt_tokens"] = usage.get("prompt_tokens")
                        item["completion_tokens"] = usage.get("completion_tokens")
                        item["observed_answer"] = answer.strip()[:2000]
                        item["status"] = "ok" if answer.strip() else "empty_response"
                        item["correct"] = item["status"] == "ok" and answer.strip() == expected
                    except ERRORS as error:
                        item["status"] = ("rate_limited" if isinstance(error, GatewayError) and str(error) == "gateway_http_429"
                                          else safe_error(error))
                        item["correct"] = False
                results.append(item)
                save()  # Preserve partial findings even after a later process interruption.
                print(f"{model} repeat={repetition} {task_id}: {item['status']}, "
                      f"correct={item['correct']}, latency={item['latency_seconds']}s", flush=True)
                time.sleep(1.0)
    print("\n| Model | Correct | Completed | Median latency (s) |")
    print("| --- | ---: | ---: | ---: |")
    for model in models:
        subset = [r for r in results if r["model"] == model]
        success = [r for r in subset if r["status"] == "ok"]
        latencies = [r["latency_seconds"] for r in success if r["latency_seconds"] is not None]
        median = f"{statistics.median(latencies):.2f}" if latencies else "n/a"
        print(f"| {model} | {sum(r['correct'] for r in success)}/{len(subset)} | "
              f"{len(success)}/{len(subset)} | {median} |")
    if not any(r["status"] == "ok" for r in results):
        sys.exit("No successful inference calls; see artifact for details.")

if __name__ == "__main__":
    main()
