import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
import http.client
from unittest.mock import patch, MagicMock
import urllib.error
from hip_scientific import STOP_STATUSES, MODELS, EXCLUDED, TASKS, settings, score, summary, api, ApiError, model_ids
from cloudflare_benchmark_client import GatewayError
import hip_scientific

KEY = 'test-orchestrator-key-not-real-1234'
from blablador_scientific_v3 import TASKS as ORIGINAL_TASKS

class HipScientificTests(unittest.TestCase):
    def response(self, content='FINAL_ANSWER: 2', finish='stop'):
        return {'model': 'Kimi-K2.6', 'choices': [{'message': {'content': content}, 'finish_reason': finish}],
                'usage': {'total_tokens': 40}}

    def test_same_tasks_and_all_nine_chat_models(self):
        self.assertEqual(TASKS, ORIGINAL_TASKS)
        models, repeats = settings({})
        self.assertEqual(len(models), 9)
        self.assertEqual(repeats, 2)
        self.assertFalse(set(models) & set(EXCLUDED))

    def test_reject_invalid_selection(self):
        for model in (*EXCLUDED, 'unknown', 'Kimi-K2.6,Kimi-K2.6', ''):
            with self.assertRaises(ValueError):
                settings({'BENCHMARK_MODELS': model})
        with self.assertRaises(ValueError):
            settings({'BENCHMARK_REPEATS': '50'})

    def test_format_is_separate_from_correctness(self):
        row = score(self.response('Working.\nFINAL_ANSWER: 2'), '2', 'test-secret', 'Kimi-K2.6')
        self.assertEqual(row['scientific_verdict'], 'correct')
        self.assertFalse(row['format_compliant'])

    def test_truncated_correct_answer_is_not_scored(self):
        row = score(self.response(finish='length'), '2', 'test-secret', 'Kimi-K2.6')
        self.assertEqual(row['status'], 'truncated')
        self.assertEqual(row['scientific_verdict'], 'unverified')

    def test_unknown_finish_is_not_success(self):
        self.assertEqual(score(self.response(finish='content_filter'), '2', 'test-secret', 'Kimi-K2.6')['status'], 'incomplete_response')

    def test_credential_echo_is_rejected(self):
        with self.assertRaises(ValueError):
            score(self.response('test-secret'), '2', 'test-secret', 'Kimi-K2.6')

    def test_summary_shows_failed_attempts(self):
        rows = [dict(model=MODELS[0], status='http_500', scientific_verdict='not_evaluated', format_compliant=False)]
        text = summary([MODELS[0]], rows)
        self.assertIn('0/1', text)
        self.assertIn('not proof', text)

    def test_http_errors_hide_body_and_credentials(self):
        error = urllib.error.HTTPError('https://example.invalid/' + KEY, 401, KEY, {}, None)
        with patch('urllib.request.OpenerDirector.open', side_effect=error):
            with self.assertRaisesRegex(ApiError, '^http_401$'):
                api(KEY, '/models')

    def test_only_worker_gateway_is_called_without_provider_key(self):
        sent = []
        def fake_open(req, timeout=None):
            sent.append(req)
            response = MagicMock()
            body = {'status': 'completed_unverified', 'provider': 'hip', 'model': MODELS[0],
                    'answer': 'FINAL_ANSWER: 2', 'finish_reason': 'length',
                    'completion_latency_seconds': 1.5, 'scientificallyVerified': False,
                    'backendIdentityVerified': False,
                    'usage': {'prompt_tokens': 1, 'completion_tokens': 2, 'total_tokens': 3}}
            response.__enter__.return_value.read.return_value = json.dumps(body).encode()
            return response
        with patch('urllib.request.OpenerDirector.open', side_effect=fake_open):
            reply = api(KEY, '/chat/completions', dict(model=MODELS[0],
                        messages=[dict(role='user', content='q')], temperature=0, max_tokens=768))
        self.assertEqual(sent[0].full_url, 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/research/benchmark')
        self.assertEqual(sent[0].get_header('Authorization'), 'Bearer ' + KEY)
        self.assertEqual(json.loads(sent[0].data)['provider'], 'hip')
        self.assertEqual(score(reply, '2', KEY, MODELS[0])['status'], 'truncated')

    def test_upstream_quota_and_auth_rejections_stop_the_run(self):
        for code in ('benchmark_upstream_quota_exhausted', 'benchmark_upstream_auth_rejected'):
            with self.subTest(code=code), patch('hip_scientific.benchmark_completion', side_effect=GatewayError(code)):
                with self.assertRaises(ApiError) as error:
                    api(KEY, '/chat/completions', dict(model=MODELS[0], messages=[], temperature=0, max_tokens=768))
                self.assertIn(str(error.exception), STOP_STATUSES)
        self.assertNotIn('gateway_benchmark_upstream_failed', STOP_STATUSES)

    def test_results_use_worker_measured_completion_latency(self):
        reply = {'model': MODELS[0], 'choices': [{'message': {'content': 'FINAL_ANSWER: 0'}, 'finish_reason': 'stop'}],
                 'usage': {}, '_completion_latency_seconds': 2.25}
        def fake_api(_key, path, payload=None):
            return {'data': [{'id': MODELS[0]}]} if path == '/models' else reply
        env = {'ORCHESTRATOR_API_KEY': KEY, 'BENCHMARK_MODELS': MODELS[0], 'BENCHMARK_REPEATS': '1'}
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, env, clear=True), \
             patch('hip_scientific.api', side_effect=fake_api), patch('hip_scientific.time.sleep'), \
             patch('hip_scientific.Path', side_effect=lambda p: Path(tmp) / p), \
             contextlib.redirect_stdout(io.StringIO()):
            hip_scientific.main()
            rows = json.loads((Path(tmp) / 'reports/hip-scientific/results.json').read_text())['results']
        self.assertEqual({r['latency_seconds'] for r in rows}, {2.25})

    def test_gateway_errors_are_sanitized(self):
        for raised, expected in (('gateway_http_429', 'http_429'), ('gateway_http_5xx', 'gateway_http_5xx'),
                                 ('benchmark_model_identity_mismatch', 'gateway_benchmark_model_identity_mismatch'),
                                 ('benchmark_upstream_quota_exhausted', 'gateway_benchmark_upstream_quota_exhausted'),
                                 (KEY, 'gateway_error')):
            with self.subTest(raised=raised), patch('hip_scientific.catalog_models', side_effect=GatewayError(raised)):
                with self.assertRaisesRegex(ApiError, '^' + expected + '$'):
                    api(KEY, '/models')

