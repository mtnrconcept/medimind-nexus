import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { buildPairCandidates, buildPairHash, ensureAnalysisShape, normalizeCausalLink, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { readCells, pendingPairs, readPairAssessments } from '../supabase/functions/cross-data-analyzer/matrix-progress.ts';
import { createMatrixInitialState } from '../supabase/functions/cross-data-analyzer/matrix-job.ts';
import { detectHighRiskContext } from '../supabase/functions/_shared/clinical-brain.ts';

const elements: SelectedElement[] = [
  { name: 'Alpha', type: 'pathology' }, { name: 'Beta', type: 'symptom' }, { name: 'Gamma', type: 'medication' },
];
const pairs = buildPairCandidates(elements);

test('an explicit empty cell is audited, a missing or malformed cell is pending on retry', () => {
  const [first, second] = pairs;
  const cells = readCells([
    { pairHash: first.pairHash, links: [] }, { pairHash: second.pairHash, links: null },
  ], pairs);
  assert.deepEqual(cells, { [first.pairHash]: [] });
  assert.deepEqual(pendingPairs(elements, cells), pairs.slice(1));
});

test('local clinical relationships are preserved for OpenAI context, never pre-audited', () => {
  const localLink = normalizeCausalLink({
    from: 'Alpha', fromType: 'pathology', to: 'Beta', toType: 'symptom',
    relationship: 'Association locale à examiner', evidence: 'Mention locale', webSources: [],
  }, elements);
  assert.ok(localLink);
  const state = createMatrixInitialState(elements, [localLink!]);
  assert.deepEqual(state.cells, {});
  assert.equal(state.localEvidence?.[buildPairHash('Alpha', 'pathology', 'Beta', 'symptom')]?.length, 1);
  assert.equal(pendingPairs(state.elements, state.cells).length, 3);
  assert.deepEqual(state.analysis.causalLinks, []);
});

test('OpenAI assessments are required, explicit, and cannot target another pair', () => {
  const hash = pairs[0].pairHash;
  const raw = [{ pairHash: hash, assessment: {
    verdict: 'hypothesis', explanation: 'Hypothèse à examiner cliniquement',
    limitations: 'Sans preuve bibliographique directe',
  }}];
  const parsed = readPairAssessments(raw, [pairs[0]]);
  assert.equal(parsed[hash].source, 'openai');
  assert.equal(parsed[hash].verdict, 'hypothesis');
  assert.deepEqual(readPairAssessments([{ pairHash: pairs[1].pairHash, assessment: raw[0].assessment }], [pairs[0]]), {});
  assert.deepEqual(readPairAssessments([{ pairHash: hash, assessment: { verdict: 'cited_relation', explanation: 'x' } }], [pairs[0]]), {});
});

test('a response cannot fill another pair or silently discard an invalid link', () => {
  assert.deepEqual(readCells([{ pairHash: pairs[1].pairHash, links: [] },
    { pairHash: pairs[0].pairHash, links: [{ from: 'Gamma' }] }], [pairs[0]]), {});
});

import { createClient } from '@supabase/supabase-js';
import { handleMatrix } from '../supabase/functions/cross-data-analyzer/matrix-job.ts';

async function drainMatrixTasks(tasks: Promise<void>[], t: TestContext) {
  let ticks = 0;
  while (tasks.length) {
    const work = tasks.shift()!;
    let settled = false;
    void work.then(() => { settled = true; }, () => { settled = true; });
    while (!settled) {
      for (let step = 0; step < 150; step++) await Promise.resolve();
      if (!settled) {
        assert.ok(ticks++ < 20_000, 'The matrix continuation did not settle within the simulated fixture budget.');
        t.mock.timers.tick(100);
      }
    }
    await work;
  }
}

test('server continues without a polling browser and resumes a truncated batch without re-auditing completed cells', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
  const tasks: Promise<void>[] = [];
  type StoredJob = {
    id: string; status: string; updated_at: string; request_payload: {scope: string};
    result_payload: { cells: Record<string, unknown>; analysis: { summary: string } };
    [field: string]: unknown;
  };
  const database = new Map<string, StoredJob>();
  const submissions: string[][] = [];
  const provider = new Map<string, { status: string; output_text?: string; incomplete_details?: { reason: string }; max_output_tokens?: number }>();
  const providerGets: string[] = [];
  let failFirstRead = true;
  let truncate = true;
  const service = 'test-service', url = 'https://matrix.invalid';
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const ok = (data: unknown) => Response.json(data);
    if (u.pathname === '/functions/v1/cross-data-analyzer') return dispatch(await req.json(), service);
    if (u.pathname === '/auth/v1/user') return ok({ id: req.headers.get('authorization')?.slice(7) });
    if (u.pathname === '/rest/v1/patients') return ok([]);
    if (u.pathname === '/v1/responses' && req.method === 'POST') {
      const request = await req.json();
      const input = JSON.parse(request.input[1].content);
      const hashes = input.pairs?.map(({ pair }: { pair: { pairHash: string } }) => pair.pairHash) || [];
      submissions.push(hashes);
      const id = 'ai-' + submissions.length;
      // First group returns one explicit cell. The next group exhausts its
      // larger bounded budgets, then the clinician resumes the remaining cells.
      const result = hashes.length ? { cells: hashes.slice(0, 1).map((pairHash: string) => ({ pairHash, links: [], assessment: {
        verdict: 'insufficient', explanation: 'Aucune relation vérifiée par la recherche',
        limitations: 'Absence de données externes pertinentes',
      } })) } :
        { summary: 'Synthèse du test.' };
      const fail = truncate && submissions.length > 1;
      provider.set(id, fail ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, max_output_tokens: request.max_output_tokens } :
        { status: 'completed', output_text: JSON.stringify(result) });
      return ok({ id, status: 'queued', max_output_tokens: request.max_output_tokens });
    }
    if (u.pathname.startsWith('/v1/responses/')) {
      const responseId = u.pathname.split('/').pop()!;
      providerGets.push(responseId);
      if (failFirstRead) { failFirstRead = false; throw new Error('Transient GET disconnection'); }
      return ok(provider.get(responseId));
    }
    assert.equal(u.pathname, '/rest/v1/ai_analysis_jobs');
    if (req.method === 'POST') {
      const row = { id: crypto.randomUUID(), updated_at: new Date().toISOString(), ...await req.json() };
      database.set(row.id, row);
      return ok(row);
    }
    const rows = [...database.values()].filter(row => [...u.searchParams].every(([field, filter]) => {
      const value = field.split(/->>?/).reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], row);
      return filter === 'is.null' ? value == null : !filter.startsWith('eq.') || String(value) === filter.slice(3);
    }));
    if (req.method === 'PATCH') {
      const patch = await req.json();
      // A valid response older than the former 20-minute cutoff must retain
      // its identity when the next short worker resumes polling it.
      if (patch.provider_started_at) patch.provider_started_at = new Date(Date.now() - 25 * 60_000).toISOString();
      rows.forEach(row => Object.assign(row, patch));
    }
    return ok(req.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
  });
  const globals = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(p: Promise<void>): void }; Deno?: { env: { get(): string } };
  };
  const oldRuntime = globals.EdgeRuntime, oldDeno = globals.Deno;
  globals.EdgeRuntime = { waitUntil: (p: Promise<void>) => tasks.push(p) };
  globals.Deno = { env: { get: () => 'test-value' } };
  t.after(() => { globals.EdgeRuntime = oldRuntime; globals.Deno = oldDeno; });
  async function dispatch(body: Record<string, unknown>, token = 'owner') {
    return handleMatrix(new Request(url, { headers: { Authorization: 'Bearer ' + token } }), body, url, service,
      async () => { throw new Error('Simulated PubMed and Europe PMC outage'); }, createClient);
  }
  const drain = () => drainMatrixTasks(tasks, t);
  await dispatch({ action: 'matrix.start', externalPathologies: elements.map((e, i) => ({ id: String(i), name: e.name })) });
  await drain();
  const [job] = database.values();
  assert.equal(job.status, 'failed');
  assert.deepEqual(providerGets.slice(0, 2), ['ai-1', 'ai-1'], 'a GET error must keep and retry the same generation');
  assert.ok(job.provider_response_id, 'a terminal incomplete response remains available for deliberate resume');
  const [first] = Object.keys(job.result_payload.cells);
  assert.ok(first);
  assert.equal((await (await dispatch({ action: 'matrix.latest', jobId: job.id }, 'other')).json()).job, null);
  assert.equal((await dispatch({ action: 'matrix.work', jobId: job.id })).status, 403);
  assert.equal((await dispatch({ action: 'matrix.latest', patientId: 'inaccessible' })).status, 403);
  truncate = false;
  await dispatch({ action: 'matrix.resume', jobId: job.id });
  await drain();
  assert.equal(job.status, 'completed');
  assert.equal(job.result_payload.analysis.summary, 'Synthèse du test.');
  assert.equal(Object.keys(job.result_payload.cells).length, 3);
  assert.equal((job.result_payload.analysis as { pairAssessments?: unknown[] }).pairAssessments?.length, 3);
  assert.ok(submissions.length >= 3, 'OpenAI must examine pairs even when PubMed is offline');
  assert.equal(submissions.slice(1).flat().includes(first), false);
  assert.equal((await (await dispatch({ action: 'matrix.latest' })).json()).job.id, job.id);
});

