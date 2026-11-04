import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeScraperBatchManifest, prepareScraperBatchChild, runScraperBatch, scraperBatchChildId,
  SCRAPER_BATCH_DELAYS, SCRAPER_BATCH_LEASE_MS, SCRAPER_BATCH_MODE, SCRAPER_BATCH_TTL_MS,
  SCRAPER_CHILD_STALE_MS, startScraperBatch, stopScraperBatch,
  type ScraperBatchResult, type ScraperBatchRuntime, type ScraperBatchState,
} from '../supabase/functions/ai-tool-jobs/batch.ts';
import { TRANSPORT_MODE, type ToolJob } from '../supabase/functions/ai-tool-jobs/protocol.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const outsider = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const manifest = (count = 7, rateLimitMode: 'slow' | 'normal' | 'fast' = 'normal') => ({
  mode: 'medications' as const, urls: Array.from({ length: count }, (_, index) => `https://medical.example.com/page/${index}`), rateLimitMode,
});

function fixture() {
  const rows = new Map<string, ToolJob>();
  let time = Date.UTC(2026, 10, 4);
  let admin = true;
  const scheduled = new Map<string, number>();
  const relays: Array<{ id: string; at: number; delay: number }> = [];
  const calls: Array<{ index: number; at: number; body: Record<string, unknown> }> = [];
  let peak = 0;
  const hooks: {
    beforeCAS?: (id: string, patch: Record<string, unknown>) => Promise<void>;
    afterCAS?: (id: string, patch: Record<string, unknown>) => Promise<void>;
    afterAdmission?: (id: string, index: number) => Promise<void>;
    afterClaim?: (id: string, index: number) => Promise<void>;
    duration: number;
    loseChild?: number;
  } = { duration: 5_000 };
  const copy = <T>(value: T): T => structuredClone(value);
  const state = (row: ToolJob) => row.request_payload.batch as ScraperBatchState;
  const advance = (milliseconds: number) => {
    time += milliseconds;
    for (const [id, until] of scheduled) if (until <= time) {
      const child = rows.get(id)!;
      if (child.status === 'processing') rows.set(id, { ...child, status: 'completed', updated_at: new Date(time).toISOString(),
        result_payload: { httpStatus: 200, contentType: 'application/json', body: JSON.stringify({ success: true, stats: { medicationsAdded: 1 } }) } });
      scheduled.delete(id);
    }
  };
  const runtime: ScraperBatchRuntime = {
    now: () => time,
    sleep: async ms => advance(ms),
    isAdmin: async () => admin,
    store: {
      get: async id => copy(rows.get(id) ?? null),
      byRequest: async (token, user) => copy([...rows.values()].find(row => row.public_token === token && row.requested_by === user) ?? null),
      create: async raw => {
        if (rows.has(String(raw.id)) || [...rows.values()].some(row => row.public_token === raw.public_token)) throw new Error('Unique violation');
        const row = { created_at: new Date(time).toISOString(), updated_at: new Date(time).toISOString(),
          error_message: null, result_payload: null, ...copy(raw) } as ToolJob;
        rows.set(row.id, row);
        return copy(row);
      },
      compareAndSwap: async (id, revision, patch) => {
        await hooks.beforeCAS?.(id, patch);
        const previous = rows.get(id);
        if (!previous || previous.analysis_mode !== SCRAPER_BATCH_MODE || state(previous).revision !== revision) return null;
        const next = { ...previous, ...copy(patch) } as ToolJob;
        rows.set(id, next);
        await hooks.afterCAS?.(id, patch);
        return copy(next);
      },
      settleChild: async (id, status, timestamp, patch) => {
        const previous = rows.get(id);
        if (!previous || previous.analysis_mode !== TRANSPORT_MODE || previous.status !== status || previous.updated_at !== timestamp) return null;
        const next = { ...previous, ...copy(patch) } as ToolJob;
        rows.set(id, next);
        return copy(next);
      },
    },
    relayMonitor: async (id, delay) => { relays.push({ id, at: time + delay, delay }); },
    dispatchChild: async (parentId, index) => {
      const prepared = await prepareScraperBatchChild(runtime, parentId, index);
      if (!prepared) return;
      await hooks.afterAdmission?.(parentId, index);
      // Emulate the transport's one-way queued -> processing CAS, including a lost acknowledgement.
      const current = rows.get(prepared.job.id)!;
      if (current.status !== 'queued') return;
      rows.set(current.id, { ...current, status: 'processing', updated_at: new Date(time).toISOString() });
      const body = JSON.parse(new TextDecoder().decode(prepared.body));
      calls.push({ index, at: time, body });
      peak = Math.max(peak, [...rows.values()].filter(row => row.analysis_mode === TRANSPORT_MODE && row.status === 'processing').length);
      if (hooks.loseChild !== index) scheduled.set(current.id, time + hooks.duration);
      await hooks.afterClaim?.(parentId, index);
      if (hooks.loseChild === index) throw new TypeError('Lost internal dispatch acknowledgement');
    },
  };
  const drain = async (id: string, limit = 300) => {
    await runScraperBatch(runtime, id);
    for (let iteration = 0; relays.length && iteration < limit; iteration++) {
      relays.sort((a, b) => a.at - b.at);
      const next = relays.shift()!;
      advance(Math.max(0, next.at - time));
      await runScraperBatch(runtime, next.id);
    }
    assert.equal(relays.length, 0, 'The finite workflow stopped scheduling itself');
    return rows.get(id)!;
  };
  return { runtime, rows, calls, relays, hooks, drain, advance,
    setAdmin: (value: boolean) => { admin = value; },
    peak: () => peak, time: () => time,
  };
}

