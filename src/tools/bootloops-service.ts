import type { BootLoopsExecutor } from './bootloops.ts';
export type BootLoopsService = { fetch(request: Request): Promise<Response> };

export async function readServiceJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty BootLoops response');
  let bytes = 0, text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new Error('BootLoops response too large'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  return JSON.parse(text);
}

export function serviceExecutor(service: BootLoopsService): BootLoopsExecutor {
  return async input => {
    // This new internal request never forwards caller or model credentials.
    const response = await service.fetch(new Request('https://bootloops.internal/v1/ratfit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(5000)
    }));
    if (![200, 422].includes(response.status)) throw new Error('BootLoops service failed');
    const report = await readServiceJson(response);
    if (report?.accepted !== (response.status === 200)) throw new Error('BootLoops status mismatch');
    return report;
  };
}
