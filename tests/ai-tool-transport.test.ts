import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createToolTransport, type JobStore, type TransportDependencies } from '../supabase/functions/ai-tool-jobs/handler.ts';
import { SSEFrames, TRANSPORT_MODE, type ToolEvent, type ToolJob } from '../supabase/functions/ai-tool-jobs/protocol.ts';

const requestId = 'a4279601-8a0f-4ef1-8acf-ac2f7a86a003';
class MemoryStore implements JobStore {
  rows = new Map<string, ToolJob>();
  frames = new Map<string, ToolEvent[]>();
  async create(input: Record<string, unknown>) {
    if ([...this.rows.values()].some(job => job.public_token === input.public_token)) throw new Error('duplicate');
    const job = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      result_payload: null, error_message: null, ...input } as ToolJob;
    this.rows.set(job.id, job);
    return structuredClone(job);
  }
  async byRequest(id: string, owner: string) {
    return structuredClone([...this.rows.values()].find(job => job.public_token === id && job.requested_by === owner) || null);
  }
  async get(id: string, owner: string) {
    const job = this.rows.get(id);
    return structuredClone(job?.requested_by === owner ? job : null);
  }
  async list(owner: string) { return structuredClone([...this.rows.values()].filter(job => job.requested_by === owner)); }
  async claim(id: string, owner: string) {
    const job = this.rows.get(id);
    if (job?.requested_by !== owner || job.status !== 'queued') return false;
    job.status = 'processing';
    return true;
  }
  async update(id: string, patch: Record<string, unknown>) { Object.assign(this.rows.get(id)!, patch); }
  async append(id: string, events: ToolEvent[]) { this.frames.set(id, [...this.frames.get(id) || [], ...events]); }
  async events(id: string, after: number, limit: number) { return (this.frames.get(id) || []).filter(e => e.seq > after).slice(0, limit); }
}

function setup(upstream: TransportDependencies['upstream'], workerTimeoutMs?: number) {
  const store = new MemoryStore();
  const work: Promise<void>[] = [];
  let calls = 0;
  const handler = createToolTransport({
    store, authenticate: async token => token === 'alice' || token === 'bob' ? token : null,
    baseUrl: 'https://example.supabase.co', publishableKey: 'public-key',
    upstream: request => { calls++; return upstream(request); }, waitUntil: p => { work.push(p); },
    workerTimeoutMs,
  });
  return { store, work, handler, calls: () => calls };
}
function start(body = { message: 'Synthetic fixture' }, id = requestId) {
  return new Request('https://example.supabase.co/functions/v1/ai-tool-jobs?action=start&functionName=ai-assistant', {
    method: 'POST', headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json', 'x-ai-request-id': id },
    body: JSON.stringify(body),
  });
}
function status(id: string, owner = 'alice', after = 0) {
  return new Request(`https://example.supabase.co/functions/v1/ai-tool-jobs?action=status&jobId=${id}&after=${after}`, {
    headers: { Authorization: `Bearer ${owner}` },
  });
}
function lookup(id = requestId, owner = 'alice', after = 0) {
  return new Request(`https://example.supabase.co/functions/v1/ai-tool-jobs?action=lookup&requestId=${id}&after=${after}`, {
    headers: { Authorization: `Bearer ${owner}` },
  });
}
const jsonResponse = () => new Response(JSON.stringify({ content: 'Synthetic complete result' }), { headers: { 'content-type': 'application/json' } });

test('concurrent retries execute one upstream operation and recover the same job', async () => {
  const app = setup(async request => {
    assert.equal(request.headers.get('authorization'), 'Bearer alice');
    assert.equal(request.headers.get('apikey'), 'public-key');
    assert.equal(new URL(request.url).pathname, '/functions/v1/ai-assistant');
    return jsonResponse();
  });
  const responses = await Promise.all([app.handler(start()), app.handler(start())]);
  const [first, second] = await Promise.all(responses.map(response => response.json()));
  await Promise.all(app.work);
  assert.equal(first.job.id, second.job.id);
  assert.equal(app.calls(), 1);
  assert.equal(app.store.rows.size, 1);
  assert.equal((await (await app.handler(status(first.job.id))).json()).job.status, 'completed');
});

test('a reused request id with different input is rejected without another generation', async () => {
  const app = setup(async () => jsonResponse());
  await app.handler(start());
  await Promise.all(app.work);
  const response = await app.handler(start({ message: 'Different input' }));
  assert.equal(response.status, 409);
  assert.equal(app.calls(), 1);
});

