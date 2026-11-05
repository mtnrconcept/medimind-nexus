import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { runGraphResearch, recoveredGraphResult, type GraphResearchOptions } from '../src/lib/graphResearch.ts';
import { readAIJobReference, saveAIJobReference } from '../src/lib/aiJobRecovery.ts';
import type { AIToolStatus } from '../src/lib/aiTransport.ts';

const input = { topic: 'Synthetic condition', pathologies: ['Synthetic condition'], include_fda: false };
const graph = { nodes: [{ id: 'synthetic-node' }], edges: [], research_summary: 'Synthetic result' };
const networkError = () => Object.assign(new Error('Failed to fetch'), { name: 'FunctionsFetchError' });
function fixture(t: TestContext) {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => values.delete(key), key: (index: number) => [...values.keys()][index], get length() { return values.size; },
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : Reflect.deleteProperty(globalThis, 'localStorage'));
  const options: GraphResearchOptions = { userId: 'synthetic-owner', scopeKey: 'graph-test-' + crypto.randomUUID(),
    observation: { initialDelayMs: 1, maxDelayMs: 1, maxWaitMs: 1000, statusRequestTimeoutMs: 100 } };
  const scope = { userId: options.userId, key: options.scopeKey };
  return { options, scope, values, reference: () => readAIJobReference('deep-research-graph', scope) };
}
function completed(): AIToolStatus {
  return { job: { id: 'legacy-job', function_name: 'deep-research-graph', status: 'completed',
    result_payload: { httpStatus: 200, contentType: 'application/json', body: JSON.stringify(graph) } } };
}

test('graph request ID is persisted before POST and double clicks share one admission', async t => {
  const f = fixture(t);
  const starts: Record<string, unknown>[] = [];
  let statuses = 0;
  const invoke = async (name: string, raw: unknown) => {
    assert.equal(name, 'deep-research-graph');
    const body = raw as Record<string, unknown>;
    if (body.action === 'status') {
      statuses++;
      return { data: { job: { status: 'completed', result_payload: graph } }, error: null };
    }
    starts.push(body);
    assert.equal((await f.reference())?.requestId, body.requestId);
    assert.equal(body.async, true);
    assert.equal(body.streaming, false);
    assert.notEqual(body.requestId, 'forged-client-id');
    return { data: { job: { id: 'native-job', token: body.requestId, status: 'queued' } }, error: null };
  };
  const [first, second] = await Promise.all([
    runGraphResearch(invoke, { ...input, requestId: 'forged-client-id' }, f.options),
    runGraphResearch(invoke, { ...input, requestId: 'forged-client-id' }, f.options),
  ]);
  assert.deepEqual(first, graph);
  assert.deepEqual(second, graph);
  assert.equal(starts.length, 1);
  assert.equal(statuses, 1);
  assert.equal((await f.reference())?.completed, true);
  assert.ok([...f.values.values()].every(value => !value.includes(input.topic) && !value.includes(graph.research_summary)));
});

test('lost start acknowledgement keeps the same request ID; a later successful explicit launch gets a new one', async t => {
  const f = fixture(t);
  const starts: string[] = [];
  const accepted = new Map<string, string>();
  let lost = true, legacyLookups = 0;
  const options = { ...f.options, async recoveryByRequest() {
    legacyLookups++;
    throw Object.assign(new Error('Not a legacy broker request'), { status: 404 });
  } };
  const invoke = async (_name: string, raw: unknown) => {
    const body = raw as Record<string, unknown>;
    if (body.action === 'status') return { data: { job: { status: 'completed', result_payload: graph } }, error: null };
    const requestId = String(body.requestId);
    starts.push(requestId);
    if (!accepted.has(requestId)) accepted.set(requestId, crypto.randomUUID());
    if (lost) { lost = false; throw networkError(); }
    return { data: { job: { id: accepted.get(requestId), token: requestId, status: 'queued' } }, error: null };
  };
  await assert.rejects(runGraphResearch(invoke, input, options), /Failed to fetch/);
  assert.notEqual((await f.reference())?.completed, true);
  assert.equal(starts.length, 1);
  assert.deepEqual(await runGraphResearch(invoke, input, options), graph);
  assert.equal(legacyLookups, 1, 'Check the old broker before replaying native admission with the same UUID.');
  assert.equal(starts[0], starts[1]);
  assert.equal(accepted.size, 1);
  await runGraphResearch(invoke, input, options);
  assert.notEqual(starts[2], starts[1]);
  assert.equal(accepted.size, 2);
});

