import { ResearchError, diagnostic } from './errors.mjs';
import { createHash } from 'node:crypto';

export const UPSTREAM = '66b680ce742e654cfe86da4f072a69061fe182b1';
export const PROMPT_VERSION = 'consistent-coefficients-v1';
export const LIMITATIONS = 'Syntetiskt metodtest med känd formelklass, inte en ny vetenskaplig upptäckt. Kontroll på ändligt många punkter är inget bevis för alla x. Ratfit returnerar en kontrollrapport, inte formelns koefficienter; modellens förslag kontrolleras separat.';

function gcd(a, b) { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; }
export function fraction(n, d) {
  if (d === 0n) throw new Error('Nollnämnare');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return d / g === 1n ? String(n / g) : `${n / g}/${d / g}`;
}
function pair(value) { const [n, d = '1'] = value.split('/'); return [BigInt(n), BigInt(d)]; }
export function verifyFormula(coefficients, rows) {
  const [a, b, c, d] = coefficients.map(BigInt);
  return rows.every(([x, y]) => {
    const [xn, xd] = pair(x), [yn, yd] = pair(y);
    const denominator = c * xn + d * xd;
    return denominator !== 0n && (a * xn + b * xd) * yd === yn * denominator;
  });
}

// Feedback uses only the six visible rows, never the fixture or holdout.
export function checkVisiblePoints(coefficients, banked) {
  const [a, b, c, d] = coefficients.map(BigInt);
  return banked.map(([x, expected]) => {
    const [xn, xd] = pair(x);
    const denominator = c * xn + d * xd;
    const actual = denominator === 0n ? null : fraction(a * xn + b * xd, denominator);
    return { x, expected, actual, matched: verifyFormula(coefficients, [[x, expected]]) };
  });
}

export function correctionPrompt(banked, proposal, checks) {
  return [
    ...modelPrompt(banked),
    { role: 'assistant', content: JSON.stringify(proposal) },
    { role: 'user', content: JSON.stringify({
      instruction: 'Ditt förslag matchar inte alla givna punkter. Gör ett enda korrigeringsförsök utifrån exakt kontroll nedan. actual=null betyder division med noll. Bestäm och kontrollera den nya slutliga formeln mot alla sex givna punkter INNAN du skriver JSON. Ersätt coefficients med den slutliga formelns koefficienter i ordningen [a,b,c,d]; behåll inte gamla värden om formeln ändras. Det är coefficients som testas, inte formeln i reason. Skriv därefter en kort reason som beskriver just dessa koefficienter, utan mellanliggande försök. Samma JSON-format gäller. Du har fortfarande inte fått facit eller undanhållna kontrollpunkter.',
      visibleChecks: checks,
    }) },
  ];
}

export function makeCases(seed) {
  if (!/^[0-9]{1,9}$/.test(String(seed))) throw new Error('Seed ska vara 1–9 siffror');
  return [0, 1, 2].map(index => {
    const bytes = createHash('sha256').update(`oraklet-ratfit-v1:${seed}:${index}`).digest();
    const a = BigInt(1 + bytes[0] % 7), b = BigInt(1 + bytes[1] % 7);
    const c = BigInt(1 + bytes[2] % 5);
    let d = BigInt(8 + bytes[3] % 7);
    if (a * d === b * c) d += 1n;
    const rows = xs => xs.map(x => [String(x), fraction(a * BigInt(x) + b, c * BigInt(x) + d)]);
    const input = { banked: rows([0, 1, 2, 3, 4, 5]), holdout: rows([8, 11, 15]) };
    const truth = [a, b, c, d].map(String);
    const commitment = createHash('sha256').update(JSON.stringify({ truth, input })).digest('hex');
    return { id: index + 1, input, truth, commitment };
  });
}

