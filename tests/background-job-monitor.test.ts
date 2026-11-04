import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BACKGROUND_MONITOR_WINDOW_MS, claimBackgroundWorker, monitorBackgroundJob,
  continueBackgroundJobRecord, startBackgroundJobMonitor, updateBackgroundJobRecord,
  nextBackgroundTokenBudget, prepareBackgroundJobPayload, prepareBackgroundJobRequest,
  readBackgroundMonitorState, type BackgroundJobRow, type BackgroundJobStore,
  type BackgroundMonitorRuntime,
} from '../supabase/functions/_shared/background-job-monitor.ts';
import type { AIBackgroundPollResult } from '../supabase/functions/_shared/ai-client.ts';
import {
  emptySystematicResult, executeSystematicStep, systematicCandidates,
  type SystematicRunResult, type SystematicRunState,
} from '../supabase/functions/cde-systematic-analyze/durable-run.ts';

const id = '11111111-1111-4111-8111-111111111111';
const token = '22222222-2222-4222-8222-222222222222';
const startTime = 1_800_000_000_000;
const provider = (status: string, extra: Partial<AIBackgroundPollResult> = {}): AIBackgroundPollResult => ({
  id: 'resp_original', provider: 'openai', model: 'test-model', status,
  ...(status === 'completed' ? { text: '{"answer":"finished"}' } : {}), ...extra,
});

function row(extra: Partial<BackgroundJobRow> = {}): BackgroundJobRow {
  const payload = prepareBackgroundJobPayload({ action: 'ignored', symptomNames: ['synthetic fixture'] }, startTime);
  (payload._background_monitor as Record<string, unknown>).phase = 'polling';
  return {
    id, public_token: token, function_name: 'deep-research', status: 'processing',
    request_payload: payload, provider_response_id: 'resp_original', provider_status: 'in_progress',
    requested_by: 'owner-a', created_at: new Date(startTime).toISOString(), updated_at: new Date(startTime).toISOString(),
    ...extra,
  };
}

class MemoryStore implements BackgroundJobStore {
  constructor(public current: BackgroundJobRow) {}
  async load(jobId: string) { return jobId === this.current.id ? structuredClone(this.current) : null; }
  async compareAndSet(expected: BackgroundJobRow, patch: Record<string, unknown>) {
    if (expected.updated_at !== this.current.updated_at || expected.status !== this.current.status ||
        readBackgroundMonitorState(expected).revision !== readBackgroundMonitorState(this.current).revision) return null;
    this.current = { ...this.current, ...structuredClone(patch) } as BackgroundJobRow;
    return structuredClone(this.current);
  }
}

function harness(initial = row()) {
  const store = new MemoryStore(initial);
  const calls = { retrieve: [] as string[], dispatch: [] as Array<{ finalize: boolean; budget?: number }>, relay: 0 };
  let clock = startTime;
  let behavior: (job: BackgroundJobRow) => Promise<AIBackgroundPollResult> = async () => provider('completed');
  const runtime: BackgroundMonitorRuntime = {
    store, now: () => clock, sleep: async ms => { clock += ms; }, randomId: () => crypto.randomUUID(),
    retrieve: async job => { calls.retrieve.push(job.provider_response_id!); return await behavior(job); },
    async dispatch(job, lease, finalize) {
      const claimed = await claimBackgroundWorker(store, job.id, job.public_token, lease, clock);
      assert.ok(claimed, 'the actual one-time worker claim must succeed');
      const state = readBackgroundMonitorState(claimed);
      calls.dispatch.push({ finalize, budget: state.maxOutputTokens });
      const finished = await store.compareAndSet(claimed, {
        status: finalize ? 'completed' : 'processing',
        provider_response_id: finalize ? claimed.provider_response_id : `resp_retry_${calls.dispatch.length}`,
        result_payload: finalize ? { answer: 'finished' } : null,
        request_payload: { ...claimed.request_payload, _background_monitor: {
          ...state, revision: crypto.randomUUID(), phase: finalize ? 'finished' : 'polling',
          workerLease: null, workerUntil: 0, workerClaimed: false,
        } },
      });
      assert.ok(finished);
    },
    async relay() { calls.relay += 1; },
  };
  return { store, calls, runtime, setRetrieve(fn: typeof behavior) { behavior = fn; }, advance(ms: number) { clock += ms; } };
}

