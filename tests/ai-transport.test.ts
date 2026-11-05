import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createAITransport, type AIToolSession } from '../src/lib/aiTransport.ts';
import { clearAIJobReferences, readAIJobReference, saveAIJobReference } from '../src/lib/aiJobRecovery.ts';

const base = 'https://medicore.invalid';
const meta = { id: 'job-1', function_name: 'ai-assistant', status: 'processing' };
const final = (body: unknown) => ({ job: { ...meta, status: 'completed', result_payload: { httpStatus: 200, contentType: 'application/json', body: JSON.stringify(body) } } });

function memoryStorage(t: TestContext, onWrite?: (value: string) => void) {
  const entries = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return entries.size; },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); onWrite?.(value); },
    removeItem: (key: string) => entries.delete(key),
  } });
  t.after(() => original ? Object.defineProperty(globalThis, 'localStorage', original) : Reflect.deleteProperty(globalThis, 'localStorage'));
  return entries;
}

function options(fetcher: typeof fetch, getSession = async (): Promise<AIToolSession | null> => ({ userId: 'owner-a', accessToken: 'current-user-jwt' })) {
  return { supabaseUrl: base, publicKey: 'public-key', getSession, fetcher, pollIntervalMs: 1, requestTimeoutMs: 100, maxWaitMs: 1000 };
}
const input = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer obsolete-anon-key' }, body: JSON.stringify({ message: 'private clinical request' }) };

test('durable JSON uses the current user JWT, retries only status and preserves the original payload contract', async t => {
  const stored = memoryStorage(t);
  let starts = 0, statuses = 0;
  const transport = createAITransport(options(async (url, init) => {
    const request = new Request(url, init);
    assert.equal(request.headers.get('authorization'), 'Bearer current-user-jwt');
    assert.equal(new URL(request.url).pathname, '/functions/v1/ai-tool-jobs');
    if (request.method === 'POST') {
      starts += 1;
      assert.deepEqual(await request.json(), { message: 'private clinical request' });
      return Response.json({ job: meta }, { status: 202 });
    }
    statuses += 1;
    if (statuses === 1) return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    return Response.json(final({ content: 'finished' }));
  }));
  const result = await transport.fetch(base + '/functions/v1/ai-assistant', input);
  assert.deepEqual(await result.json(), { content: 'finished' });
  assert.equal(starts, 1);
  assert.equal(statuses, 2);
  const persisted = JSON.stringify([...stored]);
  assert.ok(!persisted.includes('private clinical request'));
  assert.ok(!persisted.includes('current-user-jwt'));
  assert.ok(!persisted.includes('finished'));
});

test('concurrent identical submissions share a start and create separate readable responses', async t => {
  memoryStorage(t);
  let starts = 0;
  const transport = createAITransport(options(async (url, init) => {
    if (new Request(url, init).method === 'POST') {
      starts += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return Response.json({ job: meta }, { status: 202 });
    }
    return Response.json(final({ ok: true }));
  }));
  const responses = await Promise.all([transport.fetch(base + '/functions/v1/ai-assistant', input), transport.fetch(base + '/functions/v1/ai-assistant', input)]);
  assert.equal(starts, 1);
  assert.deepEqual(await Promise.all(responses.map(response => response.json())), [{ ok: true }, { ok: true }]);
});

test('multipart retries keep identical bytes, boundary and idempotency key', async t => {
  memoryStorage(t);
  const bytes: Uint8Array[] = [], boundaries: string[] = [], requestIds: string[] = [];
  const transport = createAITransport(options(async (url, init) => {
    const request = new Request(url, init);
    const query = new URL(request.url).searchParams;
    if (request.method === 'POST') {
      bytes.push(new Uint8Array(await request.arrayBuffer()));
      boundaries.push(request.headers.get('content-type')!);
      requestIds.push(request.headers.get('x-ai-request-id')!);
      if (bytes.length === 1) throw new TypeError('Failed to fetch');
      return Response.json({ job: { ...meta, function_name: 'document-analyzer' } }, { status: 202 });
    }
    if (query.has('requestId')) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json(final({ integrated: [] }));
  }));
  const body = new FormData();
  body.append('documentId', 'opaque-document-reference');
  body.append('file', new Blob(['synthetic document'], { type: 'text/plain' }), 'synthetic.txt');
  const response = await transport.fetch(base + '/functions/v1/document-analyzer', { method: 'POST', body });
  assert.equal(response.status, 200);
  assert.equal(bytes.length, 2);
  assert.deepEqual(bytes[0], bytes[1]);
  assert.equal(boundaries[0], boundaries[1]);
  assert.equal(requestIds[0], requestIds[1]);
});

