import { randomUUID } from 'node:crypto';
export const BOOTLOOPS_TOOL = 'bootloops_ratfit';
export const BOOTLOOPS_COMMIT = '66b680ce742e654cfe86da4f072a69061fe182b1';
export type RatfitInput = { banked: [string, string][]; holdout: [string, string][] };
export type RatfitReport = { accepted: boolean; depth: number | null; checked: number; failed: number };
export type BootLoopsExecutor = (input: RatfitInput) => Promise<RatfitReport>;
export class BootLoopsInputError extends Error {}

export function validateRatfitInput(input: unknown): RatfitInput {
  const invalid = () => { throw new BootLoopsInputError('invalid_bootloops_input'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const obj = input as Record<string, unknown>;
  if (Object.keys(obj).some(key => !['banked', 'holdout'].includes(key))) return invalid();
  const seen = new Set<string>();
  const rational = (value: unknown) => {
    if (typeof value !== 'string' || !/^-?\d{1,24}(?:\/[1-9]\d{0,23})?$/.test(value)) return invalid();
    const [num, den = 1n] = value.split('/').map(BigInt);
    let a = num < 0n ? -num : num, b = den;
    while (b) [a, b] = [b, a % b];
    return { raw: value, canonical: `${num / a}/${den / a}` };
  };
  const rows = (value: unknown, min: number, max: number): [string, string][] => {
    if (!Array.isArray(value) || value.length < min || value.length > max) return invalid();
    return value.map(row => {
      if (!Array.isArray(row) || row.length !== 2) return invalid();
      const x = rational(row[0]), y = rational(row[1]);
      if (seen.has(x.canonical)) return invalid();
      seen.add(x.canonical);
      return [x.raw, y.raw];
    });
  };
  return { banked: rows(obj.banked, 4, 12), holdout: rows(obj.holdout, 2, 8) };
}

export async function runBootLoops(input: RatfitInput, execute: BootLoopsExecutor) {
  const started = performance.now();
  const report = await execute(input);
  const fitRefused = !report.accepted && report.depth === null && report.checked === 0 && report.failed === 0;
  if (typeof report.accepted !== 'boolean' || (!fitRefused && report.checked !== input.holdout.length)
    || !Number.isInteger(report.failed) || report.failed < 0 || report.failed > report.checked
    || (report.depth !== null && (!Number.isInteger(report.depth) || report.depth < 1 || report.depth > input.banked.length))
    || (report.accepted && (report.failed !== 0 || report.depth === null))
    || (!report.accepted && report.failed === 0 && !fitRefused)) throw new Error('Invalid BootLoops report');
  return { id: randomUUID(), answer: report.accepted ? 'Exact match at all held-out points.' : 'Rational reconstruction refused.',
    model: null, provider: 'bootloops', mode: 'tool', mock: false,
    plan: { version: 1, strategy: 'exact_rational_reconstruction', steps: [{ kind: 'tool', tool: BOOTLOOPS_TOOL }, { kind: 'verify' }] },
    trace: [{ step: 1, kind: 'tool', status: 'completed', durationMs: Math.round(performance.now() - started) },
      { step: 2, kind: 'verify', status: report.accepted ? 'passed' : 'failed' }],
    toolResult: { tool: BOOTLOOPS_TOOL, upstreamCommit: BOOTLOOPS_COMMIT, ...report },
    verification: { status: report.accepted ? 'passed' : 'failed', scope: 'exact_rational_holdout',
      checks: ['exact_fraction_arithmetic', 'disjoint_holdout_points', ...(fitRefused ? [] : ['heldout_values_match'])], factualityChecked: false } };
}