function cachedSystematicHarness(workerDurationMs: number) {
  const state: SystematicRunState = {
    version: 1, runId: id, owner: 'owner-a', targetPathology: null, index: 0,
    entities: Array.from({ length: 120 }, (_, index) => ({
      id: `synthetic-${index}`, name: `Synthetic ${index}`, source: 'local', node_type: 'substance',
    })),
  };
  const h = harness(row({
    function_name: 'cde-systematic-analyze', analysis_mode: 'systematic_run', status: 'queued',
    provider_response_id: null, provider_status: null,
    request_payload: prepareBackgroundJobPayload({ _systematic: state } as Parameters<typeof prepareBackgroundJobPayload>[0], startTime, true),
    result_payload: emptySystematicResult(state),
  }));
  const invocations: Array<{ kind: 'monitor' | 'worker'; at: number }> = [];
  const relays: Array<{ at: number; nextDispatchAt?: number; notBefore?: number }> = [];
  const publish = (next: SystematicRunState, result: SystematicRunResult, completed: boolean) => {
    const job = h.store.current;
    h.store.current = {
      ...job, status: completed ? 'completed' : 'processing', result_payload: structuredClone(result),
      request_payload: { ...job.request_payload, _systematic: structuredClone(next), _background_monitor: {
        ...readBackgroundMonitorState(job), revision: crypto.randomUUID(), phase: completed ? 'finished' : 'queued',
        workerLease: null, workerUntil: 0, workerClaimed: false,
      } },
    };
  };
  h.runtime.dispatch = async (job, lease, finalize) => {
    assert.equal(finalize, false, 'cached windows do not require a provider finalizer');
    invocations.push({ kind: 'worker', at: h.runtime.now!() });
    assert.ok(await claimBackgroundWorker(h.store, job.id, job.public_token, lease, h.runtime.now!()));
    h.advance(workerDurationMs);
    await executeSystematicStep({
      state: h.store.current.request_payload._systematic as SystematicRunState,
      result: h.store.current.result_payload as SystematicRunResult,
    }, {
      async loadCatalog() { assert.fail('The catalog is already frozen.'); },
      async prepareBatch(current) {
        const candidates = systematicCandidates(current.entities!.length, current.index);
        return { index: current.index, candidates, pending: [], cached: candidates.length, documented: 0 };
      },
      async checkpoint(current) { h.store.current.request_payload._systematic = structuredClone(current); },
      async start() { assert.fail('Cached windows must not create a paid provider request.'); },
      async retrieve() { assert.fail('Cached windows have no provider response.'); },
      async rememberProvider() { assert.fail('Cached windows have no provider response.'); },
      async savePairs() { assert.fail('Cached results are already persisted.'); },
      async advance(next, result) { publish(next, result, false); },
      async finish(next, result) { publish(next, result, true); },
    });
  };
  h.runtime.retrieve = async () => { assert.fail('The monitor must not poll a provider for cached windows.'); };
  h.runtime.relay = async (_id, _deadline, notBefore) => {
    h.calls.relay += 1;
    relays.push({ at: h.runtime.now!(), notBefore, nextDispatchAt: readBackgroundMonitorState(h.store.current).nextDispatchAt });
  };
  const runMonitor = async () => {
    const notBefore = relays.at(-1)?.notBefore ?? 0;
    if (notBefore > h.runtime.now!()) h.advance(notBefore - h.runtime.now!());
    invocations.push({ kind: 'monitor', at: h.runtime.now!() });
    await monitorBackgroundJob(id, h.runtime);
  };
  return { ...h, invocations, relays, runMonitor };
}

test('all 119 cached CDE windows stay below 30 nested worker and monitor calls in every 60-second interval', async t => {
  const h = cachedSystematicHarness(250);
  for (let invocation = 0; h.store.current.status !== 'completed' && invocation < 100; invocation++) await h.runMonitor();
  assert.equal(h.store.current.status, 'completed');
  const result = h.store.current.result_payload as SystematicRunResult;
  assert.equal(result.steps.length, 119);
  assert.equal(result.pairs_processed, 470);
  assert.equal(result.pairs_analyzed, 0);
  assert.equal(h.invocations.filter(call => call.kind === 'worker').length, 119);
  const maximum = Math.max(...h.invocations.map(start => h.invocations.filter(call => call.at >= start.at && call.at < start.at + 60_000).length));
  assert.ok(maximum <= 30, `Observed ${maximum} nested invocations inside 60 seconds.`);
  t.diagnostic(`${h.invocations.length} total invocations, maximum ${maximum}/60 s, elapsed ${h.runtime.now!() - startTime} ms`);
});

test('a new monitor preserves the pending dispatch cadence across a cached CDE continuation and relay', async () => {
  const h = cachedSystematicHarness(3600);
  await h.runMonitor();
  const firstRelay = h.relays[0];
  assert.ok(firstRelay.nextDispatchAt! > firstRelay.at, 'the first monitor must yield while its saved cadence is still pending');
  const before = h.invocations.filter(call => call.kind === 'worker').length;
  await h.runMonitor();
  const nextWorker = h.invocations.filter(call => call.kind === 'worker')[before];
  assert.ok(nextWorker.at >= firstRelay.nextDispatchAt!, 'a new invocation must not reset the saved dispatch deadline');
});

test('a server watchdog finishes the provider response without any browser status request', async () => {
  const h = harness();
  h.setRetrieve(async () => provider(h.calls.retrieve.length === 1 ? 'in_progress' : 'completed'));
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'completed');
  assert.deepEqual(h.store.current.result_payload, { answer: 'finished' });
  assert.deepEqual(h.calls.dispatch.map(c => c.finalize), [true]);
});

test('concurrent browser wake-ups and server watchdogs dispatch only one finalizer', async () => {
  const h = harness();
  await Promise.all([monitorBackgroundJob(id, h.runtime), monitorBackgroundJob(id, h.runtime), monitorBackgroundJob(id, h.runtime)]);
  assert.equal(h.store.current.status, 'completed');
  assert.equal(h.calls.dispatch.length, 1);
  await monitorBackgroundJob(id, h.runtime); // a lost final HTTP response cannot replay the completed job
  assert.equal(h.calls.dispatch.length, 1);
});

test('a transient provider GET error retries the same response and never creates another generation', async () => {
  const h = harness();
  h.setRetrieve(async () => {
    if (h.calls.retrieve.length === 1) throw new Error('network disconnected');
    return provider('completed');
  });
  await monitorBackgroundJob(id, h.runtime);
  assert.deepEqual(h.calls.retrieve, ['resp_original', 'resp_original']);
  assert.deepEqual(h.calls.dispatch.map(c => c.finalize), [true]);
});

