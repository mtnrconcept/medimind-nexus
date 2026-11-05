import { resolveAIJob, type AIJobProgress, type ResolveAIJobOptions } from './aiJobs';
import { aiObservationAbortError, waitForAIRequest } from './aiJobObservation';
import { hashAIReference, readAIJobReference, saveAIJobReference, type AIJobReference } from './aiJobRecovery';
import { requestFailureStatus } from './requestFailures';
import type { AIToolStatus } from './aiTransport';
import type { ResearchResultPayload } from '../../supabase/functions/deep-research-graph/handler';

const FUNCTION_NAME = 'deep-research-graph';
type InvokeAI = (functionName: string, body: unknown) => Promise<{ data: unknown; error: unknown }>;
type RecoveryStatus = (id: string, owner: string, after?: number) => Promise<AIToolStatus>;
export interface GraphResearchOptions {
  userId: string; scopeKey: string; onProgress?: (progress: AIJobProgress) => void; signal?: AbortSignal;
  /** Cloud callers also bind each invocation to a token belonging to this owner. */
  assertOwner?: (expectedUserId: string) => Promise<void>;
  recoveryStatus?: RecoveryStatus;
  recoveryByRequest?: (requestId: string, owner: string) => Promise<AIToolStatus>;
  observation?: Omit<ResolveAIJobOptions, 'recovery' | 'signal' | 'onProgress'>;
}
type Listener = { progress?: GraphResearchOptions['onProgress'] };
type Active = { fingerprint: string; promise: Promise<unknown>; controller: AbortController;
  listeners: Set<Listener>; progress?: AIJobProgress };
type Remembered = { fingerprint: string; reference: AIJobReference };
const active = new Map<string, Active>();
// Keep the same opaque reference if storage is unavailable or a click is retried
// before an interrupted request has returned. No clinical payload is stored here.
const references = new Map<string, Remembered>();
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const terminalFailure = (status: unknown) => ['failed', 'cancelled', 'canceled'].includes(String(status));
const failure = (message: string, status?: number) => Object.assign(new Error(message), status ? { status } : {});

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Old broker jobs may have stored JSON or the graph's original progressive SSE contract. */
export function recoveredGraphResult(status: AIToolStatus): unknown {
  const result = status.job.result_payload;
  if (!result || typeof result.body !== 'string' || result.httpStatus >= 400) throw failure('Le résultat du graphe enregistré est indisponible. Consultez Activité IA.');
  if (result.contentType.includes('json')) return JSON.parse(result.body);
  if (!result.contentType.includes('text/event-stream')) throw failure('Format du résultat du graphe indisponible.');
  const nodes: unknown[] = [], edges: unknown[] = [];
  let complete: Record<string, unknown> | undefined;
  for (const frame of result.body.split(/\r?\n\r?\n/)) {
    const text = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!text || text === '[DONE]') continue;
    const event = record(JSON.parse(text));
    if (event.type === 'node' && event.node) nodes.push(event.node);
    if (event.type === 'edges' && Array.isArray(event.edges)) edges.push(...event.edges);
    if (event.type === 'error') throw failure('La recherche enregistrée s’est interrompue.');
    if (event.type === 'complete') complete = event;
  }
  if (!complete) throw failure('La recherche enregistrée ne contient pas de résultat final.');
  const { type: _type, ...metadata } = complete;
  return { ...metadata, nodes: Array.isArray(metadata.nodes) ? metadata.nodes : nodes,
    edges: Array.isArray(metadata.edges) ? metadata.edges : edges };
}

function announce(entry: Active, progress: AIJobProgress) {
  entry.progress = progress;
  for (const listener of entry.listeners) {
    try { listener.progress?.(progress); } catch { /* A view cannot invalidate an accepted job. */ }
  }
}

