#!/usr/bin/env python3
"""Blablador scientific v3: independently scored scientific correctness and format compliance."""
import datetime
import http.client
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from sympy import Rational
from cloudflare_benchmark_client import catalog_models, benchmark_completion, GatewayError, SAFE_ERRORS

MODELS = ("alias-kimi-k3-1m", "alias-glm-5.3-flash",
          "alias-deepseek-v41-flash-booster", "alias-mimo-v2.6-pro",
          "alias-qwen3.8-flash-next", "alias-fast")
TASKS = (
    ("determinant", "Compute the determinant of [[2,4,6],[1,2,3],[0,1,1]].", "0"),
    ("bayes", "Disease prevalence is 1%, sensitivity 90%, specificity 95%. Give P(disease | positive) as a reduced fraction.", "2/13"),
    ("causal", "In DAG X -> M -> Y and X -> Y, classify M for the total causal effect X on Y: mediator, confounder, or collider.", "mediator"),
    ("slope", "Find the OLS slope with intercept for points (1,2),(2,4),(3,6).", "2"),
    ("sequence", "A geometric sequence starts 2,6,18,54, and each term is three times its predecessor. Find term 7.", "1458"),
)
REQUEST_ERRORS = (urllib.error.HTTPError, urllib.error.URLError, TimeoutError,
                  ValueError, TypeError, KeyError, IndexError, AttributeError,
                  http.client.HTTPException, ConnectionError, OSError, GatewayError)
NUM = re.compile(r"^[+-]?\d+(?:/[+-]?\d+|(?:\.\d+)?)?$")

def extracted_answer(content):
    """Only parse an unambiguous final answer; never guess from intermediate math."""
    text = content.strip()
    markers = re.findall(r"(?im)^\s*FINAL_ANSWER\s*:\s*(.*?)\s*$", text)
    if markers:
        return markers[-1].strip(), bool(re.fullmatch(r"FINAL_ANSWER: [^\r\n]+", text))
    return text, False

def evaluate(content, expected):
    candidate, compliant = extracted_answer(content)
    if expected == "mediator":
        normalized = candidate.strip().strip(" .`*").lower()
        if normalized in ("mediator", "a mediator"):
            return "correct", compliant, candidate
        # Do not declare verbose text incorrect; it may contain the right answer.
        if normalized in ("confounder", "a confounder", "collider", "a collider"):
            return "incorrect", compliant, candidate
        return "unverified", compliant, candidate
    numeric = candidate.strip()
    if numeric.endswith(".") and not numeric.endswith(".."):
        numeric = numeric[:-1]
    if NUM.fullmatch(numeric):
        try:
            actual = Rational(numeric)
            truth = Rational(expected)
            return ("correct" if actual == truth else "incorrect"), compliant, candidate
        except (TypeError, ValueError, ZeroDivisionError):
            pass
    return "unverified", compliant, candidate

def api(key, path, payload=None):
    if path == "/models" and payload is None:
        return catalog_models(key, "blablador")
    if path == "/chat/completions" and payload is not None:
        for attempt in range(3):
            try:
                return benchmark_completion(key, "blablador", payload, allow_truncated=True)
            except GatewayError as error:
                if str(error) != "gateway_http_429" or attempt == 2:
                    raise
                time.sleep((5, 15)[attempt])
        raise GatewayError("gateway_http_429")
    raise GatewayError("invalid_gateway_path")


def safe_error(error):
    if isinstance(error, GatewayError) and str(error) in SAFE_ERRORS:
        return "gateway_" + str(error)
    return "request_failed_" + type(error).__name__