test('only max_output_tokens terminal responses create bounded larger-budget retries', async () => {
  const h = harness();
  h.setRetrieve(async job => {
    const state = readBackgroundMonitorState(job);
    return state.retries < 2
      ? provider('incomplete', { incompleteReason: 'max_output_tokens', maxOutputTokens: state.maxOutputTokens ?? 32_768 })
      : provider('completed');
  });
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'completed');
  assert.deepEqual(h.calls.dispatch, [
    { finalize: false, budget: 65_536 }, { finalize: false, budget: 128_000 }, { finalize: true, budget: 128_000 },
  ]);
});

test('token retry exhaustion preserves the last provider id and does not label partial output as completed', async () => {
  const h = harness();
  h.setRetrieve(async job => provider('incomplete', {
    incompleteReason: 'max_output_tokens', maxOutputTokens: readBackgroundMonitorState(job).maxOutputTokens ?? 16_384,
    partialText: '{"unfinished":',
  }));
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.dispatch.filter(c => !c.finalize).length, 2);
  assert.equal(h.store.current.status, 'failed');
  assert.equal(h.store.current.provider_response_id, 'resp_retry_2');
  assert.equal(h.store.current.result_payload, null);
});

test('content filters, cancellations, empty completions, and the 128k cap do not trigger creation retries', async () => {
  for (const result of [
    provider('incomplete', { incompleteReason: 'content_filter', maxOutputTokens: 32_768 }),
    provider('cancelled'), provider('completed', { text: '' }),
    provider('incomplete', { incompleteReason: 'max_output_tokens', maxOutputTokens: 128_000 }),
  ]) {
    const h = harness();
    h.setRetrieve(async () => result);
    await monitorBackgroundJob(id, h.runtime);
    assert.equal(h.calls.dispatch.length, 0);
    assert.equal(h.store.current.status, 'failed');
    assert.equal(h.store.current.provider_response_id, 'resp_original');
  }
});

test('60-minute watchdog expiry pauses synchronization without deleting the response or failing the generation', async () => {
  const h = harness();
  h.advance(BACKGROUND_MONITOR_WINDOW_MS + 1);
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'processing');
  assert.equal(h.store.current.provider_response_id, 'resp_original');
  assert.equal(readBackgroundMonitorState(h.store.current).phase, 'paused');
  assert.equal(h.calls.relay, 0);
});

test('a pending generation is relayed after a short slice, keeping its provider id', async () => {
  const h = harness();
  h.setRetrieve(async () => provider('in_progress'));
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.relay, 1);
  assert.equal(h.calls.dispatch.length, 0);
  assert.equal(h.store.current.provider_response_id, 'resp_original');
  assert.equal(readBackgroundMonitorState(h.store.current).watchdogId, null);
});

test('a slow last provider GET yields before dispatching a long finalizer', async () => {
  const h = harness();
  h.setRetrieve(async () => { h.advance(36_000); return provider('completed'); });
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.dispatch.length, 0);
  assert.equal(h.calls.relay, 1);
  assert.equal(h.store.current.provider_response_id, 'resp_original');
  assert.equal(h.store.current.provider_status, 'completed');
  h.setRetrieve(async () => { throw new Error('The monitor must use the persisted completion marker.'); });
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.retrieve.length, 1);
  assert.equal(h.store.current.status, 'completed');
});

test('slow initial reads and claims cannot combine with a 75-second dispatch beyond the Free worker limit', async () => {
  const h = harness(row({ status: 'queued', provider_response_id: null, provider_status: null }));
  readBackgroundMonitorState(h.store.current).phase = 'queued';
  let databaseLatency = 14_900;
  const load = h.store.load.bind(h.store);
  const compareAndSet = h.store.compareAndSet.bind(h.store);
  h.store.load = async jobId => { h.advance(databaseLatency); return await load(jobId); };
  h.store.compareAndSet = async (expected, patch) => { h.advance(databaseLatency); return await compareAndSet(expected, patch); };
  const dispatch = h.runtime.dispatch;
  const dispatchedAt: number[] = [];
  h.runtime.dispatch = async job => {
    dispatchedAt.push(h.runtime.now!() - startTime);
    h.advance(74_000);
    h.store.current.provider_response_id = 'resp_saved';
    Object.assign(readBackgroundMonitorState(h.store.current), {
      revision: crypto.randomUUID(), phase: 'polling', workerLease: null, workerUntil: 0, workerClaimed: false,
    });
    assert.equal(job.id, id);
  };
  h.runtime.relay = async () => { h.calls.relay += 1; h.advance(1000); };
  await monitorBackgroundJob(id, h.runtime);
  assert.ok(h.runtime.now!() - startTime < 150_000, `elapsed ${h.runtime.now!() - startTime} ms; dispatches ${dispatchedAt}`);
  assert.deepEqual(dispatchedAt, [], 'late initial database work must yield before reserving a worker');
  assert.equal(readBackgroundMonitorState(h.store.current).phase, 'queued');
  assert.equal(h.calls.relay, 1);

  databaseLatency = 0;
  h.runtime.dispatch = dispatch;
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'completed', 'the next invocation can safely start the untouched queued job');
});

test('a claim that consumes the remaining dispatch margin releases its unstarted lease', async () => {
  const h = harness(row({ status: 'queued', provider_response_id: null, provider_status: null }));
  readBackgroundMonitorState(h.store.current).phase = 'queued';
  const compareAndSet = h.store.compareAndSet.bind(h.store);
  let delayed = false;
  h.store.compareAndSet = async (expected, patch) => {
    const candidate = (patch.request_payload as BackgroundJobRow['request_payload'])?._background_monitor as Record<string, unknown> | undefined;
    if (!delayed && candidate?.workerLease && candidate.workerClaimed === false) {
      delayed = true;
      h.advance(40_000);
    }
    return await compareAndSet(expected, patch);
  };
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.dispatch.length, 0);
  assert.equal(h.calls.relay, 1);
  assert.equal(h.store.current.status, 'queued');
  assert.equal(readBackgroundMonitorState(h.store.current).phase, 'queued');
  assert.equal(readBackgroundMonitorState(h.store.current).workerLease, null);
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'completed');
});

