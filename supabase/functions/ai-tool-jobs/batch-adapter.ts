import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.86.2';
import { SCRAPER_BATCH_MODE, type ScraperBatchRuntime, type ScraperBatchStore } from './batch.ts';
import { createScraperBatchHTTP } from './batch-http.ts';
import type { TransportDependencies } from './handler.ts';
import { TRANSPORT_MODE, type ToolJob } from './protocol.ts';

export function createScraperBatchAPI(db: SupabaseClient, transport: TransportDependencies, serviceRoleKey: string) {
  const rows = () => db.from('ai_analysis_jobs');
  const store: ScraperBatchStore = {
    async get(id) {
      const { data, error } = await rows().select('*').eq('id', id).in('analysis_mode', [SCRAPER_BATCH_MODE, TRANSPORT_MODE]).maybeSingle();
      if (error) throw error;
      return data as ToolJob | null;
    },
    async byRequest(requestId, owner) {
      const { data, error } = await rows().select('*').eq('public_token', requestId).eq('requested_by', owner)
        .eq('analysis_mode', SCRAPER_BATCH_MODE).maybeSingle();
      if (error) throw error;
      return data as ToolJob | null;
    },
    async create(row) {
      const { data, error } = await rows().insert(row).select('*').single();
      if (error) throw error;
      return data as ToolJob;
    },
    async compareAndSwap(id, expectedRevision, patch) {
      const { data, error } = await rows().update(patch).eq('id', id).eq('analysis_mode', SCRAPER_BATCH_MODE)
        .eq('request_payload->batch->>revision', expectedRevision).select('*').maybeSingle();
      if (error) throw error;
      return data as ToolJob | null;
    },
    async settleChild(id, expectedStatus, expectedUpdatedAt, patch) {
      const { data, error } = await rows().update(patch).eq('id', id).eq('analysis_mode', TRANSPORT_MODE)
        .eq('function_name', 'medical-scraper').eq('status', expectedStatus).eq('updated_at', expectedUpdatedAt)
        .not('request_payload->>batchParentId', 'is', null).select('*').maybeSingle();
      if (error) throw error;
      return data as ToolJob | null;
    },
  };
  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  async function post(action: 'batch.monitor' | 'batch.child', body: Record<string, unknown>) {
    const response = await fetch(transport.baseUrl + '/functions/v1/ai-tool-jobs?action=' + action, {
      method: 'POST', headers: { Authorization: 'Bearer ' + serviceRoleKey, apikey: serviceRoleKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(6_000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Scraper batch relay unavailable');
  }
  const runtime: ScraperBatchRuntime = {
    store,
    async isAdmin(owner) {
      const { data, error } = await db.from('user_roles').select('role').eq('user_id', owner).eq('role', 'admin').limit(1).maybeSingle();
      if (error) throw error;
      return data?.role === 'admin';
    },
    async dispatchChild(parentId, index) {
      // A retried dispatch is safe: prepareChild derives the same UUID and the
      // transport's queued -> processing CAS accepts one executor only.
      await post('batch.child', { parentId, index });
    },
    async relayMonitor(parentId, delayMs) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await post('batch.monitor', { jobId: parentId, notBefore: Date.now() + Math.max(0, Math.min(delayMs, 90_000)) });
          return;
        }
        catch (error) {
          if (attempt === 1) throw error;
          await wait(500);
        }
      }
    },
  };
  return createScraperBatchHTTP(runtime, transport, serviceRoleKey);
}