async function runMatrixCadenceFixture(t: TestContext, failReads: boolean, loseAcknowledgments = false) {
  const origin = 1_800_000_000_000;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: origin });
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  const count = failReads ? 2 : 15;
  const selected: SelectedElement[] = Array.from({ length: count }, (_, index) => ({ name: `Synthetic ${index}`, type: 'pathology' }));
  const job: Record<string, unknown> = {
    id: '11111111-1111-4111-8111-111111111111', function_name: 'cross-data-analyzer', analysis_mode: 'progressive_matrix',
    status: 'queued', updated_at: new Date().toISOString(), provider_response_id: failReads ? 'resp_saved' : null,
    request_payload: { selection: {}, risk: detectHighRiskContext({ selectedElementCount: count }), _matrix_runtime: { windowStartedAt: origin, retries: 0 } },
    result_payload: { elements: selected, cells: {}, batchSize: 3, analysis: ensureAnalysisShape({ summary: 'Synthetic fixture.' }) },
  };
  const tasks: Promise<void>[] = [];
  const calls = [0];
  const gets: string[] = [];
  const controlReservations = new Map<number, number>();
  let posts = 0;
  const providers = new Map<string, Record<string, unknown>>();
  const base = 'https://matrix.invalid';
  const globals = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(p: Promise<void>): void }; Deno?: { env: { get(name: string): string } };
  };
  const oldRuntime = globals.EdgeRuntime, oldDeno = globals.Deno;
  globals.EdgeRuntime = { waitUntil: work => tasks.push(work) };
  globals.Deno = { env: { get: name => name === 'OPENAI_MODEL' ? 'gpt-6.1-sol' : 'synthetic-key' } };
  t.after(() => { globals.EdgeRuntime = oldRuntime; globals.Deno = oldDeno; });
  const dispatch = (body: Record<string, unknown>) => handleMatrix(new Request(base, {
    headers: { authorization: 'Bearer synthetic-service' },
  }), body, base, 'synthetic-service', async () => [], createClient);
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const ok = (value: unknown) => Response.json(value);
    if (url.pathname === '/functions/v1/cross-data-analyzer') {
      t.mock.timers.tick(100);
      calls.push(Date.now() - origin);
      // Stop only this observational fixture after a full retry window. All
      // persisted state remains available to a subsequent real invocation.
      if (failReads && (Date.now() - origin >= 60_000 || calls.length >= 80)) return ok({ accepted: true });
      const response = await dispatch(await request.json());
      if (loseAcknowledgments) throw new TypeError('Synthetic lost acknowledgment after the relay was accepted.');
      return response;
    }
    if (url.pathname === '/v1/responses' && request.method === 'POST') {
      t.mock.timers.tick(100);
      posts += 1;
      const body = await request.json();
      const payload = JSON.parse(body.input[1].content);
      const result = payload.pairs ? { cells: payload.pairs.map(({ pair }: { pair: { pairHash: string } }) => ({ pairHash: pair.pairHash, links: [], assessment: {
        verdict: 'hypothesis', explanation: 'Analyse OpenAI: association possible non vérifiée',
        limitations: 'Sans source bibliographique directe',
      } })) }
        : { summary: 'Synthetic complete matrix.' };
      const responseId = `resp_${posts}`;
      providers.set(responseId, { id: responseId, status: 'completed', output_text: JSON.stringify(result) });
      return ok({ id: responseId, status: 'queued', max_output_tokens: body.max_output_tokens });
    }
    if (url.pathname.startsWith('/v1/responses/')) {
      t.mock.timers.tick(100);
      const responseId = url.pathname.split('/').pop()!;
      gets.push(responseId);
      if (failReads) throw new Error('Synthetic immediate provider GET failure.');
      return ok(providers.get(responseId));
    }
    assert.equal(url.pathname, '/rest/v1/ai_analysis_jobs');
    const matches = [...url.searchParams].every(([field, filter]) => {
      const value = field.split(/->>?/).reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], job);
      return filter === 'is.null' ? value == null : !filter.startsWith('eq.') || String(value) === filter.slice(3);
    });
    if (request.method === 'PATCH' && matches) {
      const patch = await request.json();
      const runtime = patch.request_payload?._matrix_runtime;
      if (runtime?.controlLease) controlReservations.set(runtime.nextWorkAt, (controlReservations.get(runtime.nextWorkAt) ?? 0) + 1);
      Object.assign(job, patch);
    }
    return ok(request.headers.get('accept')?.includes('vnd.pgrst.object') ? matches ? structuredClone(job) : null : matches ? [structuredClone(job)] : []);
  });
  await dispatch({ action: 'matrix.work', jobId: job.id });
  await drainMatrixTasks(tasks, t);
  const maximum = Math.max(...calls.map(start => calls.filter(at => at >= start && at < start + 60_000).length));
  return { job, calls, maximum, gets, posts, controlReservations, elapsed: Date.now() - origin };
}

