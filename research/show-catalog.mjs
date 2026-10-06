import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { CATALOG, TOOLS, catalogMarkdown } from './catalog.mjs';
const directory = process.env.CATALOG_DIRECTORY || 'reports/oraklet-lab';
await mkdir(directory, { recursive: true });
const markdown = catalogMarkdown();
await writeFile(`${directory}/catalog.md`, markdown);
await writeFile(`${directory}/catalog.json`, JSON.stringify({ experiments: CATALOG, tools: TOOLS }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
