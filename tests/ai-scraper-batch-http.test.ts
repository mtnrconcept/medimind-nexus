import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScraperBatchHTTP } from '../supabase/functions/ai-tool-jobs/batch-http.ts';
import { type ScraperBatchRuntime, type ScraperBatchState, type ScraperBatchStore } from '../supabase/functions/ai-tool-jobs/batch.ts';
import { type JobStore, type TransportDependencies } from '../supabase/functions/ai-tool-jobs/handler.ts';
import { TRANSPORT_MODE, type ToolJob } from '../supabase/functions/ai-tool-jobs/protocol.ts';

const admin = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const service = 'synthetic-service-authorization';
class Memory implements JobStore, ScraperBatchStore {
  jobs = new Map<string, ToolJob>();
  async get(id: string, owner?: string) {
    const job = this.jobs.get(id);
    return job && (!owner || job.requested_by === owner) ? structuredClone(job) : null;
  }
  async byRequest(id: string, owner: string) {
    return structuredClone([...this.jobs.values()].find(job => job.public_token === id && job.requested_by === owner) || null);
  }
  async create(input: Record<string, unknown>) {
    if ([...this.jobs.values()].some(job => job.id === input.id || job.public_token === input.public_token)) throw new Error('duplicate');
    const job = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      progress_percentage: 0, progress_message: null, error_message: null, result_payload: null, expires_at: null, ...input } as ToolJob;
    this.jobs.set(job.id, structuredClone(job));
    return structuredClone(job);
  }
  async compareAndSwap(id: string, revision: string, patch: Record<string, unknown>) {
    const job = this.jobs.get(id);
    if (!job || (job.request_payload.batch as ScraperBatchState).revision !== revision) return null;
    Object.assign(job, structuredClone(patch));
    return structuredClone(job);
  }
  async settleChild(id: string, status: ToolJob['status'], updatedAt: string, patch: Record<string, unknown>) {
    const job = this.jobs.get(id);
    if (!job || job.status !== status || job.updated_at !== updatedAt) return null;
    Object.assign(job, structuredClone(patch));
    return structuredClone(job);
  }
  async list(owner: string) { return structuredClone([...this.jobs.values()].filter(job => job.requested_by === owner)); }
  async claim(id: string, owner: string) {
    const job = this.jobs.get(id);
    if (!job || job.requested_by !== owner || job.status !== 'queued' || job.analysis_mode !== TRANSPORT_MODE) return false;
    job.status = 'processing';
    return true;
  }
  async update(id: string, patch: Record<string, unknown>) {
    const job = this.jobs.get(id)!;
    if (job.status === 'queued' || job.status === 'processing') Object.assign(job, structuredClone(patch));
  }
  async append() { /* These scraper fixtures are JSON. */ }
  async events() { return []; }
}
function request(action: string, token = 'admin', body?: unknown, query = '') {
  return new Request('https://example.supabase.co/functions/v1/ai-tool-jobs?action=' + action + query, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'x-ai-request-id': requestId },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const manifest = { mode: 'medications', rateLimitMode: 'normal', urls: ['https://example.org/first', 'https://example.org/second'] };
function setup() {
  const store = new Memory();
  const work: Promise<void>[] = [];
  const relays: Array<{ id: string; delay: number }> = [];
  const upstream: Array<{ url: string; action: string; authorization: string | null }> = [];
  let clock = Date.now();
  const transport: TransportDependencies = {
    store, baseUrl: 'https://example.supabase.co', publishableKey: 'public', now: () => clock,
    authenticate: async token => token === 'admin' ? admin : token === 'other' ? other : null,
    upstream: async req => {
      const body = await req.json();
      upstream.push({ ...body, authorization: req.headers.get('authorization') });
      return new Response(JSON.stringify({ success: true, stats: { medicationsAdded: 1 } }), { headers: { 'Content-Type': 'application/json' } });
    },
    waitUntil: task => { work.push(task); },
  };
  const runtime: ScraperBatchRuntime = {
    store, now: () => clock, sleep: async ms => { clock += ms; }, isAdmin: async owner => owner === admin,
    relayMonitor: async (id, delay) => { relays.push({ id, delay }); },
    dispatchChild: async (id, index) => {
      // Untrusted extra fields must not alter the authorized saved operation.
      const result = await handler.handle(request('batch.child', service, { parentId: id, index,
        functionName: 'hypothesis-processor', url: 'https://example.net/wrong', action: 'delete' }));
      assert.equal(result.status, 202);
    },
  };
  const handler = createScraperBatchHTTP(runtime, transport, service);
  return { store, work, relays, upstream, handler, now: () => clock, advance: (ms: number) => { clock += ms; } };
}

test('batch start requires a real admin and deduplicates accepted manifests', async () => {
  const h = setup();
  assert.equal((await h.handler.handle(request('batch.start', 'invalid', manifest))).status, 401);
  assert.equal((await h.handler.handle(request('batch.start', 'other', manifest))).status, 403);
  const first = await (await h.handler.handle(request('batch.start', 'admin', manifest))).json();
  const second = await (await h.handler.handle(request('batch.start', 'admin', manifest))).json();
  assert.equal(first.job.id, second.job.id);
  assert.equal(h.store.jobs.size, 1);
  assert.equal('public_token' in first.job, false);
  assert.equal('request_payload' in first.job, false);
  const changed = await h.handler.handle(request('batch.start', 'admin', { ...manifest, urls: ['https://example.org/different'] }));
  assert.equal(changed.status, 409);
});

test('private batch workers reject user sessions, malformed tasks and unadmitted children', async () => {
  const h = setup();
  const { job } = await (await h.handler.handle(request('batch.start', 'admin', manifest))).json();
  for (const action of ['batch.monitor', 'batch.child']) {
    assert.equal((await h.handler.handle(request(action, 'admin', { jobId: job.id, parentId: job.id, index: 0 }))).status, 403);
  }
  assert.equal((await h.handler.handle(request('batch.monitor', service, null))).status, 400);
  assert.equal((await h.handler.handle(request('batch.child', service, { parentId: job.id, index: -1 }))).status, 400);
  assert.equal((await h.handler.handle(request('batch.child', service, { parentId: job.id, index: 0 }))).status, 202);
  assert.equal(h.upstream.length, 0);
});

test('a different owner cannot stop the batch and an accepted stop launches no pending URL', async () => {
  const h = setup();
  const { job } = await (await h.handler.handle(request('batch.start', 'admin', manifest))).json();
  assert.equal((await h.handler.handle(request('batch.stop', 'other', undefined, '&jobId=' + job.id))).status, 404);
  assert.equal((await h.handler.handle(request('batch.stop', 'admin', undefined, '&jobId=' + job.id))).status, 200);
  await h.handler.handle(request('batch.monitor', service, { jobId: job.id }));
  await Promise.all(h.work);
  assert.equal(h.upstream.length, 0);
  const parent = await h.store.get(job.id);
  assert.equal(parent?.status, 'failed');
  assert.equal((parent?.result_payload as { stopped: boolean }).stopped, true);
});

test('accepted scraper work finishes without browser requests and cannot override its saved delegation', async () => {
  const h = setup();
  const { job } = await (await h.handler.handle(request('batch.start', 'admin', manifest))).json();
  await h.handler.handle(request('batch.monitor', service, { jobId: job.id }));
  await Promise.all(h.work);
  assert.equal(h.upstream.length, 2);
  assert.deepEqual(h.upstream.map(call => call.url).sort(), manifest.urls);
  assert.ok(h.upstream.every(call => call.action === 'scrape-medication' && call.authorization === 'Bearer ' + service));
  assert.equal((await h.store.get(job.id))?.status, 'completed');
  assert.equal(JSON.stringify([...h.store.jobs.values()]).includes(service), false);
  await h.handler.handle(request('batch.child', service, { parentId: job.id, index: 0 }));
  await Promise.all(h.work);
  assert.equal(h.upstream.length, 2);
});

test('a 90-second lease cooldown is handed off by a fresh invocation after at most 45 seconds', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const h = setup();
  const response = await h.handler.handle(request('batch.monitor', service, { jobId: requestId, notBefore: h.now() + 90_000 }));
  assert.equal(response.status, 202);
  assert.equal(h.relays.length, 0);
  h.advance(45_000);
  context.mock.timers.tick(45_000);
  await Promise.all(h.work);
  assert.deepEqual(h.relays, [{ id: requestId, delay: 45_000 }]);
  assert.equal(h.upstream.length, 0);
});
