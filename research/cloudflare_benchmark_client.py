"""Restricted GitHub -> Cloudflare research benchmark transport; never sees provider keys."""
import json
import urllib.request
from urllib.error import HTTPError, URLError

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

SAFE_ERRORS = frozenset({'missing_orchestrator_key','invalid_gateway_path','gateway_transport_or_http_failed',
    'gateway_response_too_large','gateway_invalid_json','gateway_invalid_response',
    'invalid_provider','gateway_catalog_failed','gateway_catalog_invalid',
    'invalid_benchmark_request','gateway_completion_invalid','gateway_latency_invalid','gateway_usage_invalid',
    'gateway_http_401','gateway_http_403','gateway_http_404','gateway_http_429','gateway_http_5xx','gateway_http_other'})

WORKER = "https://debatt-ai-orchestrator.xx8031126.workers.dev"
MAX_BYTES = 131072

class GatewayError(Exception):
    pass

def _request(api_key, path, body=None, open_url=None):
    if not isinstance(api_key, str) or len(api_key) < 24 or any(c.isspace() for c in api_key):
        raise GatewayError("missing_orchestrator_key")
    if path not in ("/v1/research/models", "/v1/research/benchmark"):
        raise GatewayError("invalid_gateway_path")
    transport = open_url or urllib.request.build_opener(NoRedirect()).open
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(WORKER + path, data=data,
        headers={"Authorization": "Bearer " + api_key, "Accept": "application/json",
                 "User-Agent": "DebattAI-Orchestrator-ResearchBenchmark/1.0",
                 **({"Content-Type": "application/json"} if body is not None else {})},
        method="POST" if body is not None else "GET")
    try:
        with transport(req, timeout=100) as res:
            raw = res.read(MAX_BYTES + 1)
    except HTTPError as error:
        status = error.code
        error.close()
        category = "gateway_http_" + str(status) if status in (401, 403, 404, 429) else ("gateway_http_5xx" if 500 <= status <= 599 else "gateway_http_other")
        raise GatewayError(category) from None
    except (URLError, OSError, TimeoutError):
        raise GatewayError("gateway_transport_or_http_failed") from None
    if len(raw) > MAX_BYTES:
        raise GatewayError("gateway_response_too_large")
    try:
        obj = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise GatewayError("gateway_invalid_json") from None
    if not isinstance(obj, dict) or api_key in str(obj):
        raise GatewayError("gateway_invalid_response")
    return obj

def catalog_models(api_key, provider, open_url=None):
    if provider not in ("hip", "blablador"):
        raise GatewayError("invalid_provider")
    obj = _request(api_key, "/v1/research/models", open_url=open_url)
    p = obj.get("providers", {}).get(provider)
    if obj.get("status") != "discovered_unverified" or not isinstance(p, dict) or p.get("status") != "catalog_unverified" or p.get("provider") != provider or p.get("backendIdentityVerified") is not False:
        raise GatewayError("gateway_catalog_failed")
    models = p.get("models")
    if not isinstance(models, list) or len(models) > 200 or any(not isinstance(x, str) for x in models):
        raise GatewayError("gateway_catalog_invalid")
    # This endpoint intentionally provides only IDs, not unverified upstream root metadata.
    return {"data": [{"id": m} for m in models]}

def benchmark_completion(api_key, provider, payload, open_url=None):
    if provider not in ("hip", "blablador") or not isinstance(payload, dict):
        raise GatewayError("invalid_benchmark_request")
    if set(payload) != {"model", "messages", "temperature", "max_tokens"} or payload["temperature"] != 0:
        raise GatewayError("invalid_benchmark_request")
    body = {**{k: payload[k] for k in ("model", "messages", "max_tokens")}, "provider": provider, "profile": "benchmark"}
    obj = _request(api_key, "/v1/research/benchmark", body, open_url)
    if (obj.get("status") != "completed_unverified" or obj.get("provider") != provider or
        obj.get("model") != payload["model"] or obj.get("scientificallyVerified") is not False or
        obj.get("backendIdentityVerified") is not False or
        not isinstance(obj.get("answer"), str) or not obj["answer"].strip() or
        obj.get("finish_reason") not in ("stop", "length")):
        raise GatewayError("gateway_completion_invalid")
    latency = obj.get("completion_latency_seconds")
    if not isinstance(latency, (int, float)) or isinstance(latency, bool) or not 0 <= latency <= 95:
        raise GatewayError("gateway_latency_invalid")
    usage = obj.get("usage")
    fields = ("prompt_tokens", "completion_tokens", "total_tokens")
    if not isinstance(usage, dict) or set(usage) != set(fields) or any(
        usage[k] is not None and (type(usage[k]) is not int or usage[k] < 0) for k in fields
    ) or (usage["completion_tokens"] is not None and usage["completion_tokens"] > payload["max_tokens"]):
        raise GatewayError("gateway_usage_invalid")
    answer = obj["answer"]
    if len(answer) > 16000 or api_key in answer:
        raise GatewayError("gateway_completion_invalid")
    return {"model": obj["model"], "choices": [{"message": {"content": answer}, "finish_reason": obj["finish_reason"]}],
            "usage": {k: usage[k] for k in fields}, "_completion_latency_seconds": latency}
