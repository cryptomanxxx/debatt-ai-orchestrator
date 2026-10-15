import unittest
import http.client
from unittest.mock import patch, MagicMock
import urllib.error
from hip_scientific import MODELS, EXCLUDED, TASKS, settings, score, summary, api, ApiError, model_ids
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
        error = urllib.error.HTTPError('https://example.invalid/test-secret', 401, 'test-secret', {}, None)
        with patch('urllib.request.OpenerDirector.open', side_effect=error):
            with self.assertRaisesRegex(ApiError, '^http_401$'):
                api('test-secret', '/models')

class HipReviewRegressionTests(unittest.TestCase):
    def test_incomplete_body_becomes_sanitized_per_model_error(self):
        response = MagicMock()
        response.__enter__.return_value.read.side_effect = http.client.IncompleteRead(b'test-secret')
        with patch('urllib.request.OpenerDirector.open', return_value=response):
            with self.assertRaisesRegex(ApiError, '^transport_or_json_error$'):
                api('test-secret', '/chat/completions', {'model': MODELS[0]})

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
