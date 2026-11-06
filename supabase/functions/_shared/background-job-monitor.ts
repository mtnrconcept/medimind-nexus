import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { retrieveBackgroundAI, type AIBackgroundPollResult } from './ai-client.ts';
import { MAX_AI_OUTPUT_TOKENS, resolveAIOutputTokens } from './ai-policy.ts';

export const BACKGROUND_MONITOR_WINDOW_MS = 60 * 60_000;
export const BACKGROUND_JOB_TTL_MS = 24 * 60 * 60_000;
// A stale worker may only be replaced after the hosted 400-second worker limit.
export const BACKGROUND_WORKER_LEASE_MS = 8 * 60_000;
const WATCHDOG_LEASE_MS = 140_000;
const MONITOR_SLICE_MS = 35_000;
// Include the initial reads, claim, compatibility projection and hand-off in
// the hosted Free worker's 150-second wall-clock limit.
const MONITOR_INVOCATION_MS = 140_000;
const STORE_OPERATION_TIMEOUT_MS = 5_000;
const WORKER_DISPATCH_TIMEOUT_MS = 75_000;
// Function-to-function calls share Supabase's 30 calls / 60s trace budget.
// Cached sequence steps need pacing too; provider latency cannot enforce it.
const MIN_WORKER_DISPATCH_INTERVAL_MS = 4_000;
// A deferred recheck adds both a waiting invocation and its next monitor.
const MONITOR_CLAIM_RETRY_DELAY_MS = 10_000;
const MONITOR_CONTROL_LEASE_MS = 60_000;
const RELAY_ATTEMPT_TIMEOUT_MS = 6_000;
const RELAY_RETRY_DELAY_MS = 500;
const RELAY_BUDGET_MS = 2 * RELAY_ATTEMPT_TIMEOUT_MS + RELAY_RETRY_DELAY_MS;
const HANDOFF_ATTEMPTS = 2;
const HANDOFF_RESERVE_MS = HANDOFF_ATTEMPTS * 2 * STORE_OPERATION_TIMEOUT_MS + RELAY_BUDGET_MS;
const MONITOR_KEY = '_background_monitor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Phase = 'queued' | 'starting' | 'polling' | 'finalizing' | 'paused' | 'finished';

export type BackgroundJobRow = {
  id: string;
  function_name: string;
  public_token: string;
  status: string;
  analysis_mode?: string;
  request_payload: Record<string, unknown>;
  provider_response_id: string | null;
  provider_status: string | null;
  requested_by?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  model?: string | null;
  reasoning_effort?: AIBackgroundPollResult['reasoningEffort'];
  progress_percentage?: number;
  [key: string]: unknown;
};

export type BackgroundMonitorState = {
  version: 1;
  revision: string;
  phase: Phase;
  deadlineAt: number;
  retries: number;
  maxOutputTokens?: number;
  previousResponseId?: string;
  watchdogId?: string | null;
  watchdogUntil?: number;
  workerLease?: string | null;
  workerUntil?: number;
  workerClaimed?: boolean;
  /** Earliest next reservation, retained across continuations and relays. */
  nextDispatchAt?: number;
  relayToken?: string | null;
  relayNotBefore?: number;
  relayUntil?: number;
  relayClaimedBy?: string | null;
  pauseReason?: 'monitor_budget';
  resumePhase?: Exclude<Phase, 'paused'>;
  aggregateProgress?: boolean;
};

export interface BackgroundJobStore {
  load(id: string): Promise<BackgroundJobRow | null>;
  compareAndSet(expected: BackgroundJobRow, patch: Record<string, unknown>): Promise<BackgroundJobRow | null>;
}

export interface BackgroundMonitorRuntime {
  store: BackgroundJobStore;
  retrieve(job: BackgroundJobRow): Promise<AIBackgroundPollResult>;
  dispatch(job: BackgroundJobRow, lease: string, finalize: boolean): Promise<void>;
  relay(id: string, deadlineAt?: number, notBefore?: number): Promise<void>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  randomId?: () => string;
  /** Includes a fresh invocation's control-claim time in its worker budget. */
  startedAt?: number;
}

export type NativeJobPayload = {
  action?: string;
  async?: boolean;
  runJob?: boolean;
  jobId?: string;
  jobToken?: string;
  providerResponseId?: string;
  _workerLease?: string;
  _backgroundMaxTokens?: number;
  _monitorNotBefore?: number;
  _monitorControlToken?: string;
};

type Actor = { service: boolean; userId: string | null };
type JobOptions = {
  supabase: SupabaseClient;
  supabaseUrl: string;
  serviceRoleKey: string;
  functionName: string;
  corsHeaders?: Record<string, string>;
  allowLegacyToken?: boolean;
  /** Optional compatibility projection; the canonical job remains authoritative. */
  syncJob?: (job: BackgroundJobRow, signal?: AbortSignal) => Promise<void>;
};

