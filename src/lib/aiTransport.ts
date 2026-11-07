import { isDurableAITool, NATIVE_AI_JOB_TOOLS } from '../../supabase/functions/_shared/ai-tool-registry';
import { AIJobObservation, aiObservationAbortError, waitForAIRequest } from './aiJobObservation';
import { hashAIReference, readAIJobReference, saveAIJobReference, type AIJobReference, type AIJobRecoveryScope } from './aiJobRecovery';
import { isTransientRequestFailure, requestFailureStatus } from './requestFailures';
import type { ScraperBatchManifest } from '../../supabase/functions/ai-tool-jobs/batch';

export interface AIToolSession { userId: string; accessToken: string }
export interface AIToolResult { httpStatus: number; contentType: string; body: string }
export interface AIToolJob {
  id: string;
  status: string;
  function_name?: string;
  analysis_mode?: string;
  scopeKey?: string;
  progress_percentage?: number;
  progress_message?: string | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  stalled?: boolean;
  result_payload?: AIToolResult | null;
}
export interface AIToolStatus {
  job: AIToolJob;
  events?: Array<{ seq: number; data: string }>;
  nextCursor?: number;
  hasMore?: boolean;
}
interface AIToolLookup {
  job: Pick<AIToolJob, 'id' | 'function_name'> | null;
}
export interface AITransportOptions {
  supabaseUrl: string;
  publicKey?: string;
  getSession: () => Promise<AIToolSession | null>;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  maxWaitMs?: number;
}
export interface AIToolObserveOptions {
  owner: string;
  signal?: AbortSignal;
  onProgress?: (job: AIToolJob) => void;
}

