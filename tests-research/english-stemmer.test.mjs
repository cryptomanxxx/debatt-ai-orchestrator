import test from 'node:test';
import assert from 'node:assert/strict';
import { porter2 } from '../research/english-stemmer.mjs';

// Reference pairs from the Snowball English vocabulary (snowballstem.org).
const REFERENCE = { consign: 'consign', consigned: 'consign', consignment: 'consign', consistency: 'consist', consistently: 'consist',
  consolation: 'consol', consolatory: 'consolatori', consolidating: 'consolid', consolingly: 'consol', conspicuously: 'conspicu',
  conspiracy: 'conspiraci', conspirators: 'conspir', constables: 'constabl', constancy: 'constanc', knackeries: 'knackeri',
  kneeling: 'kneel', knightly: 'knight', knitting: 'knit', knives: 'knive', knocker: 'knocker', generously: 'generous',
  generation: 'generat', general: 'general', happy: 'happi', sky: 'sky', dying: 'die', proceed: 'proceed', skies: 'sky' };

test('Porter2 matches the Snowball reference stems', () => {
  for (const [word, expected] of Object.entries(REFERENCE)) assert.equal(porter2(word), expected, word);
});
