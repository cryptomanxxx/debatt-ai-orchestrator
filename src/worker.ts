import { timingSafeEqual } from 'node:crypto';
import { loadConfig } from './config.ts';
import { executeQuery } from './query.ts';

const MAX_BODY_BYTES = 32768;
const encoder = new TextEncoder();
const json = (status: number, data: unknown) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' }
});

export default {
  async fetch(request: Request, env: Record<string, string | undefined>): Promise<Response> {
    // Configuration comes from this request's bindings, never process.env or cached globals.
    let config;
    try { config = loadConfig(env); }
    catch { return json(503, { error: 'service_not_configured' }); }
    const { pathname, search } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/health' && !search)
      return json(200, { status: 'ok', service: 'debatt-ai-orchestrator' });
    if (request.method !== 'POST' || pathname !== '/v1/query' || search)
      return json(404, { error: 'not_found' });
    const actual = encoder.encode(request.headers.get('Authorization') ?? '');
    const expected = encoder.encode(`Bearer ${config.apiKey}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return json(401, { error: 'unauthorized' });
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
    const result = await executeQuery(input, config);
    return json(result.status, result.data);
  }
};
