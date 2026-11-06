import { OpenAIRequestError, type AIBackgroundPollResult, type AIBackgroundResponse, type AICallOptions } from '../_shared/ai-client.ts';
import { nextBackgroundTokenBudget } from '../_shared/background-job-monitor.ts';
import { buildPairCandidates } from './analysis-utils.ts';
import { ASTRA_MODEL } from './agent-contract.ts';
import { AGENT_PAIR_BATCH_SIZE, agentProgress, applyAgentResult, buildAgentRequest, candidatePairs, nextAgentStep,
  type AgentMatrixState, type AgentStep } from './agent-orchestrator.ts';

export const AGENT_PARALLELISM = 8;
const REQUEST_TIMEOUT_MS = 12_000;
const INVOCATION_BUDGET_MS = 60_000;
const MAX_READ_FAILURES = 8;
const MAX_RATE_RETRIES = 5;
type PairStage = 'pairs' | 'candidate_pairs';
interface PairSlot {
  id: string;
  kind: PairStage;
  pairHashes: string[];
  phase: 'creating' | 'running' | 'retry_wait' | 'blocked';
  responseId?: string;
  previousResponseId?: string;
  startedAt: number;
  notBefore?: number;
  maxOutputTokens?: number;
  tokenRetries: number;
  rateRetries: number;
  readFailures: number;
  recovery?: 'read' | 'regenerate';
  error?: { status?: number; code: string };
}

/** Private job ledger: never include provider receipts in the public job projection. */
export interface AgentPairPool {
  version: 1;
  slots: PairSlot[];
  concurrency: number;
  nextLaunchAt?: number;
  startedAt: number;
  lastProgressAt: number;
  completedBatches: number;
  completedPairs: number;
  totalBatchMs: number;
  peakConcurrentBatches: number;
  rateLimitEvents: number;
}

export function createAgentPairPool(): AgentPairPool {
  return { version: 1, slots: [], concurrency: AGENT_PARALLELISM, startedAt: Date.now(), lastProgressAt: Date.now(),
    completedBatches: 0, completedPairs: 0, totalBatchMs: 0, peakConcurrentBatches: 0, rateLimitEvents: 0 };
}

export function pairPoolProgress(state: AgentMatrixState, pool: AgentPairPool) {
  const progress = agentProgress(state);
  const active = pool.slots.filter(s => s.phase === 'running' || s.phase === 'creating');
  const blocked = pool.slots.filter(s => s.phase === 'blocked');
  return { ...progress, message: progress.message + (active.length
    ? ` ${active.reduce((n, s) => n + s.pairHashes.length, 0)} paires en cours dans ${active.length} lots parallèles.`
    : pool.slots.some(s => s.phase === 'retry_wait') ? ' Régulation temporaire du débit de recherche.' : '') +
    (blocked.length ? ` ${blocked.length} lot(s) à reprendre ; résultats acquis conservés.` : '') };
}

export function pairPoolFailureMessage(pool: AgentPairPool) {
  return pool.slots.some(s => /quota|billing|credit/.test(s.error?.code ?? ''))
    ? 'Analyse en pause : le crédit du service OpenAI est épuisé. Rétablissez le crédit, puis reprenez l’analyse. Les résultats acquis sont conservés.'
    : 'Un lot nécessite une reprise. Les réponses des autres lots sont conservées.';
}

export function resumeAgentPairPool(input: AgentPairPool): AgentPairPool {
  const pool = structuredClone(input);
  pool.slots = pool.slots.flatMap(slot => {
    if (slot.phase !== 'blocked' && slot.phase !== 'creating') return [slot];
    if (slot.recovery === 'read' && slot.responseId) return [{ ...slot, phase: 'running' as const,
      readFailures: 0, notBefore: 0, error: undefined, recovery: undefined }];
    // Explicit recovery retries only the failed pairs, one per response. Other receipts survive.
    return slot.pairHashes.map(hash => ({ ...slot, id: crypto.randomUUID(), pairHashes: [hash], phase: 'retry_wait' as const,
      previousResponseId: slot.responseId ?? slot.previousResponseId, responseId: undefined, notBefore: 0,
      tokenRetries: 0, rateRetries: 0, readFailures: 0, error: undefined, recovery: undefined }));
  });
  pool.lastProgressAt = Date.now();
  pool.nextLaunchAt = 0;
  return pool;
}

export class PairPoolPersistenceError extends Error {
  constructor() { super('Le point de reprise doit être relu avant de poursuivre.'); }
}

interface PoolDependencies {
  start(system: string, user: string, options: AICallOptions): Promise<AIBackgroundResponse>;
  retrieve(id: string, options: AICallOptions): Promise<AIBackgroundPollResult>;
  persist(state: AgentMatrixState, pool: AgentPairPool): Promise<void>;
}

function availablePairs(state: AgentMatrixState, kind: PairStage) {
  const cells = kind === 'pairs' ? state.cells : state.agent.candidateCells;
  return (kind === 'pairs' ? buildPairCandidates(state.elements) : candidatePairs(state)).filter(p => !Object.hasOwn(cells, p.pairHash));
}

