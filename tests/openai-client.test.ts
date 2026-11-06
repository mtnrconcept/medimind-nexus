import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  callAI,
  retrieveBackgroundAI,
  startBackgroundAI,
  streamAI,
  OpenAIRequestError,
  type AICallOptions,
} from '../supabase/functions/_shared/ai-client.ts';

const baseOptions: AICallOptions = { model: 'gpt-6-luna', skipClinicalBrain: true };
const asJson = (data: unknown) => new Response(JSON.stringify(data), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
const completed = (text = 'Réponse complète.') => ({ id: 'resp_complete', status: 'completed', output_text: text });

function mockProvider(t: TestContext, fetcher: typeof fetch) {
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => key === 'OPENAI_API_KEY' ? 'test-only-key' : undefined },
  };
  t.after(() => { (globalThis as { Deno?: unknown }).Deno = originalDeno; });
  t.mock.method(globalThis, 'fetch', fetcher);
}

function eventStream(events: unknown[], splitAt = 0): Response {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      if (splitAt) {
        for (let i = 0; i < bytes.length; i += splitAt) controller.enqueue(bytes.slice(i, i + splitAt));
      } else controller.enqueue(bytes);
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}

type InterruptedResponse = Error & {
  reason?: string; responseId?: string; partialText?: string; maxOutputTokens?: number; resumable?: boolean;
};

test('every OpenAI request leaves room for reasoning and preserves larger explicit budgets', async (t) => {
  const seen: number[] = [];
  mockProvider(t, async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    seen.push(body.max_output_tokens);
    return asJson(completed());
  });
  for (const options of [
    {}, { reasoningEffort: 'low', maxTokens: 100 }, { reasoningEffort: 'medium', maxTokens: 4096 },
    { reasoningEffort: 'high' }, { reasoningEffort: 'xhigh' }, { reasoningEffort: 'max' },
    { reasoningEffort: 'medium', maxTokens: 80_000 }, { maxTokens: 2_000_000 },
  ] as AICallOptions[]) await callAI('Return text.', 'Example.', { ...baseOptions, ...options });
  assert.deepEqual(seen, [16_384, 16_384, 32_768, 32_768, 65_536, 65_536, 80_000, 128_000]);
});