test('SSE events replay once in sequence and remain readable before server completion', async t => {
  memoryStorage(t);
  let statuses = 0;
  const frames = ['data: {"choices":[{"delta":{"content":"First "}}]}\n\n', 'data: {"choices":[{"delta":{"content":"second"}}]}\n\n', 'data: [DONE]\n\n'];
  const transport = createAITransport(options(async (url, init) => {
    const request = new Request(url, init);
    if (request.method === 'POST') return Response.json({ job: meta }, { status: 202 });
    const cursor = Number(new URL(request.url).searchParams.get('after'));
    statuses += 1;
    if (!cursor) return Response.json({ job: meta, events: [{ seq: 1, data: frames[0] }], nextCursor: 1 });
    assert.equal(cursor, 1);
    return Response.json({ job: { ...meta, status: 'completed', result_payload: { httpStatus: 200, contentType: 'text/event-stream', body: frames.join('') } }, events: [{ seq: 1, data: frames[0] }, { seq: 2, data: frames[1] }, { seq: 3, data: frames[2] }], nextCursor: 3 });
  }));
  const response = await transport.fetch(base + '/functions/v1/ai-assistant', input);
  assert.match(response.headers.get('content-type')!, /text\/event-stream/);
  assert.equal(statuses, 1);
  assert.equal(await response.text(), frames.join(''));
});

test('a server failure after partial SSE data is not reported as a completed stream', async t => {
  memoryStorage(t);
  let reads = 0;
  const transport = createAITransport(options(async (url, init) => {
    if (new Request(url, init).method === 'POST') return Response.json({ job: meta }, { status: 202 });
    reads += 1;
    return reads === 1
      ? Response.json({ job: meta, events: [{ seq: 1, data: 'data: {"text":"partial"}\n\n' }] })
      : Response.json({ job: { ...meta, status: 'failed', error_message: 'Output incomplete' }, events: [] });
  }));
  const response = await transport.fetch(base + '/functions/v1/ai-assistant', input);
  await assert.rejects(response.text(), /Output incomplete/);
});

test('abort detaches the client and a new transport resumes the accepted job without submitting again', async t => {
  memoryStorage(t);
  const controller = new AbortController();
  let starts = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (new Request(url, init).method === 'POST') {
      starts += 1;
      return Response.json({ job: meta }, { status: 202 });
    }
    if (!controller.signal.aborted) { controller.abort(); return Response.json({ job: meta }); }
    return Response.json(final({ restored: true }));
  };
  const first = createAITransport(options(fetcher));
  await assert.rejects(first.fetch(base + '/functions/v1/ai-assistant', { ...input, signal: controller.signal }), { name: 'AbortError' });
  const restored = createAITransport(options(fetcher));
  const response = await restored.fetch(base + '/functions/v1/ai-assistant', input);
  assert.deepEqual(await response.json(), { restored: true });
  assert.equal(starts, 1);
});

test('switching accounts while a result is in flight never returns the old account result', async t => {
  memoryStorage(t);
  let owner = 'owner-a';
  const transport = createAITransport(options(async (url, init) => {
    if (new Request(url, init).method === 'POST') return Response.json({ job: meta }, { status: 202 });
    owner = 'owner-b';
    return Response.json(final({ private: 'belongs to A' }));
  }, async () => ({ userId: owner, accessToken: owner + '-jwt' })));
  await assert.rejects(transport.fetch(base + '/functions/v1/ai-assistant', input), error => (error as { status?: number }).status === 401);
});

