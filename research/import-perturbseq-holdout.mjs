// Builds research/data/perturbseq-holdout.json from the two DEG-count CSVs in
// jinlabneurogenomics/distributed_agent at a fixed commit. The CSV bytes are checked against
// their recorded SHA-256 so the snapshot can be regenerated and audited.
// Usage: node research/import-perturbseq-holdout.mjs <training.csv> <holdouts.csv>
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const SOURCE = Object.freeze({
  repository: 'https://github.com/jinlabneurogenomics/distributed_agent',
  commit: 'c20445d929f5aedce1d539ef6fbd8843b8c06e25',
  license: 'MIT (repository LICENSE)',
  citation: 'Sun A, Park JJ, DeTomaso D, et al. Distributed AI agents enable comprehensive discovery of biological insights at scale. bioRxiv (2026). doi:10.64898/2026.10.15.759436',
  training: { path: 'data/inputs/holdout/151_TH_Prkcd_Grin2c_Glut_deg_counts_training.csv',
    sha256: '48fb8105306c5444815f5fa82affeb83ca439ccb20751783172fe545881098f3' },
  holdout: { path: 'data/inputs/holdout/151_TH_Prkcd_Grin2c_Glut_deg_counts_holdouts.csv',
    sha256: '2b037b1287bd74f0122bfa74241a44ec34839e62b9e9e01ba3d68d3721ac26dc' },
});

export function parseCounts(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== 'target_name,n_degs') throw new Error('unexpected_header');
  const counts = {};
  for (const line of lines.slice(1)) {
    const [gene, n, extra] = line.split(',');
    if (extra !== undefined || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(gene) || !/^\d+$/.test(n) || Object.hasOwn(counts, gene))
      throw new Error('invalid_row');
    counts[gene] = Number(n);
  }
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [trainingPath, holdoutPath] = process.argv.slice(2);
  const read = async (path, expected) => {
    const bytes = await readFile(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== expected) throw new Error(`sha256_mismatch ${path} ${sha256}`);
    return parseCounts(bytes.toString('utf8'));
  };
  const training = await read(trainingPath, SOURCE.training.sha256);
  const holdout = await read(holdoutPath, SOURCE.holdout.sha256);
  if (Object.keys(holdout).some(g => Object.hasOwn(training, g))) throw new Error('holdout_overlaps_training');
  await writeFile(new URL('./data/perturbseq-holdout.json', import.meta.url), JSON.stringify({
    source: SOURCE, cellGroup: '151 TH Prkcd Grin2c Glut',
    endpoint: 'n_degs: number of measured genes with Benjamini-Hochberg adjusted Wilcoxon p < 0.05 in the cell group',
    training, holdout }, null, 1) + '\n');
}