test('sign-in is required and another user cannot read job or event contents', async () => {
  const app = setup(async () => jsonResponse());
  const { job } = await (await app.handler(start())).json();
  await Promise.all(app.work);
  assert.equal((await app.handler(status(job.id, 'bob'))).status, 404);
  assert.equal((await app.handler(status(job.id, 'invalid'))).status, 401);
  const payload = await (await app.handler(status(job.id))).json();
  assert.equal('public_token' in payload.job, false);
  assert.equal('request_payload' in payload.job, false);
  assert.equal('requested_by' in payload.job, false);
  const list = await app.handler(new Request('https://example.supabase.co/functions/v1/ai-tool-jobs?action=list', {
    headers: { Authorization: 'Bearer bob' },
  }));
  assert.deepEqual((await list.json()).jobs, []);
});

test('request lookups, including legacy recovery, treat absence as data while known-job status stays strict', async () => {
  const app = setup(async () => jsonResponse());
  const response = await app.handler(lookup());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { job: null });
  assert.equal((await app.handler(status(requestId))).status, 404);
  const legacy = await app.handler(new Request(lookup().url.replace('action=lookup', 'action=status'), lookup()));
  assert.equal(legacy.status, 200);
  assert.deepEqual(await legacy.json(), { job: null });
  const knownJob = await app.handler(new Request(lookup().url.replace('action=lookup', 'action=status') + '&jobId=' + crypto.randomUUID(), lookup()));
  assert.equal(knownJob.status, 404);
  assert.equal(app.calls(), 0);
  assert.equal(app.store.rows.size, 0);
});

test('request lookup recovers owned metadata without replaying results or executing the task twice', async () => {
  const app = setup(async () => new Response('data: {"type":"text","content":"Synthetic"}\n\ndata: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  }));
  const { job } = await (await app.handler(start())).json();
  await Promise.all(app.work);
  app.store.events = async () => { throw new Error('lookup must not read saved events'); };
  const response = await app.handler(lookup(requestId, 'alice', 1));
  assert.equal(response.status, 200);
  const recovered = await response.json();
  assert.equal(recovered.job.id, job.id);
  assert.equal(recovered.job.status, 'completed');
  assert.equal('events' in recovered, false);
  assert.equal('result_payload' in recovered.job, false);
  assert.equal('public_token' in recovered.job, false);
  assert.equal('request_payload' in recovered.job, false);
  assert.equal('requested_by' in recovered.job, false);
  const retried = await (await app.handler(start())).json();
  assert.equal(retried.job.id, job.id);
  assert.equal(app.calls(), 1);
});

test('lookup cannot distinguish another owner task from absence and still requires authentication', async () => {
  const app = setup(async () => jsonResponse());
  await app.handler(start());
  await Promise.all(app.work);
  const foreign = await app.handler(lookup(requestId, 'bob'));
  const absent = await app.handler(lookup(crypto.randomUUID(), 'bob'));
  assert.equal(foreign.status, 200);
  assert.equal(absent.status, 200);
  assert.deepEqual(await foreign.json(), await absent.json());
  assert.equal((await app.handler(lookup(requestId, 'invalid'))).status, 401);
  assert.equal((await app.handler(new Request(lookup().url))).status, 401);
  const legacyForeign = await app.handler(new Request(lookup(requestId, 'bob').url.replace('action=lookup', 'action=status'), lookup(requestId, 'bob')));
  assert.equal(legacyForeign.status, 200);
  assert.deepEqual(await legacyForeign.json(), { job: null });
  assert.equal(app.calls(), 1);
});

test('lookup rejects malformed or ambiguous identifiers, cursors and write methods', async () => {
  const app = setup(async () => jsonResponse());
  assert.equal((await app.handler(lookup('invalid'))).status, 400);
  assert.equal((await app.handler(lookup(requestId, 'alice', -1))).status, 400);
  assert.equal((await app.handler(new Request(lookup().url + '&jobId=' + crypto.randomUUID(), lookup()))).status, 400);
  assert.equal((await app.handler(new Request(lookup(), { method: 'POST' }))).status, 405);
  assert.equal(app.calls(), 0);
});

test('an unavailable lookup store remains a retryable failure, never a missing task', async () => {
  const app = setup(async () => jsonResponse());
  app.store.byRequest = async () => { throw new Error('synthetic store outage'); };
  const response = await app.handler(lookup());
  assert.equal(response.status, 503);
  assert.equal('job' in await response.json(), false);
  assert.equal(app.calls(), 0);
});

test('disconnecting the initiating request does not abort the server task', async () => {
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  let serverSignal: AbortSignal | undefined;
  const app = setup(async request => { serverSignal = request.signal; await ready; return jsonResponse(); });
  const client = new AbortController();
  const request = new Request(start(), { signal: client.signal });
  const { job } = await (await app.handler(request)).json();
  client.abort();
  assert.equal(serverSignal?.aborted, false);
  finish();
  await Promise.all(app.work);
  assert.equal((await app.store.get(job.id, 'alice'))?.status, 'completed');
});

test('fragmented UTF-8 SSE is replayed as ordered complete frames without duplication', async () => {
  const bytes = new TextEncoder().encode('data: {"type":"text","content":"Été"}\r\n\r\ndata: {"type":"done"}\n\n');
  const app = setup(async () => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } }));
  const { job } = await (await app.handler(start())).json();
  await Promise.all(app.work);
  const first = await (await app.handler(status(job.id))).json();
  assert.equal(first.job.status, 'completed');
  assert.equal(first.events.length, 2);
  assert.match(first.events[0].data, /Été/);
  const resumed = await (await app.handler(status(job.id, 'alice', 1))).json();
  assert.deepEqual(resumed.events.map((event: ToolEvent) => event.seq), [2]);
  assert.equal(resumed.nextCursor, 2);
  assert.equal(first.job.result_payload.body, new TextDecoder().decode(bytes));
});

