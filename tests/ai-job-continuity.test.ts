import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { resolveAIJob } from '../src/lib/aiJobs.ts';

const initial = { job: { id: 'job-1', token: 'job-secret', status: 'queued' } };
const fast = { initialDelayMs: 1, maxDelayMs: 1, maxWaitMs: 1000 };

function browser(t: TestContext) {
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  let visibilityState = 'visible';
  let online = true;
  const values = {
    window: Object.assign(windowEvents, { setTimeout, clearTimeout }),
    document: Object.assign(documentEvents, { get visibilityState() { return visibilityState; } }),
    navigator: { get onLine() { return online; } },
  };
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key));
  }
  return {
    hide() { visibilityState = 'hidden'; Object.defineProperty(values.document, 'visibilityState', { configurable: true, get: () => visibilityState }); documentEvents.dispatchEvent(new Event('visibilitychange')); },
    show() { visibilityState = 'visible'; documentEvents.dispatchEvent(new Event('visibilitychange')); },
    offline() { online = false; windowEvents.dispatchEvent(new Event('offline')); },
    online() { online = true; windowEvents.dispatchEvent(new Event('online')); },
  };
}

test('status polling recovers from a transient connection error without starting another generation', async t => {
  browser(t);
  const actions: unknown[] = [];
  const progress: string[] = [];
  const result = await resolveAIJob(async (_name, body) => {
    actions.push(body);
    if (actions.length === 1) return { data: null, error: Object.assign(new Error('Failed to fetch'), { name: 'FunctionsFetchError' }) };
    return { data: { job: { status: 'completed', result_payload: { answer: 'finished' } } }, error: null };
  }, 'deep-research', initial, { ...fast, onProgress: state => progress.push(state.status) });
  assert.deepEqual(result, { answer: 'finished' });
  assert.equal(actions.length, 2);
  assert.ok(actions.every(body => (body as { action: string }).action === 'status'));
  assert.ok(progress.includes('reconnecting'));
});

test('a suspended browser does not spend the interactive wait budget', async t => {
  const page = browser(t);
  let now = 0;
  let calls = 0;
  t.mock.method(Date, 'now', () => now);
  const result = await resolveAIJob(async () => {
    calls += 1;
    if (calls === 1) {
      page.hide();
      now += 65 * 60 * 1000;
      setTimeout(() => page.show(), 3);
      return { data: { job: { status: 'processing', progress_percentage: 45 } }, error: null };
    }
    return { data: { job: { status: 'completed', result_payload: 'done after return' } }, error: null };
  }, 'deep-research', initial, fast);
  assert.equal(result, 'done after return');
  assert.equal(calls, 2);
});

test('definitive authorization failures stop observation and are never retried', async t => {
  browser(t);
  let calls = 0;
  const error = Object.assign(new Error('Forbidden'), { context: new Response('', { status: 403 }) });
  await assert.rejects(resolveAIJob(async () => { calls += 1; return { data: null, error }; }, 'deep-research', initial, fast), /Forbidden/);
  assert.equal(calls, 1);
});

test('aborting observation detaches an in-flight status request without any cancellation request', async t => {
  browser(t);
  const controller = new AbortController();
  const actions: unknown[] = [];
  const result = resolveAIJob(async (_name, body) => {
    actions.push(body);
    queueMicrotask(() => controller.abort());
    return new Promise<{ data: unknown; error: unknown }>(() => {});
  }, 'deep-research', initial, { ...fast, signal: controller.signal });
  await assert.rejects(Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('observer remained blocked')), 100))]), { name: 'AbortError' });
  assert.deepEqual(actions, [{ action: 'status', jobId: 'job-1', jobToken: 'job-secret' }]);
});

test('returning online resumes status observation without spending an offline hour or starting again', async t => {
  const page = browser(t);
  let now = 0;
  let calls = 0;
  t.mock.method(Date, 'now', () => now);
  const result = await resolveAIJob(async (_name, body) => {
    assert.equal((body as { action: string }).action, 'status');
    calls += 1;
    if (calls === 1) {
      page.offline();
      now += 65 * 60 * 1000;
      setTimeout(() => page.online(), 3);
      return { data: null, error: Object.assign(new Error('Failed to fetch'), { name: 'FunctionsFetchError' }) };
    }
    return { data: { job: { status: 'completed', result_payload: 'finished offline' } }, error: null };
  }, 'deep-research', initial, fast);
  assert.equal(result, 'finished offline');
  assert.equal(calls, 2);
});
