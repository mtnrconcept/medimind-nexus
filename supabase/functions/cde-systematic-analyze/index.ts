import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { startBackgroundAI } from '../_shared/ai-client.ts';
import {
  BACKGROUND_JOB_TTL_MS, continueBackgroundJobRecord, prepareBackgroundJobPayload,
  prepareBackgroundJobRequest, readBackgroundMonitorState, retrieveBackgroundForWorker,
  startBackgroundJobMonitor, updateBackgroundJobRecord,
  type BackgroundJobRow, type NativeJobPayload,
} from '../_shared/background-job-monitor.ts';
import { buildMedicationCatalog, isInteractionDocumented } from './medication-catalog.ts';
import { filterMedicationsByPathology } from './pathology-filter.ts';
import {
  emptySystematicResult, executeSystematicStep, MAX_SYSTEMATIC_ENTITIES, SYSTEMATIC_MODE,
  systematicCandidates, SystematicPersistenceError,
  type SystematicAnalysis, type SystematicBatch, type SystematicRunResult, type SystematicRunState,
} from './durable-run.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Payload = NativeJobPayload & { target_pathology?: unknown; _systematic?: SystematicRunState };

serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }) },
  });
  const projected = new Map<string, string>();
  const syncRun = async (job: BackgroundJobRow, signal?: AbortSignal) => {
    if (job.analysis_mode !== SYSTEMATIC_MODE) return;
    const state = job.request_payload._systematic as SystematicRunState | undefined;
    if (!state || state.owner !== job.requested_by || state.runId !== job.id) return;
    const result = job.result_payload as SystematicRunResult | null;
    const status = job.status === 'completed' || job.status === 'failed' ? job.status
      : readBackgroundMonitorState(job).phase === 'paused' ? 'paused' : 'running';
    const row = {
      id: job.id, created_by: state.owner, status,
      total_substances: state.entities?.length ?? 0,
      current_substance_index: result?.current_substance_index ?? 0,
      pairs_analyzed: result?.pairs_analyzed ?? 0, discoveries_found: result?.discoveries_found ?? 0,
      error_message: typeof job.error_message === 'string' ? job.error_message : null,
      completed_at: typeof job.completed_at === 'string' ? job.completed_at : null,
    };
    const signature = JSON.stringify(row);
    if (projected.get(job.id) === signature) return;
    const { error } = await supabase.from('cde_analysis_runs').upsert(row, { onConflict: 'id' })
      .abortSignal(signal ?? AbortSignal.timeout(5_000));
    if (error) throw new SystematicPersistenceError();
    projected.set(job.id, signature);
  };
  const options = { supabase, supabaseUrl, serviceRoleKey, functionName: 'cde-systematic-analyze', corsHeaders,
    allowLegacyToken: false, syncJob: syncRun };
  let payload: Payload | undefined;
  try {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Demande invalide.' }, 400);
    const prepared = await prepareBackgroundJobRequest(req, body as Payload, options);
    if (prepared.response) return prepared.response;
    payload = prepared.payload;

    if (!payload.runJob) {
      if (!['start', 'start_run'].includes(String(payload.action))) {
        // Older clients may still send analyze. The server now exclusively owns
        // the sequence; accepting it would duplicate or skip a paid model step.
        return json({ success: false, error: 'Le serveur pilote cette analyse. Consultez son suivi enregistré.' }, 409);
      }
      if (!prepared.actor.userId) return json({ error: 'Un propriétaire authentifié est requis.' }, 401);
      if (payload.target_pathology != null && (typeof payload.target_pathology !== 'string' || payload.target_pathology.length > 200)) {
        return json({ error: 'Le filtre de pathologie est invalide.' }, 400);
      }
      const id = crypto.randomUUID();
      const state: SystematicRunState = {
        version: 1, runId: id, owner: prepared.actor.userId,
        targetPathology: typeof payload.target_pathology === 'string' ? payload.target_pathology.trim() || null : null,
        index: 0,
      };
      const { data: job, error } = await supabase.from('ai_analysis_jobs').insert({
        id, function_name: options.functionName, analysis_mode: SYSTEMATIC_MODE,
        status: 'queued', progress_percentage: 0, progress_message: 'Préparation du catalogue de substances.',
        requested_by: state.owner, expires_at: new Date(Date.now() + BACKGROUND_JOB_TTL_MS).toISOString(),
        request_payload: prepareBackgroundJobPayload({ _systematic: state } as Payload, Date.now(), true),
        result_payload: emptySystematicResult(state),
      }).select('id,public_token,status').single();
      if (error || !job) throw new SystematicPersistenceError();
      startBackgroundJobMonitor(options, job.id);
      return json({ success: true, run_id: job.id, job: {
        id: job.id, token: job.public_token, status: job.status, progress: 0,
        message: 'Le serveur poursuit l’analyse de toutes les fenêtres prévues.',
      } }, 202);
    }

    const state = payload._systematic;
    if (!state || state.version !== 1 || state.runId !== payload.jobId || !uuid.test(state.runId)) {
      throw new Error('La définition de cette analyse est invalide.');
    }
    const jobId = state.runId;
    const { data: stored, error: loadError } = await supabase.from('ai_analysis_jobs').select('*')
      .eq('id', jobId).eq('function_name', options.functionName).eq('analysis_mode', SYSTEMATIC_MODE).single();
    if (loadError || !stored || stored.requested_by !== state.owner) throw new SystematicPersistenceError();
    await syncRun(stored as BackgroundJobRow);

    const prepareBatch = async (current: SystematicRunState): Promise<SystematicBatch> => {
      const entities = current.entities!;
      const entityA = entities[current.index];
      const candidates = systematicCandidates(entities.length, current.index);
      const names = [entityA.name, ...candidates.map(index => entities[index].name)];
      const [cache, cards] = await Promise.all([
        supabase.from('cde_analyzed_pairs').select('substance_a_name,substance_b_name')
          .in('substance_a_name', names).in('substance_b_name', names),
        supabase.from('discovery_cards').select('title').limit(1000),
      ]);
      if (cache.error || cards.error) throw new SystematicPersistenceError();
      const cachedPairs = new Set<string>();
      for (const pair of cache.data ?? []) {
        cachedPairs.add(`${pair.substance_a_name}\u0000${pair.substance_b_name}`);
        cachedPairs.add(`${pair.substance_b_name}\u0000${pair.substance_a_name}`);
      }
      const titles = new Set((cards.data ?? []).map(card => String(card.title).toLocaleLowerCase('fr').trim()));
      let cached = 0;
      const unprocessed = candidates.filter(index => {
        const entityB = entities[index];
        const known = cachedPairs.has(`${entityA.name}\u0000${entityB.name}`)
          || titles.has(`interaction ${entityA.name} - ${entityB.name}`.toLocaleLowerCase('fr'))
          || titles.has(`interaction ${entityB.name} - ${entityA.name}`.toLocaleLowerCase('fr'));
        if (known) cached += 1;
        return !known;
      });
      const documented = await Promise.all(unprocessed.map(index => isInteractionDocumented(supabase, entityA.name, entities[index].name)));
      return { index: current.index, candidates, pending: unprocessed.filter((_, index) => !documented[index]),
        cached, documented: documented.filter(Boolean).length };
    };

    const savePairs = async (current: SystematicRunState, batch: SystematicBatch, analysis: SystematicAnalysis) => {
      const entities = current.entities!;
      const entityA = entities[current.index];
      const rows = analysis.pairs.map(pair => {
        const entityB = batch.pending.map(index => entities[index]).find(entity => entity.name === pair.entity_b_name)!;
        return {
          run_id: jobId,
          substance_a_id: entityA.source === 'local' && uuid.test(entityA.id) ? entityA.id : null,
          substance_a_name: entityA.name,
          substance_b_id: entityB.source === 'local' && uuid.test(entityB.id) ? entityB.id : null,
          substance_b_name: entityB.name,
          is_documented: pair.is_documented, discovery_type: pair.discovery_type,
          plausibility_score: pair.plausibility_score, severity: pair.severity,
          reasoning: pair.reasoning, mechanism: pair.mechanism, recommendation: pair.recommendation,
        };
      });
      // The existing unique constraint makes a lost finalizer acknowledgement
      // replayable without duplicated pair rows or additive progress counters.
      const { error } = await supabase.from('cde_pair_analyses').upsert(rows, {
        onConflict: 'run_id,substance_a_name,substance_b_name', ignoreDuplicates: true,
      });
      if (error) throw new SystematicPersistenceError();
      const globalPairs = rows.map(row => {
        const [a, b] = [row.substance_a_name, row.substance_b_name].sort();
        return { substance_a_name: a, substance_b_name: b, best_discovery_type: row.discovery_type,
          best_plausibility_score: row.plausibility_score, is_documented: row.is_documented };
      });
      // The live unique index is an expression, not a PostgREST conflict target.
      // Separate inserts let a pre-existing pair coexist with other new pairs.
      const saved = await Promise.all(globalPairs.map(pair => supabase.from('cde_analyzed_pairs').insert(pair)));
      if (saved.some(result => result.error && result.error.code !== '23505')) throw new SystematicPersistenceError();
    };

    await executeSystematicStep({ state, result: stored.result_payload as SystematicRunResult | null,
      providerResponseId: payload.providerResponseId, maxOutputTokens: payload._backgroundMaxTokens }, {
      async loadCatalog(current) {
        const { data, error } = await supabase.from('cde_nodes').select('id,name,node_type,properties').eq('node_type', 'substance').order('name');
        if (error) throw new SystematicPersistenceError();
        const catalog = await buildMedicationCatalog(data ?? [], Deno.env.get('DRUGBANK_API_KEY'));
        const filtered = current.targetPathology ? filterMedicationsByPathology(catalog, current.targetPathology)
          : { filtered: catalog, pathologyContext: null };
        return {
          entities: filtered.filtered.slice(0, MAX_SYSTEMATIC_ENTITIES).map(entity => ({
            id: entity.id, name: entity.name, source: entity.source, node_type: entity.node_type ?? 'substance',
            atc_code: entity.atc_code, properties: { atc_prefix: entity.properties?.atc_prefix, atc_code: entity.properties?.atc_code },
          })), pathologyContext: filtered.pathologyContext,
        };
      },
      prepareBatch,
      checkpoint: current => updateBackgroundJobRecord(supabase, jobId, { request_payload: { _systematic: current } }),
      start: startBackgroundAI,
      retrieve: responseId => retrieveBackgroundForWorker(supabase, jobId, responseId),
      rememberProvider: response => updateBackgroundJobRecord(supabase, jobId, {
        provider_name: 'openai', provider_response_id: response.id, provider_status: response.status,
        provider_started_at: new Date().toISOString(), model: response.model, reasoning_effort: response.reasoningEffort,
        progress_message: `Analyse de la fenêtre ${state.index + 1} en arrière-plan.`,
      }, response.maxOutputTokens),
      savePairs,
      advance: (current, result, resetStepWindow) => continueBackgroundJobRecord(supabase, jobId, {
        request_payload: { _systematic: current }, result_payload: result,
        progress_percentage: result.total_pairs ? Math.min(99, Math.floor(result.pairs_processed / result.total_pairs * 100)) : 0,
        progress_message: `${result.pairs_processed}/${result.total_pairs} paires prévues traitées.`,
      }, resetStepWindow),
      finish: (current, result) => updateBackgroundJobRecord(supabase, jobId, {
        request_payload: { _systematic: current }, result_payload: result, status: 'completed',
        progress_percentage: 100, progress_message: 'Toutes les fenêtres prévues sont enregistrées.',
        completed_at: new Date().toISOString(), error_message: null,
      }),
    });
    return json({ accepted: true, jobId }, 202);
  } catch (error) {
    if (payload?.runJob && payload.jobId) {
      try {
        if (payload.providerResponseId && error instanceof SystematicPersistenceError) {
          // The same complete response can be saved again; no new OpenAI POST.
          await updateBackgroundJobRecord(supabase, payload.jobId, {
            provider_status: 'in_progress', progress_message: 'Reprise de l’enregistrement de la réponse conservée.',
          });
        } else {
          await updateBackgroundJobRecord(supabase, payload.jobId, {
            status: 'failed', completed_at: new Date().toISOString(), progress_message: 'Analyse interrompue ; progression conservée.',
            error_message: error instanceof SystematicPersistenceError ? error.message
              : 'Cette fenêtre n’a pas produit un résultat complet et valide. Les résultats déjà enregistrés sont conservés.',
          });
        }
      } catch { console.error('[CDE systematic] La tâche conserve son bail pour réconciliation.'); }
    }
    console.error('[CDE systematic] Étape non finalisée ; aucun avancement automatique sur une réponse incomplète.');
    return json({ success: false, error: 'Cette étape n’a pas abouti. Consultez sa progression conservée dans Activité IA.' }, 500);
  }
});
