import test from 'node:test';
import assert from 'node:assert/strict';
import { planResearch, validateCorpus } from '../research/autonomous-planner.mjs';

const paper = (id, title, abstract = 'A reproducible evaluation of this approach.') => ({
  id, title, abstract, url: `https://example.org/papers/${id}`, year: 2025,
});

test('planner creates traceable unverified proposals and does not execute', () => {
  const result = planResearch([
    paper('a', 'Active learning for experiment design'),
    paper('b', 'Bayesian optimization and information gain'),
    paper('c', 'Symbolic regression for rational functions'),
  ]);
  assert.equal(result.corpus_count, 3);
  assert.equal(result.execution_enabled, false);
  assert.equal(result.proposals.length, 2);
  assert.equal(result.proposals[0].evidence_count, 2);
  assert.equal(result.proposals[0].status, 'candidate_unverified');
  assert.equal(result.proposals[0].requires_human_approval, true);
  assert.equal(result.proposals[0].evidence[0].id, 'a');
  assert.ok(result.proposals.some(x => x.id === 'arp-symbolic-regression'));
  assert.ok(!result.proposals.some(x => x.id === 'arp-reproducibility'));
  assert.match(result.selection_note, /not by verified scientific merit/);
});

test('complete reports are deterministic regardless of input order, including same-theme citations', () => {
  const items = [paper('b', 'Active learning'), paper('a', 'Bayesian optimization'), paper('c', 'Symbolic regression')];
  assert.deepEqual(planResearch(items), planResearch([...items].reverse()));
});

test('invalid or duplicate source metadata is rejected', () => {
  assert.throws(() => validateCorpus([]), /non-empty/);
  assert.throws(() => validateCorpus([paper('a', 'Experiment'), paper('a', 'Experiment')]), /Duplicate/);
  assert.throws(() => validateCorpus([{ ...paper('a', 'Experiment'), url: 'http://insecure' }]), /HTTPS/);
  assert.throws(() => planResearch([paper('a', 'Experiment')], { maxProposals: 0 }), /1\.\.100/);
});

test('no novelty claim from a single paper', () => {
  const proposal = planResearch([paper('a', 'A scientific discovery agent')]).proposals[0];
  assert.equal(proposal.scores.novelty, 1);
  assert.ok(proposal.caveats.some(x => x.includes('Novelty requires')));
});

test('specific symbolic regression topic wins over broad research and active-learning keywords', () => {
  for (const title of ['Symbolic regression for scientific discovery', 'Symbolic regression with active learning']) {
    assert.equal(planResearch([paper('s', title)]).proposals[0].id, 'arp-symbolic-regression');
  }
});

test('canonical ordering is stable for canonically equivalent Unicode IDs', () => {
  const items = [paper('é', 'Active learning'), paper('e\u0301', 'Bayesian optimization')];
  assert.deepEqual(planResearch(items), planResearch([...items].reverse()));
});

test('rejects whitespace anywhere in HTTPS source URLs', () => {
  for (const url of ['https://example.org/a b', 'https://example.org/a\tb', 'https://example.org/a\nb']) {
    assert.throws(() => validateCorpus([{ ...paper('a', 'Experiment'), url }]), /HTTPS/);
  }
});
