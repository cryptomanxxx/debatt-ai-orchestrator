import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import manifest from './sklearn-toolchain.json' with { type: 'json' };
import { fingerprint } from './python-tools.mjs';
import { ResearchError, diagnostic } from './errors.mjs';

export const SKLEARN_PROTOCOL = Object.freeze({
  id: 'polynomial-validation-v1',
  hypothesis: 'Oraklets förslag till grad 1 eller 2 stämmer med det förutbestämda modellvalet på separat valideringsdata.',
  rule: 'Fit endast på träning. Välj grad 2 endast om dess validerings-MSE är mer än 1e-9 lägre; annars grad 1. Separat test-MSE rapporteras utan nytt modellval eller omträning. Exakt rationell OLS i JavaScript verifierar Scikit-learn inom 1e-8*(1+|referens|). En kontrasterande kontroll måste välja den andra graden.',
  limitations: 'Tre syntetiska metodtester: linjärt, kvadratiskt och linjärt med en träningsoutlier. Fasta små dataset och extrapolationspunkter; ingen slutsats om verkliga data, statistisk signifikans eller generell prognosförmåga. Modellen ser bara träningen och kan inte säkert veta bäst grad på osedda punkter. Testdelen används inte för modellval. Ingen fri modellgenererad kod.',
});
const invalid = () => { throw new ResearchError('invalid_tool_evidence'); };

export function validateSklearnInput(input) {
  if (!input || Object.keys(input).sort().join(',') !== 'test,train,validation') invalid();
  const seen = new Set();
  for (const key of ['train', 'validation', 'test']) {
    const rows = input[key];
    if (!Array.isArray(rows) || rows.length < (key === 'train' ? 6 : 2)
        || rows.length > (key === 'train' ? 32 : 16)) invalid();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2 || !row.every(Number.isSafeInteger)
          || Math.abs(row[0]) > 16 || Math.abs(row[1]) > 10000 || seen.has(row[0])) invalid();
      seen.add(row[0]);
    }
  }
}

