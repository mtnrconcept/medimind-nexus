import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { createToolTransport, type JobStore, type TransportDependencies } from './handler.ts';
import { TRANSPORT_MODE, type ToolEvent, type ToolJob } from './protocol.ts';
import { NATIVE_AI_JOB_TOOLS } from '../_shared/ai-tool-registry.ts';
import { createScraperBatchAPI } from './batch-adapter.ts';
import { SCRAPER_BATCH_MODE } from './batch.ts';

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => {
    const deadline = AbortSignal.timeout(8_000);
    const original = init?.signal || (input instanceof Request ? input.signal : undefined);
    return fetch(input, { ...init, signal: original ? AbortSignal.any([original, deadline]) : deadline });
  } },
});
const rows = () => db.from('ai_analysis_jobs');
const current = () => `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;

const store: JobStore = {
  async create(job) {
    const { data, error } = await rows().insert(job).select('*').single();
    if (error) throw error;
    return data as ToolJob;
  },
  async byRequest(requestId, owner) {
    const { data, error } = await rows().select('*').eq('public_token', requestId)
      .eq('requested_by', owner).in('analysis_mode', [TRANSPORT_MODE, SCRAPER_BATCH_MODE]).or(current()).maybeSingle();
    if (error) throw error;
    return data as ToolJob | null;
  },
  async get(id, owner) {
    const { data, error } = await rows().select('*').eq('id', id).eq('requested_by', owner).or(current()).maybeSingle();
    if (error) throw error;
    return data as ToolJob | null;
  },
  async list(owner, functionName, scopeKey, includeResult = false) {
    // The activity button must not download up to 20 complete clinical results
    // on every poll. The private payload is needed only by explicit status/latest.
    const columns = includeResult ? '*' : 'id,function_name,analysis_mode,status,progress_percentage,progress_message,error_message,created_at,updated_at,expires_at,scopeKey:request_payload->>scopeKey';
    const query = () => {
      let selection = rows().select(columns).eq('requested_by', owner).or(current())
        .is('request_payload->batchParentId', null);
      if (functionName) selection = selection.eq('function_name', functionName);
      if (scopeKey) selection = selection.eq('request_payload->>scopeKey', scopeKey);
      return selection.order('created_at', { ascending: false });
    };
    if (includeResult) {
      const { data, error } = await query().limit(1);
      if (error) throw error;
      return (data || []) as unknown as ToolJob[];
    }
    // Recent short translations must not hide an older generation still running.
    const responses = await Promise.all([
      query().in('status', ['queued', 'processing']).limit(100),
      query().in('status', ['completed', 'failed']).limit(20),
    ]);
    const records: ToolJob[] = [];
    for (const { data, error } of responses) {
      if (error) throw error;
      for (const row of data || []) {
        const metadata = row as unknown as Record<string, unknown>;
        records.push({ ...metadata, request_payload: { scopeKey: metadata.scopeKey || '' } } as ToolJob);
      }
    }
    return records;
  },
  async claim(id, owner) {
    const timestamp = new Date().toISOString();
    const { data, error } = await rows().update({ status: 'processing', started_at: timestamp, updated_at: timestamp })
      .eq('id', id).eq('requested_by', owner).eq('analysis_mode', TRANSPORT_MODE).eq('status', 'queued').select('id').maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },
  async update(id, patch, signal) {
    let query = rows().update(patch).eq('id', id).eq('analysis_mode', TRANSPORT_MODE).in('status', ['queued', 'processing']);
    if (signal) query = query.abortSignal(signal);
    const { error } = await query;
    if (error) throw error;
  },
  async append(id, events, signal) {
    let query = db.from('ai_tool_job_events').insert(events.map(event => ({ job_id: id, ...event })));
    if (signal) query = query.abortSignal(signal);
    const { error } = await query;
    if (error) throw error;
  },
  async events(id, after, limit) {
    const { data, error } = await db.from('ai_tool_job_events').select('seq,data')
      .eq('job_id', id).gt('seq', after).order('seq').limit(limit);
    if (error) throw error;
    return (data || []) as ToolEvent[];
  },
};

const transport: TransportDependencies = {
  store, baseUrl: url, publishableKey,
  async authenticate(token) {
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error) {
      if (!error.status || error.status === 429 || error.status >= 500 || error.name === 'AuthRetryableFetchError') throw error;
      return null;
    }
    return user?.id || null;
  },
  upstream: request => fetch(request),
  async wakeNative(job, token) {
    if (job.analysis_mode === SCRAPER_BATCH_MODE) {
      const state = job.request_payload.batch as { leaseUntil?: number; nextBatchAt?: number } | undefined;
      if ((state?.leaseUntil ?? 0) <= Date.now() && (state?.nextBatchAt ?? 0) <= Date.now()) await batch.wake(job.id);
      return;
    }
    if (!NATIVE_AI_JOB_TOOLS.has(job.function_name) && !['hypothesis-processor', 'cde-systematic-analyze'].includes(job.function_name)) return;
    const body = job.analysis_mode === 'progressive_matrix'
      ? { action: 'matrix.latest', jobId: job.id, patientId: job.request_payload.scope || 'general' }
      : { action: 'status', jobId: job.id, jobToken: job.public_token };
    const response = await fetch(`${url}/functions/v1/${job.function_name}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
  },
  waitUntil(work) { EdgeRuntime.waitUntil(work); },
  log: message => console.error(message),
};

const batch = createScraperBatchAPI(db, transport, serviceKey);
const handler = createToolTransport(transport);

Deno.serve(request => batch.handles(request) ? batch.handle(request) : handler(request));
