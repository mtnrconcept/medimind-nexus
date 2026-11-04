import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import ts from 'typescript';
import { isTransientRequestFailure } from '../src/lib/requestFailures.ts';

type Invoke = (name: string, options: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: unknown }>;

/** Execute the real hook and its timers without a DOM or a live Supabase client. */
function mountMatrixObservation(invoke: Invoke) {
  const state: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  const react = {
    useCallback: <T,>(callback: T) => callback,
    useRef: <T,>(value?: T) => ({ current: value }),
    useState: (initial: unknown) => {
      const index = state.push(initial) - 1;
      return [initial, (next: unknown) => {
        state[index] = typeof next === 'function' ? next(state[index]) : next;
      }];
    },
    useEffect: (effect: () => void | (() => void)) => { effects.push(effect); },
  };
  const source = readFileSync(new URL('../src/hooks/useCrossMatrix.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { useCrossMatrix(patientId: string, enabled: boolean): unknown } };
  runInNewContext(compiled, {
    module, exports: module.exports, Error, setTimeout, clearTimeout,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === '@/integrations/supabase/client') return { supabase: { functions: { invoke } } };
      if (name === '@/lib/requestFailures') return { isTransientRequestFailure };
      throw new Error('Unexpected hook dependency: ' + name);
    },
  }, { filename: 'useCrossMatrix.ts' });
  module.exports.useCrossMatrix('synthetic-patient', true);
  const cleanups = effects.map(effect => effect());
  return {
    state,
    unmount: () => cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup(); }),
  };
}

const flushRequests = () => new Promise<void>(resolve => setImmediate(resolve));

test('matrix observation recovers from the SDK network error and resumes the same job without another start', async t => {
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
  assert.deepEqual(actions.map(body => body.action), ['matrix.latest', 'matrix.latest', 'matrix.latest']);
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