for (const [label, output] of [
  ['cut stream', 'data: {"type":"text","content":"partial"}\n\n'],
  ['explicit failure', 'data: {"type":"error","message":"synthetic failure"}\n\ndata: [DONE]\n\n'],
] as const) test(`${label} preserves partial data without reporting success or retrying the operation`, async () => {
  const app = setup(async () => new Response(output, { headers: { 'content-type': 'text/event-stream' } }));
  const { job } = await (await app.handler(start())).json();
  await Promise.all(app.work);
  const result = await (await app.handler(status(job.id))).json();
  assert.equal(result.job.status, 'failed');
  assert.equal(result.job.result_payload.body, output);
  assert.equal(app.calls(), 1);
});

test('legacy HTTP 200 JSON errors remain failures', async () => {
  const app = setup(async () => new Response('{"error":"synthetic"}', { headers: { 'content-type': 'application/json' } }));
  const { job } = await (await app.handler(start())).json();
  await Promise.all(app.work);
  assert.equal((await app.store.get(job.id, 'alice'))?.status, 'failed');
});

test('internal worker names, invalid ids, cursor injection and oversized requests are rejected', async () => {
  const app = setup(async () => jsonResponse());
  const source = start();
  const internal = new Request(source.url.replace('functionName=ai-assistant', 'functionName=hypothesis-processor'), source);
  assert.equal((await app.handler(internal)).status, 400);
  const large = new Request(start(), { headers: { ...Object.fromEntries(start().headers), 'content-length': '13000000' } });
  assert.equal((await app.handler(large)).status, 413);
  assert.equal((await app.handler(status('invalid'))).status, 400);
  assert.equal((await app.handler(status(requestId, 'alice', -1))).status, 400);
  assert.equal(app.calls(), 0);
});

test('native owned jobs are discoverable without exposing their private status token', async () => {
  const app = setup(async () => jsonResponse());
  const job = await app.store.create({ public_token: requestId, requested_by: 'alice', function_name: 'deep-research',
    analysis_mode: 'research', status: 'completed', progress_percentage: 100, request_payload: {},
    result_payload: { summary: 'Synthetic native result' }, expires_at: null });
  const result = await (await app.handler(status(job.id))).json();
  assert.equal(JSON.parse(result.job.result_payload.body).summary, 'Synthetic native result');
  assert.equal(result.job.analysis_mode, 'research');
  assert.equal('public_token' in result.job, false);
  assert.deepEqual(result.events, []);
  assert.notEqual(job.analysis_mode, TRANSPORT_MODE);
});

test('named SSE done/error events and trailing terminal line are recognized', () => {
  const parser = new SSEFrames();
  assert.equal(parser.push('event: done\ndata: {}\n\n').length, 1);
  assert.equal(parser.complete, true);
  parser.push('event: error\ndata: {}\n\n');
  assert.equal(parser.failed, true);
  const trailing = new SSEFrames();
  trailing.push('data: [DONE]');
  trailing.finish();
  assert.equal(trailing.complete, true);
});

