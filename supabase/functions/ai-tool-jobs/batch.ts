import { isUUID, TRANSPORT_MODE, type ToolJob } from './protocol.ts';

export const SCRAPER_BATCH_MODE = 'scraper_batch';
export const SCRAPER_BATCH_CONCURRENCY = 3;
export const SCRAPER_BATCH_MAX_URLS = 500;
export const SCRAPER_BATCH_TTL_MS = 24 * 60 * 60_000;
export const SCRAPER_BATCH_LEASE_MS = 90_000;
export const SCRAPER_BATCH_MONITOR_MS = 35_000;
export const SCRAPER_CHILD_STALE_MS = 8 * 60_000;
const CONTROL_BUDGET_MS = 40_000;
const DB_OPERATION_MS = 8_000;
export const SCRAPER_BATCH_DELAYS = { slow: 45_000, normal: 25_000, fast: 12_000 } as const;
const actions = { medications: 'scrape-medication', molecules: 'scrape-molecule', pathologies: 'scrape' } as const;
const statNames = ['medicationsAdded', 'sideEffectsAdded', 'interactionsAdded', 'contraindicationsAdded',
  'pathologiesAdded', 'symptomsAdded', 'treatmentsAdded', 'linksCreated', 'moleculesAdded', 'moleculesUpdated'] as const;

export interface ScraperBatchManifest {
  mode: keyof typeof actions;
  urls: string[];
  rateLimitMode: keyof typeof SCRAPER_BATCH_DELAYS;
}
export interface ScraperBatchEntry {
  index: number;
  url: string;
  jobId?: string;
  status: 'completed' | 'failed' | 'skipped';
  stats?: Record<string, number>;
  error?: string;
}
export interface ScraperBatchResult {
  finished: boolean;
  success: boolean;
  stopped: boolean;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  entries: ScraperBatchEntry[];
  stats: Record<string, number>;
}
export interface ScraperBatchState extends ScraperBatchManifest {
  version: 1;
  revision: string;
  adminAuthorized: true;
  authorizedOwner: string;
  authorizedAt: string;
  nextIndex: number;
  active: number[];
  admitted: number[];
  nextBatchAt: number;
  leaseId: string | null;
  leaseUntil: number;
  stopRequested: boolean;
  stopReason?: 'user' | 'authorization' | 'deadline';
}
export interface ScraperBatchStore {
  get(id: string): Promise<ToolJob | null>;
  byRequest(requestId: string, owner: string): Promise<ToolJob | null>;
  create(row: Record<string, unknown>): Promise<ToolJob>;
  /** Fenced by analysis_mode=scraper_batch and request_payload.batch.revision. */
  compareAndSwap(id: string, expectedRevision: string, patch: Record<string, unknown>): Promise<ToolJob | null>;
  /** Fenced by analysis_mode=tool_transport, status and updated_at. */
  settleChild(id: string, expectedStatus: ToolJob['status'], expectedUpdatedAt: string, patch: Record<string, unknown>): Promise<ToolJob | null>;
}
export interface ScraperBatchRuntime {
  store: ScraperBatchStore;
  isAdmin(owner: string): Promise<boolean>;
  dispatchChild(parentId: string, index: number): Promise<void>;
  relayMonitor(parentId: string, delayMs: number): Promise<void>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  randomId?: () => string;
}

export class ScraperBatchError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ScraperBatchError'; }
}
const owns = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);
const terminal = (job: ToolJob) => job.status === 'completed' || job.status === 'failed';
const clock = (runtime: ScraperBatchRuntime) => runtime.now ?? Date.now;
const uuid = (runtime: ScraperBatchRuntime) => (runtime.randomId ?? (() => crypto.randomUUID()))();
const wait = (runtime: ScraperBatchRuntime, ms: number) => runtime.sleep?.(ms) ?? new Promise<void>(resolve => setTimeout(resolve, ms));

function privateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.includes(':')) return /^(::|fc|fd|fe[89ab])/i.test(host);
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

