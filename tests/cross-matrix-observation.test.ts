import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import ts from 'typescript';
import { isTransientRequestFailure } from '../src/lib/requestFailures.ts';

type Invoke = (name: string, options: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>;
type Engine = 'astra' | 'literature';
type Submit = (action: 'matrix.start' | 'matrix.resume', body: object) => Promise<void>;
type ObservationProps = { patientId: string | undefined; enabled: boolean; engine?: Engine };
type HookSlot = { value?: unknown; deps?: unknown[]; setter?: (next: unknown) => void; cleanup?: () => void };

/** Execute the real hook and its timers without a DOM or a live Supabase client. */
function mountMatrixObservation(invoke: Invoke, engine?: Engine, initialPatientId = 'synthetic-patient') {
  const state: unknown[] = [];
  const hooks: HookSlot[] = [];
  let props: ObservationProps = { patientId: initialPatientId, enabled: true, engine };
  let index = 0, mounted = true, renderQueued = false;
  let effects: Array<() => void> = [];
  let current: { submit: Submit };
  const changed = (before: unknown[] | undefined, after: unknown[]) => !before || before.length !== after.length ||
    after.some((value, position) => !Object.is(value, before[position]));
  const scheduleRender = () => {
    if (!mounted || renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      if (mounted) render();
    });
  };
  const react = {
    useCallback: <T,>(callback: T, deps: unknown[]) => {
      const slot = index++;
      const hook = hooks[slot] ?? (hooks[slot] = {});
      if (changed(hook.deps, deps)) { hook.value = callback; hook.deps = [...deps]; }
      return hook.value as T;
    },
    useRef: <T,>(value?: T) => {
      const slot = index++;
      const hook = hooks[slot] ?? (hooks[slot] = { value: { current: value } });
      return hook.value as { current: T | undefined };
    },
    useState: (initial: unknown) => {
      const slot = index++;
      const hook = hooks[slot] ?? (hooks[slot] = { value: typeof initial === 'function' ? initial() : initial });
      state[slot] = hook.value;
      hook.setter ??= next => {
        if (!mounted) return;
        const value = typeof next === 'function' ? next(hook.value) : next;
        if (!Object.is(hook.value, value)) {
          hook.value = value;
          state[slot] = value;
          scheduleRender();
        }
      };
      return [hook.value, hook.setter];
    },
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const slot = index++;
      const hook = hooks[slot] ?? (hooks[slot] = {});
      if (changed(hook.deps, deps)) {
        hook.deps = [...deps];
        effects.push(() => { hook.cleanup?.(); hook.cleanup = effect() || undefined; });
      }
    },
  };
  const source = readFileSync(new URL('../src/hooks/useCrossMatrix.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { useCrossMatrix(patientId: string | undefined, enabled: boolean, engine?: Engine): { submit: Submit } } };
  runInNewContext(compiled, {
    module, exports: module.exports, Error, setTimeout, clearTimeout,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === '@/integrations/supabase/client') return { supabase: { functions: { invoke } } };
      if (name === '@/lib/requestFailures') return { isTransientRequestFailure };
      throw new Error('Unexpected hook dependency: ' + name);
    },
  }, { filename: 'useCrossMatrix.ts' });
  function render() {
    index = 0;
    effects = [];
    current = module.exports.useCrossMatrix(props.patientId, props.enabled, props.engine);
    effects.forEach(effect => effect());
  }
  render();
  return {
    state,
    submit: ((action, body) => current.submit(action, body)) as Submit,
    rerender: (next: Partial<ObservationProps>) => { props = { ...props, ...next }; render(); },
    unmount: () => { mounted = false; hooks.forEach(hook => hook.cleanup?.()); },
  };
}

const flushRequests = () => new Promise<void>(resolve => setImmediate(resolve));

