import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { researchAIOptions, RESEARCH_MODEL } from '../supabase/functions/_shared/research-model.ts';

type Endpoint = 'pathology-analyzer' | 'detect-side-effects';
type Row = Record<string, unknown>;
const patientA = '11111111-1111-4111-8111-111111111111';
const patientB = '22222222-2222-4222-8222-222222222222';
const patientReadOnly = '33333333-3333-4333-8333-333333333333';
const pathologyId = '44444444-4444-4444-8444-444444444444';
const users: Record<string, string> = { 'session-a': 'user-a', 'session-b': 'user-b', 'session-read': 'user-read' };
const grants: Record<string, { patientId: string; write: boolean }> = {
  'user-a': { patientId: patientA, write: true },
  'user-b': { patientId: patientB, write: true },
  'user-read': { patientId: patientReadOnly, write: false },
};
const patients = [patientA, patientB, patientReadOnly].map((id, index) => ({
  id, pathology_id: pathologyId, name: `SYNTHETIC_PATIENT_${index + 1}`,
}));
const compiled = new Map<Endpoint, string>();
for (const name of ['pathology-analyzer', 'detect-side-effects'] as const) {
  compiled.set(name, ts.transpileModule(readFileSync(`supabase/functions/${name}/index.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}

/** Execute the actual handlers with separate sessions and patient grants.
 * Service credentials deliberately see all rows, so an RLS bypass fails the test. */
function endpoint(name: Endpoint, failures: { auth?: 'throw' | 'unavailable'; access?: boolean } = {}) {
  let handler!: (request: Request) => Promise<Response>;
  const calls = {
    clients: [] as Array<{ key: string; authorization: string }>,
    auth: [] as string[],
    access: [] as Array<{ name: string; args: Row; userId?: string }>,
    tables: [] as string[],
    inserts: [] as Row[],
    providers: [] as Array<{ prompt: string; options: ReturnType<typeof researchAIOptions> }>,
    fda: 0,
  };
  function createClient(_url: string, key: string, options?: { global?: { headers?: { Authorization?: string } } }) {
    const authorization = options?.global?.headers?.Authorization || '';
    const userId = users[authorization.replace(/^Bearer\s+/i, '')];
    const service = key === 'synthetic-service';
    const allowed = (id: unknown, write = false) => service
      || Boolean(userId && grants[userId]?.patientId === id && (!write || grants[userId].write));
    calls.clients.push({ key, authorization });
    return {
      auth: { async getUser(token: string) {
        calls.auth.push(token);
        if (failures.auth === 'throw') throw new Error('Synthetic network failure');
        if (failures.auth === 'unavailable') return { data: { user: null }, error: { status: 503 } };
        return users[token]
          ? { data: { user: { id: users[token] } }, error: null }
          : { data: { user: null }, error: { status: 401 } };
      } },
      rpc(rpcName: string, args: Row) {
        calls.access.push({ name: rpcName, args: JSON.parse(JSON.stringify(args)), userId });
        assert.equal(rpcName, 'has_patient_access');
        const result = failures.access
          ? { data: null, error: { message: 'Synthetic access lookup failure' } }
          : { data: allowed(args.p_patient_id, args.p_require_write === true), error: null };
        // PostgrestBuilder is PromiseLike, without Promise.prototype.catch.
        return { then: (resolve: (value: typeof result) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject) };
      },
      from(table: string) {
        calls.tables.push(table);
        const filters: Array<[string, unknown]> = [];
        let insert: Row | undefined;
        let maxRows = Infinity;
        const execute = () => {
          let rows: Row[] = [];
          if (table === 'patients') rows = patients.filter(patient => allowed(patient.id));
          else if (table === 'pathologies') rows = [{ id: pathologyId, name: 'Synthetic condition' }];
          else if (table === 'lab_results') rows = [patientA, patientB, patientReadOnly].flatMap(id => [
            { id: `${id}-baseline`, patient_id: id, test_name: 'ALT', test_date: '2026-10-01', value: 20, unit: 'U/L', reference_max: 40 },
            { id: `${id}-current`, patient_id: id, test_name: 'ALT', test_date: '2026-11-01', value: 60, unit: 'U/L', reference_max: 40 },
          ]).filter(row => allowed(row.patient_id));
          else if (table === 'patient_medications') rows = [patientA, patientB, patientReadOnly].map(id => ({
            id: `med-${id}`, patient_id: id, medication_id: 'synthetic-medication', medications: { name: 'SyntheticDrug' }, start_date: '2026-09-01', is_active: true,
          })).filter(row => allowed(row.patient_id));
          else if (table === 'side_effect_alerts' && insert) {
            if (!allowed(insert.patient_id, true)) return { data: null, error: { message: 'RLS denied insert' } };
            calls.inserts.push(JSON.parse(JSON.stringify(insert)));
            rows = [{ id: 'synthetic-alert', ...insert }];
          }
          rows = rows.filter(row => filters.every(([column, value]) => row[column] === value)).slice(0, maxRows);
          return { data: rows, error: null };
        };
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
          gte: () => query,
          order: () => query,
          limit: (limit: number) => { maxRows = limit; return query; },
          insert: (value: Row) => { insert = value; return query; },
          async single() { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
          then(resolve: (value: ReturnType<typeof execute>) => unknown, reject: (error: unknown) => unknown) {
            return Promise.resolve(execute()).then(resolve, reject);
          },
        };
        return query;
      },
    };
  }
  const provider = {
    async streamAI(_system: string, prompt: string, onChunk: (text: string) => void, options: ReturnType<typeof researchAIOptions>) {
      calls.providers.push({ prompt, options });
      const text = JSON.stringify({ interactions: [], correlations: [], patient_insights: [], recommendations: [] });
      onChunk(text);
      return { text };
    },
    async callAI(_system: string, prompt: string, options: ReturnType<typeof researchAIOptions>) {
      calls.providers.push({ prompt, options });
      return { text: JSON.stringify({ alerts: [{ biomarker: 'ALT', suspected_medication: 'SyntheticDrug', confidence: 0.7, recommendation: 'Synthetic review', reasoning: 'Synthetic evidence' }] }) };
    },
  };
  const module = { exports: {} };
  runInNewContext(compiled.get(name)!, {
    module, exports: module.exports, Response, ReadableStream, TextEncoder, Error,
    console: { log() {}, error() {} },
    setTimeout: (callback: () => void) => { callback(); return 1; },
    Deno: { env: { get: (key: string) => ({ SUPABASE_URL: 'https://project.invalid', SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' })[key] } },
    require: (dependency: string) => {
      if (dependency.endsWith('/http/server.ts')) return { serve: (callback: typeof handler) => { handler = callback; } };
      if (dependency.includes('@supabase/supabase-js')) return { createClient };
      if (dependency === '../_shared/ai-client.ts') return provider;
      if (dependency === '../_shared/research-model.ts') return { researchAIOptions };
      if (dependency === './openfda-api.ts') return { getOpenFDAComprehensiveData: async () => {
        calls.fda++;
        return { totalAdverseEvents: 0, adverseEvents: [] };
      } };
      throw new Error('Unexpected endpoint dependency: ' + dependency);
    },
  }, { filename: `${name}/index.ts` });
  return {
    calls,
    request: (authorization: string | null, body: Row = name === 'pathology-analyzer' ? { pathologyId } : { patient_id: patientA }) => handler(new Request(`https://project.invalid/functions/v1/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body),
    })),
  };
}