test('aborting one view neither cancels the server nor interrupts another observer of the same graph', async t => {
  const f = fixture(t);
  const controller = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const actions: Record<string, unknown>[] = [];
  const invoke = async (_name: string, raw: unknown) => {
    const body = raw as Record<string, unknown>;
    actions.push(body);
    if (body.action === 'status') { await gate; return { data: { job: { status: 'completed', result_payload: graph } }, error: null }; }
    return { data: { job: { id: 'observed-job', token: body.requestId, status: 'queued' } }, error: null };
  };
  const first = runGraphResearch(invoke, input, { ...f.options, signal: controller.signal });
  const second = runGraphResearch(invoke, input, f.options);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await new Promise(resolve => setTimeout(resolve, 15));
  controller.abort();
  await rejected;
  release();
  assert.deepEqual(await second, graph);
  assert.equal(actions.filter(action => !action.action).length, 1);
  assert.equal(actions.some(action => action.action === 'cancel'), false);
});

test('detaching the only view during an unacknowledged POST preserves its reference for a safe retry', async t => {
  const f = fixture(t);
  const controller = new AbortController();
  let requestId: unknown;
  let entered!: () => void;
  const posted = new Promise<void>(resolve => { entered = resolve; });
  const pending = runGraphResearch(async (_name, raw) => {
    requestId = (raw as Record<string, unknown>).requestId;
    entered();
    return new Promise<{ data: unknown; error: unknown }>(() => {});
  }, input, { ...f.options, signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await posted;
  controller.abort();
  await rejected;
  assert.equal((await f.reference())?.requestId, requestId);
  assert.notEqual((await f.reference())?.completed, true);
  const result = await runGraphResearch(async (_name, raw) => {
    const body = raw as Record<string, unknown>;
    assert.equal(body.requestId, requestId);
    return { data: graph, error: null };
  }, input, f.options);
  assert.deepEqual(result, graph);
});

test('legacy native ID without a token is recovered through authenticated activity, never a new POST', async t => {
  const f = fixture(t);
  await saveAIJobReference({ functionName: 'deep-research-graph', id: 'legacy-job', createdAt: Date.now() }, f.scope);
  let reads = 0;
  const result = await runGraphResearch(async () => { assert.fail('A saved job must not start a new generation.'); }, input, {
    ...f.options, async recoveryStatus(id, owner, after) {
      reads++;
      assert.equal(id, 'legacy-job'); assert.equal(owner, f.options.userId); assert.equal(after, Number.MAX_SAFE_INTEGER);
      return completed();
    },
  });
  assert.deepEqual(result, graph);
  assert.equal(reads, 1);
  assert.equal((await f.reference())?.completed, true);
});

test('a legacy broker request with a lost acknowledgement is recovered before native admission', async t => {
  const f = fixture(t), requestId = crypto.randomUUID();
  await saveAIJobReference({ functionName: 'deep-research-graph', requestId, createdAt: Date.now() }, f.scope);
  const result = await runGraphResearch(async () => { assert.fail('A saved broker request must not start a native generation.'); }, input, {
    ...f.options, async recoveryByRequest(id, owner) {
      assert.equal(id, requestId); assert.equal(owner, f.options.userId);
      return { job: { id: 'legacy-job', function_name: 'deep-research-graph', status: 'processing' } };
    }, async recoveryStatus() { return completed(); },
  });
  assert.deepEqual(result, graph);
  assert.equal((await f.reference())?.id, 'legacy-job');
  assert.equal((await f.reference())?.completed, true);
});

test('legacy graph SSE reconstruction preserves node, edge and completion metadata', () => {
  const status = completed();
  status.job.result_payload = { httpStatus: 200, contentType: 'text/event-stream', body: [
    { type: 'node', node: { id: 'one', label: 'Synthetic node' } },
    { type: 'edges', edges: [{ source_id: 'one', target_id: 'existing' }] },
    { type: 'complete', success: true, research_summary: 'Synthetic preserved summary', limitations: ['Synthetic limitation'] },
  ].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') };
  assert.deepEqual(recoveredGraphResult(status), { success: true, research_summary: 'Synthetic preserved summary',
    limitations: ['Synthetic limitation'], nodes: [{ id: 'one', label: 'Synthetic node' }], edges: [{ source_id: 'one', target_id: 'existing' }] });
});

test('recovery outages retain the prior reference and never fall through to a new generation', async t => {
  const f = fixture(t);
  await saveAIJobReference({ functionName: 'deep-research-graph', id: 'legacy-job', createdAt: Date.now() }, f.scope);
  await assert.rejects(runGraphResearch(async () => { assert.fail('Recovery failure must never start another job.'); }, input, {
    ...f.options, async recoveryStatus() { throw networkError(); },
  }), /Failed to fetch/);
  assert.equal((await f.reference())?.id, 'legacy-job');
  assert.notEqual((await f.reference())?.completed, true);
});

test('terminal native failure permits an explicit new launch, authorization errors do not', async t => {
  const f = fixture(t);
  const ids: unknown[] = [];
  let status: 'failed' | 'forbidden' | 'completed' = 'failed';
  const invoke = async (_name: string, raw: unknown) => {
    const body = raw as Record<string, unknown>;
    if (!body.action) {
      ids.push(body.requestId);
      return { data: { job: { id: 'native-job', token: body.requestId, status: 'queued' } }, error: null };
    }
    if (status === 'forbidden') return { data: null, error: Object.assign(new Error('Forbidden'), { status: 403 }) };
    return { data: { job: { id: 'native-job', status, error_message: 'Synthetic terminal failure', result_payload: status === 'completed' ? graph : null } }, error: null };
  };
  await assert.rejects(runGraphResearch(invoke, input, f.options), /Synthetic terminal failure/);
  assert.equal((await f.reference())?.completed, true);
  status = 'forbidden';
  await assert.rejects(runGraphResearch(invoke, input, f.options), /Forbidden/);
  assert.notEqual(ids[0], ids[1]);
  assert.notEqual((await f.reference())?.completed, true);
  status = 'completed';
  assert.deepEqual(await runGraphResearch(invoke, input, f.options), graph);
  assert.equal(ids.length, 2, 'An interrupted status read resumes that job without another start.');
});

test('pending references cannot be reused for a different payload in the same UI scope', async t => {
  const f = fixture(t);
  await assert.rejects(runGraphResearch(async () => { throw networkError(); }, input, f.options));
  await assert.rejects(runGraphResearch(async () => { assert.fail('A changed payload needs its own scope or explicit completed relaunch.'); },
    { ...input, topic: 'Different synthetic condition' }, f.options), error => (error as { status?: number }).status === 409);
});

test('disabled browser storage still keeps the in-memory admission UUID after a network failure', async t => {
  const f = fixture(t);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage disabled'); } });
  const requestIds: unknown[] = [];
  let lose = true;
  const invoke = async (_name: string, raw: unknown) => {
    requestIds.push((raw as Record<string, unknown>).requestId);
    if (lose) { lose = false; throw networkError(); }
    return { data: graph, error: null };
  };
  await assert.rejects(runGraphResearch(invoke, input, f.options), /Failed to fetch/);
  await runGraphResearch(invoke, input, f.options);
  assert.equal(requestIds.length, 2);
  assert.equal(requestIds[0], requestIds[1]);
});

test('a recovered reference for another tool never becomes a graph result or a replacement start', async t => {
  const f = fixture(t);
  await saveAIJobReference({ functionName: 'deep-research-graph', id: 'legacy-job', createdAt: Date.now() }, f.scope);
  await assert.rejects(runGraphResearch(async () => { assert.fail('Reference collision must not start another job.'); }, input, {
    ...f.options, async recoveryStatus() { return { job: { ...completed().job, function_name: 'another-function' } }; },
  }), error => (error as { status?: number }).status === 409);
  assert.notEqual((await f.reference())?.completed, true);
});

test('a status 404 allows a new explicit launch only after read-only admission proves this job expired', async t => {
  const f = fixture(t), oldRequestId = crypto.randomUUID();
  await saveAIJobReference({ functionName: 'deep-research-graph', id: 'expired-job', requestId: oldRequestId, createdAt: Date.now() }, f.scope);
  const calls: Record<string, unknown>[] = [];
  const invoke = async (_name: string, raw: unknown) => {
    const body = raw as Record<string, unknown>;
    calls.push(body);
    if (body.action === 'admission.status') return { data: null, error: Object.assign(new Error('Verified expiry'), { status: 410 }) };
    return { data: graph, error: null };
  };
  const options = { ...f.options, async recoveryStatus(): Promise<AIToolStatus> { throw Object.assign(new Error('Not found'), { status: 404 }); } };
  await assert.rejects(runGraphResearch(invoke, input, options), error => (error as { status?: number }).status === 410);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'admission.status');
  assert.equal(calls[0].requestId, oldRequestId);
  assert.equal((await f.reference())?.completed, true);
  await runGraphResearch(invoke, input, options);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].action, undefined);
  assert.notEqual(calls[1].requestId, oldRequestId);
});

