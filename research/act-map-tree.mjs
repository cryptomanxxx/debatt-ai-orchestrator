import { ResearchError } from './errors.mjs';
import { agenticTreeSearch } from './agentic-tree-search.mjs';
import { ACT_MAP_SYSTEM, makeActMapFixture, publicTask, intervene, predict, named, namedClaim, designMessages, inferenceMessages,
  checkDesign, checkInference, parseJson, answer, validateActMap, actMapPasses, vemRecord, actMapOutcome } from './act-map.mjs';

// ACT-MAP with agentic tree search (research/ACT-MAP-LAB.md). The direct protocol asks for one
// answer after the experiments. Here Oraklet first states up to three competing hypotheses; the
// bounded tree search (agentic-tree-search.mjs) checks each against the observations Oraklet has
// already seen, never against the hidden intervention sizes, and stops at the first one that fits
// them all. Oraklet then makes the final claim with that evaluation in front of him. The same
// evidence gate verifies the claim, so results compare directly with act-map-oraklet-v1 on the
// same seed. Three calls per case, so two cases (levels 3 and 4) fit the lab's call budget.

export const ACT_MAP_TREE_LEVELS = Object.freeze([3, 4]);
export const MAX_HYPOTHESES = 3;
export const ACT_MAP_TREE_PROTOCOL = Object.freeze({
  id: 'act-map-tree-v1',
  hypothesis: 'Hjälper det Oraklet att först ställa upp konkurrerande hypoteser och pröva dem mot sina observationer (agentisk trädsökning) innan han avgör om en känd orsaksmekanism finns i ett okänt system?',
  rule: 'Två fall med samma fixturer som act-map-oraklet-v1 på samma seed: nivå 3 (okänd variabel- och ingreppskoppling) och nivå 4 (bara s_0 → s_1 överförs, eller inget). Per fall: Oraklet väljer högst tre ingrepp, ställer upp högst tre hypoteser, trädsökningen prövar dem mot de sedda observationerna, och Oraklet avgör. Godkännande som i act-map-oraklet-v1: rätt beslut och, vid full eller partiell överföring, godkänd evidensgrind med de dolda ingreppsstorlekarna −2 och 3 och rätt koppling.',
  assumptions: 'Samma syntetiska linjära mekanismer som act-map-oraklet-v1. Trädsökningen använder bara observationer Oraklet redan har sett; de dolda ingreppsstorlekarna och facit ingår aldrig.',
  limitations: 'Trädsökningen använder fler modellanrop (tre per fall) och återkoppling från observationerna än det direkta protokollet (två per fall); jämförelsen är inte gjord med lika beräkningsbudget. Två fall per körning ger stor slumpvariation. Syntetiskt; ingen verklig vetenskaplig upptäckt.',
});

export const makeActMapTreeCases = seed => ACT_MAP_TREE_LEVELS.map(level => makeActMapFixture(seed, level));

export function hypothesesMessages(fixture, results) {
  const level4 = fixture.view.level === 4;
  return [
    { role: 'system', content: ACT_MAP_SYSTEM + 'Du har valt dina experiment och ser resultaten. Avgör inte än. Ställ i stället upp 1–' + MAX_HYPOTHESES +
      ' konkurrerande hypoteser om målsystemet, så olika som möjligt. Varje hypotes har decision ("full"' + (level4 ? ', "partial"' : '') +
      ' eller "none"), mapping (målvariabel för s_0, s_1, s_2) och interventions (målvariabel per ingrepp); för "none" är de null. ' +
      'Labbet prövar sedan hypoteserna mot observationerna i den ordning du anger och stannar vid den första som stämmer med alla; senare hypoteser kan då lämnas oprövade. Du ser resultatet innan du avgör. Svara endast JSON: ' +
      '{"hypotheses":[{"decision":"full","mapping":{"s_0":"...","s_1":"...","s_2":"..."},"interventions":{"<ingrepp>":"<målvariabel>"}}],"reason":"kort svensk motivering"}.' },
    { role: 'user', content: JSON.stringify({ task: publicTask(fixture), results }) },
  ];
}