const bindings = new WeakMap<object, { store: BackgroundJobStore; jobId: string; lease: string }>();
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function stripBackgroundJobControls<T extends NativeJobPayload>(payload: T): T {
  const safe = { ...payload } as Record<string, unknown>;
  for (const key of ['action', 'async', 'runJob', 'jobId', 'jobToken', 'providerResponseId', '_workerLease', '_backgroundMaxTokens', '_monitorNotBefore', '_monitorControlToken', MONITOR_KEY]) {
    delete safe[key];
  }
  return safe as T;
}

export function prepareBackgroundJobPayload<T extends NativeJobPayload>(payload: T, now = Date.now(), aggregateProgress = false): Record<string, unknown> {
  return {
    ...stripBackgroundJobControls(payload),
    [MONITOR_KEY]: {
      version: 1, revision: crypto.randomUUID(), phase: 'queued', retries: 0,
      deadlineAt: now + BACKGROUND_MONITOR_WINDOW_MS,
      ...(aggregateProgress ? { aggregateProgress: true } : {}),
    } satisfies BackgroundMonitorState,
  };
}

export function readBackgroundMonitorState(job: BackgroundJobRow, now = Date.now()): BackgroundMonitorState {
  const saved = job.request_payload?.[MONITOR_KEY] as BackgroundMonitorState | undefined;
  if (saved?.version === 1 && typeof saved.revision === 'string' && Number.isFinite(saved.deadlineAt)) return saved;
  // Legacy jobs keep their existing response. A recent untracked worker is not
  // restarted: its POST to OpenAI might already have been accepted.
  return {
    version: 1, revision: '', retries: 0, deadlineAt: now + BACKGROUND_MONITOR_WINDOW_MS,
    phase: job.provider_response_id ? (job.provider_status === 'finalizing' ? 'finalizing' : 'polling') :
      job.status === 'queued' ? 'queued' : 'starting',
    workerUntil: job.provider_status === 'finalizing' || (!job.provider_response_id && job.status === 'processing')
      ? Date.parse(job.updated_at) + BACKGROUND_WORKER_LEASE_MS : 0,
  };
}

export function nextBackgroundTokenBudget(state: Pick<BackgroundMonitorState, 'retries' | 'maxOutputTokens'>, result: AIBackgroundPollResult): number | null {
  if (result.status !== 'incomplete' || result.incompleteReason !== 'max_output_tokens' || state.retries >= 2) return null;
  const current = result.maxOutputTokens ?? state.maxOutputTokens ?? resolveAIOutputTokens({ reasoningEffort: 'high' });
  const next = Math.min(MAX_AI_OUTPUT_TOKENS, Math.max(32_768, current * 2));
  return next > current ? next : null;
}

async function withTimedSignal<T>(timeoutMs: number, work: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Le délai de synchronisation de la tâche IA est dépassé.'));
    }, Math.max(1, timeoutMs));
  });
  try { return await Promise.race([work(controller.signal), deadline]); }
  finally { clearTimeout(timer); }
}

async function syncJobSafely(
  sync: JobOptions['syncJob'], job: BackgroundJobRow | null, timeoutMs = STORE_OPERATION_TIMEOUT_MS,
): Promise<void> {
  if (!sync || !job || timeoutMs <= 0) return;
  try { await withTimedSignal(timeoutMs, signal => sync(job, signal)); } catch {
    console.error('[BackgroundJobMonitor] Projection de compatibilité à resynchroniser.');
  }
}

function createStore(supabase: SupabaseClient, functionName: string, syncJob?: JobOptions['syncJob'], syncReads = false): BackgroundJobStore {
  return {
    async load(id) {
      const startedAt = Date.now();
      const { data, error } = await withTimedSignal(STORE_OPERATION_TIMEOUT_MS, signal =>
        supabase.from('ai_analysis_jobs').select('*').eq('id', id).eq('function_name', functionName)
          .abortSignal(signal).maybeSingle());
      if (error) throw new Error('Lecture de la tâche IA indisponible.');
      if (syncReads) await syncJobSafely(syncJob, data as BackgroundJobRow | null,
        STORE_OPERATION_TIMEOUT_MS - (Date.now() - startedAt));
      return data as BackgroundJobRow | null;
    },
    async compareAndSet(expected, patch) {
      const startedAt = Date.now();
      let query = supabase.from('ai_analysis_jobs').update(patch)
        .eq('id', expected.id).eq('function_name', functionName)
        .eq('status', expected.status).eq('updated_at', expected.updated_at);
      const revision = (expected.request_payload?.[MONITOR_KEY] as BackgroundMonitorState | undefined)?.revision;
      query = revision ? query.eq(`request_payload->${MONITOR_KEY}->>revision`, revision)
        : query.is(`request_payload->${MONITOR_KEY}->>revision`, null);
      const { data, error } = await withTimedSignal(STORE_OPERATION_TIMEOUT_MS,
        signal => query.select('*').abortSignal(signal).maybeSingle());
      if (error) throw new Error('Enregistrement de la tâche IA indisponible.');
      await syncJobSafely(syncJob, data as BackgroundJobRow | null,
        STORE_OPERATION_TIMEOUT_MS - (Date.now() - startedAt));
      return data as BackgroundJobRow | null;
    },
  };
}