for (const name of ['pathology-analyzer', 'detect-side-effects'] as const) {
  test(`${name} rejects absent, malformed and invalid sessions before any data or provider call`, async () => {
    for (const authorization of [null, 'Basic invalid', 'Bearer invalid', 'Bearer synthetic-service']) {
      const fixture = endpoint(name);
      const response = await fixture.request(authorization);
      await response.text();
      assert.equal(response.status, 401, String(authorization));
      assert.equal(fixture.calls.tables.length, 0);
      assert.equal(fixture.calls.access.length, 0);
      assert.equal(fixture.calls.providers.length, 0);
      assert.equal(fixture.calls.fda, 0);
    }
  });

  test(`${name} fails closed when authentication is unavailable`, async () => {
    for (const auth of ['throw', 'unavailable'] as const) {
      const fixture = endpoint(name, { auth });
      const response = await fixture.request('Bearer session-a');
      await response.text();
      assert.equal(response.status, 503);
      assert.equal(fixture.calls.tables.length, 0);
      assert.equal(fixture.calls.providers.length, 0);
    }
  });
}

test('pathology analysis uses the verified caller session and only its RLS-visible patients', async () => {
  for (const [session, ownName, forbiddenName] of [
    ['session-a', 'SYNTHETIC_PATIENT_1', 'SYNTHETIC_PATIENT_2'],
    ['session-b', 'SYNTHETIC_PATIENT_2', 'SYNTHETIC_PATIENT_1'],
  ]) {
    const fixture = endpoint('pathology-analyzer');
    const response = await fixture.request(`Bearer ${session}`);
    await response.text();
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.calls.clients, [{ key: 'synthetic-anon', authorization: `Bearer ${session}` }]);
    assert.deepEqual(fixture.calls.auth, [session]);
    assert.equal(fixture.calls.providers.length, 1);
    const { prompt, options } = fixture.calls.providers[0];
    assert.ok(prompt.includes(ownName));
    assert.ok(!prompt.includes(forbiddenName));
    assert.ok(!prompt.includes('SYNTHETIC_PATIENT_3'));
    assert.equal(options.model, RESEARCH_MODEL);
    assert.equal(options.forceModel, true);
    assert.equal(options.enforceClinicalContract, true);
  }
});