// The candidate hypotheses, each in the gate's form, or a fixed problem code. Invalid or repeated
// candidates are dropped; at least one valid candidate is required.
export function checkHypotheses(text, fixture) {
  let p;
  try { p = parseJson(text); } catch { return { problem: 'not_json' }; }
  if (Object.keys(p).some(k => !['hypotheses', 'reason'].includes(k))) return { problem: 'extra_fields' };
  if (!Array.isArray(p.hypotheses) || p.hypotheses.length < 1 || p.hypotheses.length > MAX_HYPOTHESES) return { problem: 'invalid_hypotheses' };
  const seen = new Set(), hypotheses = [];
  for (const h of p.hypotheses) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) continue;
    const checked = checkInference(JSON.stringify({ ...h, reason: 'kandidat' }), fixture);
    const key = JSON.stringify(checked.claim ? [checked.claim.decision, checked.claim.proposed] : null);
    if (checked.claim && !seen.has(key)) { seen.add(key); hypotheses.push(checked.claim); }
  }
  if (!hypotheses.length) return { problem: 'invalid_hypotheses' };
  // The same contract as the other steps: a short reason is part of a valid answer.
  if (typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return { problem: 'invalid_reason' };
  return { hypotheses };
}

// How one hypothesis fares against the observations Oraklet has seen: its first contradiction, or
// none. A "none" hypothesis predicts nothing and is never confirmed by the observations alone.
export function consistency(fixture, claim, history) {
  if (!claim.proposed) return { checked: 0, matched: 0, contradiction: null };
  let checked = 0, matched = 0, contradiction = null;
  for (const r of history) {
    for (const [target, expected] of Object.entries(predict(fixture.view, claim.proposed, r.action, r.value))) {
      checked++;
      if (r.outcome[target] === expected) matched++;
      else contradiction ??= { intervention: fixture.view.target_interventions[r.action], value: r.value,
        variable: fixture.view.target_variables[target], expected, observed: r.outcome[target] };
    }
  }
  return { checked, matched, contradiction };
}

const label = claim => claim.decision === 'none' ? 'ingen överföring'
  : `${claim.decision}: ` + ['s_0', 's_1', 's_2'].map((s, i) => `${s}=${claim.proposed.mapping[i]}`).join(', ');

// The bounded search: the root expands into Oraklet's hypotheses, each node is scored by the share
// of predicted observations that match, and the search stops at the first hypothesis that fits
// every observation. Its trace is what Oraklet sees before the final claim.
export async function searchHypotheses(fixture, hypotheses, history) {
  const byId = new Map(hypotheses.map((h, i) => [`h${i + 1}`, h]));
  const search = await agenticTreeSearch({ maxNodes: MAX_HYPOTHESES, maxDepth: 1, maxChildren: MAX_HYPOTHESES,
    expand: async () => [...byId.keys()].map(id => ({ id, label: label(byId.get(id)).slice(0, 120) })),
    evaluate: async node => {
      const result = consistency(fixture, byId.get(node.actionId), history);
      const fits = result.checked > 0 && result.matched === result.checked;
      return { verified: fits, score: fits ? 1 : result.checked ? result.matched / result.checked : 0.5, result };
    } });
  const evaluated = search.trace.map(n => {
    const h = byId.get(n.actionId), c = n.result;
    return { hypothesis: n.actionId, decision: h.decision, ...namedClaim(fixture, h.proposed),
      // A hypothesis with nothing to check (a "none", or a partial one whose interventions all fall
      // on s_2) is untestable here: neither consistent nor contradicted.
      consistent: c.checked === 0 ? null : n.verified, checkedObservations: c.checked, matchedObservations: c.matched,
      ...(c.contradiction ? { firstContradiction: c.contradiction } : {}),
      ...(h.decision === 'none' ? { note: 'gör inga förutsägelser; kan inte bekräftas av observationerna' }
        : c.checked === 0 ? { note: 'kunde inte prövas: dina ingrepp ger inga förutsägelser för den här hypotesen' } : {}) };
  });
  const notEvaluated = [...byId.keys()].filter(id => !search.trace.some(n => n.actionId === id));
  // Every hypothesis Oraklet stated reaches the final step: the untested ones are marked as such.
  const candidates = [...evaluated, ...notEvaluated.map(id => ({ hypothesis: id, decision: byId.get(id).decision,
    ...namedClaim(fixture, byId.get(id).proposed), consistent: null,
    note: 'inte prövad: sökningen stannade vid första hypotesen som stämde med alla observationer' }))];
  return { search, evaluated, notEvaluated, candidates };
}