const resultOf = (job: ToolJob) => job.result_payload as unknown as ScraperBatchResult;

test('batch creation validates admin, scope, URL bounds and the exact existing modes/delays', async () => {
  const f = fixture();
  f.setAdmin(false);
  await assert.rejects(startScraperBatch(f.runtime, manifest(), owner, requestId), { status: 403 });
  assert.equal(f.rows.size, 0);
  assert.deepEqual(SCRAPER_BATCH_DELAYS, { slow: 45_000, normal: 25_000, fast: 12_000 });
  for (const input of [manifest(0), manifest(501), { ...manifest(), mode: 'arbitrary-tool' },
    { ...manifest(), urls: ['file:///private'] }, { ...manifest(), urls: ['http://127.0.0.1/'] },
    { ...manifest(), urls: ['http://user:secret@example.com/'] }]) {
    assert.throws(() => normalizeScraperBatchManifest(input), { status: 400 });
  }
  f.setAdmin(true);
  const job = await startScraperBatch(f.runtime, { ...manifest(1), token: 'MUST-NOT-PERSIST', action: 'arbitrary-tool' }, owner, requestId);
  assert.equal(Date.parse(job.expires_at!) - f.time(), SCRAPER_BATCH_TTL_MS);
  assert.ok(!JSON.stringify(job).includes('MUST-NOT-PERSIST'));
  assert.ok(!JSON.stringify(job).includes('arbitrary-tool'));
  await assert.rejects(stopScraperBatch(f.runtime, job.id, outsider), { status: 404 });
});

test('lost/concurrent start acknowledgements reuse one immutable parent manifest', async () => {
  const f = fixture();
  const [first, repeated] = await Promise.all([
    startScraperBatch(f.runtime, manifest(2), owner, requestId, 'admin-panel'),
    startScraperBatch(f.runtime, manifest(2), owner, requestId, 'admin-panel'),
  ]);
  assert.equal(first.id, repeated.id);
  assert.equal(f.rows.size, 1);
  await assert.rejects(startScraperBatch(f.runtime, manifest(3), owner, requestId, 'admin-panel'), { status: 409 });
});

