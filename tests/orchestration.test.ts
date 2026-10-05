import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, CalculationError } from '../src/tools/calculator.ts';
import { executeTool } from '../src/tools/registry.ts';
import { createPlan } from '../src/planning/planner.ts';
import { verify } from '../src/verification/verifier.ts';
import { orchestrate } from '../src/orchestrator.ts';
import { loadConfig } from '../src/config.ts';
const config = loadConfig({ ORCHESTRATOR_API_KEY: 'test-key-at-least-24-characters' });
test('calculator handles precedence, parentheses, unary signs and decimals', () => {
  for (const [expression, expected] of [['2+3*4', 14], ['(2+3)*4', 20],
    ['-2*(-3+1)', 4], ['1--2', 3], ['10/4', 2.5], ['.5 + 1.25', 1.75]])
    assert.equal(calculate(String(expression)), expected);
});
test('calculator rejects executable input, bad syntax, division by zero and excessive depth', () => {
  for (const expression of ['process.exit()', '1;2', '1/0', '2(3)', '2**3', '', '1+',
    '('.repeat(40) + '1' + ')'.repeat(40), '1'.repeat(513)])
    assert.throws(() => calculate(expression), CalculationError);
  assert.throws(() => executeTool('shell', 'ls'), /Unknown tool/);
});
test('planner preserves explicit model modes and confines automatic tool routing', () => {
  assert.equal(createPlan('2+2', 'default', config).strategy, 'direct');
  assert.equal(createPlan('räkna: (2+2)*3', 'auto', config).strategy, 'arithmetic');
  assert.equal(createPlan('Vad betyder 2+2 i sammanhanget?', 'auto', config).strategy, 'direct');
  const real = { ...config, provider: 'openai', defaultModel: 'small', reasoningModel: 'large' };
  assert.equal(createPlan('Hej', 'reasoning', real).steps[0].model, 'large');
  assert.throws(() => createPlan('Hej', 'reasoning', { ...real, reasoningModel: '' }));
});
test('arithmetic pipeline returns plan, trace and local result without provider calls', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Must not call a model'); };
  try {
    const result = await orchestrate('calc: (2+3)*4', 'auto', config);
    assert.equal(result.answer, '20');
    assert.equal(result.mock, false);
    assert.equal(result.model, null);
    assert.equal(result.provider, 'local');
    assert.equal(result.plan.strategy, 'arithmetic');
    assert.equal(result.trace.length, 2);
    assert.equal(result.verification.status, 'passed');
    assert.equal(result.verification.scope, 'arithmetic_consistency');
    await assert.rejects(orchestrate('calc: 1/0', 'auto', config), /division_by_zero/);
  } finally { globalThis.fetch = original; }
});
test('verifier rejects tampered evidence and reports limited scope', () => {
  assert.equal(verify('5', { tool: 'calculator', expression: '2+2', value: 5 }).status, 'failed');
  assert.equal(verify('wrong', { tool: 'calculator', expression: '2+2', value: 4 }).status, 'failed');
  assert.equal(verify('').status, 'failed');
  assert.equal(verify('Test', undefined, true).status, 'not_verified');
  const text = verify('A plausible but unconfirmed claim');
  assert.equal(text.scope, 'response_shape');
  assert.equal(text.factualityChecked, false);
});
