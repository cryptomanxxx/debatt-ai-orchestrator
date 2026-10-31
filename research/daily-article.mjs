import { readdir, readFile } from 'node:fs/promises';

// Professor Oraklet's daily short article (ai-bus/artiklar/, LITERATURE-DAY.md). The lab first
// builds a numbered fact sheet from the day's saved reports only: lab runs, Oraklet's own designs,
// the VEM-Sci register, DeepRAP and the literature findings with their verified quotes. Oraklet
// then writes a short article in Swedish that may only state what the sheet says, citing [F#] for
// facts and [R#] for literature. Before anything is published the lab checks every citation,
// every number and every wording that would overstate a result; an article that fails is not
// published and the day's report says why. Nothing here is peer-reviewed.

// One draft and, when the lab rejects it, up to two rewrites, each told what it broke.
export const ARTICLE_MODEL_CALLS = 3;
export const ARTICLE_SCHEMA = 'oraklet-article-1';
const MAX_FACTS = 40, MAX_REFERENCES = 8;
// /v1/query takes 8,000 characters including the lab's wrapper; the request stays below this.
export const MAX_ARTICLE_REQUEST_CHARS = 7400;
const SECTIONS = Object.freeze([['abstract', 'Sammanfattning'], ['background', 'Bakgrund'], ['method', 'Metod'], ['results', 'Resultat'], ['limitations', 'Begränsningar']]);
const pct = v => typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)} %` : null;
const int = v => Number.isInteger(v) && v >= 0 ? v : null;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const SCOPE = { full: 'full överföring', none: 'ingen överföring', unresolved: 'olöst' };

// Every fact is a Swedish sentence written by the lab from a saved report, never by a model.
export function buildFactSheet(day) {
  const facts = [], references = [];
  // verified: the fact reports an outcome an independent verifier decided (not a zero count).
  const fact = (topic, text, verified = false, ref = null) => facts.push({ topic, text, verified, ...(ref ? { ref } : {}) });
  for (const r of Array.isArray(day.lab?.runs) ? day.lab.runs : []) {
    const name = clip(r.experimentId ?? r.title, 60);
    fact('lab', r.executionStatus === 'error' ? `Labbkörningen ${name} (seed ${clip(r.seed, 12)}) avbröts med driftfel; ${int(r.passed) ?? 0} av ${int(r.cases) ?? 0} slutförda fall godkändes.`
      : `Labbkörningen ${name} (seed ${clip(r.seed, 12)}) godkände ${int(r.passed) ?? 0} av ${int(r.cases) ?? 0} fall av experimentets egen oberoende verifierare.`,
    r.executionStatus !== 'error' && (int(r.cases) ?? 0) > 0);
    const d = r.design;
    if (d?.equations) {
      fact('design', `I ${name} (seed ${clip(r.seed, 12)}) utformade Oraklet själv mekanismen ${d.equations.join('; ')}.`);
      const said = d.prediction?.identifiable ? `identifierbar med minst ${d.prediction.minInterventions} ingrepp` : 'inte identifierbar';
      const found = d.analysis?.identifiable ? `identifierbar med minst ${d.analysis.minInterventions} ingrepp` : `inte identifierbar (${int(d.analysis?.consistentAfterAll) ?? 0} kopplingar stämmer)`;
      fact('design', `Oraklet förregistrerade att mekanismen är ${said}; labbets uppräkning fann att den är ${found}, så förutsägelsen ${d.predicted ? 'stämde' : 'stämde inte'}.`, Boolean(d.analysis));
      for (const i of d.investigations ?? []) fact('design', `I målsystem ${int(i.case) ?? 0} gjorde Oraklet ${int(i.experiments) ?? 0} ingrepp och avgjorde ${SCOPE[i.decision] ?? 'inget läsbart svar'}; facit var ${SCOPE[i.truth] ?? 'okänt'}, evidensgrinden gav ${clip(i.gate, 30)} och fallet ${i.passed ? 'godkändes' : 'godkändes inte'}.`);
    }
  }
  const m = day.memory;
  if (m && m.status !== 'error' && m.totals) {
    fact('memory', `VEM-Sci-registret från ${int(m.runs) ?? 0} sparade körningar har ${int(m.totals.provisionally_supported) ?? 0} preliminärt stödda, ${int(m.totals.rejected) ?? 0} avvisade och ${int(m.totals.unresolved) ?? 0} olösta påståenden, avgjorda av experimentens egna verifierare.`,
      (int(m.totals.provisionally_supported) ?? 0) + (int(m.totals.rejected) ?? 0) > 0);
    const r = m.deeprap?.reasoning;
    if (r && pct(r.supportRate)) fact('deeprap', `Av de avgjorda påståendena höll ${pct(r.supportRate)} vid oberoende verifiering (${int(r.supported) ?? 0} stödda, ${int(r.rejected) ?? 0} avvisade).`);
    if (r?.calibration?.cases && pct(r.calibration.meanConfidence) && pct(r.calibration.passRate))
      fact('deeprap', `Oraklets angivna säkerhet var i snitt ${pct(r.calibration.meanConfidence)} mot ${pct(r.calibration.passRate)} rätt svar över ${int(r.calibration.cases) ?? 0} fall.`);
    for (const p of m.deeprap?.abstraction?.protocols ?? []) if (pct(p.rate))
      fact('deeprap', `ACT-MAP ${clip(p.label, 40)}: ${int(p.passed) ?? 0} av ${int(p.cases) ?? 0} fall rätt beslut (${pct(p.rate)}).`, (int(p.cases) ?? 0) > 0);
  }
  const stages = Array.isArray(day.pipeline?.stages) ? day.pipeline.stages : [];
  const papers = stages.filter(s => ['initial_evidence', 'follow_up_evidence'].includes(s.name)).flatMap(s => s.summary?.papers ?? []);
  for (const p of papers) {
    const findings = (p.findings ?? []).filter(f => f?.claim && f?.quote);
    if (!findings.length || references.length >= MAX_REFERENCES) continue;
    const ref = { id: `R${references.length + 1}`, title: clip(p.title, 200), url: /^https:\/\/[^\s<>"'`]+$/.test(p.source_url ?? '') ? p.source_url : null };
    references.push(ref);
    for (const f of findings.slice(0, 2)) fact('literature', `Sammanfattningen av ${ref.id} innehåller citatet "${clip(f.quote, 220)}" (fynd av typen ${clip(f.kind, 30)}, läst av Oraklet; tolkningen är inte granskad).`, false, ref.id);
  }
  if (day.pipeline?.candidate) fact('literature', `Dagens hypoteskandidat, overifierad och utan experiment: ${clip(day.pipeline.candidate.hypothesis, 300)}`);
  // The cap keeps verified facts first, so unverified entries cannot crowd out a verified result;
  // the kept facts stay in their order and are numbered after the cut.
  const keep = new Set([...facts.filter(f => f.verified), ...facts.filter(f => !f.verified)].slice(0, MAX_FACTS));
  return { facts: facts.filter(f => keep.has(f)).map((f, i) => ({ id: `F${i + 1}`, ...f })), references };
}