test('side-effect detection denies the other patient and read-only grants before clinical reads or writes', async () => {
  for (const [session, patient_id] of [['session-a', patientB], ['session-b', patientA], ['session-read', patientReadOnly]]) {
    const fixture = endpoint('detect-side-effects');
    const response = await fixture.request(`Bearer ${session}`, { patient_id, userId: 'user-a', force_analysis: true });
    assert.equal(response.status, 403);
    assert.deepEqual(fixture.calls.access.map(call => call.args), [{ p_patient_id: patient_id, p_require_write: true }]);
    assert.equal(fixture.calls.tables.length, 0);
    assert.equal(fixture.calls.inserts.length, 0);
    assert.equal(fixture.calls.providers.length, 0);
    assert.equal(fixture.calls.fda, 0);
  }
});

test('side-effect detection fails closed when the patient access lookup fails', async () => {
  const fixture = endpoint('detect-side-effects', { access: true });
  const response = await fixture.request('Bearer session-a');
  assert.equal(response.status, 503);
  assert.equal(fixture.calls.tables.length, 0);
  assert.equal(fixture.calls.providers.length, 0);
});

test('authorized side-effect analysis preserves its patient scope and Astra clinical contract through insert', async () => {
  for (const [session, patient_id] of [['session-a', patientA], ['session-b', patientB]]) {
    const fixture = endpoint('detect-side-effects');
    const response = await fixture.request(`Bearer ${session}`, { patient_id });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.calls.clients, [{ key: 'synthetic-anon', authorization: `Bearer ${session}` }]);
    assert.deepEqual(fixture.calls.auth, [session]);
    assert.equal(body.alerts.length, 1);
    assert.equal(fixture.calls.inserts.length, 1);
    assert.equal(fixture.calls.inserts[0].patient_id, patient_id);
    assert.equal(fixture.calls.providers.length, 1);
    const { options } = fixture.calls.providers[0];
    assert.equal(options.model, RESEARCH_MODEL);
    assert.equal(options.forceModel, true);
    assert.equal(options.enforceClinicalContract, true);
    assert.equal(options.reasoningEffort, 'high');
  }
});