export function modelPrompt(banked) {
  const count = banked.length;
  return [
    { role: 'system', content: 'Du är Professor Oraklet i Debatt-AI:s forskningslabb. Genomför ett syntetiskt metodtest. Sök en formel (a*x+b)/(c*x+d) från de givna exakta datapunkterna. Använd metoden bootloops_ratfit som efterföljande kontroll. Du har inte fått facit eller kontrollpunkterna. Bestäm ett formelförslag och kontrollera det mot de givna datapunkterna INNAN du skriver JSON. Antalet tillgängliga punkter framgår av nästa meddelande. Svara ENDAST med JSON: {"method":"bootloops_ratfit","coefficients":["a","b","c","d"],"reason":"kort metodmotivering på svenska"}. coefficients ska innehålla den slutliga formelns koefficienter i exakt ordningen [a,b,c,d]. Det är dessa värden som testas; en annan formel i reason ändrar inte förslaget. Skriv därefter en kort reason som beskriver just den slutliga formeln, utan mellanliggande försök. Koefficienter ska vara heltal mellan -999 och 999, skrivna som strängar. Ange inga påståenden om testresultat eftersom testet ännu inte har körts.' },
    { role: 'user', content: JSON.stringify({ banked, availablePoints: count }) },
  ];
}

export function parseProposal(text) {
  try {
    const p = JSON.parse(text);
    if (Object.keys(p).sort().join(',') !== 'coefficients,method,reason'
      || p.method !== 'bootloops_ratfit' || !Array.isArray(p.coefficients)
      || p.coefficients.length !== 4 || !p.coefficients.every(x => typeof x === 'string' && /^-?\d{1,3}$/.test(x))
      || typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 800
      || (BigInt(p.coefficients[2]) === 0n && BigInt(p.coefficients[3]) === 0n)) return null;
    return { ...p, reason: p.reason.trim() };
  } catch { return null; }
}

export function validateTool(status, report, accepted, count) {
  if (status !== (accepted ? 200 : 422)) throw new ResearchError('tool_http_error', { httpStatus: status });
  const t = report?.toolResult, v = report?.verification;
  if (status !== (accepted ? 200 : 422) || report?.provider !== 'bootloops' || report?.mock !== false
    || t?.tool !== 'bootloops_ratfit' || t?.upstreamCommit !== UPSTREAM || t?.accepted !== accepted
    || t?.checked !== count || t?.failed !== (accepted ? 0 : 1)
    || !Number.isInteger(t?.depth) || t.depth < 1 || t.depth > 6
    || v?.status !== (accepted ? 'passed' : 'failed') || v?.scope !== 'exact_rational_holdout'
    || v?.factualityChecked !== false) throw new ResearchError('invalid_tool_evidence');
  return { accepted: t.accepted, depth: t.depth, checked: t.checked, failed: t.failed, upstreamCommit: t.upstreamCommit };
}

