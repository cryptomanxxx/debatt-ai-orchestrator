// Fixed synthetic controls only; no model calls or database writes.
import { makeCases, fraction, validateTool } from '../research/ratfit.mjs';
import { appendFile } from 'node:fs/promises';

const key = process.env.ORCHESTRATOR_API_KEY || '';
if (key.length < 24) throw new Error('ORCHESTRATOR_API_KEY saknas');
let failed = false;
for (const fixture of makeCases('20261006')) {
  for (const control of ['positive', 'negative']) {
    const input = structuredClone(fixture.input);
    if (control === 'negative') {
      const [n, d = '1'] = input.holdout[0][1].split('/').map(BigInt);
      input.holdout[0][1] = fraction(n + d, d);
    }
    let status = null, valid = false;
    try {
      const response = await fetch('https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/query', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'bootloops_ratfit', input }),
      });
      status = response.status;
      const raw = await response.text();
      if (raw.length > 65536) throw new Error('Oversized response');
      validateTool(status, JSON.parse(raw), control === 'positive', 3);
      valid = true;
    } catch { failed = true; }
    // Only local labels, HTTP status and validation result reach the log.
    const line = `Fall ${fixture.id}, ${control}: HTTP ${status ?? 'network'}, ${valid ? 'passed' : 'failed'}`;
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, line + '\n\n');
  }
}
if (failed) throw new Error('Forskningsdatans Ratfit-kontroller misslyckades');
