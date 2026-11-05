import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { handleMatrix } from '../supabase/functions/cross-data-analyzer/matrix-job.ts';
import { buildAgentPairFormat, AGENT_PLAN_FORMAT, ASTRA_MODEL } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';
import type { AgentMatrixState } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';
import { buildPairCandidates, typedElementKey, type PairCandidate, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';

const selected: SelectedElement[] = [
  { name: 'Pathologie Alpha', type: 'pathology' },
  { name: 'Symptôme Bêta', type: 'symptom' },
  { name: 'Médicament Gamma', type: 'medication' },
];
// Entirely simulated provider metadata; no actual clinical assertion or public lookup.
const source = { title: 'Source synthétique du test', url: 'https://www.swissmedic.ch/synthetic-agent-fixture' };
const plan = {
  status: 'no_change_supported', summary: 'Revue synthétique terminée, sans proposition de modification clinique.',
  globalRisks: ['Une lacune de preuve ne démontre aucune innocuité.'],
  missingData: ['Le test ne représente pas un dossier patient.'], candidates: [], options: [],
};

interface StoredJob {
  id: string; status: string; updated_at: string; analysis_mode: string; requested_by: string;
  provider_response_id?: string | null; request_payload: Record<string, unknown>;
  result_payload: AgentMatrixState; [field: string]: unknown;
}
interface ProviderRequest {
  model: string; max_output_tokens: number; tools?: unknown[]; tool_choice?: string;
  input: { content: string }[]; text: { format: { name: string } };
  [field: string]: unknown;
}
interface Submission {
  request: ProviderRequest; pairs: PairCandidate[]; kind: 'pairs' | 'plan' | 'final';
}
interface Behavior {
  partialFirstBatch: boolean; truncateLaterPairs: boolean; nativeEvidence: boolean; failFirstRead: boolean;
  providerModel: string;
  providerStatus: string;
  readFailure: number | 'malformed_json' | 'invalid_object' | 'empty_completed' | null;
  invalidPlanTarget: boolean; invalidResultJson: boolean; failFirstCreation: boolean; failFirstResultSave: boolean;
}

function cell(pair: PairCandidate) {
  const left = typedElementKey(pair.left), right = typedElementKey(pair.right);
  return {
    pairHash: pair.pairHash,
    directions: [
      { fromKey: left, toKey: right, verdict: 'hypothesis',
        explanation: 'Relation synthétique examinée dans le premier sens.',
        limitations: 'Aucune conclusion clinique ne découle de ce test.', sourceUrls: [source.url] },
      { fromKey: right, toKey: left, verdict: 'insufficient',
        explanation: 'Relation synthétique examinée dans le sens inverse.',
        limitations: 'Données insuffisantes pour une relation inverse.', sourceUrls: [] },
    ],
    links: [],
  };
}

async function drain(tasks: Promise<void>[], t: TestContext) {
  let ticks = 0;
  while (tasks.length) {
    const task = tasks.shift()!;
    let settled = false;
    void task.then(() => { settled = true; }, () => { settled = true; });
    while (!settled) {
      for (let step = 0; step < 150; step++) await Promise.resolve();
      if (!settled) {
        assert.ok(ticks++ < 10_000, 'The autonomous Astra worker did not settle.');
        t.mock.timers.tick(100);
      }
    }
    await task;
  }
}

function fixture(t: TestContext, initial: Partial<Behavior> = {}, functionName = 'cross-data-analyzer') {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);
  const behavior: Behavior = {
    partialFirstBatch: false, truncateLaterPairs: false, nativeEvidence: true, failFirstRead: false,
    providerModel: ASTRA_MODEL, providerStatus: 'completed', readFailure: null,
    invalidPlanTarget: false, invalidResultJson: false, failFirstCreation: false, failFirstResultSave: false, ...initial,
  };
  const tasks: Promise<void>[] = [];
  const rows = new Map<string, StoredJob>();
  const providers = new Map<string, Record<string, unknown>>();
  const submissions: Submission[] = [], gets: string[] = [], relays: Record<string, unknown>[] = [];
  const base = 'https://astra-worker.invalid', service = 'synthetic-service';
  let searchCalls = 0, pairPosts = 0;
  const globals = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<void>): void };
    Deno?: { env: { get(name: string): string | undefined } };
  };
  const oldRuntime = globals.EdgeRuntime, oldDeno = globals.Deno;
  globals.EdgeRuntime = { waitUntil: promise => tasks.push(promise) };
  globals.Deno = { env: { get: name => ({
    OPENAI_API_KEY: 'synthetic-api-key', OPENAI_MODEL: 'gpt-6-luna', SUPABASE_ANON_KEY: 'synthetic-anon',
  })[name] } };
  t.after(() => { globals.EdgeRuntime = oldRuntime; globals.Deno = oldDeno; });

  const dispatch = (body: Record<string, unknown>, token = 'owner') => handleMatrix(new Request(base, {
    headers: { Authorization: token ? 'Bearer ' + token : '' },
  }), body, base, service, async () => {
    searchCalls++;
    throw new Error('The legacy PubMed lookup must not run in native agent mode.');
  }, createClient, functionName);

  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.pathname === '/functions/v1/' + functionName) {
      const body = await request.json();
      relays.push(structuredClone(body));
      return dispatch(body, service);
    }
    if (url.pathname === '/auth/v1/user') {
      const token = request.headers.get('authorization')?.slice(7);
      return ['owner', 'other'].includes(token || '')
        ? Response.json({ id: token })
        : Response.json({ message: 'Invalid token' }, { status: 401 });
    }
    if (url.pathname === '/rest/v1/patients') return Response.json([]);
    if (url.pathname === '/v1/responses' && request.method === 'POST') {
      const body = await request.json() as ProviderRequest;
      const payload = JSON.parse(body.input[1].content);
      const pairs: PairCandidate[] = payload.pairs?.map(({ pair }: { pair: PairCandidate }) => pair) || [];
      const kind = pairs.length ? 'pairs' : body.tools?.length ? 'plan' : 'final';
      submissions.push({ request: body, pairs, kind });
      if (kind === 'pairs') pairPosts++;
      const id = `resp_astra_${submissions.length}`;
      const incomplete = kind === 'pairs' && behavior.truncateLaterPairs && pairPosts > 1;
      const result = kind === 'pairs'
        ? { cells: (behavior.partialFirstBatch && pairPosts === 1 ? pairs.slice(0, 1) : pairs).map(cell), warnings: [] }
        : kind === 'plan' && behavior.invalidPlanTarget ? { ...plan, status: 'review_required', options: [{
          id: 'synthetic-monitoring', title: 'Surveillance synthétique', rationale: 'Justification synthétique.',
          sourceUrls: [source.url], changes: [{ action: 'monitor', target: 'Cible absente de la sélection',
            rationale: 'Justification synthétique.', sourceUrls: [source.url] }],
        }] } : plan;
      providers.set(id, {
        id, model: behavior.providerModel, status: incomplete ? 'incomplete' : behavior.providerStatus,
        max_output_tokens: body.max_output_tokens,
        ...(incomplete ? { incomplete_details: { reason: 'max_output_tokens' } }
          : { output_text: behavior.invalidResultJson ? '{ invalid synthetic JSON' : JSON.stringify(result) }),
        output: behavior.nativeEvidence && kind !== 'final' ? [{
          type: 'web_search_call', id: 'ws_' + id, status: 'completed',
          action: { type: 'search', sources: [{ type: 'url', ...source }] },
        }] : [],
      });
      if (behavior.failFirstCreation) {
        behavior.failFirstCreation = false;
        throw new Error('Synthetic lost creation acknowledgement.');
      }
      return Response.json({ id, status: 'queued', max_output_tokens: body.max_output_tokens });
    }
    if (url.pathname.startsWith('/v1/responses/')) {
      const id = url.pathname.split('/').pop()!;
      gets.push(id);
      if (behavior.failFirstRead) {
        behavior.failFirstRead = false;
        throw new Error('Transient synthetic provider read failure.');
      }
      const submission = submissions[Number(id.split('_').pop()) - 1];
      assert.equal(url.searchParams.getAll('include[]').includes('web_search_call.action.sources'), submission.kind !== 'final');
      if (typeof behavior.readFailure === 'number') return Response.json({ error: { code: 'synthetic_read_error' } }, { status: behavior.readFailure });
      if (behavior.readFailure === 'malformed_json') return new Response('{ invalid synthetic JSON', { status: 200 });
      if (behavior.readFailure === 'invalid_object') return Response.json([]);
      if (behavior.readFailure === 'empty_completed') return Response.json({ id, status: 'completed', model: ASTRA_MODEL, output: [] });
      return Response.json(providers.get(id));
    }
    assert.equal(url.pathname, '/rest/v1/ai_analysis_jobs');
    if (request.method === 'POST') {
      const row: StoredJob = { id: crypto.randomUUID(), updated_at: new Date().toISOString(), ...await request.json() };
      rows.set(row.id, row);
      return Response.json(row);
    }
    const matched = [...rows.values()].filter(row => [...url.searchParams].every(([field, filter]) => {
      const value = field.split(/->>?/).reduce<unknown>((current, key) => (current as Record<string, unknown> | undefined)?.[key], row);
      return filter === 'is.null' ? value == null : !filter.startsWith('eq.') || String(value) === filter.slice(3);
    }));
    if (request.method === 'PATCH') {
      const patch = await request.json();
      if (behavior.failFirstResultSave && patch.provider_response_id === null && Object.keys(patch.result_payload?.cells || {}).length) {
        behavior.failFirstResultSave = false;
        return Response.json({ message: 'Synthetic persistence failure.' }, { status: 500 });
      }
      matched.forEach(row => Object.assign(row, patch));
    }
    return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? matched[0] ?? null : matched);
  });

  const start = async (elements = selected) => {
    const keys = { pathology: 'externalPathologies', symptom: 'externalSymptoms', medication: 'externalMedications', treatment: 'externalTreatments' };
    const body: Record<string, unknown> = { action: 'agent.start' };
    for (const type of Object.keys(keys) as SelectedElement['type'][]) {
      body[keys[type]] = elements.filter(e => e.type === type).map((e, i) => ({ id: `${type}-${i}`, name: e.name }));
    }
    const response = await dispatch(body);
    assert.equal(response.status, 202);
    const data = await response.json();
    assert.ok(data.job?.id);
    return rows.get(data.job.id)!;
  };
  return { start, dispatch, drain: () => drain(tasks, t), rows, behavior, submissions, gets, relays,
    get searchCalls() { return searchCalls; } };
}

