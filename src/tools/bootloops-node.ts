import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { BootLoopsExecutor } from './bootloops.ts';

const bridge = fileURLToPath(new URL('../../scripts/bootloops_bridge.py', import.meta.url));
let active = 0;
// Imported only by the Node transport; never bundled into Cloudflare Workers.
export const executeBootLoopsPython: BootLoopsExecutor = input => new Promise((resolve, reject) => {
  if (active >= 2) return reject(new Error('BootLoops capacity reached'));
  active++;
  const child = execFile('python3', ['-I', '-B', bridge], {
    timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 16384,
    // Inference and orchestrator secrets must not be inherited by the tool process.
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' }
  }, (error, stdout) => {
    active--;
    if (error) return reject(new Error('BootLoops execution failed'));
    try { resolve(JSON.parse(stdout)); }
    catch { reject(new Error('Invalid BootLoops output')); }
  });
  child.stdin?.on('error', () => { /* execFile callback handles process failure. */ });
  child.stdin?.end(JSON.stringify(input));
});