async function transition(
  store: BackgroundJobStore, job: BackgroundJobRow, state: Partial<BackgroundMonitorState>,
  patch: Record<string, unknown> = {}, now = Date.now(), randomId: () => string = () => crypto.randomUUID(),
): Promise<BackgroundJobRow | null> {
  return await store.compareAndSet(job, {
    ...patch,
    request_payload: { ...job.request_payload,
      ...(patch.request_payload && typeof patch.request_payload === 'object' ? patch.request_payload as Record<string, unknown> : {}),
      [MONITOR_KEY]: {
      ...readBackgroundMonitorState(job, now), ...state, revision: randomId(),
    } },
    updated_at: new Date(now).toISOString(),
  });
}

/** One short watchdog invocation. All state needed by its successor is in DB. */
export async function monitorBackgroundJob(id: string, runtime: BackgroundMonitorRuntime): Promise<void> {
  const { store } = runtime;
  const now = runtime.now ?? Date.now;
  const sleep = runtime.sleep ?? wait;
  const randomId = runtime.randomId ?? (() => crypto.randomUUID());
  const startedAt = runtime.startedAt ?? now();
  const sliceDeadline = startedAt + MONITOR_SLICE_MS;
  const invocationDeadline = startedAt + MONITOR_INVOCATION_MS;
  const hasWorkBudget = (duration = 0) => now() + duration + HANDOFF_RESERVE_MS <= invocationDeadline;
  const canDispatch = (beforeClaim: boolean) => now() < sliceDeadline && hasWorkBudget(
    WORKER_DISPATCH_TIMEOUT_MS + (beforeClaim ? STORE_OPERATION_TIMEOUT_MS : 0));
  const pause = async (duration: number) => {
    const remaining = Math.min(sliceDeadline, invocationDeadline - HANDOFF_RESERVE_MS) - now();
    if (remaining > 0) await sleep(Math.min(duration, remaining));
  };
  const owner = randomId();
  let job: BackgroundJobRow | null;
  let state: BackgroundMonitorState;
  try {
    job = await store.load(id);
    if (!job || ['progressive_matrix', 'astra_cross_matrix'].includes(job.analysis_mode ?? '') || !['queued', 'processing'].includes(job.status)) return;
    state = readBackgroundMonitorState(job, now());
    if (state.phase === 'paused' || (state.watchdogUntil ?? 0) > now()) return;
    if (!hasWorkBudget(STORE_OPERATION_TIMEOUT_MS)) return;
    job = await transition(store, job, {
      watchdogId: owner, watchdogUntil: Math.min(now() + WATCHDOG_LEASE_MS, invocationDeadline),
    }, {}, now(), randomId);
  } catch {
    // The initial CAS may have committed before its acknowledgment was lost.
    // Recheck after its maximum lease instead of abandoning the server chain.
    await runtime.relay(id, invocationDeadline, invocationDeadline);
    return;
  }
  if (!job) {
    // A worker progress update may win this CAS without another watchdog
    // claiming the job. Schedule another control pass instead of assuming that
    // a successor already exists.
    await runtime.relay(id, invocationDeadline, now() + MONITOR_CLAIM_RETRY_DELAY_MS);
    return;
  }
  let relay = true;
  // This lease was reserved locally but no request has been sent to a worker.
  // Release it together with the watchdog hand-off if a slow claim consumed
  // the dispatch margin; never mistake it for an ambiguous paid creation.
  let undispatched: { lease: string; phase: Phase; status: string; providerStatus: string | null } | undefined;

  const dispatchWorker = async (current: BackgroundJobRow, finalize: boolean): Promise<boolean> => {
    if (!canDispatch(true)) return false;
    const previous = readBackgroundMonitorState(current, now());
    if ((previous.nextDispatchAt ?? 0) > now()) {
      await pause(previous.nextDispatchAt! - now());
      // Re-read ownership, expiry and the persisted response after waiting.
      // Provider GET polling has its own cadence and never waits on this gate.
      return true;
    }
    const lease = randomId();
    const claimed = await transition(store, current, {
      phase: finalize ? 'finalizing' : 'starting', workerLease: lease,
      workerUntil: now() + BACKGROUND_WORKER_LEASE_MS, workerClaimed: false,
      nextDispatchAt: now() + MIN_WORKER_DISPATCH_INTERVAL_MS,
    }, finalize ? {
      provider_status: 'finalizing', provider_completed_at: new Date(now()).toISOString(),
      progress_percentage: previous.aggregateProgress ? Number(current.progress_percentage || 0) : 90,
      progress_message: 'Réponse OpenAI reçue. Finalisation du résultat.',
    } : { status: 'processing', error_message: null }, now(), randomId);
    if (!claimed) return true;
    if (!canDispatch(false)) {
      undispatched = { lease, phase: finalize ? 'polling' : 'queued', status: current.status,
        providerStatus: current.provider_status };
      return false;
    }
    // Once dispatched, a failed/ambiguous transport may never repeat creation.
    await runtime.dispatch(claimed, lease, finalize).catch(() => undefined);
    return true;
  };

  try {
    while (now() < sliceDeadline && hasWorkBudget(STORE_OPERATION_TIMEOUT_MS)) {
      job = await store.load(id);
      if (!job || !['queued', 'processing'].includes(job.status)) { relay = false; break; }
      state = readBackgroundMonitorState(job, now());
      if (state.watchdogId !== owner) { relay = false; break; }
      if (now() >= sliceDeadline || !hasWorkBudget(STORE_OPERATION_TIMEOUT_MS)) break;
      if (job.expires_at && Date.parse(job.expires_at) <= now()) {
        const finished = await transition(store, job, { phase: 'finished', watchdogId: null, watchdogUntil: 0 }, {
          status: 'failed', completed_at: new Date(now()).toISOString(),
          error_message: 'La durée maximale de cette tâche est atteinte. Les résultats déjà enregistrés sont conservés.',
          progress_message: 'Durée maximale atteinte ; résultats partiels conservés.',
        }, now(), randomId);
        if (finished) { relay = false; break; }
        continue;
      }
      if (now() >= state.deadlineAt) {
        const paused = await transition(store, job, { phase: 'paused', resumePhase: state.phase === 'paused' ? state.resumePhase : state.phase,
          pauseReason: 'monitor_budget', watchdogId: null, watchdogUntil: 0 }, {
          progress_message: 'La réponse IA reste conservée. La synchronisation reprendra au retour dans cet outil.',
        }, now(), randomId);
        if (paused) { relay = false; break; }
        continue;
      }
      if ((state.workerUntil ?? 0) > now()) { await pause(2500); continue; }

      if (!job.provider_response_id) {
        if (state.phase === 'starting' && state.workerLease && state.workerClaimed === false) {
          // A worker must successfully consume its lease before calling OpenAI.
          // An expired, explicitly unclaimed reservation is therefore safe to
          // requeue. Missing legacy metadata and claimed leases remain ambiguous.
          await transition(store, job, {
            phase: 'queued', workerLease: null, workerUntil: 0, workerClaimed: false,
          }, { status: 'queued' }, now(), randomId);
          continue;
        }
        if (state.phase !== 'queued') {
          const finished = await transition(store, job, { phase: 'finished' }, {
            status: 'failed', completed_at: new Date(now()).toISOString(),
            error_message: 'Le lancement OpenAI n’a pas pu être confirmé. Aucune seconde génération automatique n’a été créée.',
            progress_message: 'Lancement non confirmé. Une nouvelle demande explicite est nécessaire.',
          }, now(), randomId);
          if (finished) { relay = false; break; }
          continue;
        }
        if (!await dispatchWorker(job, false)) break;
        continue;
      }

      if (job.provider_status !== 'completed') {
        let provider: AIBackgroundPollResult;
        try { provider = await runtime.retrieve(job); } catch {
          // GET failures are safe to retry with the same persisted response id.
          await pause(5000);
          continue;
        }
        if (!hasWorkBudget(STORE_OPERATION_TIMEOUT_MS)) break;
        if (['queued', 'in_progress'].includes(provider.status)) {
          await transition(store, job, { phase: 'polling', maxOutputTokens: provider.maxOutputTokens ?? state.maxOutputTokens }, {
            provider_status: provider.status,
            progress_percentage: state.aggregateProgress ? Number(job.progress_percentage || 0) : Math.max(Number(job.progress_percentage || 0), 80),
            progress_message: 'Le modèle OpenAI poursuit son travail en arrière-plan.',
          }, now(), randomId);
          await pause(5000);
          continue;
        }

        const nextBudget = nextBackgroundTokenBudget(state, provider);
        if (nextBudget !== null) {
          await transition(store, job, {
            phase: 'queued', retries: state.retries + 1, maxOutputTokens: nextBudget,
            previousResponseId: job.provider_response_id, workerLease: null, workerUntil: 0, workerClaimed: false,
          }, {
            provider_response_id: null, provider_status: null,
            progress_message: 'La réponse était trop longue. Reprise avec un budget de génération augmenté.',
          }, now(), randomId);
          continue;
        }
        if (provider.status !== 'completed' || !provider.text?.trim()) {
          const finished = await transition(store, job, { phase: 'finished' }, {
            status: 'failed', provider_status: provider.status, completed_at: new Date(now()).toISOString(),
            error_message: provider.status === 'incomplete' ? 'La réponse IA reste incomplète après les reprises autorisées.' :
              'Le fournisseur IA n’a pas produit de résultat complet.',
            progress_message: 'Résultat incomplet. Les données déjà enregistrées et la réponse du fournisseur sont conservées.',
          }, now(), randomId);
          if (finished) { relay = false; break; }
          continue;
        }
        if (!canDispatch(true) || (state.nextDispatchAt ?? 0) > now()) {
          // Persist completion when GET consumed this slice. The successor can
          // dispatch immediately; the worker still validates the saved response
          // with its own GET. Repeated slow reads or dispatch pacing cannot
          // cause unnecessary repeated provider GETs before finalization.
          await transition(store, job, { phase: 'polling' }, {
            provider_status: 'completed', provider_completed_at: new Date(now()).toISOString(),
          }, now(), randomId);
          if (!canDispatch(true)) break;
          continue;
        }
      }
      if (!await dispatchWorker(job, true)) break;
    }
  } finally {
    // Workers update progress concurrently. Re-read before each CAS so their
    // result/provider id can never be overwritten by the watchdog hand-off.
    let released = false;
    for (let attempt = 0; attempt < HANDOFF_ATTEMPTS; attempt++) {
      if (now() + 2 * STORE_OPERATION_TIMEOUT_MS + RELAY_BUDGET_MS > invocationDeadline) break;
      try {
        const current = await store.load(id);
        if (!current) { relay = false; break; }
        const currentState = readBackgroundMonitorState(current, now());
        if (currentState.watchdogId !== owner) { relay = false; break; }
        if (!['queued', 'processing'].includes(current.status) || currentState.phase === 'paused') relay = false;
        if (now() + STORE_OPERATION_TIMEOUT_MS + RELAY_BUDGET_MS > invocationDeadline) break;
        const release: Partial<BackgroundMonitorState> = { watchdogId: null, watchdogUntil: 0 };
        const patch: Record<string, unknown> = {};
        if (undispatched && currentState.workerLease === undispatched.lease && currentState.workerClaimed === false) {
          Object.assign(release, { phase: undispatched.phase, workerLease: null, workerUntil: 0, workerClaimed: false });
          Object.assign(patch, { status: undispatched.status, provider_status: undispatched.providerStatus });
        }
        if (await transition(store, current, release, patch, now(), randomId)) { released = true; break; }
      } catch {
        // A short database failure may be retried only within the reserved
        // hand-off budget. The canonical provider id is never cleared here.
      }
    }
    if (relay && now() < invocationDeadline) {
      // A lost acknowledgment or repeated revision conflicts cannot orphan an
      // active job. A fresh, short invocation waits out this watchdog's maximum
      // lease and checks its state again; no provider POST is repeated here.
      await runtime.relay(id, invocationDeadline, released ? undefined : invocationDeadline);
    }
  }
}

