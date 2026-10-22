import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ResearchError } from './errors.mjs';

const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourceBytes = readFileSync(new URL('./data/perturbseq-holdout.json', import.meta.url));
export const HOLDOUT_DATA_SHA256 = '1afb917d0e2bf76cda6b8a1bf7ae2bec2f64a3e8ba6e002540967242d485107f';
if (createHash('sha256').update(sourceBytes).digest('hex') !== HOLDOUT_DATA_SHA256)
  throw new ResearchError('invalid_tool_evidence');
const data = JSON.parse(sourceBytes);

export const CLASSES = Object.freeze(['none', 'weak', 'strong']);
export const classOf = n => n === 0 ? 'none' : n < 50 ? 'weak' : 'strong';
// Each case holds a fixed stratified batch, so the always-"none" baseline scores exactly 0.5.
export const BATCH = Object.freeze({ none: 6, weak: 4, strong: 2 });
export const HOLDOUT_CASES = 3;
// The symbol-family baseline needs at least this long a shared gene-symbol prefix (fixed before any run).
export const FAMILY_PREFIX = 4;
const CONTEXT_SIZE = 30;

export const HOLDOUT_PROTOCOL = Object.freeze({
  id: 'perturbseq-holdout-v1',
  hypothesis: 'Kan Oraklet förutsäga hur stor transkriptionseffekt utslagning av en gen ger i talamiska glutamaterga neuroner, för gener vars data hållits utanför ett publicerat Perturb-seq-dataset, bättre än två fasta baslinjer?',
  rule: 'Tre fall med vardera tolv dolda gener (6 utan effekt, 4 svaga, 2 starka; sammansättningen visas inte för modellen). Klass per gen: none = 0 DEG, weak = 1–49 DEG, strong = minst 50 DEG (BH-justerat Wilcoxon p < 0.05). Ett fall godkänns när Oraklets träffsäkerhet över de tre klasserna är strikt högre än baslinjen "alltid none" och minst lika hög som symbolfamiljebaslinjen (median av träningsgener med minst fyra gemensamma inledande tecken i gensymbolen, annars none).',
  assumptions: 'Facit är författarnas publicerade DEG-antal för 272 utslagningar som hölls utanför; träningsantalen gäller 1 674 andra utslagningar i samma celltyp. Urvalet av dolda gener gjordes av författarna och är inte ett slumpmässigt stickprov av screenen. Oraklet ser bara en sammanfattning av träningsdatan, inte uttrycksprofiler.',
  limitations: 'En celltyp och ett mått (antal DEG) från en enda screen; DEG-antalet beror också på cellantal och statistisk styrka, inte bara biologi. Tolv gener per fall ger stor slumpvariation; slutsatser kräver många körningar. Data publicerades oktober 2026 i ett öppet repo; en modell med senare träningsdata kan ha sett facit. Symbolfamiljebaslinjen ser hela träningsdatan, Oraklet bara ett urval. Detta är ett prediktionstest, inte ett nytt biologiskt fynd.',
  dataSha256: HOLDOUT_DATA_SHA256,
  source: data.source,
});

const order = (seed, salt, genes) => genes.map(g => [createHash('sha256').update(`${seed}:${salt}:${g}`).digest('hex'), g])
  .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([, g]) => g);
const validSeed = seed => {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
};

export function makeHoldoutCases(seed) {
  validSeed(seed);
  const pools = Object.fromEntries(CLASSES.map(c => [c,
    order(seed, 'pool-' + c, Object.keys(data.holdout).filter(g => classOf(data.holdout[g]) === c))]));
  return Array.from({ length: HOLDOUT_CASES }, (_, i) => {
    const genes = order(seed, 'case-' + (i + 1), CLASSES.flatMap(c => pools[c].slice(i * BATCH[c], (i + 1) * BATCH[c])));
    const input = { genes };
    return { id: i + 1, input, commitment: hash({ seed, input, protocol: HOLDOUT_PROTOCOL.id, dataSha256: HOLDOUT_DATA_SHA256 }) };
  });
}

// What Oraklet sees of the training data: class counts, the strongest responses and a seeded sample.
export function trainingContext(seed) {
  validSeed(seed);
  const entries = Object.entries(data.training);
  const strongest = [...entries].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, CONTEXT_SIZE);
  const top = new Set(strongest.map(([g]) => g));
  const sample = order(seed, 'training-sample', entries.map(([g]) => g).filter(g => !top.has(g)))
    .slice(0, CONTEXT_SIZE).sort().map(g => [g, data.training[g]]);
  const classCounts = Object.fromEntries(CLASSES.map(c => [c, entries.filter(([, n]) => classOf(n) === c).length]));
  return { perturbations: entries.length, classCounts, strongest, sample };
}

