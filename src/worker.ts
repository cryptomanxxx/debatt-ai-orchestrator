import { researchRoute } from './research-dashboard/api.ts';
import { loadConfig } from './config.ts';
import { handleApiRequest, json } from './http.ts';
import { serviceExecutor } from './tools/bootloops-service.ts';
import type { ResearchKeys } from './research-inference.ts';
import type { BootLoopsService } from './tools/bootloops-service.ts';
type WorkerEnv = { BOOTLOOPS?: BootLoopsService; [key: string]: string | BootLoopsService | undefined };

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    // Configuration comes from this request's bindings, never process.env or cached globals.
    const strings = Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
    const dashboard = await researchRoute(request, strings);
    if (dashboard) return dashboard;
    let config;
    try { config = loadConfig(strings); }
    catch { return json(503, { error: 'service_not_configured' }); }
    const service = env.BOOTLOOPS && typeof env.BOOTLOOPS !== 'string' ? env.BOOTLOOPS : undefined;
    return handleApiRequest(request, config, { bootloops: service ? serviceExecutor(service) : undefined, diagnostics: service, research: strings as ResearchKeys });
  }
};