export async function claimBackgroundWorker(
  store: BackgroundJobStore, id: string, token: string, lease: string, now = Date.now(),
): Promise<BackgroundJobRow | null> {
  const job = await store.load(id);
  if (!job || ['progressive_matrix', 'astra_cross_matrix'].includes(job.analysis_mode ?? '') || job.public_token !== token || job.status !== 'processing') return null;
  const state = readBackgroundMonitorState(job, now);
  if (!lease || state.workerLease !== lease || state.workerClaimed || (state.workerUntil ?? 0) <= now ||
      !['starting', 'finalizing'].includes(state.phase)) return null;
  return await transition(store, job, { workerClaimed: true }, {}, now);
}

/** All native worker writes are fenced by their persisted, one-time lease. */
export async function updateBackgroundJobRecord(
  supabase: SupabaseClient, id: string | undefined, patch: Record<string, unknown>, maxOutputTokens?: number,
): Promise<void> {
  await mutateBackgroundJobRecord(supabase, id, patch, maxOutputTokens);
}

/** Advance only after a durable sequence step has saved all of its outputs. */
export async function continueBackgroundJobRecord(
  supabase: SupabaseClient, id: string, patch: Record<string, unknown>, resetStepWindow = true,
): Promise<void> {
  await mutateBackgroundJobRecord(supabase, id, {
    ...patch, status: 'processing', provider_response_id: null, provider_status: 'queued',
    provider_started_at: null, provider_completed_at: null, error_message: null,
  }, undefined, (job, state) => ({
    phase: 'queued', retries: 0, maxOutputTokens: undefined, previousResponseId: undefined,
    workerLease: null, workerUntil: 0, workerClaimed: false,
    deadlineAt: resetStepWindow
      ? Math.min(Date.now() + BACKGROUND_MONITOR_WINDOW_MS, job.expires_at ? Date.parse(job.expires_at) : Infinity)
      : state.deadlineAt,
  }));
}

