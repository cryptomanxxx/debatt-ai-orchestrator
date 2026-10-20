import { researchBenchmark } from './research-benchmark-gateway.ts';
import { timingSafeEqual } from 'node:crypto';
import { discoverResearchModels } from './research-model-catalog.ts';
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
  const benchmark = pathname === '/v1/research/benchmark';
  const catalog = pathname === '/v1/research/models';
  if ((!profile && !catalog && (request.method !== 'POST' || (!diagnostic && !research && !benchmark && pathname !== '/v1/query'))) ||
      (catalog && request.method !== 'GET') || search)
    return json(404, { error: 'not_found' });
  const actual = encoder.encode(request.headers.get('Authorization') ?? '');
  const expected = encoder.encode(`Bearer ${config.apiKey}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return json(401, { error: 'unauthorized' });
  if (profile) return json(200, defaultModelProfile(config));
  if (catalog) {
    // Fixed two-provider inventory: no user-controlled URL, query string, or HTTP body.
    const outputs = await Promise.all(['hip','blablador'].map(name=>discoverResearchModels(name,runtime.research??{})));
    return json(200,{status:'discovered_unverified',providers:{hip:outputs[0].data,blablador:outputs[1].data}});
  }
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
  const result = benchmark ? await researchBenchmark(input, runtime.research ?? {})
    : research ? await researchInference(input, runtime.research ?? {})
    : diagnostic ? await diagnoseBootLoops(input, runtime.diagnostics)
    : await executeQuery(input, config, runtime.bootloops);
  return json(result.status, result.data);
}