test('Astra analyzes every pair in both directions and finishes its sourced plan without a polling browser', async t => {
  const f = fixture(t);
  const job = await f.start();
  await f.drain();
  assert.equal(job.analysis_mode, 'astra_cross_matrix');
  assert.equal(job.model, ASTRA_MODEL);
  assert.equal(job.status, 'completed');
  assert.deepEqual(f.submissions.map(s => s.kind), ['pairs', 'pairs', 'pairs', 'plan', 'final']);
  for (const { kind, request, pairs } of f.submissions) {
    if (kind === 'pairs') assert.equal(pairs.length, 1, 'Each pair must own its own executed web-search trace.');
    assert.equal(request.model, ASTRA_MODEL, 'An environment default must never replace the requested Astra model.');
    assert.deepEqual(request.text.format, kind === 'pairs' ? buildAgentPairFormat(pairs) : AGENT_PLAN_FORMAT);
    assert.equal(request.tool_choice, kind === 'final' ? undefined : 'required');
    assert.equal(Boolean(request.tools?.length), kind !== 'final');
  }
  const result = job.result_payload;
  assert.equal(result.analysis.agentReview?.stage, 'completed');
  assert.equal(result.analysis.agentReview?.coverage.totalPairs, 3);
  assert.equal(result.analysis.agentReview?.coverage.reviewedPairs, 3);
  assert.equal(result.analysis.agentReview?.plan?.status, 'no_change_supported');
  assert.equal(result.analysis.summary, plan.summary);
  assert.deepEqual(Object.keys(result.cells).sort(), buildPairCandidates(selected).map(p => p.pairHash).sort());
  for (const assessment of result.analysis.pairAssessments || []) {
    assert.equal(assessment.directions?.length, 2);
    const [forward, backward] = assessment.directions!;
    assert.equal(forward.fromKey, backward.toKey);
    assert.equal(forward.toKey, backward.fromKey);
    assert.equal(assessment.evidenceOrigin, 'openai_web_search');
  }
  assert.equal(result.agent.sourceRegistry[0].url, source.url);
  assert.equal(f.searchCalls, 0);
  assert.ok(f.relays.every(body => body.action === 'agent.work'));
  const visible = await (await f.dispatch({ action: 'agent.latest', jobId: job.id })).json();
  assert.equal(visible.job.id, job.id);
  assert.equal('provider_response_id' in visible.job, false);
  assert.equal((await (await f.dispatch({ action: 'matrix.latest', jobId: job.id })).json()).job, null);
});