async function mutateBackgroundJobRecord(
  supabase: SupabaseClient, id: string | undefined, patch: Record<string, unknown>, maxOutputTokens?: number,
  workerTransition?: (job: BackgroundJobRow, state: BackgroundMonitorState) => Partial<BackgroundMonitorState>,
): Promise<void> {
  if (!id) return;
  const bound = bindings.get(supabase);
  // A status/authentication failure must never mutate a caller-supplied job id.
  if (!bound || bound.jobId !== id) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const job = await bound.store.load(id);
    if (!job) throw new Error('La tâche IA est introuvable.');
    const state = readBackgroundMonitorState(job);
    if (job.status !== 'processing' || state.workerLease !== bound.lease || !state.workerClaimed || (state.workerUntil ?? 0) <= Date.now()) {
      throw new Error('Cette exécution IA ne possède plus la tâche.');
    }
    const next: Partial<BackgroundMonitorState> = {};
    if (typeof patch.provider_response_id === 'string' ||
        (state.phase === 'finalizing' && ['queued', 'in_progress'].includes(String(patch.provider_status)))) {
      Object.assign(next, { phase: 'polling', maxOutputTokens: maxOutputTokens ?? state.maxOutputTokens,
        workerLease: null, workerUntil: 0, workerClaimed: false });
    }
    if (['completed', 'failed'].includes(String(patch.status))) Object.assign(next, {
      phase: 'finished', workerLease: null, workerUntil: 0, workerClaimed: false,
    });
    if (workerTransition) Object.assign(next, workerTransition(job, state));
    if (await transition(bound.store, job, next, patch)) return;
  }
  throw new Error('La progression IA a changé pendant son enregistrement.');
}

