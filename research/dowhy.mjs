import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import manifest from './dowhy-toolchain.json' with { type: 'json' };
import { fingerprint } from './python-tools.mjs';
import { ResearchError, diagnostic } from './errors.mjs';

export const DOWHY_PROTOCOL = Object.freeze({
  id: 'fixed-backdoor-linear-v1',
  hypothesis: 'Oraklet anger z som justeringsvariabel och uppskattar effekten av do(t=1) jämfört med do(t=0) under det givna diagrammet och den linjära modellen.',
  graph: { nodes: ['z', 't', 'y'], edges: [['z', 't'], ['z', 'y'], ['t', 'y']] },
  rule: 'DoWhy identifierar backdoor-justering för z och skattar effekten med linjär regression. Exakta rationella kovarianser verifierar koefficienter, effekt, residual-MSE och ojusterad association inom 1e-8*(1+|referens|). |effekt|<=1e-9 klassas som nolleffekt. En kontrasterande kontroll måste ge ett annat beslut.',
  assumptions: 'Det givna diagrammet är korrekt, z är observerad och tillräcklig för backdoor-justering, inga ytterligare dolda gemensamma orsaker finns, linjär additiv modell och konstant behandlingseffekt. För syntetiska kontroller är dessa antaganden givna av konstruktionen.',
  limitations: 'Tre balanserade syntetiska metodtester med positiv, negativ eller nolleffekt och planterad confounding. Inga verkliga observationer, p-värden, konfidensintervall eller vetenskapliga nyhetsanspråk. Diagrammet lärs inte från data; antaganden om verkligheten valideras inte. Ingen generell kausal upptäckt eller fri modellgenererad kod.',
});
const invalid = () => { throw new ResearchError('invalid_tool_evidence'); };
export function validateDowhyInput(input) {
  if (!input || Object.keys(input).join(',') !== 'rows' || !Array.isArray(input.rows)
      || input.rows.length < 25 || input.rows.length > 125) invalid();
  for (const row of input.rows) {
    if (!Array.isArray(row) || row.length !== 3 || !row.every(Number.isSafeInteger)
        || Math.abs(row[0]) > 16 || Math.abs(row[1]) > 32 || Math.abs(row[2]) > 10000) invalid();
  }
}
function gcd(a, b) { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; }
function q(n, d = 1n) {
  if (!d) invalid(); if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d); return [n/g, d/g];
}
const add = (a, b) => q(a[0]*b[1] + b[0]*a[1], a[1]*b[1]);
const mul = (a, b) => q(a[0]*b[0], a[1]*b[1]);
const sub = (a, b) => add(a, [-b[0], b[1]]);
const num = a => Number(a[0])/Number(a[1]);
const near = (actual, expected) => typeof actual === 'number' && Number.isFinite(actual)
  && Math.abs(actual-expected) <= 1e-8*(1+Math.abs(expected));

