import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACT_MAP_DESIGN_PROTOCOL, checkSpec, specProblem, specEquations, analyzeSpec, makeDesignFixture, interveneDesign,
  predictDesign, gateDesign, callActMapDesign, validateAnalysis, validateDesignGate, runActMapDesignExperiment,
  actMapDesignMarkdown, specMessages } from '../research/act-map-design.mjs';
import { failureOf } from '../research/vem-sci.mjs';
import { CATALOG } from '../research/catalog.mjs';

const edge = (from, to, coef) => ({ from: `s_${from}`, to: `s_${to}`, coef });
const chain = { variables: 3, edges: [edge(1, 2, -3), edge(0, 1, 2)] };
const diamond = { variables: 4, edges: [edge(0, 1, 2), edge(0, 2, -1), edge(1, 3, 3), edge(2, 3, 1)] };
const symmetric = { variables: 3, edges: [edge(0, 1, 2), edge(0, 2, 2)] };
const specText = (s, prediction) => JSON.stringify({ ...s, prediction, reason: 'Egen design.' });
const labSpec = s => checkSpec(specText(s, { identifiable: false, minInterventions: null })).spec;

test('a spec is declarative, bounded and new; the prediction is part of it', () => {
  const ok = checkSpec(specText(chain, { identifiable: true, minInterventions: 2 }));
  assert.deepEqual(ok.spec, { variables: 3, edges: [[0, 1, 2], [1, 2, -3]] }, 'edges in the lab form, sorted');
  assert.deepEqual(ok.prediction, { identifiable: true, minInterventions: 2 });
  assert.deepEqual(specEquations(ok.spec), ['s_1 = 2*s_0', 's_2 = -3*s_1']);
  const problem = (s, p = { identifiable: true, minInterventions: 2 }) => checkSpec(specText(s, p)).problem;
  assert.equal(problem({ variables: 3, edges: [edge(0, 1, 2), edge(2, 1, 1)] }), 'invalid_spec', 'edges run from lower to higher index');
  assert.equal(problem({ variables: 3, edges: [edge(0, 1, 0), edge(1, 2, 1)] }), 'invalid_spec', 'no zero coefficient');
  assert.equal(problem({ variables: 3, edges: [edge(0, 1, 5), edge(1, 2, 1)] }), 'invalid_spec', 'bounded coefficients');
  assert.equal(problem({ variables: 4, edges: [edge(0, 1, 2), edge(1, 2, 1)] }), 'invalid_spec', 's_0 is the only root');
  assert.equal(problem({ variables: 5, edges: [edge(0, 1, 2), edge(1, 2, 1)] }), 'invalid_spec');
  assert.equal(problem({ variables: 3, edges: [edge(0, 1, 2), edge(0, 1, 3)] }), 'invalid_spec', 'no repeated edge');
  assert.equal(problem({ variables: 3, edges: [edge(0, 1, 2), edge(1, 2, -3), edge(0, 2, 1)] }), 'standard_mechanism');
  assert.equal(problem(chain, { identifiable: true, minInterventions: null }), 'invalid_prediction');
  assert.equal(problem(chain, { identifiable: false, minInterventions: 2 }), 'invalid_prediction');
  assert.equal(problem(chain, { identifiable: true, minInterventions: 4 }), 'invalid_prediction');
  assert.equal(checkSpec('nej').problem, 'not_json');
  assert.equal(checkSpec(JSON.stringify({ ...chain, prediction: { identifiable: true, minInterventions: 2 }, reason: 'r', code: 'x' })).problem, 'extra_fields');
  assert.equal(specProblem({ variables: 3, edges: [[0, 1, 2]] }), 'invalid_spec', 'at least two edges');
  assert.match(specMessages()[0].content, /deklarativ specifikation, ingen kod/);
});

test('identifiability is computed the same way in Python and Node, including a symmetric design', async () => {
  for (const [s, expected] of [[chain, [true, 2, 1]], [diamond, [true, 3, 1]], [symmetric, [false, null, 2]]]) {
    const spec = labSpec(s), input = { op: 'analyze', spec };
    const node = analyzeSpec(spec);
    assert.deepEqual([node.identifiable, node.minInterventions, node.consistentAfterAll], expected, JSON.stringify(s));
    assert.deepEqual(validateAnalysis(await callActMapDesign(input), input), node);
  }
  await assert.rejects(callActMapDesign({ op: 'analyze', spec: { variables: 3, edges: [[0, 1, 2], [0, 2, 1], [1, 2, 3]] } }), /tool_transport_error/,
    'the Python verifier refuses the fixed ACT-MAP mechanism too');
});

