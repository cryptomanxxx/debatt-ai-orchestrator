import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDowhyCases, dowhyOracle, validateDowhyInput, parseDowhyProposal } from '../research/dowhy.mjs';
test('exact rational backdoor oracle recovers planted effects and confounding', () => {
  const fixtures = makeDowhyCases('123');
  assert.deepEqual(fixtures, makeDowhyCases('123'));
  assert.notDeepEqual(fixtures, makeDowhyCases('456'));
  for (const f of fixtures) {
    const r = dowhyOracle(f.input), c = dowhyOracle(f.control);
    assert.deepEqual(r.coefficients, [f.truth.intercept, f.truth.effect, f.truth.confounder]);
    assert.equal(r.effect, f.truth.effect);
    assert.equal(r.naiveEffect, f.truth.effect + f.truth.confounder/2);
    assert.equal(r.residualMse, 2/3);
    assert.equal(c.effect, f.truth.controlEffect);
    assert.notEqual(c.decision, r.decision);
  }
  assert.ok(dowhyOracle(fixtures[1].input).naiveEffect > 0);
  assert.ok(dowhyOracle(fixtures[1].input).effect < 0);
});
test('bounded input refuses caller graph/code and singular designs', () => {
  const input = makeDowhyCases('123')[0].input;
  for (const bad of [{...input, graph: []}, {...input, code: 'exec'}, {rows: input.rows.slice(0, 24)},
    {rows: Array(25).fill([1, 1, 1])}, {rows: Array(25).fill([true, 1, 1])},
    {rows: Array(25).fill([17, 1, 1])}]) assert.throws(() => dowhyOracle(bad), /invalid_tool_evidence/);
  assert.doesNotThrow(() => validateDowhyInput(input));
  for (const seed of ['', 'x', '-1', '1234567890', 123]) assert.throws(() => makeDowhyCases(seed), /invalid_plan/);
});
test('proposal allows scientifically wrong omission but refuses free code and other methods', () => {
  const p = {method:'dowhy', adjustment:[], effect:1, reason:'Utan justering.'};
  assert.deepEqual(parseDowhyProposal(JSON.stringify(p)), p);
  for (const bad of [{...p, code:'exec'}, {...p, adjustment:['t']}, {...p, effect:101},
    {...p, method:'other'}, {...p, reason:''}]) assert.equal(parseDowhyProposal(JSON.stringify(bad)), null);
});

test('oracle solves an unbalanced full-rank design independently of factorial fixtures', () => {
  const rows=Array.from({length:25},(_,i)=>{const z=i%7-3,t=(i*i)%13-6;return [z,t,7-3*t+5*z];});
  const r=dowhyOracle({rows});
  assert.deepEqual(r.coefficients,[7,-3,5]);
  assert.equal(r.residualMse,0); assert.equal(r.decision,'negative');
});