export function dowhyOracle(input) {
  validateDowhyInput(input);
  const rows = input.rows.map(row => row.map(BigInt)), n = BigInt(rows.length);
  const sum = i => rows.reduce((s, row) => s+row[i], 0n);
  const sums = [0, 1, 2].map(sum);
  // n-scaled centered products, all exact integer arithmetic.
  const cov = (i, j) => n*rows.reduce((s, row) => s+row[i]*row[j], 0n)-sums[i]*sums[j];
  const zz = cov(0, 0), tt = cov(1, 1), zt = cov(0, 1), zy = cov(0, 2), ty = cov(1, 2);
  const determinant = tt*zz-zt*zt;
  if (tt <= 0n || zz <= 0n || determinant <= 0n) invalid();
  const effect = q(ty*zz-zy*zt, determinant), confounder = q(zy*tt-ty*zt, determinant);
  const intercept = mul(sub(sub(q(sums[2]), mul(effect, q(sums[1]))), mul(confounder, q(sums[0]))), q(1n, n));
  const mse = mul(rows.reduce((s, [z, t, y]) => {
    const residual = sub(q(y), add(intercept, add(mul(effect, q(t)), mul(confounder, q(z)))));
    return add(s, mul(residual, residual));
  }, q(0n)), q(1n, n));
  const decision = effect[0]*1000000000n > effect[1] ? 'positive'
    : effect[0]*1000000000n < -effect[1] ? 'negative' : 'null_effect';
  return { adjustmentVariables: ['z'], coefficients: [intercept, effect, confounder].map(num),
    effect: num(effect), naiveEffect: num(q(ty, tt)), residualMse: num(mse), decision, rowCount: rows.length };
}
export function validateDowhy(evidence, input) {
  const expected = dowhyOracle(input), actual = evidence?.result;
  if (evidence?.tool !== 'dowhy' || evidence.adapterVersion !== manifest.adapterVersion
      || evidence.runtime !== 'github-actions-python-isolated' || evidence.inputSha256 !== fingerprint(input)
      || fingerprint(evidence.versions) !== fingerprint(manifest.packages) || !actual
      || Object.keys(actual).sort().join(',') !== Object.keys(expected).sort().join(',')
      || fingerprint(actual.adjustmentVariables) !== fingerprint(expected.adjustmentVariables)
      || actual.decision !== expected.decision || actual.rowCount !== expected.rowCount
      || !Array.isArray(actual.coefficients) || actual.coefficients.length !== 3
      || !actual.coefficients.every((v, i) => near(v, expected.coefficients[i]))
      || !near(actual.effect, expected.effect) || !near(actual.naiveEffect, expected.naiveEffect)
      || !near(actual.residualMse, expected.residualMse) || actual.residualMse < 0) invalid();
  return actual;
}
export function callDowhy(input) {
  dowhyOracle(input); const raw = JSON.stringify(input);
  if (Buffer.byteLength(raw) > 8192) invalid();
  // DoWhy's SciPy pins must never replace the main research interpreter.
  const python = process.env.DOWHY_PYTHON || fileURLToPath(new URL('../.dowhy-venv/bin/python', import.meta.url));
  return new Promise((resolvePromise, reject) => {
    const child = execFile(resolve(python), ['-I', fileURLToPath(new URL('../scripts/dowhy_bridge.py', import.meta.url))],
      { timeout: 30000, maxBuffer: 16384, env: { PATH: process.env.PATH, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', MPLBACKEND: 'Agg' } },
      (error, stdout) => {
        if (error) return reject(new ResearchError('tool_transport_error'));
        try { const evidence = JSON.parse(stdout); validateDowhy(evidence, input); resolvePromise(evidence); }
        catch { reject(new ResearchError('invalid_tool_evidence')); }
      });
    child.stdin.on('error', () => {}); child.stdin.end(raw);
  });
}
function dataset(effect, confounder, intercept) {
  const rows = [];
  for (const z of [-2, -1, 0, 1, 2]) for (const u of [-2, -1, 0, 1, 2]) for (const v of [-1, 0, 1]) {
    const t = z+u; rows.push([z, t, intercept+effect*t+confounder*z+v]);
  }
  return { rows };
}
export function makeDowhyCases(seed) {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  return [0, 1, 2].map(i => {
    const hash = fingerprint({ seed, i, protocol: DOWHY_PROTOCOL.id });
    const magnitude = 1+parseInt(hash.slice(0, 4), 16)%4;
    const effect = i === 0 ? magnitude : i === 1 ? -magnitude : 0;
    const confounder = i === 1 ? 2*(magnitude+1) : 2+2*(parseInt(hash.slice(4, 8), 16)%3);
    const intercept = parseInt(hash.slice(8, 12), 16)%15-7;
    const controlEffect = effect === 0 ? magnitude : 0;
    const input = dataset(effect, confounder, intercept), control = dataset(controlEffect, confounder, intercept);
    const truth = { synthetic: true, effect, controlEffect, confounder, intercept };
    return { id: i+1, input, control, truth,
      commitment: fingerprint({ input, control, truth, protocol: DOWHY_PROTOCOL }) };
  });
}
export function parseDowhyProposal(text) {
  try {
    const p = JSON.parse(text);
    if (!p || Object.keys(p).sort().join(',') !== 'adjustment,effect,method,reason' || p.method !== 'dowhy'
        || !Array.isArray(p.adjustment) || !(p.adjustment.length === 0 || (p.adjustment.length === 1 && p.adjustment[0] === 'z'))
        || typeof p.effect !== 'number' || !Number.isFinite(p.effect) || Math.abs(p.effect) > 100
        || typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return null;
    return { ...p, reason: p.reason.trim() };
  } catch { return null; }
}
export async function runDowhyExperiment(seed, propose, callTool, onCommit, options = {}) {
  const fixtures = makeDowhyCases(seed), cases = [];
  await onCommit(fixtures.map(f => ({ case: f.id, sha256: f.commitment, protocol: DOWHY_PROTOCOL })));
  for (const f of fixtures) {
    let operation = 'initial_proposal';
    try {
      const ai = await propose([{ role: 'system', content: 'Du är Professor Oraklet. Använd det givna orsaksdiagrammet och antagandena för att föreslå justeringsvariabler och effekten av do(t=1) minus do(t=0). Data har kolumnerna z,t,y. Verktygsresultat och syntetiskt facit har inte visats. Svara endast JSON med exakt method:"dowhy", adjustment:[] eller ["z"], effect:ett tal, reason:kort svensk motivering. Ingen kod. Påstå inte att diagrammet är bevisat av data.' },
        { role: 'user', content: JSON.stringify({ protocol: DOWHY_PROTOCOL, columns: ['z', 't', 'y'], rows: f.input.rows }) }]);
      const proposal = parseDowhyProposal(ai.text);
      if (!proposal) throw new ResearchError('invalid_model_proposal');
      operation = 'positive_control';
      const evidence = await callTool(f.input), measured = validateDowhy(evidence, f.input);
      operation = 'negative_control';
      const controlEvidence = await callTool(f.control), control = validateDowhy(controlEvidence, f.control);
      if (!near(measured.effect, f.truth.effect) || !near(control.effect, f.truth.controlEffect)
          || measured.decision === control.decision || near(measured.naiveEffect, measured.effect)) invalid();
      const passed = fingerprint(proposal.adjustment) === fingerprint(measured.adjustmentVariables)
        && near(proposal.effect, measured.effect);
      cases.push({ case: f.id, commitment: f.commitment, data: f.input, controlData: f.control, truth: f.truth,
        proposal, provider: ai.provider, model: ai.model, evidence, controlEvidence,
        hypothesisTest: { protocol: DOWHY_PROTOCOL, decision: measured.decision, measured,
          independentlyVerified: true, familyInference: null },
        initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
      await options.onProgress?.(structuredClone(cases));
    } catch (error) { const info = diagnostic(error, { case: f.id, operation }); throw new ResearchError(info.code, info); }
  }
  return { schemaVersion: 2, promptVersion: 'dowhy-backdoor-v1', researcher: 'Professor Oraklet',
    title: 'Kan Oraklet skilja kausal effekt från confounding?', question: DOWHY_PROTOCOL.hypothesis,
    method: 'Tre seedade balanserade syntetiska fall med positiv, negativ och nolleffekt under ett fast diagram. Oraklets förslag låses före DoWhy. Backdoor-justerad linjär regression, exakt rationell verifiering och kontrasterande kontroller. passed/failed gäller modellförslaget.',
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed', protocol: DOWHY_PROTOCOL,
    limitations: DOWHY_PROTOCOL.limitations, cases };
}
