import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFactSheet, worthWriting, checkArticle, articleSlug, renderArticle, articleMessages, writeDailyArticle, articleIndex,
  MAX_ARTICLE_REQUEST_CHARS } from '../research/daily-article.mjs';
import { main } from '../research/literature-day.mjs';
import { deepRapScoreboard } from '../research/deeprap.mjs';

const empty = deepRapScoreboard([]);

const design = { equations: ['s_1 = 2*s_0', 's_2 = -3*s_1'], prediction: { identifiable: true, minInterventions: 2 },
  analysis: { identifiable: true, minInterventions: 2, consistentAfterAll: 1 }, predicted: true, reason: 'r',
  investigations: [{ case: 2, decision: 'full', truth: 'full', gate: 'provisionally_supported', baseline: 'full', experiments: 3, passed: true }] };
const day = {
  date: '2026-10-24', field: 'Causal inference',
  lab: { runs: [{ experimentId: 'act-map-design', seed: '7', status: 'passed', executionStatus: 'completed', cases: 3, passed: 3, design },
    { experimentId: 'sympy-quadratic', seed: '11', status: 'failed', executionStatus: 'completed', cases: 3, passed: 1 }] },
  memory: { runs: 12, totals: { provisionally_supported: 14, rejected: 2, unresolved: 4 },
    deeprap: { ...empty, reasoning: { ...empty.reasoning, supportRate: 0.875, supported: 14, rejected: 2, calibration: { cases: 16, meanConfidence: 0.97, passRate: 0.875 } },
      abstraction: { ...empty.abstraction, protocols: [{ protocol: 'act-map-design-v1', label: 'egen mekanism', cases: 2, passed: 2, rate: 1, levels: [{ level: 3, cases: 2, passed: 2 }] }] } } },
  pipeline: { stages: [{ name: 'initial_evidence', summary: { papers: [
    { title: 'Backdoor adjustment in practice', source_url: 'https://example.org/a', findings: [{ kind: 'limitation', claim: 'c', quote: 'Small samples limit power.' }] },
    { title: 'No quotes here', source_url: 'javascript:alert(1)', findings: [{ kind: 'method', claim: 'c' }] }] } }] },
};

// A plain article built only from the sheet: every number sits next to the fact it comes from.
const filler = id => 'Resultatet ska läsas som ett preliminärt stöd inom den syntetiska familjen och gäller bara de testade fallen med deras egna verifierare ' + `[${id}].`;
function article(over = {}) {
  const base = {
    title: 'Oraklet hittar sin egen mekanism',
    abstract: `Oraklet utformade själv en mekanism och förutsade hur den kan identifieras [F3]. ${filler('F3')} ${filler('F4')}`,
    background: `Labbet låter Oraklet skriva egna experiment som deklarativa specifikationer [F3]. ${filler('F3')} ${filler('F3')} ${filler('F5')}`,
    method: `Labbets uppräkning prövade förutsägelsen och evidensgrinden prövade undersökningen [F4]. ${filler('F4')} ${filler('F5')} ${filler('F4')}`,
    results: `Labbkörningen godkände 3 av 3 fall [F1]. Förutsägelsen om minst 2 ingrepp stämde [F4]. ${filler('F5')} ${filler('F1')} ${filler('F6')}`,
    limitations: `Allt är syntetiskt och bygger på små mekanismer; litteraturen bygger på sammanfattningar [R1]. ${filler('F6')} ${filler('F1')} ${filler('F3')}`,
  };
  return JSON.stringify({ ...base, ...over });
}

