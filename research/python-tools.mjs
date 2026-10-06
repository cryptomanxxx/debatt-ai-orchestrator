import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import manifest from './toolchain.json' with { type: 'json' };
import { ResearchError } from './errors.mjs';
const bridge = fileURLToPath(new URL('../scripts/science_bridge.py', import.meta.url));
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex');
export function callScienceTool(tool, input) {
  if (!['annihilator','mixalot','statsmodels'].includes(tool)) throw new ResearchError('invalid_tool_evidence');
  const raw = JSON.stringify(input);
  if (Buffer.byteLength(raw) > 16384) throw new ResearchError('invalid_tool_evidence');
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.RESEARCH_PYTHON || 'python3', ['-I', bridge, tool],
      { timeout: 20000, maxBuffer: 65536, env: { PATH: process.env.PATH, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' } }, (error, stdout) => {
        if (error) return reject(new ResearchError('tool_transport_error'));
        try { resolve(JSON.parse(stdout)); } catch { reject(new ResearchError('invalid_tool_evidence')); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(raw);
  });
}
export function validateScienceEnvelope(evidence, tool, input) {
  const pins = Object.fromEntries(Object.entries(manifest.sourceSha256).filter(([p]) => p.startsWith(tool+'/')));
  if (evidence?.tool !== tool || evidence.adapterVersion !== manifest.adapterVersion
    || evidence.runtime !== 'github-actions-python' || evidence.factualityChecked !== false
    || evidence.upstreamCommit !== (tool === 'statsmodels' ? null : manifest.upstreamCommit)
    || fingerprint(evidence.versions) !== fingerprint(manifest.packages)
    || fingerprint(evidence.sourceSha256) !== fingerprint(pins)
    || evidence.inputSha256 !== fingerprint(input) || !evidence.result || typeof evidence.result !== 'object')
    throw new ResearchError('invalid_tool_evidence');
  return evidence.result;
}