test('a slow dispatch reserves time for a conflicting hand-off and both relay attempts', async () => {
  const h = harness(row({ status: 'queued', provider_response_id: null, provider_status: null }));
  readBackgroundMonitorState(h.store.current).phase = 'queued';
  const load = h.store.load.bind(h.store);
  const compareAndSet = h.store.compareAndSet.bind(h.store);
  let handoffs = 0;
  h.store.load = async jobId => { h.advance(4900); return await load(jobId); };
  h.store.compareAndSet = async (expected, patch) => {
    h.advance(4900);
    const nextState = (patch.request_payload as BackgroundJobRow['request_payload'])._background_monitor as Record<string, unknown>;
    if (nextState.watchdogId === null && ++handoffs === 1) {
      readBackgroundMonitorState(h.store.current).revision = crypto.randomUUID();
      return null;
    }
    return await compareAndSet(expected, patch);
  };
  h.runtime.dispatch = async () => {
    h.advance(74_900);
    h.store.current.provider_response_id = 'resp_retained';
    Object.assign(readBackgroundMonitorState(h.store.current), {
      phase: 'polling', revision: crypto.randomUUID(), workerLease: null, workerUntil: 0, workerClaimed: false,
    });
  };
  h.runtime.relay = async (_id, deadlineAt) => {
    h.calls.relay += 1;
    h.advance(12_500);
    assert.ok(h.runtime.now!() <= deadlineAt!);
  };
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(handoffs, 2);
  assert.equal(h.calls.relay, 1);
  assert.equal(h.store.current.provider_response_id, 'resp_retained');
  assert.equal(readBackgroundMonitorState(h.store.current).watchdogId, null);
  assert.ok(h.runtime.now!() - startTime < 140_000);
});

test('repeated hand-off conflicts schedule a later monitor instead of orphaning the provider response', async () => {
  const h = harness();
  h.setRetrieve(async () => provider('in_progress'));
  const compareAndSet = h.store.compareAndSet.bind(h.store);
  let conflicts = 0;
  h.store.compareAndSet = async (expected, patch) => {
    const nextState = (patch.request_payload as BackgroundJobRow['request_payload'])._background_monitor as Record<string, unknown>;
    if (nextState.watchdogId === null) {
      conflicts += 1;
      readBackgroundMonitorState(h.store.current).revision = crypto.randomUUID();
      return null;
    }
    return await compareAndSet(expected, patch);
  };
  let scheduledFor: number | undefined;
  h.runtime.relay = async (_id, _deadline, notBefore) => { h.calls.relay += 1; scheduledFor = notBefore; };
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(conflicts, 2);
  assert.equal(h.calls.relay, 1);
  assert.equal(h.store.current.provider_response_id, 'resp_original');
  assert.ok(scheduledFor! >= readBackgroundMonitorState(h.store.current).watchdogUntil!);

  h.advance(scheduledFor! - h.runtime.now!());
  h.store.compareAndSet = compareAndSet;
  h.setRetrieve(async () => provider('completed'));
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'completed');
  assert.deepEqual(h.calls.dispatch.map(call => call.finalize), [true]);
});

test('a lost initial watchdog claim acknowledgment schedules recovery after its possible lease', async () => {
  const h = harness();
  const compareAndSet = h.store.compareAndSet.bind(h.store);
  let lost = false;
  h.store.compareAndSet = async (expected, patch) => {
    const result = await compareAndSet(expected, patch);
    if (!lost) { lost = true; throw new Error('Connection closed after the database committed.'); }
    return result;
  };
  let scheduledFor: number | undefined;
  h.runtime.relay = async (_id, _deadline, notBefore) => { h.calls.relay += 1; scheduledFor = notBefore; };
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.relay, 1);
  assert.equal(h.calls.dispatch.length, 0);
  assert.ok(scheduledFor! >= readBackgroundMonitorState(h.store.current).watchdogUntil!);
  h.advance(scheduledFor! - h.runtime.now!());
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'completed');
  assert.deepEqual(h.calls.dispatch.map(call => call.finalize), [true]);
});

test('a revision conflict on the initial watchdog claim does not assume another monitor exists', async () => {
  const h = harness();
  const compareAndSet = h.store.compareAndSet.bind(h.store);
  let conflict = true;
  h.store.compareAndSet = async (expected, patch) => {
    if (conflict) { conflict = false; readBackgroundMonitorState(h.store.current).revision = crypto.randomUUID(); return null; }
    return await compareAndSet(expected, patch);
  };
  let scheduledFor: number | undefined;
  h.runtime.relay = async (_id, _deadline, notBefore) => { h.calls.relay += 1; scheduledFor = notBefore; };
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.relay, 1);
  assert.equal(h.calls.dispatch.length, 0);
  h.advance(scheduledFor! - h.runtime.now!());
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'completed');
});

