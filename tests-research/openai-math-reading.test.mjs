import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, familiesForDate, readingMessages, checkReading, readOpenAiMath, READING_FAMILIES, READING_MODEL_CALLS }
  from '../research/openai-math-reading.mjs';
import { runLiteratureDay, renderAiBus, DAILY_MODEL_BUDGET } from '../research/literature-day.mjs';
import { ARTICLE_MODEL_CALLS } from '../research/daily-article.mjs';

const catalog = await loadCatalog();
const note = (f, extra = {}) => ({ nr: f.nr, citat: f.sammanfattning.slice(0, 60), metod: 'En metod', oppen_fraga: 'En öppen fråga?', labbforslag: 'inget', ...extra });

test('the catalog holds all 373 families, each with a summary and a source pinned to the commit', () => {
  assert.equal(catalog.familjer.length, 373);
  assert.ok(catalog.familjer.every(f => f.sammanfattning.length >= 40 && f.kalla.every(u => u.startsWith(`https://github.com/openai/math/tree/${catalog.commit}/`))));
  assert.equal(new Set(catalog.familjer.map(f => f.nr)).size, 373);
});

test('three families a day in catalog order, so consecutive days continue and the whole catalog is read', () => {
  const a = familiesForDate('2026-11-05', catalog.familjer), b = familiesForDate('2026-11-06', catalog.familjer);
  assert.equal(a.families.length, READING_FAMILIES);
  assert.deepEqual([a.position, a.round, a.families.map(f => f.nr)], [0, 1, ['001', '002', '003']], 'the first day starts the catalog');
  assert.deepEqual([familiesForDate('2026-11-04', catalog.familjer).position, familiesForDate('2026-11-04', catalog.familjer).round], [370, 0]);
  assert.equal(familiesForDate('2027-03-11', catalog.familjer).round, 2, 'the second round starts after 125 days');
  assert.equal(b.position, (a.position + 3) % 373);
  assert.equal(catalog.familjer.indexOf(b.families[0]), (catalog.familjer.indexOf(a.families[2]) + 1) % 373);
  const seen = new Set();
  for (let d = 0; d < 125; d++) for (const f of familiesForDate(new Date(Date.UTC(2026, 10, 5) + d * 86_400_000).toISOString().slice(0, 10), catalog.familjer).families) seen.add(f.nr);
  assert.equal(seen.size, 373, 'every family within 125 days');
  for (const bad of ['2026-13-01', '05-11-2026', '', null]) assert.throws(() => familiesForDate(bad, catalog.familjer));
});

test('the request carries the summaries and fits the query limit', () => {
  const { families } = familiesForDate('2026-11-05', catalog.familjer);
  const m = readingMessages(families, '2026-11-05');
  assert.ok(families.every(f => m[1].content.includes(JSON.stringify(f.sammanfattning).slice(1, 40))));
  // The longest three summaries still fit /v1/query.
  const longest = [...catalog.familjer].sort((x, y) => y.sammanfattning.length - x.sammanfattning.length).slice(0, 3);
  assert.ok(JSON.stringify(readingMessages(longest, '2026-11-05')).length < 7400);
});

test('each note is checked on its own: a quote must occur word for word in that family\'s summary', () => {
  const [f1, f2, f3] = catalog.familjer.slice(0, 3);
  const r = checkReading(JSON.stringify({ familjer: [note(f1), note(f2, { citat: 'Proves that every conjecture is now settled for good.' }), note(f3, { metod: 'se https://example.org' })] }), [f1, f2, f3]);
  assert.deepEqual(r.notes.map(n => n.nr), [f1.nr]);
  assert.deepEqual(r.rejected, [{ nr: f2.nr, reason: 'quote_not_in_summary' }, { nr: f3.nr, reason: 'link' }]);
  // Whitespace inside the quote may differ; the words may not.
  const spaced = f1.sammanfattning.slice(0, 50).replace(/ /g, '  ');
  assert.equal(checkReading(JSON.stringify({ familjer: [note(f1, { citat: spaced })] }), [f1]).notes.length, 1);
  assert.deepEqual(checkReading(JSON.stringify({ familjer: [note(f1, { citat: 'kort' })] }), [f1]).rejected, [{ nr: f1.nr, reason: 'quote_length' }]);
  assert.deepEqual(checkReading(JSON.stringify({ familjer: [note(f1), note(f1)] }), [f1]).rejected, [{ nr: f1.nr, reason: 'duplicate_family' }]);
  assert.deepEqual(checkReading(JSON.stringify({ familjer: [] }), [f1]).rejected, [{ nr: f1.nr, reason: 'missing_family' }]);
  assert.deepEqual(checkReading(JSON.stringify({ familjer: [{ ...note(f1), extra: 'x' }] }), [f1]).rejected, [{ nr: f1.nr, reason: 'invalid_shape' }]);
  assert.deepEqual(checkReading(JSON.stringify({ familjer: [note(f1, { oppen_fraga: 'x'.repeat(301) })] }), [f1]).rejected, [{ nr: f1.nr, reason: 'text_length' }]);
  assert.equal(checkReading('inte json', [f1]).problem, 'not_json');
  assert.equal(checkReading('```json\n{"familjer":[]}\n```', [f1]).rejected.length, 1, 'a fenced answer is read');
});

