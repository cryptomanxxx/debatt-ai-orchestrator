import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCases, runExperiment, modelPrompt, parseProposal, verifyFormula, validateTool, checkVisiblePoints, correctionPrompt, UPSTREAM } from '../research/ratfit.mjs';

function response(accepted) {
  return { status: accepted ? 200 : 422, data: { provider: 'bootloops', mock: false,
    toolResult: { tool: 'bootloops_ratfit', upstreamCommit: UPSTREAM, accepted, depth: 3, checked: 3, failed: accepted ? 0 : 1 },
    verification: { status: accepted ? 'passed' : 'failed', scope: 'exact_rational_holdout', factualityChecked: false } } };
}
function proposal(coefficients) { return JSON.stringify({ method: 'bootloops_ratfit', coefficients, reason: 'Exakt rationell rekonstruktion med separata kontrollpunkter.' }); }

test('reproducerbara data, blindad modellprompt och alla kontroller före rapport', async () => {
  const fixtures = makeCases('20261006');
  assert.deepEqual(fixtures, makeCases('20261006'));
  assert.notDeepEqual(fixtures, makeCases('123'));
  let committed = false, calls = 0, models = 0;
  const report = await runExperiment('20261006', async messages => {
    assert.equal(committed, true);
    assert.deepEqual(messages, modelPrompt(fixtures[models].input.banked));
    assert.deepEqual(Object.keys(JSON.parse(messages[1].content)), ['banked']);
    return { text: proposal(fixtures[models++].truth), provider: 'test', model: 'test-model' };
  }, async input => {
    const index = Math.floor(calls / 2), positive = calls++ % 2 === 0;
    assert.deepEqual(input.banked, fixtures[index].input.banked);
    const matches = verifyFormula(fixtures[index].truth, input.holdout);
    assert.equal(matches, positive);
    return response(matches);
  }, commitments => { assert.equal(commitments.length, 3); committed = true; });
  assert.equal(calls, 6);
  assert.equal(models, 3);
  assert.equal(report.status, 'passed');
  assert.ok(report.cases.every(c => c.passed && c.negativeControl.failed === 1));
  assert.match(report.limitations, /inte en ny vetenskaplig upptäckt/);
});

test('felaktiga modellformler blir underkända trots godkänd Ratfit-körning', async () => {
  let calls = 0;
  const report = await runExperiment('99', async () => ({ text: proposal(['0','0','0','1']), provider: 'test', model: 'test' }),
    async () => response(calls++ % 2 === 0));
  assert.equal(report.status, 'failed');
  assert.ok(report.cases.every(c => !c.passed && !c.holdoutMatch && c.ratfit.accepted));
});

test('exakt kontroll: stora heltal, ekvivalenta koefficienter och poler', () => {
  assert.equal(verifyFormula(['1','1','1','2'], [['999999999999999999999999','1000000000000000000000000/1000000000000000000000001']]), true);
  assert.equal(verifyFormula(['2','2','2','4'], [['4','5/6']]), true);
  assert.equal(verifyFormula(['1','1','1','2'], [['4','0']]), false);
  assert.equal(verifyFormula(['1','1','1','2'], [['-2','0']]), false);
});

test('modellens svar får inte innehålla kod, extra fält eller ogiltiga koefficienter', () => {
  assert.equal(parseProposal('```json\n{}\n```'), null);
  const valid = JSON.parse(proposal(['1','1','1','2']));
  assert.equal(parseProposal(JSON.stringify({ ...valid, code: 'fetch(secret)' })), null);
  assert.equal(parseProposal(proposal(['1','1','0','0'])), null);
  assert.equal(parseProposal(proposal(['1.5','1','1','2'])), null);
  assert.equal(parseProposal(proposal(['1000','1','1','2'])), null);
  assert.throws(() => makeCases('$(oops)'));
});

test('mock, fel upstream, scope, räknare och missad negativ kontroll avvisas', async () => {
  const good = response(true);
  for (const change of [
    d => { d.mock = true; }, d => { d.toolResult.upstreamCommit = 'other'; },
    d => { d.verification.scope = 'response_shape'; }, d => { d.toolResult.checked = 2; },
    d => { d.toolResult.failed = 1; }, d => { d.verification.factualityChecked = true; },
  ]) {
    const modified = structuredClone(good); change(modified.data);
    assert.throws(() => validateTool(modified.status, modified.data, true, 3));
  }
  await assert.rejects(runExperiment('99', async () => ({ text: proposal(['1','1','1','2']), provider: 'test', model: 'test' }),
    async () => response(true)), /tool_http_error/);
});