test('a rejected terminal CAS retries observation instead of silently dropping the active job', async () => {
  for (const outcome of ['expired', 'ambiguous', 'incomplete']) {
    const h = harness(row(outcome === 'expired' ? { expires_at: new Date(startTime - 1).toISOString() }
      : outcome === 'ambiguous' ? { provider_response_id: null } : {}));
    if (outcome === 'ambiguous') readBackgroundMonitorState(h.store.current).phase = 'starting';
    h.setRetrieve(async () => provider('incomplete', { incompleteReason: 'content_filter' }));
    const compareAndSet = h.store.compareAndSet.bind(h.store);
    let conflict = true;
    h.store.compareAndSet = async (expected, patch) => {
      if (patch.status === 'failed' && conflict) {
        conflict = false;
        readBackgroundMonitorState(h.store.current).revision = crypto.randomUUID();
        return null;
      }
      return await compareAndSet(expected, patch);
    };
    await monitorBackgroundJob(id, h.runtime);
    assert.equal(h.store.current.status, 'failed', outcome);
    assert.equal(h.calls.dispatch.length, 0, outcome);
  }
});

test('only an explicitly unclaimed expired reservation may return to the creation queue', async () => {
  for (const workerClaimed of [false, true, undefined]) {
    const h = harness(row({ provider_response_id: null }));
    Object.assign(readBackgroundMonitorState(h.store.current), {
      phase: 'starting', workerLease: 'old-reservation', workerUntil: startTime - 1, workerClaimed,
    });
    await monitorBackgroundJob(id, h.runtime);
    assert.equal(h.calls.dispatch.filter(call => !call.finalize).length, workerClaimed === false ? 1 : 0);
    assert.equal(h.store.current.status, workerClaimed === false ? 'completed' : 'failed');
  }
});

test('an expired ambiguous creation never causes a second provider POST', async () => {
  const h = harness(row({ provider_response_id: null }));
  const state = readBackgroundMonitorState(h.store.current);
  Object.assign(state, { phase: 'starting', workerUntil: startTime - 1 });
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.calls.dispatch.length, 0);
  assert.equal(h.store.current.status, 'failed');
  assert.match(String(h.store.current.error_message), /Aucune seconde génération/);
});

test('an abandoned finalizer can recover only after its lease, using the existing provider response', async () => {
  const h = harness();
  Object.assign(readBackgroundMonitorState(h.store.current), { phase: 'finalizing', workerLease: 'old', workerUntil: startTime - 1, workerClaimed: true });
  await monitorBackgroundJob(id, h.runtime);
  assert.deepEqual(h.calls.retrieve, ['resp_original']);
  assert.deepEqual(h.calls.dispatch.map(c => c.finalize), [true]);
});