/** Only the selected URLs and existing three modes may enter this workflow. */
export function normalizeScraperBatchManifest(input: unknown): ScraperBatchManifest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ScraperBatchError('Manifeste invalide.', 400);
  const value = input as Record<string, unknown>;
  if (typeof value.mode !== 'string' || !owns(actions, value.mode)
    || typeof value.rateLimitMode !== 'string' || !owns(SCRAPER_BATCH_DELAYS, value.rateLimitMode)
    || !Array.isArray(value.urls) || !value.urls.length || value.urls.length > SCRAPER_BATCH_MAX_URLS) {
    throw new ScraperBatchError('Choisissez un mode valide et de 1 à 500 URL.', 400);
  }
  const urls = value.urls.map(raw => {
    if (typeof raw !== 'string' || raw.length > 4096) throw new ScraperBatchError('URL invalide.', 400);
    let url: URL;
    try { url = new URL(raw.trim()); } catch { throw new ScraperBatchError('URL invalide.', 400); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || privateHost(url.hostname)) {
      throw new ScraperBatchError('Seules les URL publiques HTTP ou HTTPS sont acceptées.', 400);
    }
    url.hash = '';
    return url.href;
  });
  return { mode: value.mode as ScraperBatchManifest['mode'], urls: [...new Set(urls)], rateLimitMode: value.rateLimitMode as ScraperBatchManifest['rateLimitMode'] };
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
async function hash(value: string) { return Array.from(await digest(value), byte => byte.toString(16).padStart(2, '0')).join(''); }
export async function scraperBatchChildId(parentId: string, index: number): Promise<string> {
  if (!isUUID(parentId) || !Number.isSafeInteger(index) || index < 0 || index >= SCRAPER_BATCH_MAX_URLS) throw new ScraperBatchError('Étape invalide.', 400);
  const bytes = (await digest(`medicore-scraper-batch-v1:${parentId}:${index}`)).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const text = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function stateOf(job: ToolJob): ScraperBatchState {
  const state = job.request_payload.batch as ScraperBatchState | undefined;
  if (job.analysis_mode !== SCRAPER_BATCH_MODE || job.function_name !== 'medical-scraper'
    || !state || state.version !== 1 || !isUUID(state.revision) || state.adminAuthorized !== true
    || state.authorizedOwner !== job.requested_by || !Array.isArray(state.urls) || !Array.isArray(state.active) || !Array.isArray(state.admitted)
    || state.urls.length < 1 || state.urls.length > SCRAPER_BATCH_MAX_URLS
    || !owns(actions, state.mode) || !owns(SCRAPER_BATCH_DELAYS, state.rateLimitMode)
    || !Number.isSafeInteger(state.nextIndex) || state.nextIndex < 0 || state.nextIndex > state.urls.length
    || state.active.length > SCRAPER_BATCH_CONCURRENCY || new Set(state.active).size !== state.active.length
    || state.admitted.length > SCRAPER_BATCH_MAX_URLS || new Set(state.admitted).size !== state.admitted.length
    || state.admitted.some(index => !Number.isSafeInteger(index) || index < 0 || index >= state.nextIndex)
    || state.active.some(index => !Number.isSafeInteger(index) || index < 0 || index >= state.nextIndex)) {
    throw new ScraperBatchError('Le manifeste enregistré est invalide.', 409);
  }
  return state;
}

function summary(state: ScraperBatchState, entries: ScraperBatchEntry[], finished = false): ScraperBatchResult {
  const saved = [...new Map(entries.map(entry => [entry.index, entry])).values()].sort((a, b) => a.index - b.index);
  const stats = Object.fromEntries(statNames.map(name => [name, 0]));
  for (const entry of saved) if (entry.status === 'completed') {
    for (const name of statNames) stats[name] += entry.stats?.[name] ?? 0;
  }
  const completed = saved.filter(entry => entry.status === 'completed').length;
  const failed = saved.filter(entry => entry.status === 'failed').length;
  const skipped = saved.filter(entry => entry.status === 'skipped').length;
  return { finished, success: finished && !state.stopRequested && failed === 0 && skipped === 0 && completed === state.urls.length,
    stopped: state.stopRequested, total: state.urls.length, completed, failed, skipped, entries: saved, stats };
}
function entriesOf(job: ToolJob): ScraperBatchEntry[] {
  const result = job.result_payload as unknown as ScraperBatchResult | null;
  return Array.isArray(result?.entries) ? result.entries : [];
}

function skipUnreserved(state: ScraperBatchState, entries: ScraperBatchEntry[]): ScraperBatchEntry[] {
  return [...entries, ...Array.from({ length: state.urls.length - state.nextIndex }, (_, offset) => ({
    index: state.nextIndex + offset, url: state.urls[state.nextIndex + offset], status: 'skipped' as const,
  }))];
}

async function checkpoint(runtime: ScraperBatchRuntime, job: ToolJob, state: ScraperBatchState,
  result: ScraperBatchResult, extra: Record<string, unknown> = {}) {
  const next = { ...state, revision: uuid(runtime) };
  return runtime.store.compareAndSwap(job.id, stateOf(job).revision, {
    request_payload: { ...job.request_payload, batch: next }, result_payload: result,
    progress_percentage: Math.round((result.completed + result.failed + result.skipped) / result.total * 100),
    progress_message: `${result.completed} réussies, ${result.failed} en erreur, ${result.skipped} non lancées sur ${result.total} URL.`,
    updated_at: new Date(clock(runtime)()).toISOString(), ...extra,
  });
}

export async function startScraperBatch(runtime: ScraperBatchRuntime, input: unknown, owner: string,
  requestId: string, scopeKey = ''): Promise<ToolJob> {
  if (!isUUID(owner) || !isUUID(requestId) || scopeKey.length > 256 || /[\r\n]/.test(scopeKey)) throw new ScraperBatchError('Identifiant invalide.', 400);
  const manifest = normalizeScraperBatchManifest(input);
  if (!await runtime.isAdmin(owner)) throw new ScraperBatchError('Accès administrateur requis.', 403);
  const requestHash = await hash(JSON.stringify(manifest));
  let job = await runtime.store.byRequest(requestId, owner);
  if (!job) {
    const now = clock(runtime)();
    const state: ScraperBatchState = { ...manifest, version: 1, revision: uuid(runtime),
      adminAuthorized: true, authorizedOwner: owner, authorizedAt: new Date(now).toISOString(),
      nextIndex: 0, active: [], admitted: [], nextBatchAt: 0, leaseId: null, leaseUntil: 0, stopRequested: false };
    try {
      job = await runtime.store.create({ id: uuid(runtime), public_token: requestId, requested_by: owner,
        function_name: 'medical-scraper', analysis_mode: SCRAPER_BATCH_MODE, status: 'queued',
        progress_percentage: 0, progress_message: 'Lot enregistré. En attente de traitement.',
        request_payload: { requestHash, scopeKey, batch: state }, result_payload: summary(state, []),
        expires_at: new Date(now + SCRAPER_BATCH_TTL_MS).toISOString() });
    } catch (error) {
      job = await runtime.store.byRequest(requestId, owner);
      if (!job) throw error;
    }
  }
  stateOf(job);
  if (job.requested_by !== owner || job.request_payload.requestHash !== requestHash || job.request_payload.scopeKey !== scopeKey) {
    throw new ScraperBatchError('Cet identifiant appartient à un autre manifeste.', 409);
  }
  return job;
}

export async function stopScraperBatch(runtime: ScraperBatchRuntime, id: string, owner: string): Promise<ToolJob> {
  const now = clock(runtime);
  const deadline = now() + CONTROL_BUDGET_MS;
  for (let attempt = 0; attempt < 8 && now() + 2 * DB_OPERATION_MS <= deadline; attempt++) {
    const job = await runtime.store.get(id);
    if (!job || job.requested_by !== owner) throw new ScraperBatchError('Lot inaccessible.', 404);
    const state = stateOf(job);
    if (terminal(job) || state.stopRequested) return job;
    const stopped = { ...state, stopRequested: true, stopReason: 'user' as const };
    const saved = await checkpoint(runtime, job, stopped, summary(stopped, skipUnreserved(stopped, entriesOf(job))), {
      progress_message: 'Arrêt demandé. Les URL non commencées ne seront pas lancées.',
    });
    if (saved) return saved;
  }
  throw new ScraperBatchError('La demande d’arrêt n’a pas encore été confirmée. Réessayez.', 409);
}

async function ensureChild(runtime: ScraperBatchRuntime, parent: ToolJob, state: ScraperBatchState, index: number) {
  const id = await scraperBatchChildId(parent.id, index);
  let child = await runtime.store.get(id);
  if (!child) {
    const body = JSON.stringify({ action: actions[state.mode], url: state.urls[index] });
    try {
      child = await runtime.store.create({ id, public_token: id, requested_by: parent.requested_by,
        function_name: 'medical-scraper', analysis_mode: TRANSPORT_MODE, status: 'queued', progress_percentage: 0,
        progress_message: 'URL en attente.', expires_at: parent.expires_at,
        request_payload: { batchParentId: parent.id, batchIndex: index, contentType: 'application/json',
          scopeKey: `scraper-batch:${parent.id}`, requestHash: await hash(body) }, result_payload: null });
    } catch (error) { child = await runtime.store.get(id); if (!child) throw error; }
  }
  if (child.analysis_mode !== TRANSPORT_MODE || child.function_name !== 'medical-scraper'
    || child.requested_by !== parent.requested_by || child.request_payload.batchParentId !== parent.id
    || child.request_payload.batchIndex !== index) throw new ScraperBatchError('Étape de lot incohérente.', 409);
  return child;
}

/** Called only by the service-authenticated child route. No HTTP-supplied business body is trusted. */
export async function prepareScraperBatchChild(runtime: ScraperBatchRuntime, parentId: string, index: number): Promise<{
  job: ToolJob; body: Uint8Array; contentType: 'application/json';
} | null> {
  const now = clock(runtime);
  const deadline = now() + CONTROL_BUDGET_MS;
  // An admission uses at most four DB operations. Leave their complete timeout
  // budget before retrying a conflict so no loop can outlive its Edge request.
  for (let attempt = 0; attempt < 8 && now() + 4 * DB_OPERATION_MS <= deadline; attempt++) {
    const parent = await runtime.store.get(parentId);
    if (!parent || terminal(parent)) return null;
    const state = stateOf(parent);
    if (!state.active.includes(index) || (state.stopRequested && !state.admitted.includes(index))
      || (parent.expires_at && Date.parse(parent.expires_at) <= clock(runtime)())) return null;
    const id = await scraperBatchChildId(parentId, index);
    const child = await runtime.store.get(id);
    if (!child || child.status !== 'queued' || child.requested_by !== parent.requested_by
      || child.analysis_mode !== TRANSPORT_MODE || child.function_name !== 'medical-scraper'
      || child.request_payload.batchParentId !== parentId || child.request_payload.batchIndex !== index) return null;
    if (!state.admitted.includes(index)) {
      if (!await runtime.isAdmin(parent.requested_by)) return null;
      // Stop and admission compete on the same parent revision. Once admitted,
      // this URL is accepted even if its claimed child executes after the stop.
      const admitted = { ...state, admitted: [...state.admitted, index] };
      const saved = await checkpoint(runtime, parent, admitted, summary(admitted, entriesOf(parent)));
      if (!saved) continue;
    }
    return { job: child, body: new TextEncoder().encode(JSON.stringify({ action: actions[state.mode], url: state.urls[index] })), contentType: 'application/json' };
  }
  return null;
}

function childEntry(state: ScraperBatchState, index: number, child: ToolJob): ScraperBatchEntry {
  const base = { index, url: state.urls[index], jobId: child.id };
  if (child.request_payload.batchSkipped === true) return { ...base, status: 'skipped' };
  if (child.status !== 'completed') return { ...base, status: 'failed', error: child.error_message || 'Le résultat de cette URL n’a pas pu être confirmé.' };
  try {
    const payload = child.result_payload as { body?: unknown };
    const data = typeof payload?.body === 'string' ? JSON.parse(payload.body) : null;
    if (!data || data.success !== true) throw new Error('Incomplete response');
    const stats = Object.fromEntries(statNames.map(name => {
      const value = data.stats?.[name];
      return [name, typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0];
    }));
    return { ...base, status: 'completed', stats };
  } catch { return { ...base, status: 'failed', error: 'La réponse enregistrée est incomplète ; aucune relance automatique.' }; }
}

/** A short parent monitor owns orchestration only; each paid operation has a separate claimed child. */
export async function runScraperBatch(runtime: ScraperBatchRuntime, id: string): Promise<void> {
  const now = clock(runtime);
  const start = now();
  let job = await runtime.store.get(id);
  if (!job || terminal(job)) return;
  let state = stateOf(job);
  if (state.leaseId && state.leaseUntil > now()) return;
  const leaseId = uuid(runtime);
  const claimed = await checkpoint(runtime, job, { ...state, leaseId, leaseUntil: now() + SCRAPER_BATCH_LEASE_MS },
    summary(state, entriesOf(job)), { status: 'processing', started_at: new Date(now()).toISOString() });
  if (!claimed) return;
  job = claimed;
  state = stateOf(claimed);
  let relayDelay = 0;
  try {
    while (now() - start < SCRAPER_BATCH_MONITOR_MS) {
      const current = await runtime.store.get(id);
      if (!current || terminal(current)) return;
      job = current;
      state = stateOf(job);
      if (state.leaseId !== leaseId || state.leaseUntil <= now()) return;
      let entries = entriesOf(job);
      const expired = Boolean(job.expires_at && Date.parse(job.expires_at) <= now());
      if (!state.stopRequested && (expired || !await runtime.isAdmin(job.requested_by))) {
        const stopped = { ...state, stopRequested: true, stopReason: expired ? 'deadline' as const : 'authorization' as const };
        const saved = await checkpoint(runtime, job, stopped, summary(stopped, skipUnreserved(stopped, entries)));
        if (!saved) continue;
        job = saved; state = stateOf(saved); entries = entriesOf(saved);
      }

      if (state.active.length) {
        const children = await Promise.all(state.active.map(index => ensureChild(runtime, job!, state, index)));
        let waiting = false;
        for (let offset = 0; offset < state.active.length; offset++) {
          const index = state.active[offset];
          let child = children[offset];
          if (child.status === 'queued' && state.stopRequested && (!state.admitted.includes(index) || expired)) {
            child = await runtime.store.settleChild(child.id, child.status, child.updated_at, {
              status: 'failed', error_message: 'Non lancée : arrêt demandé.', completed_at: new Date(now()).toISOString(),
              updated_at: new Date(now()).toISOString(), request_payload: { ...child.request_payload, batchSkipped: true },
            }) ?? child;
          }
          if (child.status === 'processing' && now() - Date.parse(child.updated_at) >= SCRAPER_CHILD_STALE_MS) {
            child = await runtime.store.settleChild(child.id, child.status, child.updated_at, {
              status: 'failed', error_message: 'Suivi interrompu, résultat à vérifier. Aucune nouvelle exécution automatique.',
              updated_at: new Date(now()).toISOString(), completed_at: new Date(now()).toISOString(),
            }) ?? child;
          }
          if (terminal(child)) {
            const entry = childEntry(state, index, child);
            entries = [...entries.filter(saved => saved.index !== index), entry];
          } else {
            waiting = true;
            if (child.status === 'queued' && (!state.stopRequested || state.admitted.includes(index)) && !expired) {
              // Retrying this internal dispatch is safe: the child route claims queued -> processing once.
              await runtime.dispatchChild(id, index).catch(() => undefined);
            }
          }
        }
        if (waiting) {
          const saved = await checkpoint(runtime, job, state, summary(state, entries));
          if (saved) job = saved;
          await wait(runtime, Math.min(2_500, Math.max(0, SCRAPER_BATCH_MONITOR_MS - (now() - start))));
          continue;
        }
        state = { ...state, active: [], nextBatchAt: now() + SCRAPER_BATCH_DELAYS[state.rateLimitMode] };
      }

      if (state.stopRequested) {
        entries = skipUnreserved(state, entries);
        state = { ...state, nextIndex: state.urls.length };
      }
      if (state.nextIndex >= state.urls.length) {
        const result = summary(state, entries, true);
        const saved = await checkpoint(runtime, job, { ...state, leaseId: null, leaseUntil: 0 }, result, {
          status: result.success ? 'completed' : 'failed', completed_at: new Date(now()).toISOString(),
          progress_message: result.stopped ? 'Import arrêté. Les résultats reçus sont conservés.'
            : result.failed ? 'Import terminé avec des erreurs à vérifier.' : 'Import terminé.',
          error_message: result.stopped ? 'Import arrêté. Les URL non commencées n’ont pas été lancées.'
            : result.failed ? `${result.failed} URL en erreur. Aucune relance automatique.` : null,
        });
        if (saved) return;
        continue;
      }
      if (state.nextBatchAt > now()) {
        // Checkpoint the completed wave before yielding to the persisted cooldown.
        const saved = await checkpoint(runtime, job, state, summary(state, entries));
        if (saved) job = saved;
        relayDelay = Math.min(state.nextBatchAt - now(), SCRAPER_BATCH_DELAYS.slow);
        break;
      }
      const active = Array.from({ length: Math.min(SCRAPER_BATCH_CONCURRENCY, state.urls.length - state.nextIndex) }, (_, offset) => state.nextIndex + offset);
      // Reserve the wave before creating children. A stop winning this CAS leaves
      // no orphaned queued rows, and child admission has its own fenced CAS.
      const next = { ...state, active, nextIndex: state.nextIndex + active.length };
      const saved = await checkpoint(runtime, job, next, summary(next, entries));
      if (!saved) continue;
      job = saved;
    }
  } finally {
    // A replacement worker cannot overwrite a newer lease/revision. A failed release
    // waits out the bounded lease before handing off, rather than duplicating work.
    let shouldRelay = false;
    try {
      const latest = await runtime.store.get(id);
      if (latest && !terminal(latest)) {
        const current = stateOf(latest);
        if (current.leaseId === leaseId) {
          const released = await checkpoint(runtime, latest, { ...current, leaseId: null, leaseUntil: 0 }, summary(current, entriesOf(latest)));
          shouldRelay = true;
          if (!released) relayDelay = Math.max(relayDelay, Math.max(0, current.leaseUntil - now()));
        }
      }
    } catch {
      shouldRelay = true;
      relayDelay = Math.max(relayDelay, Math.max(0, state.leaseUntil - now()));
    }
    if (shouldRelay) await runtime.relayMonitor(id, Math.min(SCRAPER_BATCH_LEASE_MS, relayDelay)).catch(() => undefined);
  }
}