function valid(input) {
  if (!input || Object.keys(input).join(',') !== 'genes' || !Array.isArray(input.genes)
      || input.genes.length !== Object.values(BATCH).reduce((a, b) => a + b, 0)
      || new Set(input.genes).size !== input.genes.length
      || !input.genes.every(g => typeof g === 'string' && Object.hasOwn(data.holdout, g)))
    throw new ResearchError('invalid_tool_evidence');
}

function familyPrefix(gene) {
  let best = 0, values = [];
  for (const [t, n] of Object.entries(data.training)) {
    let k = 0;
    while (k < gene.length && k < t.length && gene[k].toLowerCase() === t[k].toLowerCase()) k++;
    if (k > best) { best = k; values = [n]; } else if (k === best) values.push(n);
  }
  return { best, values };
}
// Alternate path: shrink the prefix until some training symbol starts with it.
function familyPrefixAlternate(gene) {
  const symbols = Object.keys(data.training).map(t => [t.toLowerCase(), data.training[t]]);
  for (let length = gene.length; length > 0; length--) {
    const prefix = gene.slice(0, length).toLowerCase();
    const values = symbols.filter(([t]) => t.startsWith(prefix)).map(([, n]) => n);
    if (values.length) return { best: length, values };
  }
  return { best: 0, values: symbols.map(([, n]) => n) };
}
const median = values => {
  const v = [...values].sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const classOfAlternate = n => CLASSES[(n > 0) + (n >= 50)];

function analyse(input, alternate = false) {
  valid(input);
  const cls = alternate ? classOfAlternate : classOf;
  const truth = Object.fromEntries(input.genes.map(g => [g, { nDegs: data.holdout[g], class: cls(data.holdout[g]) }]));
  const majority = Object.fromEntries(input.genes.map(g => [g, 'none']));
  const prefixes = {}, family = {};
  for (const g of input.genes) {
    const { best, values } = alternate ? familyPrefixAlternate(g) : familyPrefix(g);
    const matched = best >= FAMILY_PREFIX;
    prefixes[g] = { length: best, matches: matched ? values.length : 0, medianNDegs: matched ? median(values) : null };
    family[g] = matched ? cls(median(values)) : 'none';
  }
  return { dataKind: 'published-held-out-measurement', cellGroup: data.cellGroup, truth,
    baselines: { majority: { predictions: majority, ...score(majority, truth, alternate) },
      family: { predictions: family, prefixes, ...score(family, truth, alternate) } } };
}

export function score(predictions, truth, alternate = false) {
  const genes = Object.keys(truth);
  const confusion = Object.fromEntries(CLASSES.map(t => [t, Object.fromEntries(CLASSES.map(p => [p, 0]))]));
  let correct = 0, effectCorrect = 0;
  for (const g of genes) {
    const t = truth[g].class, p = predictions[g];
    confusion[t][p]++;
    if (alternate ? CLASSES.indexOf(t) === CLASSES.indexOf(p) : t === p) correct++;
    if (alternate ? (CLASSES.indexOf(t) > 0) === (CLASSES.indexOf(p) > 0) : (t === 'none') === (p === 'none')) effectCorrect++;
  }
  return { correct, accuracy: correct / genes.length, effectAccuracy: effectCorrect / genes.length, confusion };
}

export const evaluateHoldout = input => analyse(input);
export async function callHoldout(input) {
  return { tool: 'perturbseq-holdout', adapterVersion: HOLDOUT_PROTOCOL.id,
    dataSha256: HOLDOUT_DATA_SHA256, inputSha256: hash(input), result: analyse(input) };
}
function sameTree(a, b) {
  if (a === null || typeof a !== 'object') return a === b;
  return b !== null && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
    && Object.keys(a).join(',') === Object.keys(b).join(',')
    && Object.keys(a).every(k => sameTree(a[k], b[k]));
}
export function validateHoldout(e, input) {
  if (e?.tool !== 'perturbseq-holdout' || e.adapterVersion !== HOLDOUT_PROTOCOL.id
      || e.dataSha256 !== HOLDOUT_DATA_SHA256 || e.inputSha256 !== hash(input)
      || !sameTree(e.result, analyse(input, true))) throw new ResearchError('invalid_tool_evidence');
  return e.result;
}

// The answer may arrive in a Markdown fence, with capitalised classes, gene keys in another case,
// a list of {gene, class} rows or per-gene objects; it is normalised to one class per batch gene.
// Anything else returns a fixed problem code, never the model text.
export function checkHoldoutProposal(text, genes) {
  let p;
  try {
    const t = String(text).trim().replace(/^<think>[\s\S]*?<\/think>\s*/, '');
    const fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
    p = JSON.parse(fenced ? fenced[1] : t);
  } catch { return { problem: 'not_json' }; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { problem: 'not_object' };
  if (Object.keys(p).some(k => !['predictions', 'reason'].includes(k))) return { problem: 'extra_fields' };
  const rows = Array.isArray(p.predictions)
    ? p.predictions.map(r => r && typeof r === 'object' ? [r.gene, r.class ?? r.prediction] : [undefined, undefined])
    : p.predictions && typeof p.predictions === 'object' ? Object.entries(p.predictions) : null;
  if (!rows) return { problem: 'missing_predictions' };
  const predictions = {};
  for (const [key, value] of rows) {
    const gene = typeof key !== 'string' ? undefined
      : genes.includes(key.trim()) ? key.trim() : genes.find(g => g.toLowerCase() === key.trim().toLowerCase());
    if (!gene) return { problem: 'unknown_gene' };
    if (Object.hasOwn(predictions, gene)) return { problem: 'duplicate_gene' };
    const label = value && typeof value === 'object' && !Array.isArray(value) ? value.class ?? value.prediction : value;
    const cls = typeof label === 'string' ? label.trim().toLowerCase() : null;
    if (!CLASSES.includes(cls)) return { problem: 'invalid_class' };
    predictions[gene] = cls;
  }
  if (genes.some(g => !Object.hasOwn(predictions, g))) return { problem: 'missing_gene' };
  if (typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return { problem: 'invalid_reason' };
  return { proposal: { predictions: Object.fromEntries(genes.map(g => [g, predictions[g]])), reason: p.reason.trim() } };
}
export const parseHoldoutProposal = (text, genes) => checkHoldoutProposal(text, genes).proposal ?? null;

const PROBLEM_TEXT = Object.freeze({
  not_json: 'svaret var inte giltig JSON', not_object: 'svaret var inte ett JSON-objekt',
  extra_fields: 'svaret hade andra fält än predictions och reason', missing_predictions: 'fältet predictions saknades',
  unknown_gene: 'predictions innehöll en gen som inte fanns i listan', duplicate_gene: 'en gen förekom två gånger',
  invalid_class: 'en klass var inte "none", "weak" eller "strong"', missing_gene: 'någon av generna saknades',
  invalid_reason: 'reason saknades eller var längre än 800 tecken',
});
const answerExample = genes => JSON.stringify({ predictions: Object.fromEntries(genes.slice(0, 2).map((g, i) => [g, CLASSES[i]])), reason: '...' });

export function holdoutMessages(seed, genes) {
  return [
    { role: 'system', content: 'Du är Professor Oraklet. Förutsäg effekten av CRISPR-utslagning av gener vars mätdata hållits utanför ett publicerat Perturb-seq-dataset från mushjärna (akut, gles utslagning i postmitotiska neuroner, P16 till P37–44). Facit är låst och dolt. Använd vad du vet om genernas funktion (proteinkomplex, paraloger, livsnödvändiga cellprocesser) och de visade träningsgenerna. Svara endast JSON: predictions: objekt med exakt de givna generna som nycklar och värdet "none" (0 DEG), "weak" (1–49 DEG) eller "strong" (minst 50 DEG); reason: kort svensk motivering. Format: ' + answerExample(['GenA', 'GenB']) + '. Urvalet av gener är inte ett slumpmässigt stickprov av screenen.' },
    { role: 'user', content: JSON.stringify({ protocol: { id: HOLDOUT_PROTOCOL.id, cellGroup: data.cellGroup,
      endpoint: 'Antal mätta gener med BH-justerat Wilcoxon p < 0.05 i celltypen (DEG) efter utslagning, jämfört med kontroller.' },
      training: { ...trainingContext(seed), note: 'strongest och sample är [gen, DEG-antal] för andra utslagningar i samma celltyp.' },
      heldOutGenes: genes }) },
  ];
}

export async function runHoldoutExperiment(seed, propose, callTool, onCommit, options = {}) {
  const fixtures = makeHoldoutCases(seed), cases = [];
  await onCommit(fixtures.map(f => ({ case: f.id, sha256: f.commitment, protocol: HOLDOUT_PROTOCOL })));
  for (const f of fixtures) {
    const messages = holdoutMessages(seed, f.input.genes);
    let ai = await propose(messages), checked = checkHoldoutProposal(ai.text, f.input.genes), formatProblem = null;
    // One format correction per case: the request is repeated with a fixed description of the problem.
    if (checked.problem) {
      formatProblem = checked.problem;
      const first = ai;
      ai = await propose([...messages, { role: 'user', content: `Ditt svar kunde inte tolkas: ${PROBLEM_TEXT[formatProblem]}. Svara igen endast med JSON i formatet ${answerExample(f.input.genes)}, med alla tolv gener.` }]);
      if (ai.provider !== first.provider || ai.model !== first.model) throw new ResearchError('model_changed', { case: f.id });
      checked = checkHoldoutProposal(ai.text, f.input.genes);
      if (checked.problem) throw new ResearchError('invalid_model_proposal', { case: f.id, operation: 'correction' });
    }
    const proposal = checked.proposal;
    const evidence = await callTool(f.input), result = validateHoldout(evidence, f.input);
    const oraklet = score(proposal.predictions, result.truth);
    const { majority, family } = result.baselines;
    const passed = oraklet.accuracy > majority.accuracy && oraklet.accuracy >= family.accuracy;
    cases.push({ case: f.id, commitment: f.commitment, data: { ...f.input, dataSha256: HOLDOUT_DATA_SHA256 },
      proposal, provider: ai.provider, model: ai.model, evidence,
      hypothesisTest: { protocol: HOLDOUT_PROTOCOL, decision: passed ? 'beats_baselines' : 'does_not_beat_baselines',
        measured: { ...result, oraklet }, independentlyVerified: true,
        verificationScope: 'held-out-counts-snapshot-and-baselines', familyInference: null },
      ...(formatProblem ? { formatCorrection: { problem: formatProblem } } : {}),
      initialPassed: formatProblem ? false : passed, passed, correctionAttempted: Boolean(formatProblem), sameModel: true });
    await options.onProgress?.(structuredClone(cases));
  }
  return { schemaVersion: 2, promptVersion: HOLDOUT_PROTOCOL.id, researcher: 'Professor Oraklet',
    title: 'Perturb-seq: förutsägelse av undanhållna genutslagningar',
    question: HOLDOUT_PROTOCOL.hypothesis,
    method: 'Blind förutsägelse av DEG-klass för 36 gener som hållits utanför ett publicerat Perturb-seq-dataset, jämförd med två fasta baslinjer mot låst facit.',
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed',
    protocol: HOLDOUT_PROTOCOL, limitations: HOLDOUT_PROTOCOL.limitations,
    summary: holdoutTotals(cases), cases };
}

export function holdoutTotals(cases) {
  const rows = cases.filter(c => c.hypothesisTest?.protocol?.id === HOLDOUT_PROTOCOL.id).map(c => c.hypothesisTest.measured);
  const genes = rows.reduce((n, m) => n + Object.keys(m.truth).length, 0);
  const total = pick => genes ? rows.reduce((n, m) => n + pick(m).correct, 0) / genes : null;
  return { genes, orakletAccuracy: total(m => m.oraklet), majorityAccuracy: total(m => m.baselines.majority),
    familyAccuracy: total(m => m.baselines.family) };
}
const pct = x => (100 * x).toFixed(0) + '%';
export function holdoutSummary(m) {
  return `Oraklet ${m.oraklet.correct}/${Object.keys(m.truth).length} (${pct(m.oraklet.accuracy)}); alltid none ${pct(m.baselines.majority.accuracy)}; symbolfamilj ${pct(m.baselines.family.accuracy)}; effekt/ingen effekt rätt ${pct(m.oraklet.effectAccuracy)}`;
}
export function holdoutMarkdown(cases) {
  const selected = cases.filter(c => c.hypothesisTest?.protocol?.id === HOLDOUT_PROTOCOL.id);
  if (!selected.length) return '';
  const t = holdoutTotals(selected);
  return '\n\n## Undanhållna genutslagningar\n\n'
    + `Totalt ${t.genes} gener: Oraklet ${pct(t.orakletAccuracy)}, alltid none ${pct(t.majorityAccuracy)}, symbolfamilj ${pct(t.familyAccuracy)} rätt klass. `
    + `Facit: [${data.source.repository.replace('https://github.com/', '')}](${data.source.repository}/tree/${data.source.commit}) (${data.source.citation}).\n\n`
    + selected.map(c => {
      const m = c.hypothesisTest.measured;
      return `### Fall ${c.case}\n\n| Gen | Oraklet | Symbolfamilj | Facit (DEG) |\n| --- | --- | --- | --- |\n`
        + c.data.genes.map(g => `| ${g} | ${c.proposal.predictions[g]} | ${m.baselines.family.predictions[g]} | ${m.truth[g].class} (${m.truth[g].nDegs}) |`).join('\n');
    }).join('\n\n');
}
