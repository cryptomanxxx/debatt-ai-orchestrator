import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Dedicated research-only endpoint. No arbitrary URL or prompt can be supplied.
export const HIP_BASE_URL = 'https://llm-service.ai.tu-darmstadt.de/v1';
const MAX_RESPONSE_BYTES = 1024 * 1024;
export class HipTestError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    if (status !== undefined) this.httpStatus = status;
  }
}
function validModel(id, key) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/ -]{0,199}$/.test(id)
    && id === id.trim() && !id.includes(key);
}
async function readBoundedJson(response) {
  if (!response.body) throw new HipTestError('empty_response');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new HipTestError('response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HipTestError('invalid_json'); }
  } finally { reader.releaseLock(); }
}
export async function testHip({ apiKey, mode = 'list-models', model = '', fetchImpl = fetch }) {
  if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 4096 || /\s/.test(apiKey))
    throw new HipTestError('missing_or_invalid_hip_api_key');
  if (!['list-models', 'smoke-test'].includes(mode)) throw new HipTestError('invalid_mode');
  if (mode === 'smoke-test' && !validModel(model, apiKey)) throw new HipTestError('invalid_model');
  let requests = 0;
  async function request(path, payload) {
    requests++;
    try {
      const response = await fetchImpl(HIP_BASE_URL + path, {
        method: payload ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(45000),
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new HipTestError('hip_http_error', response.status);
      }
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof HipTestError) throw error;
      // Exceptions and upstream error bodies can contain credentials. Never publish them.
      throw new HipTestError('hip_transport_error');
    }
  }
  const listed = await request('/models');
  if (!Array.isArray(listed?.data) || listed.data.length === 0 || listed.data.length > 2000
    || listed.data.some(row => !validModel(row?.id, apiKey))) throw new HipTestError('invalid_model_list');
  const modelIds = [...new Set(listed.data.map(row => row.id))].sort();
  const report = { schemaVersion: 1, provider: 'hessian.AI HIP', purpose: 'internal-research-connection-test',
    baseUrl: HIP_BASE_URL, mode, modelIds, inference: null, scientificBenchmark: false };
  if (mode === 'smoke-test') {
    if (!modelIds.includes(model)) throw new HipTestError('model_not_accessible');
    const start = performance.now();
    const reply = await request('/chat/completions', {
      model, messages: [{ role: 'user', content: 'Reply with exactly the word OK and nothing else.' }],
      max_tokens: 1024, stream: false,
    });
    const latencyMs = Math.round(performance.now() - start);
    const choice = reply?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new HipTestError('output_truncated');
    if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string'
      || choice.message.content.trim() !== 'OK') throw new HipTestError('unexpected_completion');
    const usage = {};
    for (const field of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
      if (reply.usage?.[field] !== undefined) {
        if (!Number.isSafeInteger(reply.usage[field]) || reply.usage[field] < 0) throw new HipTestError('invalid_usage');
        usage[field] = reply.usage[field];
      }
    }
    if (!validModel(reply.model, apiKey)) throw new HipTestError('invalid_response_model');
    report.inference = { requestedModel: model, responseModel: reply.model,
      responseMatched: true, maxOutputTokens: 1024, latencyMs, usage };
  }
  return { ...report, requests, status: 'completed' };
}
export function hipMarkdown(report) {
  return '# HIP: anslutningstest\n\n'
    + 'Endast intern forskning. Modellista och högst ett kort syntetiskt anrop; detta är inget vetenskapligt benchmark.\n\n'
    + (report.status === 'completed' ? `Status: slutfört. Läge: ${report.mode}. HTTP-anrop: ${report.requests}.\n\n`
      + '| Tillgängliga modell-ID:n |\n| --- |\n' + report.modelIds.map(id => `| \`${id}\` |`).join('\n')
      + (report.inference ? `\n\nTestad modell: \`${report.inference.requestedModel}\`. Returnerat modell-ID: \`${report.inference.responseModel}\`. Svaret matchade OK. Svarstid: ${report.inference.latencyMs} ms. Tokenförbrukning: ${JSON.stringify(report.inference.usage)}.\n` : '\n\nIngen inferens beställd. Välj ett exakt chat-modell-ID från listan för ett separat smoke-test.\n')
      : `Status: driftfel. Felkod: ${report.failure.code}${report.failure.httpStatus ? `; HTTP ${report.failure.httpStatus}` : ''}.\n`);
}
async function main() {
  let report;
  try {
    report = await testHip({ apiKey: process.env.HIP_API_KEY,
      mode: process.env.HIP_TEST_MODE || 'list-models', model: process.env.HIP_TEST_MODEL || '' });
  } catch (error) {
    report = { schemaVersion: 1, provider: 'hessian.AI HIP', status: 'error',
      failure: { code: error instanceof HipTestError ? error.code : 'unexpected_error',
        ...(error instanceof HipTestError && error.httpStatus ? { httpStatus: error.httpStatus } : {}) } };
    process.exitCode = 1;
  }
  report.createdAt = new Date().toISOString();
  report.codeCommit = process.env.GITHUB_SHA || null;
  report.runUrl = /^\d+$/.test(process.env.GITHUB_RUN_ID || '')
    ? `https://github.com/cryptomanxxx/debatt-ai-orchestrator/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
  await mkdir('reports/hip-test', { recursive: true });
  const markdown = hipMarkdown(report);
  await writeFile('reports/hip-test/report.json', JSON.stringify(report, null, 2));
  await writeFile('reports/hip-test/report.md', markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
