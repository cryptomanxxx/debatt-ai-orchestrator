import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ResearchError } from './errors.mjs';

const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourceBytes = readFileSync(new URL('./temperature-evidence.json', import.meta.url));
export const TEMPERATURE_DATA_SHA256 = 'cb29298f8def967568540d1dc0aecee3fdaca9f001a4d8b3df6ed7c1f4cad81d';
if (createHash('sha256').update(sourceBytes).digest('hex') !== TEMPERATURE_DATA_SHA256)
  throw new ResearchError('invalid_tool_evidence');
const sources = JSON.parse(sourceBytes);
export const TEMPERATURE_PROTOCOL = Object.freeze({
  id: 'temperature-evidence-v1',
  hypothesis: 'Vad stöder publicerade temperaturstudier om insulinabsorption, och räcker deras sammanfattningar för en överförbar temperaturmodell?',
  rule: 'Tre låsta studier analyseras separat. Beräkna rapporterade effektkvoter och två uttryckligt antagna interpolationskurvor för omgivningstemperatur. Testa överföring av 1981 års loglinjära kurva till 1988 års temperaturkontrast utan omkalibrering. Lokal hudtemperatur analyseras separat med publicerade p-värden, gräns 0.05; ingen ny inferens. Nullkontroller är syntetiska. passed gäller Oraklets tolkning, inte ett nytt kliniskt fynd.',
  assumptions: 'Manuellt extraherade publicerade gruppsammanfattningar från ett riktat urval; inga individdata. Rapporterade intervall är inte konfidensintervall. Loglinjär eller linjär interpolation är modellantaganden, inte uppmätta temperaturkurvor. Olika insulin, mätmått och försöksvillkor; inga poolade effekter.',
  limitations: 'Återanalys av kända studieresultat och ett deskriptivt överföringsstresstest, inte ett nytt försök på människor eller en systematisk översikt. Publicerade p-värden återges, inte reproduceras från rådata. Samma förenklade temperaturkurva kan inte valideras för patienter, årstider eller alla insulin med dessa sammanfattningar. Ingen omvandling av plasma-AUC till absorptionskonstant, glukosprognos eller dosråd. Ingen biologisk validering genom beräkningskontroller. Seed ändrar endast åtagandets identitet; källdata och resultat är samma vid varje körning.',
  dataSha256: TEMPERATURE_DATA_SHA256,
});
const source = id => sources.studies.find(s => s.id === id);
export function makeTemperatureCases(seed) {
  if (typeof seed !== 'string' || !/^\d{1,9}$/.test(seed)) throw new ResearchError('invalid_plan');
  return sources.studies.map((s, i) => {
    const input = { studyId: s.id, mode: 'observed' };
    return { id: i + 1, input, commitment: hash({ seed, input, protocol: TEMPERATURE_PROTOCOL }) };
  });
}
function valid(input) {
  if (!input || Object.keys(input).sort().join(',') !== 'mode,studyId'
      || !source(input.studyId) || !['observed', 'null-control'].includes(input.mode))
    throw new ResearchError('invalid_tool_evidence');
}
// Alternate arithmetic checks numeric transformations, not the source extraction.
function analyse(input, alternate = false) {
  valid(input);
  const s = source(input.studyId), isControl = input.mode === 'null-control';
  const log = alternate ? x => Math.log1p(x - 1) : Math.log;
  const power = alternate ? (x, y) => Math.exp(log(x) * y) : (x, y) => x ** y;
  const result = {
    dataKind: isControl ? 'synthetic-negative-control' : 'published-aggregate',
    studyId: s.id, sourceUrl: s.url, sourceLocation: s.location,
    temperatureKind: s.temperatureKind, endpoint: s.endpoint,
    uniqueTemperatureLawIdentified: false, individualUncertaintyEstimable: false,
    doseRecommendationAllowed: false,
  };
  if (s.temperatureKind === 'ambient') {
    const ratios = isControl ? [1, 1] : s.reportedRatioRange;
    const [cold, warm] = s.temperaturesC, delta = warm - cold;
    result.reportedRatioRange = [...ratios];
    result.reportedP = isControl ? null : s.reportedP;
    result.direction = ratios[0] > 1 ? 'higher_at_warmer' : 'same';
    result.assumedLogSlopePerC = ratios.map(r => log(r) / delta);
    // Four fixed intervals, no temperatures outside the source range.
    result.interpolations = [0, 0.25, 0.5, 0.75, 1].map(fraction => ({
      temperatureC: cold + fraction * delta,
      loglinearRatioRange: ratios.map(r => power(r, fraction)),
      linearRatioRange: ratios.map(r => alternate ? (1 - fraction) + fraction * r : 1 + (r - 1) * fraction),
    }));
    result.interiorDifferenceAtMidpoint = result.interpolations[2].linearRatioRange
      .map((r, i) => r - result.interpolations[2].loglinearRatioRange[i]);
    if (s.id === 'ambient-1988') {
      const train = source('ambient-1981');
      const trainingRatios = isControl ? [1, 1] : train.reportedRatioRange;
      const trainDelta = train.temperaturesC[1] - train.temperaturesC[0];
      const predicted = trainingRatios.map(r => power(r, delta / trainDelta));
      const overlap = Math.max(predicted[0], ratios[0]) <= Math.min(predicted[1], ratios[1]);
      result.transport = { trainingStudy: train.id, targetStudy: s.id,
        predictedRatioRange: predicted, reportedTargetRatioRange: [...ratios], rangesOverlap: overlap,
        decision: overlap ? 'ranges_overlap' : 'ranges_do_not_overlap',
        statisticalTest: false, independentlyHeldOut: false,
        outsideTrainingTemperatureRange: cold < train.temperaturesC[0] || warm > train.temperaturesC[1],
        caveat: 'Deskriptiv jämförelse av två redan publicerade sammanfattningar. Olika insulin, mått, måltider och aktivitet; detta är inte ett formellt test av en gemensam kausal temperatureffekt.' };
    }
    result.decision = isControl ? 'synthetic_no_difference'
      : s.id === 'ambient-1981' ? 'reported_increase_law_unidentified'
      : result.transport.rangesOverlap ? 'reported_increase_law_unidentified' : 'reported_increase_transport_mismatch';
  } else {
    const means = isControl ? { control: s.means.control, cooling: s.means.control, warming: s.means.control } : s.means;
    result.contrasts = ['cooling', 'warming'].map(condition => {
      const p = isControl ? null : s.reportedP[condition + 'VsControl'];
      return { condition, temperatureC: s.temperaturesC[condition], controlTemperatureC: null,
        ratioToControl: means[condition] / means.control,
        percentChange: alternate ? (means[condition] - means.control) * 100 / means.control
          : (means[condition] / means.control - 1) * 100,
        publishedP: p,
        interpretation: isControl ? 'synthetic_no_difference'
          : p < 0.05 ? 'published_difference_detected' : 'published_difference_not_detected',
      };
    });
    result.absorptionRateEstimable = false;
    result.ambientTemperatureEffectEstimable = false;
    result.decision = isControl ? 'synthetic_no_difference' : 'local_cooling_difference_warming_uncertain';
  }
  return result;
}
export const evaluateTemperature = input => analyse(input);
export async function callTemperature(input) {
  return { tool: 'temperature-evidence', adapterVersion: TEMPERATURE_PROTOCOL.id,
    dataSha256: TEMPERATURE_DATA_SHA256, inputSha256: hash(input), result: analyse(input) };
}
function closeTree(a, b) {
  if (typeof a === 'number') return typeof b === 'number' && Number.isFinite(a)
    && Number.isFinite(b) && Math.abs(a - b) <= 1e-10;
  if (a === null || typeof a !== 'object') return a === b;
  return b !== null && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
    && Object.keys(a).join(',') === Object.keys(b).join(',')
    && Object.keys(a).every(k => closeTree(a[k], b[k]));
}
export function validateTemperature(e, input) {
  if (e?.tool !== 'temperature-evidence' || e.adapterVersion !== TEMPERATURE_PROTOCOL.id
      || e.dataSha256 !== TEMPERATURE_DATA_SHA256 || e.inputSha256 !== hash(input)
      || !closeTree(e.result, analyse(input, true))) throw new ResearchError('invalid_tool_evidence');
  return e.result;
}
export function parseTemperatureProposal(text) {
  try {
    const p = JSON.parse(text);
    if (!p || Object.keys(p).sort().join(',') !== 'decision,reason,uniqueTemperatureLawIdentified'
        || !['reported_increase_law_unidentified', 'reported_increase_transport_mismatch',
          'local_cooling_difference_warming_uncertain'].includes(p.decision)
        || typeof p.uniqueTemperatureLawIdentified !== 'boolean'
        || typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800) return null;
    return p;
  } catch { return null; }
}
export async function runTemperatureExperiment(seed, propose, callTool, onCommit, options = {}) {
  const fixtures = makeTemperatureCases(seed), cases = [];
  await onCommit(fixtures.map(f => ({ case: f.id, sha256: f.commitment, protocol: TEMPERATURE_PROTOCOL })));
  for (const f of fixtures) {
    const ai = await propose([
      { role: 'system', content: 'Du är Professor Oraklet. Tolka låsta publicerade temperaturresultat; det är inte en blind prediktion av ett nytt kliniskt försök. Innan verktygsresultat visas, svara endast JSON: decision:"reported_increase_law_unidentified"|"reported_increase_transport_mismatch"|"local_cooling_difference_warming_uncertain", uniqueTemperatureLawIdentified:boolean, reason:kort svensk motivering. En unik temperaturkurva får inte antas utan evidens.' },
      { role: 'user', content: JSON.stringify({ protocol: TEMPERATURE_PROTOCOL,
        study: source(f.input.studyId),
        referenceStudy: f.input.studyId === 'ambient-1988' ? source('ambient-1981') : null,
        method: 'Omgivning: antag R(T)=r^((T-Tcold)/(Twarm-Tcold)) eller R(T)=1+(r-1)*(T-Tcold)/(Twarm-Tcold), endast inom studiens temperaturer. Överföring från 1981: r^(20/15) jämförs deskriptivt med 1988 års rapporterade spann. Lokal hud: kvot mot kontroll, publicerat p<0.05; ett ej signifikant resultat betyder inte att effekten är noll. Ingen temperaturkurva kalibreras från AUC.' }) },
    ]);
    const proposal = parseTemperatureProposal(ai.text);
    if (!proposal) throw new ResearchError('invalid_model_proposal');
    const evidence = await callTool(f.input), measured = validateTemperature(evidence, f.input);
    const controlInput = { ...f.input, mode: 'null-control' };
    const controlEvidence = await callTool(controlInput), control = validateTemperature(controlEvidence, controlInput);
    if (control.decision !== 'synthetic_no_difference') throw new ResearchError('invalid_tool_evidence');
    const passed = proposal.decision === measured.decision
      && proposal.uniqueTemperatureLawIdentified === measured.uniqueTemperatureLawIdentified;
    cases.push({ case: f.id, commitment: f.commitment, data: { ...f.input,
      source: structuredClone(source(f.input.studyId)), dataSha256: TEMPERATURE_DATA_SHA256 },
      proposal, provider: ai.provider, model: ai.model, evidence, controlEvidence,
      hypothesisTest: { protocol: TEMPERATURE_PROTOCOL, decision: measured.decision, measured,
        independentlyVerified: true, verificationScope: 'numeric-transformations-and-snapshot-integrity', familyInference: null },
      initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
    await options.onProgress?.(structuredClone(cases));
  }
  return { schemaVersion: 2, promptVersion: TEMPERATURE_PROTOCOL.id, researcher: 'Professor Oraklet',
    title: 'Temperatur och insulinabsorption: publicerad evidens och modellöverföring',
    question: TEMPERATURE_PROTOCOL.hypothesis, method: 'Låst återanalys av tre publicerade gruppsammanfattningar, alternativa interpolationsantaganden, deskriptiv överföring och syntetiska nollkontroller.',
    seed, status: cases.every(c => c.passed) ? 'passed' : 'failed',
    protocol: TEMPERATURE_PROTOCOL, limitations: TEMPERATURE_PROTOCOL.limitations, cases };
}
export function temperatureSummary(m) {
  if (m.temperatureKind === 'ambient') return `Rapporterad kvot ${m.reportedRatioRange.join('–')};`
    + (m.transport ? ` överförd loglinjär kvot ${m.transport.predictedRatioRange.map(x => x.toFixed(4)).join('–')}; överlapp: ${m.transport.rangesOverlap ? 'ja' : 'nej'};` : '')
    + ' ingen unik temperaturkurva identifierad.';
  return m.contrasts.map(c => `${c.condition}: AUC-kvot ${c.ratioToControl.toFixed(4)}, publicerat p=${c.publishedP}`).join('; ')
    + '; lokalt hudförsök, ingen absorptionskonstant skattad.';
}
export function temperatureMarkdown(cases) {
  const selected = cases.filter(c => c.hypothesisTest?.protocol?.id === TEMPERATURE_PROTOCOL.id);
  if (!selected.length) return '';
  return '\n\n## Källor och antagna temperaturkurvor\n\nKurvorna interpolerar rapporterade gruppsammanfattningar under två valda antaganden. De är inte uppmätta individuella absorptionskurvor eller parametrar i glukossimulatorn.\n\n'
    + selected.map(c => {
      const m = c.hypothesisTest.measured, s = c.data.source;
      const intro = `### Fall ${c.case}: ${s.id}\n\n[Källa: ${s.doi}](${s.url}), ${s.location}; n=${s.n}. ${s.endpoint}.\n\n`;
      if (m.temperatureKind !== 'ambient') return intro
        + '| Lokal behandling | Temperatur | AUC-kvot mot kontroll | Förändring | Publicerat p mot kontroll | Tolkning |\n| --- | --- | --- | --- | --- | --- |\n'
        + m.contrasts.map(r => `| ${r.condition} | ${r.temperatureC} °C | ${r.ratioToControl.toFixed(4)} | ${r.percentChange.toFixed(2)}% | ${r.publishedP} | ${r.interpretation} |`).join('\n')
        + '\n\nKontrollens hudtemperatur är inte ett låst mätvärde. Rumstemperatur används inte som ersättning. Plasma-AUC ger inte ensam absorptionstakten; parade rådata saknas för nya osäkerhetsintervall. Ej signifikant innebär inte bevisad nolleffekt.';
      return intro + 'Spannet är rapporterat i abstraktet, inte ett konfidensintervall.\n\n'
        + '| Omgivningstemperatur | Antagen loglinjär kvot | Antagen linjär kvot |\n| --- | --- | --- |\n'
        + m.interpolations.map(r => `| ${r.temperatureC} °C | ${r.loglinearRatioRange.map(x => x.toFixed(4)).join('–')} | ${r.linearRatioRange.map(x => x.toFixed(4)).join('–')} |`).join('\n')
        + (m.transport ? '\n\n' + temperatureSummary(m) + ' Detta är ett deskriptivt stresstest över olika försöksvillkor; 10 °C ligger utanför träningsstudiens temperaturer. Inte oberoende klinisk validering.' : '');
    }).join('\n\n');
}
