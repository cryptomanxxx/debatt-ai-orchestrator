import test from 'node:test';
import assert from 'node:assert/strict';
import { stripConfidence, calibrated, markProgress, calibrationReport, calibrationSummary, calibrationMarkdown, CONFIDENCE_RULE, MAX_CALIBRATED_CHARS } from '../research/calibration.mjs';
import { readReports } from '../research/calibration-summary.mjs';

test('confidence is stripped from JSON answers and validated; other text is untouched', () => {
  assert.deepEqual(stripConfidence('{"method":"x","degree":2,"confidence":0.8}'), { text: '{"method":"x","degree":2}', confidence: 0.8 });
  assert.deepEqual(stripConfidence('{"a":1,"confidence":1.5}'), { text: '{"a":1}', confidence: null });
  assert.deepEqual(stripConfidence('{"a":1,"confidence":"high"}'), { text: '{"a":1}', confidence: null });
  assert.deepEqual(stripConfidence('{"a":1}'), { text: '{"a":1}', confidence: null });
  assert.deepEqual(stripConfidence('not json'), { text: 'not json', confidence: null });
  assert.deepEqual(stripConfidence('[1,2]'), { text: '[1,2]', confidence: null });
});

test('the wrapper asks for confidence only when the request fits and returns the stripped answer', async () => {
  const log = { calls: [], marks: [] }; const seen = [];
  const propose = calibrated(async messages => { seen.push(messages); return { text: '{"d":1,"confidence":0.3}', provider: 'p', model: 'm' }; }, log);
  const answer = await propose([{ role: 'user', content: 'q' }]);
  assert.deepEqual(answer, { text: '{"d":1}', provider: 'p', model: 'm' });
  assert.equal(seen[0].at(-1).content, CONFIDENCE_RULE);
  await propose([{ role: 'user', content: 'x'.repeat(MAX_CALIBRATED_CHARS) }]);
  assert.equal(seen[1].length, 1, 'no rule appended to an already large request');
  assert.deepEqual(log.calls, [0.3, 0.3]);
});

test('each case is scored on the confidence of its initial proposal', () => {
  const log = { calls: [], marks: [] };
  log.calls.push(0.9); markProgress(log, 1);           // case 1: one call
  log.calls.push(0.4, 0.7); markProgress(log, 2);      // case 2: initial + correction
  markProgress(log, 2);                                 // repeated progress (e.g. family update)
  log.calls.push(null); markProgress(log, 3);          // case 3: no confidence given
  const cases = [{ case: 1, initialPassed: true, passed: true }, { case: 2, initialPassed: false, passed: true }, { case: 3, initialPassed: true, passed: true }];
  const r = calibrationReport(log, cases);
  assert.deepEqual(r.cases, [{ case: 1, confidence: 0.9, passed: true }, { case: 2, confidence: 0.4, passed: false }, { case: 3, confidence: null, passed: true }]);
  assert.equal(r.scoredCases, 2);
  assert.equal(r.meanConfidence, 0.65);
  assert.equal(r.passRate, 0.5);
  assert.equal(r.brierScore, 0.085);
  assert.equal(calibrationReport({ calls: [], marks: [] }, []).brierScore, null);
  assert.deepEqual(calibrationReport({ calls: [0.5], marks: [1] }, [{ case: 1, passed: false }]).cases, [{ case: 1, confidence: 0.5, passed: false }]);
});

test('calibration across reports is summarised per model with reliability bins', async () => {
  const report = (model, rows) => ({ cases: [{ provider: 'hip', model }], calibration: { cases: rows } });
  const summary = calibrationSummary([
    report('GLM', [{ confidence: 0.9, passed: true }, { confidence: 0.9, passed: true }, { confidence: 0.1, passed: false }]),
    report('GLM', [{ confidence: 0.7, passed: false }, { confidence: null, passed: true }]),
    report('Kimi', [{ confidence: 0.9, passed: false }, { confidence: 0.95, passed: false }]),
    { cases: [], calibration: { cases: [{ confidence: 0.5, passed: true }] } }, { cases: [{ provider: 'x', model: 'y' }] }, null]);
  assert.deepEqual(summary.map(m => [m.model, m.runs, m.cases]), [['hip / GLM', 2, 4], ['hip / Kimi', 1, 2]]);
  const glm = summary[0];
  assert.equal(glm.passRate, 0.5);
  assert.equal(glm.brierScore, 0.13);
  assert.deepEqual(glm.bins.map(b => [b.cases, b.passRate]), [[1, 0], [0, null], [0, null], [1, 0], [2, 1]]);
  assert.ok(summary[1].brierScore > 0.8, 'confident and wrong scores badly');
  const md = calibrationMarkdown(summary);
  assert.match(md, /## hip \/ GLM/);
  assert.match(md, /\| 0\.8-1 \| 2 \| 1 \|/);
  assert.match(calibrationMarkdown([]), /Inga kalibrerade körningar/);
  const reports = await readReports('key', async (url, options) => {
    assert.match(String(url), /select=rapport&order=skapad\.desc&limit=200/);
    assert.equal(options.headers.Authorization, 'Bearer key');
    return new Response(JSON.stringify([{ rapport: { id: 1 } }, { rapport: null }]));
  });
  assert.deepEqual(reports, [{ id: 1 }]);
  await assert.rejects(readReports('key', async () => new Response('x', { status: 500 })), /reports_unavailable/);
});
