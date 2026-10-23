import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readJson } from './lab-client.mjs';
import { VEM_SCHEMA, REGISTER_LIMIT } from './vem-sci.mjs';

// DeepRAP scoreboard (research/ACT-MAP-LAB.md#deeprap-scoreboard): Oraklet's Deep Reasoning,
// Abstraction and Planning measured from saved, independently verified lab runs only. Every
// figure comes with the number of cases behind it; a rate without enough cases is shown as such.
// Nothing here is a model's own assessment.
export const SCOREBOARD_SCHEMA = 'oraklet-deeprap-scoreboard-v1';
// Tree search v1 (three hypotheses, 4,096 tokens) is kept apart from v2 (two hypotheses, 8,192).
const ACT_MAP_PROTOCOLS = Object.freeze({ 'act-map-oraklet-v1': 'direkt', 'act-map-tree-v1': 'trädsökning v1', 'act-map-tree-v2': 'trädsökning',
  'act-map-budget-v1': 'två ingrepp' });

const round = v => Math.round(v * 1e4) / 1e4;
const rate = (k, n) => n ? round(k / n) : null;
const mean = values => values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;

// rows: {skapad, experimentId, vem, calibration, knowledge} from oraklet_experiment.
export function deepRapScoreboard(rows) {
  const valid = (Array.isArray(rows) ? rows : []).filter(r => r?.vem?.schema === VEM_SCHEMA && Array.isArray(r.vem.claims));
  const claims = valid.flatMap(r => r.vem.claims.filter(c => c && typeof c.status === 'string'));
  const count = status => claims.filter(c => c.status === status).length;
  const supported = count('provisionally_supported'), rejected = count('rejected');

  // Calibration: stated confidence against the verified outcome of the first answer, pooled.
  const scored = valid.flatMap(r => (Array.isArray(r.calibration?.cases) ? r.calibration.cases : [])
    .filter(c => typeof c?.confidence === 'number' && c.confidence >= 0 && c.confidence <= 1 && typeof c.passed === 'boolean'));

  // ACT-MAP cases carry their verified outcome (protocol, level, passed, interventions, baseline).
  const outcomes = claims.map(c => c.outcome).filter(o => o && ACT_MAP_PROTOCOLS[o.protocol] && Number.isInteger(o.level) && typeof o.passed === 'boolean');
  const byProtocol = Object.entries(ACT_MAP_PROTOCOLS).map(([protocol, label]) => {
    const own = outcomes.filter(o => o.protocol === protocol);
    const levels = [...new Set(own.map(o => o.level))].sort().map(level => {
      const at = own.filter(o => o.level === level);
      return { level, cases: at.length, passed: at.filter(o => o.passed).length, rate: rate(at.filter(o => o.passed).length, at.length),
        baselinePassed: at.filter(o => o.baselinePassed).length };
    });
    return { protocol, label, cases: own.length, passed: own.filter(o => o.passed).length, rate: rate(own.filter(o => o.passed).length, own.length), levels };
  }).filter(p => p.cases);

  // Planning in the experiment: interventions Oraklet used against the enumeration baseline, for
  // cases where both decided correctly. Planning across runs: how the daily planner's choices
  // relate to the register (rank 1 = no experiment had a higher learning priority).
  const efficient = outcomes.filter(o => o.passed && o.baselinePassed && Number.isInteger(o.experimentsUsed) && Number.isInteger(o.baselineExperiments));
  // Budget planning: the second intervention, chosen after the first outcome, completes the gate's
  // coverage or not. Only cases where the first left it possible count (see act-map.mjs).
  const budget = outcomes.filter(o => o.protocol === 'act-map-budget-v1');
  const possible = budget.filter(o => o.completable === true);
  const planned = valid.map(r => r.knowledge).filter(k => k && !k.unavailable && Number.isInteger(k.rank) && Number.isInteger(k.of) && k.of > 0);

  return { schema: SCOREBOARD_SCHEMA, runs: valid.length,
    reasoning: { claims: claims.length, supported, rejected, unresolved: count('unresolved'),
      noAnswers: claims.filter(c => c.kind === 'no_answer').length, abstentions: claims.filter(c => c.kind === 'abstention').length,
      supportRate: rate(supported, supported + rejected),
      calibration: { cases: scored.length, meanConfidence: mean(scored.map(c => c.confidence)), passRate: mean(scored.map(c => Number(c.passed))),
        brier: mean(scored.map(c => (c.confidence - Number(c.passed)) ** 2)) } },
    abstraction: { protocols: byProtocol, falseCertifications: outcomes.filter(o => o.falseCertification).length },
    planning: {
      interventions: { cases: efficient.length, oraklet: mean(efficient.map(o => o.experimentsUsed)), baseline: mean(efficient.map(o => o.baselineExperiments)) },
      budget: { cases: budget.length, possible: possible.length, completed: possible.filter(o => o.secondCompletes === true).length,
        rate: rate(possible.filter(o => o.secondCompletes === true).length, possible.length), unreachable: budget.filter(o => o.completable === false).length },
      memory: { runs: planned.length, topPriority: planned.filter(k => k.rank === 1).length,
        meanRelativeRank: mean(planned.map(k => (k.rank - 1) / Math.max(1, k.of - 1))),
        untestedChosen: planned.filter(k => k.claims === null).length } } };
}