class HipReviewRegressionTests(unittest.TestCase):
    def test_incomplete_body_becomes_sanitized_per_model_error(self):
        response = MagicMock()
        response.__enter__.return_value.read.side_effect = http.client.IncompleteRead(b'test-secret')
        with patch('urllib.request.OpenerDirector.open', return_value=response):
            with self.assertRaisesRegex(ApiError, '^transport_or_json_error$'):
                api(KEY, '/chat/completions', dict(model=MODELS[0], messages=[], temperature=0, max_tokens=768))

    def test_malformed_model_lists_are_discovery_errors(self):
        for value in (None, [], {}, 'model', {'data': {}}, {'data': 'model'},
                      {'data': []}, {'data': [None]}, {'data': [{'id': 4}]},
                      {'data': [{'id': ' '}]}, {'data': [{'id': MODELS[0]}, {}]}):
            with self.subTest(value=value), self.assertRaises(ApiError):
                model_ids(value)
        self.assertEqual(model_ids({'data': [{'id': MODELS[0]}]}), {MODELS[0]})

    def test_extracted_answer_is_bounded_after_scoring(self):
        content = 'FINAL_ANSWER: ' + 'x' * 100000
        response = {'model': 'Kimi-K2.6', 'choices': [{'message': {'content': content}, 'finish_reason': 'stop'}]}
        row = score(response, '2', 'test-secret', 'Kimi-K2.6')
        self.assertEqual(row['scientific_verdict'], 'unverified')
        self.assertEqual(len(row['actual_answer']), 1000)
        self.assertEqual(len(row['raw_response']), 6000)

class HipIdentityTests(unittest.TestCase):
    def response(self, model='Kimi-K2.6', finish='stop'):
        return {'model': model, 'choices': [{'message': {'content': 'FINAL_ANSWER: 2'}, 'finish_reason': finish}]}

    def test_metadata_is_bounded(self):
        for finish in ({'large': 'x' * 100000}, 'x' * 100000, ['stop']):
            row = score(self.response(finish=finish), '2', 'test-secret', 'Kimi-K2.6')
            self.assertIsNone(row['finish_reason'])
            self.assertNotEqual(row['status'], 'ok')
        for model in ('x' * 100000, {'model': 'Kimi-K2.6'}, None, 'bad\nmodel'):
            row = score(self.response(model=model), '2', 'test-secret', 'Kimi-K2.6')
            self.assertIsNone(row['response_model'])
            self.assertEqual(row['status'], 'model_identity_unverified')
            self.assertEqual(row['scientific_verdict'], 'unverified')

    def test_mismatched_and_missing_models_not_scored(self):
        for model in (None, 'Qwen3.8-27B'):
            row = score(self.response(model=model), '2', 'test-secret', 'Kimi-K2.6')
            self.assertNotEqual(row['status'], 'ok')
            self.assertEqual(row['scientific_verdict'], 'unverified')
            self.assertIsNone(row['actual_answer'])
        response = self.response()
        del response['model']
        self.assertEqual(score(response, '2', 'test-secret', 'Kimi-K2.6')['status'], 'model_identity_unverified')

if __name__ == '__main__':
    unittest.main()