def main():
    key = os.environ.get("ORCHESTRATOR_API_KEY", "")
    if not key:
        sys.exit("Missing ORCHESTRATOR_API_KEY research-inference environment secret.")
    models = [m.strip() for m in os.getenv("BENCHMARK_MODELS", ",".join(MODELS)).split(",") if m.strip()]
    rep = os.getenv("BENCHMARK_REPEATS", "2")
    if rep not in ("1", "2", "3") or not models or len(models) > 6 or len(models) != len(set(models)) or any(m not in MODELS for m in models):
        sys.exit("Invalid model list or repetition count.")
    metadata = {}
    discovery_error = None
    try:
        discovery = api(key, "/models")
        metadata = {m["id"]: {"root": m.get("root"), "max_model_len": m.get("max_model_len")}
                    for m in discovery["data"] if isinstance(m, dict) and isinstance(m.get("id"), str)}
    except REQUEST_ERRORS as error:
        discovery_error = safe_error(error)

    results = []
    dest = Path("blablador-scientific-v3.json")
    def save():
        dest.write_text(json.dumps({
            "schema_version": 3,
            "transport": "cloudflare-benchmark-v1",
            "metadata_scope": "catalog_ids_only",
            "inference_timeout_seconds": 60,
            "previous_inference_timeout_seconds": 90,
            "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scoring_note": "Unambiguous short answers and FINAL_ANSWER lines only; unverified requires human review",
            "model_metadata": {m: metadata.get(m) for m in models},
            "discovery_error": discovery_error,
            "generation": {"temperature": 0, "max_tokens": 768},
            "results": results,
        }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    save()
    for model in models:
        for repeat in range(1, int(rep) + 1):
            for task, question, expected in TASKS:
                item = {"model": model, "repeat": repeat, "task": task,
                        "expected": expected, "actual_answer": None, "raw_response": None,
                        "scientific_verdict": "not_evaluated", "format_compliant": False,
                        "finish_reason": None, "status": "not_started",
                        "latency_seconds": None, "prompt_tokens": None, "completion_tokens": None}
                if discovery_error or model not in metadata:
                    item["status"] = "discovery_failed" if discovery_error else "not_listed"
                else:
                    try:
                        response = api(key, "/chat/completions", {
                            "model": model,
                            "messages": [
                                {"role": "system", "content": "Solve the scientific question. End with one separate line exactly FINAL_ANSWER: <answer>. No text after that line."},
                                {"role": "user", "content": question}
                            ],
                            "temperature": 0, "max_tokens": 768
                        })
                        item["latency_seconds"] = response["_completion_latency_seconds"]
                        choice = response["choices"][0]
                        msg = choice["message"]
                        content = msg["content"]
                        usage = response.get("usage") or {}
                        if not isinstance(content, str) or not isinstance(usage, dict):
                            raise ValueError("Malformed model response")
                        item["raw_response"] = content[:6000]
                        item["finish_reason"] = choice.get("finish_reason")
                        item["prompt_tokens"] = usage.get("prompt_tokens")
                        item["completion_tokens"] = usage.get("completion_tokens")
                        item["status"] = "ok" if content.strip() else "empty_response"
                        if item["status"] == "ok" and item["finish_reason"] != "length":
                            verdict, compliance, actual = evaluate(content, expected)
                            item["scientific_verdict"] = verdict
                            item["format_compliant"] = compliance
                            item["actual_answer"] = actual[:1000]
                        elif item["finish_reason"] == "length":
                            item["status"] = "truncated"
                            item["scientific_verdict"] = "unverified"
                    except REQUEST_ERRORS as error:
                        item["status"] = ("rate_limited" if isinstance(error, GatewayError) and str(error) == "gateway_http_429"
                                          else safe_error(error))
                results.append(item)
                save()
                print(f"{model} {repeat} {task}: {item['status']} {item['scientific_verdict']} format={item['format_compliant']}", flush=True)
                time.sleep(1.0)

    print("\n| Model | Scientific correct/evaluated | Unverified | Format compliant/complete | Completed/attempts | Median latency |")
    print("| --- | ---: | ---: | ---: | ---: | ---: |")
    for model in models:
        rows = [r for r in results if r["model"] == model]
        ok = [r for r in rows if r["status"] == "ok"]
        latency = [r["latency_seconds"] for r in ok if r["latency_seconds"] is not None]
        median = f"{statistics.median(latency):.2f}s" if latency else "n/a"
        evaluated = [r for r in ok if r["scientific_verdict"] in ("correct", "incorrect")]
        correct = sum(r["scientific_verdict"] == "correct" for r in evaluated)
        unverified = sum(r["scientific_verdict"] == "unverified" for r in rows)
        compliant = sum(r["format_compliant"] for r in ok)
        print(f"| {model} | {correct}/{len(evaluated)} | {unverified} | {compliant}/{len(ok)} | {len(ok)}/{len(rows)} | {median} |")
    if not any(r["status"] == "ok" for r in results):
        sys.exit("No successful inference; inspect JSON artifact.")

if __name__ == "__main__":
    main()
