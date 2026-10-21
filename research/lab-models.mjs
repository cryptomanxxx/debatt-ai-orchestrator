// Model choice for Oraklet's lab from the Scientific v4 domain ranking (research/SCIENTIFIC-V4.md).
// The planner may pick, per experiment domain, one of the best-ranked HIP/Blablador models; the
// candidates come only from committed benchmark evidence, never from the model itself.
import { readFile } from 'node:fs/promises';
import { DOMAINS, PROVIDERS, domainRankings } from './model-scores.mjs';
import { isMenuModelId } from './explicit-models.mjs';

// A candidate needs at least this much evidence in the experiment's domain.
export const MIN_DOMAIN_ATTEMPTS = 8;
export const MIN_DOMAIN_RATE = 0.75;
export const CHOICES_PER_DOMAIN = 3;
// The candidates travel in the planning request, which /v1/query caps at 8,000 characters
// together with the catalog and history; long model IDs drop the weakest candidates first.
export const MAX_CHOICES_CHARS = 1500;

// { domain: [{ choice: 'hip / GLM-5.2-AWQ-INT4', provider, model, root, correct, attempts, medianLatency }] }
export function researchChoices(runs, catalog, aliasRoots = {}) {
  const ranked = domainRankings(runs, catalog, aliasRoots);
  const out = {};
  for (const domain of DOMAINS) {
    const rows = PROVIDERS.flatMap(provider => (ranked[provider]?.[domain] ?? []).map(r => ({ ...r, provider })))
      .filter(r => isMenuModelId(r.model) && r.attempts >= MIN_DOMAIN_ATTEMPTS && r.rate >= MIN_DOMAIN_RATE
        && (!r.model.toLowerCase().startsWith('alias-') || typeof aliasRoots?.[r.provider]?.[r.model] === 'string'))
      .sort((a, b) => b.rate - a.rate || b.attempts - a.attempts
        || (a.medianLatency ?? 1e9) - (b.medianLatency ?? 1e9) || `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`, 'en'))
      .slice(0, CHOICES_PER_DOMAIN);
    // An alias carries the backing model its evidence was pooled under; the run must stay on it.
    if (rows.length) out[domain] = rows.map(r => Object.freeze({ choice: `${r.provider} / ${r.model}`, provider: r.provider,
      model: r.model, root: aliasRoots?.[r.provider]?.[r.model] ?? null,
      correct: r.correct, attempts: r.attempts, medianLatency: r.medianLatency }));
  }
  const size = () => JSON.stringify(Object.values(out).flat().map(c => [c.choice, c.correct, c.attempts])).length;
  while (size() > MAX_CHOICES_CHARS) {
    const domain = Object.keys(out).sort((a, b) => out[b].length - out[a].length)[0];
    out[domain] = out[domain].slice(0, -1);
    if (!out[domain].length) delete out[domain];
  }
  return out;
}

// Missing or unreadable files only mean no ranked candidates: the lab keeps its configured models.
export async function loadResearchChoices(read = path => readFile(path, 'utf8')) {
  try {
    const scores = JSON.parse(await read('research/model-scores.json'));
    const catalog = JSON.parse(await read('research/model-catalog.json'));
    return researchChoices(scores.runs ?? {}, catalog.providers ?? {}, catalog.aliasRoots ?? {});
  } catch { return {}; }
}

// The offered candidate a plan's modelMode names for its experiment's domain, or null.
export function chosenResearchModel(modelMode, domain, choices) {
  return (choices?.[domain] ?? []).find(c => c.choice === modelMode) ?? null;
}

// Some providers wrap JSON in a Markdown fence or emit a <think> block first; only that framing
// is removed, so the lab's strict JSON parsers still decide whether the answer is valid.
export function unwrapJsonAnswer(text) {
  let t = text.trim().replace(/^<think>[\s\S]*?<\/think>\s*/, '');
  const fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  if (fenced) t = fenced[1].trim();
  return t;
}
