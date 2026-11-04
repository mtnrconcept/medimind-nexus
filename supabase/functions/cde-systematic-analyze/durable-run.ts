import type { AIBackgroundPollResult, AIBackgroundResponse, AICallOptions } from '../_shared/ai-client.ts';
import type { MedicationCatalogItem } from './medication-catalog.ts';
import { buildPathologyPrompt, buildPathologyUserPrompt, type PathologyMapping } from './pathology-filter.ts';

export const SYSTEMATIC_MODE = 'systematic_run';
export const MAX_SYSTEMATIC_ENTITIES = 120;
export const MAX_PAIRS_PER_ANALYZE_STEP = 4;

export type SystematicEntity = Pick<MedicationCatalogItem, 'id' | 'name' | 'source' | 'node_type' | 'atc_code' | 'properties'>;
export type SystematicBatch = { index: number; candidates: number[]; pending: number[]; cached: number; documented: number };
export type SystematicRunState = {
  version: 1;
  runId: string;
  owner: string;
  targetPathology: string | null;
  entities?: SystematicEntity[];
  pathologyContext?: PathologyMapping | null;
  index: number;
  batch?: SystematicBatch;
};

export type SystematicPair = {
  entity_b_name: string;
  is_documented: boolean;
  discovery_type: string;
  plausibility_score: number;
  severity: string;
  reasoning: string;
  mechanism: string;
  recommendation: string;
};
export type SystematicAnalysis = { pairs: SystematicPair[]; synthesis: string };
export type SystematicStepResult = {
  index: number;
  substance_analyzed: string;
  entity_type: string;
  pairs_count: number;
  discoveries_count: number;
  skipped: number;
  synthesis: string;
  next_index: number;
  candidate_window_size: number;
  candidate_window_total: number;
  entities_tested: string[];
  prompt_used: string;
  research_steps: Array<Record<string, unknown>>;
  full_analysis: Array<{
    entity_b: string; documented: boolean; discovery_type: string; severity: string;
    mechanism: string; reasoning: string; recommendation: string; plausibility: number;
  }>;
};
export type SystematicRunResult = {
  success: true;
  completed: boolean;
  run_id: string;
  target_pathology: string | null;
  total_substances: number;
  total_pairs: number;
  current_substance_index: number;
  pairs_analyzed: number;
  pairs_skipped: number;
  pairs_processed: number;
  discoveries_found: number;
  substances: string[];
  steps: SystematicStepResult[];
};

export class SystematicPersistenceError extends Error {
  constructor() {
    super('Enregistrement du résultat temporairement indisponible. La réponse IA est conservée.');
    this.name = 'SystematicPersistenceError';
  }
}

/** Preserve the existing four-successor window, rather than expanding its paid scope. */
export function systematicCandidates(count: number, index: number): number[] {
  return Array.from({ length: Math.max(0, Math.min(MAX_PAIRS_PER_ANALYZE_STEP, count - index - 1)) }, (_, offset) => index + offset + 1);
}

export function systematicPairCount(count: number): number {
  return Array.from({ length: count }, (_, index) => systematicCandidates(count, index).length).reduce((sum, size) => sum + size, 0);
}

export function emptySystematicResult(state: SystematicRunState): SystematicRunResult {
  const entities = state.entities ?? [];
  return {
    success: true, completed: false, run_id: state.runId, target_pathology: state.targetPathology,
    total_substances: entities.length, total_pairs: systematicPairCount(entities.length),
    current_substance_index: 0, pairs_analyzed: 0, pairs_skipped: 0, pairs_processed: 0,
    discoveries_found: 0, substances: entities.map(entity => entity.name), steps: [],
  };
}

const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('fr');
const discoveries = new Set(['interaction', 'synergie', 'contre-indication', 'risque_combine', 'aggravation', 'benefice', 'aucun']);
const severities = new Set(['faible', 'moderee', 'elevee', 'critique']);