const pct = v => v === null ? '–' : `${Math.round(v * 100)} %`;
const fmt = v => v === null ? '–' : String(v);
export function deepRapMarkdown(s, { heading = '#' } = {}) {
  const r = s.reasoning, c = r.calibration, a = s.abstraction, p = s.planning;
  const L = [`${heading} DeepRAP-mått`, '',
    `Från ${s.runs} sparade labbkörningar med VEM-Sci-register (högst ${REGISTER_LIMIT}). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.`, '',
    '| Förmåga | Mått | Värde | Underlag |', '| --- | --- | --- | --- |',
    `| Resonemang | Påståenden som höll vid verifiering | ${pct(r.supportRate)} | ${r.supported} stödda, ${r.rejected} avvisade |`,
    `| Resonemang | Olösta (avstått / utan svar) | ${r.unresolved} (${r.abstentions} / ${r.noAnswers}) | ${r.claims} påståenden |`,
    `| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | ${pct(c.meanConfidence)} mot ${pct(c.passRate)} (${fmt(c.brier)}) | ${c.cases} fall |`];
  for (const pr of a.protocols)
    L.push(`| Abstraktion | ACT-MAP ${pr.label}: rätt beslut | ${pct(pr.rate)} | ${pr.passed} av ${pr.cases}; per nivå ${pr.levels.map(l => `${l.level}: ${l.passed}/${l.cases}`).join(', ')} |`);
  if (!a.protocols.length) L.push('| Abstraktion | ACT-MAP: rätt beslut | – | inga ACT-MAP-fall med utfall ännu |');
  L.push(`| Abstraktion | Felaktigt godkända överföringar | ${a.falseCertifications} | alla ACT-MAP-fall |`,
    `| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | ${fmt(p.interventions.oraklet)} mot ${fmt(p.interventions.baseline)} | ${p.interventions.cases} fall där båda hade rätt |`,
    `| Planering | Två ingrepp: det andra fullbordade täckningen | ${pct(p.budget.rate)} | ${p.budget.completed} av ${p.budget.possible} fall där det var möjligt${p.budget.unreachable ? `; ${p.budget.unreachable} där första ingreppet satte s_2` : ''} |`,
    `| Planering | Planeringen valde högsta lärprioritet | ${p.memory.runs ? `${p.memory.topPriority} av ${p.memory.runs}` : '–'} | körningar planerade med minnet${p.memory.runs ? `; relativ placering i snitt ${fmt(p.memory.meanRelativeRank)} (0 = högst), ${p.memory.untestedChosen} val av obeprövat experiment` : ''} |`, '');
  return L.join('\n');
}

const DB = 'https://fmwxftnistkoqazfwnuj.supabase.co/rest/v1/oraklet_experiment';
// The register plus what the scoreboard needs: each run's calibration and its plan's register choice.
export async function readDeepRapRows(serviceKey, fetchImpl = fetch) {
  const select = 'skapad,experimentId:rapport->>experimentId,vem:rapport->vem,calibration:rapport->calibration,knowledge:rapport->plan->knowledge';
  const response = await fetchImpl(`${DB}?select=${select}&rapport->vem=not.is.null&order=skapad.desc&limit=${REGISTER_LIMIT}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('deeprap_rows_unavailable'); }
  const rows = await readJson(response, 8_000_000);
  if (!Array.isArray(rows)) throw new Error('deeprap_rows_unavailable');
  return rows;
}

// CLI: after a lab run, write the scoreboard to the artifact and the step summary; never fails the run.
export async function main(env = process.env, fetchImpl = fetch) {
  const directory = 'reports/oraklet-lab';
  await mkdir(directory, { recursive: true });
  let markdown;
  try {
    const score = deepRapScoreboard(await readDeepRapRows(env.SUPABASE_SERVICE_ROLE_KEY || '', fetchImpl));
    await writeFile(`${directory}/deeprap.json`, JSON.stringify(score, null, 2));
    markdown = deepRapMarkdown(score);
  } catch {
    markdown = '# DeepRAP-mått\n\nMåtten kunde inte läsas den här gången.\n';
  }
  await writeFile(`${directory}/deeprap.md`, markdown);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, '\n' + markdown);
  console.log(markdown);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