test('pair research sends Luna without reasoning with required medical web search and structured output in direct and background requests', async (t) => {
  const retrieved = { title: 'Synthetic retrieved record', url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/' };
  const responseFormat = { type: 'json_schema', name: 'pair_relation_research', strict: true,
    schema: { type: 'object', properties: { relation: { type: 'string' } }, required: ['relation'], additionalProperties: false } };
  const domains = ['pubmed.ncbi.nlm.nih.gov', 'fda.gov'];
  for (const mode of ['direct', 'background'] as const) {
    await t.test(mode, async (st) => {
      let body: Record<string, unknown> = {};
      let url = '';
      mockProvider(st, async (input, init) => {
        url = String(input); body = JSON.parse(String(init?.body));
        return asJson(mode === 'background' ? { id: 'resp_pair', status: 'queued' } : {
          ...completed('{"relation":"unverified","sources":["https://invented.invalid/claim"]}'),
          output: [{ type: 'web_search_call', id: 'search_pair', status: 'completed', action: { type: 'search', sources: [retrieved] } }],
        });
      });
      const options: AICallOptions = {
        clinicalTask: 'pair_relation_research', model: 'gpt-6-luna', forceModel: true,
        reasoningEffort: 'none', maxTokens: 8_192, responseFormat, temperature: 0.1,
        clinicalInput: { medications: [{ name: 'Warfarin' }], symptoms: [{ name: 'Hémorragie' }], selectedElementCount: 12 },
        webSearch: { allowedDomains: domains, required: true, searchContextSize: 'low', maxToolCalls: 8 },
      };
      const result = mode === 'direct'
        ? await callAI('Rechercher les preuves pour une seule paire.', 'Contexte clinique synthétique de test.', options)
        : await startBackgroundAI('Rechercher les preuves pour une seule paire.', 'Contexte clinique synthétique de test.', options);
      assert.ok(url.endsWith('/responses'));
      assert.equal(body.model, 'gpt-6-luna');
      assert.deepEqual(body.reasoning, { effort: 'none' });
      assert.equal(body.max_output_tokens, 8_192);
      assert.equal(body.tool_choice, 'required');
      assert.equal(body.max_tool_calls, 8);
      assert.deepEqual(body.tools, [{ type: 'web_search', filters: { allowed_domains: domains }, search_context_size: 'low', external_web_access: true }]);
      assert.deepEqual(body.include, ['web_search_call.action.sources']);
      assert.deepEqual(body.text, { format: responseFormat });
      assert.equal('temperature' in body, false);
      assert.equal(result.clinicalSafety?.riskLevel, 'critical');
      assert.equal(result.clinicalSafety?.requiresHumanValidation, true);
      assert.equal(result.clinicalRoute?.finalReviewRequired, true);
      assert.match(String(body.instructions ?? JSON.stringify(body.input)), /CONTRAT CLINIQUE VERIFIABLE/);
      if (mode === 'background') assert.equal(body.background, true);
      else {
        assert.equal('webSearchCalls' in result && result.webSearchCalls, 1);
        assert.deepEqual('webSources' in result && result.webSources, [retrieved]);
      }
    });
  }
});

test('a partially generated JSON response is never accepted as a completed analysis', async (t) => {
  mockProvider(t, async () => asJson({
    id: 'resp_partial', status: 'incomplete', output_text: '{"findings":[',
    incomplete_details: { reason: 'max_output_tokens' }, max_output_tokens: 32_768,
  }));
  await assert.rejects(callAI('Return JSON.', 'Example.', baseOptions), (error: InterruptedResponse) => {
    assert.equal(error.name, 'AIIncompleteResponseError');
    assert.equal(error.reason, 'max_output_tokens');
    assert.equal(error.responseId, 'resp_partial');
    assert.equal(error.partialText, '{"findings":[');
    assert.equal(Object.keys(error).includes('partialText'), false);
    assert.equal(JSON.stringify(error).includes('findings'), false);
    assert.equal(error.maxOutputTokens, 32_768);
    assert.equal(error.resumable, true);
    return true;
  });
});

test('provider failure, cancellation and nonterminal responses cannot masquerade as success', async (t) => {
  for (const status of ['failed', 'cancelled', 'in_progress', 'queued']) {
    await t.test(status, async (st) => {
      mockProvider(st, async () => asJson({ status, output_text: 'Unfinished output.' }));
      await assert.rejects(callAI('Return text.', 'Example.', baseOptions), new RegExp(status));
    });
  }
});

test('Chat Completions length limits are reported as incomplete rather than usable text', async (t) => {
  mockProvider(t, async () => asJson({ id: 'chatcmpl_partial', choices: [{
    message: { content: 'Partial text.' }, finish_reason: 'length',
  }] }));
  await assert.rejects(callAI('Return text.', 'Example.', { model: 'gpt-4o', skipClinicalBrain: true }),
    (error: InterruptedResponse) => error.reason === 'max_output_tokens' && error.partialText === 'Partial text.');
});

test('streaming emits only answer deltas once across fragmented UTF-8 and done events', async (t) => {
  const text = '{"résultat":"validé"}';
  mockProvider(t, async () => eventStream([
    { type: 'response.created', response: { id: 'resp_stream' } },
    { type: 'response.reasoning_summary_text.delta', delta: 'Internal summary.' },
    { type: 'response.output_text.delta', delta: '{"résultat":' },
    { type: 'response.output_text.delta', delta: '"validé"}' },
    { type: 'response.output_text.done', text },
    { type: 'response.completed', response: completed(text) },
  ], 7));
  const chunks: string[] = [];
  const result = await streamAI('Return JSON.', 'Example.', chunk => { chunks.push(chunk); }, baseOptions);
  assert.equal(chunks.join(''), text);
  assert.equal(result.text, text);
  assert.deepEqual(JSON.parse(result.text), { résultat: 'validé' });
});

test('a streaming output limit retains its partial text and reason without marking success', async (t) => {
  mockProvider(t, async () => eventStream([
    { type: 'response.created', response: { id: 'resp_stream_partial' } },
    { type: 'response.output_text.delta', delta: 'Partial ' },
    { type: 'response.incomplete', response: {
      id: 'resp_stream_partial', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      max_output_tokens: 65_536,
    } },
  ]));
  await assert.rejects(streamAI('Return text.', 'Example.', () => undefined, baseOptions),
    (error: InterruptedResponse) => error.reason === 'max_output_tokens'
      && error.partialText === 'Partial ' && error.responseId === 'resp_stream_partial');
});

test('a stream that closes before a terminal event is incomplete', async (t) => {
  mockProvider(t, async () => eventStream([{ type: 'response.output_text.delta', delta: 'Cut off.' }]));
  await assert.rejects(streamAI('Return text.', 'Example.', () => undefined, baseOptions),
    (error: InterruptedResponse) => error.reason === 'stream_ended' && error.resumable === false);
});

test('provider stream failures and caller callback failures propagate', async (t) => {
  await t.test('provider failure', async (st) => {
    mockProvider(st, async () => eventStream([{ type: 'response.failed', response: {
      status: 'failed', error: { message: 'Provider failure.' },
    } }]));
    await assert.rejects(streamAI('Return text.', 'Example.', () => undefined, baseOptions), /Provider failure/);
  });
  await t.test('callback failure', async (st) => {
    mockProvider(st, async () => eventStream([
      { type: 'response.output_text.delta', delta: 'Chunk.' },
      { type: 'response.completed', response: completed('Chunk.') },
    ]));
    const failure = new Error('Persistence unavailable.');
    await assert.rejects(streamAI('Return text.', 'Example.', () => { throw failure; }, baseOptions),
      error => error === failure);
  });
});

test('background status preserves the explicit incomplete reason and actual budget', async (t) => {
  mockProvider(t, async () => asJson({
    id: 'resp_poll', model: 'gpt-6-astra', status: 'incomplete', output_text: 'Partial.',
    incomplete_details: { reason: 'max_output_tokens' }, max_output_tokens: 65_536,
  }));
  const result = await retrieveBackgroundAI('resp_poll') as {
    status: string; text?: string; partialText?: string; incompleteReason?: string; maxOutputTokens?: number;
  };
  assert.equal(result.status, 'incomplete');
  assert.equal(result.text, undefined);
  assert.equal(result.partialText, 'Partial.');
  assert.equal(result.incompleteReason, 'max_output_tokens');
  assert.equal(result.maxOutputTokens, 65_536);
});

test('background submission is asynchronous and returns the normalized output budget', async (t) => {
  let body: Record<string, unknown> = {};
  mockProvider(t, async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return asJson({ id: 'resp_start', status: 'queued' });
  });
  const result = await startBackgroundAI('Return text.', 'Example.', {
    ...baseOptions, reasoningEffort: 'high', maxTokens: 4000,
  }) as { id: string; maxOutputTokens?: number };
  assert.equal(body.background, true);
  assert.equal(body.store, true);
  assert.equal(body.max_output_tokens, 32_768);
  assert.equal(result.maxOutputTokens, 32_768);
});

