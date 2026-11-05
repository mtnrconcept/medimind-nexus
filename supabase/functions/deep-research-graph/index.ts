import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, startBackgroundAI } from "../_shared/ai-client.ts";
import { readBoundedJson } from "../_shared/bounded-json.ts";
import {
    prepareBackgroundJobRequest,
    continueBackgroundJobRecord, retrieveBackgroundForWorker, startBackgroundJobMonitor, updateBackgroundJobRecord,
    type NativeJobPayload,
} from "../_shared/background-job-monitor.ts";
import { handleResearchRequest, parseResearchInput, type PreparedResearch, type ResearchServices } from "./handler.ts";
import { GRAPH_RESEARCH_MODE, GraphResearchPersistenceError, runGraphResearchJob } from "./jobs.ts";
import { admitGraphResearch, createGraphAdmissionStore, GraphAdmissionError } from './admission.ts';

const FUNCTION_NAME = 'deep-research-graph';
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function researchServices(client: ReturnType<typeof createClient>): ResearchServices {
    return {
        callAI,
        async isAuthenticated(token) {
            const { data, error } = await client.auth.getUser(token);
            if (error && (!error.status || error.status >= 500)) throw new Error("Authentication unavailable");
            return !error && Boolean(data.user?.id);
        },
        async readInteractions(medicationIds, signal) {
            const { data, error } = await client.from("drug_interactions")
                .select("id,medication_id,interacting_drug,severity,description").in("medication_id", medicationIds)
                .limit(30).abortSignal(signal);
            if (error || !data) throw new Error("Local interactions unavailable");
            return data;
        },
        async readTable(table, pattern, signal) {
            const { data, error } = await client.from(table.table).select("id,name,description")
                .or("name.ilike." + pattern + "," + table.field + ".ilike." + pattern)
                .limit(table.limit).abortSignal(signal);
            if (error || !data) throw new Error("Local lookup unavailable");
            return data;
        },
    };
}

type GraphPayload = NativeJobPayload & Record<string, unknown>;

Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
    let incoming: GraphPayload;
    try {
        const value = await readBoundedJson(req.clone(), 96_000);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid input');
        incoming = value as GraphPayload;
    } catch { return json({ error: 'Invalid or oversized request' }, 400); }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const native = incoming.async === true || incoming.runJob || ['monitor', 'status', 'admission.status'].includes(incoming.action ?? '');
    if (!native) {
        // Older clients keep their documented JSON/SSE contract during rollout.
        const client = createClient(supabaseUrl, publishableKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: {
                headers: { Authorization: req.headers.get('Authorization') ?? '' },
                fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(6000) }),
            },
        });
        return handleResearchRequest(req, researchServices(client));
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Research service unavailable' }, 503);
    const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) }) },
    });
    const monitorOptions = { supabase: client, supabaseUrl, serviceRoleKey,
        functionName: FUNCTION_NAME, corsHeaders, allowLegacyToken: false };
    let activeJobId: string | undefined;
    try {
        // The common monitor authenticates users, verifies ownership/expiry, and
        // reconstructs internal worker payloads under a one-time server lease.
        const control = await prepareBackgroundJobRequest(req, incoming, monitorOptions);
        if (control.response) return control.response;
        const payload = control.payload;
        const input = parseResearchInput(payload);
        if (!input) return json({ error: 'Invalid research parameters' }, 400);
        if (!payload.runJob) {
            if (!control.actor.userId) return json({ error: 'User session required' }, 401);
            const lookupOnly = payload.action === 'admission.status';
            const { job } = await admitGraphResearch({ input, requestId: payload.requestId,
                userId: control.actor.userId, functionName: FUNCTION_NAME,
                store: createGraphAdmissionStore(client), lookupOnly });
            if (!lookupOnly && ['queued', 'processing'].includes(job.status)) startBackgroundJobMonitor(monitorOptions, job.id);
            return json({ job: { id: job.id, token: job.public_token, status: job.status,
                progress: job.progress_percentage, message: job.progress_message, createdAt: job.created_at },
                context: { async: true, functionName: FUNCTION_NAME, analysisMode: GRAPH_RESEARCH_MODE } }, lookupOnly ? 200 : 202);
        }
        activeJobId = payload.jobId;
        if (!activeJobId || !control.actor.service) return json({ error: 'Worker authorization required' }, 403);
        const jobId = activeJobId;
        await runGraphResearchJob({ input,
            snapshot: payload._researchSnapshot as PreparedResearch | undefined,
            providerResponseId: payload.providerResponseId, backgroundMaxTokens: payload._backgroundMaxTokens,
        }, {
            services: researchServices(client), start: startBackgroundAI,
            retrieve: (id, options) => retrieveBackgroundForWorker(client, jobId, id, options),
            update: (patch, budget) => updateBackgroundJobRecord(client, jobId, patch, budget),
            advance: patch => continueBackgroundJobRecord(client, jobId, patch),
        });
        return json({ accepted: true, jobId }, 202);
    } catch (error) {
        if (error instanceof GraphAdmissionError) return json({ error: error.message }, error.status);
        if (error instanceof GraphResearchPersistenceError && activeJobId) {
            await updateBackgroundJobRecord(client, activeJobId, {
                provider_status: 'in_progress',
                progress_message: 'Réponse Astra conservée ; nouvelle tentative d’enregistrement en cours.',
            }).catch(() => console.error('[GraphResearch] Publication retry awaits database recovery.'));
            return json({ accepted: true, jobId: activeJobId }, 202);
        }
        // Do not log queries, source text, patient context, or provider payloads.
        await updateBackgroundJobRecord(client, activeJobId, {
            status: 'failed', progress_message: 'Recherche du graphe interrompue.',
            error_message: 'La synthèse du graphe n’a pas pu être validée. Les sources et la réponse enregistrées sont conservées.',
            completed_at: new Date().toISOString(),
        }).catch(() => console.error('[GraphResearch] Could not persist terminal status.'));
        return json({ error: 'La recherche du graphe est indisponible. Consultez le suivi de la tâche.' }, 500);
    }
});