test('large SSE replay returns the complete saved body only on the last event page', async () => {
  const output = Array.from({ length: 205 }, (_, index) => 'data: ' + JSON.stringify({ type: 'text', content: String(index) }) + '\n\n').join('') + 'data: [DONE]\n\n';
  const app = setup(async () => new Response(output, { headers: { 'content-type': 'text/event-stream' } }));
  const { job } = await (await app.handler(start())).json();
  await Promise.all(app.work);
  const first = await (await app.handler(status(job.id))).json();
  assert.equal(first.hasMore, true);
  assert.equal(first.job.result_payload.contentType, 'text/event-stream');
  assert.equal(first.job.result_payload.body, '');
  const middle = await (await app.handler(status(job.id, 'alice', first.nextCursor))).json();
  assert.equal(middle.job.result_payload.body, '');
  const last = await (await app.handler(status(job.id, 'alice', middle.nextCursor))).json();
  assert.equal(last.hasMore, false);
  assert.equal(last.job.result_payload.body, output);
  assert.equal(first.events.length + middle.events.length + last.events.length, 206);
});

test('a continually active stream still stops before the worker lifetime and keeps its partial output', async () => {
  const app = setup(async request => new Response(new ReadableStream({
    start(controller) {
      const timer = setInterval(() => controller.enqueue(new TextEncoder().encode('data: {"type":"text","content":"partial"}\n\n')), 5);
      request.signal.addEventListener('abort', () => {
        clearInterval(timer);
        controller.error(new DOMException('Worker budget reached', 'AbortError'));
      }, { once: true });
    },
  }), { headers: { 'content-type': 'text/event-stream' } }), 40);
  const { job } = await (await app.handler(start())).json();
  await Promise.all(app.work);
  const saved = await (await app.handler(status(job.id))).json();
  assert.equal(saved.job.status, 'failed');
  assert.match(saved.job.result_payload.body, /partial/);
  // Pending frames may miss their flush at the deadline; the terminal body
  // still preserves every byte received and can be read from Activity.
  assert.equal(app.calls(), 1);
});

test('slow authentication and acceptance consume the same worker budget without starting a late paid operation', async () => {
  const store = new MemoryStore();
  const work: Promise<void>[] = [];
  let clock = 1_000;
  let calls = 0;
  const handler = createToolTransport({
    store, now: () => clock, workerTimeoutMs: 100,
    authenticate: async () => { clock += 101; return 'alice'; },
    baseUrl: 'https://example.supabase.co', publishableKey: 'public-key',
    upstream: async () => { calls++; return jsonResponse(); }, waitUntil: p => { work.push(p); },
  });
  const rejected = await handler(start());
  await Promise.all(work);
  assert.equal(calls, 0);
  assert.equal(rejected.status, 503);
  assert.equal(store.rows.size, 0);
});

test('a slow SSE append at the deadline is aborted before saving the terminal body within the Free limit', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  const work: Promise<void>[] = [];
  const store = new MemoryStore();
  const trace: Array<[string, number]> = [];
  const originalUpdate = store.update.bind(store);
  store.append = async (_id: string, _events: ToolEvent[], signal?: AbortSignal) => {
    trace.push(['append', Date.now()]);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 7_900);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        trace.push(['append-aborted', Date.now()]);
        reject(new DOMException('Interrupted', 'AbortError'));
      }, { once: true });
    });
  };
  store.update = async (id, patch) => {
    if (patch.status === 'failed') {
      trace.push(['terminal', Date.now()]);
      await new Promise<void>(resolve => setTimeout(resolve, 7_900));
    }
    await originalUpdate(id, patch);
  };
  const handler = createToolTransport({
    store, baseUrl: 'https://example.supabase.co', publishableKey: 'public', authenticate: async () => 'alice',
    waitUntil: task => { work.push(task); },
    upstream: async req => new Response(new ReadableStream({ start(controller) {
      setTimeout(() => controller.enqueue(new TextEncoder().encode('data: {"type":"text","content":"late partial"}\n\n')), 129_900);
      req.signal.addEventListener('abort', () => controller.error(new DOMException('Deadline', 'AbortError')), { once: true });
    } }), { headers: { 'content-type': 'text/event-stream' } }),
  });
  const { job } = await (await handler(start())).json();
  const settle = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
  await settle();
  context.mock.timers.tick(129_900);
  await settle();
  context.mock.timers.tick(100);
  await settle();
  context.mock.timers.tick(7_900);
  await Promise.all(work);
  assert.deepEqual(trace, [['append', 129_900], ['append-aborted', 130_000], ['terminal', 130_000]]);
  assert.ok(Date.now() < 150_000);
  const saved = await store.get(job.id, 'alice');
  assert.equal(saved?.status, 'failed');
  assert.match((saved?.result_payload as { body: string }).body, /late partial/);
});
