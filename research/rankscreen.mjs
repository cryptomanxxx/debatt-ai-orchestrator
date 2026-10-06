import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { ResearchError, diagnostic } from './errors.mjs';
import { UPSTREAM } from './ratfit.mjs';

const bridge = fileURLToPath(new URL('../scripts/rankscreen_bridge.py', import.meta.url));
const pins = JSON.parse(readFileSync(new URL('../vendor/bootloops/rankscreen/pins.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function callRankscreen(input) {
  return new Promise((resolve, reject) => {
    const child = execFile('python3', ['-I', bridge], { timeout: 15000, maxBuffer: 65536 }, (error, stdout) => {
      if (error) return reject(new ResearchError('tool_transport_error'));
      try { resolve(JSON.parse(stdout)); } catch { reject(new ResearchError('invalid_tool_evidence')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}

// Exhaustive minors over BigInt, independent of upstream modular elimination.
function determinant(matrix) {
  if (matrix.length === 1) return matrix[0][0];
  return matrix[0].reduce((sum, value, col) => sum + (col % 2 ? -1n : 1n) * value
    * determinant(matrix.slice(1).map(row => row.filter((_, i) => i !== col))), 0n);
}
function combinations(n, k, start = 0, prefix = []) {
  if (prefix.length === k) return [prefix];
  return Array.from({ length: n - start }, (_, i) => i + start)
    .flatMap(i => combinations(n, k, i + 1, [...prefix, i]));
}
export function exactRank(rows) {
  const matrix = rows.map(row => row.map(BigInt));
  for (let k = Math.min(matrix.length, matrix[0].length); k > 0; k--)
    for (const rs of combinations(matrix.length, k))
      for (const cs of combinations(matrix[0].length, k))
        if (determinant(rs.map(r => cs.map(c => matrix[r][c]))) !== 0n) return k;
  return 0;
}
export function exactVerdict(input) {
  const rank = exactRank(input.rows.map(row => row.slice(0, -1)));
  return { rank, consistent: rank === exactRank(input.rows) };
}

export function makeRankCases(seed, experimentId) {
  if (!/^\d{1,9}$/.test(seed) || !['rankscreen-consistency', 'rankscreen-rank-deficit'].includes(experimentId)) throw new Error('Ogiltigt experiment');
  return [0, 1, 2].map(index => {
    const bytes = createHash('sha256').update(`oraklet-rankscreen-v1:${experimentId}:${seed}:${index}`).digest();
    const rank = experimentId === 'rankscreen-consistency' ? 3 : 1 + index % 2;
    const solution = [1 + bytes[0] % 7, 1 + bytes[1] % 7, 1 + bytes[2] % 7];
    const generators = Array.from({ length: rank }, (_, i) => Array.from({ length: 3 }, (_, j) => j < i ? 0 : j === i ? 1 + bytes[3 + i] % 7 : 1 + bytes[7 + j] % 5));
    const rows = generators.map(row => [...row, row.reduce((s, c, i) => s + c * solution[i], 0)]);
    rows.push(rows[0].map((v, j) => 2 * v + (rows[1]?.[j] || 0)));
    const good = { rows: rows.map(row => row.map(String)) };
    const bad = structuredClone(good);
    bad.rows.at(-1)[3] = String(BigInt(bad.rows.at(-1)[3]) + 1n);
    const input = index % 2 === 0 ? good : bad;
    const control = index % 2 === 0 ? bad : good;
    const truth = exactVerdict(input), controlTruth = exactVerdict(control);
    return { id: index + 1, input, control, truth, controlTruth,
      commitment: hash({ input, control, truth, controlTruth }) };
  });
}

export function rankPrompt(input) {
  return [{ role: 'system', content: 'Du är Professor Oraklet. Klassificera ett litet exakt linjärt ekvationssystem över rationella tal. Varje rad innehåller koefficienterna för tre variabler följt av högerledet. Ange koefficientmatrisens rang och om ALLA ekvationer tillsammans har en lösning. Beroende ekvationer kan dölja motsägelser. Svara endast med JSON med exakt method="bootloops_rankscreen", rank (heltal 0–3), consistent (boolean), reason (kort svensk motivering). Verktyget körs efter att ditt svar låsts; du får inte facit eller verktygsresultat i förväg.' },
    { role: 'user', content: JSON.stringify(input) }];
}
export function parseRankProposal(text) {
  try {
    const p = JSON.parse(text);
    return p && Object.keys(p).sort().join(',') === 'consistent,method,rank,reason'
      && p.method === 'bootloops_rankscreen' && Number.isInteger(p.rank) && p.rank >= 0 && p.rank <= 3
      && typeof p.consistent === 'boolean' && typeof p.reason === 'string' && p.reason.trim() && p.reason.length <= 800
      ? { ...p, reason: p.reason.trim() } : null;
  } catch { return null; }
}

export function validateRankEvidence(evidence, input, truth) {
  const r = evidence?.receipt;
  const inputSha = createHash('sha256').update(JSON.stringify({ rows: input.rows })).digest('hex');
  if (evidence?.tool !== 'bootloops_rankscreen' || evidence.upstreamCommit !== UPSTREAM
    || JSON.stringify(evidence.sourceSha256) !== JSON.stringify(pins)
    || evidence.inputSha256 !== inputSha || evidence.runtime !== 'github-actions-python'
    || evidence.scope !== 'multi_prime_rank_screen' || evidence.factualityChecked !== false
    || r?.format !== 'rankscreen-verdict-v1' || r.verdict !== 'CERTIFIED-SCREEN' || r.agree !== true
    || r.backend !== 'sparse' || r.k !== 3 || r.ncols !== 3 || r.n_rows !== input.rows.length
    || r.rank !== truth.rank || !Number.isInteger(r.n_inconsistent) || r.n_inconsistent < 0 || r.n_inconsistent > input.rows.length
    || (r.n_inconsistent === 0) !== truth.consistent
    || r.closure_candidate !== (truth.consistent && truth.rank === 3)
    || JSON.stringify(r.primes) !== JSON.stringify([1073741789, 1073741783, 1073741741])
    || !Array.isArray(r.per_prime) || r.per_prime.length !== 3
    || !r.per_prime.every((p, i) => p.prime === r.primes[i] && p.rank === truth.rank
      && Number.isInteger(p.n_inconsistent) && p.n_inconsistent >= 0 && p.n_inconsistent <= input.rows.length
      && (p.n_inconsistent === 0) === truth.consistent))
    throw new ResearchError('invalid_tool_evidence');
  return evidence;
}

export async function runRankExperiment(seed, propose, callTool, onCommit, options) {
  const cases = makeRankCases(seed, options.experimentId), results = [];
  await onCommit(cases.map(c => ({ case: c.id, sha256: c.commitment })));
  for (const fixture of cases) {
    let operation = 'initial_proposal';
    try {
      const ai = await propose(rankPrompt(fixture.input));
      const proposal = parseRankProposal(ai.text);
      if (!proposal) throw new ResearchError('invalid_model_proposal');
      operation = 'positive_control';
      const rankscreen = validateRankEvidence(await callTool(fixture.input), fixture.input, fixture.truth);
      operation = 'negative_control';
      const control = validateRankEvidence(await callTool(fixture.control), fixture.control, fixture.controlTruth);
      const passed = proposal.rank === fixture.truth.rank && proposal.consistent === fixture.truth.consistent;
      results.push({ case: fixture.id, commitment: fixture.commitment, data: fixture.input, truth: fixture.truth,
        controlData: fixture.control, controlTruth: fixture.controlTruth, proposal, provider: ai.provider, model: ai.model,
        rankscreen, control, initialPassed: passed, passed, correctionAttempted: false, sameModel: true });
      await options.onProgress?.(structuredClone(results));
    } catch (error) {
      const info = diagnostic(error, { case: fixture.id, operation });
      throw new ResearchError(info.code, info);
    }
  }
  return { schemaVersion: 2, promptVersion: 'linear-rank-v1', researcher: 'Professor Oraklet',
    title: options.experimentId === 'rankscreen-consistency' ? 'Kan Oraklet upptäcka motsägelsefulla ekvationer?' : 'Kan Oraklet upptäcka rangbrist?',
    question: 'Stämmer modellens rang- och konsistensklassificering med exakt kontroll?',
    method: 'Tre seedade system och tre parade kontroller med ändrat högerled. Modellförslaget låses innan Rankscreen körs med tre primtal. Alla rang- och konsistensresultat kontrolleras oberoende med exakta BigInt-minorer.',
    limitations: 'Syntetiskt metodtest med tre små heltalssystem. Alla ekvationer visas; detta mäter klassificering, inte generalisering till dolda data. Rankscreen är en modulär screening, inget slutligt bevis över rationella tal; den oberoende exakta kontrollen är slutlig auktoritet. Endast sparse-backend i GitHub Actions är integrerad.',
    seed, status: results.every(c => c.passed) ? 'passed' : 'failed', cases: results };
}