test('a worker lease is consumable once and unknown/client-supplied control state is stripped', async () => {
  const job = row();
  Object.assign(readBackgroundMonitorState(job), { phase: 'starting', workerLease: 'lease', workerUntil: startTime + 60_000, workerClaimed: false });
  const store = new MemoryStore(job);
  const claims = await Promise.all([
    claimBackgroundWorker(store, id, token, 'lease', startTime), claimBackgroundWorker(store, id, token, 'lease', startTime),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const safe = prepareBackgroundJobPayload({ runJob: true, _workerLease: 'injected', providerResponseId: 'injected', _backgroundMaxTokens: 999999,
    _monitorNotBefore: Number.MAX_SAFE_INTEGER, _monitorControlToken: token, symptomNames: ['fixture'] });
  assert.equal(safe.runJob, undefined);
  assert.equal(safe._workerLease, undefined);
  assert.equal(safe.providerResponseId, undefined);
  assert.equal(safe._backgroundMaxTokens, undefined);
  assert.equal(safe._monitorNotBefore, undefined);
  assert.equal(safe._monitorControlToken, undefined);
  assert.equal(nextBackgroundTokenBudget(readBackgroundMonitorState(job), provider('failed', { errorMessage: 'timeout' })), null);
});

test('status requires the right owner and function even when the job token is known', async () => {
  const job = row({ status: 'completed', result_payload: { answer: 'private' } });
  const filters = new Map<string, unknown>();
  const query = {
    select() { return this; }, eq(key: string, value: unknown) { filters.set(key, value); return this; },
    abortSignal() { return this; },
    async maybeSingle() { return { error: null, data: filters.get('function_name') === job.function_name ? job : null }; },
  };
  const client = { from: () => query, auth: { getUser: async () => ({ error: null, data: { user: { id: 'owner-b' } } }) } };
  const options = { supabase: client as unknown as Parameters<typeof prepareBackgroundJobRequest>[2]['supabase'],
    supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research' };
  const req = new Request('https://project.invalid', { headers: { authorization: 'Bearer user-session' } });
  const denied = await prepareBackgroundJobRequest(req, { action: 'status', jobId: id, jobToken: token }, options);
  assert.equal(denied.response?.status, 404);
  assert.ok(!(await denied.response!.text()).includes('private'));
  client.auth.getUser = async () => ({ error: null, data: { user: { id: 'owner-a' } } });
  const allowed = await prepareBackgroundJobRequest(req, { action: 'status', jobId: id, jobToken: token }, options);
  assert.equal(allowed.response?.status, 200);
  const visible = await allowed.response!.json();
  assert.deepEqual(visible.job.result_payload, { answer: 'private' });
  assert.equal(visible.job.request_payload, undefined);
  assert.equal(visible.job.public_token, undefined);
  const wrongFunction = await prepareBackgroundJobRequest(req, { action: 'status', jobId: id, jobToken: token }, { ...options, functionName: 'cde-analyze' });
  assert.equal(wrongFunction.response?.status, 404);
  const forbidden = await prepareBackgroundJobRequest(req, { action: 'monitor', jobId: id }, options);
  assert.equal(forbidden.response?.status, 403);
});

test('temporary auth service errors preserve retryability without accepting an invalid session', async () => {
  for (const [error, expectedStatus] of [
    [{ name: 'AuthRetryableFetchError' }, 503], [{ status: 0 }, 503], [{ status: 429 }, 503],
    [{ status: 500 }, 503], [{ status: 503 }, 503], [{ status: 401 }, 401], [{ status: 403 }, 401],
  ] as const) {
    const supabase = {
      auth: { getUser: async () => ({ data: { user: null }, error }) },
      from() { assert.fail('No job may be read until authentication succeeds.'); },
    } as unknown as Parameters<typeof prepareBackgroundJobRequest>[2]['supabase'];
    const result = await prepareBackgroundJobRequest(new Request('https://project.invalid', {
      headers: { authorization: 'Bearer user-session' },
    }), { action: 'status', jobId: id, jobToken: token }, {
      supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research',
    });
    assert.equal(result.response?.status, expectedStatus);
  }
});

function database(store: MemoryStore, observe?: { read?: () => void; afterWrite?: (patch: Record<string, unknown>) => void }) {
  return {
    from() {
      const filters = new Map<string, unknown>();
      let patch: Record<string, unknown> | undefined;
      const query = {
        select() { return query; },
        abortSignal() { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        is(key: string, value: unknown) { filters.set(key, value); return query; },
        update(value: Record<string, unknown>) { patch = value; return query; },
        async maybeSingle() {
          const matches = [...filters].every(([key, value]) => {
            const actual = key === 'request_payload->_background_monitor->>revision'
              ? readBackgroundMonitorState(store.current).revision : store.current[key];
            return actual === value;
          });
          if (!matches) return { data: null, error: null };
          if (patch) {
            store.current = { ...store.current, ...structuredClone(patch) } as BackgroundJobRow;
            observe?.afterWrite?.(patch);
          } else observe?.read?.();
          return { data: structuredClone(store.current), error: null };
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof prepareBackgroundJobRequest>[2]['supabase'];
}

test('canonical PostgREST reads abort within five seconds even if the SDK does not settle', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let querySignal: AbortSignal | undefined;
  const query = {
    select() { return this; }, eq() { return this; },
    abortSignal(signal: AbortSignal) { querySignal = signal; return this; },
    maybeSingle: () => new Promise<never>(() => {}),
  };
  const supabase = { from: () => query } as unknown as Parameters<typeof prepareBackgroundJobRequest>[2]['supabase'];
  const work = prepareBackgroundJobRequest(new Request('https://project.invalid', {
    headers: { authorization: 'Bearer service-secret' },
  }), { action: 'status', jobId: id, jobToken: token }, {
    supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research',
  });
  const rejected = assert.rejects(work, /délai de synchronisation/);
  assert.ok(querySignal);
  t.mock.timers.tick(4999);
  assert.equal(querySignal.aborted, false);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(querySignal.aborted, true);
});

test('a compatibility projection can use only the time left in its canonical database operation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = startTime;
  t.mock.method(Date, 'now', () => clock);
  const errors = t.mock.method(console, 'error', () => {});
  const pending: Promise<void>[] = [];
  const global = globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(work: Promise<void>): void } };
  const originalRuntime = global.EdgeRuntime;
  global.EdgeRuntime = { waitUntil: work => { pending.push(work); } };
  t.after(() => { global.EdgeRuntime = originalRuntime; });
  const job = row({ status: 'completed' });
  let projectionSignal: AbortSignal | undefined;
  const query = {
    select() { return this; }, eq() { return this; }, abortSignal() { return this; },
    async maybeSingle() { clock += 4000; return { data: job, error: null }; },
  };
  const supabase = { from: () => query } as unknown as Parameters<typeof prepareBackgroundJobRequest>[2]['supabase'];
  const accepted = await prepareBackgroundJobRequest(new Request('https://project.invalid', {
    headers: { authorization: 'Bearer service-secret' },
  }), { action: 'monitor', jobId: id }, {
    supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research',
    syncJob: (_job, signal) => { projectionSignal = signal; return new Promise<never>(() => {}); },
  });
  assert.equal(accepted.response?.status, 202);
  for (let count = 0; !projectionSignal && count < 10; count++) await Promise.resolve();
  assert.ok(projectionSignal);
  t.mock.timers.tick(999);
  assert.equal(projectionSignal.aborted, false);
  clock += 1000;
  t.mock.timers.tick(1);
  await pending[0];
  assert.equal(projectionSignal.aborted, true);
  assert.equal(clock - startTime, 5000);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0].arguments[0]), /Projection de compatibilité/);
});

test('a deferred control relay uses separate short waiting invocations and stops when the job has finished', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: startTime });
  const pending: Promise<void>[] = [];
  const global = globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(work: Promise<void>): void } };
  const originalRuntime = global.EdgeRuntime;
  global.EdgeRuntime = { waitUntil: work => { pending.push(work); } };
  t.after(() => { global.EdgeRuntime = originalRuntime; });
  const forwarded: Array<Record<string, unknown>> = [];
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    forwarded.push(JSON.parse(String(init?.body)));
    return Response.json({ accepted: true }, { status: 202 });
  });
  const store = new MemoryStore(row());
  const supabase = database(store);
  const options = { supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research' };
  let incoming: Parameters<typeof prepareBackgroundJobRequest>[1] = { action: 'monitor', jobId: id, _monitorNotBefore: startTime + 100_000 };
  const invoke = () => prepareBackgroundJobRequest(new Request('https://project.invalid', {
    headers: { authorization: 'Bearer service-secret' },
  }), incoming, options);
  for (const delay of [35_000, 35_000, 30_000]) {
    assert.equal((await invoke()).response?.status, 202);
    for (let step = 0; step < 50; step++) await Promise.resolve();
    t.mock.timers.tick(delay);
    await pending.at(-1);
    const next = forwarded.at(-1)!;
    assert.equal(next._monitorNotBefore, startTime + 100_000);
    assert.equal(typeof next._monitorControlToken, 'string');
    assert.notEqual(next._monitorControlToken, incoming._monitorControlToken);
    assert.equal(store.current.provider_response_id, 'resp_original');
    incoming = next;
  }
  store.current.status = 'completed';
  assert.equal((await invoke()).response?.status, 202);
  await pending.at(-1);
  assert.equal(forwarded.length, 3);
});

