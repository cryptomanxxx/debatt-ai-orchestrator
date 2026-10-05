import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.ts';
import type { Config } from './config.ts';
import { CalculationError } from './tools/calculator.ts';
import { orchestrate } from './orchestrator.ts';
export function createApp(config: Config) {
  return createServer(async (req, res) => {
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', service: 'debatt-ai-orchestrator' });
    if (req.method !== 'POST' || req.url !== '/v1/query') return send(404, { error: 'not_found' });
    const actual = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.apiKey}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(401, { error: 'unauthorized' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'application_json_required' });
    let body = '';
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 32768) { send(413, { error: 'request_too_large' }); req.resume(); return; }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString('utf8');
    } catch { return send(400, { error: 'invalid_body' }); }
    let input;
    try { input = JSON.parse(body); } catch { return send(400, { error: 'invalid_json' }); }
    if (!input || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 8000
      || (input.mode !== undefined && !['default', 'reasoning', 'auto'].includes(input.mode)))
      return send(400, { error: 'invalid_request' });
    const mode = input.mode ?? 'default';
    if (mode === 'reasoning' && config.provider !== 'mock' && !config.reasoningModel)
      return send(400, { error: 'reasoning_not_configured' });
    try { send(200, await orchestrate(input.message.trim(), mode, config)); }
    catch (error) {
      if (error instanceof CalculationError) return send(400, { error: error.message });
      send(502, { error: 'model_request_failed' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createApp(loadConfig());
  server.requestTimeout = 60000;
  server.listen(port, '0.0.0.0', () => console.log(`Orchestrator listening on port ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