test('ambiguous missing, forbidden or unavailable admission lookups retain the reference without a new launch', async t => {
  for (const lookupStatus of [403, 404, 503]) await t.test(String(lookupStatus), async st => {
    const f = fixture(st), requestId = crypto.randomUUID();
    await saveAIJobReference({ functionName: 'deep-research-graph', id: 'saved-job', requestId, createdAt: Date.now() }, f.scope);
    const calls: Record<string, unknown>[] = [];
    await assert.rejects(runGraphResearch(async (_name, raw) => {
      const body = raw as Record<string, unknown>;
      calls.push(body);
      assert.equal(body.action, 'admission.status');
      return { data: null, error: Object.assign(new Error('Unproven expiry'), { status: lookupStatus }) };
    }, input, { ...f.options,
      async recoveryStatus() { throw Object.assign(new Error('Ambiguous status'), { status: 404 }); },
    }), error => (error as { status?: number }).status === lookupStatus);
    assert.equal(calls.length, 1);
    assert.equal((await f.reference())?.requestId, requestId);
    assert.notEqual((await f.reference())?.completed, true);
  });
});

test('switching from account A to B during asynchronous setup prevents any graph submission', async t => {
  const f = fixture(t);
  let currentOwner = f.options.userId, checks = 0;
  const options = { ...f.options, async assertOwner(expected: string) {
    if (currentOwner !== expected) throw Object.assign(new Error('Session owner changed'), { status: 401 });
    if (++checks === 1) queueMicrotask(() => { currentOwner = 'another-account'; });
  } };
  await assert.rejects(runGraphResearch(async () => { assert.fail('The parameters captured under A must not be submitted under B.'); },
    input, options), error => (error as { status?: number }).status === 401);
  assert.notEqual((await f.reference())?.completed, true);
});