async function execute(invokeAI: InvokeAI, input: Record<string, unknown>, options: GraphResearchOptions,
  key: string, entry: Active): Promise<unknown> {
  const scope = { userId: options.userId, key: options.scopeKey };
  const assertOwner = () => options.assertOwner?.(options.userId);
  const guarded = async <T,>(action: () => Promise<T>): Promise<T> => {
    await assertOwner();
    const result = await action();
    await assertOwner();
    return result;
  };
  const ownedInvoke: InvokeAI = (name, body) => guarded(() => invokeAI(name, body));
  let remembered = references.get(key);
  if (remembered && !remembered.reference.completed && remembered.fingerprint !== entry.fingerprint) {
    throw failure('Une autre recherche utilise déjà cette référence de suivi.', 409);
  }
  const saved = remembered?.reference ?? await readAIJobReference(FUNCTION_NAME, scope);
  const resuming = Boolean(saved && !saved.completed);
  if (!remembered || remembered.reference.completed) {
    remembered = { fingerprint: entry.fingerprint, reference: resuming ? { ...saved! }
      : { functionName: FUNCTION_NAME, requestId: crypto.randomUUID(), createdAt: Date.now() } };
    references.set(key, remembered);
  }
  const reference = remembered.reference;
  const persist = async (completed = reference.completed) => {
    await assertOwner();
    reference.completed = completed;
    if (references.get(key) === remembered) await saveAIJobReference(reference, scope);
    await assertOwner();
  };
  // Persist before any start POST, including when a prior acknowledgement was lost.
  await persist();
  if (entry.controller.signal.aborted) throw aiObservationAbortError();
  let terminal = false;
  const progress = (state: AIJobProgress) => {
    if (terminalFailure(state.status)) terminal = true;
    announce(entry, state);
  };
  const observation = { ...options.observation, signal: entry.controller.signal, onProgress: progress };
  const request = <T,>(action: () => Promise<T>) => waitForAIRequest(() => guarded(action), entry.controller.signal, options.observation?.statusRequestTimeoutMs);
  const validateActivity = (status: AIToolStatus) => {
    if (!status?.job?.id || (status.job.function_name && status.job.function_name !== FUNCTION_NAME)) {
      throw failure('La référence enregistrée appartient à un autre outil.', 409);
    }
    if (reference.id && status.job.id !== reference.id) throw failure('La référence de recherche est incohérente.', 409);
    return status;
  };
  const finish = async (result: unknown) => {
    const graph = record(result);
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw failure('Le serveur n’a pas confirmé un résultat complet du graphe.');
    await persist(true);
    return result;
  };
  try {
    let recovered: AIToolStatus | undefined;
    if (resuming && reference.id && options.recoveryStatus) {
      recovered = validateActivity(await request(() => options.recoveryStatus!(reference.id!, options.userId, Number.MAX_SAFE_INTEGER)));
    } else if (resuming && !reference.id && reference.requestId && options.recoveryByRequest) {
      try { recovered = validateActivity(await request(() => options.recoveryByRequest!(reference.requestId!, options.userId))); }
      catch (error) { if (requestFailureStatus(error) !== 404) throw error; }
    }
    if (recovered) {
      reference.id = recovered.job.id;
      await persist();
      const recoverStatus = async () => {
        const status = await guarded(() => options.recoveryStatus
          ? options.recoveryStatus(reference.id!, options.userId, Number.MAX_SAFE_INTEGER)
          : options.recoveryByRequest!(reference.requestId!, options.userId));
        validateActivity(status);
        progress({ status: status.job.status, progress: status.job.progress_percentage ?? 0, message: status.job.progress_message });
        return { data: { job: { ...status.job, result_payload: status.job.status === 'completed' ? recoveredGraphResult(status) : undefined } }, error: null };
      };
      if (recovered.hasMore && options.recoveryStatus) {
        recovered = validateActivity(await request(() => options.recoveryStatus!(reference.id!, options.userId, Number.MAX_SAFE_INTEGER)));
      }
      progress({ status: recovered.job.status, progress: recovered.job.progress_percentage ?? 0, message: recovered.job.progress_message });
      if (terminal) throw failure(recovered.job.error_message || 'La recherche du graphe a échoué.');
      if (recovered.job.status === 'completed') return await finish(recoveredGraphResult(recovered));
      // The token is only an in-memory signal for resolveAIJob; this adapter
      // observes the owner-authenticated activity endpoint and never sends it.
      return await finish(await resolveAIJob(recoverStatus, FUNCTION_NAME,
        { job: { ...recovered.job, token: 'activity-observation' } }, observation));
    }
    if (reference.id && !reference.requestId) throw failure('Reprenez cette recherche depuis Activité IA avant de lancer une autre génération.');
    const response = await request(() => invokeAI(FUNCTION_NAME, reference.id
      ? { action: 'status', jobId: reference.id, jobToken: reference.requestId }
      : { ...input, requestId: reference.requestId, async: true, streaming: false }));
    if (response.error) throw response.error;
    const data = record(response.data), job = record(data.job);
    if (!job.id) return await finish(response.data);
    if (typeof job.id !== 'string' || (job.token !== undefined && job.token !== reference.requestId)) {
      throw failure('Le serveur a confirmé une autre référence de recherche.', 409);
    }
    reference.id = job.id;
    await persist();
    progress({ status: typeof job.status === 'string' ? job.status : 'queued', progress: Number(job.progress_percentage ?? job.progress ?? 0),
      message: typeof (job.progress_message ?? job.message) === 'string' ? String(job.progress_message ?? job.message) : undefined });
    if (terminal) throw failure(typeof job.error_message === 'string' ? job.error_message : 'La recherche du graphe a échoué.');
    if (job.status === 'completed' && job.result_payload) return await finish(job.result_payload);
    return await finish(await resolveAIJob(ownedInvoke, FUNCTION_NAME,
      { ...data, job: { ...job, token: reference.requestId } }, observation));
  } catch (error) {
    let observedError = error;
    if (requestFailureStatus(error) === 404 && reference.id && reference.requestId) {
      // Native status intentionally hides missing and expired jobs behind 404.
      // This authenticated read can prove expiry; it cannot insert or wake a job.
      try {
        const checked = await request(() => invokeAI(FUNCTION_NAME, { ...input, action: 'admission.status',
          requestId: reference.requestId, async: true, streaming: false }));
        if (checked.error) observedError = checked.error;
      } catch (lookupError) { observedError = lookupError; }
    }
    if (terminal || requestFailureStatus(observedError) === 410) await persist(true);
    throw observedError;
  }
}