test('native jobs, database/auth calls and other origins pass through without another broker', async () => {
  let sessionReads = 0;
  const direct: string[] = [];
  const transport = createAITransport(options(async input => { direct.push(String(input)); return Response.json({ direct: true }); }, async () => { sessionReads += 1; return null; }));
  for (const url of [base + '/functions/v1/cross-data-analyzer', base + '/functions/v1/deep-research-graph', base + '/rest/v1/patients', 'https://external.invalid/functions/v1/ai-assistant']) {
    assert.deepEqual(await (await transport.fetch(url, input)).json(), { direct: true });
  }
  assert.equal(direct.length, 4);
  assert.equal(sessionReads, 0);
});

test('request reference recovery reads with the current owner and rejects an account switch during the response', async () => {
  let owner = 'owner-a';
  const requestId = crypto.randomUUID();
  const transport = createAITransport(options(async (url, init) => {
    const request = new Request(url, init);
    const params = new URL(request.url).searchParams;
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.get('authorization'), 'Bearer owner-a-jwt');
    assert.equal(params.get('action'), 'status');
    assert.equal(params.get('requestId'), requestId);
    assert.equal(params.get('after'), '0');
    owner = 'owner-b';
    return Response.json(final({ private: 'belongs to A' }));
  }, async () => ({ userId: owner, accessToken: owner + '-jwt' })));
  await assert.rejects(transport.statusByRequest(requestId, 'owner-a'), error => (error as { status?: number }).status === 401);
});

test('recovery references are isolated by user and cleared when that user signs out', async t => {
  const persisted = memoryStorage(t);
  const reference = { functionName: 'ai-assistant', id: 'opaque-job', createdAt: Date.now() };
  await saveAIJobReference(reference, { userId: 'owner-a', key: 'potentially sensitive scope' });
  assert.equal((await readAIJobReference('ai-assistant', { userId: 'owner-a', key: 'potentially sensitive scope' }))?.id, 'opaque-job');
  assert.equal(await readAIJobReference('ai-assistant', { userId: 'owner-b', key: 'potentially sensitive scope' }), null);
  assert.ok(!JSON.stringify([...persisted]).includes('potentially sensitive scope'));
  clearAIJobReferences('owner-a');
  assert.equal(await readAIJobReference('ai-assistant', { userId: 'owner-a', key: 'potentially sensitive scope' }), null);
});

test('a lost start acknowledgement is recovered by request ID without repeating the paid start', async t => {
  memoryStorage(t);
  let starts = 0;
  let requestId = '';
  const transport = createAITransport(options(async (url, init) => {
    const request = new Request(url, init);
    const params = new URL(request.url).searchParams;
    if (request.method === 'POST') {
      starts += 1;
      requestId = request.headers.get('x-ai-request-id')!;
      throw new TypeError('Failed to fetch');
    }
    if (params.has('requestId')) {
      assert.equal(params.get('requestId'), requestId);
      return Response.json({ job: meta });
    }
    return Response.json(final({ recovered: true }));
  }));
  const response = await transport.fetch(base + '/functions/v1/ai-assistant', input);
  assert.deepEqual(await response.json(), { recovered: true });
  assert.equal(starts, 1);
});

test('identical input from different callers cannot attach to the other caller task', async t => {
  memoryStorage(t);
  const scopes: string[] = [];
  const transport = createAITransport(options(async (url, init) => {
    const request = new Request(url, init);
    if (request.method === 'POST') {
      scopes.push(request.headers.get('x-ai-scope')!);
      return Response.json({ job: { ...meta, id: 'job-' + scopes.length } }, { status: 202 });
    }
    return Response.json(final({ ok: true }));
  }));
  await Promise.all(['caller-a', 'caller-b'].map(caller => transport.fetch(base + '/functions/v1/ai-assistant', {
    ...input, headers: { ...input.headers, 'x-ai-scope': caller },
  })));
  assert.deepEqual(scopes.sort(), ['caller-a', 'caller-b']);
});

