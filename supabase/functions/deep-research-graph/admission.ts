import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BACKGROUND_JOB_TTL_MS, prepareBackgroundJobPayload } from '../_shared/background-job-monitor.ts';
import { parseResearchInput, type ResearchInput } from './handler.ts';
import { GRAPH_RESEARCH_MODE, safeGraphJobPayload } from './jobs.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projection = 'id,public_token,function_name,analysis_mode,requested_by,status,progress_percentage,progress_message,created_at,expires_at,request_payload';
const ADMISSION_KEY = '_graphAdmission';

export class GraphAdmissionError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 410 | 503) {
    super(message);
    this.name = 'GraphAdmissionError';
  }
}

export interface GraphAdmissionJob {
  id: string; public_token: string; function_name: string; analysis_mode: string; requested_by: string;
  status: string; progress_percentage: number; progress_message: string | null;
  created_at: string; expires_at: string; request_payload: Record<string, unknown>;
}
export interface GraphAdmissionInsert {
  public_token: string; function_name: string; analysis_mode: string; requested_by: string;
  status: 'queued'; progress_percentage: number; progress_message: string;
  request_payload: Record<string, unknown>; expires_at: string;
}
export interface GraphAdmissionStore {
  findOwned(requestId: string, owner: string, functionName: string): Promise<GraphAdmissionJob | null>;
  insert(row: GraphAdmissionInsert): Promise<GraphAdmissionJob>;
}

/** The unique public_token constraint arbitrates races; reads never disclose another user's job. */
export function createGraphAdmissionStore(client: SupabaseClient): GraphAdmissionStore {
  return {
    async findOwned(requestId, owner, functionName) {
      const { data, error } = await client.from('ai_analysis_jobs').select(projection)
        .eq('public_token', requestId).eq('requested_by', owner).eq('function_name', functionName).maybeSingle();
      if (error) throw error;
      return data as GraphAdmissionJob | null;
    },
    async insert(row) {
      const { data, error } = await client.from('ai_analysis_jobs').insert(row).select(projection).single();
      if (error) throw error;
      if (!data) throw new Error('Admission acknowledgement missing');
      return data as GraphAdmissionJob;
    },
  };
}

function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(canonical); // Centre/node order is meaningful: preserve it.
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Ignore client control fields and normalize object ordering without changing graph semantics. */
export async function graphPayloadFingerprint(input: ResearchInput): Promise<{ fingerprint: string; payload: ReturnType<typeof safeGraphJobPayload> }> {
  const parsed = parseResearchInput(canonical(safeGraphJobPayload(input)));
  if (!parsed) throw new GraphAdmissionError('Paramètres de recherche invalides.', 400);
  const payload = safeGraphJobPayload(parsed);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(payload))));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return { fingerprint, payload };
}

function conflict(): GraphAdmissionError {
  return new GraphAdmissionError('Cette référence appartient à une autre recherche. Relancez explicitement avec une nouvelle référence.', 409);
}

export async function admitGraphResearch(options: {
  input: ResearchInput; requestId: unknown; userId: string; functionName?: string;
  store: GraphAdmissionStore; now?: () => number; lookupOnly?: boolean;
}): Promise<{ job: GraphAdmissionJob; created: boolean }> {
  if (typeof options.requestId !== 'string' || !UUID.test(options.requestId) || !options.userId) {
    throw new GraphAdmissionError('Une référence UUID et une session utilisateur sont requises.', 400);
  }
  const requestId = options.requestId.toLowerCase(), owner = options.userId;
  const functionName = options.functionName ?? 'deep-research-graph';
  const now = (options.now ?? Date.now)();
  const { payload, fingerprint } = await graphPayloadFingerprint(options.input);
  const validate = async (job: GraphAdmissionJob): Promise<GraphAdmissionJob> => {
    if (job.public_token.toLowerCase() !== requestId || job.requested_by !== owner || job.function_name !== functionName
      || job.analysis_mode !== GRAPH_RESEARCH_MODE) throw conflict();
    const admission = job.request_payload[ADMISSION_KEY] as { version?: unknown; fingerprint?: unknown } | undefined;
    const saved = parseResearchInput(job.request_payload);
    if (!saved || admission?.version !== 1 || admission.fingerprint !== fingerprint) throw conflict();
    if ((await graphPayloadFingerprint(saved)).fingerprint !== fingerprint) throw conflict();
    // A 410 confirms this exact research's expiry, never a different payload's existence.
    const expiry = Date.parse(job.expires_at);
    if (!Number.isFinite(expiry)) throw new GraphAdmissionError('La durée de conservation de cette recherche ne peut pas être vérifiée.', 503);
    if (expiry <= now) throw new GraphAdmissionError('Cette référence de recherche a expiré. Une nouvelle recherche doit être lancée explicitement.', 410);
    return job;
  };
  let previous: GraphAdmissionJob | null;
  try { previous = await options.store.findOwned(requestId, owner, functionName); }
  catch { throw new GraphAdmissionError('Le suivi de cette recherche est momentanément indisponible.', 503); }
  if (previous) return { job: await validate(previous), created: false };
  if (options.lookupOnly) throw new GraphAdmissionError('Cette référence de recherche est inaccessible.', 404);

  try {
    const job = await options.store.insert({ public_token: requestId, function_name: functionName,
      analysis_mode: GRAPH_RESEARCH_MODE, requested_by: owner, status: 'queued', progress_percentage: 0,
      progress_message: 'Recherche du graphe en file d’attente.',
      request_payload: prepareBackgroundJobPayload({ ...payload, [ADMISSION_KEY]: { version: 1, fingerprint } }, now),
      expires_at: new Date(now + BACKGROUND_JOB_TTL_MS).toISOString() });
    return { job: await validate(job), created: true };
  } catch (error) {
    if (error instanceof GraphAdmissionError) throw error;
    // A duplicate-key error and a lost INSERT acknowledgement both require a
    // read, never another insertion or another paid generation.
    let recovered: GraphAdmissionJob | null;
    try { recovered = await options.store.findOwned(requestId, owner, functionName); }
    catch { throw new GraphAdmissionError('L’enregistrement doit être confirmé avec la même référence de recherche.', 503); }
    if (recovered) return { job: await validate(recovered), created: false };
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw conflict();
    throw new GraphAdmissionError('L’enregistrement n’a pas pu être confirmé. Réessayez avec la même référence de recherche.', 503);
  }
}
