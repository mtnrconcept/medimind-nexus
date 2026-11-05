import type { AIBackgroundPollResult, AIBackgroundResponse } from './ai-client.ts';
import { MAX_AI_OUTPUT_TOKENS } from './ai-policy.ts';
import { RESEARCH_MODEL } from './research-model.ts';
import { BACKGROUND_JOB_TTL_MS, prepareBackgroundJobPayload } from './background-job-monitor.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HYPOTHESIS_OUTPUT_TOKENS = 65_536;

/** Extract one complete JSON object without counting braces inside quoted text. */
export function extractHypothesisJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] ?? text).trim();
  const start = source.indexOf('{');
  if (start < 0) return source;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  return source;
}

/** The evidence stays in the existing table; the private mirror owns execution. */
export function buildHypothesisMirror(id: string, ownerId: string, now = Date.now()) {
  if (!UUID.test(id) || !UUID.test(ownerId)) throw new Error('Identifiant de tâche ou propriétaire invalide.');
  return {
    id, function_name: 'hypothesis-processor', analysis_mode: 'hypothesis_generation',
    status: 'queued', progress_percentage: 0, progress_message: 'En attente de traitement...',
    request_payload: prepareBackgroundJobPayload({ async: true, legacyJobId: id }, now),
    requested_by: ownerId, expires_at: new Date(now + BACKGROUND_JOB_TTL_MS).toISOString(),
    model: RESEARCH_MODEL, reasoning_effort: 'high',
  };
}

/** Keeps the original polling and Realtime contract in sync, including errors. */
export function hypothesisLegacyPatch(job: {
  status: string; progress_percentage?: unknown; progress_message?: unknown;
  error_message?: unknown; started_at?: unknown; completed_at?: unknown; result_payload?: unknown;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: job.status === 'queued' ? 'pending' : job.status,
    progress_percentage: Math.max(0, Math.min(100, Number(job.progress_percentage) || 0)),
    progress_message: typeof job.progress_message === 'string' ? job.progress_message : null,
    error_message: typeof job.error_message === 'string' ? job.error_message : null,
  };
  if (typeof job.started_at === 'string') patch.started_at = job.started_at;
  if (typeof job.completed_at === 'string') patch.completed_at = job.completed_at;
  if (job.status === 'completed') {
    const result = job.result_payload as { hypothesis_id?: unknown } | null;
    if (!result || typeof result.hypothesis_id !== 'string' || !UUID.test(result.hypothesis_id)) {
      throw new Error('La publication de l’hypothèse ne possède pas encore de référence valide.');
    }
    patch.hypothesis_id = result.hypothesis_id;
  }
  return patch;
}

export interface HypothesisProviderRuntime {
  start(maxTokens: number): Promise<AIBackgroundResponse>;
  retrieve(responseId: string): Promise<AIBackgroundPollResult>;
  update(patch: Record<string, unknown>, maxOutputTokens?: number): Promise<void>;
  now?: () => number;
}

/** One provider operation per claimed worker; long reasoning runs at OpenAI. */
export async function advanceHypothesisProvider(
  options: { providerResponseId?: string; maxTokens?: number }, runtime: HypothesisProviderRuntime,
): Promise<{ ready: false } | { ready: true; text: string }> {
  if (!options.providerResponseId) {
    const requestedBudget = options.maxTokens ?? HYPOTHESIS_OUTPUT_TOKENS;
    const budget = Number.isFinite(requestedBudget)
      ? Math.min(MAX_AI_OUTPUT_TOKENS, Math.max(HYPOTHESIS_OUTPUT_TOKENS, Math.floor(requestedBudget)))
      : HYPOTHESIS_OUTPUT_TOKENS;
    let response: AIBackgroundResponse;
    try { response = await runtime.start(budget); } catch {
      // A lost creation acknowledgment may already have incurred a generation.
      // The caller reports failure; neither the worker nor monitor repeats POST.
      throw new Error('Le lancement OpenAI n’a pas pu être confirmé. Aucune seconde génération automatique n’a été créée.');
    }
    await runtime.update({
      provider_name: 'openai', provider_response_id: response.id, provider_status: response.status,
      provider_started_at: new Date((runtime.now ?? Date.now)()).toISOString(),
      model: response.model, reasoning_effort: response.reasoningEffort ?? 'high',
      progress_percentage: 40, progress_message: 'L’hypothèse est en cours de génération chez OpenAI.',
    }, response.maxOutputTokens ?? budget);
    return { ready: false };
  }

  let response: AIBackgroundPollResult;
  try { response = await runtime.retrieve(options.providerResponseId); } catch {
    // This is a GET of the persisted id. Release only the finalization lease,
    // then let the watchdog resume polling the same provider response.
    await runtime.update({ provider_status: 'in_progress',
      progress_message: 'Resynchronisation de la réponse IA conservée.' });
    return { ready: false };
  }
  if (response.status !== 'completed') {
    // The monitor owns terminal statuses and bounded max_output_tokens retries.
    // In particular, JSON repair must never receive a truncated response.
    await runtime.update({ provider_status: 'in_progress',
      progress_message: 'Vérification de la réponse IA avant publication.' });
    return { ready: false };
  }
  if (!response.text?.trim()) throw new Error('La réponse OpenAI terminée est vide.');
  return { ready: true, text: response.text };
}

/** Database PK uniqueness makes a repeated publication recoverable. */
export async function publishHypothesisOnce<T extends { id: string }>(id: string, store: {
  insertIfAbsent(): Promise<T | null>;
  load(): Promise<T | null>;
}): Promise<T> {
  const saved = await store.insertIfAbsent() ?? await store.load();
  if (!saved || saved.id !== id) throw new Error('Impossible de confirmer la publication de l’hypothèse.');
  return saved;
}

/** UUIDv8 derived from a job and claim position; retries cannot duplicate claims. */
export async function hypothesisClaimId(jobId: string, index: number): Promise<string> {
  if (!UUID.test(jobId) || !Number.isSafeInteger(index) || index < 0) throw new Error('Référence de claim invalide.');
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(`medicore-hypothesis-claim-v1:${jobId.toLowerCase()}:${index}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