test('immediate matrix GET failures keep the saved response and respect the nested invocation quota', async t => {
  const fixture = await runMatrixCadenceFixture(t, true);
  assert.equal(fixture.posts, 0);
  assert.deepEqual([...new Set(fixture.gets)], ['resp_saved']);
  assert.equal(fixture.job.provider_response_id, 'resp_saved');
  assert.equal(fixture.job.status, 'queued');
  assert.ok(fixture.gets.length >= 3, 'GET recovery must continue without a polling browser');
  assert.ok(fixture.maximum <= 30, `Observed ${fixture.maximum} nested invocations in 60 seconds.`);
  t.diagnostic(`Immediate GET failures: maximum ${fixture.maximum}/60 s, ${fixture.gets.length} reads, no provider POST.`);
});

test('fast matrix batches stay paced and lost relay acknowledgments cannot multiply the continuation chain', async t => {
  for (const loseAcknowledgments of [false, true]) await t.test(loseAcknowledgments ? 'every accepted relay acknowledgment is lost' : 'relay acknowledgments arrive', async st => {
    const fixture = await runMatrixCadenceFixture(st, false, loseAcknowledgments);
    assert.equal(fixture.job.status, 'completed');
    const result = fixture.job.result_payload as { cells: Record<string, unknown>; analysis: { summary: string } };
    assert.equal(Object.keys(result.cells).length, 105);
    assert.equal(result.analysis.summary, 'Synthetic complete matrix.');
    assert.equal(fixture.posts, 36, '35 batches and one synthesis must each be generated once');
    assert.equal(fixture.gets.length, 36);
    assert.ok([...fixture.controlReservations.values()].every(count => count === 1), 'Only one waiting invocation may own each continuation');
    assert.ok(fixture.maximum <= 30, `Observed ${fixture.maximum} nested invocations in 60 seconds.`);
    st.diagnostic(`Maximum ${fixture.maximum}/60 s, ${fixture.calls.length} total invocations, ${fixture.elapsed} ms simulated.`);
  });
});