function transportError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}
function completed(job: AIToolJob) { return job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'; }

/** Unverified claims may only reject a stale caller; they never grant access. */
function suppliedOwner(headers: Headers): string | undefined {
  const token = /^Bearer\s+(.+)$/i.exec(headers.get('Authorization') || '')?.[1];
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role !== 'anon' && typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch { return; }
}

/** Optional durable transport for registered AI tools only; never overrides global fetch. */
export function createAITransport(options: AITransportOptions) {
  const fetcher: typeof fetch = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');
  const brokerUrl = baseUrl + '/functions/v1/ai-tool-jobs';
  const interval = options.pollIntervalMs ?? 1_500;
  const starts = new Map<string, Promise<AIJobReference>>();
  const finishes = new WeakMap<Promise<AIJobReference>, Promise<void>>();
  const batchReferences = new Map<string, { starting: Promise<AIJobReference>; activeKey: string; reference: AIJobReference; scope: AIJobRecoveryScope }>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => { try { listener(); } catch { /* Observers cannot invalidate an accepted server task. */ } });

  function finishReference(starting: Promise<AIJobReference>, activeKey: string, reference: AIJobReference, scope: AIJobRecoveryScope) {
    let finishing = finishes.get(starting);
    if (!finishing) {
      finishing = (async () => {
        await saveAIJobReference({ ...reference, completed: true }, scope);
        if (starts.get(activeKey) === starting) starts.delete(activeKey);
        notify();
      })();
      finishes.set(starting, finishing);
    }
    return finishing;
  }

  async function session(owner?: string) {
    const auth = await options.getSession();
    if (!auth || (owner && auth.userId !== owner)) throw transportError('Votre session a changé. Reconnectez-vous pour consulter cette tâche.', 401);
    return auth;
  }

  async function request<T>(params: Record<string, string>, owner?: string, init?: RequestInit): Promise<T> {
    const auth = await session(owner);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', 'Bearer ' + auth.accessToken);
    if (options.publicKey) headers.set('apikey', options.publicKey);
    const response = await fetcher(brokerUrl + '?' + new URLSearchParams(params), { ...init, headers });
    if (!response.ok) {
      const details = await response.clone().json().catch(() => null);
      throw transportError(typeof details?.error === 'string' ? details.error : 'Le suivi IA est indisponible (' + response.status + ').', response.status);
    }
    const data = await response.json() as T;
    await session(auth.userId); // An old response must never cross an account switch.
    return data;
  }

  async function status(jobId: string, after = 0, owner?: string): Promise<AIToolStatus> {
    return request<AIToolStatus>({ action: 'status', jobId, after: String(after) }, owner);
  }

  async function statusWithRetry(jobId: string, cursor: number, owner: string, observation: AIJobObservation, signal?: AbortSignal): Promise<AIToolStatus> {
    let delay = 0;
    while (true) {
      observation.assertBudget();
      await observation.wait(delay, signal);
      observation.assertBudget();
      try {
        return await waitForAIRequest(() => status(jobId, cursor, owner), signal, options.requestTimeoutMs);
      } catch (error) {
        if (signal?.aborted || !isTransientRequestFailure(error)) throw error;
        delay = Math.min(Math.max(interval, delay * 2), 15_000);
      }
    }
  }

  async function observe<T>(jobId: string, settings: AIToolObserveOptions): Promise<T> {
    const observation = new AIJobObservation(options.maxWaitMs);
    try {
      while (true) {
        const { job } = await statusWithRetry(jobId, 0, settings.owner, observation, settings.signal);
        if (settings.signal?.aborted) throw aiObservationAbortError();
        settings.onProgress?.(job);
        if (completed(job)) {
          const recovery = batchReferences.get(job.id);
          if (recovery?.scope.userId === settings.owner) {
            await finishReference(recovery.starting, recovery.activeKey, recovery.reference, recovery.scope);
            batchReferences.delete(job.id);
          }
          await session(settings.owner);
          if (settings.signal?.aborted) throw aiObservationAbortError();
          if (job.status !== 'completed') throw new Error(job.error_message || 'Le traitement IA n’a pas abouti.');
          if (!job.result_payload?.contentType.includes('json') || typeof job.result_payload.body !== 'string') {
            throw new Error('Le résultat enregistré est indisponible. Consultez Activité IA.');
          }
          const result = JSON.parse(job.result_payload.body) as T;
          await session(settings.owner);
          if (settings.signal?.aborted) throw aiObservationAbortError();
          return result;
        }
        await observation.wait(interval, settings.signal);
      }
    } finally { observation.dispose(); }
  }

  async function fingerprint(original: Request, body: ArrayBuffer): Promise<string> {
    if (!original.headers.get('content-type')?.startsWith('multipart/form-data')) return hashAIReference(body);
    const form = await original.clone().formData();
    const parts: unknown[] = [];
    for (const [name, value] of form) {
      parts.push(typeof value === 'string'
        ? [name, value]
        : [name, value.name, value.type, value.size, await hashAIReference(await value.arrayBuffer())]);
    }
    return hashAIReference(JSON.stringify(parts));
  }

  async function begin(functionName: string, original: Request, body: ArrayBuffer, scope: AIJobRecoveryScope, owner: string, caller: string, action = 'start'): Promise<AIJobReference> {
    const saved = await readAIJobReference(functionName, scope);
    const pending = saved && !saved.completed ? saved : null;
    const reference: AIJobReference = pending ?? {
      functionName, requestId: original.headers.get('x-ai-request-id') || crypto.randomUUID(), createdAt: Date.now(),
    };
    if (reference.id) return reference;
    await saveAIJobReference(reference, scope);
    const observation = new AIJobObservation(options.maxWaitMs);
    const headers = new Headers(original.headers);
    headers.set('x-ai-request-id', reference.requestId!);
    headers.set('x-ai-scope', caller);
    headers.delete('content-length');
    try {
      for (let attempt = 0; ; attempt += 1) {
        observation.assertBudget();
        // A click must submit promptly even if the user immediately hides the tab.
        // Once accepted, only local observation/retry waits pause while hidden.
        if (attempt || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
          await observation.wait(attempt ? Math.min(interval * 2 ** Math.min(attempt, 4), 15_000) : 0);
        }
        // Recover an accepted start whose acknowledgement was lost, including after remount.
        // A completed reference belongs to a previous submission, not this new request.
        if (pending || attempt > 0) {
          try {
            const recovered = await waitForAIRequest(() => request<AIToolLookup>({ action: 'lookup', requestId: reference.requestId! }, owner), undefined, options.requestTimeoutMs);
            // Only an explicit miss permits a new start. An invalid reply must not duplicate work.
            if (recovered?.job !== null) {
              if (typeof recovered?.job?.id !== 'string' || !recovered.job.id) throw new Error('La réponse de reprise de la tâche IA est invalide.');
              if (recovered.job.function_name && recovered.job.function_name !== functionName) throw transportError('Référence de tâche incohérente.', 409);
              reference.id = recovered.job.id;
              await saveAIJobReference(reference, scope);
              notify();
              return reference;
            }
          } catch (error) {
            if (requestFailureStatus(error) !== 404) {
              if (isTransientRequestFailure(error)) continue;
              throw error;
            }
          }
        }
        try {
          // The bytes and multipart boundary are reused verbatim for idempotent retries.
          const accepted = await waitForAIRequest(() => request<AIToolStatus>(
            { action, functionName }, owner, { method: 'POST', headers, body },
          ), undefined, options.requestTimeoutMs);
          if (!accepted.job?.id) throw new Error('Le serveur n’a pas confirmé la tâche IA.');
          reference.id = accepted.job.id;
          await saveAIJobReference(reference, scope);
          notify();
          return reference;
        } catch (error) {
          if (!isTransientRequestFailure(error)) throw error;
          // Only the idempotent broker start is retried. Never call the paid tool directly.
        }
      }
    } finally { observation.dispose(); }
  }

  async function startBatch(manifest: ScraperBatchManifest, settings: { owner: string; signal?: AbortSignal }): Promise<{ id: string }> {
    if (settings.signal?.aborted) throw aiObservationAbortError();
    await session(settings.owner);
    const original = new Request(brokerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manifest) });
    const body = await original.clone().arrayBuffer();
    const caller = await hashAIReference('admin-medical-scraper-batch');
    const scope = { userId: settings.owner, key: 'batch:' + caller + ':' + await hashAIReference(body) };
    const activeKey = settings.owner + ':scraper-batch:' + scope.key;
    let starting = starts.get(activeKey);
    if (!starting) {
      starting = begin('medical-scraper', original, body, scope, settings.owner, caller, 'batch.start');
      starts.set(activeKey, starting);
      void starting.catch(() => { if (starts.get(activeKey) === starting) starts.delete(activeKey); });
    }
    const reference = await waitForAIRequest(() => starting!, settings.signal, null);
    await session(settings.owner);
    if (settings.signal?.aborted) throw aiObservationAbortError();
    batchReferences.set(reference.id!, { starting, activeKey, reference, scope });
    return { id: reference.id! };
  }

  async function stopBatch(jobId: string, settings: { owner: string; signal?: AbortSignal }): Promise<AIToolStatus> {
    const result = await waitForAIRequest(() => request<AIToolStatus>({ action: 'batch.stop', jobId }, settings.owner, { method: 'POST' }), settings.signal, 30_000);
    notify();
    return result;
  }

  const aiFetch: typeof fetch = async (input, init) => {
    const original = new Request(input, init);
    const url = new URL(original.url);
    const base = new URL(baseUrl);
    const functionName = url.pathname.startsWith('/functions/v1/') ? decodeURIComponent(url.pathname.slice('/functions/v1/'.length)) : '';
    if (original.method !== 'POST' || url.origin !== base.origin || !isDurableAITool(functionName)) {
      const response = await fetcher(input, init);
      if (url.origin === base.origin && NATIVE_AI_JOB_TOOLS.has(functionName) && response.status === 202) notify();
      return response;
    }
    if (original.signal.aborted) throw aiObservationAbortError();
    const auth = await session();
    const expectedOwner = suppliedOwner(original.headers);
    if (expectedOwner && expectedOwner !== auth.userId) throw transportError('La session a changé avant l’envoi. Relancez depuis votre compte actuel.', 401);
    const body = await original.clone().arrayBuffer();
    const caller = original.headers.get('x-ai-scope') || await hashAIReference(typeof location === 'undefined' ? '/' : location.pathname);
    const requestKey = original.headers.get('x-ai-request-id') || await fingerprint(original, body);
    const scope: AIJobRecoveryScope = { userId: auth.userId, key: caller + ':' + requestKey };
    const activeKey = auth.userId + ':' + functionName + ':' + scope.key;
    let starting = starts.get(activeKey);
    if (!starting) {
      starting = begin(functionName, original, body, scope, auth.userId, caller);
      starts.set(activeKey, starting);
      void starting.catch(() => { if (starts.get(activeKey) === starting) starts.delete(activeKey); });
    }
    // begin owns an active-time budget; a second wall-clock limit would count suspension.
    const reference = await waitForAIRequest(() => starting!, original.signal, null);
    const observation = new AIJobObservation(options.maxWaitMs);
    let cursor = 0;
    const finished = () => finishReference(starting!, activeKey, reference, scope);
    let handedToStream = false;
    try {
      while (true) {
        const current = await statusWithRetry(reference.id!, cursor, auth.userId, observation, original.signal);
        const events = (current.events ?? []).filter(event => event.seq > cursor).sort((a, b) => a.seq - b.seq);
        const payload = current.job.result_payload;
        const isStream = (payload?.contentType?.includes('text/event-stream') ?? false) || events.length > 0;
        if (isStream) {
          handedToStream = true;
          const localAbort = new AbortController();
          const forwardAbort = () => localAbort.abort();
          original.signal.addEventListener('abort', forwardAbort, { once: true });
          if (original.signal.aborted) localAbort.abort();
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              void (async () => {
                let batch = current;
                let sentEvents = false;
                try {
                  while (true) {
                    if (localAbort.signal.aborted) throw aiObservationAbortError();
                    await session(auth.userId);
                    for (const event of (batch.events ?? []).filter(event => event.seq > cursor).sort((a, b) => a.seq - b.seq)) {
                      controller.enqueue(encoder.encode(event.data));
                      cursor = event.seq;
                      sentEvents = true;
                    }
                    if (completed(batch.job) && !batch.hasMore) {
                      await finished();
                      await session(auth.userId);
                      if (batch.job.status !== 'completed') throw new Error(batch.job.error_message || 'Le traitement IA n’a pas abouti.');
                      if (!sentEvents && batch.job.result_payload?.body) controller.enqueue(encoder.encode(batch.job.result_payload.body));
                      controller.close();
                      break;
                    }
                    if (!batch.hasMore) await observation.wait(interval, localAbort.signal);
                    batch = await statusWithRetry(reference.id!, cursor, auth.userId, observation, localAbort.signal);
                  }
                } catch (error) {
                  try { controller.error(error); } catch { /* Reader was already detached. */ }
                } finally {
                  original.signal.removeEventListener('abort', forwardAbort);
                  observation.dispose();
                }
              })();
            },
            cancel() { localAbort.abort(); },
          });
          return new Response(stream, { status: payload?.httpStatus ?? 200, headers: { 'Content-Type': payload?.contentType ?? 'text/event-stream' } });
        }
        if (completed(current.job)) {
          await finished();
          await session(auth.userId);
          if (current.job.status !== 'completed') return Response.json({ error: current.job.error_message || 'Le traitement IA n’a pas abouti.' }, { status: 500 });
          if (!payload || typeof payload.body !== 'string') throw new Error('Le résultat IA reçu est invalide.');
          const httpStatus = payload.httpStatus ?? 200;
          return new Response([204, 205, 304].includes(httpStatus) ? null : payload.body, { status: httpStatus, headers: { 'Content-Type': payload.contentType || 'application/json' } });
        }
        await observation.wait(interval, original.signal);
      }
    } finally {
      if (!handedToStream) observation.dispose();
    }
  };

  return {
    fetch: aiFetch,
    status,
    observe,
    startBatch,
    stopBatch,
    list: (owner?: string) => request<{ jobs: AIToolJob[] }>({ action: 'list' }, owner),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