test('one call; the record keeps the accepted notes, the rejected reasons and the model, never more calls', async () => {
  const { families } = familiesForDate('2026-11-05', catalog.familjer);
  let calls = 0, waited = 0;
  const propose = async () => { calls++; return { text: JSON.stringify({ familjer: families.map(f => note(f)) }), provider: 'hip', model: 'm' }; };
  const r = await readOpenAiMath('2026-11-05', propose, { catalog, before: async () => { waited++; } });
  assert.equal(calls, READING_MODEL_CALLS); assert.equal(waited, 1);
  assert.equal(r.status, 'read'); assert.equal(r.notes.length, 3); assert.equal(r.calls, 1);
  assert.deepEqual([r.provider, r.model, r.total], ['hip', 'm', 373]);
  assert.ok(r.families.every(f => f.url.startsWith('https://github.com/openai/math/tree/')));
  const failed = await readOpenAiMath('2026-11-05', async () => { throw Object.assign(Error('model_rate_limited'), { diagnostic: { upstreamStatus: 429, provider: 'hip', model: 'm' } }); }, { catalog });
  assert.deepEqual([failed.status, failed.reason, failed.upstreamStatus, failed.calls], ['error', 'model_rate_limited', 429, 1]);
  const none = await readOpenAiMath('2026-11-05', async () => ({ text: '{"familjer":[]}', provider: 'hip', model: 'm' }), { catalog });
  assert.deepEqual([none.status, none.reason, none.rejected.length], ['rejected', 'all_notes_rejected', 3]);
});

test('the day budgets the reading call, records a failure without stopping and reports the reading in ai-bus', async () => {
  const deps = { pipeline: async () => ({ status: 'completed', stages: [], budget: { known_model_calls: 10 } }), tree: async () => ({}), novelty: async () => ({}),
    register: async () => [], labReports: async () => ({ runs: [] }), memory: async () => ({ experiments: [] }),
    article: async () => ({ record: { status: 'skipped', reason: 'no_verified_results', facts: 0 } }) };
  const { families } = familiesForDate('2026-11-05', catalog.familjer);
  const day = await runLiteratureDay({}, { date: '2026-11-05', ...deps,
    openaiMath: (e, d) => readOpenAiMath(d.date, async () => ({ text: JSON.stringify({ familjer: [note(families[0], { metod: 'Använder <b>| `kod`' }), note(families[1], { citat: 'Detta står inte i sammanfattningen alls.' })] }), provider: 'hip', model: 'm' }), { catalog }) });
  assert.equal(day.model_budget, DAILY_MODEL_BUDGET + ARTICLE_MODEL_CALLS + READING_MODEL_CALLS);
  assert.deepEqual(day.errors, []);
  const dated = renderAiBus(day, { articles: '../artiklar/' }), latest = renderAiBus(day);
  assert.match(latest, /Modellanrop: 11 av 14\./);
  assert.match(latest, new RegExp(`- \\*\\*OpenAI:s matematiksamling:\\*\\* familj ${families.map(f => f.nr).join(', ')} \\(plats \\d+ av 373, varv \\d+\\); 1 av 3 läsningar godkända`));
  assert.match(latest, /## OpenAI:s matematiksamling[\s\S]*\(https:\/\/github\.com\/cryptomanxxx\/debatt-ai-orchestrator\/blob\/main\/research\/openai-math\/katalog\.json\)/);
  assert.equal(dated, latest, 'without an article the dated report and senaste.md stay the same');
  assert.match(latest, /- \*\*Metod:\*\* Använder &lt;b&gt;\\\| \\`kod\\`/, 'model text is inert');
  assert.match(latest, new RegExp(`- Familj ${families[1].nr}: läsningen avvisades \\(citatet fanns inte ordagrant i sammanfattningen\\)\\.`));
  assert.match(latest, new RegExp(`- Familj ${families[2].nr}: läsningen avvisades \\(familjen saknades i svaret\\)\\.`));
  const broken = await runLiteratureDay({}, { date: '2026-11-05', ...deps, openaiMath: async () => { throw Error('invalid_openai_math_catalog'); } });
  assert.deepEqual(broken.errors, ['openai_math']);
  assert.match(renderAiBus(broken), /- \*\*OpenAI:s matematiksamling:\*\* okänt; läsningen misslyckades \(invalid\\_openai\\_math\\_catalog\)/);
  assert.match(renderAiBus(broken), /Modellanrop: 11 av 14\./, 'a failed stage is counted in full');
});
