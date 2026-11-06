import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { handleMatrix } from '../supabase/functions/cross-data-analyzer/matrix-job.ts';
import { buildAgentPairFormat, AGENT_PLAN_FORMAT, ASTRA_MODEL } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';
import { createAgentState, type AgentMatrixState } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';
import { buildPairCandidates, typedElementKey, type PairCandidate, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import type { AgentPairPool } from '../supabase/functions/cross-data-analyzer/agent-pair-pool.ts';
import { detectHighRiskContext } from '../supabase/functions/_shared/clinical-brain.ts';

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
  at: number;
}
interface Behavior {
  partialFirstBatch: boolean; truncateLaterPairs: boolean; nativeEvidence: boolean; failFirstRead: boolean;
  providerModel: string;
  providerStatus: string;
  readFailure: number | 'malformed_json' | 'invalid_object' | 'empty_completed' | null;
  invalidPlanTarget: boolean; invalidResultJson: boolean; failFirstCreation: boolean; failFirstResultSave: boolean;
  loseFirstResultAcknowledgement: boolean; failFirstReceiptSave: boolean;
  slowFirstReadMs: number; providerLatencyMs: number; creationRateLimits: number; retryAfterSeconds: number;
  rateLimitCode: string; firstResponseReadError: number | null;
  terminalErrorCode: string | null;
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
    invalidPlanTarget: false, invalidResultJson: false, failFirstCreation: false, failFirstResultSave: false,
    loseFirstResultAcknowledgement: false, failFirstReceiptSave: false, slowFirstReadMs: 0, providerLatencyMs: 0,
    creationRateLimits: 0, retryAfterSeconds: 0, rateLimitCode: 'rate_limit_exceeded', firstResponseReadError: null, terminalErrorCode: null, ...initial,
  };
  const tasks: Promise<void>[] = [];
  const rows = new Map<string, StoredJob>();
  const providers = new Map<string, Record<string, unknown>>();
  const submissions: Submission[] = [], gets: string[] = [], relays: Record<string, unknown>[] = [];
  const events: string[] = [];
  const savedCellOrders: string[][] = [];
  const persistedAt: { at: number; count: number }[] = [];
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
      submissions.push({ request: body, pairs, kind, at: Date.now() });
      events.push('submit');
      if (behavior.creationRateLimits > 0) {
        behavior.creationRateLimits--;
        return Response.json({ error: { code: behavior.rateLimitCode } }, { status: 429,
          headers: { 'retry-after': String(behavior.retryAfterSeconds) } });
      }
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
        ...(behavior.terminalErrorCode ? { error: { code: behavior.terminalErrorCode, message: 'Synthetic provider failure.' } } : {}),
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
      events.push('read');
      if (behavior.failFirstRead) {
        behavior.failFirstRead = false;
        throw new Error('Transient synthetic provider read failure.');
      }
      const submission = submissions[Number(id.split('_').pop()) - 1];
      assert.equal(url.searchParams.getAll('include[]').includes('web_search_call.action.sources'), submission.kind !== 'final');
      if (id === 'resp_astra_1' && behavior.slowFirstReadMs) {
        const delay = behavior.slowFirstReadMs; behavior.slowFirstReadMs = 0;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      if (id === 'resp_astra_1' && behavior.firstResponseReadError)
        return Response.json({ error: { code: 'synthetic_read_error' } }, { status: behavior.firstResponseReadError });
      if (Date.now() - submission.at < behavior.providerLatencyMs) return Response.json({ id, status: 'in_progress', model: ASTRA_MODEL });
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
      if (behavior.failFirstReceiptSave && patch.request_payload?._matrix_runtime?.parallel?.slots.some((s: { responseId?: string }) => s.responseId)) {
        behavior.failFirstReceiptSave = false;
        return Response.json({ message: 'Synthetic receipt persistence failure.' }, { status: 500 });
      }
      if (behavior.failFirstResultSave && patch.provider_response_id === null && Object.keys(patch.result_payload?.cells || {}).length) {
        behavior.failFirstResultSave = false;
        return Response.json({ message: 'Synthetic persistence failure.' }, { status: 500 });
      }
      matched.forEach(row => Object.assign(row, patch));
      if (patch.result_payload?.cells && matched.length) {
        savedCellOrders.push(Object.keys(patch.result_payload.cells));
        persistedAt.push({ at: Date.now(), count: Object.keys(patch.result_payload.cells).length });
        if (behavior.loseFirstResultAcknowledgement && Object.keys(patch.result_payload.cells).length) {
          behavior.loseFirstResultAcknowledgement = false;
          return Response.json({ message: 'Synthetic committed write with lost acknowledgement.' }, { status: 500 });
        }
      }
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
  const seedLegacy = (elements: SelectedElement[]) => {
    const state = createAgentState(elements);
    state.batchSize = 1;
    const pair = buildPairCandidates(elements)[0];
    submissions.push({ request: {} as ProviderRequest, pairs: [pair], kind: 'pairs', at: Date.now() });
    providers.set('resp_astra_1', { id: 'resp_astra_1', status: 'completed', model: ASTRA_MODEL,
      output_text: JSON.stringify({ cells: [cell(pair)], warnings: [] }),
      output: [{ type: 'web_search_call', id: 'ws_legacy', status: 'completed', action: { type: 'search', sources: [{ type: 'url', ...source }] } }] });
    const job: StoredJob = { id: crypto.randomUUID(), status: 'queued', updated_at: new Date().toISOString(),
      analysis_mode: 'astra_cross_matrix', function_name: functionName, requested_by: 'owner', provider_response_id: 'resp_astra_1',
      request_payload: { scope: 'general', selection: {}, risk: detectHighRiskContext({ selectedElementCount: elements.length }),
        _matrix_runtime: { windowStartedAt: Date.now(), retries: 0 } }, result_payload: state };
    rows.set(job.id, job);
    return job;
  };
  return { start, seedLegacy, dispatch, drain: () => drain(tasks, t), rows, behavior, submissions, gets, relays, events, savedCellOrders, persistedAt,
    get searchCalls() { return searchCalls; } };
}

