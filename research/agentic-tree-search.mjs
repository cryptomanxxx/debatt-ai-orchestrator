// Bounded best-first search over the caller's explicitly allowed actions.
// No commands, code execution or network access live in this engine.
const limit = (value, name, lo, hi) => {
  if (!Number.isInteger(value) || value < lo || value > hi) throw new Error('invalid_' + name);
};
export async function agenticTreeSearch({ expand, evaluate, maxNodes = 3, maxDepth = 2, maxChildren = 2 }) {
  limit(maxNodes, 'max_nodes', 1, 12);
  limit(maxDepth, 'max_depth', 1, 5);
  limit(maxChildren, 'max_children', 1, 4);
  if (typeof expand !== 'function' || typeof evaluate !== 'function') throw new Error('invalid_search_callbacks');
  const frontier = [{ id: 'root', parentId: null, depth: 0, path: [], priority: 0, order: 0 }];
  const trace = [];
  let nextOrder = 1;
  let verifiedNodeId = null;
  while (frontier.length && trace.length < maxNodes) {
    frontier.sort((a, b) => b.priority - a.priority || a.depth - b.depth || a.order - b.order);
    const parent = frontier.shift();
    if (parent.depth >= maxDepth) continue;
    const actions = await expand(Object.freeze({ ...parent, path: Object.freeze([...parent.path]) }));
    if (!Array.isArray(actions) || actions.length > maxChildren) throw new Error('invalid_search_expansion');
    const actionIds = new Set();
    for (const action of actions) {
      if (!action || typeof action !== 'object' || Array.isArray(action)
        || typeof action.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(action.id)
        || typeof action.label !== 'string' || !action.label.trim() || action.label.length > 120
        || actionIds.has(action.id)) throw new Error('invalid_search_action');
      actionIds.add(action.id);
    }
    for (const action of actions) {
      if (trace.length >= maxNodes) break;
      const node = { id: parent.id + '/' + action.id, parentId: parent.id,
        actionId: action.id, label: action.label, depth: parent.depth + 1,
        path: [...parent.path, action.id] };
      const verdict = await evaluate(Object.freeze({ ...node, path: Object.freeze([...node.path]) }));
      if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)
        || typeof verdict.verified !== 'boolean' || !Number.isFinite(verdict.score)
        || verdict.score < 0 || verdict.score > 1
        || (verdict.verified && verdict.score !== 1)) throw new Error('invalid_search_evidence');
      const record = { ...node, score: verdict.score, verified: verdict.verified, result: verdict.result ?? null };
      trace.push(record);
      if (verdict.verified) { verifiedNodeId = node.id; break; }
      if (node.depth < maxDepth) frontier.push({ ...node, priority: verdict.score, order: nextOrder++ });
    }
    if (verifiedNodeId) break;
  }
  return { schemaVersion: 1, algorithm: 'bounded-best-first-tree-search',
    limits: { maxNodes, maxDepth, maxChildren }, evaluatedNodes: trace.length,
    verifiedNodeId, trace, exhausted: !verifiedNodeId && (trace.length >= maxNodes || frontier.length === 0) };
}