test('Astra jobs keep owner and patient authorization on latest, resume and worker entry points', async t => {
  const f = fixture(t);
  const job = await f.start(selected.slice(0, 2));
  await f.drain();
  for (const action of ['agent.latest', 'agent.resume']) {
    assert.equal((await (await f.dispatch({ action, jobId: job.id }, 'other')).json()).job, null);
  }
  assert.equal((await f.dispatch({ action: 'agent.work', jobId: job.id })).status, 403);
  assert.equal((await f.dispatch({ action: 'agent.latest', patientId: 'inaccessible-patient' })).status, 403);
  assert.equal((await f.dispatch({ action: 'agent.latest' }, '')).status, 401);
  assert.equal(f.submissions.length, 3);
  assert.equal(f.searchCalls, 0);
});

test('provider read interruptions and token limits preserve reviewed pairs for an explicit Astra resume', async t => {
  const f = fixture(t, { partialFirstBatch: true, truncateLaterPairs: true, failFirstRead: true });
  const job = await f.start();
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.ok(job.provider_response_id, 'The terminal incomplete response must remain available until resume.');
  assert.deepEqual(f.gets.slice(0, 2), ['resp_astra_1', 'resp_astra_1']);
  const completed = Object.keys(job.result_payload.cells);
  assert.equal(completed.length, 1);
  const beforeResume = f.submissions.length;
  f.behavior.truncateLaterPairs = false;
  assert.equal((await f.dispatch({ action: 'agent.resume', jobId: job.id })).status, 200);
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(job.result_payload.analysis.agentReview?.coverage.reviewedPairs, 3);
  assert.equal(job.result_payload.analysis.pairAssessments?.length, 3);
  assert.equal(f.submissions.slice(beforeResume).flatMap(s => s.pairs).some(pair => completed.includes(pair.pairHash)), false);
  assert.equal(f.searchCalls, 0);
});