test('the hidden targets are committed; a "none" target fits no correspondence; both gates agree', async () => {
  const spec = labSpec(diamond);
  assert.deepEqual(makeDesignFixture('7', spec, 0), makeDesignFixture('7', spec, 0), 'deterministic');
  assert.equal(makeDesignFixture('7', spec, 0).truth.scope, 'full');
  const seeds = Array.from({ length: 40 }, (_, i) => String(i));
  const none = makeDesignFixture(seeds.find(s => makeDesignFixture(s, spec, 1).truth.scope === 'none'), spec, 1);
  const all = [0, 1, 2, 3].map(a => ({ action: a, value: 1, outcome: interveneDesign(none, a, 1) }));
  const truthClaim = { scope: 'full', mapping: none.truth.mapping, action_to_target: none.truth.action_to_target };
  assert.ok(all.some(r => String(r.outcome) !== String(predictDesign(spec, truthClaim, r.action, r.value))), 'changed coefficients show');
  for (const [fixture, proposed] of [[makeDesignFixture('7', spec, 0), null], [none, truthClaim]]) {
    const history = [0, 1, 2, 3].map(a => ({ action: a, value: 1, outcome: interveneDesign(fixture, a, 1) }));
    const right = { scope: 'full', mapping: fixture.truth.mapping, action_to_target: fixture.truth.action_to_target };
    for (const claim of [proposed, right]) {
      const input = { op: 'gate', fixture, proposed: claim, history };
      const result = validateDesignGate(await callActMapDesign(input), input);
      assert.equal(result.gate.status, gateDesign(fixture, claim, history).status);
    }
    const input = { op: 'gate', fixture, proposed: right, history };
    const result = validateDesignGate(await callActMapDesign(input), input);
    assert.equal(result.gate.accepted, fixture.truth.scope === 'full');
    assert.equal(result.baseline.decision, fixture.truth.scope, 'the enumeration baseline decides each target');
  }
  const tampered = { ...makeDesignFixture('7', spec, 0) };
  tampered.truth = { ...tampered.truth, target_coefficients: [9, 9, 9, 9] };
  await assert.rejects(callActMapDesign({ op: 'gate', fixture: tampered, proposed: null, history: [] }), /tool_transport_error/);
});

// A scripted Oraklet: a spec, then for each target all interventions with value 1 and the true claim.
function scripted(spec, prediction) {
  const calls = [];
  const propose = async messages => {
    const content = JSON.parse(messages[1].content), task = content.task ?? content;
    const kind = task.allowedCoefficients ? 'spec' : content.results ? 'claim' : 'design';
    calls.push(kind);
    let answer;
    if (kind === 'spec') answer = JSON.parse(specText(spec, prediction));
    else if (kind === 'design') answer = { experiments: task.targetInterventions.map(i => ({ intervention: i, value: 1 })), reason: 'Alla.' };
    else {
      // The test plays an investigator who has worked out the hidden correspondence.
      const roles = task.source.equations.length + 1;
      answer = { decision: 'none', mapping: null, interventions: null, reason: 'Stämmer inte.' };
      const fixture = globalThis.__designFixtures.find(f => f.view.target_variables[0] === task.targetVariables[0]);
      if (fixture.truth.scope === 'full') answer = { decision: 'full',
        mapping: Object.fromEntries(Array.from({ length: roles }, (_, k) => [`s_${k}`, task.targetVariables[fixture.truth.mapping[k]]])),
        interventions: Object.fromEntries(task.targetInterventions.map((a, i) => [a, task.targetVariables[fixture.truth.action_to_target[i]]])), reason: 'Stämmer.' };
    }
    return { provider: 'test', model: 'same', text: JSON.stringify(answer) };
  };
  return { propose, calls };
}
async function run(spec, prediction, seed = '7') {
  const s = labSpec(spec);
  globalThis.__designFixtures = [0, 1].map(i => makeDesignFixture(seed, s, i));
  const { propose, calls } = scripted(spec, prediction);
  const commits = [];
  const report = await runActMapDesignExperiment(seed, propose, callActMapDesign, async c => { commits.push(c); });
  return { report, calls, commits };
}