// Independent OLS: normal equations solved in exact rational BigInt arithmetic.
function gcd(a, b) { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; }
function rational(n, d = 1n) {
  if (!d) invalid();
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d); return [n / g, d / g];
}
const add = (a, b) => rational(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => rational(a[0] * b[0], a[1] * b[1]);
const sub = (a, b) => add(a, [-b[0], b[1]]);
const div = (a, b) => rational(a[0] * b[1], a[1] * b[0]);
const number = a => Number(a[0]) / Number(a[1]);
function fit(rows, degree) {
  const size = degree + 1;
  const matrix = Array.from({ length: size }, (_, i) => Array.from({ length: size + 1 }, (_, j) =>
    rational(rows.reduce((sum, [x, y]) => sum + (j === size
      ? BigInt(x) ** BigInt(i) * BigInt(y) : BigInt(x) ** BigInt(i + j)), 0n))));
  for (let col = 0; col < size; col++) {
    const pivot = matrix.findIndex((row, index) => index >= col && row[col][0] !== 0n);
    if (pivot < 0) invalid();
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const value = matrix[col][col];
    matrix[col] = matrix[col].map(v => div(v, value));
    for (let row = 0; row < size; row++) if (row !== col) {
      const factor = matrix[row][col];
      matrix[row] = matrix[row].map((v, j) => sub(v, mul(factor, matrix[col][j])));
    }
  }
  return matrix.map(row => row[size]);
}
function evaluate(coefficients, rows) {
  const predictions = rows.map(([x]) => coefficients.reduce((sum, c, i) =>
    add(sum, mul(c, rational(BigInt(x) ** BigInt(i)))), rational(0n)));
  const mse = div(predictions.reduce((sum, p, i) => {
    const residual = sub(p, rational(BigInt(rows[i][1]))); return add(sum, mul(residual, residual));
  }, rational(0n)), rational(BigInt(rows.length)));
  return { predictions: predictions.map(number), mse: number(mse), exactMse: mse };
}
export function sklearnOracle(input) {
  validateSklearnInput(input);
  const fits = [1, 2].map(degree => {
    const coefficients = fit(input.train, degree);
    const validation = evaluate(coefficients, input.validation), test = evaluate(coefficients, input.test);
    return { degree, coefficients: coefficients.map(number), validationPredictions: validation.predictions,
      testPredictions: test.predictions, validationMse: validation.mse, testMse: test.mse,
      exactValidationMse: validation.exactMse };
  });
  const difference = sub(fits[0].exactValidationMse, fits[1].exactValidationMse);
  // Strict > 1e-9; ties and smaller improvements prefer the simpler model.
  const selectedDegree = difference[0] * 1000000000n > difference[1] ? 2 : 1;
  const models = fits.map(({ exactValidationMse, ...model }) => model);
  return { models, selectedDegree, selectedTestMse: models[selectedDegree - 1].testMse,
    decision: selectedDegree === 1 ? 'prefer_linear' : 'prefer_quadratic' };
}

function compare(actual, expected) {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !Number.isFinite(actual)
        || Math.abs(actual - expected) > 1e-8 * (1 + Math.abs(expected))) invalid();
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) invalid();
    expected.forEach((v, i) => compare(actual[i], v));
  } else if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)
        || Object.keys(actual).sort().join(',') !== Object.keys(expected).sort().join(',')) invalid();
    for (const key of Object.keys(expected)) compare(actual[key], expected[key]);
  } else if (actual !== expected) invalid();
}
export function validateSklearn(evidence, input) {
  const expected = sklearnOracle(input);
  if (evidence?.tool !== 'scikit-learn' || evidence.adapterVersion !== manifest.adapterVersion
      || evidence.runtime !== 'github-actions-python' || evidence.inputSha256 !== fingerprint(input)
      || fingerprint(evidence.versions) !== fingerprint(manifest.packages)
      || evidence.result?.selectedDegree !== expected.selectedDegree) invalid();
  compare(evidence.result, expected);
  if (evidence.result.selectedTestMse < 0 || evidence.result.models.some((model, i) =>
    model.degree !== i + 1 || model.validationMse < 0 || model.testMse < 0)) invalid();
  return evidence.result;
}
export function callSklearn(input) {
  validateSklearnInput(input);
  const raw = JSON.stringify(input);
  if (Buffer.byteLength(raw) > 8192) invalid();
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.RESEARCH_PYTHON || 'python3',
      ['-I', fileURLToPath(new URL('../scripts/sklearn_bridge.py', import.meta.url))],
      { timeout: 20000, maxBuffer: 16384, env: { PATH: process.env.PATH, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' } },
      (error, stdout) => {
        if (error) return reject(new ResearchError('tool_transport_error'));
        try { const evidence = JSON.parse(stdout); validateSklearn(evidence, input); resolve(evidence); }
        catch { reject(new ResearchError('invalid_tool_evidence')); }
      });
    child.stdin.on('error', () => {}); child.stdin.end(raw);
  });
}
function dataset(fn, outlier = 0) {
  return { train: Array.from({ length: 9 }, (_, i) => { const x = i - 4; return [x, fn(x) + (x === 0 ? outlier : 0)]; }),
    validation: [-5, 5].map(x => [x, fn(x)]), test: [-6, 6].map(x => [x, fn(x)]) };
}
export function makeSklearnCases(seed) {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  return [0, 1, 2].map(i => {
    const hash = fingerprint({ seed, i, protocol: SKLEARN_PROTOCOL.id });
    const intercept = parseInt(hash.slice(0, 4), 16) % 15 - 7;
    const slope = 1 + parseInt(hash.slice(4, 8), 16) % 4;
    const curve = 1 + parseInt(hash.slice(8, 12), 16) % 3;
    const fn = x => intercept + slope * x + (i === 1 ? curve * x * x : 0);
    const input = dataset(fn, i === 2 ? 5 + parseInt(hash.slice(12, 16), 16) % 8 : 0);
    const control = dataset(x => intercept + slope * x + (i === 1 ? 0 : curve * x * x));
    const truth = { synthetic: true, scenario: ['linear', 'quadratic', 'linear_training_outlier'][i],
      selectedDegree: i === 1 ? 2 : 1, controlDegree: i === 1 ? 1 : 2 };
    return { id: i + 1, input, control, truth,
      commitment: fingerprint({ input, control, truth, protocol: SKLEARN_PROTOCOL }) };
  });
}
export function parseSklearnProposal(text) {
  try {
    const p = JSON.parse(text);
    if (!p || Object.keys(p).sort().join(',') !== 'degree,method,reason' || p.method !== 'scikit-learn'
        || ![1, 2].includes(p.degree) || typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return null;
    return { ...p, reason: p.reason.trim() };
  } catch { return null; }
}
export async function runSklearnExperiment(seed, propose, callTool, onCommit, options = {}) {
  const fixtures = makeSklearnCases(seed), cases = [];
  await onCommit(fixtures.map(f => ({ case: f.id, sha256: f.commitment, protocol: SKLEARN_PROTOCOL })));
  for (const f of fixtures) {
    let operation = 'initial_proposal';
    try {
      const ai = await propose([{ role: 'system', content: 'Du är Professor Oraklet. Föreslå grad 1 (linjär) eller 2 (kvadratisk) för dessa träningspunkter. Endast träningen visas; du har inte sett validerings-/testdata eller verktygsresultat. Motivera valet utan att påstå säker kunskap om osedda data. Svara endast JSON med exakt method:"scikit-learn", degree:1 eller 2, reason:kort svensk motivering. Ingen kod.' },
        { role: 'user', content: JSON.stringify({ protocol: SKLEARN_PROTOCOL, train: f.input.train }) }]);
      const proposal = parseSklearnProposal(ai.text);
      if (!proposal) throw new ResearchError('invalid_model_proposal');
      operation = 'positive_control';
      const evidence = await callTool(f.input), measured = validateSklearn(evidence, f.input);
      operation = 'negative_control';
      const controlEvidence = await callTool(f.control), control = validateSklearn(controlEvidence, f.control);
      if (measured.selectedDegree !== f.truth.selectedDegree || control.selectedDegree !== f.truth.controlDegree
          || measured.selectedDegree === control.selectedDegree) invalid();
      const passed = proposal.degree === measured.selectedDegree;
      cases.push({ case: f.id, commitment: f.commitment, data: f.input, controlData: f.control, truth: f.truth,
        proposal, provider: ai.provider, model: ai.model, evidence, controlEvidence,
        hypothesisTest: { protocol: SKLEARN_PROTOCOL, decision: measured.decision, measured,
          independentlyVerified: true, familyInference: null },
        initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
      await options.onProgress?.(structuredClone(cases));
    } catch (error) { const info = diagnostic(error, { case: f.id, operation }); throw new ResearchError(info.code, info); }
  }
  return { schemaVersion: 2, promptVersion: 'sklearn-polynomial-v1', researcher: 'Professor Oraklet',
    title: 'Linjär eller kvadratisk modell med Scikit-learn?', question: SKLEARN_PROTOCOL.hypothesis,
    method: 'Tre seedade syntetiska fall. Oraklets första gradförslag låses; Scikit-learn tränar båda fasta modeller endast på träningen, väljer på validering och rapporterar separat test-MSE. Exakt rationell OLS och kontrasterande kontroller verifierar resultaten. passed/failed gäller förslagets träffsäkerhet.',
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed', protocol: SKLEARN_PROTOCOL,
    limitations: SKLEARN_PROTOCOL.limitations, cases };
}
