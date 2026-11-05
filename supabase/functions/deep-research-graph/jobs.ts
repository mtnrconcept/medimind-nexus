import type { AICallOptions, AIBackgroundPollResult, AIBackgroundResponse } from '../_shared/ai-client.ts';
import { MAX_AI_OUTPUT_TOKENS } from '../_shared/ai-policy.ts';
import {
  buildResearchPrompt, completeResearch, prepareResearch,
  type PreparedResearch, type ResearchInput, type ResearchServices,
} from './handler.ts';

export const GRAPH_RESEARCH_MODE = 'graph_research';
const MAX_SNAPSHOT_BYTES = 2_000_000;

/** Only validated research inputs enter a new job; browser-supplied control fields never do. */
export function safeGraphJobPayload(input: ResearchInput) {
  return {
    topic: input.topic, pathologies: input.pathologies,
    ...(input.topicType ? { topic_type: input.topicType } : {}),
    ...(input.medication ? { medication: input.medication } : {}),
    include_pubmed: input.includePubmed, include_fda: input.includeFda,
    existing_nodes: input.existingNodes, max_nodes: input.maxNodes,
    streaming: false, async: true,
  };
}

export interface GraphJobExecution {
  input: ResearchInput;
  /** Loaded exclusively from the authorized, leased job record. */
  snapshot?: PreparedResearch;
  providerResponseId?: string;
  backgroundMaxTokens?: number;
}

export interface GraphJobDependencies {
  services: ResearchServices;
  start(system: string, prompt: string, options: AICallOptions): Promise<AIBackgroundResponse>;
  retrieve(id: string, options: AICallOptions): Promise<AIBackgroundPollResult | null>;
  update(patch: Record<string, unknown>, maxOutputTokens?: number): Promise<void>;
  /** Save the snapshot and hand the next phase to a fresh, leased worker. */
  advance(patch: Record<string, unknown>): Promise<void>;
  now?: () => number;
}

export class GraphResearchPersistenceError extends Error {
  constructor() {
    super('La réponse est terminée mais sa publication doit être reprise.');
    this.name = 'GraphResearchPersistenceError';
  }
}

function requireAstra(model: string) {
  if (!/^gpt-6-astra(?:-|$)/.test(model)) {
    throw new Error('La réponse ne provient pas du modèle Astra attendu.');
  }
}

/**
 * The monitor owns dispatch, authorization, leases, retries and token continuation.
 * Each worker collects sources, creates a background response, or finalizes that
 * exact response. The evidence snapshot survives the provider's latency.
 */
export async function runGraphResearchJob(
  job: GraphJobExecution, deps: GraphJobDependencies,
): Promise<'pending' | 'completed'> {
  let prepared = job.snapshot;
  if (job.providerResponseId && !prepared) {
    throw new Error('Le contexte de recherche enregistré est indisponible. Relancez une nouvelle recherche.');
  }
  if (!prepared) {
    prepared = await prepareResearch(job.input, deps.services);
    if (new TextEncoder().encode(JSON.stringify(prepared)).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new Error('Le contexte de recherche dépasse la capacité prévue ; réduisez la sélection.');
    }
    // A failed write must stop before provider creation. Never silently omit evidence.
    await deps.advance({
      request_payload: { _researchSnapshot: prepared },
      progress_percentage: 25,
      progress_message: 'Sources et contexte du graphe enregistrés. Analyse Astra en préparation.',
    });
    // Collection and provider creation have separate worker budgets. A slow
    // source cannot consume the time needed to safely persist the provider ID.
    return 'pending';
  }
  const request = buildResearchPrompt(prepared);
  const requestedBudget = job.backgroundMaxTokens;
  const options: AICallOptions = {
    ...request.options,
    maxTokens: Math.min(MAX_AI_OUTPUT_TOKENS, Math.max(request.options.maxTokens ?? 65_536,
      Number.isFinite(requestedBudget) && requestedBudget! > 0 ? requestedBudget! : 0)),
  };
  const now = deps.now ?? Date.now;
  if (!job.providerResponseId) {
    const response = await deps.start(request.system, request.prompt, options);
    requireAstra(response.model);
    if (!response.id || ['failed', 'cancelled', 'canceled'].includes(response.status)) {
      throw new Error('La génération du graphe n’a pas été acceptée.');
    }
    await deps.update({
      provider_name: response.provider, provider_response_id: response.id,
      provider_status: response.status, provider_started_at: new Date(now()).toISOString(),
      model: response.model, reasoning_effort: response.reasoningEffort,
      progress_percentage: 40,
      progress_message: 'GPT-6 Astra recherche les relations et leurs sources. Vous pouvez quitter cet écran.',
    }, response.maxOutputTokens ?? options.maxTokens);
    return 'pending';
  }

  const response = await deps.retrieve(job.providerResponseId, options);
  if (!response) return 'pending';
  requireAstra(response.model);
  if (response.status === 'queued' || response.status === 'in_progress') {
    await deps.update({ provider_status: response.status,
      progress_message: 'Recherche Astra en cours ; la même réponse reste suivie en arrière-plan.' });
    return 'pending';
  }
  if (response.status !== 'completed' || !response.text?.trim()) {
    throw new Error('La réponse du graphe est incomplète ; elle ne peut pas être publiée comme un résultat final.');
  }
  const result = completeResearch(prepared, { ...response, text: response.text });
  if (result.ai_model === 'fallback') throw new Error('La synthèse Astra n’a pas pu être validée.');
  try {
    await deps.update({
      status: 'completed', provider_status: 'completed',
      progress_percentage: 100, progress_message: 'Graphe de recherche et références enregistrés.',
      result_payload: result, model: response.model, reasoning_effort: response.reasoningEffort,
      error_message: null, completed_at: new Date(now()).toISOString(),
      provider_completed_at: new Date(now()).toISOString(),
    });
  } catch {
    // A storage outage must not discard a valid paid response. The adapter
    // releases finalization back to polling without replacing its response ID.
    throw new GraphResearchPersistenceError();
  }
  return 'completed';
}