/** No missing, duplicate, foreign or malformed pair may count as a completed window. */
export function parseSystematicAnalysis(text: string, expected: SystematicEntity[]): SystematicAnalysis {
  let data: { pairs?: unknown; synthesis?: unknown };
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Missing JSON');
    data = JSON.parse(match[0]);
  } catch { throw new Error('La réponse IA est invalide. La progression de cette fenêtre est conservée.'); }
  if (!data || !Array.isArray(data.pairs) || data.pairs.length !== expected.length) {
    throw new Error('La réponse IA ne couvre pas toutes les paires demandées. La progression est conservée.');
  }
  const wanted = new Map(expected.map(entity => [normalized(entity.name), entity]));
  const seen = new Set<string>();
  const pairs = data.pairs.map((value: unknown): SystematicPair => {
    if (!value || typeof value !== 'object') throw new Error('Une paire IA est invalide.');
    const pair = value as Record<string, unknown>;
    const name = pair.entity_b_name ?? pair.substance_b_name;
    const entity = typeof name === 'string' ? wanted.get(normalized(name)) : undefined;
    if (!entity || seen.has(normalized(entity.name)) || typeof pair.is_documented !== 'boolean'
      || !discoveries.has(String(pair.discovery_type)) || !severities.has(String(pair.severity))
      || typeof pair.plausibility_score !== 'number' || !Number.isFinite(pair.plausibility_score)
      || pair.plausibility_score < 0 || pair.plausibility_score > 1) {
      throw new Error('Une paire IA est absente, dupliquée ou incohérente. La progression est conservée.');
    }
    seen.add(normalized(entity.name));
    const field = (key: string) => typeof pair[key] === 'string' ? String(pair[key]) : '';
    return {
      entity_b_name: entity.name, is_documented: pair.is_documented,
      discovery_type: String(pair.discovery_type), plausibility_score: pair.plausibility_score,
      severity: String(pair.severity), reasoning: field('reasoning'), mechanism: field('mechanism'), recommendation: field('recommendation'),
    };
  });
  return { pairs, synthesis: typeof data.synthesis === 'string' ? data.synthesis : '' };
}

export interface SystematicWorkerRuntime {
  loadCatalog(state: SystematicRunState): Promise<{ entities: SystematicEntity[]; pathologyContext: PathologyMapping | null }>;
  prepareBatch(state: SystematicRunState): Promise<SystematicBatch>;
  checkpoint(state: SystematicRunState): Promise<void>;
  start(systemPrompt: string, userPrompt: string, options: AICallOptions): Promise<AIBackgroundResponse>;
  retrieve(responseId: string): Promise<AIBackgroundPollResult | null>;
  rememberProvider(response: AIBackgroundResponse): Promise<void>;
  savePairs(state: SystematicRunState, batch: SystematicBatch, analysis: SystematicAnalysis): Promise<void>;
  advance(state: SystematicRunState, result: SystematicRunResult, resetStepWindow: boolean): Promise<void>;
  finish(state: SystematicRunState, result: SystematicRunResult): Promise<void>;
}

const concisePrompt = `Tu es un pharmacologue computationnel. Analyse uniquement les quelques paires fournies.
Ne prescris pas. Ne confirme pas une interaction sans evidence; marque les hypotheses comme theoriques.
Reponds UNIQUEMENT en JSON valide, sans markdown, sans raisonnement long.`;

