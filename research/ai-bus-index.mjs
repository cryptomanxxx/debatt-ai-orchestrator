// The ai-bus indexes (rapporter/README.md, artiklar/README.md), rebuilt from the files present. The
// literature day writes them, and its publish step runs this again after resetting onto the latest
// main, so a report or article that reached main during the run stays indexed.
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { articleIndex } from './daily-article.mjs';

// The index of every daily report, newest first, built from the files themselves.
export async function reportIndex(directory = 'ai-bus/rapporter') {
  let files = [];
  try { files = (await readdir(directory)).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse(); } catch { files = []; }
  return ['# Professor Oraklets dagliga rapporter', '',
    'En rapport per dag om vad Oraklet läste, fann och körde. Den senaste finns alltid i [../senaste.md](../senaste.md). Se [research/LITERATURE-DAY.md](../../research/LITERATURE-DAY.md).', '',
    ...(files.length ? files.map(f => `- [${f.slice(0, 10)}](${f})`) : ['Inga rapporter ännu.']), ''].join('\n');
}

export async function writeAiBusIndexes(root = 'ai-bus') {
  if (existsSync(`${root}/rapporter`)) await writeFile(`${root}/rapporter/README.md`, await reportIndex(`${root}/rapporter`));
  if (existsSync(`${root}/artiklar`)) await writeFile(`${root}/artiklar/README.md`, await articleIndex(`${root}/artiklar`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await writeAiBusIndexes();