test('an ambiguous provider POST failure is never retried automatically', async (t) => {
  let calls = 0;
  mockProvider(t, async () => { calls++; throw new TypeError('Network disconnected.'); });
  await assert.rejects(startBackgroundAI('Return text.', 'Example.', baseOptions), /Network disconnected/);
  assert.equal(calls, 1);
});

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

test('the foreground deadline also bounds response body consumption after headers arrive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseBody: () => void = () => undefined;
  const bodyReady = new Promise<void>(resolve => { releaseBody = resolve; });
  mockProvider(t, async () => {
    const response = asJson(completed());
    t.mock.method(response, 'json', async () => { await bodyReady; return completed(); });
    return response;
  });
  let state = 'pending';
  const request = callAI('Return text.', 'Example.', { ...baseOptions, timeoutMs: 20 })
    .then(() => { state = 'resolved'; }, error => { state = String(error.message); });
  await nextTurn();
  t.mock.timers.tick(20);
  await nextTurn();
  const atDeadline = state;
  releaseBody();
  await request;
  assert.match(atDeadline, /timed out after 20ms/);
});

test('the streaming deadline remains active while waiting for more chunks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish: () => void = () => undefined;
  mockProvider(t, async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"Part."}\n\n'));
      finish = () => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.completed', response: completed('Part.') })}\n\n`));
          controller.close();
        } catch { /* The timeout is allowed to cancel the stream first. */ }
      };
    },
  })));
  let state = 'pending';
  const request = streamAI('Return text.', 'Example.', () => undefined, { ...baseOptions, timeoutMs: 20 })
    .then(() => { state = 'resolved'; }, error => { state = String(error.message); });
  await nextTurn();
  t.mock.timers.tick(20);
  await nextTurn();
  const atDeadline = state;
  finish();
  await request;
  assert.match(atDeadline, /timed out after 20ms/);
});

