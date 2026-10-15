#!/usr/bin/env python3
"""Research-only HIP comparison using unchanged Blablador v3 tasks and scoring."""
import datetime
import http.client
import json
import os
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path
from blablador_scientific_v3 import TASKS, evaluate

BASE = 'https://llm-service.ai.tu-darmstadt.de/v1'
MODELS = ('GLM-5.2-AWQ-INT4', 'Kimi-K2.6', 'Ministral-3-14B-Instruct-2512',
          'Mistral-Medium-3.5-128B', 'Qwen3.8-27B', 'gemma-4-31B-it',
          'leo-hessianai-13b-chat', 'occiglot-7b-eu5-instruct',
          'qwen3-vl-30b-a3b-instruct-awq')
EXCLUDED = ('all-proxy-models', 'bge-reranker-v2-m3', 'gte-Qwen2-1.5B-instruct')
SYSTEM = 'Solve the scientific question. End with one separate line exactly FINAL_ANSWER: <answer>. No text after that line.'

class ApiError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def api(key, path, payload=None):
    headers = {'Authorization': 'Bearer ' + key, 'Accept': 'application/json'}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(BASE + path, headers=headers, data=data)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=90) as response:
            raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ApiError('response_too_large')
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
        raise ApiError(f'http_{code}') from None
    except (urllib.error.URLError, OSError, ValueError, http.client.HTTPException):
        raise ApiError('transport_or_json_error') from None

def model_ids(response):
    rows = response.get('data') if isinstance(response, dict) else None
    if not isinstance(rows, list) or not rows or any(
        not isinstance(row, dict) or not isinstance(row.get('id'), str)
        or not row['id'].strip() for row in rows
    ):
        raise ApiError('invalid_model_list')
    return {row['id'] for row in rows}

def settings(env):
    models = [m.strip() for m in env.get('BENCHMARK_MODELS', ','.join(MODELS)).split(',')]
    repeats = env.get('BENCHMARK_REPEATS', '2')
    if repeats not in ('1', '2', '3') or not models or len(models) != len(set(models)) or any(m not in MODELS for m in models):
        raise ValueError('Invalid model list or repetition count')
    return models, int(repeats)

def score(response, expected, key):
    choice = response['choices'][0]
    content = choice['message']['content']
    usage = response.get('usage') or {}
    if not isinstance(content, str) or not isinstance(usage, dict):
        raise ValueError('Malformed response')
    if key in content:
        raise ValueError('Credential echoed')
    finish = choice.get('finish_reason')
    status = 'truncated' if finish == 'length' else ('ok' if finish == 'stop' and content.strip() else 'incomplete_response')
    verdict, compliant, answer = evaluate(content, expected) if status == 'ok' else ('unverified', False, None)
    return dict(status=status, scientific_verdict=verdict, format_compliant=compliant,
                actual_answer=answer[:1000] if answer is not None else None, raw_response=content[:6000], finish_reason=finish,
                response_model=response.get('model') if isinstance(response.get('model'), str) and key not in response['model'] else None,
                **{name: usage.get(name) if isinstance(usage.get(name), int) and usage[name] >= 0 else None
                   for name in ('prompt_tokens', 'completion_tokens', 'total_tokens')})

