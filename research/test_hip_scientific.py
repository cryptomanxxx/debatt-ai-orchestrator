import unittest
from unittest.mock import patch
import urllib.error
from hip_scientific import MODELS, EXCLUDED, TASKS, settings, score, summary, api, ApiError
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
        row = score(self.response('Working.\nFINAL_ANSWER: 2'), '2', 'test-secret')
        self.assertEqual(row['scientific_verdict'], 'correct')
        self.assertFalse(row['format_compliant'])

    def test_truncated_correct_answer_is_not_scored(self):
        row = score(self.response(finish='length'), '2', 'test-secret')
        self.assertEqual(row['status'], 'truncated')
        self.assertEqual(row['scientific_verdict'], 'unverified')

    def test_unknown_finish_is_not_success(self):
        self.assertEqual(score(self.response(finish='content_filter'), '2', 'test-secret')['status'], 'incomplete_response')

    def test_credential_echo_is_rejected(self):
        with self.assertRaises(ValueError):
            score(self.response('test-secret'), '2', 'test-secret')

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

if __name__ == '__main__':
    unittest.main()
