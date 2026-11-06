import { isDurableAITool } from '../_shared/ai-tool-registry.ts';
import {
  isUUID, MAX_REQUEST_BYTES, MAX_RESULT_BYTES, publicJob, RESULT_TTL_MS,
  SSEFrames, TOOL_WORKER_BUDGET_MS, TRANSPORT_MODE, type ToolEvent, type ToolJob, type ToolResult,
} from './protocol.ts';

export interface JobStore {
  create(job: Record<string, unknown>): Promise<ToolJob>;
  byRequest(requestId: string, owner: string): Promise<ToolJob | null>;
  get(id: string, owner: string): Promise<ToolJob | null>;
  list(owner: string, functionName?: string, scopeKey?: string, includeResult?: boolean): Promise<ToolJob[]>;
  claim(id: string, owner: string): Promise<boolean>;
  update(id: string, patch: Record<string, unknown>, signal?: AbortSignal): Promise<void>;
  append(id: string, events: ToolEvent[], signal?: AbortSignal): Promise<void>;
  events(id: string, after: number, limit: number): Promise<ToolEvent[]>;
}

export interface TransportDependencies {
  store: JobStore;
  authenticate(token: string): Promise<string | null>;
  upstream(request: Request): Promise<Response>;
  baseUrl: string;
  publishableKey: string;
  waitUntil(work: Promise<void>): void;
  wakeNative?(job: ToolJob, token: string): Promise<void>;
  now?: () => number;
  workerTimeoutMs?: number;
  log?: (message: string) => void;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-ai-request-id, x-ai-scope',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Cache-Control': 'no-store',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

async function boundedBody(request: Request): Promise<Uint8Array> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
      parts.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.length; }
  return body;
}