test('lost control-CAS acknowledgments recognize the committed reservation and its one-time consumer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: startTime });
  const pending: Promise<void>[] = [];
  const global = globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(work: Promise<void>): void } };
  const originalRuntime = global.EdgeRuntime;
  global.EdgeRuntime = { waitUntil: work => { pending.push(work); } };
  t.after(() => { global.EdgeRuntime = originalRuntime; });
  const store = new MemoryStore(row());
  Object.assign(readBackgroundMonitorState(store.current), { watchdogId: 'existing-controller', watchdogUntil: startTime + 60_000 });
  let reservations = 0, consumers = 0, readsAfterConsumption = 0;
  const supabase = database(store, {
    read() { if (readBackgroundMonitorState(store.current).relayClaimedBy) readsAfterConsumption += 1; },
    afterWrite() {
      const state = readBackgroundMonitorState(store.current);
      if (state.relayClaimedBy) {
        consumers += 1;
        if (consumers === 1) throw new Error('Consumption committed before the database connection closed.');
      } else if (state.relayToken) {
        reservations += 1;
        if (reservations === 1) throw new Error('Reservation committed before the database connection closed.');
      }
    },
  });
  const forwarded: Array<Record<string, unknown>> = [];
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    forwarded.push(JSON.parse(String(init?.body)));
    return Response.json({ accepted: true }, { status: 202 });
  });
  const options = { supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research' };
  const invoke = (body: Parameters<typeof prepareBackgroundJobRequest>[1]) => prepareBackgroundJobRequest(new Request('https://project.invalid', {
    headers: { authorization: 'Bearer service-secret' },
  }), body, options);
  await invoke({ action: 'monitor', jobId: id, _monitorNotBefore: startTime + 1000 });
  for (let step = 0; step < 100; step++) await Promise.resolve();
  t.mock.timers.tick(1000);
  await pending.at(-1);
  assert.equal(reservations, 1, 'a lost database acknowledgment must not reserve a second token');
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0]._monitorControlToken, readBackgroundMonitorState(store.current).relayToken);
  await invoke(forwarded[0]);
  await pending.at(-1);
  assert.equal(consumers, 1);
  assert.ok(readsAfterConsumption >= 2, 'the committed consumer must be recognized and allowed to enter the normal monitor');
  const consumer = readBackgroundMonitorState(store.current).relayClaimedBy;
  await invoke(forwarded[0]); // duplicate HTTP delivery after the committed consumption
  await pending.at(-1);
  assert.equal(consumers, 1);
  assert.equal(readBackgroundMonitorState(store.current).relayClaimedBy, consumer);
  assert.equal(forwarded.length, 1);
  assert.equal(store.current.provider_response_id, 'resp_original');
});

