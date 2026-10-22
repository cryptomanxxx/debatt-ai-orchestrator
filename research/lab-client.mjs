// The lab's model and tool client: /v1/query modes and benchmark-ranked research models, each with a
// shared model-call ceiling and a locked provider/model identity per proposer (lockModel).
import { ResearchError } from './errors.mjs';
import { lockModel } from './catalog.mjs';
import { unwrapJsonAnswer } from './lab-models.mjs';

export const LAB_API = 'https://debatt-ai-orchestrator.xx8031126.workers.dev/v1/query';

export async function readJson(response, max = 65536) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Tomt serversvar');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw new Error('För stort serversvar'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

export function createLabClient({ key, api = LAB_API, completionTokenLimit = 4096, maxModelCalls = 7 }) {
  let modelCalls = 0;
  async function query(body) {
    const kind = body.tool ? 'tool' : 'model';
    try {
      const response = await fetch(api, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!(body.tool ? [200, 422] : [200]).includes(response.status)) {
        let code = `${kind}_http_error`, upstreamStatus;
        try {
          const data = await readJson(response);
          if (kind === 'model' && ['model_upstream_http_error', 'model_output_truncated',
            'model_empty_response', 'model_invalid_response', 'model_transport_error'].includes(data?.error)) {
            code = data.error;
            upstreamStatus = data.upstreamStatus;
          }
        } catch { /* An untrusted body never becomes public diagnostic text. */ }
        throw new ResearchError(code, { httpStatus: response.status, upstreamStatus });
      }
      return { status: response.status, data: await readJson(response) };
    } catch (error) {
      if (error instanceof ResearchError) throw error;
      throw new ResearchError(`${kind}_transport_error`);
    }
  }
  // Every mode shares the call ceiling. Each proposer locks its own provider/model identity.
  const proposer = mode => lockModel(async messages => {
    if (++modelCalls > maxModelCalls) throw new ResearchError('model_budget_exceeded');
    const result = await query({ message: JSON.stringify({ instruction: 'Följ denna konversation och svara endast med begärd JSON.', messages }), mode, completionTokenLimit });
    if (result.status !== 200 || result.data.mock !== false) throw new ResearchError('invalid_model_response');
    if (result.data.inference?.completionTokenLimit !== completionTokenLimit) throw new ResearchError('model_budget_not_applied');
    return { text: result.data.answer, provider: result.data.provider, model: result.data.model };
  });

  // A benchmark-ranked HIP/Blablador model, called through the Worker's research gateway with the
  // lab's token budget. It shares the call ceiling and locks its own identity like any mode.
  // The gateway's fixed error codes keep their category in the lab's diagnostics; provider HTTP,
  // quota, rate-limit and catalog failures stay model_upstream_http_error with the HTTP status.
  const GATEWAY_ERRORS = Object.freeze({
    benchmark_transport_failed: 'model_transport_error',
    benchmark_invalid_upstream_json: 'model_invalid_response', benchmark_invalid_response: 'model_invalid_response',
    benchmark_response_too_large: 'oversized_provider_response',
    benchmark_invalid_finish_reason: 'incomplete_model_response',
    benchmark_token_budget_exceeded: 'model_budget_not_applied',
    benchmark_missing_answer: 'model_empty_response',
    benchmark_model_identity_mismatch: 'model_identity_mismatch',
  });
  // The request may include a catalog lookup (up to 25 s) before the 50-second lab completion.
  const researchProposer = ({ provider, model, root }) => lockModel(async messages => {
    if (++modelCalls > maxModelCalls) throw new ResearchError('model_budget_exceeded');
    const payload = { provider, model, profile: 'lab', max_tokens: completionTokenLimit, messages: [{ role: 'user',
      content: JSON.stringify({ instruction: 'Följ denna konversation och svara endast med begärd JSON.', messages }) }] };
    let response;
    try {
      response = await fetch(api.replace(/\/v1\/query$/, '/v1/research/benchmark'), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(80000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch { throw new ResearchError('model_transport_error'); }
    let data;
    try { data = await readJson(response); } catch { throw new ResearchError('model_invalid_response', { httpStatus: response.status }); }
    if (response.status !== 200)
      throw new ResearchError(GATEWAY_ERRORS[data?.error] ?? 'model_upstream_http_error', { httpStatus: response.status });
    if (data?.status !== 'completed_unverified' || data.provider !== provider || data.model !== model || typeof data.answer !== 'string')
      throw new ResearchError('invalid_model_response');
    // An alias must still run the backing model its ranking evidence came from.
    if (root && data.resolved_model !== root) throw new ResearchError('model_identity_mismatch');
    if (data.finish_reason !== 'stop') throw new ResearchError('model_output_truncated');
    return { text: unwrapJsonAnswer(data.answer), provider: data.provider, model: data.model };
  });
  return { query, proposer, researchProposer, modelCalls: () => modelCalls };
}