test('fall 2 korrigeras en gång med bara synliga punkter; första försöket bevaras', async () => {
  const fixtures = makeCases('20261006');
  let caseIndex = 0, modelCalls = 0, toolCalls = 0, correctionDone = false;
  const wrong = ['2', '7', '9', '0'];
  const report = await runExperiment('20261006', async messages => {
    modelCalls++;
    const fixture = fixtures[caseIndex];
    if (caseIndex === 1 && messages.length === 2) {
      return { text: proposal(wrong), provider: 'test', model: 'same' };
    }
    if (caseIndex === 1) {
      assert.equal(toolCalls, 2, 'inga kontroller av fall 2 före slutligt förslag');
      const checks = checkVisiblePoints(wrong, fixture.input.banked);
      assert.deepEqual(messages, correctionPrompt(fixture.input.banked, JSON.parse(proposal(wrong)), checks));
      assert.equal(checks.length, 6);
      assert.deepEqual(checks.map(p => p.x), ['0', '1', '2', '3', '4', '5']);
      assert.equal(checks[0].actual, null);
      assert.equal(checks[1].actual, '1');
      assert.deepEqual(Object.keys(JSON.parse(messages[3].content)), ['instruction', 'visibleChecks']);
      assert.ok(!JSON.stringify(messages).includes('23/33'));
      correctionDone = true;
    }
    return { text: proposal(fixture.truth), provider: 'test', model: 'same' };
  }, async () => {
    if (caseIndex === 1) assert.ok(correctionDone);
    const positive = toolCalls++ % 2 === 0;
    if (!positive) caseIndex++;
    return response(positive);
  });
  assert.equal(modelCalls, 4);
  assert.equal(toolCalls, 6);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.status, 'passed');
  const repaired = report.cases[1];
  assert.equal(repaired.initialPassed, false);
  assert.equal(repaired.initialHoldoutMatch, false);
  assert.equal(repaired.passed, true);
  assert.equal(repaired.sameModel, true);
  assert.equal(repaired.attempts.length, 2);
  assert.deepEqual(repaired.attempts[0].proposal.coefficients, wrong);
  assert.deepEqual(repaired.proposal.coefficients, fixtures[1].truth);
  assert.ok(report.cases[0].initialPassed);
  assert.equal(report.cases[0].attempts.length, 1);
});

test('fortsatt fel efter korrigering ger underkänt, högst sex modellförslag och redovisat modellbyte', async () => {
  let models = 0, tools = 0;
  const report = await runExperiment('99', async () => ({
    text: proposal(['0', '0', '0', '1']), provider: 'test', model: models++ % 2 === 0 ? 'first' : 'second',
  }), async () => response(tools++ % 2 === 0));
  assert.equal(models, 6);
  assert.equal(tools, 6);
  assert.equal(report.status, 'failed');
  assert.ok(report.cases.every(c => c.correctionAttempted && !c.sameModel && !c.initialPassed && !c.passed && c.attempts.length === 2));
});

test('ogiltigt korrigeringssvar får inte gå vidare till blind kontroll', async () => {
  let models = 0, tools = 0;
  await assert.rejects(runExperiment('99', async () => ({
    text: models++ === 0 ? proposal(['0', '0', '0', '1']) : '{}', provider: 'test', model: 'test',
  }), async () => { tools++; return response(true); }), /invalid_model_proposal/);
  assert.equal(models, 2);
  assert.equal(tools, 0);
});

test('rätt formel i motiveringen ersätter inte felaktiga JSON-koefficienter', async () => {
  let calls = 0;
  const report = await runExperiment('20261006', async () => ({
    text: JSON.stringify({ method: 'bootloops_ratfit', coefficients: ['2', '7', '9', '0'],
      reason: 'Slutlig formel: (2x+7)/(3x+9). Koefficienter a=2,b=7,c=3,d=9.' }),
    provider: 'test', model: 'test',
  }), async () => response(calls++ % 2 === 0));
  assert.equal(report.promptVersion, 'consistent-coefficients-v1');
  assert.equal(report.cases[1].passed, false);
  assert.equal(report.cases[1].correctionAttempted, true);
  assert.deepEqual(report.cases[1].proposal.coefficients, ['2', '7', '9', '0']);
  assert.ok(verifyFormula(makeCases('20261006')[1].truth, report.cases[1].data.holdout));
});


test('stegvis feedback visar två punkter först och låser holdout', async () => {
  const fixtures = makeCases('20261009');
  let caseIndex = 0, calls = 0, toolCalls = 0;
  const report = await runExperiment('20261009', async messages => {
    calls++;
    const fixture = fixtures[caseIndex];
    if (messages.length === 2) {
      assert.deepEqual(JSON.parse(messages[1].content).banked, fixture.input.banked.slice(0, 2));
      return { text: proposal(['0', '0', '0', '1']), provider: 'test', model: 'same' };
    }
    assert.equal(messages.length, 4);
    assert.deepEqual(JSON.parse(messages[1].content).banked, fixture.input.banked);
    assert.equal(JSON.parse(messages[3].content).visibleChecks.length, 6);
    assert.ok(!JSON.stringify(messages).includes(JSON.stringify(fixture.input.holdout)));
    return { text: proposal(fixture.truth), provider: 'test', model: 'same' };
  }, async () => {
    const positive = toolCalls++ % 2 === 0;
    if (!positive) caseIndex++;
    return response(positive);
  }, () => {}, { staged: true, feedback: true });
  assert.equal(calls, 6);
  assert.equal(toolCalls, 6);
  assert.equal(report.status, 'passed');
  assert.ok(report.cases.every(c => c.staged && c.initialVisibleCount === 2 && !c.initialPassed && c.passed && c.correctionAttempted && c.attempts.length === 2));
});