test('repeated initial claim conflicts keep deferred control calls below the nested invocation rate limit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: startTime });
  const pending: Promise<void>[] = [];
  const global = globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(work: Promise<void>): void } };
  const originalRuntime = global.EdgeRuntime;
  global.EdgeRuntime = { waitUntil: work => { pending.push(work); } };
  t.after(() => { global.EdgeRuntime = originalRuntime; });
  const job = row();
  let claims = 0;
  const supabase = {
    from() {
      let patch: Record<string, unknown> | undefined;
      const filters = new Map<string, unknown>();
      const query = {
        select() { return query; }, abortSignal() { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        is(key: string, value: unknown) { filters.set(key, value); return query; },
        update(value: Record<string, unknown>) { patch = value; return query; },
        async maybeSingle() {
          const matches = [...filters].every(([key, value]) => {
            const actual = key === 'request_payload->_background_monitor->>revision' ? readBackgroundMonitorState(job).revision : job[key];
            return actual === value;
          });
          if (!matches) return { data: null, error: null };
          if (patch) {
            const nextState = readBackgroundMonitorState({ ...job, ...patch } as BackgroundJobRow);
            if (nextState.watchdogId) { claims += 1; return { data: null, error: null }; }
            Object.assign(job, structuredClone(patch));
          }
          return { data: structuredClone(job), error: null };
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof prepareBackgroundJobRequest>[2]['supabase'];
  const options = { supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research' };
  const invoke = (body: Parameters<typeof prepareBackgroundJobRequest>[1]) => prepareBackgroundJobRequest(new Request('https://project.invalid', {
    headers: { authorization: 'Bearer service-secret' },
  }), body, options);
  const calls: number[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(Date.now() - startTime);
    if (Date.now() - startTime >= 60_000) return Response.json({ accepted: true }, { status: 202 });
    return (await invoke(JSON.parse(String(init?.body)))).response!;
  });
  const settle = async () => { for (let step = 0; step < 150; step++) await Promise.resolve(); };
  await invoke({ action: 'monitor', jobId: id });
  await settle();
  for (let tick = 0; tick < 24; tick++) { t.mock.timers.tick(2500); await settle(); }
  await Promise.all(pending);
  assert.ok(claims >= 4, 'the server must keep retrying control without any browser request');
  assert.ok(calls.filter(at => at < 60_000).length <= 30, `Observed ${calls.length} control invocations in 60 seconds.`);
});

test('a durable continuation atomically saves outputs, resets only the next step budget, and fences the old worker', async t => {
  t.mock.method(Date, 'now', () => startTime);
  const job = row({ expires_at: new Date(startTime + 24 * 60 * 60_000).toISOString() });
  Object.assign(readBackgroundMonitorState(job), {
    phase: 'finalizing', workerLease: 'sequence-lease', workerUntil: startTime + 60_000,
    workerClaimed: false, retries: 2, maxOutputTokens: 128_000, deadlineAt: startTime + 1000,
    nextDispatchAt: startTime + 4000,
  });
  const store = new MemoryStore(job);
  const supabase = database(store);
  const options = { supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research' };
  const claimed = await prepareBackgroundJobRequest(new Request('https://project.invalid', {
    headers: { authorization: 'Bearer service-secret' },
  }), { runJob: true, jobId: id, jobToken: token, _workerLease: 'sequence-lease' }, options);
  assert.equal(claimed.response, undefined);
  await updateBackgroundJobRecord(supabase, id, { request_payload: { cursor: 0, frozenInput: ['fixture'] } });
  await continueBackgroundJobRecord(supabase, id, { request_payload: { cursor: 1 }, result_payload: { saved: 4 } });
  const state = readBackgroundMonitorState(store.current);
  assert.equal(store.current.request_payload.cursor, 1);
  assert.deepEqual(store.current.request_payload.frozenInput, ['fixture']);
  assert.deepEqual(store.current.result_payload, { saved: 4 });
  assert.equal(store.current.provider_response_id, null);
  assert.equal(state.phase, 'queued');
  assert.equal(state.retries, 0);
  assert.equal(state.maxOutputTokens, undefined);
  assert.equal(state.workerLease, null);
  assert.equal(state.deadlineAt, startTime + BACKGROUND_MONITOR_WINDOW_MS);
  assert.equal(state.nextDispatchAt, startTime + 4000);
  await assert.rejects(updateBackgroundJobRecord(supabase, id, { result_payload: { stale: true } }), /ne possède plus/);
  assert.deepEqual(store.current.result_payload, { saved: 4 });
});

test('a catalogue-only continuation does not extend the current paid-step deadline', async t => {
  t.mock.method(Date, 'now', () => startTime);
  const job = row({ provider_response_id: null });
  Object.assign(readBackgroundMonitorState(job), {
    phase: 'starting', workerLease: 'catalogue', workerUntil: startTime + 60_000,
    workerClaimed: false, deadlineAt: startTime + 1234,
  });
  const store = new MemoryStore(job);
  const supabase = database(store);
  await prepareBackgroundJobRequest(new Request('https://project.invalid', { headers: { authorization: 'Bearer service-secret' } }),
    { runJob: true, jobId: id, jobToken: token, _workerLease: 'catalogue' },
    { supabase, supabaseUrl: 'https://project.invalid', serviceRoleKey: 'service-secret', functionName: 'deep-research' });
  await continueBackgroundJobRecord(supabase, id, { request_payload: { frozenInput: ['a', 'b'] } }, false);
  assert.equal(readBackgroundMonitorState(store.current).deadlineAt, startTime + 1234);
});

test('a paused never-started job resumes queued while an ambiguous creation remains non-replayable', async t => {
  const pending: Promise<void>[] = [];
  const global = globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(work: Promise<void>): void } };
  const oldRuntime = global.EdgeRuntime;
  global.EdgeRuntime = { waitUntil: work => { pending.push(work); } };
  t.after(() => { global.EdgeRuntime = oldRuntime; });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ accepted: true }, { status: 202 }));
  t.mock.method(Date, 'now', () => startTime + BACKGROUND_MONITOR_WINDOW_MS + 1);
  for (const phase of ['queued', 'starting'] as const) {
    const h = harness(row({ provider_response_id: null }));
    Object.assign(readBackgroundMonitorState(h.store.current), { phase });
    h.advance(BACKGROUND_MONITOR_WINDOW_MS + 1);
    await monitorBackgroundJob(id, h.runtime);
    assert.equal(readBackgroundMonitorState(h.store.current).resumePhase, phase);
    startBackgroundJobMonitor({ supabase: database(h.store), supabaseUrl: 'https://project.invalid',
      serviceRoleKey: 'service-secret', functionName: 'deep-research' }, id, true);
    await pending.at(-1);
    assert.equal(readBackgroundMonitorState(h.store.current).phase, phase);
    assert.equal(h.calls.dispatch.length, 0);
  }
});

test('provider polling cannot invent aggregate sequence progress', async () => {
  const h = harness(row({ progress_percentage: 12 }));
  Object.assign(readBackgroundMonitorState(h.store.current), { aggregateProgress: true });
  h.setRetrieve(async () => provider('in_progress'));
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.progress_percentage, 12);
});

test('the global job expiry stops further generation while retaining saved results and provider ID', async () => {
  const h = harness(row({ expires_at: new Date(startTime - 1).toISOString(), result_payload: { savedSteps: 12 } }));
  await monitorBackgroundJob(id, h.runtime);
  assert.equal(h.store.current.status, 'failed');
  assert.equal(h.store.current.provider_response_id, 'resp_original');
  assert.deepEqual(h.store.current.result_payload, { savedSteps: 12 });
  assert.equal(h.calls.retrieve.length, 0);
  assert.equal(h.calls.dispatch.length, 0);
});