async function fingerprint(functionName: string, contentType: string, body: Uint8Array) {
  const prefix = new TextEncoder().encode(functionName + '\n' + contentType + '\n');
  const bytes = new Uint8Array(prefix.length + body.length);
  bytes.set(prefix); bytes.set(body, prefix.length);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** One execution only. A lost status response never repeats an upstream mutation. */
export async function executeTool(
  deps: TransportDependencies, job: ToolJob, token: string, body: Uint8Array, contentType: string,
  deadlineAt?: number,
) {
  const { store } = deps;
  const now = deps.now || Date.now;
  const absoluteDeadline = deadlineAt ?? now() + Math.min(TOOL_WORKER_BUDGET_MS, Math.max(1, deps.workerTimeoutMs ?? TOOL_WORKER_BUDGET_MS));
  if (!await store.claim(job.id, job.requested_by)) return;
  const controller = new AbortController();
  const lifetime = setTimeout(() => controller.abort(), Math.max(0, absoluteDeadline - now()));
  // Foreground tool calls have a 120s provider budget. Native long-running jobs
  // use their own short, relayed workers and are not sent through this transport.
  const idleMs = 140_000;
  let deadline: ReturnType<typeof setTimeout>;
  const resetDeadline = () => {
    clearTimeout(deadline);
    deadline = setTimeout(() => controller.abort(), idleMs);
  };
  const heartbeat = setInterval(() => {
    void store.update(job.id, { updated_at: new Date(now()).toISOString() }, controller.signal).catch(() => {
      deps.log?.('[AI transport] Heartbeat unavailable.');
    });
  }, 20_000);
  let captured = '';
  let result: ToolResult | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let seq = 0;
  const pending: ToolEvent[] = [];
  let lastFlush = now();
  let writes = Promise.resolve();
  const flush = async (force = false) => {
    if (controller.signal.aborted) return;
    if (!pending.length || (!force && pending.length < 25 && now() - lastFlush < 750)) return await writes;
    const batch = pending.splice(0);
    writes = writes.then(() => store.append(job.id, batch, controller.signal));
    await writes;
    lastFlush = now();
  };
  const eventFlush = setInterval(() => {
    void flush(true).catch(() => controller.abort());
  }, 1000);
  try {
    // Authentication, uploads and DB acceptance use the same Free worker. They
    // consume its wall-clock budget before any upstream operation may begin.
    if (now() >= absoluteDeadline) {
      controller.abort();
      throw new Error('WORKER_BUDGET_EXHAUSTED');
    }
    resetDeadline();
    const response = await deps.upstream(new Request(`${deps.baseUrl}/functions/v1/${job.function_name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: deps.publishableKey, 'Content-Type': contentType },
      body: body as BodyInit,
      signal: controller.signal,
    }));
    result = { httpStatus: response.status, contentType: response.headers.get('content-type') || 'application/json', body: '' };
    await store.update(job.id, { result_payload: result, progress_percentage: 10, progress_message: 'Traitement en cours.' }, controller.signal);
    const streaming = result.contentType.includes('text/event-stream');
    const frames = new SSEFrames();
    reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let byteLength = 0;
    while (reader) {
      resetDeadline();
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.length;
      if (byteLength > MAX_RESULT_BYTES) throw new Error('RESULT_TOO_LARGE');
      const text = decoder.decode(value, { stream: true });
      captured += text;
      if (streaming) {
        for (const data of frames.push(text)) pending.push({ seq: ++seq, data });
        await flush();
      }
    }
    const tail = decoder.decode();
    captured += tail;
    if (streaming) {
      for (const data of [...frames.push(tail), ...frames.finish()]) pending.push({ seq: ++seq, data });
      await flush(true);
      if (!frames.complete || frames.failed) throw new Error('INCOMPLETE_STREAM');
    }
    result.body = captured;
    // Some legacy functions send HTTP 200 with a JSON error. Preserve the body
    // for inspection, but never publish it as a successful generation.
    let applicationError = false;
    if (result.contentType.includes('application/json')) {
      let parsed: unknown;
      try { parsed = JSON.parse(captured); } catch { throw new Error('INVALID_JSON'); }
      applicationError = Boolean(parsed && typeof parsed === 'object' && (parsed as { error?: unknown }).error);
    }
    if (!response.ok || applicationError) throw new Error('UPSTREAM_FAILED');
    await store.update(job.id, {
      status: 'completed', progress_percentage: 100, progress_message: 'Résultat enregistré.',
      result_payload: result, error_message: null,
      updated_at: new Date(now()).toISOString(), completed_at: new Date(now()).toISOString(),
    });
  } catch (error) {
    // Keep partial output for recovery, never log the medical payload or upstream
    // error text, and do not automatically repeat a potentially paid operation.
    await flush(true).catch(() => {});
    const reason = error instanceof Error ? error.message : '';
    const message = reason === 'INCOMPLETE_STREAM' || reason === 'INVALID_JSON'
      ? 'La réponse est incomplète. Les éléments reçus sont conservés ; relancez explicitement si nécessaire.'
      : controller.signal.aborted
        ? 'Le serveur ne répond plus. Les éléments reçus sont conservés.'
        : 'Le traitement a été interrompu. Les éléments reçus sont conservés.';
    await store.update(job.id, {
      status: 'failed', progress_message: 'Traitement interrompu.', error_message: message,
      result_payload: result ? { ...result, body: captured } : null,
      updated_at: new Date(now()).toISOString(), completed_at: new Date(now()).toISOString(),
    }).catch(() => deps.log?.('[AI transport] Could not persist terminal status.'));
  } finally {
    clearTimeout(lifetime); clearTimeout(deadline!); clearInterval(heartbeat); clearInterval(eventFlush);
    controller.abort();
    await reader?.cancel().catch(() => {});
  }
}

export function createToolTransport(deps: TransportDependencies) {
  const now = deps.now || Date.now;
  const { store } = deps;
  return async (request: Request): Promise<Response> => {
    const deadlineAt = now() + Math.min(TOOL_WORKER_BUDGET_MS, Math.max(1, deps.workerTimeoutMs ?? TOOL_WORKER_BUDGET_MS));
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Méthode non autorisée.' }, 405);
    const authorization = request.headers.get('authorization') || '';
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
    if (!token) return json({ error: 'Connexion requise.' }, 401);
    let owner: string | null;
    try { owner = await deps.authenticate(token); } catch { return json({ error: 'Authentification indisponible.' }, 503); }
    if (!owner) return json({ error: 'Session invalide.' }, 401);
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'start';
    try {
      if (action === 'list' || action === 'latest') {
        const functionName = url.searchParams.get('functionName') || undefined;
        const scope = url.searchParams.get('scopeKey') || undefined;
        if ((functionName && functionName.length > 80) || (scope && scope.length > 256)) return json({ error: 'Filtre invalide.' }, 400);
        const jobs = await store.list(owner, functionName, scope, action === 'latest');
        return action === 'latest' ? json({ job: jobs[0] ? publicJob(jobs[0], true, now()) : null })
          : json({ jobs: jobs.map(job => publicJob(job, false, now())) });
      }
      if (action === 'status' || action === 'lookup') {
        const isLookup = action === 'lookup';
        if (isLookup && request.method !== 'GET') return json({ error: 'Méthode non autorisée.' }, 405);
        const id = url.searchParams.get('jobId');
        const requestId = url.searchParams.get('requestId');
        if (isLookup ? !isUUID(requestId) || id !== null : !isUUID(id) && !isUUID(requestId)) {
          return json({ error: 'Identifiant invalide.' }, 400);
        }
        const after = Number(url.searchParams.get('after') || 0);
        if (!Number.isSafeInteger(after) || after < 0) return json({ error: 'Curseur invalide.' }, 400);
        const job = isUUID(id) ? await store.get(id, owner) : await store.byRequest(requestId!, owner);
        // Recovery may legitimately run before an uncertain start was accepted.
        // Missing and foreign references are indistinguishable, owner-scoped data;
        // polling a known task retains the strict not-found error contract.
        if (!job) return isLookup ? json({ job: null }) : json({ error: 'Tâche inaccessible.' }, 404);
        // A recovery lookup only binds the request to its accepted task. Reading
        // results, replaying events and waking native workers belong to status.
        if (isLookup) return json({ job: publicJob(job, false, now()) });
        if (job.analysis_mode !== TRANSPORT_MODE && ['queued', 'processing'].includes(job.status) && deps.wakeNative) {
          deps.waitUntil(deps.wakeNative(job, token).catch(() => deps.log?.('[AI transport] Native status refresh unavailable.')));
        }
        const events = job.analysis_mode === TRANSPORT_MODE ? await store.events(job.id, after, 101) : [];
        const page = events.slice(0, 100);
        const visible = publicJob(job, true, now());
        // Replay pages carry only their frames. Sending the full saved SSE body
        // on every page would multiply a multi-megabyte result by its page count.
        if (events.length > 100 && job.analysis_mode === TRANSPORT_MODE && visible.result_payload) {
          visible.result_payload = { ...visible.result_payload, body: '' };
        }
        return json({ job: visible, events: page,
          nextCursor: page.at(-1)?.seq ?? after, hasMore: events.length > 100 });
      }
      if (action !== 'start' || request.method !== 'POST') return json({ error: 'Action invalide.' }, 400);
      const functionName = url.searchParams.get('functionName') || '';
      const requestId = request.headers.get('x-ai-request-id');
      if (!isDurableAITool(functionName) || !isUUID(requestId)) return json({ error: 'Outil ou identifiant invalide.' }, 400);
      const scopeKey = request.headers.get('x-ai-scope') || '';
      if (scopeKey.length > 256 || /[\r\n]/.test(scopeKey)) return json({ error: 'Contexte invalide.' }, 400);
      const contentType = request.headers.get('content-type') || 'application/json';
      if (!contentType.startsWith('application/json') && !contentType.startsWith('multipart/form-data')) return json({ error: 'Format non pris en charge.' }, 415);
      const body = await boundedBody(request);
      const requestHash = await fingerprint(functionName, contentType, body);
      // Leave enough time for lookup/create/conflict recovery and a claimed
      // worker to report failure. An unstarted request may be retried safely.
      if (now() >= deadlineAt - Math.min(30_000, (deps.workerTimeoutMs ?? TOOL_WORKER_BUDGET_MS) / 4)) {
        return json({ error: 'La réception a pris trop de temps. Réessayez avec la même référence.' }, 503);
      }
      let job = await store.byRequest(requestId, owner);
      if (!job) {
        try {
          job = await store.create({
            public_token: requestId, requested_by: owner, function_name: functionName,
            analysis_mode: TRANSPORT_MODE, status: 'queued', progress_percentage: 0,
            progress_message: 'En attente de traitement.',
            request_payload: { requestHash, scopeKey, contentType },
            expires_at: new Date(now() + RESULT_TTL_MS).toISOString(),
          });
        } catch (error) {
          // Concurrent starts share the same unique public_token. Only the owner
          // may recover the existing row, and the worker uses a separate CAS claim.
          job = await store.byRequest(requestId, owner);
          if (!job) throw error;
        }
      }
      if (job.function_name !== functionName || job.request_payload.requestHash !== requestHash || job.request_payload.scopeKey !== scopeKey) {
        return json({ error: 'Cet identifiant appartient à une autre requête.' }, 409);
      }
      if (job.status === 'queued') {
        deps.waitUntil(executeTool(deps, job, token, body, contentType, deadlineAt).catch(() => deps.log?.('[AI transport] Worker unavailable.')));
      }
      return json({ job: publicJob(job, true, now()), requestId }, 202);
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') return json({ error: 'Fichier trop volumineux.' }, 413);
      deps.log?.('[AI transport] Request failed.');
      return json({ error: 'Le suivi IA est temporairement indisponible.' }, 503);
    }
  };
}