/** Reading an existing response is retryable; it must never restart creation. */
export async function retrieveBackgroundForWorker(
  supabase: SupabaseClient, jobId: string | undefined, responseId: string,
  options: Parameters<typeof retrieveBackgroundAI>[1] = {},
): Promise<AIBackgroundPollResult | null> {
  try {
    return await retrieveBackgroundAI(responseId, options);
  } catch {
    await updateBackgroundJobRecord(supabase, jobId, {
      provider_status: 'in_progress', progress_message: 'Reconnexion à la réponse IA enregistrée.',
    });
    return null;
  }
}

function keepAlive(task: Promise<void>): void {
  const guarded = task.catch(() => console.error('[BackgroundJobMonitor] Relais interrompu ; tâche conservée pour reprise.'));
  (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(p: Promise<void>): void } }).EdgeRuntime?.waitUntil(guarded);
}

async function relayMonitor(
  options: JobOptions, id: string, deadlineAt = Date.now() + RELAY_BUDGET_MS, notBefore?: number, controlToken?: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) throw new Error('Le délai du relais IA est dépassé.');
      await withTimedSignal(Math.min(RELAY_ATTEMPT_TIMEOUT_MS, remaining), async signal => {
        const response = await fetch(`${options.supabaseUrl}/functions/v1/${options.functionName}`, {
          method: 'POST', headers: { Authorization: `Bearer ${options.serviceRoleKey}`, apikey: options.serviceRoleKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'monitor', jobId: id, ...(notBefore ? { _monitorNotBefore: notBefore } : {}),
            ...(controlToken ? { _monitorControlToken: controlToken } : {}) }), signal,
        });
        const accepted = response.ok;
        await response.body?.cancel();
        if (!accepted) throw new Error('Relais du moniteur indisponible.');
      });
      return;
    } catch (error) {
      if (attempt === 1 || Date.now() + RELAY_RETRY_DELAY_MS >= deadlineAt) throw error;
      await wait(RELAY_RETRY_DELAY_MS);
    }
  }
}