test('default Astra observation recovers from the SDK network error and resumes the same job without another start', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const actions: Array<Record<string, unknown>> = [];
  const failure = new FunctionsFetchError(new TypeError('Failed to fetch'));
  const processing = { id: 'saved-matrix', status: 'processing', updated_at: 'first', stalled: false };
  const completed = { ...processing, status: 'completed', updated_at: 'last' };
  const observation = mountMatrixObservation(async (name, { body }) => {
    assert.equal(name, 'cross-data-analyzer');
    actions.push({ ...body });
    return actions.length === 2 ? { data: null, error: failure }
      : { data: { job: actions.length === 1 ? processing : completed }, error: null };
  });
  t.after(observation.unmount);
  await flushRequests();
  assert.equal(observation.state[0], processing);

  t.mock.timers.tick(2_500);
  await flushRequests();
  assert.equal(observation.state[2], failure.message);
  assert.equal(observation.state[0], processing, 'A network outage keeps the last confirmed result.');

  t.mock.timers.tick(2_500);
  await flushRequests();
  assert.equal(actions.length, 3, 'The network error must schedule another status read.');
  assert.equal(observation.state[0], completed);
  assert.equal(observation.state[2], null);
  assert.deepEqual(actions.map(body => body.action), ['agent.latest', 'agent.latest', 'agent.latest']);
  assert.deepEqual(actions.slice(1).map(body => body.jobId), ['saved-matrix', 'saved-matrix']);
  t.mock.timers.tick(10_000);
  await flushRequests();
  assert.equal(actions.length, 3, 'A completed job ends observation.');
});

test('matrix observation clears inaccessible results and stops on an authoritative SDK 403', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requests = 0;
  const failure = new FunctionsHttpError(Response.json({ error: 'Forbidden' }, { status: 403 }));
  const observation = mountMatrixObservation(async () => {
    requests += 1;
    return requests === 1 ? { data: { job: { id: 'saved-matrix', status: 'processing' } }, error: null }
      : { data: null, error: failure };
  });
  t.after(observation.unmount);
  await flushRequests();
  t.mock.timers.tick(2_500);
  await flushRequests();
  assert.equal(observation.state[0], null);
  assert.equal(observation.state[2], 'Forbidden');
  t.mock.timers.tick(10_000);
  await flushRequests();
  assert.equal(requests, 2, 'Authorization failure must not be retried as a network outage.');
});

for (const { label, engine, prefix } of [
  { label: 'default Astra engine', engine: undefined, prefix: 'agent' },
  { label: 'explicit literature engine', engine: 'literature' as const, prefix: 'matrix' },
]) {
  test(`${label} routes launch, observation and explicit resume to the same engine`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const actions: Array<Record<string, unknown>> = [];
    const queued = { id: 'saved-matrix', status: 'queued', updated_at: 'queued', stalled: false };
    const failed = { ...queued, status: 'failed', updated_at: 'failed' };
    const resumed = { ...queued, status: 'processing', updated_at: 'resumed' };
    const completed = { ...queued, status: 'completed', updated_at: 'completed' };
    const jobs = [null, queued, failed, resumed, completed];
    const observation = mountMatrixObservation(async (name, { body }) => {
      assert.equal(name, 'cross-data-analyzer');
      actions.push({ ...body });
      return { data: { job: jobs[actions.length - 1] }, error: null };
    }, engine);
    t.after(observation.unmount);
    await flushRequests();
    assert.equal(observation.state[0], null);

    const selection = { selectedMedicationIds: ['synthetic-medication'] };
    await observation.submit('matrix.start', selection);
    await flushRequests();
    assert.equal(observation.state[0], failed);
    t.mock.timers.tick(10_000);
    await flushRequests();
    assert.equal(actions.length, 3, 'A failed job waits for an explicit resume.');

    await observation.submit('matrix.resume', { jobId: queued.id });
    await flushRequests();
    assert.equal(observation.state[0], completed);
    assert.deepEqual(actions.map(body => body.action), [
      `${prefix}.latest`, `${prefix}.start`, `${prefix}.latest`, `${prefix}.resume`, `${prefix}.latest`,
    ]);
    assert.ok(actions.every(body => body.patientId === 'synthetic-patient'));
    assert.deepEqual(actions[1].selectedMedicationIds, selection.selectedMedicationIds);
    assert.deepEqual(actions.slice(2).map(body => body.jobId), [queued.id, queued.id, queued.id]);
    t.mock.timers.tick(10_000);
    await flushRequests();
    assert.equal(actions.length, 5, 'Resuming a job must not launch a new analysis.');
  });
}

