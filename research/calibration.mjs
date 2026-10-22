// Calibration: before each experiment answer is verified, Oraklet states how likely it is to pass
// (confidence 0-1). The lab strips that field before the experiment's strict parser sees the
// answer, so every protocol is unchanged, and compares the stated confidence with the verified
// outcome per case (Brier score). A missing or invalid confidence never fails an experiment.
export const CONFIDENCE_RULE = 'Lägg också till fältet "confidence": din sannolikhet (tal 0-1) att just detta svar godkänns av experimentets oberoende verifiering.';

// Removes a top-level "confidence" from a JSON object answer; any other text is returned unchanged.
export function stripConfidence(text) {
  let value;
  try { value = JSON.parse(text); } catch { return { text, confidence: null }; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'confidence')) return { text, confidence: null };
  const { confidence, ...rest } = value;
  const valid = typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
  return { text: JSON.stringify(rest), confidence: valid ? confidence : null };
}

// /v1/query accepts 8,000 characters; the rule is only added when the request still fits, so a
// data-heavy experiment prompt is never pushed over the limit (that call just has no confidence).
export const MAX_CALIBRATED_CHARS = 7600;

// Wraps an experiment proposer: asks for confidence, records it per call, returns the stripped answer.
export function calibrated(propose, log) {
  return async messages => {
    const withRule = [...messages, { role: 'system', content: CONFIDENCE_RULE }];
    const answer = await propose(JSON.stringify(withRule).length <= MAX_CALIBRATED_CHARS ? withRule : messages);
    const { text, confidence } = stripConfidence(answer.text);
    log.calls.push(confidence);
    return { ...answer, text };
  };
}

// The runner reports progress after each finished case; the calls made since the previous case
// belong to this one, and the first of them is its initial proposal.
export function markProgress(log, caseCount) {
  if (caseCount > log.marks.length) log.marks.push(...Array(caseCount - log.marks.length).fill(log.calls.length));
}

export function calibrationReport(log, cases) {
  const rows = [];
  (Array.isArray(cases) ? cases : []).forEach((c, i) => {
    const start = i === 0 ? 0 : log.marks[i - 1];
    const confidence = start !== undefined && start < (log.marks[i] ?? log.calls.length) ? log.calls[start] : null;
    const passed = typeof c?.initialPassed === 'boolean' ? c.initialPassed : typeof c?.passed === 'boolean' ? c.passed : null;
    if (passed !== null) rows.push({ case: c.case ?? i + 1, confidence, passed });
  });
  const scored = rows.filter(r => r.confidence !== null);
  const mean = values => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 1e4) / 1e4 : null;
  return { rule: 'confidence = stated probability that the initial answer passes verification', cases: rows,
    scoredCases: scored.length, meanConfidence: mean(scored.map(r => r.confidence)),
    passRate: mean(scored.map(r => Number(r.passed))),
    brierScore: mean(scored.map(r => (r.confidence - Number(r.passed)) ** 2)) };
}

// Calibration across saved lab reports, per provider/model: reliability bins (stated confidence vs
// observed pass rate) and the Brier score over every scored case.
export const BINS = Object.freeze([[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0001]]);
export function calibrationSummary(reports) {
  const models = new Map();
  for (const report of Array.isArray(reports) ? reports : []) {
    const rows = report?.calibration?.cases;
    if (!Array.isArray(rows)) continue;
    const identity = report.cases?.find(c => typeof c?.provider === 'string' && typeof c?.model === 'string');
    if (!identity) continue;
    const key = `${identity.provider} / ${identity.model}`;
    const m = models.get(key) ?? { model: key, runs: 0, cases: [] };
    m.runs++;
    for (const r of rows) if (typeof r?.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 && typeof r.passed === 'boolean') m.cases.push(r);
    models.set(key, m);
  }
  const round = v => Math.round(v * 1e4) / 1e4;
  return [...models.values()].filter(m => m.cases.length).map(m => ({
    model: m.model, runs: m.runs, cases: m.cases.length,
    meanConfidence: round(m.cases.reduce((s, r) => s + r.confidence, 0) / m.cases.length),
    passRate: round(m.cases.filter(r => r.passed).length / m.cases.length),
    brierScore: round(m.cases.reduce((s, r) => s + (r.confidence - Number(r.passed)) ** 2, 0) / m.cases.length),
    bins: BINS.map(([lo, hi]) => {
      const inBin = m.cases.filter(r => r.confidence >= lo && r.confidence < hi);
      return { range: `${lo}-${Math.min(hi, 1)}`, cases: inBin.length,
        passRate: inBin.length ? round(inBin.filter(r => r.passed).length / inBin.length) : null };
    }) })).sort((a, b) => a.brierScore - b.brierScore || b.cases - a.cases);
}

export function calibrationMarkdown(summary) {
  const lines = ['# Oraklets kalibrering', '',
    'Angiven säkerhet (sannolikheten att första förslaget godkänns) jämförs med verifierat utfall. Lägre Brier är bättre; 0,25 motsvarar att alltid säga 50 %. En välkalibrerad modell har godkännandeandel nära säkerhetsintervallet i varje rad.', ''];
  if (!summary.length) return lines.concat('Inga kalibrerade körningar ännu.', '').join('\n');
  for (const m of summary) {
    lines.push(`## ${m.model}`, '', `${m.runs} körningar, ${m.cases} fall. Snittsäkerhet ${m.meanConfidence}, godkända ${m.passRate}, Brier ${m.brierScore}.`, '',
      '| Angiven säkerhet | Fall | Andel godkända |', '| --- | ---: | ---: |',
      ...m.bins.map(b => `| ${b.range} | ${b.cases} | ${b.passRate ?? '–'} |`), '');
  }
  return lines.join('\n');
}