test('large Astra selections start eight disjoint background batches before waiting for any one response', async t => {
  const f = fixture(t);
  const elements: SelectedElement[] = Array.from({ length: 9 }, (_, i) => ({ name: `Concept synthétique ${i}`, type: 'pathology' }));
  const job = await f.start(elements);
  await f.drain();
  assert.equal(f.events.indexOf('read'), 8, 'All eight background responses must be launched before the first poll.');
  assert.equal(job.status, 'completed');
  const pairs = f.submissions.filter(s => s.kind === 'pairs').flatMap(s => s.pairs);
  assert.equal(pairs.length, 36);
  assert.equal(new Set(pairs.map(p => p.pairHash)).size, 36);
  assert.equal(job.result_payload.analysis.agentReview?.coverage.reviewedPairs, 36);
});

const largeSelection: SelectedElement[] = Array.from({ length: 9 }, (_, i) => ({ name: `Concept synthétique ${i}`, type: 'pathology' }));
const poolOf = (job: StoredJob) => (job.request_payload._matrix_runtime as { parallel: AgentPairPool }).parallel;

test('a slow first response does not delay the other durable parallel results', async t => {
  const f = fixture(t, { slowFirstReadMs: 8000 });
  const job = await f.start(largeSelection);
  await f.drain();
  const firstPair = f.submissions[0].pairs[0].pairHash;
  const firstSaved = f.savedCellOrders.find(order => order.length)!;
  assert.equal(firstSaved.length, 4);
  assert.equal(firstSaved.includes(firstPair), false);
  assert.equal(job.status, 'completed');
  assert.equal(poolOf(job).peakConcurrentBatches, 8);
});

test('a production-era single-pair response completes before the remaining selection upgrades to parallel execution', async t => {
  const f = fixture(t);
  const job = f.seedLegacy(largeSelection);
  await f.dispatch({ action: 'agent.work', jobId: job.id }, 'synthetic-service');
  await f.drain();
  assert.equal(f.gets[0], 'resp_astra_1');
  assert.equal(f.submissions[0].pairs.length, 1);
  assert.equal(f.submissions[1].pairs.length, 4);
  assert.equal(f.submissions.flatMap(s => s.pairs).length, 36);
  assert.equal(job.status, 'completed');
  assert.equal(poolOf(job).peakConcurrentBatches, 8);
});

test('a partial parallel batch retains valid cells and schedules only its missing pairs', async t => {
  const f = fixture(t, { partialFirstBatch: true });
  const job = await f.start(largeSelection);
  await f.drain();
  assert.equal(job.status, 'completed');
  const firstReviewed = f.submissions[0].pairs[0].pairHash;
  assert.equal(f.submissions.flatMap(s => s.pairs).filter(p => p.pairHash === firstReviewed).length, 1);
  assert.equal(job.result_payload.analysis.pairAssessments?.length, 36);
  assert.equal(poolOf(job).completedPairs, 36);
});

test('parallel token retries preserve siblings and require explicit recovery after their bounded retry', async t => {
  const f = fixture(t, { truncateLaterPairs: true });
  const job = await f.start(largeSelection);
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.equal(Object.keys(job.result_payload.cells).length, 4);
  const saved = new Set(Object.keys(job.result_payload.cells));
  assert.ok(poolOf(job).slots.some(s => s.tokenRetries === 1 && s.phase === 'blocked'));
  const before = f.submissions.length;
  f.behavior.truncateLaterPairs = false;
  await f.dispatch({ action: 'agent.resume', jobId: job.id });
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(f.submissions.slice(before).flatMap(s => s.pairs).some(p => saved.has(p.pairHash)), false);
});