for (const scenario of [
  { label: 'patient A to patient B', next: { patientId: 'patient-B' }, patientId: 'patient-B', action: 'agent.latest' },
  { label: 'Astra to literature', next: { engine: 'literature' as const }, patientId: 'patient-A', action: 'matrix.latest' },
]) {
  test(`changing ${scenario.label} clears the old scope before the new read and ignores its late response`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const actions: Array<Record<string, unknown>> = [];
    const oldResult = { id: 'job-A', status: 'processing', updated_at: 'A-first', stalled: false };
    const lateOldResult = { ...oldResult, status: 'completed', updated_at: 'A-late' };
    const newResult = { id: 'job-B', status: 'processing', updated_at: 'B-first', stalled: false };
    const completed = { ...newResult, status: 'completed', updated_at: 'B-last' };
    const failure = new FunctionsFetchError(new TypeError('Synthetic outage in the old scope'));
    let resolveOld!: (value: Awaited<ReturnType<Invoke>>) => void;
    let resolveNew!: (value: Awaited<ReturnType<Invoke>>) => void;
    const suspendedOldRead = new Promise<Awaited<ReturnType<Invoke>>>(resolve => { resolveOld = resolve; });
    const suspendedNewRead = new Promise<Awaited<ReturnType<Invoke>>>(resolve => { resolveNew = resolve; });
    const observation = mountMatrixObservation(async (name, { body }) => {
      assert.equal(name, 'cross-data-analyzer');
      actions.push({ ...body });
      if (actions.length === 1) return { data: { job: oldResult }, error: null };
      if (actions.length === 2) return { data: null, error: failure };
      if (actions.length === 3) return suspendedOldRead;
      if (actions.length === 4) return suspendedNewRead;
      return { data: { job: completed }, error: null };
    }, 'astra', 'patient-A');
    t.after(observation.unmount);
    await flushRequests();
    assert.equal(observation.state[0], oldResult);

    t.mock.timers.tick(2_500);
    await flushRequests();
    assert.equal(observation.state[2], failure.message);
    t.mock.timers.tick(2_500);
    await flushRequests();
    assert.equal(actions.length, 3, 'The old scope must have an outstanding status read at the switch');
    assert.equal(observation.state[0], oldResult);

    observation.rerender(scenario.next);
    assert.equal(observation.state[0], null, 'Clear the previous result before the new scope responds');
    assert.equal(observation.state[1], true, 'The first authoritative read of the new scope is pending');
    assert.equal(observation.state[2], null, 'An error from the old scope must not leak into the new scope');
    assert.equal(actions.length, 4);
    assert.equal(actions[3].action, scenario.action);
    assert.equal(actions[3].patientId, scenario.patientId);
    assert.equal(actions[3].jobId, undefined, 'A new scope must not query the old job ID');

    resolveOld({ data: { job: lateOldResult }, error: null });
    await flushRequests();
    assert.equal(observation.state[0], null, 'A late response from the old scope cannot repopulate its result');
    assert.equal(observation.state[1], true, 'The old response cannot end the new scope loading state');
    assert.equal(observation.state[2], null);
    t.mock.timers.tick(10_000);
    await flushRequests();
    assert.equal(actions.length, 4, 'The retired scope must not schedule any more reads');

    resolveNew({ data: { job: newResult }, error: null });
    await flushRequests();
    assert.equal(observation.state[0], newResult);
    assert.equal(observation.state[1], false);
    t.mock.timers.tick(2_500);
    await flushRequests();
    assert.equal(observation.state[0], completed);
    assert.deepEqual(actions.slice(0, 3).map(body => [body.action, body.patientId]), [
      ['agent.latest', 'patient-A'], ['agent.latest', 'patient-A'], ['agent.latest', 'patient-A'],
    ]);
    assert.ok(actions.slice(3).every(body => body.action === scenario.action && body.patientId === scenario.patientId));
    assert.deepEqual(actions.slice(3).map(body => body.jobId), [undefined, 'job-B']);
    assert.ok(actions.every(body => String(body.action).endsWith('.latest')), 'Scope changes only observe; they never create or resume an analysis');
    t.mock.timers.tick(10_000);
    await flushRequests();
    assert.equal(actions.length, 5);
  });
}