def summary(models, results):
    lines = ['# HIP scientific comparison', '',
             'Internal research only. Same five tasks, prompts, temperature (0), output budget (768) and scoring as Blablador scientific v3. Two default repeats are identical prompts, not independent questions.', '',
             'A small screening test, not proof of the best research model. No tools, literature synthesis, vision or autonomous planning are evaluated. Unverified answers require review. Provider errors and truncation are separate from incorrect answers.', '',
             '| Model | Correct / all attempts | Correct / evaluated | Unverified | Completed / attempts | Format / completed | Median latency | Tokens reported |',
             '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for model in models:
        rows = [r for r in results if r['model'] == model]
        complete = [r for r in rows if r['status'] == 'ok']
        evaluated = [r for r in complete if r['scientific_verdict'] in ('correct', 'incorrect')]
        correct = sum(r['scientific_verdict'] == 'correct' for r in evaluated)
        latency = [r['latency_seconds'] for r in complete]
        med = f'{statistics.median(latency):.2f}s' if latency else 'n/a'
        tokens = [r['total_tokens'] for r in rows if r.get('total_tokens') is not None]
        lines.append(f"| {model} | {correct}/{len(rows)} | {correct}/{len(evaluated)} | {sum(r.get('scientific_verdict') == 'unverified' for r in rows)} | {len(complete)}/{len(rows)} | {sum(r['format_compliant'] for r in complete)}/{len(complete)} | {med} | {sum(tokens) if tokens else 'n/a'} |")
    lines += ['', 'Token totals cover responses reporting usage, not necessarily billable totals. No euro cost estimate without verified HIP prices. Excluded from chat comparison: ' + ', '.join(EXCLUDED) + '.']
    return '\n'.join(lines) + '\n'

def main():
    models, repeats = settings(os.environ)
    key = os.environ.get('HIP_API_KEY', '')
    if len(key) < 8 or any(c.isspace() for c in key):
        raise SystemExit('Missing or invalid HIP_API_KEY')
    dest = Path('reports/hip-scientific')
    dest.mkdir(parents=True, exist_ok=True)
    results = []
    report = dict(schema_version=1, provider='hessian.AI HIP', purpose='internal-research',
                  benchmark='blablador-scientific-v3', code_commit=os.getenv('GITHUB_SHA'),
                  generated_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  generation=dict(temperature=0, max_tokens=768), tasks=TASKS,
                  models=models, repeats=repeats, excluded=EXCLUDED, results=results)
    def save():
        # Last-resort protection: never save credentials echoed anywhere by upstream.
        serialized = json.dumps(report, indent=2, ensure_ascii=False).replace(key, '[REDACTED]')
        (dest / 'results.json').write_text(serialized + '\n', encoding='utf-8')
        (dest / 'summary.md').write_text(summary(models, results), encoding='utf-8')
    save()
    try:
        listed = api(key, '/models')
        available = model_ids(listed)
    except (ApiError, KeyError, TypeError):
        report['discovery_error'] = 'model_discovery_failed'
        save()
        raise SystemExit('HIP model discovery failed; no inference attempted') from None
    report['unbenchmarked_model_ids'] = sorted(available - set(MODELS) - set(EXCLUDED))
    # Interleave models by task/repeat to reduce systematic ordering effects.
    for repeat in range(1, repeats + 1):
        for task, question, expected in TASKS:
            for model in models:
                row = dict(model=model, repeat=repeat, task=task, expected=expected,
                           status='not_listed', scientific_verdict='not_evaluated',
                           format_compliant=False, latency_seconds=None)
                if model in available:
                    start = time.monotonic()
                    try:
                        response = api(key, '/chat/completions', dict(model=model,
                            messages=[dict(role='system', content=SYSTEM), dict(role='user', content=question)],
                            temperature=0, max_tokens=768))
                        row.update(score(response, expected, key))
                    except ApiError as error:
                        row['status'] = str(error)
                    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
                        row['status'] = 'malformed_response'
                    row['latency_seconds'] = round(time.monotonic() - start, 3)
                results.append(row)
                save()
                print(f"{model} {repeat} {task}: {row['status']} {row['scientific_verdict']}", flush=True)
                if row['status'] in ('http_401', 'http_402', 'http_403', 'http_429'):
                    report['stopped_early'] = row['status']
                    save()
                    raise SystemExit('Stopped for authentication, quota or rate limit; inspect partial report')
                time.sleep(1)
    markdown = summary(models, results)
    print(markdown)
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as handle:
            handle.write(markdown)
    if not any(r['status'] == 'ok' for r in results):
        raise SystemExit('No successful inference')

if __name__ == '__main__':
    main()
