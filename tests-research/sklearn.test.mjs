import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSklearnCases, sklearnOracle, validateSklearnInput, parseSklearnProposal } from '../research/sklearn.mjs';

test('rational OLS has known coefficients, contrasting controls and a held-out outlier penalty', () => {
  for (let seed = 0; seed < 50; seed++) {
    const fixtures = makeSklearnCases(String(seed));
    assert.deepEqual(fixtures, makeSklearnCases(String(seed)));
    assert.equal(new Set(fixtures.map(f => f.commitment)).size, 3);
    assert.deepEqual(fixtures.map(f => sklearnOracle(f.input).selectedDegree), [1, 2, 1]);
    assert.deepEqual(fixtures.map(f => sklearnOracle(f.control).selectedDegree), [2, 1, 2]);
    for (const f of fixtures) {
      const xs = Object.values(f.input).flat().map(([x]) => x);
      assert.equal(new Set(xs).size, xs.length);
    }
  }
  const input = { train: [-3, -2, -1, 0, 1, 2].map(x => [x, 1 + 2*x + 3*x*x]),
    validation: [[3, 34], [4, 57]], test: [[5, 86], [6, 121]] };
  const result = sklearnOracle(input);
  assert.deepEqual(result.models[1].coefficients, [1, 2, 3]);
  assert.equal(result.models[1].testMse, 0);
  const outlier = sklearnOracle(makeSklearnCases('123')[2].input);
  assert.ok(outlier.models[0].testMse > 0);
  assert.ok(outlier.models[0].testMse < outlier.models[1].testMse);
});

test('independent OLS fits training only and makes no selection using test labels', () => {
  const input = makeSklearnCases('123')[1].input, original = sklearnOracle(input);
  const altered = structuredClone(input);
  altered.test.forEach(row => row[1] += 500);
  const result = sklearnOracle(altered);
  assert.equal(result.selectedDegree, original.selectedDegree);
  assert.deepEqual(result.models.map(m => m.coefficients), original.models.map(m => m.coefficients));
  assert.deepEqual(result.models.map(m => m.validationMse), original.models.map(m => m.validationMse));
  assert.notEqual(result.selectedTestMse, original.selectedTestMse);
  altered.validation.forEach(row => row[1] -= 200);
  assert.deepEqual(sklearnOracle(altered).models.map(m => m.coefficients), original.models.map(m => m.coefficients));
});

test('Scikit-learn boundary rejects overlapping, executable, unbounded and malformed input', () => {
  const input = makeSklearnCases('123')[0].input;
  for (const mutate of [v => { v.test[0][0] = v.train[0][0]; }, v => { v.train[0][1] = true; },
    v => { v.train[0][1] = NaN; }, v => { v.train[0][0] = 17; }, v => { v.train[0][1] = 10001; },
    v => { v.train = v.train.slice(0, 5); }, v => { v.code = 'run'; }]) {
    const v = structuredClone(input); mutate(v); assert.throws(() => validateSklearnInput(v), /invalid_tool_evidence/);
  }
  const proposal = { method: 'scikit-learn', degree: 1, reason: 'Linjärt samband.' };
  assert.deepEqual(parseSklearnProposal(JSON.stringify(proposal)), proposal);
  for (const change of [{ degree: 3 }, { degree: '1' }, { reason: '' }, { code: 'exec' }, { method: 'shell' }])
    assert.equal(parseSklearnProposal(JSON.stringify({ ...proposal, ...change })), null);
});