export function startBackgroundJobMonitor(options: JobOptions, id: string, resume = false): void {
  keepAlive((async () => {
    if (resume) {
      const store = createStore(options.supabase, options.functionName, options.syncJob);
      const job = await store.load(id);
      if (job && ['progressive_matrix', 'astra_cross_matrix'].includes(job.analysis_mode ?? '')) return;
      if (job) {
        const state = readBackgroundMonitorState(job);
        if (state.phase === 'paused' && state.pauseReason === 'monitor_budget') {
          await transition(store, job, { phase: job.provider_response_id ? 'polling' : state.resumePhase === 'queued' ? 'queued' : 'starting',
            deadlineAt: Math.min(Date.now() + BACKGROUND_MONITOR_WINDOW_MS, job.expires_at ? Date.parse(job.expires_at) : Infinity),
            pauseReason: undefined, resumePhase: undefined }, {
            progress_message: 'Reprise de la synchronisation de la réponse IA conservée.',
          });
        }
      }
    }
    await relayMonitor(options, id);
  })());
}

function createRuntime(options: JobOptions, startedAt?: number): BackgroundMonitorRuntime {
  return {
    startedAt,
    store: createStore(options.supabase, options.functionName, options.syncJob, true),
    retrieve: job => retrieveBackgroundAI(job.provider_response_id!, { model: job.model ?? undefined,
      reasoningEffort: job.reasoning_effort }),
    async dispatch(job, lease, finalize) {
      await withTimedSignal(WORKER_DISPATCH_TIMEOUT_MS, async signal => {
        const response = await fetch(`${options.supabaseUrl}/functions/v1/${options.functionName}`, {
          method: 'POST', headers: { Authorization: `Bearer ${options.serviceRoleKey}`, apikey: options.serviceRoleKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ runJob: true, jobId: job.id, jobToken: job.public_token, _workerLease: lease,
            ...(finalize ? { providerResponseId: job.provider_response_id } : {}) }), signal,
        });
        const accepted = response.ok;
        await response.body?.cancel();
        if (!accepted) throw new Error('Le worker IA n’a pas confirmé son exécution.');
      });
    },
    relay: (id, deadlineAt, notBefore) => relayMonitor(options, id, deadlineAt, notBefore),
  };
}

async function reserveScheduledMonitor(
  options: JobOptions, id: string, notBefore: number, incomingToken: string | undefined,
  startedAt: number, deferred: boolean,
): Promise<string | null> {
  const store = createStore(options.supabase, options.functionName, options.syncJob);
  const owner = crypto.randomUUID();
  const token = deferred ? owner : incomingToken ?? owner;
  const claimedBy = deferred ? null : owner;
  const owns = (state: BackgroundMonitorState) => state.relayToken === token && (state.relayClaimedBy ?? null) === claimedBy;
  const eligible = (job: BackgroundJobRow) => ['queued', 'processing'].includes(job.status)
    && !['progressive_matrix', 'astra_cross_matrix'].includes(job.analysis_mode ?? '')
    && readBackgroundMonitorState(job).phase !== 'paused'
    && (!job.expires_at || Date.parse(job.expires_at) > Date.now());
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const job = await store.load(id);
      if (!job || !eligible(job)) return null;
      const state = readBackgroundMonitorState(job);
      // A previous CAS may have succeeded even though its HTTP acknowledgment
      // was lost. Only this invocation can recognize its fresh random owner.
      if (owns(state)) return token;
      if (incomingToken) {
        if (state.relayToken !== incomingToken || state.relayClaimedBy) return null;
      } else if (state.relayToken) {
        const active = (state.relayUntil ?? 0) > Date.now();
        if ((state.relayNotBefore ?? 0) >= notBefore && (active || state.relayClaimedBy)) return null;
        if (active && !state.relayClaimedBy) return null;
      }
      const saved = await transition(store, job, {
        relayToken: token, relayNotBefore: notBefore, relayClaimedBy: claimedBy,
        relayUntil: deferred ? Date.now() + MONITOR_CONTROL_LEASE_MS : startedAt + MONITOR_INVOCATION_MS,
      });
      if (saved) return token;
    } catch {
      // Retry this control reservation, never a provider operation. The next
      // read recognizes our committed token before attempting another CAS.
    }
  }
  // Also reconcile the final CAS if only its acknowledgment was lost.
  try {
    const job = await store.load(id);
    if (job && eligible(job) && owns(readBackgroundMonitorState(job))) return token;
  } catch { /* A later authenticated wake-up can recover persisted state. */ }
  return null;
}

