import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.ts';
import type { Config } from './config.ts';
import { handleApiRequest } from './http.ts';
import { executeBootLoopsPython } from './tools/bootloops-node.ts';

// Streams the Node request body with backpressure. Cancelling (for example after the 32 KiB
// limit) drains the remaining upload instead of destroying the socket, so the 413 still arrives.
function requestBody(req: IncomingMessage) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      req.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
        if ((controller.desiredSize ?? 1) <= 0) req.pause();
      });
      req.once('end', () => { try { controller.close(); } catch { /* Already cancelled. */ } });
      req.once('error', error => { try { controller.error(error); } catch { /* Already cancelled. */ } });
    },
    pull() { req.resume(); },
    cancel() { req.removeAllListeners('data'); req.resume(); }
  });
}

function toRequest(req: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers))
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, item);
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(new URL(req.url ?? '/', 'http://localhost'), {
    method, headers, ...(hasBody ? { body: requestBody(req), duplex: 'half' } : {})
  } as RequestInit);
}

export function createApp(config: Config) {
  return createServer(async (req, res) => {
    let response: Response;
    try { response = await handleApiRequest(toRequest(req), config, { bootloops: executeBootLoopsPython }); }
    catch { response = Response.json({ error: 'invalid_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
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
