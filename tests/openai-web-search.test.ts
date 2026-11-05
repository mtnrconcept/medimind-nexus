import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  callAI, retrieveBackgroundAI, startBackgroundAI, streamAI, type AICallOptions,
} from '../supabase/functions/_shared/ai-client.ts';

const json = (data: unknown) => new Response(JSON.stringify(data), {
  headers: { 'Content-Type': 'application/json' },
});
const base = { model: 'gpt-6-astra', forceModel: true, skipClinicalBrain: true } as const;
const webSearch = {
  allowedDomains: ['pubmed.ncbi.nlm.nih.gov', 'swissmedic.ch'], required: true,
} as const;

function provider(t: TestContext, fetcher: typeof fetch) {
  const previous = (globalThis as { Deno?: unknown }).Deno;
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (name: string) => name === 'OPENAI_API_KEY' ? 'test-only-key' : undefined },
  };
  t.after(() => { (globalThis as { Deno?: unknown }).Deno = previous; });
  t.mock.method(globalThis, 'fetch', fetcher);
}

test('background research sends restricted native web search and retains its requested model and format', async (t) => {
  let body: Record<string, unknown> = {};
  provider(t, async (input, init) => {
    assert.equal(String(input), 'https://api.openai.com/v1/responses');
    body = JSON.parse(String(init?.body));
    return json({ id: 'resp_research', status: 'queued' });
  });
  const options = {
    ...base, reasoningEffort: 'high' as const, responseFormat: { type: 'json_object' },
    webSearch: { ...webSearch, maxToolCalls: 18 },
  };
  const result = await startBackgroundAI('Research the selected entities.', 'Synthetic example.', options);
  assert.equal(body.model, 'gpt-6-astra');
  assert.equal(result.model, 'gpt-6-astra');
  assert.equal(body.background, true);
  assert.equal(body.store, true);
  assert.deepEqual(body.tools, [{
    type: 'web_search', filters: { allowed_domains: [...webSearch.allowedDomains] },
    search_context_size: 'high', external_web_access: true,
  }]);
  assert.deepEqual(body.include, ['web_search_call.action.sources']);
  assert.equal(body.tool_choice, 'required');
  assert.equal(body.max_tool_calls, 18);
  assert.deepEqual(body.text, { format: { type: 'json_object' } });
});

test('research controls stay absent for existing callers and preserve an optional search choice', async (t) => {
  const bodies: Record<string, unknown>[] = [];
  provider(t, async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return json({ id: 'resp_existing', status: 'queued' });
  });
  await startBackgroundAI('Return text.', 'Example.', base);
  const optionalSearch = {
    ...base,
    webSearch: { allowedDomains: ['  SWISSMEDIC.CH ', 'swissmedic.ch'],
      searchContextSize: 'low' as const, externalWebAccess: false, required: false, maxToolCalls: 1000 },
  };
  await startBackgroundAI('Return text.', 'Example.', optionalSearch);
  for (const field of ['tools', 'include', 'tool_choice', 'max_tool_calls']) {
    assert.equal(field in bodies[0], false);
  }
  assert.deepEqual(bodies[1].tools, [{ type: 'web_search',
    filters: { allowed_domains: ['swissmedic.ch'] }, search_context_size: 'low', external_web_access: false }]);
  assert.equal(bodies[1].tool_choice, 'auto');
  assert.equal(bodies[1].max_tool_calls, 50);
});

test('invalid research restrictions fail before a paid request rather than opening unrestricted search', async (t) => {
  let calls = 0;
  provider(t, async () => { calls++; return json({ id: 'resp_should_not_start', status: 'queued' }); });
  const cases = [
    { allowedDomains: [] },
    { allowedDomains: ['https://pubmed.ncbi.nlm.nih.gov/'] },
    { allowedDomains: ['*.nih.gov'] },
    { allowedDomains: ['nih.gov/path'] },
    { allowedDomains: ['nih.gov@untrusted.org'] },
    { allowedDomains: ['127.0.0.1'] },
    { allowedDomains: ['localhost'] },
    { allowedDomains: Array.from({ length: 101 }, (_, i) => `source${i}.org`) },
    { ...webSearch, maxToolCalls: 0 },
    { ...webSearch, maxToolCalls: Number.NaN },
    { ...webSearch, searchContextSize: 'unlimited' },
  ];
  for (const candidate of cases) {
    await assert.rejects(startBackgroundAI('Return text.', 'Example.', {
      ...base, webSearch: candidate,
    } as AICallOptions), /web search/i);
  }
  assert.equal(calls, 0);
});