for (const failure of ['failFirstResultSave', 'loseFirstResultAcknowledgement'] as const) {
  test(`parallel ${failure} reloads canonical state without overwriting committed pairs or regenerating a response`, async t => {
    const f = fixture(t, { [failure]: true });
    const job = await f.start(largeSelection);
    await f.drain();
    assert.equal(job.status, 'completed');
    assert.equal(f.submissions.filter(s => s.kind === 'pairs').length, 9);
    assert.equal(job.result_payload.analysis.pairAssessments?.length, 36);
    assert.ok(f.savedCellOrders.every((order, i, all) => i === 0 || order.length >= all[i - 1].length), 'A lost acknowledgement must never roll back progress.');
    assert.equal(poolOf(job).slots.length, 0);
  });
}

test('an unconfirmed parallel creation or receipt never causes an automatic second paid POST', async t => {
  const f = fixture(t, { failFirstReceiptSave: true });
  const job = await f.start(largeSelection);
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.equal(f.submissions.length, 1);
  assert.equal(poolOf(job).slots[0].error?.code, 'creation_unconfirmed');
  await f.dispatch({ action: 'agent.latest', jobId: job.id });
  await f.drain();
  assert.equal(f.submissions.length, 1);
  await f.dispatch({ action: 'agent.resume', jobId: job.id });
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(job.result_payload.analysis.agentReview?.coverage.reviewedPairs, 36);
});

for (const readFailure of [401, 404]) {
  test(`parallel HTTP ${readFailure} preserves successful siblings and retries only the affected receipt or pairs`, async t => {
    const f = fixture(t, { firstResponseReadError: readFailure });
    const job = await f.start(largeSelection);
    await f.drain();
    assert.equal(job.status, 'failed');
    assert.equal(Object.keys(job.result_payload.cells).length, 28);
    const saved = new Set(Object.keys(job.result_payload.cells));
    const before = f.submissions.length;
    f.behavior.firstResponseReadError = null;
    await f.dispatch({ action: 'agent.resume', jobId: job.id });
    await f.drain();
    assert.equal(job.status, 'completed');
    assert.equal(f.submissions.slice(before).flatMap(s => s.pairs).some(pair => saved.has(pair.pairHash)), false);
    assert.equal(f.gets.filter(id => id === 'resp_astra_1').length, readFailure === 401 ? 2 : 1);
  });
}

test('rate limiting respects Retry-After, reduces concurrency, and never becomes missing clinical evidence', async t => {
  const f = fixture(t, { creationRateLimits: 1, retryAfterSeconds: 25 });
  const job = await f.start(largeSelection);
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.ok(f.submissions[1].at - f.submissions[0].at >= 25_000);
  assert.equal(poolOf(job).concurrency, 4);
  assert.equal(poolOf(job).rateLimitEvents, 1);
  assert.equal(job.result_payload.analysis.pairAssessments?.length, 36);
});

test('billing quota rejection pauses without automatic paid retries', async t => {
  const f = fixture(t, { creationRateLimits: 1, rateLimitCode: 'insufficient_quota' });
  const job = await f.start(largeSelection);
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.equal(f.submissions.length, 1);
  assert.equal(poolOf(job).slots[0].error?.code, 'insufficient_quota');
  assert.equal(job.result_payload.analysis.pairAssessments?.length, 0);
  assert.match(String(job.error_message), /crédit.*épuisé/);
});

test('an accepted background response that later exhausts credits explains the pause without exposing provider text', async t => {
  const f = fixture(t, { providerStatus: 'failed', terminalErrorCode: 'credit_balance_exhausted' });
  const job = await f.start(largeSelection);
  await f.drain();
  assert.equal(job.status, 'failed');
  assert.match(String(job.error_message), /crédit.*épuisé/);
  assert.equal(poolOf(job).slots[0].error?.code, 'credit_balance_exhausted');
  assert.equal(f.submissions.length, 8);
  assert.equal(JSON.stringify(job.request_payload).includes('Synthetic provider failure'), false);
});

test('duplicate parallel worker deliveries share the lease and never duplicate pair assignments', async t => {
  const f = fixture(t, { providerLatencyMs: 20_000 });
  const job = await f.start(largeSelection);
  await Promise.all(Array.from({ length: 6 }, () => f.dispatch({ action: 'agent.work', jobId: job.id }, 'synthetic-service')));
  await f.drain();
  assert.equal(job.status, 'completed');
  assert.equal(f.submissions.filter(s => s.kind === 'pairs').length, 9);
  const visible = await (await f.dispatch({ action: 'agent.latest', jobId: job.id })).json();
  assert.equal(visible.job.execution.peakConcurrentBatches, 8);
  assert.equal(JSON.stringify(visible).includes('resp_astra_'), false);
  assert.equal(JSON.stringify(visible).includes('pairHashes'), false);
});

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