test('a model bibliography without a native web trace fails the stage and can be explicitly retried', async t => {
  const f = fixture(t, { nativeEvidence: false });
  const job = await f.start(selected.slice(0, 2));
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.notEqual(job.result_payload.analysis.agentReview?.stage, 'completed');
  assert.deepEqual(job.result_payload.cells, {});
  assert.equal(f.submissions.length, 1, 'There must be no automatic paid regeneration of an invalid completed answer.');
  assert.equal(job.provider_response_id, 'resp_astra_1');
  assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
  f.behavior.nativeEvidence = true;
  await f.dispatch({ action: 'agent.resume', jobId: job.id });
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(job.result_payload.analysis.agentReview?.coverage.reviewedPairs, 1);
  assert.equal(f.searchCalls, 0);
});

test('a response from another model is retained for audit and replaced only by an explicit Astra resume', async t => {
  const f = fixture(t, { providerModel: 'gpt-6-luna' });
  const job = await f.start(selected.slice(0, 2));
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.deepEqual(job.result_payload.cells, {});
  assert.equal(f.submissions.length, 1);
  assert.equal(f.searchCalls, 0);
  assert.equal(job.provider_response_id, 'resp_astra_1');
  assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
  await f.dispatch({ action: 'agent.latest', jobId: job.id });
  await f.drain();
  assert.equal(f.submissions.length, 1);
  f.behavior.providerModel = ASTRA_MODEL;
  await f.dispatch({ action: 'agent.resume', jobId: job.id });
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(f.submissions.length, 4);
  assert.deepEqual(f.gets.slice(0, 2), ['resp_astra_1', 'resp_astra_2']);
  assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).lastRejectedResponseId, 'resp_astra_1');
});

