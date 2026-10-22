import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDesign, preregistrationOutcome, designSeries, runAr1DesignExperiment, DESIGN_SPACE, designPrompt } from '../research/ar1-design.mjs';
import { CATALOG } from '../research/catalog.mjs';
import { researchVerdict } from '../research/oraklet-problem-bank.mjs';

const valid = { method: 'ar1-design', hypothesis: 'Testet förkastar H0 vid phi=0.6 men inte vid phi=0.',
  designs: [{ phi: 0, n: 64, prediction: 'do_not_reject_h0' }, { phi: 0.6, n: 128, prediction: 'reject_h0' }, { phi: 0.2, n: 64, prediction: 'do_not_reject_h0' }],
  falsification: 'any_mismatch', comparison: 'Nollkontroll phi=0 mot phi=0.6.' };

test('the design must stay inside the fixed design space and include a null control', () => {
  assert.deepEqual(parseDesign(JSON.stringify(valid)), valid);
  const bad = [
    { ...valid, designs: valid.designs.slice(0, 2) },
    { ...valid, designs: [...valid.designs.slice(0, 2), { phi: 0.5, n: 64, prediction: 'reject_h0' }] },
    { ...valid, designs: [...valid.designs.slice(0, 2), { phi: 0.2, n: 100, prediction: 'reject_h0' }] },
    { ...valid, designs: [...valid.designs.slice(0, 2), { phi: 0, n: 64, prediction: 'reject_h0' }] },
    { ...valid, designs: valid.designs.map(d => ({ ...d, phi: d.phi || 0.1 })) },
    { ...valid, designs: [...valid.designs.slice(0, 2), { phi: 0.2, n: 64, prediction: 'maybe' }] },
    { ...valid, designs: [...valid.designs.slice(0, 2), { phi: 0.2, n: 64, prediction: 'reject_h0', code: 'x' }] },
    { ...valid, falsification: 'never' },
    { ...valid, hypothesis: '' }, { ...valid, comparison: 'x'.repeat(301) }, { ...valid, method: 'other' }, { ...valid, extra: 1 }];
  for (const b of bad) assert.equal(parseDesign(JSON.stringify(b)), null, JSON.stringify(b).slice(0, 120));
  assert.equal(parseDesign('not json'), null);
  assert.ok(JSON.parse(designPrompt()[1].content).designSpace.phi.includes(0));
  assert.equal(DESIGN_SPACE.points, 3);
});

test('the preregistered falsification criterion decides the outcome', () => {
  const decisions = ['do_not_reject_h0', 'reject_h0', 'reject_h0'];
  assert.deepEqual(preregistrationOutcome(valid, decisions), { mismatches: 1, outcome: 'refuted' });
  assert.deepEqual(preregistrationOutcome({ ...valid, falsification: 'two_or_more_mismatches' }, decisions), { mismatches: 1, outcome: 'confirmed' });
  assert.deepEqual(preregistrationOutcome(valid, ['do_not_reject_h0', 'reject_h0', 'do_not_reject_h0']), { mismatches: 0, outcome: 'confirmed' });
});

test('series are deterministic per seed and design point and sized by n', () => {
  const a = designSeries('7', { phi: 0.2, n: 96 });
  assert.deepEqual(a, designSeries('7', { phi: 0.2, n: 96 }));
  assert.equal(a.train.length, 96); assert.equal(a.holdout.length, 16);
  assert.notDeepEqual(a.train, designSeries('7', { phi: 0.3, n: 96 }).train);
  assert.notDeepEqual(a.train, designSeries('8', { phi: 0.2, n: 96 }).train);
});

test('the preregistration is committed before any tool call; invalid designs never reach a tool', async () => {
  const order = [];
  await assert.rejects(runAr1DesignExperiment('7', async () => ({ text: JSON.stringify(valid), provider: 'p', model: 'm' }),
    async () => { order.push('tool'); throw new Error('down'); }, async receipts => { order.push(receipts.length === 1 && receipts[0].preregistrationSha256 ? 'prereg' : `data:${receipts.length}`); }));
  // The preregistration alone is persisted before the series exist; the data commitments follow.
  assert.deepEqual(order, ['prereg', 'data:4', 'tool']);
  let tools = 0;
  await assert.rejects(runAr1DesignExperiment('7', async () => ({ text: JSON.stringify({ ...valid, falsification: 'never' }), provider: 'p', model: 'm' }),
    async () => { tools++; }, async () => {}), /invalid_model_proposal/);
  assert.equal(tools, 0);
  const entry = CATALOG.find(e => e.id === 'ar1-power-design');
  assert.deepEqual([entry.domain, entry.toolId, entry.design, entry.automatic], ['statistics', 'statsmodels', 'ar1', undefined]);
});

test('Problem Bank follows the locked criterion, which may tolerate one wrong prediction', () => {
  const entry = { id: 'ar1-power-design', toolId: 'statsmodels' };
  const report = (status, outcome, mismatches) => ({ executionStatus: 'completed', status, seed: '7', reportId: 'r', preregistrationOutcome: { outcome, mismatches } });
  assert.equal(researchVerdict(entry, report('passed', 'confirmed', 1), 2, 3).status, 'verified');
  assert.match(researchVerdict(entry, report('passed', 'confirmed', 1), 2, 3).claim, /held under its own locked criterion \(1 of 3/);
  assert.equal(researchVerdict(entry, report('failed', 'refuted', 1), 2, 3).status, 'falsified');
  assert.equal(researchVerdict(entry, report('passed', 'refuted', 2), 1, 3).status, 'needs_external_verification');
  assert.equal(researchVerdict(entry, report('passed', 'confirmed', 0), 2, 3).status, 'needs_external_verification');
});