// An article needs something verified to write about: a completed case or a decided claim, not
// merely an empty register or a run without cases.
export const worthWriting = sheet => sheet.facts.some(f => f.verified);

// Room kept in the request for the rewrite's note on why the draft was rejected.
const FEEDBACK_RESERVE = 900;
export function articleMessages(sheet, date, feedback = '') {
  return [
    { role: 'system', content: 'Du är Professor Oraklet och skriver dagens korta vetenskapliga artikel på svenska, 300–700 ord: mer en utförlig sammanfattning än en hel artikel. '
      + 'Välj ett sammanhållet ämne bland faktaunderlaget, helst ett verifierat labbresultat, och skriv bara det underlaget säger. '
      + 'Varje mening med ett påstående eller en siffra ska hänvisa till sitt underlag med [F1], [F2] … och litteratur med [R1], [R2] …; hitta aldrig på siffror, källor eller resultat. '
      + 'Skriv alla tal med siffror, aldrig med ord som "tre" eller "hälften". Varje mening ska ha minst en hänvisning. En siffra får bara stå i en mening som hänvisar till ett faktum där just den siffran finns, med samma ord eller tecken efter sig som i faktumet (till exempel "3 av 5 fall", "88 %"); skriv inga datum och ingen annan numrering. Ingen Markdown, inga listor, inga webbadresser. Står flera siffror ur samma faktum i en mening, behåll faktumets ordning. '
      + `Använd inte orden ${BANNED_WORDS}; de får bara stå direkt nekade, som "ingen ny upptäckt", och "metoder för kausal upptäckt" går bra som namn på en metodfamilj. Undvik helst alla ord som börjar på "bekräft", även nekade: skriv "overifierat", "inte prövat", "saknar experimentellt stöd", "preliminärt stött" eller "inte granskat". Begränsningar ska nämna att allt är syntetiskt eller bygger på sammanfattningar och att inget är granskat. `
      + 'Labbet sätter rubriken. Svara endast JSON: {"abstract":"…","background":"…","method":"…","results":"…","limitations":"…"}.'
      + (feedback ? ` Ditt förra utkast avvisades av labbet: ${feedback} Skriv om hela artikeln så att den följer alla regler.` : '') },
    { role: 'user', content: JSON.stringify({ date, facts: sheet.facts.map(({ id, text }) => ({ id, text })), references: sheet.references.map(({ id, title }) => ({ id, title })) }) },
  ];
}