test('Oraklet designs, preregisters, and finds his mechanism in two hidden targets', async () => {
  const { report, calls, commits } = await run(diamond, { identifiable: true, minInterventions: 3 });
  assert.deepEqual(calls, ['spec', 'design', 'claim', 'design', 'claim'], 'five model calls');
  assert.equal(report.protocol.id, ACT_MAP_DESIGN_PROTOCOL.id);
  assert.equal(report.status, 'passed');
  const [design, ...investigations] = report.cases;
  assert.equal(design.vem.kind, 'design');
  assert.equal(design.vem.status, 'provisionally_supported');
  assert.equal(commits[0].preregistration.sha256, design.preregistration.sha256);
  assert.deepEqual(commits[0].fixtures.map(f => f.sha256), investigations.map(c => c.commitment), 'targets committed before the investigation');
  assert.equal(investigations.length, 2);
  assert.ok(investigations.every(c => c.passed && c.vem.outcome.protocol === 'act-map-design-v1' && c.vem.outcome.level === 3));
  assert.ok(investigations.every(c => !JSON.stringify(c.data).match(/target_coefficients|"scope"|mapping/)), 'no truth in what Oraklet sees');
  const md = actMapDesignMarkdown(report.cases);
  assert.match(md, /## ACT-MAP: Oraklets egen mekanism/);
  assert.match(md, /Förutsägelsen stämde\./);
  assert.match(md, /\| 2 \| .* \| full \| full \| provisionally_supported \|/);
  assert.ok(CATALOG.some(e => e.id === 'act-map-design' && e.method === 'design' && e.automatic !== false));
});

test('a wrong prediction is rejected with its cause; a non-identifiable design is not hidden; a bad spec makes no claim', async () => {
  const wrong = (await run(chain, { identifiable: true, minInterventions: 3 })).report;
  assert.equal(wrong.cases[0].vem.status, 'rejected');
  assert.equal(failureOf(wrong.cases[0].vem), 'min_interventions_mispredicted');
  assert.equal(wrong.status, 'failed');
  const sym = await run(symmetric, { identifiable: true, minInterventions: 2 });
  assert.deepEqual(sym.calls, ['spec'], 'no investigation of a design that cannot be identified');
  assert.equal(sym.report.cases.length, 1);
  assert.equal(failureOf(sym.report.cases[0].vem), 'identifiability_mispredicted');
  assert.match(actMapDesignMarkdown(sym.report.cases), /inte identifierbar; 2 kopplingar stämmer/);
  const honest = await run(symmetric, { identifiable: false, minInterventions: null });
  assert.equal(honest.report.cases[0].vem.status, 'provisionally_supported', 'a correct "not identifiable" prediction holds');
  let toolCalls = 0;
  const standard = await runActMapDesignExperiment('7', async () => ({ provider: 'test', model: 'same',
    text: specText({ variables: 3, edges: [edge(0, 1, 2), edge(1, 2, -3), edge(0, 2, 1)] }, { identifiable: true, minInterventions: 2 }) }),
  async () => { toolCalls++; }, async () => {});
  assert.equal(toolCalls, 0);
  assert.equal(standard.cases[0].formatProblem, 'spec:standard_mechanism');
  assert.equal(standard.cases[0].vem.kind, 'no_answer');
  assert.equal(failureOf(standard.cases[0].vem), 'standard_mechanism');
});

test('the lab runner runs the design experiment end to end', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'act-map-design-runner-'));
  try {
    const preload = join(dir, 'mock.mjs');
    await writeFile(preload, `
import {writeFile} from 'node:fs/promises';
globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(u.includes('supabase.co')){
  if(options.method==='POST'){await writeFile('saved.json',options.body);return new Response('',{status:201});}
  return Response.json([]);
 }
 const messages=JSON.parse(JSON.parse(options.body).message).messages, content=JSON.parse(messages[1].content), task=content.task??content;
 const answer=task.allowedCoefficients?${JSON.stringify({ ...diamond, prediction: { identifiable: true, minInterventions: 3 }, reason: 'Test.' })}
  :content.results?{decision:'none',mapping:null,interventions:null,reason:'Test.'}
  :{experiments:task.targetInterventions.map(i=>({intervention:i,value:1})),reason:'Test.'};
 return Response.json({mock:false,provider:'test',model:'same',inference:{completionTokenLimit:4096},answer:JSON.stringify(answer)});
};`);
    const env = { ...process.env, EXPERIMENT: 'act-map-design', EXPERIMENT_SEED: '7', ORCHESTRATOR_API_KEY: 'test'.repeat(8), SUPABASE_SERVICE_ROLE_KEY: 'test' };
    await promisify(execFile)(process.execPath, ['--import', pathToFileURL(preload).href, fileURLToPath(new URL('../research/runner.mjs', import.meta.url))],
      { cwd: dir, env, timeout: 60000 });
    const saved = JSON.parse(await readFile(join(dir, 'saved.json'), 'utf8')).rapport;
    assert.equal(saved.experimentId, 'act-map-design');
    assert.equal(saved.modelCalls, 5);
    assert.equal(saved.toolCalls, 3, 'one analysis and two gates');
    assert.equal(saved.cases.length, 3);
    assert.equal(saved.vem.claims[0].kind, 'design');
    const commitments = JSON.parse(await readFile(join(dir, 'reports/oraklet-lab/commitments.json'), 'utf8'));
    assert.equal(commitments.fixtures.length, 2);
    assert.match(await readFile(join(dir, 'reports/oraklet-lab/report.md'), 'utf8'), /## ACT-MAP: Oraklets egen mekanism/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
