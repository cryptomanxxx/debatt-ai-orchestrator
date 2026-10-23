import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFactSheet, worthWriting, checkArticle, renderArticle, articleMessages, writeDailyArticle, articleIndex,
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
    results: `Labbkörningen godkände 3 av 3 fall [F1]. Förutsägelsen om minst 2 ingrepp stämde [F3]. ${filler('F5')} ${filler('F1')} ${filler('F6')}`,
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
  const emptyRegister = buildFactSheet({ lab: { runs: [] }, memory: { runs: 0, totals: { provisionally_supported: 0, rejected: 0, unresolved: 0 }, deeprap: empty } });
  assert.equal(emptyRegister.facts.length, 1);
  assert.equal(worthWriting(emptyRegister), false, 'an empty register is not a verified result');
  assert.equal(worthWriting(buildFactSheet({ lab: { runs: [{ experimentId: 'x', seed: '1', executionStatus: 'error', cases: 0, passed: 0 }] } })), false, 'nor is a run without cases');
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
  assert.equal(problem({ results: 'Labbkörningen godkände 3 av 3 fall. ' + filler('F1').repeat(3) }), 'uncited_sentence');
  assert.equal(problem({ results: 'Labbkörningen godkände 3 av 3 fall [R1]. ' + filler('F1').repeat(3) }), 'uncited_number', 'a number needs a fact, not only a reference');
  assert.equal(problem({ results: 'Labbkörningen godkände 4 av 3 fall [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number');
  assert.equal(problem({ results: 'Förutsägelsen stämde i 2 fall [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'a number must come from the fact cited in the same sentence');
  assert.equal(problem({ results: 'Den 24 oktober körde labbet [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'no dates');
  assert.equal(problem({ results: 'Labbkörningen sympy-quadratic godkände 3 av 1 fall [F5]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'a number keeps its role: 1 av 3 is not 3 av 1');
  assert.ok(checkArticle(article({ results: 'Labbkörningen sympy-quadratic godkände 1 av 3 fall [F5]. ' + filler('F1').repeat(3) }), sheet).article);
  assert.equal(problem({ results: 'Oraklet resonerar som en människa. Labbkörningen godkände 3 av 3 fall [F1]. ' + filler('F1').repeat(3) }), 'uncited_sentence', 'every sentence cites its basis');
  assert.equal(problem({ results: '- Labbkörningen [F1]. ' + filler('F1').repeat(3) }), 'markup');
  assert.equal(problem({ results: 'Se [länk](https://x) [F1]. ' + filler('F1').repeat(3) }), 'markup');
  assert.equal(problem({ abstract: 'Kort [F1].', background: 'Kort [F1].', method: 'Kort [F1].', results: 'Kort [F1].', limitations: 'Kort [F1].' }), 'invalid_length');
  assert.equal(problem({ title: 'Rubrik med [F1]' }), 'invalid_title');
  assert.equal(problem({ title: 'Labbet godkände 3 av 1 fall' }), 'invalid_title', 'a title cannot cite a fact, so it has no numbers');
  // F2 says s_2 = -3*s_1: dropping the sign changes the mechanism.
  assert.equal(problem({ results: 'Oraklet skrev s_2 = 3*s_1 [F2]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'a sign belongs to its number');
  assert.ok(checkArticle(article({ results: 'Oraklet skrev s_2 = −3*s_1 [F2]. ' + filler('F1').repeat(3) }), sheet).article, 'a typographic minus is the same sign');
  assert.ok(checkArticle(article({ results: 'Det gäller t.ex. syntetiska fall, bl.a. små mekanismer [F1]. ' + filler('F1').repeat(3) }), sheet).article,
    'Swedish abbreviations do not end a sentence');
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
  const hostile = buildFactSheet({ ...day, pipeline: { stages: [{ name: 'initial_evidence', summary: { papers: [{ title: 'T [x](https://evil) **b**', source_url: 'https://example.org/a',
    findings: [{ kind: 'limitation', claim: 'c', quote: '![spårpixel](https://evil.example/p.png) and *emph*' }] }] } }] } });
  const q = hostile.facts.find(f => f.topic === 'literature').id;
  const out = renderArticle(checkArticle(article({ results: 'Oraklet skrev s_2 = -3*s_1 [F2]. ' + filler('F1').repeat(3),
    limitations: `Allt bygger på sammanfattningar [${q}]. ` + filler('F1').repeat(3) }), hostile).article, hostile, { date: 'd', field: 'f', model: 'm' });
  assert.match(out, /- \*\*\[F2\]\*\* .*s\\_2 = -3\\\*s\\_1/, 'Markdown characters in facts are escaped');
  assert.match(out, /Oraklet skrev s\\_2 = -3\\\*s\\_1 \[F2\]\./, 'and in the text, with the citation tags kept');
  assert.doesNotMatch(out, /!\[spårpixel\]\(|\[x\]\(https:\/\/evil\)|\*\*b\*\*/, 'a quote or title cannot inject links, images or emphasis');
});

test('the daily article: one deep call, skipped without verified results, rejected rather than published when a check fails', async () => {
  const calls = [];
  const propose = text => async (messages, options) => { calls.push(options); return { text, provider: 'hip', model: 'glm' }; };
  const published = await writeDailyArticle(day, propose(article()), { field: 'Kausal inferens' });
  assert.deepEqual(calls, [{ deep: true }]);
  assert.equal(published.record.status, 'published');
  assert.equal(published.file, '2026-10-24.md', 'one stable file per date');
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
  const budgets = [];
  const deps = text => ({
    pipeline: async e => { budgets.push(e.PIPELINE_MODEL_BUDGET); return { status: 'completed', stages: day.pipeline.stages }; }, tree: async () => ({ status: 'insufficient_evidence', review_queue: [] }),
    novelty: async () => ({}), register: async () => [], labReports: async () => day.lab, memory: async () => day.memory,
    article: (e, d) => writeDailyArticle(d, async () => ({ text, provider: 'hip', model: 'glm' }), { field: 'Kausal inferens' }) });
  try {
    const published = await main({}, { now: '2026-10-24T09:41:00.000Z', deps: deps(article()) });
    assert.deepEqual(published.errors, []);
    assert.deepEqual([budgets[0], published.model_budget], ['10', 11], 'the pipeline keeps a budget it accepts; the article call comes on top');
    assert.equal(published.article.status, 'published');
    assert.deepEqual(await readdir('ai-bus/artiklar'), ['2026-10-24.md', 'README.md']);
    assert.match(await readFile('ai-bus/artiklar/2026-10-24.md', 'utf8'), /## Faktaunderlag/);
    assert.match(await readFile('ai-bus/artiklar/README.md', 'utf8'), /- 2026-10-24: \[Oraklet hittar sin egen mekanism\]\(2026-10-24\.md\)/);
    assert.match(await readFile('ai-bus/2026-10-24.md', 'utf8'), /- \*\*Dagens artikel:\*\* \[Oraklet hittar sin egen mekanism\]\(artiklar\/2026-10-24\.md\)/);
    const saved = JSON.parse(await readFile('reports/literature-day/day.json', 'utf8'));
    assert.equal(saved.article.file, '2026-10-24.md');
    assert.equal(saved.publication, undefined, 'the article text is not duplicated in day.json');
    await rm('ai-bus', { recursive: true });
    const rejected = await main({}, { now: '2026-10-25T09:41:00.000Z', deps: deps(article({ title: 'Ett genombrott' })) });
    assert.equal(rejected.article.reason, 'overclaim');
    await assert.rejects(readdir('ai-bus/artiklar'));
    assert.match(await readFile('ai-bus/2026-10-25.md', 'utf8'), /Dagens artikel:\*\* ingen i dag \(texten överdrev vad verifieringen visar\)/);
    assert.match(await articleIndex('nowhere'), /Inga artiklar ännu\./);
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});