const TREE_NOTE = Object.freeze({
  system: 'Du har också ställt upp konkurrerande hypoteser, och labbet har prövat dem mot observationerna du har sett (hypotheses). ' +
    'consistent betyder att hypotesen stämmer med alla dessa observationer; firstContradiction visar var den inte stämmer. ' +
    'consistent null betyder att hypotesen inte prövades eller inte gick att pröva med dina ingrepp; det är varken stöd eller motsägelse. ' +
    'Ingen hypotes är prövad mot de dolda ingreppsstorlekarna. Om alla prövade hypoteser med överföring motsägs är det ett tecken på att mekanismen inte gäller. ',
});

export async function runActMapTreeExperiment(seed, propose, callTool, onCommit, options = {}) {
  const fixtures = makeActMapTreeCases(seed), cases = [];
  // Only the final claim states a confidence; the design and the hypotheses are steps toward it.
  const stepPropose = options.designPropose ?? propose;
  await onCommit(fixtures.map((f, i) => ({ case: i + 1, level: f.view.level, sha256: f.commitment, protocol: ACT_MAP_TREE_PROTOCOL })));
  for (const [i, fixture] of fixtures.entries()) {
    let history = [], claim = null, formatProblem = null, tree = null, identity = null, ai = { provider: null, model: null };
    const same = next => {
      if (identity && (next.provider !== identity.provider || next.model !== identity.model)) throw new ResearchError('model_changed', { case: i + 1 });
      identity = { provider: next.provider, model: next.model };
      ai = next;
    };
    const design = await answer(stepPropose, designMessages(fixture));
    if (design.ai) same(design.ai);
    const checkedDesign = design.ai ? checkDesign(design.ai.text, fixture) : design;
    if (checkedDesign.problem) formatProblem = `design:${checkedDesign.problem}`;
    else {
      history = checkedDesign.design.experiments.map(e => ({ ...e, outcome: intervene(fixture, e.action, e.value) }));
      const results = named(fixture, history);
      const proposed = await answer(stepPropose, hypothesesMessages(fixture, results));
      if (proposed.ai) same(proposed.ai);
      const checkedHypotheses = proposed.ai ? checkHypotheses(proposed.ai.text, fixture) : proposed;
      if (checkedHypotheses.problem) formatProblem = `hypotheses:${checkedHypotheses.problem}`;
      else {
        tree = await searchHypotheses(fixture, checkedHypotheses.hypotheses, history);
        tree.hypotheses = checkedHypotheses.hypotheses;
        const final = await answer(propose, inferenceMessages(fixture, results,
          { system: TREE_NOTE.system, payload: { hypotheses: tree.candidates } }));
        if (final.ai) same(final.ai);
        const checked = final.ai ? checkInference(final.ai.text, fixture) : final;
        if (checked.problem) formatProblem = `inference:${checked.problem}`;
        else claim = checked.claim;
      }
    }
    const input = { fixture, proposed: claim?.proposed ?? null, history };
    const evidence = await callTool(input), result = validateActMap(evidence, input);
    const passed = actMapPasses(claim, fixture, result.gate);
    const truth = { scope: fixture.truth.scope, ...namedClaim(fixture, { mapping: fixture.truth.mapping, action_to_target: fixture.truth.action_to_target }) };
    const correctAmong = tree ? tree.hypotheses.some(h => actMapPasses(h, fixture, { accepted: true })) : false;
    const measured = { level: fixture.view.level, truth, gate: result.gate, baseline: result.baseline,
      baselinePassed: result.baseline.scope_correct && (fixture.truth.scope === 'none' || result.baseline.mapping_correct && result.baseline.accepted),
      falseCertification: result.gate.accepted && !passed, experimentsUsed: history.length,
      hypotheses: tree?.hypotheses.length ?? 0, consistentHypothesisFound: Boolean(tree?.search.verifiedNodeId),
      correctHypothesisAmongCandidates: correctAmong };
    cases.push({ case: i + 1, level: fixture.view.level, commitment: fixture.commitment, data: publicTask(fixture),
      proposal: { design: checkedDesign.design ?? null, decision: claim?.decision ?? null, ...namedClaim(fixture, claim?.proposed ?? null), reason: claim?.reason ?? null },
      provider: ai.provider, model: ai.model, experiments: named(fixture, history), evidence,
      // Every candidate the final step saw, tested or not, so the report can rebuild that input.
      tree: tree && { search: tree.search, evaluated: tree.evaluated, notEvaluated: tree.notEvaluated, candidates: tree.candidates },
      hypothesisTest: { protocol: ACT_MAP_TREE_PROTOCOL, decision: passed ? 'correct_transfer_decision' : 'incorrect_transfer_decision', measured,
        independentlyVerified: true, verificationScope: 'python-evidence-gate-and-node-replay', familyInference: null },
      vem: vemRecord(fixture, claim, history, result.gate, formatProblem, ACT_MAP_TREE_PROTOCOL.id, actMapOutcome(ACT_MAP_TREE_PROTOCOL.id, measured, passed)),
      ...(formatProblem ? { formatProblem } : {}),
      initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
    await options.onProgress?.(structuredClone(cases));
  }
  return { schemaVersion: 2, promptVersion: ACT_MAP_TREE_PROTOCOL.id, researcher: 'Professor Oraklet',
    title: 'ACT-MAP med agentisk trädsökning: konkurrerande hypoteser före beslut',
    question: ACT_MAP_TREE_PROTOCOL.hypothesis,
    method: 'Oraklet väljer ingrepp, ställer upp konkurrerande hypoteser som trädsökningen prövar mot de sedda observationerna, och avgör sedan. Evidensgrinden prövar påståendet med dolda ingreppsstorlekar; uppräkningsbaslinjen körs på samma fall.',
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed',
    protocol: ACT_MAP_TREE_PROTOCOL, limitations: ACT_MAP_TREE_PROTOCOL.limitations, cases };
}

const decisionText = { full: 'full', partial: 'partiell', none: 'ingen', no_supported_transfer: 'ingen', unresolved: 'olöst' };
export function actMapTreeSummary(m) {
  return `nivå ${m.level}: facit ${decisionText[m.truth.scope]}; grinden: ${m.gate.status}; ${m.hypotheses} hypoteser, ${m.consistentHypothesisFound ? 'en stämde med observationerna' : 'ingen stämde med observationerna'}; rätt hypotes bland kandidaterna: ${m.correctHypothesisAmongCandidates ? 'ja' : 'nej'}; uppräkningsbaslinjen ${m.baselinePassed ? 'rätt' : 'fel'}`;
}
const inert = v => '`' + String(v ?? '').replace(/`/g, "'").replace(/\s+/g, ' ').trim() + '`';
export function actMapTreeMarkdown(cases) {
  const selected = cases.filter(c => c.hypothesisTest?.protocol?.id === ACT_MAP_TREE_PROTOCOL.id);
  if (!selected.length) return '';
  const ok = selected.filter(c => c.passed).length, base = selected.filter(c => c.hypothesisTest.measured.baselinePassed).length;
  return '\n\n## ACT-MAP med trädsökning: Oraklet mot uppräkningsbaslinjen\n\n'
    + `Oraklet ${ok}/${selected.length} rätt, uppräkningsbaslinjen ${base}/${selected.length}. Felaktigt godkända påståenden: ${selected.filter(c => c.hypothesisTest.measured.falseCertification).length}. `
    + 'Jämför med act-map-transfer på samma seed (samma fixturer, utan trädsökning). '
    + 'Hypoteser: ✓ stämmer med observationerna, ✗ motsägs, – kunde inte prövas eller prövades inte.\n\n'
    + '| Fall | Nivå | Hypoteser (stämmer med observationerna) | Oraklets beslut | Facit | Grinden |\n| --- | --- | --- | --- | --- | --- |\n'
    + selected.map(c => {
      const m = c.hypothesisTest.measured;
      // consistent is null for a hypothesis that predicts nothing or that the search never reached.
      const hyps = c.tree ? (c.tree.candidates ?? c.tree.evaluated).map(h => `${h.hypothesis} ${decisionText[h.decision]}${h.consistent === true ? ' ✓' : h.consistent === false ? ' ✗' : ' –'}`).join(', ') : '–';
      return `| ${c.case} | ${c.level} | ${hyps} | ${c.formatProblem ? 'oläsbart (' + c.formatProblem + ')' : decisionText[c.proposal.decision]} | ${decisionText[m.truth.scope]} | ${m.gate.status} |`;
    }).join('\n')
    + '\n\n' + selected.filter(c => c.proposal.reason).map(c => `Fall ${c.case}, Oraklets motivering: ${inert(c.proposal.reason)}`).join('\n\n');
}