for (const providerStatus of ['failed', 'cancelled', 'unknown']) {
  test(`provider ${providerStatus} waits for explicit resume before generating a new response`, async t => {
    const f = fixture(t, { providerStatus });
    const job = await f.start(selected.slice(0, 2));
    await f.drain();
    assert.equal(job.status, 'failed');
    assert.equal(job.provider_response_id, 'resp_astra_1');
    assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
    await f.dispatch({ action: 'agent.latest', jobId: job.id });
    await f.drain();
    assert.equal(f.submissions.length, 1);
    f.behavior.providerStatus = 'completed';
    await f.dispatch({ action: 'agent.resume', jobId: job.id });
    await f.drain();
    assert.equal(job.status, 'completed');
    assert.equal(f.submissions.length, 4);
    assert.deepEqual(f.gets.slice(0, 2), ['resp_astra_1', 'resp_astra_2']);
    assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).lastRejectedResponseId, 'resp_astra_1');
  });
}

for (const readFailure of [404, 'malformed_json', 'invalid_object', 'empty_completed'] as const) {
  test(`provider GET ${readFailure} retains its ID until explicit regeneration`, async t => {
    const f = fixture(t, { readFailure });
    const job = await f.start(selected.slice(0, 2));
    await f.drain();
    assert.equal(job.status, 'failed');
    assert.equal(job.provider_response_id, 'resp_astra_1');
    assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
    await f.dispatch({ action: 'agent.latest', jobId: job.id });
    await f.drain();
    assert.equal(f.submissions.length, 1);
    f.behavior.readFailure = null;
    await f.dispatch({ action: 'agent.resume', jobId: job.id });
    await f.drain();
    assert.equal(job.status, 'completed');
    assert.equal(f.submissions.length, 4);
    assert.deepEqual(f.gets.slice(0, 2), ['resp_astra_1', 'resp_astra_2']);
    assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).lastRejectedResponseId, 'resp_astra_1');
  });
}

for (const readFailure of [400, 401, 403]) {
  test(`provider GET ${readFailure} preserves the response for a corrected request or authorization`, async t => {
    const f = fixture(t, { readFailure });
    const job = await f.start(selected.slice(0, 2));
    await f.drain();
    assert.equal(job.status, 'failed');
    assert.equal(job.provider_response_id, 'resp_astra_1');
    assert.notEqual((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
    assert.equal(f.submissions.length, 1);
    f.behavior.readFailure = null;
    await f.dispatch({ action: 'agent.resume', jobId: job.id });
    await f.drain();
    assert.equal(job.status, 'completed');
    assert.equal(f.submissions.length, 3, 'The response must not be regenerated for an authorization or request correction.');
    assert.deepEqual(f.gets.slice(0, 2), ['resp_astra_1', 'resp_astra_1']);
    assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).lastRejectedResponseId, undefined);
  });
}