test('a recreated multipart form reattaches after remount even though its boundary has changed', async t => {
  memoryStorage(t);
  const controller = new AbortController();
  let starts = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (new Request(url, init).method === 'POST') {
      starts += 1;
      return Response.json({ job: { ...meta, function_name: 'document-analyzer' } }, { status: 202 });
    }
    if (!controller.signal.aborted) { controller.abort(); return Response.json({ job: meta }); }
    return Response.json(final({ restored: true }));
  };
  const form = () => {
    const body = new FormData();
    body.append('documentId', 'opaque-document-reference');
    body.append('file', new Blob(['same synthetic document'], { type: 'text/plain' }), 'synthetic.txt');
    return body;
  };
  await assert.rejects(createAITransport(options(fetcher)).fetch(base + '/functions/v1/document-analyzer', {
    method: 'POST', body: form(), signal: controller.signal,
  }), { name: 'AbortError' });
  const restored = await createAITransport(options(fetcher)).fetch(base + '/functions/v1/document-analyzer', { method: 'POST', body: form() });
  assert.deepEqual(await restored.json(), { restored: true });
  assert.equal(starts, 1);
});

test('an authoritative broker authorization failure is never retried as a network outage', async t => {
  memoryStorage(t);
  let requests = 0;
  const transport = createAITransport(options(async () => {
    requests += 1;
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }));
  await assert.rejects(transport.fetch(base + '/functions/v1/ai-assistant', input), error => (error as { status?: number }).status === 403);
  assert.equal(requests, 1);
});

test('an account switch during asynchronous completion storage cannot release the previous JSON result', async t => {
  let owner = 'owner-a';
  memoryStorage(t, value => { if (JSON.parse(value).completed) owner = 'owner-b'; });
  const transport = createAITransport(options(async (url, init) => new Request(url, init).method === 'POST'
    ? Response.json({ job: meta }, { status: 202 }) : Response.json(final({ private: 'account-a-only' })),
  async () => ({ userId: owner, accessToken: owner + '-jwt' })));
  await assert.rejects(transport.fetch(base + '/functions/v1/ai-assistant', input), error => (error as { status?: number }).status === 401);
});

test('an account switch during completion cannot release a saved SSE body', async t => {
  let owner = 'owner-a';
  memoryStorage(t, value => { if (JSON.parse(value).completed) owner = 'owner-b'; });
  const transport = createAITransport(options(async (url, init) => new Request(url, init).method === 'POST'
    ? Response.json({ job: meta }, { status: 202 }) : Response.json({ job: { ...meta, status: 'completed', result_payload: {
      httpStatus: 200, contentType: 'text/event-stream', body: 'data: {"type":"text","content":"account-a-only"}\n\ndata: [DONE]\n\n',
    } }, events: [] }), async () => ({ userId: owner, accessToken: owner + '-jwt' })));
  const response = await transport.fetch(base + '/functions/v1/ai-assistant', input);
  await assert.rejects(response.text(), error => (error as { status?: number }).status === 401);
});

test('a stale caller token cannot submit its previous account payload using a new account session', async t => {
  memoryStorage(t);
  let requests = 0;
  const staleToken = btoa('{}') + '.' + btoa(JSON.stringify({ sub: 'owner-a', role: 'authenticated' })) + '.untrusted-signature';
  const transport = createAITransport(options(async () => { requests += 1; return Response.json(final({ ok: true })); },
    async () => ({ userId: 'owner-b', accessToken: 'owner-b-jwt' })));
  await assert.rejects(transport.fetch(base + '/functions/v1/ai-assistant', {
    ...input, headers: { ...input.headers, Authorization: 'Bearer ' + staleToken },
  }), error => (error as { status?: number }).status === 401);
  assert.equal(requests, 0);
});

test('an activity listener cannot turn an accepted server task into a failed request', async t => {
  memoryStorage(t);
  let starts = 0;
  const transport = createAITransport(options(async (url, init) => {
    if (new Request(url, init).method === 'POST') { starts += 1; return Response.json({ job: meta }, { status: 202 }); }
    return Response.json(final({ ok: true }));
  }));
  transport.subscribe(() => { throw new Error('Broken local observer'); });
  assert.deepEqual(await (await transport.fetch(base + '/functions/v1/ai-assistant', input)).json(), { ok: true });
  assert.equal(starts, 1);
});