async function runScheduledMonitor(options: JobOptions, id: string, notBefore: number, incomingToken?: string): Promise<void> {
  const startedAt = Date.now();
  if (!notBefore && !incomingToken) {
    await monitorBackgroundJob(id, createRuntime(options, startedAt));
    return;
  }
  const deferred = notBefore > startedAt;
  const controlToken = await reserveScheduledMonitor(options, id, notBefore, incomingToken, startedAt, deferred);
  if (!controlToken) return;
  if (deferred) {
    // Waiting never consumes the next real monitor's wall-clock budget. Relay
    // even when this wait reaches notBefore so processing starts in a fresh
    // invocation with its entire hand-off reserve available.
    await wait(Math.min(MONITOR_SLICE_MS, Math.max(0, notBefore - Date.now())));
    await relayMonitor(options, id, undefined, notBefore, controlToken);
    return;
  }
  await monitorBackgroundJob(id, createRuntime(options, startedAt));
}

export async function prepareBackgroundJobRequest<T extends NativeJobPayload>(
  req: Request, incoming: T, options: JobOptions,
): Promise<{ actor: Actor; payload: T; response?: Response }> {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...options.corsHeaders, 'Content-Type': 'application/json' },
  });
  const authorization = req.headers.get('authorization') || '';
  let actor: Actor = { service: authorization === `Bearer ${options.serviceRoleKey}`, userId: null };
  const stop = (response: Response) => ({ actor, payload: incoming, response });
  if ((incoming.runJob || incoming.action === 'monitor') && !actor.service) return stop(json({ error: 'Service authorization required' }, 403));
  if (!actor.service) {
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) return stop(json({ error: 'Authentication required' }, 401));
    const { data, error } = await options.supabase.auth.getUser(token);
    if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || error.status === 429 ||
        (typeof error.status === 'number' && error.status >= 500))) {
      return stop(json({ error: 'Session verification temporarily unavailable' }, 503));
    }
    if (error || !data?.user?.id) return stop(json({ error: 'Invalid session' }, 401));
    actor = { service: false, userId: data.user.id };
  }
  const id = incoming.jobId;
  const store = createStore(options.supabase, options.functionName, options.syncJob);
  if (incoming.action === 'monitor') {
    if (!id || !UUID.test(id)) return stop(json({ error: 'Invalid jobId' }, 400));
    const notBefore = typeof incoming._monitorNotBefore === 'number' && Number.isFinite(incoming._monitorNotBefore)
      ? Math.min(incoming._monitorNotBefore, Date.now() + WATCHDOG_LEASE_MS) : 0;
    const controlToken = typeof incoming._monitorControlToken === 'string' ? incoming._monitorControlToken : undefined;
    if (controlToken && !UUID.test(controlToken)) return stop(json({ error: 'Invalid monitor control token' }, 400));
    keepAlive(runScheduledMonitor(options, id, notBefore, controlToken));
    return stop(json({ accepted: true }, 202));
  }
  if (incoming.action === 'status') {
    if (!id || !UUID.test(id) || !incoming.jobToken || !UUID.test(incoming.jobToken)) return stop(json({ error: 'jobId and jobToken are required' }, 400));
    const job = await store.load(id);
    const legacy = job?.requested_by == null && options.allowLegacyToken !== false;
    if (!job || ['progressive_matrix', 'astra_cross_matrix'].includes(job.analysis_mode ?? '') || job.public_token !== incoming.jobToken ||
        (!actor.service && (job.requested_by !== actor.userId && !legacy)) ||
        (!actor.service && job.expires_at && Date.parse(job.expires_at) <= Date.now())) {
      return stop(json({ error: 'Job not found or expired' }, 404));
    }
    await syncJobSafely(options.syncJob, job);
    const monitorState = readBackgroundMonitorState(job);
    if (['queued', 'processing'].includes(job.status) &&
        (monitorState.phase === 'paused' || (monitorState.watchdogUntil ?? 0) <= Date.now())) {
      startBackgroundJobMonitor(options, id, true);
    }
    const { request_payload: _request, public_token: _token, requested_by: _owner, ...visible } = job;
    return stop(json({ job: visible }));
  }
  if (incoming.runJob) {
    if (!id || !incoming.jobToken || !incoming._workerLease) return stop(json({ error: 'Worker lease required' }, 400));
    const job = await claimBackgroundWorker(store, id, incoming.jobToken, incoming._workerLease);
    if (!job) return stop(json({ accepted: false, reason: 'Job already claimed or finished' }, 202));
    bindings.set(options.supabase, { store, jobId: id, lease: incoming._workerLease });
    const state = readBackgroundMonitorState(job);
    return { actor, payload: { ...stripBackgroundJobControls(job.request_payload), runJob: true, jobId: id,
      jobToken: job.public_token, _workerLease: incoming._workerLease, _backgroundMaxTokens: state.maxOutputTokens,
      ...(state.phase === 'finalizing' ? { providerResponseId: job.provider_response_id } : {}),
    } as T };
  }
  // Native synchronous calls may never inject a lease or a provider response id.
  return { actor, payload: { ...stripBackgroundJobControls(incoming), action: incoming.action, async: incoming.async } as T };
}