test('the fact sheet is written by the lab from saved reports, with checked references', () => {
  const sheet = buildFactSheet(day);
  assert.equal(sheet.facts[0].text, 'Labbkörningen act-map-design (seed 7) godkände 3 av 3 fall av experimentets egen oberoende verifierare.');
  assert.ok(sheet.facts.some(f => f.text.includes('s_1 = 2*s_0; s_2 = -3*s_1')));
  assert.ok(sheet.facts.some(f => f.text.includes('förutsägelsen stämde')));
  assert.ok(sheet.facts.some(f => f.text.includes('88 %') && f.text.includes('14 stödda')));
  assert.ok(sheet.facts.some(f => f.text.includes('97 % mot 88 %')));
  assert.deepEqual(sheet.references, [{ id: 'R1', title: 'Backdoor adjustment in practice', url: 'https://example.org/a' }], 'only papers with verified quotes, only https');
  assert.ok(sheet.facts.some(f => f.text.includes('R1') && f.text.includes('Small samples limit power.')));
  assert.equal(worthWriting(sheet), true);
  assert.equal(worthWriting(buildFactSheet({ pipeline: day.pipeline })), false, 'literature alone is not a verified result');
  assert.ok(JSON.stringify(articleMessages(sheet, day.date)).length < MAX_ARTICLE_REQUEST_CHARS);
});

