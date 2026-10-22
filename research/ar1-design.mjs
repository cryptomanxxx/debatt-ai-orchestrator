// Oraklet-designed AR(1) experiment: Oraklet chooses effect sizes and sample sizes within fixed
// bounds and preregisters its predictions and falsification criterion before any data exist.
// Data generation, the Statsmodels test and every check are fixed code; the model writes no code.
import { createHash } from 'node:crypto';
import { fingerprint } from './python-tools.mjs';
import { validateScienceResult } from './science.mjs';
import { ResearchError, diagnostic } from './errors.mjs';

export const DESIGN_SPACE = Object.freeze({
  phi: Object.freeze([0, 0.1, 0.2, 0.3, 0.4, 0.6]),
  n: Object.freeze([64, 96, 128]),
  points: 3,
  falsification: Object.freeze(['any_mismatch', 'two_or_more_mismatches']),
});
export const DESIGN_PROTOCOL = Object.freeze({
  id: 'ar1-design-v1',
  h0: 'phi=0 i y[t]=0.2+phi*y[t-1]+epsilon[t], epsilon~N(0,1).',
  rule: 'Oraklet väljer tre olika designpunkter (phi, n) ur det fasta designrummet, varav minst en nollkontroll med phi=0, förutsäger för varje punkt det tvåsidiga testets beslut vid alpha=0.05 och väljer i förväg ett falsifieringskriterium. Designen och förregistreringen låses och hashas innan data genereras. Varje serie genereras deterministiskt från seed och designpunkt med 64 inbränningssteg och 16 holdoutobservationer.',
  assumptions: 'AR(1) med iid normala innovationer; nominal villkorlig OLS/t-inferens via Statsmodels AutoReg, oberoende kontrollerad med en separat OLS-beräkning i flyttal och Student-t.',
  limitations: 'En realisering per designpunkt: utfallet för en enskild punkt är slumpmässigt och styrkan (power) bestäms inte av en körning. Förregistreringen prövar Oraklets förväntningar om testets beteende, inte en ny vetenskaplig hypotes. Syntetiska data; ingen slutsats om verkliga tidsserier.',
});
const invalid = () => { throw new ResearchError('invalid_model_proposal'); };

// Strict design and preregistration contract; anything outside the design space is rejected.
export function parseDesign(text) {
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!d || typeof d !== 'object' || Array.isArray(d)
      || Object.keys(d).sort().join(',') !== 'comparison,designs,falsification,hypothesis,method') return null;
  if (d.method !== 'ar1-design' || !DESIGN_SPACE.falsification.includes(d.falsification)) return null;
  for (const key of ['hypothesis', 'comparison'])
    if (typeof d[key] !== 'string' || !d[key].trim() || d[key].length > (key === 'hypothesis' ? 600 : 300)) return null;
  if (!Array.isArray(d.designs) || d.designs.length !== DESIGN_SPACE.points) return null;
  const seen = new Set();
  for (const p of d.designs) {
    if (!p || typeof p !== 'object' || Object.keys(p).sort().join(',') !== 'n,phi,prediction'
        || !DESIGN_SPACE.phi.includes(p.phi) || !DESIGN_SPACE.n.includes(p.n)
        || !['reject_h0', 'do_not_reject_h0'].includes(p.prediction) || seen.has(`${p.phi}:${p.n}`)) return null;
    seen.add(`${p.phi}:${p.n}`);
  }
  if (!d.designs.some(p => p.phi === 0)) return null;
  return { method: d.method, hypothesis: d.hypothesis.trim(), comparison: d.comparison.trim(), falsification: d.falsification,
    designs: d.designs.map(({ phi, n, prediction }) => ({ phi, n, prediction })) };
}

export function designPrompt() {
  return [{ role: 'system', content: 'Du är Professor Oraklet. Utforma ett litet experiment om när ett tvåsidigt AR(1)-test (alpha=0.05) förkastar H0: phi=0. Välj exakt tre olika designpunkter ur designrummet, varav minst en nollkontroll med phi=0. Förutsäg för varje punkt testets beslut för en enda realisering och välj i förväg falsifieringskriterium: any_mismatch (en felaktig förutsägelse motbevisar hypotesen) eller two_or_more_mismatches. Ange också vad som jämförs (comparison). Allt låses innan data genereras; du får inte ändra protokoll eller skriva kod. Svara endast JSON med exakt method:"ar1-design", hypothesis (kort svensk hypotes), designs:[{phi,n,prediction}], falsification, comparison.' },
    { role: 'user', content: JSON.stringify({ protocol: DESIGN_PROTOCOL, designSpace: DESIGN_SPACE }) }];
}