test('a graph response received after an account switch is never returned or marked completed', async t => {
  const f = fixture(t);
  let currentOwner = f.options.userId, calls = 0;
  const options = { ...f.options, async assertOwner(expected: string) {
    if (currentOwner !== expected) throw Object.assign(new Error('Session owner changed'), { status: 401 });
  } };
  await assert.rejects(runGraphResearch(async () => {
    calls++;
    currentOwner = 'another-account';
    return { data: graph, error: null };
  }, input, options), error => (error as { status?: number }).status === 401);
  assert.equal(calls, 1);
  assert.notEqual((await f.reference())?.completed, true);
});

test('account checks also surround native status polling and legacy result recovery', async t => {
  for (const legacy of [false, true]) await t.test(legacy ? 'legacy recovery' : 'native polling', async st => {
    const f = fixture(st);
    let currentOwner = f.options.userId;
    const options: GraphResearchOptions = { ...f.options, async assertOwner(expected) {
      if (currentOwner !== expected) throw Object.assign(new Error('Session owner changed'), { status: 401 });
    } };
    if (legacy) {
      await saveAIJobReference({ functionName: 'deep-research-graph', id: 'legacy-job', createdAt: Date.now() }, f.scope);
      options.recoveryStatus = async () => { currentOwner = 'another-account'; return completed(); };
    }
    await assert.rejects(runGraphResearch(async (_name, raw) => {
      assert.equal(legacy, false, 'Legacy recovery must never create another job.');
      const body = raw as Record<string, unknown>;
      if (!body.action) return { data: { job: { id: 'native-job', token: body.requestId, status: 'queued' } }, error: null };
      currentOwner = 'another-account';
      return { data: { job: { status: 'completed', result_payload: graph } }, error: null };
    }, input, options), error => (error as { status?: number }).status === 401);
    assert.notEqual((await f.reference())?.completed, true);
  });
});

test('local graph execution remains independent of any cloud session or recovery endpoint', async t => {
  const f = fixture(t);
  const result = await runGraphResearch(async () => ({ data: graph, error: null }), input, {
    ...f.options, userId: 'local-research',
    async recoveryStatus() { assert.fail('A new local run must not read cloud activity.'); },
    async recoveryByRequest() { assert.fail('A new local run must not read cloud activity.'); },
  });
  assert.deepEqual(result, graph);
});
