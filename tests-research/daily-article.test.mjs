import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFactSheet, worthWriting, checkArticle, renderArticle, articleMessages, writeDailyArticle, articleIndex,
  MAX_ARTICLE_REQUEST_CHARS } from '../research/daily-article.mjs';
import { main, renderAiBus } from '../research/literature-day.mjs';
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
  const crowded = buildFactSheet({ ...day, lab: { runs: Array.from({ length: 14 }, (_, i) => ({ experimentId: 'act-map-design', seed: String(i), executionStatus: 'error', cases: 0, passed: 0,
    design: { equations: ['s_1 = 2*s_0'], prediction: { identifiable: true, minInterventions: 2 }, investigations: [] } })) } });
  assert.equal(crowded.facts.length, 40);
  assert.ok(worthWriting(crowded), 'unverified entries cannot crowd out a verified result');
  assert.deepEqual(crowded.facts.map(f => f.id), crowded.facts.map((_, i) => `F${i + 1}`));
});

test('an article is published only when every citation, number and wording holds', () => {
  const sheet = buildFactSheet(day);
  const ok = checkArticle(article(), sheet);
  assert.ok(ok.article, JSON.stringify(ok));
  assert.ok(ok.words >= 250 && ok.words <= 900);
  const problem = over => checkArticle(article(over), sheet).problem;
  assert.equal(checkArticle('nej', sheet).problem, 'not_json');
  assert.equal(checkArticle(JSON.stringify({ title: 't' }), sheet).problem, 'invalid_shape');
  assert.equal(ok.article.title, 'En mekanism som Oraklet utformade själv', 'the lab writes the title from the first verified fact cited');
  assert.equal(checkArticle(article({ title: 'Ett fall godkändes, en upptäckt' }), sheet).article.title, 'En mekanism som Oraklet utformade själv', 'a title the model sends is ignored');
  const literatureOnly = id => ({ abstract: `Litteraturen tar upp små urval [${id}]. ${filler(id)} ${filler(id)}`, background: `Bakgrund [${id}]. ${filler(id)} ${filler(id)} ${filler(id)}`,
    method: `Metod [${id}]. ${filler(id)} ${filler(id)} ${filler(id)}`, results: `Resultat [${id}]. ${filler(id)} ${filler(id)} ${filler(id)}`, limitations: `Allt bygger på sammanfattningar [${id}]. ${filler(id)} ${filler(id)} ${filler(id)}` });
  const unverified = sheet.facts.find(f => f.topic === 'literature').id;
  assert.equal(problem(literatureOnly(unverified)), 'no_verified_fact_cited', 'the article must cite a verified result, not only literature');
  assert.ok(checkArticle(article({ results: 'Metoden omfattar flera steg osv. [F1]. ' + filler('F1').repeat(3) }), sheet).article, 'a citation after a sentence-final abbreviation belongs to that sentence');
  assert.equal(problem({ results: 'Detta bevisar att Oraklet kan resonera [F1]. ' + filler('F1').repeat(3) }), 'overclaim');
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
  // F2 says s_2 = -3*s_1: dropping the sign changes the mechanism.
  assert.equal(problem({ results: 'Oraklet skrev s_2 = 3*s_1 [F2]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'a sign belongs to its number');
  assert.ok(checkArticle(article({ results: 'Oraklet skrev s_2 = −3*s_1 [F2]. ' + filler('F1').repeat(3) }), sheet).article, 'a typographic minus is the same sign');
  const calibration = sheet.facts.find(f => f.text.includes('97 % mot 88 %')).id;
  assert.equal(problem({ results: `Säkerheten var 88 % mot 97 % rätt svar [${calibration}]. ` + filler('F1').repeat(3) }), 'unsupported_number', 'numbers from one fact keep its order');
  assert.ok(checkArticle(article({ results: `Säkerheten var 97 % mot 88 % rätt svar [${calibration}]. ` + filler('F1').repeat(3) }), sheet).article);
  assert.equal(problem({ results: `Säkerheten var 97 % och sedan 97 % mot 88 % rätt svar [${calibration}]. ` + filler('F1').repeat(3) }), 'unsupported_number', 'a fact supplies each number once');
  assert.equal(problem({ abstract: 'Ett påstående utan hänvisning', background: `Labbet låter Oraklet skriva egna experiment [F3]. ${filler('F3')} ${filler('F3')} ${filler('F5')}` }), 'uncited_sentence', 'a section cannot borrow the next section\'s citation');
  assert.equal(problem({ results: 'Resultatet var 7 [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'a bare number cannot borrow the seed');
  assert.equal(problem({ results: 'Labbkörningen godkände 3 av 3 fall och ytterligare 3 fall [F1] [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'citing a fact twice does not supply its numbers twice');
  assert.equal(problem({ results: 'Resultaten gäller små fall osv. Labbkörningen godkände 3 av 3 fall [F1]. ' + filler('F1').repeat(3) }), 'uncited_sentence', 'an abbreviation can still end a sentence');
  assert.equal(problem({ results: 'Detta är en upptäckt [F1]. ' + filler('F1').repeat(3) }), 'overclaim');
  assert.equal(problem({ results: 'Labbkörningen godkände \uFF13 av \uFF13 fall [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'nor unchecked numerals in the text');
  assert.equal(problem({ results: 'Labbkörningen godkände tre av tre fall [F1]. ' + filler('F1').repeat(3) }), 'unsupported_number', 'nor in the text');
  assert.equal(problem({ results: 'Oraklet sade "resultatet gäller." Labbkörningen godkände 3 av 3 fall [F1]. ' + filler('F1').repeat(3) }), 'uncited_sentence', 'a closing quote does not hide a sentence end');
  assert.equal(problem({ results: 'Oraklet skrev (se labbet.) Labbkörningen godkände 3 av 3 fall [F1]. ' + filler('F1').repeat(3) }), 'uncited_sentence');
  assert.equal(problem({ results: 'Oraklet sade "det gäller osv." Labbkörningen godkände 3 av 3 fall [F1]. ' + filler('F1').repeat(3) }), 'uncited_sentence', 'an abbreviation before a closing quote can end a sentence');
  assert.equal(problem({ results: '+ Labbkörningen [F1]. ' + filler('F1').repeat(3) }), 'markup');
  assert.equal(problem({ results: '1. Labbkörningen [F1]. ' + filler('F1').repeat(3) }), 'markup');
  assert.equal(problem({ results: 'Detta är en bekräftelse [F1]. ' + filler('F1').repeat(3) }), 'overclaim');
  const many = buildFactSheet({ ...day, lab: { runs: Array.from({ length: 12 }, (_, i) => ({ experimentId: 'x', seed: String(i), status: 'passed', executionStatus: 'completed', cases: 3, passed: 3 })) } });
  const cites = many.facts.filter(f => f.topic === 'lab').map(f => `[${f.id}]`).join(' ');
  const started = Date.now();
  assert.equal(checkArticle(article({ results: `Labbet godkände ${'3 av 3 fall, '.repeat(6)}och 999 fall ${cites}. ` + filler('F1').repeat(3) }), many).problem, 'unsupported_number');
  assert.ok(Date.now() - started < 500, 'the number check is linear, not an exhaustive search');
  for (const ok of ['Allt är syntetiskt och ingen ny vetenskaplig upptäckt görs [F1].', 'Resultatet är inte bekräftat av någon granskare [F1].', 'Inga bevis utöver fallen finns här [F1].', 'Det är inte heller bekräftat [F1].', 'Det ger därför ingen empirisk bekräftelse av siffrorna [F1].', 'AI-ramverk för hypotesgenererande kausal upptäckt har föreslagits [F1].', 'Inom kausal upptäckt finns flera metoder [F1].', 'Detta är ingen egentlig upptäckt [F1].', 'Det indikerar hög tillförlitlighet men utan experimentell bekräftelse [F1].', 'Resultatet står utan bevis [F1].', 'Metoden bygger på AI-frameworks för hypotesgenererande kausal upptäckt [F1].', 'Detta är inte klart [F1]. Det står utan bekräftelse [F1].'])
    assert.ok(checkArticle(article({ limitations: ok + ' ' + filler('F1').repeat(3) }), sheet).article, `a direct negation states the opposite: ${ok}`);
  for (const claim of ['Detta är inte bara ett genombrott [F1].', 'Det är inget annat än en upptäckt [F1].', 'Det råder ingen tvekan om att detta bevisar allt [F1].', 'Ingen kan förneka genombrottet [F1].', 'Ingen forskare ifrågasätter genombrottet [F1].', 'Ingen förnekar upptäckten [F1].', 'Ingen studie bekräftade resultatet [F1].', 'Inga nya data motsäger beviset [F1].', 'Resultatet bekräftar modellen [F1].', 'Oraklet gjorde en kausal upptäckt [F1].', 'Det är inget mindre än ett genombrott [F1].', 'Det finns ingen tvekan att detta bevisar allt [F1].', 'Resultatet är inte empiriskt och bevisar inget [F1].', 'Oberoende verifiering bekräftade 94 % av påståendena [F1].', 'Metoden gav en kausal upptäckt [F1].', 'Oraklet får beröm för sin kausala upptäckt [F1].', 'Ramverket för sin kausal upptäckt fick pris [F1].', 'Inom kausal upptäckten finns ett genombrott [F1].', 'Det är en kausalt viktig upptäckt [F1].', 'Detta är inte ett preliminärt resultat utan ett genombrott [F1].', 'Detta är inte resultat utan genombrott [F1].', 'Det är inte ett resultat utan en bekräftelse [F1].', 'Ingen tvivlar, utan bevis finns [F1].', 'Utan tvekan bevisar det allt [F1].', 'Det är varken preliminärt utan bevis [F1].', 'Detta är inte ett resultat av t.ex. slumpen utan ett genombrott [F1].', 'Detta är inte ett resultat\nutan ett genombrott [F1].', 'Detta är inte ett resultat, se kap. tre, utan ett bevis [F1].', 'Resultatet är inte utan bevis [F1].', 'Utan tvekan ett genombrott [F1].', 'Resultatet är inte preliminärt och bevisar hypotesen [F1].', 'Detta är inte längre en hypotes, det bevisar [F1].'])
    assert.equal(problem({ limitations: claim + ' ' + filler('F1').repeat(3) }), 'overclaim', `a claim stays refused: ${claim}`);
  const labelled = buildFactSheet({ ...day, memory: { ...day.memory, deeprap: { ...day.memory.deeprap, abstraction: { ...day.memory.deeprap.abstraction,
    protocols: [...day.memory.deeprap.abstraction.protocols, { protocol: 'act-map-budget-v1', label: 'två ingrepp', cases: 2, passed: 2, rate: 1 }] } } } });
  const budgetFact = labelled.facts.find(f => f.text.includes('två ingrepp')).id;
  assert.ok(checkArticle(article({ results: `Två\u2011ingrepps\u2011varianten gav rätt beslut i 2 av 2 fall [${budgetFact}]. ` + filler('F1').repeat(3) }), labelled).article,
    'a number word the cited fact uses itself, as in a label, passes');
  const spelled = checkArticle(article({ results: `Två\u2011ingrepps\u2011varianten gav rätt beslut i 2 av 2 fall [F1]. ` + filler('F1').repeat(3) }), labelled);
  assert.deepEqual([spelled.problem, spelled.number], ['unsupported_number', '"två" (skriv talet med siffror)'], 'elsewhere it is refused, and the rewrite is told the word and the sentence');
  assert.match(spelled.sentence, /Två.ingrepps.varianten/);
  for (const link of ['https://evil.example/path', 'www.evil.example', 'ftp://x.y', 'oraklet@evil.example'])
    assert.equal(problem({ results: `Se ${link} [F1]. ` + filler('F1').repeat(3) }), 'markup', `no autolinked ${link}`);
  assert.ok(checkArticle(article({ results: 'Det gäller t.ex. syntetiska fall, bl.a. små mekanismer [F1]. ' + filler('F1').repeat(3) }), sheet).article,
    'Swedish abbreviations do not end a sentence');
});

test('the article is rendered with its fact basis, references and the fixed footer', () => {
  const sheet = buildFactSheet(day);
  const md = renderArticle(checkArticle(article(), sheet).article, sheet, { date: day.date, field: 'Kausal inferens', model: 'hip glm' });
  assert.match(md, /^# En mekanism som Oraklet utformade själv\n\n\*Professor Oraklet, 2026-10-24\. Fält: Kausal inferens\. Modell: hip glm\.\*/);
  for (const h of ['Sammanfattning', 'Bakgrund', 'Metod', 'Resultat', 'Begränsningar', 'Faktaunderlag', 'Referenser']) assert.match(md, new RegExp(`## ${h}\\n`));
  assert.match(md, /- \*\*\[F1\]\*\* Labbkörningen act-map-design \(seed 7\) godkände 3 av 3 fall/);
  assert.doesNotMatch(md, /\[F2\]\*\*/, 'only cited facts are listed');
  assert.match(md, /- \*\*\[R1\]\*\* Backdoor adjustment in practice <https:\/\/example\.org\/a>/);
  assert.match(md, /inte granskad av en människa/);
  const hostile = buildFactSheet({ ...day, pipeline: { stages: [{ name: 'initial_evidence', summary: { papers: [{ title: 'T [x](https://evil) **b**', source_url: 'https://example.org/a',
    findings: [{ kind: 'limitation', claim: 'c', quote: '![spårpixel](https://evil.example/p.png) and *emph*, see www.evil.example or x@evil.example' }] }] } }] } });
  const q = hostile.facts.find(f => f.topic === 'literature').id;
  const out = renderArticle(checkArticle(article({ results: 'Oraklet skrev s_2 = -3*s_1 [F2]. ' + filler('F1').repeat(3),
    limitations: `Allt bygger på sammanfattningar [${q}]. ` + filler('F1').repeat(3) }), hostile).article, hostile, { date: 'd', field: 'f', model: 'm' });
  assert.match(out, /- \*\*\[F2\]\*\* .*s\\_2 = -3\\\*s\\_1/, 'Markdown characters in facts are escaped');
  assert.match(out, /Oraklet skrev s\\_2 = -3\\\*s\\_1 \[F2\]\./, 'and in the text, with the citation tags kept');
  assert.doesNotMatch(out, /!\[spårpixel\]\(|\[x\]\(https:\/\/evil\)|\*\*b\*\*/, 'a quote or title cannot inject links, images or emphasis');
  assert.match(out, /## Referenser\n\n- \*\*\[R1\]\*\* T /, 'a cited literature fact brings its paper, even without an [R#] in the text');
  assert.doesNotMatch(out.replace(/<https:\/\/example\.org\/a>/, ''), /https:\/\/|www\.|\w@/, 'nor GitHub autolinks; only the checked reference URL is a link');
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
  const { ResearchError } = await import('../research/errors.mjs');
  const limited = await writeDailyArticle(day, async () => { throw new ResearchError('model_upstream_http_error', { httpStatus: 502, upstreamStatus: 429, provider: 'hip', model: 'GLM-5.2' }); }, { field: 'x' });
  assert.deepEqual([limited.record.reason, limited.record.upstreamStatus, limited.record.provider, limited.record.model], ['model_upstream_http_error', 429, 'hip', 'GLM-5.2'], 'a failed call names its model and status');
  assert.match(renderAiBus({ date: day.date, field: 'x', model_budget: 13, pipeline: {}, article: limited.record }), /ingen i dag \(model\\_upstream\\_http\\_error, hip\/GLM-5\.2 svarade HTTP 429\)/);
  const failed = await writeDailyArticle(day, async () => { throw new Error('model_output_truncated'); }, { field: 'x' });
  assert.deepEqual([failed.record.status, failed.record.reason, failed.record.calls], ['error', 'model_output_truncated', 1]);
});

test('a rejected draft gets up to two rewrites, each told what it broke; the drafts go to the artifact, not the record', async () => {
  const sent = [];
  const answers = texts => async messages => { sent.push(messages[0].content); return { text: texts.shift(), provider: 'hip', model: 'glm' }; };
  const claim = article({ limitations: 'Resultatet bekräftar inget utöver fallen, enligt någon granskare [F1]. ' + filler('F1').repeat(3) });
  const wrongNumber = article({ results: 'Labbkörningen godkände 4 av 3 fall [F1]. ' + filler('F1').repeat(3) });
  const rewritten = await writeDailyArticle(day, answers([claim, article()]), { field: 'x' });
  assert.equal(rewritten.record.status, 'published');
  assert.deepEqual([rewritten.record.calls, rewritten.record.earlier], [2, [{ reason: 'overclaim', term: 'bekräftar' }]]);
  assert.doesNotMatch(sent[0], /förra utkast/);
  assert.match(sent[0], /får bara stå direkt nekade/, 'the prompt names the words and the one exception');
  assert.match(sent[1], /Ditt förra utkast avvisades av labbet: texten överdrev vad verifieringen visar \(ordet "bekräftar"\)\. Ta bort ordet helt, även i nekad form, och skriv till exempel "overifierat"[^.]*\. Skriv om hela artikeln/);
  assert.deepEqual(rewritten.drafts.map(d => [d.attempt, d.reason, d.term]), [[1, 'overclaim', 'bekräftar']]);
  assert.match(rewritten.drafts[0].text, /granskare/, 'the rejected draft is kept whole for the artifact');
  sent.length = 0;
  const third = await writeDailyArticle(day, answers([claim, wrongNumber, article()]), { field: 'x' });
  assert.equal(third.record.status, 'published', 'a second rewrite can still publish');
  assert.equal(third.record.calls, 3);
  assert.match(sent[2], /en siffra fanns inte i det hänvisade underlaget \(siffran 4 av\)\. Meningen som avvisades: "Labbkörningen godkände 4 av 3 fall \[F1\]\."/,
    'the rewrite is told the number and the sentence it must mend');
  sent.length = 0;
  const rejected = await writeDailyArticle(day, answers([claim, wrongNumber, wrongNumber]), { field: 'x' });
  assert.deepEqual(rejected.record, { status: 'rejected', reason: 'unsupported_number', facts: rejected.record.facts, model: 'glm', calls: 3,
    earlier: [{ reason: 'overclaim', term: 'bekräftar' }, { reason: 'unsupported_number' }] });
  assert.equal(sent.length, 3, 'never a fourth call');
  const short = checkArticle(article({ abstract: 'Kort [F3].', background: 'Kort [F3].', method: 'Kort [F4].', results: 'Kort [F1].', limitations: 'Kort [F1].' }), buildFactSheet(day));
  assert.deepEqual([short.problem, short.number], ['invalid_length', '10 ord; skriv 300–700'], 'the rewrite is told the length it wrote');
  assert.equal(rejected.drafts.length, 3);
  assert.doesNotMatch(JSON.stringify(rejected.record), /Labbkörningen|granskare/, 'no model text in the record that reaches ai-bus');
  const md = renderAiBus({ date: day.date, field: 'Causal inference', model_budget: 13, pipeline: {}, article: rejected.record });
  assert.match(md, /Dagens artikel:\*\* ingen i dag \(en siffra fanns inte i det hänvisade underlaget; tidigare utkast avvisades: texten överdrev vad verifieringen visar, ordet "bekräftar"; en siffra fanns inte i det hänvisade underlaget\)/);
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
    assert.deepEqual([budgets[0], published.model_budget], ['10', 13], 'the pipeline keeps a budget it accepts; the article\'s three calls come on top');
    assert.equal(published.article.status, 'published');
    assert.deepEqual(await readdir('ai-bus/artiklar'), ['2026-10-24.md', 'README.md']);
    assert.match(await readFile('ai-bus/artiklar/2026-10-24.md', 'utf8'), /## Faktaunderlag/);
    assert.match(await readFile('ai-bus/artiklar/README.md', 'utf8'), /- 2026-10-24: \[En mekanism som Oraklet utformade själv\]\(2026-10-24\.md\)/);
    assert.match(await readFile('ai-bus/rapporter/2026-10-24.md', 'utf8'), /- \*\*Dagens artikel:\*\* \[En mekanism som Oraklet utformade själv\]\(\.\.\/artiklar\/2026-10-24\.md\)/);
    assert.match(await readFile('ai-bus/senaste.md', 'utf8'), /- \*\*Dagens artikel:\*\* \[En mekanism som Oraklet utformade själv\]\(artiklar\/2026-10-24\.md\)/, 'each copy links from where it sits');
    const saved = JSON.parse(await readFile('reports/literature-day/day.json', 'utf8'));
    assert.equal(saved.article.file, '2026-10-24.md');
    assert.equal(saved.publication, undefined, 'the article text is not duplicated in day.json');
    const rerun = await main({}, { now: '2026-10-24T15:00:00.000Z', deps: deps(article({ results: 'Detta är ett genombrott [F1]. ' + filler('F1').repeat(3) })) });
    assert.equal(rerun.article.status, 'rejected');
    assert.deepEqual(await readdir('ai-bus/artiklar'), ['README.md'], 'a rerun the same day without an article withdraws the earlier one');
    assert.match(await readFile('ai-bus/artiklar/README.md', 'utf8'), /Inga artiklar ännu\./);
    await rm('ai-bus', { recursive: true });
    const rejected = await main({}, { now: '2026-10-25T09:41:00.000Z', deps: deps(article({ results: 'Detta är ett genombrott [F1]. ' + filler('F1').repeat(3) })) });
    assert.equal(rejected.article.reason, 'overclaim');
    await assert.rejects(readdir('ai-bus/artiklar'));
    assert.match(await readFile('ai-bus/rapporter/2026-10-25.md', 'utf8'), /Dagens artikel:\*\* ingen i dag \(texten överdrev vad verifieringen visar, ordet "genombrott"; tidigare utkast avvisades/);
    const drafts = JSON.parse(await readFile('reports/literature-day/article-drafts.json', 'utf8'));
    assert.deepEqual(drafts.map(d => d.reason), ['overclaim', 'overclaim', 'overclaim'], 'the rejected drafts are kept for the artifact');
    assert.doesNotMatch(await readFile('reports/literature-day/day.json', 'utf8'), /Detta är ett genombrott/, 'not in day.json');
    assert.match(await articleIndex('nowhere'), /Inga artiklar ännu\./);
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});

test('the publish step rebuilds both indexes from the files on the latest main', async () => {
  const { writeAiBusIndexes } = await import('../research/ai-bus-index.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'ai-bus-index-'));
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(dir, 'rapporter')); await mkdir(join(dir, 'artiklar'));
    for (const d of ['2026-10-24', '2026-10-25']) await writeFile(join(dir, 'rapporter', `${d}.md`), `# Dag ${d}\n`);
    await writeFile(join(dir, 'artiklar', '2026-10-25.md'), '# En artikel\n');
    await writeAiBusIndexes(dir);
    assert.match(await readFile(join(dir, 'rapporter/README.md'), 'utf8'), /- \[2026-10-25\]\(2026-10-25\.md\)\n- \[2026-10-24\]\(2026-10-24\.md\)/, 'a report that reached main during the run stays listed');
    assert.match(await readFile(join(dir, 'artiklar/README.md'), 'utf8'), /- 2026-10-25: \[En artikel\]\(2026-10-25\.md\)/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