export async function runExperiment(seed, propose, callTool, onCommit = () => {}, options = {}) {
  const cases = makeCases(seed);
  const staged = options.staged === true;
  const feedback = options.feedback !== false;
  if (staged && !feedback) throw new ResearchError('invalid_plan');
  // Commit all fixtures before any model sees its banked data. This is an
  // audit fingerprint, not protection against an agent with repository access.
  await onCommit(cases.map(c => ({ case: c.id, sha256: c.commitment })));
  const results = [];
  for (const fixture of cases) {
    let operation = 'initial_proposal';
    try {
      // Store a parsed copy so the original attempt cannot be overwritten.
      async function attempt(messages) {
        const ai = await propose(messages);
        const proposal = parseProposal(ai.text);
        if (!proposal || typeof ai.provider !== 'string' || typeof ai.model !== 'string') throw new ResearchError('invalid_model_proposal');
        return { proposal, provider: ai.provider, model: ai.model,
          visibleChecks: checkVisiblePoints(proposal.coefficients, fixture.input.banked) };
      }
      // Staged stress test: first proposal sees only two observations; the
      // other four visible observations are revealed only for correction.
      // Holdouts and truth are never sent to the model.
      const initial = await attempt(modelPrompt(staged ? fixture.input.banked.slice(0, 2) : fixture.input.banked));
      const correctionAttempted = feedback && initial.visibleChecks.some(p => !p.matched);
      // No tool invocation or holdout evaluation occurs before this final proposal.
      if (correctionAttempted) operation = 'correction';
      const final = correctionAttempted
        ? await attempt(correctionPrompt(fixture.input.banked, initial.proposal, initial.visibleChecks))
        : initial;
      const { proposal, provider, model } = final;
      const corrupted = structuredClone(fixture.input);
      const [n, d] = pair(corrupted.holdout[0][1]);
      corrupted.holdout[0][1] = fraction(n + d, d);
      if (!verifyFormula(fixture.truth, fixture.input.holdout) || verifyFormula(fixture.truth, corrupted.holdout))
        throw new Error('Den oberoende kontrollen klarade inte sina egna kontrollfall');
      operation = 'positive_control';
      const good = await callTool(fixture.input);
      const ratfit = validateTool(good.status, good.data, true, 3);
      operation = 'negative_control';
      const bad = await callTool(corrupted);
      const negativeControl = validateTool(bad.status, bad.data, false, 3);
      const bankedMatch = verifyFormula(proposal.coefficients, fixture.input.banked);
      const holdoutMatch = verifyFormula(proposal.coefficients, fixture.input.holdout);
      results.push({ case: fixture.id, commitment: fixture.commitment, data: fixture.input, truth: fixture.truth,
        proposal, provider, model, bankedMatch, holdoutMatch, ratfit, negativeControl,
        correctionAttempted, staged, initialVisibleCount: staged ? 2 : 6, attempts: correctionAttempted ? [initial, final] : [initial],
        initialBankedMatch: initial.visibleChecks.every(p => p.matched),
        initialHoldoutMatch: verifyFormula(initial.proposal.coefficients, fixture.input.holdout),
        initialPassed: verifyFormula(initial.proposal.coefficients, fixture.input.banked)
          && verifyFormula(initial.proposal.coefficients, fixture.input.holdout),
        sameModel: initial.provider === provider && initial.model === model,
        passed: bankedMatch && holdoutMatch });
      await options.onProgress?.(structuredClone(results));
    } catch (error) {
      const info = diagnostic(error, { case: fixture.id, operation });
      throw new ResearchError(info.code, info);
    }
  }
  return { schemaVersion: 2, promptVersion: PROMPT_VERSION, researcher: 'Professor Oraklet', title: staged ? 'Kan ytterligare observationer korrigera ett underbestämt rationellt samband?' : feedback ? 'Kan återkoppling hjälpa Oraklet återfinna ett dolt rationellt samband?' : 'Kan Oraklet återfinna ett dolt rationellt samband utan återkoppling?',
    question: staged ? 'Förbättras ett första förslag baserat på två observationer när ytterligare fyra synliga observationer och exakt felåterkoppling tillkommer, mätt på tre fortsatt dolda kontrollpunkter?' : feedback ? 'Förbättras modellens formelförslag efter högst ett korrigeringsförsök med exakt återkoppling från sex synliga punkter, mätt mot tre undanhållna kontrollpunkter?' : 'Kan ett första formelförslag återfinna sambandet och klara tre blinda kontrollpunkter?',
    method: (staged ? 'Stresstest: första förslaget ser endast två av sex synliga punkter. Vid fel mot samtliga sex visas exakta avvikelser och ett enda korrigeringsförsök tillåts. Tre separata holdoutpunkter förblir dolda. ' : '') + (feedback ? '' : 'Ingen återkoppling eller korrigering ges i denna körning. ') + 'Tre syntetiska fall. Första förslaget sparas och kontrolleras mot sex synliga punkter. I återkopplingsläget ges vid miss exakt återkoppling och högst ett korrigeringsförsök. Det slutliga förslaget låses innan de tre undanhållna punkterna kontrolleras. Första och slutliga resultat redovisas separat. Ratfit körs på riktiga och avsiktligt felaktiga kontrollvärden. Modellens koefficienter testas separat med BigInt och exakt korsmultiplikation, utan Thiele-algoritmen.',
    seed: String(seed), status: results.every(r => r.passed) ? 'passed' : 'failed', limitations: LIMITATIONS + (staged ? ' Fler observationer och felåterkoppling ges samtidigt; deras individuella effekter kan inte särskiljas. ' : ' ') + 'Tre fall räcker inte för att fastställa en generell förbättring. Eventuella modellbyten mellan försöken redovisas och kan påverka jämförelsen.', cases: results };
}
