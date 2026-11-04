// Professor Oraklet reads OpenAI's mathematics collection (research/openai-math/katalog.json), three
// result families a day in a fixed rotation, so the whole catalog is read in about four months. One
// model call: for each family he quotes the main claim word for word from its summary, and names the
// method, an open follow-up question and a small computation the lab could run. The lab checks the
// shape, that each quote occurs in that family's summary, the lengths and that no link is written.
// A family whose note fails is listed as rejected; the others are kept. Nothing here verifies a result.
import { readFile } from 'node:fs/promises';

export const READING_MODEL_CALLS = 1;
export const READING_FAMILIES = 3;
// Resolved from this module, so the catalog loads whatever the working directory.
export const CATALOG_PATH = new URL('./openai-math/katalog.json', import.meta.url);
const FIELDS = ['nr', 'citat', 'metod', 'oppen_fraga', 'labbforslag'];
const LINKLIKE = /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:|[\w.+-]+@[\w-]+\.[a-z]/i;
const space = s => String(s).replace(/\s+/g, ' ').trim();

export async function loadCatalog(path = CATALOG_PATH) {
  const doc = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(doc?.familjer) || !doc.familjer.length || !doc.familjer.every(f => /^\d{3}$/.test(f?.nr) && typeof f.sammanfattning === 'string'))
    throw Error('invalid_openai_math_catalog');
  return doc;
}

// The first reading day: family 001 in round 1.
export const READING_START = '2026-11-05';

// The day's families, in catalog order from a position that advances by three each UTC day.
export function familiesForDate(date, families, count = READING_FAMILIES) {
  const t = Date.parse(date + 'T00:00:00Z');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(t)) throw Error('invalid_reading_date');
  const n = families.length, days = Math.round((t - Date.parse(READING_START + 'T00:00:00Z')) / 86_400_000);
  // A date before the start continues the rotation backwards; position and round stay well defined.
  const step = ((days * count) % n + n) % n;
  return { position: step, round: Math.floor((days * count) / n) + 1, families: Array.from({ length: Math.min(count, n) }, (_, i) => families[(step + i) % n]) };
}

export function readingMessages(families, date) {
  return [
    { role: 'system', content: 'Du är Professor Oraklet och läser dagens resultatfamiljer ur OpenAI:s matematiksamling (openai/math). '
      + 'Samlingen är rådata från en ej släppt modell: resultaten är ogranskade påståenden, även när en del är formaliserad i Lean. '
      + 'Skriv för varje familj, på svenska: "citat", ett ordagrant utdrag ur familjens sammanfattning (20–300 tecken) som anger huvudpåståendet; '
      + '"metod", den metod eller det verktyg som verkar bära resultatet; "oppen_fraga", en konkret öppen följdfråga; '
      + '"labbforslag", ett litet beräkningsexperiment som labbet kunde köra med fria verktyg (Python, exakt aritmetik), eller "inget" om inget rimligt finns. '
      + 'Varje text högst 300 tecken. Skriv inte att resultatet är bevisat, och inga länkar. '
      + 'Svara endast JSON: {"familjer":[{"nr":"…","citat":"…","metod":"…","oppen_fraga":"…","labbforslag":"…"}]} med en post per familj.' },
    { role: 'user', content: JSON.stringify({ datum: date, familjer: families.map(f => ({ nr: f.nr, titel: f.titel, amne: f.amne,
      sammanfattning: f.sammanfattning, lean: f.lean_huvudresultat ? 'huvudresultatet' : f.lean_dokumentation ? 'delvis' : 'nej', kod: f.kod })) }) },
  ];
}

// Each note is checked on its own; the reasons are fixed codes, never model text.
export function checkReading(text, families) {
  let a;
  try {
    const t = String(text).trim().replace(/^<think>[\s\S]*?<\/think>\s*/, ''), fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
    a = JSON.parse(fenced ? fenced[1] : t);
  } catch { return { problem: 'not_json' }; }
  if (!a || typeof a !== 'object' || !Array.isArray(a.familjer)) return { problem: 'invalid_shape' };
  const notes = [], rejected = [];
  for (const f of families) {
    const entries = a.familjer.filter(e => e && typeof e === 'object' && e.nr === f.nr);
    const e = entries[0];
    const reason = entries.length !== 1 ? (entries.length ? 'duplicate_family' : 'missing_family')
      : Object.keys(e).sort().join() !== [...FIELDS].sort().join() || FIELDS.some(k => typeof e[k] !== 'string') ? 'invalid_shape'
      : FIELDS.slice(1).some(k => LINKLIKE.test(e[k])) ? 'link'
      : space(e.citat).length < 20 || space(e.citat).length > 300 ? 'quote_length'
      : !space(f.sammanfattning).includes(space(e.citat)) ? 'quote_not_in_summary'
      : FIELDS.slice(2).some(k => space(e[k]).length < 3 || space(e[k]).length > 300) ? 'text_length' : null;
    if (reason) rejected.push({ nr: f.nr, reason });
    else notes.push(Object.fromEntries(FIELDS.map(k => [k, space(e[k])])));
  }
  const extra = a.familjer.filter(e => !families.some(f => f.nr === e?.nr)).length;
  return { notes, rejected, ...(extra ? { extra } : {}) };
}

const familyView = f => ({ nr: f.nr, titel: f.titel, amne: f.amne, lean: f.lean_huvudresultat ? 'huvudresultat' : f.lean_dokumentation ? 'delvis' : 'nej',
  kod: f.kod, omkorning: f.omkorning ?? null, url: f.kalla?.[0] ?? null });

// The day's reading: the record for day.json and ai-bus. `before` runs once before the call (pacing).
export async function readOpenAiMath(date, propose, { catalog, before = async () => {} } = {}) {
  const { position, round, families } = familiesForDate(date, catalog.familjer);
  const base = { schema: 'oraklet-openai-math-reading-1', commit: catalog.commit, position, round, total: catalog.familjer.length,
    families: families.map(familyView) };
  await before();
  let answer;
  try { answer = await propose(readingMessages(families, date), {}); }
  catch (error) {
    const { upstreamStatus, provider, model } = error?.diagnostic ?? {};
    return { ...base, status: 'error', reason: /^[a-z_]{3,60}$/.test(error?.message ?? '') ? error.message : 'model_failed', calls: 1,
      ...(Number.isInteger(upstreamStatus) ? { upstreamStatus } : {}), ...(provider && model ? { provider, model } : {}) };
  }
  const checked = checkReading(answer.text, families);
  const who = { provider: answer.provider, model: answer.model };
  if (checked.problem) return { ...base, status: 'rejected', reason: checked.problem, calls: 1, ...who };
  return { ...base, status: checked.notes.length ? 'read' : 'rejected', ...(checked.notes.length ? {} : { reason: 'all_notes_rejected' }),
    notes: checked.notes, rejected: checked.rejected, calls: 1, ...who };
}

export const READING_REASONS = Object.freeze({ not_json: 'svaret var inte giltig JSON', invalid_shape: 'svaret hade fel form',
  missing_family: 'familjen saknades i svaret', duplicate_family: 'familjen fanns flera gånger', link: 'texten innehöll en länk',
  quote_length: 'citatet var inte 20–300 tecken', quote_not_in_summary: 'citatet fanns inte ordagrant i sammanfattningen',
  text_length: 'en text var inte 3–300 tecken', all_notes_rejected: 'ingen läsning godkändes', model_failed: 'modellanropet misslyckades' });