test('a native mirrored job remains observed beyond the previous five-minute timer without another start', async t => {
  memoryStorage(t);
  let now = 0;
  let statuses = 0;
  const progress: string[] = [];
  t.mock.method(Date, 'now', () => now);
  const transport = createAITransport({ ...options(async (url, init) => {
    const request = new Request(url, init);
    assert.equal(request.method, 'GET');
    assert.equal(new URL(request.url).searchParams.get('jobId'), 'native-job');
    statuses += 1;
    if (statuses === 1) { now += 6 * 60 * 1000; return Response.json({ job: { ...meta, stalled: true } }); }
    return Response.json(final({ hypothesis_id: 'saved-hypothesis' }));
  }), maxWaitMs: 60 * 60 * 1000 });
  const result = await transport.observe('native-job', { owner: 'owner-a', onProgress: job => progress.push(job.status) });
  assert.deepEqual(result, { hypothesis_id: 'saved-hypothesis' });
  assert.deepEqual(progress, ['processing', 'completed']);
  assert.equal(statuses, 2);
});

test('a batch submits its complete manifest once and resumes observation without persisting URLs', async t => {
  const stored = memoryStorage(t);
  let starts = 0;
  let stopped = 0;
  let observing = false;
  const controller = new AbortController();
  const manifest = { mode: 'medications' as const, rateLimitMode: 'normal' as const, urls: ['https://medical.example.com/selected-one', 'https://medical.example.com/selected-two'] };
  const batchMeta = { ...meta, id: 'batch-1', function_name: 'medical-scraper', analysis_mode: 'scraper_batch' };
  const fetcher: typeof fetch = async (url, init) => {
    const request = new Request(url, init);
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'batch.start') {
      starts += 1;
      assert.deepEqual(await request.json(), manifest);
      return Response.json({ job: batchMeta }, { status: 202 });
    }
    if (action === 'batch.stop') { stopped += 1; return Response.json({ job: batchMeta }); }
    if (!observing) { observing = true; controller.abort(); return Response.json({ job: batchMeta }); }
    return Response.json({ job: { ...batchMeta, status: 'completed', result_payload: {
      httpStatus: 200, contentType: 'application/json', body: JSON.stringify({ finished: true, success: true, completed: 2 }),
    } } });
  };
  const first = createAITransport(options(fetcher));
  const receipt = await first.startBatch(manifest, { owner: 'owner-a' });
  await assert.rejects(first.observe(receipt.id, { owner: 'owner-a', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(stopped, 0, 'Detaching never requests a queue cancellation');
  const restored = createAITransport(options(fetcher));
  const resumed = await restored.startBatch(manifest, { owner: 'owner-a' });
  assert.equal(resumed.id, receipt.id);
  assert.deepEqual(await restored.observe(resumed.id, { owner: 'owner-a' }), { finished: true, success: true, completed: 2 });
  assert.equal(starts, 1);
  assert.ok(!JSON.stringify([...stored]).includes('selected-one'));
  await restored.stopBatch(resumed.id, { owner: 'owner-a' });
  assert.equal(stopped, 1, 'Only an explicit stop sends the queue mutation');
});

test('batch failures publish their saved counters to the observer without being returned as success', async t => {
  memoryStorage(t);
  let partial: unknown;
  const transport = createAITransport(options(async () => Response.json({ job: {
    ...meta, status: 'failed', analysis_mode: 'scraper_batch', error_message: 'Import arrêté.', result_payload: {
      httpStatus: 200, contentType: 'application/json', body: JSON.stringify({ finished: true, success: false, stopped: true, completed: 1, failed: 0, skipped: 4 }),
    },
  } })));
  await assert.rejects(transport.observe('batch-stopped', {
    owner: 'owner-a', onProgress: job => { partial = JSON.parse(job.result_payload!.body); },
  }), /Import arrêté/);
  assert.deepEqual(partial, { finished: true, success: false, stopped: true, completed: 1, failed: 0, skipped: 4 });
});