const hashBytes = label => createHash('sha256').update(label).digest();
function rng(label) {
  let index = 0;
  return () => { const b = hashBytes(`${label}:${index++}`); return (b.readUInt32BE(0) + 0.5) / 4294967296; };
}
// Same generator as the catalog AR(1) experiment, parameterised by the locked design point.
// The (phi, n) pair is unique within a design, so the series never depends on its list position.
export function designSeries(seed, { phi, n }) {
  const random = rng(`ar1-design-v1:${seed}:${phi}:${n}`);
  let value = 0; const values = [];
  for (let i = 0; i < 64 + n + 16; i++) {
    const noise = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
    value = 0.2 + phi * value + noise;
    if (i >= 64) values.push(value.toFixed(6));
  }
  return { train: values.slice(0, n), holdout: values.slice(n) };
}
// Numerical negative control with analytically zero lag covariance (as in the catalog experiment).
export const NULL_CONTROL = Object.freeze({ train: Array.from({ length: 65 }, (_, i) => String([1, 0, -1, 0][i % 4])), holdout: ['0', '-1', '0', '1'] });

export function preregistrationOutcome(design, decisions) {
  const mismatches = design.designs.filter((p, i) => p.prediction !== decisions[i]).length;
  const refuted = design.falsification === 'any_mismatch' ? mismatches >= 1 : mismatches >= 2;
  return { mismatches, outcome: refuted ? 'refuted' : 'confirmed' };
}

export async function runAr1DesignExperiment(seed, propose, callTool, onCommit, options = {}) {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  let operation = 'initial_proposal';
  const ai = await propose(designPrompt());
  const design = parseDesign(ai.text);
  if (!design) throw new ResearchError('invalid_model_proposal', { operation });
  // The design and preregistration are committed before any data is generated or tested.
  const preregistration = { protocol: DESIGN_PROTOCOL, design, provider: ai.provider, model: ai.model };
  const preregistrationSha256 = fingerprint(preregistration);
  const locked = { preregistrationSha256, protocol: DESIGN_PROTOCOL };
  await onCommit([locked]);
  const fixtures = design.designs.map((point, i) => {
    const input = designSeries(seed, point);
    return { id: i + 1, point, input, commitment: fingerprint({ input, point, preregistrationSha256, protocol: DESIGN_PROTOCOL }) };
  });
  await onCommit([locked, ...fixtures.map(f => ({ case: f.id, sha256: f.commitment, protocol: DESIGN_PROTOCOL }))]);
  const cases = [];
  try {
    operation = 'negative_control';
    const controlEvidence = await callTool(NULL_CONTROL), control = validateScienceResult(controlEvidence, 'statsmodels', NULL_CONTROL);
    if (Math.abs(control.phi) > 1e-10 || control.pvalue < 0.999) throw new ResearchError('invalid_tool_evidence');
    for (const f of fixtures) {
      operation = 'positive_control';
      const evidence = await callTool(f.input), measured = validateScienceResult(evidence, 'statsmodels', f.input);
      const passed = f.point.prediction === measured.decision;
      cases.push({ case: f.id, commitment: f.commitment, design: f.point, data: f.input, truth: { phi: f.point.phi, intercept: 0.2, synthetic: true, burnIn: 64 },
        proposal: { decision: f.point.prediction, reason: design.hypothesis }, provider: ai.provider, model: ai.model, evidence,
        ...(f.id === 1 ? { controlData: NULL_CONTROL, controlEvidence } : {}),
        hypothesisTest: { protocol: DESIGN_PROTOCOL, decision: measured.decision, measured, independentlyVerified: true, familyInference: null },
        initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
      await options.onProgress?.(structuredClone(cases));
    }
  } catch (error) {
    const info = diagnostic(error, { case: cases.length + 1, operation }); throw new ResearchError(info.code, info);
  }
  const outcome = preregistrationOutcome(design, cases.map(c => c.hypothesisTest.decision));
  return { schemaVersion: 2, promptVersion: 'ar1-design-v1', researcher: 'Professor Oraklet',
    title: 'Oraklet utformar ett AR(1)-test: när förkastas H0?',
    question: 'Kan Oraklet utforma ett AR(1)-test inom fasta ramar och i förväg korrekt förutsäga när testet förkastar H0?',
    method: 'Oraklet valde tre designpunkter (effektstorlek phi och stickprov n) och förregistrerade förutsägelser, jämförelse och falsifieringskriterium. Förregistreringen hashades innan data genererades. Statsmodels testade varje serie; en oberoende OLS-beräkning i flyttal med Student-t samt en numerisk nollkontroll verifierade resultaten. passed/failed avser om förregistreringen höll enligt Oraklets eget kriterium.',
    seed, status: outcome.outcome === 'confirmed' ? 'passed' : 'failed', protocol: DESIGN_PROTOCOL,
    preregistration: { ...design, sha256: preregistrationSha256 }, preregistrationOutcome: outcome,
    limitations: DESIGN_PROTOCOL.limitations, cases };
}