test('polling includes native sources, separates search execution from generated claims and filters unsafe sources', async (t) => {
  let pollUrl = '';
  const pubmed = 'https://pubmed.ncbi.nlm.nih.gov/123/';
  const swissmedic = 'https://www.swissmedic.ch/research';
  provider(t, async (input, init) => {
    pollUrl = String(input);
    assert.equal(init?.method, 'GET');
    return json({ id: 'resp_sources', status: 'completed', model: 'gpt-6-astra',
      output_text: JSON.stringify({ sources: ['https://pubmed.ncbi.nlm.nih.gov/999/invented'] }),
      output: [
        { type: 'web_search_call', id: 'ws_1', status: 'completed', action: {
          type: 'search', sources: [
            { type: 'url', url: pubmed },
            { type: 'url', title: 'Official information', url: swissmedic },
            { type: 'url', url: 'javascript:alert(1)' },
            { type: 'url', url: 'https://user:secret@pubmed.ncbi.nlm.nih.gov/private' },
            { type: 'url', url: 'https://pubmed.ncbi.nlm.nih.gov.attacker.org/forged' },
            { type: 'url', url: 'https://unrelated.org/article' },
            null,
          ],
        } },
        { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', sources: [] } },
        { type: 'web_search_call', id: 'ws_2', status: 'completed', action: { type: 'open_page', url: swissmedic } },
        { type: 'web_search_call', id: 'ws_failed', status: 'failed', action: {
          type: 'search', sources: [{ type: 'url', url: 'https://swissmedic.ch/failed' }],
        } },
        { type: 'web_search_call', id: 'ws_pending', status: 'in_progress', action: {
          type: 'search', sources: [{ type: 'url', url: 'https://swissmedic.ch/pending' }],
        } },
        { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
          text: 'A supported finding.', annotations: [
            { type: 'url_citation', title: 'Article title', url: pubmed },
            { type: 'url_citation', title: 'Official information', url: swissmedic },
            { type: 'url_citation', url: 'data:text/html,<script>bad()</script>' },
            { type: 'file_citation', url: 'https://swissmedic.ch/not-a-web-source' },
          ],
        }] },
        { type: 'message', role: 'assistant', content: [{ type: 'input_text', annotations: [
          { type: 'url_citation', url: 'https://swissmedic.ch/input-text' },
        ] }] },
      ],
    });
  });
  const result = await retrieveBackgroundAI('resp_sources', { ...base, webSearch });
  assert.deepEqual(new URL(pollUrl).searchParams.getAll('include[]'), ['web_search_call.action.sources']);
  assert.equal(result.webSearchCalls, 2);
  assert.deepEqual(result.webSources, [
    { title: 'Article title', url: pubmed }, { title: 'Official information', url: swissmedic },
  ]);
  assert.equal(result.webSourcesTruncated, false);
  assert.ok(result.text?.includes('invented'));
});

test('an unsearched generated bibliography never becomes tool provenance', async (t) => {
  provider(t, async () => json({ id: 'resp_no_search', status: 'completed',
    output_text: '{"webSearchCalls":42,"webSources":[{"title":"Plausible","url":"https://pubmed.ncbi.nlm.nih.gov/123/"}]}',
  }));
  const result = await retrieveBackgroundAI('resp_no_search', { ...base, webSearch });
  assert.equal(result.webSearchCalls, 0);
  assert.deepEqual(result.webSources, []);
});

test('a token-limited response retains its retrieved sources without exposing final answer text', async (t) => {
  provider(t, async () => json({ id: 'resp_partial_sources', status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' }, output_text: '{"cells":[',
    output: [{ type: 'web_search_call', id: 'ws_1', status: 'completed', action: {
      type: 'search', sources: [{ type: 'url', title: 'Article', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' }],
    } }],
  }));
  const result = await retrieveBackgroundAI('resp_partial_sources', { ...base, webSearch });
  assert.equal(result.text, undefined);
  assert.equal(result.partialText, '{"cells":[');
  assert.equal(result.incompleteReason, 'max_output_tokens');
  assert.equal(result.webSearchCalls, 1);
  assert.equal(result.webSources?.length, 1);
});

test('source limits are explicit and completed calls are still counted after the display limit', async (t) => {
  provider(t, async () => json({ status: 'completed', output_text: '{}', output: [
    { type: 'web_search_call', id: 'ws_many', status: 'completed', action: { type: 'search',
      sources: Array.from({ length: 270 }, (_, i) => ({ type: 'url', url: `https://swissmedic.ch/source-${i}` })),
    } },
    { type: 'web_search_call', id: 'ws_after', status: 'completed', action: { type: 'search', sources: [] } },
  ] }));
  const result = await retrieveBackgroundAI('resp_many_sources', { ...base, webSearch });
  assert.equal(result.webSources?.length, 256);
  assert.equal(result.webSourcesTruncated, true);
  assert.equal(result.webSearchCalls, 2);
});

test('legacy polling keeps its URL and new foreground research uses Responses with native provenance', async (t) => {
  const calls: string[] = [];
  provider(t, async (input) => {
    calls.push(String(input));
    return json({ id: 'resp_direct', status: 'completed', output_text: '{}', output: [
      { type: 'web_search_call', id: 'ws_direct', status: 'completed', action: { type: 'search',
        sources: [{ type: 'url', title: 'Official information', url: 'https://swissmedic.ch/research' }],
      } },
    ] });
  });
  await retrieveBackgroundAI('resp_legacy');
  const options = { ...base, model: 'gpt-4o', webSearch };
  const result = await callAI('Research.', 'Synthetic example.', options);
  assert.equal(calls[0], 'https://api.openai.com/v1/responses/resp_legacy');
  assert.equal(calls[1], 'https://api.openai.com/v1/responses');
  assert.equal(result.webSearchCalls, 1);
  assert.equal(result.webSources?.[0].url, 'https://swissmedic.ch/research');
});

test('streaming research returns native citations from its completed event without repeating answer text', async (t) => {
  const url = 'https://swissmedic.ch/research';
  const events = [
    { type: 'response.output_text.delta', delta: 'Result.' },
    { type: 'response.completed', response: { status: 'completed', output_text: 'Result.', output: [
      { type: 'web_search_call', id: 'ws_stream', status: 'completed', action: { type: 'search',
        sources: [{ type: 'url', title: 'Official information', url }],
      } },
    ] } },
  ];
  provider(t, async () => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  }));
  const chunks: string[] = [];
  const result = await streamAI('Research.', 'Synthetic example.', chunk => { chunks.push(chunk); }, { ...base, webSearch });
  assert.deepEqual(chunks, ['Result.']);
  assert.equal(result.text, 'Result.');
  assert.equal(result.webSearchCalls, 1);
  assert.deepEqual(result.webSources, [{ title: 'Official information', url }]);
});
