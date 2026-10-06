import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchError, diagnostic } from '../research/errors.mjs';

test('public diagnostics never echo arbitrary errors or unbounded context', () => {
  assert.deepEqual(diagnostic(new Error('SECRET token and upstream response')), { code: 'unexpected_error' });
  assert.deepEqual(diagnostic(new ResearchError('tool_http_error', {
    httpStatus: 502, case: 2, operation: 'positive_control', secret: 'SECRET',
  })), { code: 'tool_http_error', httpStatus: 502, case: 2, operation: 'positive_control' });
  assert.deepEqual(diagnostic(new ResearchError('SECRET', {
    httpStatus: 9999, case: 999, operation: 'SECRET',
  })), { code: 'unexpected_error' });
});