test('background POST and GET use separate deadlines beyond old 15 second caller settings', async (t) => {
  for (const [mode, deadline] of [['start', 45_000], ['poll', 30_000]] as const) {
    await t.test(mode, async (st) => {
      st.mock.timers.enable({ apis: ['setTimeout'] });
      let releaseBody: () => void = () => undefined;
      const bodyReady = new Promise<void>(resolve => { releaseBody = resolve; });
      mockProvider(st, async () => {
        const response = asJson({ id: 'resp_background', status: 'queued' });
        st.mock.method(response, 'json', async () => { await bodyReady; return { id: 'resp_background', status: 'queued' }; });
        return response;
      });
      let state = 'pending';
      const request = (mode === 'start'
        ? startBackgroundAI('Return text.', 'Example.', { ...baseOptions, timeoutMs: 15_000 })
        : retrieveBackgroundAI('resp_background', { timeoutMs: 15_000 }))
        .then(() => { state = 'resolved'; }, error => { state = String(error.message); });
      await nextTurn();
      st.mock.timers.tick(15_000);
      await nextTurn();
      assert.equal(state, 'pending');
      st.mock.timers.tick(deadline - 15_000);
      await nextTurn();
      const atDeadline = state;
      releaseBody();
      await request;
      assert.match(atDeadline, new RegExp(`timed out after ${deadline}ms`));
    });
  }
});

test('parallel coordinators may explicitly bound receipt and status calls without retrying POST', async t => {
  for (const mode of ['start', 'poll'] as const) await t.test(mode, async st => {
    st.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    mockProvider(st, async () => { calls++; return await new Promise<Response>(() => undefined); });
    let failure = '';
    const request = (mode === 'start'
      ? startBackgroundAI('Return text.', 'Synthetic fixture.', { ...baseOptions, backgroundRequestTimeoutMs: 12_000 })
      : retrieveBackgroundAI('resp_fixture', { backgroundRequestTimeoutMs: 12_000 }))
      .catch(error => { failure = error.message; });
    await nextTurn();
    st.mock.timers.tick(12_000);
    await request;
    assert.match(failure, /timed out after 12000ms/);
    assert.equal(calls, 1);
  });
});

test('background rate errors retain status and Retry-After for bounded coordinator backoff', async t => {
  mockProvider(t, async () => new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), {
    status: 429, headers: { 'Retry-After': '37' },
  }));
  await assert.rejects(startBackgroundAI('Return text.', 'Synthetic fixture.', baseOptions), error => {
    assert.ok(error instanceof OpenAIRequestError);
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterMs, 37_000);
    assert.equal(error.code, 'rate_limit_exceeded');
    return true;
  });
});

test('clinical route defaults no longer shorten the shared 120 second foreground budget', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseBody: () => void = () => undefined;
  const bodyReady = new Promise<void>(resolve => { releaseBody = resolve; });
  mockProvider(t, async () => {
    const response = asJson(completed());
    t.mock.method(response, 'json', async () => { await bodyReady; return completed(); });
    return response;
  });
  let state = 'pending';
  const request = callAI('Recherche clinique.', 'Exemple sans signe de risque.', { clinicalTask: 'simple_lookup' })
    .then(() => { state = 'resolved'; }, error => { state = String(error.message); });
  await nextTurn();
  t.mock.timers.tick(90_000);
  await nextTurn();
  assert.equal(state, 'pending');
  t.mock.timers.tick(30_000);
  await nextTurn();
  const atDeadline = state;
  releaseBody();
  await request;
  assert.match(atDeadline, /timed out after 120000ms/);
});

test('a content-filter interruption remains non-resumable', async (t) => {
  mockProvider(t, async () => asJson({
    id: 'resp_filtered', status: 'incomplete', incomplete_details: { reason: 'content_filter' },
  }));
  await assert.rejects(callAI('Return text.', 'Example.', baseOptions),
    (error: InterruptedResponse) => error.reason === 'content_filter' && error.resumable === false);
});

test('stream deadline covers an awaited persistence callback as well as the provider connection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseCallback: () => void = () => undefined;
  const saved = new Promise<void>(resolve => { releaseCallback = resolve; });
  mockProvider(t, async () => eventStream([
    { type: 'response.output_text.delta', delta: 'Chunk.' },
    { type: 'response.completed', response: completed('Chunk.') },
  ]));
  let state = 'pending';
  const request = streamAI('Return text.', 'Example.', () => saved, { ...baseOptions, timeoutMs: 20 })
    .then(() => { state = 'resolved'; }, error => { state = String(error.message); });
  await nextTurn();
  t.mock.timers.tick(20);
  await nextTurn();
  const atDeadline = state;
  releaseCallback();
  await request;
  assert.match(atDeadline, /timed out after 20ms/);
});
