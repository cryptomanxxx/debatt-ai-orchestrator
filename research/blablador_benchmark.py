#!/usr/bin/env python3
"""Manual, bounded comparison of Blablador chat models. Python standard library only."""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

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
    ("physics", "What is the SI unit symbol of electrical resistance? Reply ONLY with the symbol using ASCII characters.", "ohm"),
]
# ASCII 'ohm' is used to keep an exact, reproducible scoring key.
def query(key, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Authorization": "Bearer " + key, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, headers=headers, data=data,
                                 method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=75) as response:
        return json.load(response)

def main():
    key = os.getenv("BLABLADOR_API_KEY", "")
    if not key:
        sys.exit("Missing BLABLADOR_API_KEY repository secret.")
    names = [n.strip() for n in os.getenv("BENCHMARK_MODELS", "").split(",") if n.strip()]
    if not names or len(names) > 7 or len(names) != len(set(names)) or any(n not in ALLOW for n in names):
        sys.exit("Invalid model list: choose up to seven distinct allowlisted aliases.")
    try:
        discovered = query(key, "/models")
        ids = {m.get("id") for m in discovered.get("data", []) if isinstance(m, dict)}
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError, TimeoutError) as error:
        sys.exit("Model discovery failed (" + type(error).__name__ + ").")
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
                    "max_tokens": 256
                })
                result["latency_seconds"] = round(time.monotonic() - start, 3)
                raw = response.get("choices", [{}])[0].get("message", {}).get("content", "")
                answer = raw.strip() if isinstance(raw, str) else ""
                result["correct"] = answer.lower() == expected.lower()
                usage = response.get("usage") or {}
                result["prompt_tokens"] = usage.get("prompt_tokens")
                result["completion_tokens"] = usage.get("completion_tokens")
                result["status"] = "ok" if answer else "empty_response"
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError,
                    KeyError, IndexError, TypeError) as error:
                result["latency_seconds"] = round(time.monotonic() - start, 3)
                result["status"] = "request_failed_" + type(error).__name__
            report.append(result)
            print(f"{model}: {task}: {result['status']}, correct={result['correct']}, latency={result['latency_seconds']}s", flush=True)
            time.sleep(1.1)
    out = Path("blablador-benchmark.json")
    out.write_text(json.dumps({"schema_version": 1, "scoring": "strict_exact_match",
                               "models": names, "results": report}, indent=2) + "\n", encoding="utf-8")
    print("\n| Model | Correct/3 | Completed/3 | Avg latency (s) | Total tokens (reported) |")
    print("| --- | ---: | ---: | ---: | ---: |")
    for model in names:
        rows = [x for x in report if x["model"] == model]
        valid = [x for x in rows if x["status"] == "ok"]
        latencies = [x["latency_seconds"] for x in valid if x["latency_seconds"] is not None]
        tokens = [x[k] for x in rows for k in ("prompt_tokens", "completion_tokens") if isinstance(x[k], int)]
        avg = f"{sum(latencies)/len(latencies):.2f}" if latencies else "n/a"
        total = str(sum(tokens)) if len(tokens) == len(rows) * 2 else "incomplete"
        print(f"| {model} | {sum(x['correct'] for x in rows)}/3 | {len(valid)}/3 | {avg} | {total} |")
    if not any(x["status"] == "ok" for x in report):
        sys.exit("No successful completions. See status summary/artifact.")

if __name__ == "__main__":
    main()