test('an article is published only when every citation, number and wording holds', () => {
  const sheet = buildFactSheet(day);
  const ok = checkArticle(article(), sheet);
  assert.ok(ok.article, JSON.stringify(ok));
  assert.ok(ok.words >= 250 && ok.words <= 900);
  const problem = over => checkArticle(article(over), sheet).problem;
  assert.equal(checkArticle('nej', sheet).problem, 'not_json');
  assert.equal(checkArticle(JSON.stringify({ title: 't' }), sheet).problem, 'invalid_shape');
  assert.equal(problem({ results: 'Detta bevisar att Oraklet kan resonera [F1]. ' + filler('F1').repeat(3) }), 'overclaim');
  assert.equal(problem({ title: 'Ett genombrott för Oraklet' }), 'overclaim');
  assert.equal(problem({ results: 'Labbkörningen godkände 3 av 3 fall [F99]. ' + filler('F1').repeat(3) }), 'unknown_citation');
  assert.equal(problem({ results: 'Labbkörningen godkände 3 av 3 fall. ' + filler('F1').repeat(3) }), 'uncited_number');
  assert.equal(problem({ results: 'Labbkörningen godkände 4 av 3 fall [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number');
  assert.equal(problem({ results: 'Förutsägelsen stämde i 2 fall [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'a number must come from the fact cited in the same sentence');
  assert.equal(problem({ results: 'Den 24 oktober körde labbet [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'no dates');
  assert.equal(problem({ results: '- Labbkörningen [F1]. ' + filler('F1').repeat(3) }), 'markup');
  assert.equal(problem({ results: 'Se [länk](https://x) [F1]. ' + filler('F1').repeat(3) }), 'markup');
  assert.equal(problem({ abstract: 'Kort [F1].', background: 'Kort [F1].', method: 'Kort [F1].', results: 'Kort [F1].', limitations: 'Kort [F1].' }), 'invalid_length');
  assert.equal(problem({ title: 'Rubrik med [F1]' }), 'invalid_title');
});

test('the article is rendered with its fact basis, references and the fixed footer', () => {
  const sheet = buildFactSheet(day);
  const md = renderArticle(checkArticle(article(), sheet).article, sheet, { date: day.date, field: 'Kausal inferens', model: 'hip glm' });
  assert.match(md, /^# Oraklet hittar sin egen mekanism\n\n\*Professor Oraklet, 2026-10-24\. Fält: Kausal inferens\. Modell: hip glm\.\*/);
  for (const h of ['Sammanfattning', 'Bakgrund', 'Metod', 'Resultat', 'Begränsningar', 'Faktaunderlag', 'Referenser']) assert.match(md, new RegExp(`## ${h}\\n`));
  assert.match(md, /- \*\*\[F1\]\*\* Labbkörningen act-map-design \(seed 7\) godkände 3 av 3 fall/);
  assert.doesNotMatch(md, /\[F2\]\*\*/, 'only cited facts are listed');
  assert.match(md, /- \*\*\[R1\]\*\* Backdoor adjustment in practice <https:\/\/example\.org\/a>/);
  assert.match(md, /inte granskad av en människa/);
  assert.equal(articleSlug('Oraklet hittar sin egen mekanism – åäö!'), 'oraklet-hittar-sin-egen-mekanism-aao');
});

test('the daily article: one deep call, skipped without verified results, rejected rather than published when a check fails', async () => {
  const calls = [];
  const propose = text => async (messages, options) => { calls.push(options); return { text, provider: 'hip', model: 'glm' }; };
  const published = await writeDailyArticle(day, propose(article()), { field: 'Kausal inferens' });
  assert.deepEqual(calls, [{ deep: true }]);
  assert.equal(published.record.status, 'published');
  assert.equal(published.file, '2026-10-24-oraklet-hittar-sin-egen-mekanism.md');
  assert.deepEqual(published.record.cited, ['F1', 'F3', 'F4', 'F5', 'F6', 'R1']);
  const rejected = await writeDailyArticle(day, propose(article({ results: 'Detta bevisar allt [F1]. ' + filler('F1').repeat(3) })), { field: 'x' });
  assert.deepEqual([rejected.record.status, rejected.record.reason, rejected.file], ['rejected', 'overclaim', undefined]);
  const skipped = await writeDailyArticle({ date: day.date, pipeline: day.pipeline }, () => assert.fail('no model call'), { field: 'x' });
  assert.deepEqual(skipped.record, { status: 'skipped', reason: 'no_verified_results', facts: 1 });
  const failed = await writeDailyArticle(day, async () => { throw new Error('model_output_truncated'); }, { field: 'x' });
  assert.deepEqual([failed.record.status, failed.record.reason], ['error', 'model_output_truncated']);
});

test('the literature day publishes the article, its index and a link, or says why there is none', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'article-day-')), cwd = process.cwd();
  process.chdir(dir);
  const deps = text => ({
    pipeline: async () => ({ status: 'completed', stages: day.pipeline.stages }), tree: async () => ({ status: 'insufficient_evidence', review_queue: [] }),
    novelty: async () => ({}), register: async () => [], labReports: async () => day.lab, memory: async () => day.memory,
    article: (e, d) => writeDailyArticle(d, async () => ({ text, provider: 'hip', model: 'glm' }), { field: 'Kausal inferens' }) });
  try {
    const published = await main({}, { now: '2026-10-24T09:41:00.000Z', deps: deps(article()) });
    assert.deepEqual(published.errors, []);
    assert.equal(published.article.status, 'published');
    assert.deepEqual(await readdir('ai-bus/artiklar'), ['2026-10-24-oraklet-hittar-sin-egen-mekanism.md', 'README.md']);
    assert.match(await readFile('ai-bus/artiklar/2026-10-24-oraklet-hittar-sin-egen-mekanism.md', 'utf8'), /## Faktaunderlag/);
    assert.match(await readFile('ai-bus/artiklar/README.md', 'utf8'), /- 2026-10-24: \[Oraklet hittar sin egen mekanism\]\(2026-10-24-oraklet-hittar-sin-egen-mekanism\.md\)/);
    assert.match(await readFile('ai-bus/2026-10-24.md', 'utf8'), /- \*\*Dagens artikel:\*\* \[Oraklet hittar sin egen mekanism\]\(artiklar\/2026-10-24-oraklet-hittar-sin-egen-mekanism\.md\)/);
    const saved = JSON.parse(await readFile('reports/literature-day/day.json', 'utf8'));
    assert.equal(saved.article.file, '2026-10-24-oraklet-hittar-sin-egen-mekanism.md');
    assert.equal(saved.publication, undefined, 'the article text is not duplicated in day.json');
    await rm('ai-bus', { recursive: true });
    const rejected = await main({}, { now: '2026-10-25T09:41:00.000Z', deps: deps(article({ title: 'Ett genombrott' })) });
    assert.equal(rejected.article.reason, 'overclaim');
    await assert.rejects(readdir('ai-bus/artiklar'));
    assert.match(await readFile('ai-bus/2026-10-25.md', 'utf8'), /Dagens artikel:\*\* ingen i dag \(texten överdrev vad verifieringen visar\)/);
    assert.match(await articleIndex('nowhere'), /Inga artiklar ännu\./);
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});