/** One bounded worker: prepare, create OR finalize a single provider response. */
export async function executeSystematicStep(
  payload: { state: SystematicRunState; result?: SystematicRunResult | null; providerResponseId?: string; maxOutputTokens?: number },
  runtime: SystematicWorkerRuntime,
): Promise<'continued' | 'polling' | 'completed'> {
  let state = structuredClone(payload.state);
  if (!state.entities) {
    const snapshot = await runtime.loadCatalog(state);
    if (snapshot.entities.length < 2) throw new Error('Pas assez de substances pour cette analyse (minimum : 2).');
    state = { ...state, entities: snapshot.entities.slice(0, MAX_SYSTEMATIC_ENTITIES), pathologyContext: snapshot.pathologyContext };
    // Catalog network calls and OpenAI creation get separate worker invocations.
    await runtime.advance(state, emptySystematicResult(state), false);
    return 'continued';
  }
  const entities = state.entities;
  const previous = payload.result ?? emptySystematicResult(state);
  if (state.index >= entities.length - 1) {
    await runtime.finish(state, { ...previous, completed: true, current_substance_index: entities.length });
    return 'completed';
  }

  let batch = state.batch;
  if (!batch) {
    if (payload.providerResponseId) throw new Error('La fenêtre de cette réponse IA est introuvable. Aucune autre paire ne sera analysée.');
    batch = await runtime.prepareBatch(state);
    state = { ...state, batch };
    // Persist the exact model input before POST. Retries/finalization never refilter a changed cache.
    await runtime.checkpoint(state);
  }
  if (batch.index !== state.index || batch.pending.some(index => !batch.candidates.includes(index))) {
    throw new Error('La fenêtre enregistrée ne correspond plus à la progression.');
  }
  const entityA = entities[state.index];
  const pending = batch.pending.map(index => entities[index]);
  const systemPrompt = buildPathologyPrompt(state.pathologyContext ?? null, concisePrompt);
  const userPrompt = buildPathologyUserPrompt(entityA, pending, state.pathologyContext ?? null);
  let analysis: SystematicAnalysis = { pairs: [], synthesis: 'Cette fenêtre est déjà analysée ou documentée.' };

  if (pending.length) {
    if (!payload.providerResponseId) {
      const response = await runtime.start(systemPrompt, userPrompt, {
        model: 'gpt-5.5', reasoningEffort: 'medium', maxTokens: payload.maxOutputTokens ?? 32_768,
        enforceClinicalContract: true, elementCount: pending.length + 1, hasExternalEvidence: true,
      });
      await runtime.rememberProvider(response);
      return 'polling';
    }
    const response = await runtime.retrieve(payload.providerResponseId);
    if (!response) return 'polling';
    if (response.status !== 'completed' || !response.text?.trim()) {
      throw new Error('La réponse IA de cette fenêtre est incomplète. Aucun avancement n’a été enregistré.');
    }
    analysis = parseSystematicAnalysis(response.text, pending);
    await runtime.savePairs(state, batch, analysis);
  }

  const discoveriesCount = analysis.pairs.filter(pair => !pair.is_documented && pair.discovery_type !== 'aucun').length;
  const step: SystematicStepResult = {
    index: state.index, substance_analyzed: entityA.name, entity_type: entityA.node_type || 'substance',
    pairs_count: analysis.pairs.length, discoveries_count: discoveriesCount,
    skipped: batch.cached + batch.documented, synthesis: analysis.synthesis, next_index: state.index + 1,
    candidate_window_size: pending.length, candidate_window_total: batch.candidates.length,
    entities_tested: pending.map(entity => entity.name), prompt_used: pending.length ? userPrompt : '',
    research_steps: [
      { step: 1, title: 'Identification de l’entité principale', description: entityA.name },
      { step: 2, title: 'Sélection des entités à tester', description: `${pending.length} paires à analyser, ${batch.cached + batch.documented} déjà analysées ou documentées.` },
      { step: 3, title: 'Analyse pharmacologique', description: pending.length ? 'Réponse IA complète reçue.' : 'Réutilisation des analyses existantes.' },
      { step: 4, title: 'Enregistrement des résultats', description: `${analysis.pairs.length} paires, ${discoveriesCount} découvertes théoriques.` },
    ],
    full_analysis: analysis.pairs.map(pair => ({
      entity_b: pair.entity_b_name, documented: pair.is_documented, discovery_type: pair.discovery_type,
      severity: pair.severity, mechanism: pair.mechanism, reasoning: pair.reasoning,
      recommendation: pair.recommendation, plausibility: pair.plausibility_score,
    })),
  };
  // Replacing by index also keeps reconciliation idempotent after a lost acknowledgement.
  const steps = [...previous.steps.filter(saved => saved.index !== step.index), step].sort((a, b) => a.index - b.index);
  const nextIndex = state.index + 1;
  const done = nextIndex >= entities.length - 1;
  const result: SystematicRunResult = {
    ...previous, completed: done, steps,
    current_substance_index: done ? entities.length : nextIndex,
    pairs_analyzed: steps.reduce((sum, saved) => sum + saved.pairs_count, 0),
    pairs_skipped: steps.reduce((sum, saved) => sum + saved.skipped, 0),
    pairs_processed: steps.reduce((sum, saved) => sum + saved.candidate_window_total, 0),
    discoveries_found: steps.reduce((sum, saved) => sum + saved.discoveries_count, 0),
  };
  state = { ...state, index: nextIndex, batch: undefined };
  if (done) { await runtime.finish(state, result); return 'completed'; }
  await runtime.advance(state, result, true);
  return 'continued';
}
