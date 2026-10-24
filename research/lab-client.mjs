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

// Free HIP/Blablador models rate-limit bursts of calls (HTTP 429), a provider can drop a
// connection, and a model can return an empty answer. The lab therefore spaces its model calls and
// repeats a request that failed in one of these ways once, after a pause. An empty answer holds no
// answer, so its repeat gives the model no second attempt at the question; a truncated one does,
// and is never repeated. A repeat is the same request, not a second answer: it does not
// count against the call budget, and the run reports how many there were (modelRetries).
export const TRANSIENT_MODEL_ERRORS = Object.freeze(['model_upstream_http_error', 'model_transport_error', 'model_empty_response']);
// A rejected key or an exhausted quota will not pass on a repeat: those stop the run at once.
const TERMINAL_UPSTREAM_STATUSES = Object.freeze([401, 402, 403]);
// The research gateway names its failures; only these are worth repeating.
const RETRYABLE_GATEWAY_ERRORS = Object.freeze(['benchmark_upstream_rate_limited', 'benchmark_upstream_failed',
  'benchmark_catalog_unavailable', 'benchmark_transport_failed', 'benchmark_missing_answer']);
const retryable = error => error instanceof ResearchError && TRANSIENT_MODEL_ERRORS.includes(error.message)
  && error.retryable !== false && !TERMINAL_UPSTREAM_STATUSES.includes(error.diagnostic.upstreamStatus);
export const MAX_MODEL_RETRIES = 3;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// A ranked model's failure names the model the lab asked for, whatever went wrong.
async function identified(provider, model, send) {
  try { return await send(); } catch (error) {
    if (error instanceof ResearchError && !error.diagnostic.model)
      error.diagnostic = new ResearchError(error.message, { ...error.diagnostic, provider, model }).diagnostic;
    throw error;
  }
}

// A call may ask for the deep limit ({ deep: true }): the tree-search hypothesis and claim steps,
// where a reasoning model's own reasoning counts against the limit. It gets longer timeouts.
export const DEEP_TOKEN_LIMIT = 8192;

export function createLabClient({ key, api = LAB_API, completionTokenLimit = 4096, maxModelCalls = 7,
  spacingMs = 0, retryDelayMs = 0, maxRetries = MAX_MODEL_RETRIES, sleep = pause }) {
  let modelCalls = 0, modelRetries = 0;
  async function modelCall(send) {
    if (++modelCalls > maxModelCalls) throw new ResearchError('model_budget_exceeded');
    if (modelCalls > 1 && spacingMs > 0) await sleep(spacingMs);
    try { return await send(); } catch (error) {
      if (!retryable(error) || modelRetries >= maxRetries) throw error;
      modelRetries++;
      await sleep(retryDelayMs);
      return send();
    }
  }
  async function query(body, timeoutMs = 55000) {
    const kind = body.tool ? 'tool' : 'model';
    try {
      const response = await fetch(api, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!(body.tool ? [200, 422] : [200]).includes(response.status)) {
        let code = `${kind}_http_error`, upstreamStatus, provider, model;
        try {
          const data = await readJson(response);
          if (kind === 'model' && ['model_upstream_http_error', 'model_output_truncated',
            'model_empty_response', 'model_invalid_response', 'model_transport_error'].includes(data?.error)) {
            code = data.error;
            ({ upstreamStatus, provider, model } = data);
          }
        } catch { /* An untrusted body never becomes public diagnostic text. */ }
        throw new ResearchError(code, { httpStatus: response.status, upstreamStatus, provider, model });
      }
      return { status: response.status, data: await readJson(response) };
    } catch (error) {
      if (error instanceof ResearchError) throw error;
      throw new ResearchError(`${kind}_transport_error`);
    }
  }
  // Every mode shares the call ceiling. Each proposer locks its own provider/model identity.
  const proposer = mode => lockModel((messages, { deep = false } = {}) => modelCall(async () => {
    const limit = deep ? DEEP_TOKEN_LIMIT : completionTokenLimit;
    const result = await query({ message: JSON.stringify({ instruction: 'Följ denna konversation och svara endast med begärd JSON.', messages }), mode, completionTokenLimit: limit },
      deep ? 110000 : 55000);
    if (result.status !== 200 || result.data.mock !== false) throw new ResearchError('invalid_model_response');
    if (result.data.inference?.completionTokenLimit !== limit) throw new ResearchError('model_budget_not_applied');
    return { text: result.data.answer, provider: result.data.provider, model: result.data.model };
  }));

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
  const researchProposer = ({ provider, model, root }) => lockModel((messages, { deep = false } = {}) => modelCall(() => identified(provider, model, async () => {
    const payload = { provider, model, profile: deep ? 'lab-deep' : 'lab', max_tokens: deep ? DEEP_TOKEN_LIMIT : completionTokenLimit, messages: [{ role: 'user',
      content: JSON.stringify({ instruction: 'Följ denna konversation och svara endast med begärd JSON.', messages }) }] };
    let response;
    try {
      response = await fetch(api.replace(/\/v1\/query$/, '/v1/research/benchmark'), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(deep ? 140000 : 80000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch { throw new ResearchError('model_transport_error'); }
    let data;
    try { data = await readJson(response); } catch { throw new ResearchError('model_invalid_response', { httpStatus: response.status }); }
    if (response.status !== 200) {
      const error = new ResearchError(GATEWAY_ERRORS[data?.error] ?? 'model_upstream_http_error', { httpStatus: response.status, provider, model });
      error.retryable = RETRYABLE_GATEWAY_ERRORS.includes(data?.error);
      throw error;
    }
    if (data?.status !== 'completed_unverified' || data.provider !== provider || data.model !== model || typeof data.answer !== 'string')
      throw new ResearchError('invalid_model_response');
    // An alias must still run the backing model its ranking evidence came from.
    if (root && data.resolved_model !== root) throw new ResearchError('model_identity_mismatch');
    if (data.finish_reason !== 'stop') throw new ResearchError('model_output_truncated');
    return { text: unwrapJsonAnswer(data.answer), provider: data.provider, model: data.model };
  })));
  return { query, proposer, researchProposer, modelCalls: () => modelCalls, modelRetries: () => modelRetries };
}
