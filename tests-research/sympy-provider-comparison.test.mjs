import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../.github/workflows/sympy-provider-comparison.yml', import.meta.url), 'utf8');
test('two matched providers, manually invoked only and scoped to main', () => {
  assert.match(text, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(text, /schedule:|pull_request_target:|workflow_run:/);
  assert.match(text, /matrix:\n        provider: \[hip, blablador\]/);
  assert.match(text, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /environment: research-inference/);
  assert.match(text, /permissions:\n  contents: read/);
  assert.match(text, /fail-fast: false/);
});
test('provider route and seed are bounded, secret names remain private', () => {
  assert.match(text, /ROUTER_PROVIDER: .*matrix\.provider/);
  assert.match(text, /EXPERIMENT_SEED: .*inputs\.seed/);
  assert.match(text, /node research\/github-router-sympy-pilot\.mjs/);
  assert.match(text, /ORCHESTRATOR_API_KEY: .*secrets\\.ORCHESTRATOR_API_KEY/);
  assert.match(text, /sympy-provider-.*matrix\.provider/);
  assert.doesNotMatch(text, /BLABLADOR_API_KEY|HIP_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|pull_request_target/);
});