test('server relays finish every chosen URL without a browser, at concurrency three with persisted cooldowns', async () => {
  const f = fixture();
  const job = await startScraperBatch(f.runtime, manifest(7), owner, requestId);
  const completed = await f.drain(job.id);
  assert.equal(completed.status, 'completed');
  assert.equal(f.peak(), 3);
  assert.deepEqual(f.calls.map(call => call.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(f.calls[3].at - f.calls[0].at >= f.hooks.duration + SCRAPER_BATCH_DELAYS.normal);
  assert.ok(f.calls[6].at - f.calls[3].at >= f.hooks.duration + SCRAPER_BATCH_DELAYS.normal);
  const result = resultOf(completed);
  assert.deepEqual([result.completed, result.failed, result.skipped, result.stats.medicationsAdded], [7, 0, 0, 7]);
  assert.equal(result.success, true);
  assert.equal(result.finished, true);
});

test('each mode derives only its allowed scraper action and deterministic child identities', async () => {
  for (const [mode, action] of [['medications', 'scrape-medication'], ['molecules', 'scrape-molecule'], ['pathologies', 'scrape']]) {
    const f = fixture();
    const job = await startScraperBatch(f.runtime, { ...manifest(1), mode }, owner, requestId);
    await f.drain(job.id);
    assert.deepEqual(f.calls[0].body, { action, url: manifest(1).urls[0] });
    const childId = await scraperBatchChildId(job.id, 0);
    assert.equal(f.rows.get(childId)!.request_payload.batchParentId, job.id);
    assert.equal(f.rows.get(childId)!.requested_by, owner);
    assert.equal(await prepareScraperBatchChild(f.runtime, job.id, 0), null);
  }
});

test('a stop before reservation skips the entire manifest without creating or starting children', async () => {
  const f = fixture();
  const job = await startScraperBatch(f.runtime, manifest(7), owner, requestId);
  const receipt = await stopScraperBatch(f.runtime, job.id, owner);
  assert.equal(resultOf(receipt).skipped, 7, 'The stop acknowledgement already counts URLs that will not start');
  const stopped = await f.drain(job.id);
  assert.equal(stopped.status, 'failed');
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows.size, 1);
  const result = resultOf(stopped);
  assert.deepEqual([result.completed, result.failed, result.skipped], [0, 0, 7]);
  assert.equal(result.stopped, true);
  assert.equal(result.success, false);
});

test('stop winning the admission CAS prevents all paid launches, including a delayed child request', async () => {
  const f = fixture();
  const job = await startScraperBatch(f.runtime, manifest(4), owner, requestId);
  f.hooks.beforeCAS = async (id, patch) => {
    const next = (patch.request_payload as { batch?: ScraperBatchState } | undefined)?.batch;
    if (next?.admitted.length && !next.stopRequested) {
      f.hooks.beforeCAS = undefined;
      await stopScraperBatch(f.runtime, id, owner);
    }
  };
  const stopped = await f.drain(job.id);
  assert.equal(f.calls.length, 0);
  assert.equal(resultOf(stopped).skipped, 4);
  assert.equal([...f.rows.values()].filter(row => row.status === 'queued').length, 0);
});

test('admission winning before stop lets only the already accepted URL finish, even if claim happens later', async () => {
  const f = fixture();
  const job = await startScraperBatch(f.runtime, manifest(5), owner, requestId);
  f.hooks.afterAdmission = async id => {
    f.hooks.afterAdmission = undefined;
    await stopScraperBatch(f.runtime, id, owner);
  };
  const stopped = await f.drain(job.id);
  assert.deepEqual(f.calls.map(call => call.index), [0]);
  assert.deepEqual([resultOf(stopped).completed, resultOf(stopped).failed, resultOf(stopped).skipped], [1, 0, 4]);
  assert.equal(resultOf(stopped).success, false);
});

test('a stop immediately after reservation leaves no orphaned queued children', async () => {
  const f = fixture();
  const job = await startScraperBatch(f.runtime, manifest(5), owner, requestId);
  f.hooks.afterCAS = async (id, patch) => {
    const next = (patch.request_payload as { batch?: ScraperBatchState } | undefined)?.batch;
    if (next?.active.length && !next.admitted.length && !next.stopRequested) {
      f.hooks.afterCAS = undefined;
      await stopScraperBatch(f.runtime, id, owner);
    }
  };
  const stopped = await f.drain(job.id);
  assert.equal(resultOf(stopped).skipped, 5);
  assert.equal(f.calls.length, 0);
  assert.equal([...f.rows.values()].filter(row => row.status === 'queued').length, 0);
});

test('a lost child acknowledgement never repeats its provider operation and is failed only after eight stale minutes', async () => {
  const f = fixture();
  f.hooks.loseChild = 1;
  const job = await startScraperBatch(f.runtime, manifest(4, 'fast'), owner, requestId);
  const startedAt = f.time();
  const completed = await f.drain(job.id);
  assert.equal(completed.status, 'failed');
  assert.deepEqual(f.calls.map(call => call.index), [0, 1, 2, 3]);
  const lost = f.rows.get(await scraperBatchChildId(job.id, 1))!;
  assert.ok(Date.parse(lost.updated_at) - startedAt >= SCRAPER_CHILD_STALE_MS);
  assert.deepEqual([resultOf(completed).completed, resultOf(completed).failed, resultOf(completed).skipped], [3, 1, 0]);
  assert.equal(resultOf(completed).success, false);
});

test('failed lease release relays no earlier than its lease expiry, allowing a replacement monitor to continue', async () => {
  const f = fixture();
  f.hooks.duration = 60_000;
  const job = await startScraperBatch(f.runtime, manifest(3), owner, requestId);
  const startedAt = f.time();
  f.hooks.beforeCAS = async (_id, patch) => {
    const next = (patch.request_payload as { batch?: ScraperBatchState } | undefined)?.batch;
    const result = patch.result_payload as ScraperBatchResult | undefined;
    if (next?.leaseId === null && result && !result.finished) {
      f.hooks.beforeCAS = undefined;
      throw new Error('Temporary database outage during lease release');
    }
  };
  await runScraperBatch(f.runtime, job.id);
  assert.equal(f.relays.length, 1);
  assert.ok(f.relays[0].at >= startedAt + SCRAPER_BATCH_LEASE_MS);
  const relay = f.relays.shift()!;
  f.advance(relay.at - f.time());
  const completed = await f.drain(job.id);
  assert.equal(completed.status, 'completed');
  assert.equal(f.calls.length, 3);
});

test('a revoked admin or an expired workflow cannot start any previously unaccepted URL', async () => {
  for (const reason of ['admin', 'expiry']) {
    const f = fixture();
    const job = await startScraperBatch(f.runtime, manifest(2), owner, requestId);
    if (reason === 'admin') f.setAdmin(false);
    else f.advance(SCRAPER_BATCH_TTL_MS + 1);
    const stopped = await f.drain(job.id);
    assert.equal(stopped.status, 'failed');
    assert.equal(f.calls.length, 0);
    assert.equal(resultOf(stopped).skipped, 2);
  }
});

test('slow conflicting admission and stop requests stay below their total control budget', async () => {
  const f = fixture();
  const job = await startScraperBatch(f.runtime, manifest(1), owner, requestId);
  f.runtime.dispatchChild = async () => {};
  await runScraperBatch(f.runtime, job.id);
  const get = f.runtime.store.get;
  f.runtime.store.get = async id => { f.advance(7900); return get(id); };
  f.runtime.isAdmin = async () => { f.advance(7900); return true; };
  f.runtime.store.compareAndSwap = async () => { f.advance(7900); return null; };
  let startedAt = f.time();
  assert.equal(await prepareScraperBatchChild(f.runtime, job.id, 0), null);
  assert.equal(f.time() - startedAt, 31_600);
  startedAt = f.time();
  await assert.rejects(stopScraperBatch(f.runtime, job.id, owner), { status: 409 });
  assert.equal(f.time() - startedAt, 31_600);
  assert.equal(f.calls.length, 0);
});

test('fast batches reserve at most three child attempts per thirty seconds across server relays', async () => {
  const f = fixture();
  const attempts: number[] = [];
  const dispatch = f.runtime.dispatchChild;
  f.hooks.duration = 250;
  f.runtime.dispatchChild = async (id, index) => {
    attempts.push(f.time());
    await dispatch(id, index);
  };
  const job = await startScraperBatch(f.runtime, manifest(12, 'fast'), owner, requestId);
  const completed = await f.drain(job.id);
  assert.equal(completed.status, 'completed');
  assert.equal(f.calls.length, 12);
  assert.equal(f.peak(), 3);
  for (const start of attempts) {
    assert.ok(attempts.filter(at => at >= start && at < start + 30_000).length <= 3,
      'The persisted quota includes both new URLs and queued retries');
  }
});

test('an unavailable child admission consumes its reservation without causing a retry burst', async () => {
  const f = fixture();
  const attempts: number[] = [];
  f.runtime.dispatchChild = async () => { attempts.push(f.time()); throw new Error('Lost child acknowledgement'); };
  const job = await startScraperBatch(f.runtime, manifest(3, 'fast'), owner, requestId);
  for (let invocation = 0; invocation < 3; invocation++) await runScraperBatch(f.runtime, job.id);
  assert.ok(attempts.length >= 6, 'A successor eventually retries the still queued children');
  for (const start of attempts) {
    assert.ok(attempts.filter(at => at >= start && at < start + 30_000).length <= 3);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows.get(job.id)?.status, 'processing');
  assert.equal(f.relays.length, 3, 'Rate protection keeps the server relay alive');
});

test('an optional dispatch history must be bounded and ordered before it can control a saved job', async () => {
  for (const invalid of [null, 'invalid', [-1], [2, 1], [1, 2, 3, 4], [Number.NaN]]) {
    const f = fixture();
    const job = await startScraperBatch(f.runtime, manifest(3), owner, requestId);
    const state = f.rows.get(job.id)!.request_payload.batch as ScraperBatchState;
    state.dispatches = invalid as number[];
    await assert.rejects(runScraperBatch(f.runtime, job.id), { status: 409 });
    assert.equal(f.calls.length, 0);
  }
});

test('one grouped dispatch reservation leaves the parent handoff within the Free worker budget', async () => {
  const f = fixture();
  const job = await startScraperBatch(f.runtime, manifest(3, 'fast'), owner, requestId);
  f.runtime.dispatchChild = async () => {};
  await runScraperBatch(f.runtime, job.id);
  f.advance(31_000);
  const get = f.runtime.store.get;
  const cas = f.runtime.store.compareAndSwap;
  f.runtime.store.get = async id => { f.advance(7900); return get(id); };
  f.runtime.store.compareAndSwap = async (id, revision, patch) => { f.advance(7900); return cas(id, revision, patch); };
  f.runtime.isAdmin = async () => { f.advance(7900); return true; };
  let attempts = 0;
  f.runtime.dispatchChild = async () => { attempts++; f.advance(5900); throw new Error('Internal HTTP timeout'); };
  f.runtime.relayMonitor = async () => { f.advance(12_500); };
  const began = f.time();
  await runScraperBatch(f.runtime, job.id);
  assert.equal(attempts, 3);
  assert.ok(f.time() - began < 140_000, `Elapsed ${f.time() - began} ms`);
  assert.equal((f.rows.get(job.id)!.request_payload.batch as ScraperBatchState).leaseId, null);
});