/** A detached view never cancels an accepted server job or discards its request ID. */
export async function runGraphResearch<T = ResearchResultPayload>(invokeAI: InvokeAI, input: Record<string, unknown>, options: GraphResearchOptions): Promise<T> {
  if (!options.userId || !options.scopeKey) throw failure('Une session et un contexte de recherche sont requis.', 401);
  if (options.signal?.aborted) throw aiObservationAbortError();
  await options.assertOwner?.(options.userId);
  const body: Record<string, unknown> = { ...input, async: true, streaming: false };
  delete body.requestId;
  const [key, fingerprint] = await Promise.all([
    hashAIReference(JSON.stringify([options.userId, options.scopeKey])), hashAIReference(JSON.stringify(canonical(body))),
  ]);
  if (options.signal?.aborted) throw aiObservationAbortError();
  let entry = active.get(key);
  if (entry && entry.fingerprint !== fingerprint) throw failure('Une autre recherche utilise déjà ce contexte de suivi.', 409);
  if (!entry || entry.controller.signal.aborted) {
    entry = { fingerprint, promise: Promise.resolve(), controller: new AbortController(), listeners: new Set() };
    const current = entry;
    current.promise = Promise.resolve().then(() => execute(invokeAI, body, options, key, current));
    active.set(key, current);
    const clear = () => { if (active.get(key) === current) active.delete(key); };
    void current.promise.then(clear, clear);
  }
  const listener: Listener = { progress: options.onProgress };
  entry.listeners.add(listener);
  try {
    if (entry.progress) { try { listener.progress?.(entry.progress); } catch { /* View only. */ } }
    const result = await waitForAIRequest(() => entry!.promise as Promise<T>, options.signal, null);
    await options.assertOwner?.(options.userId);
    return result;
  } finally {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) entry.controller.abort();
  }
}
