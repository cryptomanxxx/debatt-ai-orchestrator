// The Porter2 ("Snowball English") stemmer, used to match words across inflections in titles:
// change/changing, estimate/estimator/estimation, control/controlled and process/processes share a
// stem, while general/generation and signal/sign stay apart. Algorithm:
// https://snowballstem.org/algorithms/english/stemmer.html
const VOWEL = /[aeiouy]/;
const DOUBLE = ['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt'];
const LI_ENDING = /[cdeghkmnrt]$/;
const EXCEPTIONS = new Map(Object.entries({ skis: 'ski', skies: 'sky', dying: 'die', lying: 'lie', tying: 'tie', idly: 'idl',
  gently: 'gentl', ugly: 'ugli', early: 'earli', only: 'onli', singly: 'singl', sky: 'sky', news: 'news', howe: 'howe',
  atlas: 'atlas', cosmos: 'cosmos', bias: 'bias', andes: 'andes' }));
const AFTER_1A = new Set(['inning', 'outing', 'canning', 'herring', 'earring', 'proceed', 'exceed', 'succeed']);

const isVowel = c => VOWEL.test(c);
// Start of the region after the first non-vowel that follows a vowel, from position `from`.
function regionStart(w, from) {
  for (let i = from + 1; i < w.length; i++) if (!isVowel(w[i]) && isVowel(w[i - 1])) return i + 1;
  return w.length;
}
// A short syllable at the end of w: non-vowel, vowel, non-vowel (not w, x or Y); or vowel, non-vowel at the start.
function endsShortSyllable(w) {
  const n = w.length;
  if (n === 2) return isVowel(w[0]) && !isVowel(w[1]);
  return n > 2 && !isVowel(w[n - 3]) && isVowel(w[n - 2]) && !isVowel(w[n - 1]) && !/[wxY]/.test(w[n - 1]);
}

export function porter2(input) {
  let w = input.toLowerCase().replace(/^'/, '');
  if (EXCEPTIONS.has(w)) return EXCEPTIONS.get(w);
  if (w.length <= 2) return w;
  w = w.replace(/^y/, 'Y').replace(/([aeiouy])y/g, '$1Y');
  const special = /^(gener|commun|arsen)/.exec(w);
  const r1 = special ? special[0].length : regionStart(w, 0);
  const r2 = regionStart(w, r1);
  const inR = (word, suffix, r) => word.length - suffix.length >= r;
  const isShort = word => endsShortSyllable(word) && r1 >= word.length;

  // Step 0 and 1a: possessives and plurals.
  w = w.replace(/('s'|'s|')$/, '');
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (/(ied|ies)$/.test(w)) w = w.length > 4 ? w.slice(0, -2) : w.slice(0, -1);
  else if (/(us|ss)$/.test(w)) { /* unchanged */ }
  else if (w.endsWith('s') && VOWEL.test(w.slice(0, -2))) w = w.slice(0, -1);
  if (AFTER_1A.has(w)) return w;

  // Step 1b: -eed, -ed, -ing.
  let m;
  if ((m = /(eedly|eed)$/.exec(w))) { if (inR(w, m[1], r1)) w = w.slice(0, -m[1].length) + 'ee'; }
  else if ((m = /(ingly|edly|ing|ed)$/.exec(w)) && VOWEL.test(w.slice(0, -m[1].length).replace(/Y/g, ''))) {
    w = w.slice(0, -m[1].length);
    if (/(at|bl|iz)$/.test(w)) w += 'e';
    else if (DOUBLE.some(d => w.endsWith(d))) w = w.slice(0, -1);
    else if (isShort(w)) w += 'e';
  }
  // Step 1c: y after a non-vowel (not the first letter) becomes i.
  if (w.length > 2 && /[yY]$/.test(w) && !isVowel(w[w.length - 2])) w = w.slice(0, -1) + 'i';

  // Step 2, in R1.
  const STEP2 = [['ization', 'ize'], ['ational', 'ate'], ['fulness', 'ful'], ['ousness', 'ous'], ['iveness', 'ive'],
    ['tional', 'tion'], ['biliti', 'ble'], ['lessli', 'less'], ['entli', 'ent'], ['ation', 'ate'], ['alism', 'al'],
    ['aliti', 'al'], ['ousli', 'ous'], ['iviti', 'ive'], ['fulli', 'ful'], ['enci', 'ence'], ['anci', 'ance'],
    ['abli', 'able'], ['izer', 'ize'], ['ator', 'ate'], ['alli', 'al'], ['bli', 'ble'], ['ogi', 'og'], ['li', '']];
  for (const [suffix, to] of STEP2) {
    if (!w.endsWith(suffix)) continue;
    if (inR(w, suffix, r1) && (suffix !== 'ogi' || w.slice(0, -3).endsWith('l')) && (suffix !== 'li' || LI_ENDING.test(w.slice(0, -2))))
      w = w.slice(0, -suffix.length) + to;
    break;
  }
  // Step 3, in R1 (ative in R2).
  const STEP3 = [['ational', 'ate'], ['tional', 'tion'], ['alize', 'al'], ['icate', 'ic'], ['iciti', 'ic'], ['ative', ''],
    ['ical', 'ic'], ['ness', ''], ['ful', '']];
  for (const [suffix, to] of STEP3) {
    if (!w.endsWith(suffix)) continue;
    if (inR(w, suffix, suffix === 'ative' ? r2 : r1)) w = w.slice(0, -suffix.length) + to;
    break;
  }
  // Step 4, in R2.
  const STEP4 = ['ement', 'ance', 'ence', 'able', 'ible', 'ment', 'ant', 'ent', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize',
    'ion', 'al', 'er', 'ic'];
  for (const suffix of STEP4) {
    if (!w.endsWith(suffix)) continue;
    if (inR(w, suffix, r2) && (suffix !== 'ion' || /[st]$/.test(w.slice(0, -3)))) w = w.slice(0, -suffix.length);
    break;
  }
  // Step 5: a final e or ll.
  if (w.endsWith('e') && (inR(w, 'e', r2) || (inR(w, 'e', r1) && !endsShortSyllable(w.slice(0, -1))))) w = w.slice(0, -1);
  else if (w.endsWith('ll') && inR(w, 'l', r2)) w = w.slice(0, -1);
  return w.replace(/Y/g, 'y');
}