// Words that would overstate what a verifier recorded. A direct negation ("ingen ny upptäckt",
// "inte bekräftat") states the opposite and is allowed: a negator at most two words before, and
// only words that qualify the noun between ("ny", "vetenskaplig", "någon", "ett" …). Any other word
// could start a new claim ("inte preliminärt och bevisar", "inte … utan ett genombrott", "inte
// bara"), so it is refused. "utan" (without) negates too ("utan experimentell bekräftelse"), but not
// after an earlier negator in the same sentence: there "inte … utan" means "but instead" and affirms.
const OVERCLAIM = /(?<![\p{L}])(bevis\p{L}*|bekräft\p{L}*|genombrott\p{L}*|upptäck\p{L}*|banbrytande|fastställ\p{L}*|säkerställ\p{L}*|revolution\p{L}*|definitivt)/giu;
const NEGATED = /(?:^|[^\p{L}])(inte|ej|ingen|inget|inga|aldrig|utan)((?:\s+\p{L}+){0,2})\s+$/iu;
const NEGATOR = /(?<![\p{L}])(?:inte|ej|ingen|inget|inga|aldrig|varken)(?![\p{L}])/iu;
// The sentence the term stands in, up to the term: from the last sentence end before it.
const sentenceBefore = (text, at) => { const head = text.slice(0, at); const ends = [...head.matchAll(/[.!?]["'\u201D\u2019\u00BB)\]]*\s|\n/g)]; return ends.length ? head.slice(ends.at(-1).index + ends.at(-1)[0].length) : head; };
const QUALIFIER = /^(en|ett|någon|något|några|ny|nya|nytt|egen|eget|egna|sådan|sådant|sådana|verklig\p{L}*|vetenskaplig\p{L}*|egentlig\p{L}*|slutgiltig\p{L}*|formell\p{L}*|fullständig\p{L}*|empirisk\p{L}*|experimentell\p{L}*|statistisk\p{L}*|oberoende|extern\p{L}*|direkt\p{L}*|tydlig\p{L}*|heller|ännu)$/iu;
// "kausal upptäckt" (causal discovery) names a family of methods, not a claim of a discovery, only in
// the fixed forms "<metod|ramverk|framework|algoritm|verktyg|teknik…> för [ett ord] kausal upptäckt" and "inom
// kausal upptäckt". "Metoden gav en kausal upptäckt", "beröm för sin kausala upptäckt" and
// "Oraklet gjorde en kausal upptäckt" stay refused.
const METHOD_NAME = /(?:(?:metod|ramverk|framework|algoritm|verktyg|teknik)\p{L}*\s+för(?:\s+(?!(?:sin|sina|sitt|hans|hennes|dess|deras|en|ett|egen|eget|egna)(?![\p{L}]))\p{L}+)?|(?:^|[^\p{L}])inom)\s+kausal\s+$/iu;
function overclaimTerm(text) {
  for (const m of text.matchAll(OVERCLAIM)) {
    if (m[1].toLowerCase() === 'upptäckt' && METHOD_NAME.test(text.slice(Math.max(0, m.index - 80), m.index))) continue;
    const before = text.slice(Math.max(0, m.index - 60), m.index).match(NEGATED);
    // Only qualifying adjectives may stand between the negator and the term, also after "ingen": a
    // noun or verb there means the negator belongs to something else ("Ingen forskare ifrågasätter
    // genombrottet", "Ingen förnekar upptäckten" affirm the claim).
    if (!before || !before[2].trim().split(/\s+/).filter(Boolean).every(w => QUALIFIER.test(w))) return m[1].toLowerCase().slice(0, 30);
    // "utan" after an earlier negator in the sentence is contrastive ("inte resultat utan genombrott").
    if (before[1].toLowerCase() === 'utan') {
      const head = sentenceBefore(text, m.index);
      if (NEGATOR.test(head.slice(0, head.toLowerCase().lastIndexOf('utan')))) return m[1].toLowerCase().slice(0, 30);
    }
  }
  return null;
}
const BANNED_WORDS = '"bevis", "bevisa", "bekräfta", "bekräftelse", "genombrott", "upptäcka", "upptäckt", "banbrytande", "fastställa", "säkerställa", "revolutionerande" och "definitivt"';
const tags = text => [...text.matchAll(/\[([FR]\d{1,2})\]/g)].map(m => m[1]);
// A sign written directly before a number belongs to it ("-3*s_1"), so a sign cannot be dropped.
const NUMBER = '([-+\u2212]?\\d+(?:[.,]\\d+)?)';
const plain = text => text.replace(/\[[FR]\d{1,2}\]/g, ' ').replace(/\u2212/g, '-');
const normal = n => n.replace(',', '.').replace(/^\+/, '');
const numbers = text => [...plain(text).matchAll(new RegExp(NUMBER, 'g'))].map(m => normal(m[1]));
// Each number with the word or sign that follows it ("3 av", "3 fall", "88 %"), so a number keeps
// its role: "3 av 1" does not pass where the fact says "1 av 3". A number followed only by
// punctuation takes the word before it ("seed 7)" is "7 <seed"), so a bare number cannot borrow
// support from an unrelated one.
const WORD = '[^\\s\\d.,;:!?()]';
const numberRoles = text => { const t = plain(text); return [...t.matchAll(new RegExp(NUMBER + '\\s*(' + WORD + '*)', 'g'))]
  .map(m => `${normal(m[1])} ${m[2] ? m[2].toLowerCase() : '<' + (t.slice(0, m.index).match(new RegExp('(' + WORD + '+)[\\s.,;:!?()]*$'))?.[1] ?? '').toLowerCase()}`); };
// A Swedish abbreviation ends no sentence when the text goes on in lower case ("t.ex. små fall");
// anything else after it (a capital, a closing quote or bracket) is a sentence end, as after a full
// stop with a closing quote or bracket ('gäller." Nästa').
const ABBREVIATIONS = /\b(t\.ex|bl\.a|m\.fl|m\.m|s\.k|d\.v\.s|o\.s\.v|t\.o\.m|fr\.o\.m|e\.d|dvs|osv|ca|jfr|resp|inkl|exkl|etc|nr|kap|fig|tab)\./gi;
// A citation written after the full stop ("osv. [F1].") belongs to the sentence it follows.
const sentences = text => text.replace(/([.!?]["'\u201D\u2019\u00BB)\]]*)((?:\s*\[[FR]\d{1,2}\])+)/g, '$2$1').replace(ABBREVIATIONS, (m, _, at, all) => /^\s*[a-zåäö0-9,;:]/.test(all.slice(at + m.length)) ? m.replace(/\./g, '\u2024') : m)
  .split(/(?<=[.!?]["'\u201D\u2019\u00BB)\]]*)\s+/).filter(s => s.trim());

// The sentence's numbers can each be placed in a cited fact so that numbers from the same fact keep
// its order and each occurrence is used once: "88 % mot 97 %" does not pass where the fact says
// "97 % mot 88 %", nor does "97 % … 97 % mot 88 %".
// Greedy and linear: each number takes the earliest unused match, staying in the fact it last used
// when it can. A rare valid sentence may be rejected, never an unsupported one published.
function inFactOrder(found, facts) {
  const next = facts.map(() => 0);
  let current = -1;
  for (const n of found) {
    const at = f => facts[f].indexOf(n, next[f]);
    const f = current >= 0 && at(current) >= 0 ? current : facts.findIndex((_, g) => at(g) >= 0);
    if (f < 0) return false;
    next[f] = at(f) + 1;
    current = f;
  }
  return true;
}

// Spelled-out quantities cannot be checked against the facts ("en"/"ett" are also articles and stay).
// A number word passes only where a cited fact uses the same word, as in a label the lab wrote
// itself ("ACT-MAP två ingrepp"); anywhere else it stands for a number that cannot be checked.
const NUMBER_WORDS = /(?<![\p{L}])(noll|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv|tretton|fjorton|femton|sexton|sjutton|arton|nitton|tjugo\p{L}*|trettio\p{L}*|fyrtio\p{L}*|femtio\p{L}*|sextio\p{L}*|sjuttio\p{L}*|åttio\p{L}*|nittio\p{L}*|hundra\p{L}*|tusen\p{L}*|miljon\p{L}*|miljard\p{L}*|hälften|halva|dubbelt|tredjedel\p{L}*|fjärdedel\p{L}*|procent\p{L}*)(?![\p{L}])/giu;

// GitHub turns bare URLs, www. hosts and e-mail addresses into links; an article has none.
const LINKLIKE = /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:|[\w.+-]+@[\w-]+\.[a-z]/i;

// The lab's title, from the topic of the first verified fact the article cites.
const TOPIC_TITLES = Object.freeze({ lab: 'Dagens labbkörningar', design: 'En mekanism som Oraklet utformade själv',
  memory: 'Vad kunskapsminnet har avgjort', deeprap: 'Hur väl Oraklets resonemang håller' });

// "3 fall" stays as written; "7 <seed" (a number followed by punctuation) reads "7 (efter "seed")".
const showRole = role => { const [n, w = ''] = role.split(' '); return w.startsWith('<') ? `${n} (efter "${w.slice(1)}")` : `${n} ${w}`.trim(); };

export function checkArticle(text, sheet) {
  let a;
  try {
    const t = String(text).trim().replace(/^<think>[\s\S]*?<\/think>\s*/, ''), fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
    a = JSON.parse(fenced ? fenced[1] : t);
  } catch { return { problem: 'not_json' }; }
  const keys = SECTIONS.map(([k]) => k);
  // A title the model still sends is ignored: a title cites nothing, so the lab writes it.
  if (!a || typeof a !== 'object' || Object.keys(a).filter(k => k !== 'title').sort().join() !== [...keys].sort().join() || keys.some(k => typeof a[k] !== 'string' || !a[k].trim()))
    return { problem: 'invalid_shape' };
  if (SECTIONS.some(([k]) => LINKLIKE.test(a[k]))) return { problem: 'markup' };
  const body = SECTIONS.map(([k]) => a[k]).join('\n');
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 250 || words > 900) return { problem: 'invalid_length', number: `${words} ord; skriv 300–700` };
  // Each section is rendered as one paragraph, so a list or heading marker can only open it.
  if (/[`<>|#]|\]\(/.test(body) || SECTIONS.some(([k]) => /^\s*([-*+]|\d+[.)])\s/.test(a[k]))) return { problem: 'markup' };
  // The word is one of the fixed stems above, so it may be named in the report and the rewrite.
  const term = overclaimTerm(body);
  if (term) return { problem: 'overclaim', term };
  // Only ASCII digits are checked against the facts, so no other numeral or number word may stand in for one.
  if (/(?![0-9])\p{N}/u.test(body)) return { problem: 'unsupported_number' };
  const known = new Map([...sheet.facts.map(f => [f.id, f.text]), ...sheet.references.map(r => [r.id, r.title])]);
  if (tags(body).some(id => !known.has(id))) return { problem: 'unknown_citation' };
  if (!tags(body).some(id => id.startsWith('F'))) return { problem: 'no_fact_cited' };
  // The article is about a verified result, so it must cite one.
  const verified = tags(body).map(id => sheet.facts.find(f => f.id === id)).find(f => f?.verified);
  if (!verified) return { problem: 'no_verified_fact_cited' };
  // Sentences are split within each section, so a section without a final full stop cannot borrow
  // the next section's citation.
  for (const s of SECTIONS.flatMap(([k]) => sentences(a[k]))) {
    // Every sentence states something, so every sentence cites its basis.
    if (!tags(s).length) return { problem: 'uncited_sentence', sentence: s };
    const factText = tags(s).filter(id => id.startsWith('F')).map(id => known.get(id).toLowerCase()).join(' ');
    const word = [...s.matchAll(NUMBER_WORDS)].map(m => m[1].toLowerCase())
      .find(w => !new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, 'u').test(factText));
    if (word) return { problem: 'unsupported_number', sentence: s, number: `"${word}" (skriv talet med siffror)` };
    const found = numberRoles(s);
    if (!found.length) continue;
    const cited = tags(s).filter(id => id.startsWith('F'));
    if (!cited.length) return { problem: 'uncited_number', sentence: s };
    // Every number must come, with its role, from a fact the same sentence cites.
    const roles = [...new Set(cited)].map(id => numberRoles(known.get(id)));
    if (!inFactOrder(found, roles)) {
      // The first number no cited fact has with that role; otherwise the order or a repeat is wrong.
      const missing = found.find(n => !roles.some(r => r.includes(n)));
      return { problem: 'unsupported_number', sentence: s, number: missing ? showRole(missing) : 'ordningen eller en upprepning av siffrorna' };
    }
  }
  return { article: { title: TOPIC_TITLES[verified.topic], ...Object.fromEntries(keys.map(k => [k, a[k].replace(/\s+/g, ' ').trim()])) }, words };
}

// Fact and reference text can carry external quotes and titles: every Markdown character is
// escaped, as for untrusted literature in the daily report. The article body keeps its [F#] tags.
// GitHub autolinks are broken with a zero-width space; the checked reference URL is rendered apart.
const inert = v => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|#]/g, '\\$&').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/:\/\//g, ':\u200B//').replace(/\b(www)\./gi, '$1\u200B.').replace(/@/g, '\u200B@');
const escapeText = v => inert(v).replace(/\\\[([FR]\d{1,2})\\\]/g, '[$1]');
const FOOTER = '*Skriven av Professor Oraklet, en AI, utifrån faktaunderlaget nedan. Underlaget kommer från sparade, oberoende verifierade körningar och från sammanfattningar med kontrollerade citat; texten är inte granskad av en människa eller av vetenskapliga granskare. "Preliminärt stött" gäller bara det testade fallet, aldrig etablerad vetenskap.*';
export function renderArticle(article, sheet, { date, field, model }) {
  const cited = new Set(SECTIONS.flatMap(([k]) => tags(article[k])));
  const L = [`# ${article.title}`, '', `*Professor Oraklet, ${date}. Fält: ${field}. Modell: ${clip(model, 80)}.*`, ''];
  for (const [k, heading] of SECTIONS) L.push(`## ${heading}`, '', escapeText(article[k]), '');
  L.push('## Faktaunderlag', '', 'Varje [F#] i texten hänvisar till en mening som labbet skrev från en sparad rapport.', '');
  for (const f of sheet.facts.filter(f => cited.has(f.id))) L.push(`- **[${f.id}]** ${inert(f.text)}`);
  // A cited literature fact brings its paper along, so a quote never loses its source.
  const usedRefs = new Set([...cited, ...sheet.facts.filter(f => cited.has(f.id) && f.ref).map(f => f.ref)]);
  const refs = sheet.references.filter(r => usedRefs.has(r.id));
  if (refs.length) {
    L.push('', '## Referenser', '');
    for (const r of refs) L.push(`- **[${r.id}]** ${inert(r.title)}${r.url ? ` <${r.url}>` : ''}`);
  }
  L.push('', '---', '', FOOTER, '');
  return L.join('\n');
}

// The index of every published article, newest first, built from the files themselves.
export async function articleIndex(directory = 'ai-bus/artiklar') {
  let files = [];
  try { files = (await readdir(directory)).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse(); } catch { files = []; }
  const rows = [];
  for (const f of files) {
    const title = ((await readFile(`${directory}/${f}`, 'utf8')).match(/^# (.+)$/m)?.[1] ?? f).replace(/[[\]|]/g, "'");
    rows.push(`- ${f.slice(0, 10)}: [${title}](${f})`);
  }
  return ['# Professor Oraklets artiklar', '',
    'Korta vetenskapliga artiklar som Professor Oraklet skriver dagligen utifrån verifierade labbkörningar, sitt kunskapsminne och dagens litteratur. Varje påstående hänvisar till ett faktaunderlag som labbet byggt från sparade rapporter, och labbet kontrollerar siffror, hänvisningar och ordval innan en artikel publiceras. Inget här är granskat av en människa. Se [research/LITERATURE-DAY.md](../../research/LITERATURE-DAY.md).', '',
    ...(rows.length ? rows : ['Inga artiklar ännu.']), ''].join('\n');
}

// The day's article: one model call, checked before anything is written. Returns the record for
// day.json and, when published, the file name and Markdown.
export async function writeDailyArticle(day, propose, { field }) {
  const sheet = buildFactSheet(day);
  // The request must fit /v1/query: the last facts (literature first) go when it would not.
  // Unverified facts go first, from the end, so a verified result is the last thing cut.
  while (JSON.stringify(articleMessages(sheet, day.date)).length > MAX_ARTICLE_REQUEST_CHARS - FEEDBACK_RESERVE && sheet.facts.length > 1)
    sheet.facts.splice(sheet.facts.findLastIndex(f => !f.verified) >= 0 ? sheet.facts.findLastIndex(f => !f.verified) : sheet.facts.length - 1, 1);
  sheet.references = sheet.references.filter(r => sheet.facts.some(f => f.ref === r.id));
  if (!worthWriting(sheet)) return { record: { status: 'skipped', reason: 'no_verified_results', facts: sheet.facts.length } };
  // Every call made is counted (calls), whatever its outcome. A rejected draft gets a rewrite, told
  // the lab's reason, the word or number and the sentence it refused (the model's own text). Every
  // rewrite passes the same checks, or nothing is published. The record (day.json, ai-bus) keeps
  // only fixed reasons and words; the drafts go to the run's artifact (drafts), never to ai-bus.
  let answer, checked, calls = 0;
  const earlier = [], drafts = [];
  const result = record => ({ record, ...(drafts.length ? { drafts } : {}) });
  for (let attempt = 0; attempt < ARTICLE_MODEL_CALLS; attempt++) {
    const note = attempt ? rewriteNote(checked) : '';
    calls++;
    try { answer = await propose(articleMessages(sheet, day.date, note), { deep: true }); }
    catch (error) {
      // The lab's bounded diagnostic says which provider and model failed, and with which status.
      const { upstreamStatus, httpStatus, provider, model } = error?.diagnostic ?? {};
      return result({ status: 'error', reason: /^[a-z_]{3,60}$/.test(error?.message ?? '') ? error.message : 'model_failed', facts: sheet.facts.length, calls,
        ...(Number.isInteger(upstreamStatus) ? { upstreamStatus } : {}), ...(Number.isInteger(httpStatus) ? { httpStatus } : {}),
        ...(provider && model ? { provider, model } : {}), ...(earlier.length ? { earlier } : {}) });
    }
    checked = checkArticle(answer.text, sheet);
    if (!checked.problem) break;
    drafts.push({ attempt: attempt + 1, ...problemRecord(checked), ...(checked.sentence ? { sentence: clip(checked.sentence, 600) } : {}),
      ...(checked.number ? { number: clip(checked.number, 80) } : {}), text: String(answer.text).slice(0, 20000) });
    if (attempt < ARTICLE_MODEL_CALLS - 1) earlier.push(problemRecord(checked));
  }
  if (checked.problem) return result({ status: 'rejected', ...problemRecord(checked), facts: sheet.facts.length, model: answer.model ?? null, calls, ...(earlier.length ? { earlier } : {}) });
  // One stable file per date: a rerun the same day replaces the day's article instead of adding one.
  const file = `${day.date}.md`;
  return { ...(drafts.length ? { drafts } : {}), record: { status: 'published', file, title: checked.article.title, words: checked.words, facts: sheet.facts.length, calls, ...(earlier.length ? { earlier } : {}),
    cited: [...new Set(SECTIONS.flatMap(([k]) => tags(checked.article[k])))].sort(), model: answer.model ?? null },
  file, markdown: renderArticle(checked.article, sheet, { date: day.date, field, model: `${answer.provider ?? ''} ${answer.model ?? ''}`.trim() }) };
}

const problemRecord = c => ({ reason: c.problem, ...(c.term ? { term: c.term } : {}) });
// The rewrite is told the rule in the lab's own words, the refused word or number, and the sentence
// it refused (the model's own text, bounded) so it can mend that sentence.
function rewriteNote(c) {
  return `${ARTICLE_REASONS[c.problem] ?? 'en kontroll misslyckades'}${c.term ? ` (ordet "${c.term}")` : ''}${c.number ? ` (siffran ${clip(c.number, 80)})` : ''}.`
    + (c.term ? ' Ta bort ordet helt, även i nekad form, och skriv till exempel "overifierat", "inte prövat" eller "saknar experimentellt stöd".' : '')
    + (c.sentence ? ` Meningen som avvisades: "${clip(c.sentence, 300)}"` : '');
}

export const ARTICLE_REASONS = Object.freeze({
  no_verified_results: 'inga verifierade resultat att skriva om', not_json: 'svaret var inte giltig JSON', invalid_shape: 'svaret saknade avsnitt',
invalid_length: 'texten var inte 250–900 ord', markup: 'texten innehöll otillåten formatering',
  overclaim: 'texten överdrev vad verifieringen visar', unknown_citation: 'texten hänvisade till underlag som inte finns', no_fact_cited: 'texten hänvisade inte till underlaget',
  no_verified_fact_cited: 'texten hänvisade inte till något verifierat resultat', uncited_number: 'en siffra saknade hänvisning', uncited_sentence: 'en mening saknade hänvisning', unsupported_number: 'en siffra fanns inte i det hänvisade underlaget', model_failed: 'modellanropet misslyckades',
});
