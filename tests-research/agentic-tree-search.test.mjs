import test from 'node:test';
import assert from 'node:assert/strict';
import { agenticTreeSearch } from '../research/agentic-tree-search.mjs';

test('search visits alternate branches then a deeper branch and stops on verification', async () => {
  const seen = [];
  const result = await agenticTreeSearch({
    maxNodes: 3, maxDepth: 2, maxChildren: 2,
    expand: parent => parent.depth === 0
      ? [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }]
      : [{ id: 'followup', label: 'Follow-up' }],
    evaluate: node => {
      seen.push(node.id);
      return { verified: node.depth === 2, score: node.depth === 2 ? 1 : 0 };
    },
  });
  assert.deepEqual(seen, ['root/first', 'root/second', 'root/first/followup']);
  assert.equal(result.verifiedNodeId, 'root/first/followup');
  assert.equal(result.evaluatedNodes, 3);
});
test('search enforces the hard node budget', async () => {
  const r = await agenticTreeSearch({ maxNodes: 1, maxChildren: 2,
    expand: () => [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    evaluate: () => ({ verified: false, score: 0 }) });
  assert.equal(r.trace.length, 1);
  assert.equal(r.exhausted, true);
});
test('invalid expansions and claims of verification fail closed', async () => {
  await assert.rejects(agenticTreeSearch({
    expand: () => [{ id: '../bad', label: 'Bad' }], evaluate: () => ({ verified: false, score: 0 }),
  }), /invalid_search_action/);
  await assert.rejects(agenticTreeSearch({
    expand: () => [{ id: 'a', label: 'A' }], evaluate: () => ({ verified: true, score: 0 }),
  }), /invalid_search_evidence/);
  await assert.rejects(agenticTreeSearch({
    expand: () => Array(5).fill({ id: 'a', label: 'A' }),
    evaluate: () => ({ verified: false, score: 0 }),
  }), /invalid_search_expansion/);
  await assert.rejects(agenticTreeSearch({ maxNodes: 50, expand() {}, evaluate() {} }), /invalid_max_nodes/);
});
test('search cannot expand beyond maximum depth', async () => {
  const r = await agenticTreeSearch({ maxNodes: 5, maxDepth: 1, maxChildren: 1,
    expand: () => [{ id: 'a', label: 'A' }], evaluate: () => ({ verified: false, score: 0 }) });
  assert.equal(r.trace.length, 1);
  assert.equal(r.trace[0].depth, 1);
});
