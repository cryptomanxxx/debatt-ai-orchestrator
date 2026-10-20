import { timingSafeEqual } from 'node:crypto';
import { researchInference } from './research-inference.ts';
import type { ResearchKeys } from './research-inference.ts';
import type { Config } from './config.ts';
import { defaultModelProfile } from './models/profile.ts';
import { executeQuery } from './query.ts';
import { diagnoseBootLoops } from './tools/bootloops-diagnostics.ts';
import type { BootLoopsService } from './tools/bootloops-service.ts';
import type { BootLoopsExecutor } from './tools/registry.ts';

// Shared API routing for the Node server and the Cloudflare Worker. Each transport supplies
// its own BootLoops runtime: a local Python process or the internal service binding.
export type ApiRuntime = { bootloops?: BootLoopsExecutor; diagnostics?: BootLoopsService; research?: ResearchKeys };

const MAX_BODY_BYTES = 32768;
const encoder = new TextEncoder();
export const json = (status: number, data: unknown) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' }
});

export async function handleApiRequest(request: Request, config: Config, runtime: ApiRuntime = {}): Promise<Response> {
  const { pathname, search } = new URL(request.url);
  if (request.method === 'GET' && pathname === '/health' && !search)
    return json(200, { status: 'ok', service: 'debatt-ai-orchestrator' });
  const profile = request.method === 'GET' && pathname === '/v1/model-profile';
  const diagnostic = pathname === '/v1/diagnostics/bootloops';
  const research = pathname === '/v1/research/inference';
  if ((!profile && (request.method !== 'POST' || (!diagnostic && !research && pathname !== '/v1/query'))) || search)
    return json(404, { error: 'not_found' });
  const actual = encoder.encode(request.headers.get('Authorization') ?? '');
  const expected = encoder.encode(`Bearer ${config.apiKey}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return json(401, { error: 'unauthorized' });
  if (profile) return json(200, defaultModelProfile(config));
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json')
    return json(415, { error: 'application_json_required' });

  // Enforce the byte limit while streaming, including bodies without Content-Length.
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel();
          return json(413, { error: 'request_too_large' });
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
  } catch { return json(400, { error: 'invalid_body' }); }
  finally { reader?.releaseLock(); }
  let input: unknown;
  try { input = JSON.parse(body); }
  catch { return json(400, { error: 'invalid_json' }); }
  const result = research ? await researchInference(input, runtime.research ?? {})
    : diagnostic ? await diagnoseBootLoops(input, runtime.diagnostics)
    : await executeQuery(input, config, runtime.bootloops);
  return json(result.status, result.data);
}
