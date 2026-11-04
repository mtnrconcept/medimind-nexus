import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  prepareBackgroundJobPayload, prepareBackgroundJobRequest,
  readBackgroundMonitorState, updateBackgroundJobRecord,
  type BackgroundJobRow,
} from '../supabase/functions/_shared/background-job-monitor.ts';

const startedAt = 1_800_000_000_000;
const jobId = '11111111-1111-4111-8111-111111111111';
const publicToken = '22222222-2222-4222-8222-222222222222';
const responseId = 'resp_saved_before_browser_left';
const serviceKey = 'synthetic-service-key';
const baseUrl = 'https://native-monitor.invalid';
type Payload = Parameters<typeof prepareBackgroundJobRequest>[1];
type AckLoss = 'first' | 'all';

async function exerciseLostAcknowledgements(t: TestContext, ackLoss: AckLoss) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: startedAt });
  const payload = prepareBackgroundJobPayload({ async: true, topic: 'synthetic fixture' }, startedAt);
  const job: BackgroundJobRow = {
    id: jobId, public_token: publicToken, function_name: 'deep-research',
    status: 'processing', request_payload: payload,
    provider_response_id: responseId, provider_status: 'in_progress',
    requested_by: 'synthetic-owner', created_at: new Date(startedAt).toISOString(),
    updated_at: new Date(startedAt).toISOString(),
    expires_at: new Date(startedAt + 24 * 60 * 60_000).toISOString(),
  };
  readBackgroundMonitorState(job).phase = 'polling';
  let conflicts = 0;
  const savedResponseIds: unknown[] = [];
  const supabase = {
    from() {
      let patch: Record<string, unknown> | undefined;
      const filters = new Map<string, unknown>();
      const query = {
        select() { return query; },
        abortSignal() { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        is(key: string, value: unknown) { filters.set(key, value); return query; },
        update(value: Record<string, unknown>) { patch = value; return query; },
        async maybeSingle() {
          const matches = [...filters].every(([key, value]) => {
            const actual = key.split(/->>?/).reduce<unknown>((current, part) =>
              (current as Record<string, unknown> | undefined)?.[part], job);
            return value === null ? actual == null : actual === value;
          });
          if (!matches) return { data: null, error: null };
          if (patch) {
            const current = readBackgroundMonitorState(job);
            const next = readBackgroundMonitorState({ ...job, ...patch } as BackgroundJobRow);
            // Only watchdog ownership conflicts. Control reservations continue
            // to persist, exactly as they would during concurrent progress writes.
            if (next.watchdogId && next.watchdogId !== current.watchdogId && Date.now() < startedAt + 60_000) {
              conflicts += 1;
              return { data: null, error: null };
            }
            Object.assign(job, structuredClone(patch));
            savedResponseIds.push(job.provider_response_id);
          }
          return { data: structuredClone(job), error: null };
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof prepareBackgroundJobRequest>[2]['supabase'];
  const options = { supabase, supabaseUrl: baseUrl, serviceRoleKey: serviceKey, functionName: 'deep-research' };
  const tasks: Array<{ work: Promise<void>; start: number; end?: number }> = [];
  const globals = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(work: Promise<void>): void };
    Deno?: { env: { get(name: string): string | undefined } };
  };
  const oldRuntime = globals.EdgeRuntime;
  const oldDeno = globals.Deno;
  globals.EdgeRuntime = { waitUntil(work) {
    const entry: (typeof tasks)[number] = { work, start: Date.now() };
    tasks.push(entry);
    void work.then(() => { entry.end = Date.now(); }, () => { entry.end = Date.now(); });
  } };
  globals.Deno = { env: { get: name => name === 'OPENAI_API_KEY' ? 'synthetic-openai-key' : undefined } };
  t.after(() => { globals.EdgeRuntime = oldRuntime; globals.Deno = oldDeno; });
  const relayErrors: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { relayErrors.push(args); });

  let finalized = 0;
  async function invoke(body: Payload): Promise<Response> {
    const result = await prepareBackgroundJobRequest(new Request(baseUrl, {
      headers: { authorization: 'Bearer ' + serviceKey },
    }), body, options);
    if (result.response) return result.response;
    assert.equal(body.runJob, true, 'only the existing-response finalizer may run');
    assert.equal(result.payload.providerResponseId, responseId);
    finalized += 1;
    await updateBackgroundJobRecord(supabase, jobId, {
      status: 'completed', result_payload: { answer: 'Preserved result' },
      completed_at: new Date().toISOString(),
    });
    return Response.json({ completed: true });
  }

  const internal: Array<{ at: number; worker: boolean }> = [];
  const providerGets: string[] = [];
  let providerPosts = 0;
  let successfulRetryAcks = 0;
  const dueRetries = new Map<string, number[]>();
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === 'https://api.openai.com') {
      if (request.method === 'POST') providerPosts += 1;
      assert.equal(request.method, 'GET', 'recovery must never create another paid response');
      assert.equal(url.pathname, '/v1/responses/' + responseId);
      providerGets.push(responseId);
      return Response.json({ id: responseId, status: 'completed', output_text: '{"answer":"Preserved result"}' });
    }
    assert.equal(url.origin, baseUrl);
    assert.equal(url.pathname, '/functions/v1/deep-research');
    const raw = await request.text();
    const body = JSON.parse(raw) as Payload;
    const at = Date.now() - startedAt;
    internal.push({ at, worker: body.runJob === true });
    if (body.runJob) return invoke(body);

    // Each physical relay retries the same body 6.5s after its first call:
    // a 6s timeout followed by the real 500ms retry delay. Reserve this marker
    // before awaiting acceptance so simultaneous deliveries share the ledger.
    const due = dueRetries.get(raw) ?? [];
    dueRetries.set(raw, due);
    const retryIndex = due.findIndex(time => at >= time && at < time + 250);
    const retry = retryIndex >= 0;
    if (retry) due.splice(retryIndex, 1);
    else due.push(at + 6500);
    const response = await invoke(body);
    if (ackLoss === 'first' && retry) {
      successfulRetryAcks += 1;
      return response;
    }
    // The remote invocation was accepted. Only its acknowledgment is lost.
    return await new Promise<Response>((_resolve, reject) => {
      const rejectLostAck = () => reject(new Error('Accepted relay acknowledgement lost'));
      if (request.signal.aborted) rejectLostAck();
      else request.signal.addEventListener('abort', rejectLostAck, { once: true });
    });
  });

  await invoke({ action: 'monitor', jobId });
  for (let tick = 0; tick < 800; tick++) {
    for (let step = 0; step < 150; step++) await Promise.resolve();
    if (job.status === 'completed' && tasks.every(task => task.end !== undefined)) break;
    t.mock.timers.tick(250);
  }
  assert.equal(job.status, 'completed', 'the server chain must finish after watchdog conflicts stop, without a browser wake-up');
  assert.ok(tasks.every(task => task.end !== undefined), 'all accepted control invocations must finish within the fixture budget');
  await Promise.all(tasks.map(task => task.work));
  assert.ok(conflicts >= 4, 'the fixture must exercise repeated conflicts before recovery');
  assert.equal(finalized, 1, 'duplicate control deliveries cannot duplicate finalization');
  assert.equal(providerPosts, 0);
  assert.ok(providerGets.length > 0);
  assert.ok(savedResponseIds.every(value => value === responseId));
  assert.equal(job.provider_response_id, responseId);
  assert.deepEqual(job.result_payload, { answer: 'Preserved result' });
  assert.ok(tasks.every(task => task.end! - task.start <= 140_000), 'control reservation belongs to the same total invocation budget');
  if (ackLoss === 'first') {
    assert.ok(successfulRetryAcks > 0);
    assert.equal(relayErrors.length, 0, 'every relay gets its second acknowledgment');
  }
  let peak = 0;
  for (const first of internal) peak = Math.max(peak,
    internal.filter(call => call.at >= first.at && call.at < first.at + 60_000).length);
  assert.ok(peak <= 30, `Observed ${peak} internal Edge calls in a rolling 60-second window.`);
  t.diagnostic(`${ackLoss} ACK loss: peak ${peak}/60s, ${conflicts} conflicts, ${providerGets.length} existing-response GET(s), ${finalized} finalizer, elapsed ${Date.now() - startedAt}ms`);
}

test('native control relays deduplicate a lost first ACK and finish the saved response after conflicts end', async t => {
  await exerciseLostAcknowledgements(t, 'first');
});

test('native control relays remain bounded when both ACKs are lost and still finish after recovery', async t => {
  await exerciseLostAcknowledgements(t, 'all');
});
