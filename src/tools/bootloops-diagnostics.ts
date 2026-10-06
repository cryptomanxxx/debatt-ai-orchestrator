import { readServiceJson } from './bootloops-service.ts';
import type { BootLoopsService } from './bootloops-service.ts';

export const DIAGNOSTIC_STAGES = ['transport', 'json', 'validate', 'fit', 'full'] as const;
const fixture = { banked: [['0','1/2'],['1','2/3'],['2','3/4'],['3','4/5'],['6','7/8'],['7','8/9']],
  holdout: [['4','5/6'],['5','6/7']] };

// Fixed, bounded diagnostic work only. This endpoint never accepts sample data.
export async function diagnoseBootLoops(input: unknown, service?: BootLoopsService) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { status: 400, data: { error: 'invalid_diagnostic_request' } };
  const args = input as Record<string, unknown>;
  if (Object.keys(args).length !== 1 || typeof args.stage !== 'string'
    || !DIAGNOSTIC_STAGES.some(stage => stage === args.stage))
    return { status: 400, data: { error: 'invalid_diagnostic_request' } };
  if (!service) return { status: 503, data: { error: 'bootloops_runtime_unavailable' } };
  try {
    const response = await service.fetch(new Request('https://bootloops.internal/v1/diagnostics/bootloops/' + args.stage, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture), signal: AbortSignal.timeout(5000)
    }));
    if (response.status !== 200) throw new Error('Diagnostic service failed');
    const result = await readServiceJson(response);
    if (!result || result.diagnostic !== true || result.stage !== args.stage
      || result.fixture !== 'rational-v1' || Object.keys(result).length !== 3)
      throw new Error('Unexpected diagnostic response');
    return { status: 200, data: result };
  } catch { return { status: 502, data: { error: 'bootloops_diagnostic_failed' } }; }
}
