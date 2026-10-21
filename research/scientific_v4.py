#!/usr/bin/env python3
"""Scientific v4: per-domain benchmark of HIP/Blablador models through the Cloudflare Worker.

Same transport, model menu and safety rules as Scientific v3, but with generated, exactly
scored tasks per research domain (see domain_tasks.py), so models can be ranked per domain.
"""
import datetime
import json
import os
import statistics
import sys
import time
from pathlib import Path

import domain_tasks
from blablador_scientific_v3 import REQUEST_ERRORS, api, menu_model_id, safe_error
from model_choice import parse_model_choice, snapshot_models

SYSTEM = ("Solve the scientific question. " + domain_tasks.ANSWER_FORMAT +
          " End with one separate line exactly FINAL_ANSWER: <answer>. No text after that line.")
MAX_TOKENS = 768
REPORT = Path("scientific-v4.json")


def settings(env=os.environ):
    try:
        provider, model = parse_model_choice(env.get("BENCHMARK_MODEL", ""), menu_model_id)
        models = [model] if model else snapshot_models(provider, menu_model_id)
    except ValueError as error:
        sys.exit(str(error))
    per_domain, repeats = env.get("TASKS_PER_DOMAIN", "8"), env.get("BENCHMARK_REPEATS", "1")
    if per_domain not in ("4", "8") or repeats not in ("1", "2") or not models or len(models) > 12:
        sys.exit("Select one menu entry (at most 12 models), 4 or 8 tasks per domain and 1-2 repeats.")
    return provider, models, int(per_domain), int(repeats)


def run_task(key, provider, model, question, expected):
    item = {"status": "not_started", "scientific_verdict": "not_evaluated", "format_compliant": False,
            "actual_answer": None, "finish_reason": None, "latency_seconds": None,
            "prompt_tokens": None, "completion_tokens": None}
    try:
        response = api(key, "/chat/completions", provider=provider, payload={
            "model": model, "temperature": 0, "max_tokens": MAX_TOKENS,
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": question}]})
        choice = response["choices"][0]
        content, usage = choice["message"]["content"], response.get("usage") or {}
        if not isinstance(content, str) or not isinstance(usage, dict):
            raise ValueError("Malformed model response")
        item.update(latency_seconds=response["_completion_latency_seconds"], finish_reason=choice.get("finish_reason"),
                    prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
                    raw_response=content[:4000])
        if response.get("_resolved_model"):
            item["resolved_model"] = response["_resolved_model"]
        if not content.strip():
            item["status"] = "empty_response"
        elif item["finish_reason"] == "length":
            # Ran out of the token budget: counted as an attempt, never as correct.
            item.update(status="truncated", scientific_verdict="unverified")
        else:
            verdict, compliant, actual = domain_tasks.evaluate(content, expected)
            item.update(status="ok", scientific_verdict=verdict, format_compliant=compliant, actual_answer=actual[:500])
    except REQUEST_ERRORS as error:
        item["status"] = "rate_limited" if str(error) == "gateway_http_429" else safe_error(error)
    return item


def summary(models, results):
    lines = ["| Model | " + " | ".join(domain_tasks.DOMAINS) + " | Total | Median latency |",
             "| --- |" + " ---: |" * (len(domain_tasks.DOMAINS) + 2)]
    for model in models:
        rows = [r for r in results if r["model"] == model]
        cells = []
        for domain in domain_tasks.DOMAINS:
            mine = [r for r in rows if r["domain"] == domain]
            cells.append(f"{sum(r['scientific_verdict'] == 'correct' for r in mine)}/{len(mine)}")
        latency = [r["latency_seconds"] for r in rows if r["status"] == "ok" and r["latency_seconds"] is not None]
        total = f"{sum(r['scientific_verdict'] == 'correct' for r in rows)}/{len(rows)}"
        median = f"{statistics.median(latency):.2f}s" if latency else "n/a"
        lines.append(f"| {model} | " + " | ".join(cells) + f" | {total} | {median} |")
    return "\n".join(lines)


def main():
    key = os.environ.get("ORCHESTRATOR_API_KEY", "")
    if not key:
        sys.exit("Missing ORCHESTRATOR_API_KEY research-inference environment secret.")
    provider, models, per_domain, repeats = settings()
    suite = domain_tasks.tasks(per_domain)
    metadata, discovery_error = {}, None
    try:
        metadata = {m["id"]: {"root": m.get("root")} for m in api(key, "/models", provider=provider)["data"]
                    if isinstance(m, dict) and isinstance(m.get("id"), str)}
    except REQUEST_ERRORS as error:
        discovery_error = safe_error(error)
    results = []

    def save():
        REPORT.write_text(json.dumps({
            "schema_version": 4, "suite": domain_tasks.SUITE_VERSION, "provider": provider,
            "transport": "cloudflare-benchmark-v1",
            "generated_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "domains": list(domain_tasks.DOMAINS), "tasks_per_domain": per_domain, "repeats": repeats,
            "generation": {"temperature": 0, "max_tokens": MAX_TOKENS},
            "scoring_note": "Exact answers computed by the suite; FINAL_ANSWER lines only; unverified counts as not correct",
            "model_metadata": {m: metadata.get(m) for m in models}, "discovery_error": discovery_error,
            "results": results}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    save()
    for model in models:
        for repeat in range(1, repeats + 1):
            for domain, task, question, expected in suite:
                item = {"model": model, "repeat": repeat, "domain": domain, "task": task, "expected": expected}
                if discovery_error or model not in metadata:
                    item.update(status="discovery_failed" if discovery_error else "not_listed",
                                scientific_verdict="not_evaluated")
                else:
                    item.update(run_task(key, provider, model, question, expected))
                results.append(item)
                save()
                print(f"{model} {repeat} {task}: {item['status']} {item['scientific_verdict']}", flush=True)
                time.sleep(1.0)
    print("\n" + summary(models, results))
    if not any(r["status"] == "ok" for r in results):
        sys.exit("No successful inference; inspect JSON artifact.")


if __name__ == "__main__":
    main()