test('a completed response with malformed result JSON is replaced only on explicit resume', async t => {
  const f = fixture(t, { invalidResultJson: true });
  const job = await f.start(selected.slice(0, 2));
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.equal(job.provider_response_id, 'resp_astra_1');
  assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
  assert.equal(f.submissions.length, 1);
  f.behavior.invalidResultJson = false;
  await f.dispatch({ action: 'agent.resume', jobId: job.id });
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.deepEqual(f.gets.slice(0, 2), ['resp_astra_1', 'resp_astra_2']);
});

test('an invalid monitoring target regenerates only its plan and preserves every reviewed cell', async t => {
  const f = fixture(t, { invalidPlanTarget: true });
  const job = await f.start();
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.equal(job.provider_response_id, 'resp_astra_4');
  assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
  const cells = structuredClone(job.result_payload.cells);
  const assessments = structuredClone(job.result_payload.analysis.pairAssessments);
  assert.equal(Object.keys(cells).length, 3);
  assert.deepEqual(f.submissions.map(s => s.kind), ['pairs', 'pairs', 'pairs', 'plan']);
  f.behavior.invalidPlanTarget = false;
  const resumed = await (await f.dispatch({ action: 'agent.resume', jobId: job.id })).json();
  assert.equal(resumed.job.status, 'queued');
  assert.equal(resumed.job.progress_message,
    '3 / 3 paires analysées dans les deux sens · recherche de pistes d’optimisation et revue globale.',
    'An accepted resume must describe the active stage before another provider result arrives.');
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.deepEqual(job.result_payload.cells, cells);
  assert.deepEqual(job.result_payload.analysis.pairAssessments, assessments);
  assert.deepEqual(f.submissions.slice(4).map(s => s.kind), ['plan', 'final']);
  assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).lastRejectedResponseId, 'resp_astra_4');
});

test('a persistence failure after valid provider output does not mark the response for regeneration', async t => {
  const f = fixture(t, { failFirstResultSave: true });
  const job = await f.start(selected.slice(0, 2));
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.equal(job.provider_response_id, 'resp_astra_1');
  assert.notEqual((job.request_payload._matrix_runtime as Record<string, unknown>).regenerationRequired, true);
  assert.equal(f.submissions.length, 1);
  await f.dispatch({ action: 'agent.resume', jobId: job.id });
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(f.submissions.length, 3);
  assert.deepEqual(f.gets.slice(0, 2), ['resp_astra_1', 'resp_astra_1']);
});

test('an ambiguous creation never launches another paid response before explicit resume', async t => {
  const f = fixture(t, { failFirstCreation: true });
  const job = await f.start(selected.slice(0, 2));
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.equal(job.provider_response_id, undefined);
  assert.equal((job.request_payload._matrix_runtime as Record<string, unknown>).creationPending, true);
  assert.equal(f.submissions.length, 1);
  await f.dispatch({ action: 'agent.latest', jobId: job.id });
  await f.drain();
  assert.equal(f.submissions.length, 1);
  await f.dispatch({ action: 'agent.resume', jobId: job.id });
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(f.submissions.length, 4);
});

test('an isolated preview function keeps autonomous relays and stored jobs in its own namespace', async t => {
  const f = fixture(t, {}, 'cross-data-analyzer-astra-preview');
  const job = await f.start(selected.slice(0, 2));
  await f.drain();
  assert.equal(job.function_name, 'cross-data-analyzer-astra-preview');
  assert.equal(job.status, 'completed');
  assert.ok(f.relays.length >= 3);
  assert.ok(f.relays.every(body => body.action === 'agent.work'));
  assert.equal(f.searchCalls, 0);
});
