import json
import unittest
from urllib.error import HTTPError
from email.message import Message
from io import BytesIO
import http.client
from cloudflare_benchmark_client import catalog_models, benchmark_completion, GatewayError, WORKER
KEY="test-orchestrator-secret-value-12345"
MODEL="alias-glm-5.3-flash"
PAYLOAD={"model":MODEL,"messages":[{"role":"user","content":"2+2"}],"temperature":0,"max_tokens":256}
class Stub:
    def __init__(self, obj): self.data=json.dumps(obj).encode()
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def read(self,n): return self.data[:n]
def fake(obj,seen):
    def call(req,timeout):
        seen.append((req.full_url,req.get_method(),json.loads(req.data) if req.data else None,req.get_header("User-agent")))
        return Stub(obj)
    return call
class CloudflareAdapterTest(unittest.TestCase):
    def test_catalog_uses_worker_only(self):
        seen=[]
        data=catalog_models(KEY,"blablador",fake({"status":"discovered_unverified","providers":{"blablador":{"status":"catalog_unverified","provider":"blablador","backendIdentityVerified":False,"models":[MODEL]}}},seen))
        self.assertEqual(data,{"data":[{"id":MODEL}]})
        self.assertEqual(seen[0][0],WORKER+"/v1/research/models")
        self.assertEqual(seen[0][3],"DebattAI-Orchestrator-ResearchBenchmark/1.0")
    def test_completion_preserves_experiment(self):
        seen=[]
        data=benchmark_completion(KEY,"blablador",PAYLOAD,fake({"status":"completed_unverified","provider":"blablador","model":MODEL,"answer":"4","finish_reason":"stop","scientificallyVerified":False,"backendIdentityVerified":False,"completion_latency_seconds":1.2,"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}},seen))
        self.assertEqual(data["choices"][0]["message"]["content"],"4")
        self.assertEqual(data["_completion_latency_seconds"],1.2)
        self.assertEqual(seen[0][0],WORKER+"/v1/research/benchmark")
        self.assertEqual(seen[0][2]["messages"],PAYLOAD["messages"])
        self.assertEqual(seen[0][3],"DebattAI-Orchestrator-ResearchBenchmark/1.0")
    def test_status_buckets_do_not_leak_response_bodies(self):
        for code, expected in [(401,"gateway_http_401"),(403,"gateway_http_403"),(404,"gateway_http_404"),(429,"gateway_http_429"),(503,"gateway_http_5xx")]:
            def rejected(req, timeout):
                raise HTTPError(req.full_url, code, "secret response detail", {}, None)
            with self.subTest(code=code), self.assertRaises(GatewayError) as error:
                catalog_models(KEY,"blablador",rejected)
            self.assertEqual(str(error.exception),expected)

    def test_only_known_bounded_worker_error_codes_are_exposed(self):
        cases = [
            (502, "application/json", b'{"error":"benchmark_upstream_failed"}', "benchmark_upstream_failed"),
            (502, "application/json", b'{"error":"benchmark_invalid_response"}', "benchmark_invalid_response"),
            (502, "application/json", b'{"error":"benchmark_catalog_unavailable"}', "benchmark_catalog_unavailable"),
            (502, "application/json", b'{"error":"benchmark_transport_failed"}', "benchmark_transport_failed"),
            (502, "application/json", b'{"error":"benchmark_token_budget_exceeded"}', "benchmark_token_budget_exceeded"),
            (502, "application/json", b'{"error":"backend_secret_response"}', "gateway_http_5xx"),
            (502, "application/json", b'{"error":"unknown","error":"benchmark_upstream_failed"}', "gateway_http_5xx"),
            (502, "application/json", '{"error":"benchmark_upstream_failed"}'.encode("utf-16"), "gateway_http_5xx"),
            (502, "application/json", '{"error":"benchmark_upstream_failed"}'.encode("utf-32"), "gateway_http_5xx"),
            (502, "application/json", b'{"error":"benchmark_invalid_response","detail":"sensitive"}', "gateway_http_5xx"),
            (502, "text/html", b'{"error":"benchmark_upstream_failed"}', "gateway_http_5xx"),
            (502, "application/json", b'not valid json sensitive body', "gateway_http_5xx"),
            (502, "application/json", b'x' * 1025, "gateway_http_5xx"),
            (503, "application/json", b'{"error":"benchmark_upstream_failed"}', "gateway_http_5xx"),
        ]
        for status, ctype, body, expected in cases:
            with self.subTest(status=status, ctype=ctype, body=body[:40]):
                def rejected(req, timeout):
                    headers = Message()
                    headers["Content-Type"] = ctype
                    raise HTTPError(req.full_url, status, "untrusted secret reason", headers, BytesIO(body))
                with self.assertRaises(GatewayError) as error:
                    benchmark_completion(KEY, "blablador", PAYLOAD, open_url=rejected)
                self.assertEqual(str(error.exception), expected)
                self.assertNotIn("sensitive", str(error.exception))
                self.assertNotIn("secret", str(error.exception))

    def test_incomplete_http_error_body_is_sanitized(self):
        def rejected(req, timeout):
            headers = Message()
            headers["Content-Type"] = "application/json"
            class BadStream:
                def read(self, limit):
                    raise http.client.IncompleteRead(b'sensitive upstream bytes', 200)
                def close(self):
                    pass
            raise HTTPError(req.full_url, 502, "untrusted reason", headers, BadStream())
        with self.assertRaises(GatewayError) as error:
            benchmark_completion(KEY, "blablador", PAYLOAD, open_url=rejected)
        self.assertEqual(str(error.exception), "gateway_http_5xx")

    def test_truncated_completion_preserves_length(self):
        seen=[]
        response={"status":"completed_unverified","provider":"blablador","model":MODEL,
                  "answer":"partial","finish_reason":"length","scientificallyVerified":False,
                  "backendIdentityVerified":False,"completion_latency_seconds":0.8,
                  "usage":{"prompt_tokens":10,"completion_tokens":256,"total_tokens":266}}
        result=benchmark_completion(KEY,"blablador",PAYLOAD,fake(response,seen),allow_truncated=True)
        self.assertEqual(result["choices"][0]["finish_reason"],"length")
        with self.assertRaises(GatewayError) as error:
            benchmark_completion(KEY,"blablador",PAYLOAD,fake(response,[]))
        self.assertEqual(str(error.exception),"gateway_completion_invalid")

    def test_invalid_usage_fails(self):
        with self.assertRaises(GatewayError):
            benchmark_completion(KEY,"blablador",PAYLOAD,fake({"status":"completed_unverified","provider":"blablador","model":MODEL,"answer":"4","finish_reason":"stop","scientificallyVerified":False,"backendIdentityVerified":False,"completion_latency_seconds":1,"usage":{"prompt_tokens":3,"completion_tokens":257,"total_tokens":260}},[]))
if __name__=="__main__": unittest.main()