function slotStep(state: AgentMatrixState, slot: PairSlot): AgentStep {
  const canonical = new Map(availablePairs(state, slot.kind).map(pair => [pair.pairHash, pair]));
  const pairs = slot.pairHashes.map(hash => canonical.get(hash));
  if (!pairs.length || pairs.some(pair => !pair) || new Set(slot.pairHashes).size !== pairs.length ||
    pairs.length > AGENT_PAIR_BATCH_SIZE || nextAgentStep(state).kind !== slot.kind)
    throw new Error('Lot parallèle incohérent.');
  return { kind: slot.kind, pairs: pairs.filter(pair => !!pair) };
}

function backoff(attempt: number, hint = 0) {
  return Math.max(hint, Math.min(120_000, 5_000 * 2 ** Math.min(attempt, 5)) + Math.floor(Math.random() * 1000));
}

function invalidRead(error: unknown) {
  return error instanceof SyntaxError || error instanceof Error &&
    /returned an empty response|returned an invalid response|^OpenAI response completed:/.test(error.message);
}

/**
 * A single leased coordinator owns the ledger. Background creations are acknowledged
 * and persisted one at a time; generations and GETs run concurrently. Every completed
 * response is committed independently, without waiting for the slowest response.
 */
export async function runAgentPairPool(initial: AgentMatrixState, savedPool: AgentPairPool | undefined, deps: PoolDependencies) {
  let state = structuredClone(initial), pool = structuredClone(savedPool ?? createAgentPairPool());
  const deadline = Date.now() + INVOCATION_BUDGET_MS;
  let persistenceFailed = false;
  async function commit(nextState: AgentMatrixState, nextPool: AgentPairPool) {
    if (persistenceFailed) throw new PairPoolPersistenceError();
    try { await deps.persist(nextState, nextPool); }
    catch { persistenceFailed = true; throw new PairPoolPersistenceError(); }
    state = nextState;
    pool = nextPool;
  }
  if (pool.version !== 1) throw new Error('Version du traitement parallèle incompatible.');
  pool.concurrency = Math.max(1, Math.min(AGENT_PARALLELISM, Math.floor(pool.concurrency) || 1));
  // A process may have died after POST but before persisting its receipt. Never POST twice automatically.
  if (pool.slots.some(s => s.phase === 'creating')) {
    const next = structuredClone(pool);
    next.slots.filter(s => s.phase === 'creating').forEach(s => {
      s.phase = 'blocked'; s.recovery = 'regenerate'; s.error = { code: 'creation_unconfirmed' };
    });
    await commit(state, next);
  }

  async function fill() {
    while (Date.now() < deadline - 30_000 && !pool.slots.some(s => s.phase === 'blocked') &&
      (pool.nextLaunchAt ?? 0) <= Date.now() && pool.slots.filter(s => s.phase === 'running').length < pool.concurrency) {
      const expected = nextAgentStep(state);
      if (expected.kind !== 'pairs' && expected.kind !== 'candidate_pairs') break;
      const waiting = pool.slots.find(s => s.phase === 'retry_wait' && (s.notBefore ?? 0) <= Date.now());
      const reserved = new Set(pool.slots.flatMap(s => s.pairHashes));
      const pairs = availablePairs(state, expected.kind).filter(p => !reserved.has(p.pairHash))
        .slice(0, Math.max(1, Math.min(AGENT_PAIR_BATCH_SIZE, state.batchSize)));
      if (!waiting && !pairs.length) break;
      const slot: PairSlot = waiting ? { ...waiting, phase: 'creating', startedAt: Date.now() }
        : { id: crypto.randomUUID(), kind: expected.kind, pairHashes: pairs.map(p => p.pairHash), phase: 'creating',
          startedAt: Date.now(), tokenRetries: 0, rateRetries: 0, readFailures: 0 };
      const step = slotStep(state, slot);
      const request = buildAgentRequest(state, step);
      const intent = structuredClone(pool);
      intent.slots = [...intent.slots.filter(s => s.id !== slot.id), slot];
      await commit(state, intent);
      let response: AIBackgroundResponse;
      try {
        response = await deps.start(request.system, request.user, { ...request.options, backgroundRequestTimeoutMs: REQUEST_TIMEOUT_MS,
          maxTokens: slot.maxOutputTokens ?? request.options.maxTokens });
      } catch (error) {
        const next = structuredClone(pool), failed = next.slots.find(s => s.id === slot.id)!;
        const http = error instanceof OpenAIRequestError ? error : null;
        failed.error = { status: http?.status, code: http?.code ?? 'creation_unconfirmed' };
        const rateLimited = http?.status === 429 && !/quota|billing|credit/.test(http.code ?? '') &&
          failed.rateRetries < MAX_RATE_RETRIES && (http.retryAfterMs ?? 0) <= 300_000;
        if (rateLimited) {
          failed.phase = 'retry_wait'; failed.rateRetries++;
          failed.notBefore = Date.now() + backoff(failed.rateRetries, http.retryAfterMs);
          next.nextLaunchAt = failed.notBefore;
          next.concurrency = Math.max(1, Math.floor(next.concurrency / 2));
          next.rateLimitEvents++;
        } else { failed.phase = 'blocked'; failed.recovery = 'regenerate'; }
        await commit(state, next);
        break;
      }
      const accepted = structuredClone(pool), running = accepted.slots.find(s => s.id === slot.id)!;
      running.responseId = response.id; running.phase = 'running'; running.maxOutputTokens = response.maxOutputTokens;
      accepted.peakConcurrentBatches = Math.max(accepted.peakConcurrentBatches, accepted.slots.filter(s => s.phase === 'running').length);
      await commit(state, accepted);
    }
  }

  await fill();
  // Serialize only durable commits. A slow GET must not delay already returned results.
  let writes: Promise<void> = Promise.resolve();
  const active = pool.slots.filter(s => s.phase === 'running' && s.responseId && (s.notBefore ?? 0) <= Date.now());
  if (Date.now() < deadline - 20_000) await Promise.all(active.map(async slot => {
    const request = buildAgentRequest(state, slotStep(state, slot));
    let provider: AIBackgroundPollResult | undefined, readError: unknown;
    try { provider = await deps.retrieve(slot.responseId!, { ...request.options, backgroundRequestTimeoutMs: REQUEST_TIMEOUT_MS }); }
    catch (error) { readError = error; }
    writes = writes.then(async () => {
      if (persistenceFailed || Date.now() >= deadline - 8_000) return;
      if (provider && ['queued', 'in_progress'].includes(provider.status)) return;
      const next = structuredClone(pool), current = next.slots.find(s => s.id === slot.id);
      if (!current || current.responseId !== slot.responseId || current.phase !== 'running') return;
      const reviewed = structuredClone(state);
      if (readError) {
        const http = readError instanceof OpenAIRequestError ? readError : null;
        current.readFailures++;
        current.error = { status: http?.status, code: http?.code ?? (invalidRead(readError) ? 'invalid_provider_response' : 'read_interrupted') };
        if (invalidRead(readError) || http?.status === 404) {
          current.phase = 'blocked'; current.recovery = 'regenerate';
        } else if ([400, 401, 403].includes(http?.status ?? 0) || current.readFailures >= MAX_READ_FAILURES ||
          /quota|billing|credit/.test(http?.code ?? '') || (http?.retryAfterMs ?? 0) > 300_000) {
          current.phase = 'blocked'; current.recovery = 'read';
        } else {
          current.notBefore = Date.now() + backoff(current.readFailures, http?.retryAfterMs);
          if (http?.status === 429) {
            next.nextLaunchAt = Math.max(next.nextLaunchAt ?? 0, current.notBefore);
            next.concurrency = Math.max(1, Math.floor(next.concurrency / 2)); next.rateLimitEvents++;
          }
        }
      } else if (provider) {
        const budget = nextBackgroundTokenBudget({ retries: current.tokenRetries, maxOutputTokens: current.maxOutputTokens }, provider);
        if (budget !== null) {
          current.tokenRetries++; current.maxOutputTokens = budget;
          current.previousResponseId = current.responseId; current.responseId = undefined;
          current.phase = 'retry_wait'; current.notBefore = 0;
        } else if (provider.status !== 'completed') {
          current.phase = 'blocked'; current.recovery = 'regenerate';
          current.error = { code: provider.errorCode ?? 'provider_' + provider.status.slice(0, 30).replace(/[^a-z_]/g, '') };
        } else {
          try {
            if (provider.model !== ASTRA_MODEL && !provider.model.startsWith(ASTRA_MODEL + '-')) throw new Error('Modèle inattendu.');
            const before = Object.keys(reviewed.cells).length + Object.keys(reviewed.agent.candidateCells).length;
            applyAgentResult(reviewed, slotStep(state, current), JSON.parse(provider.text || ''), provider.webSources || [],
              provider.webSearchCalls || 0, { independentPairs: true });
            if (provider.webSourcesTruncated) reviewed.analysis.warnings = [...new Set([...reviewed.analysis.warnings,
              'La liste des sources consultées a atteint sa limite ; seules les URL conservées sont utilisables comme références.'])];
            next.slots = next.slots.filter(s => s.id !== current.id);
            next.completedBatches++;
            next.completedPairs += Object.keys(reviewed.cells).length + Object.keys(reviewed.agent.candidateCells).length - before;
            next.totalBatchMs += Date.now() - current.startedAt;
            next.lastProgressAt = Date.now();
          } catch {
            current.phase = 'blocked'; current.recovery = 'regenerate'; current.error = { code: 'invalid_clinical_output' };
            // The clone may have advanced partially before validation threw.
            await commit(state, next);
            return;
          }
        }
      }
      await commit(reviewed, next);
    }).catch(error => { persistenceFailed = true; throw error; });
    // Every read observes the failure, so no unhandled rejection or late write can escape the coordinator.
    await writes;
  }).map(work => work.catch(() => { persistenceFailed = true; })));
  if (persistenceFailed) throw new PairPoolPersistenceError();
  await fill();
  return { state, pool, blocked: pool.slots.some(s => s.phase === 'blocked') && !pool.slots.some(s => s.phase === 'running') };
}
