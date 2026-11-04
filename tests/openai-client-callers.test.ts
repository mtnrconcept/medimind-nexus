import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callAI } from '../supabase/functions/_shared/ai-client.ts';
import { handleResearchRequest } from '../supabase/functions/deep-research-graph/handler.ts';

test('graph synthesis can finish after 90 seconds instead of silently returning its 45-second fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => key === 'OPENAI_API_KEY' ? 'synthetic-test-key' : undefined },
  };
  t.after(() => { (globalThis as { Deno?: unknown }).Deno = originalDeno; });

  let reachedProvider: () => void = () => undefined;
  const providerReady = new Promise<void>(resolve => { reachedProvider = resolve; });
  let releaseBody: () => void = () => undefined;
  const bodyReady = new Promise<void>(resolve => { releaseBody = resolve; });
  t.after(releaseBody);
  const graph = { nodes: [{ id: 'c0', label: 'synthetic topic', node_type: 'PATHOLOGY', weight: 1 }],
    edges: [], research_summary: 'Complete synthetic graph.' };
  t.mock.method(globalThis, 'fetch', async () => {
    const response = Response.json({});
    t.mock.method(response, 'json', async () => {
      reachedProvider();
      await bodyReady;
      return { id: 'resp_slow_graph', status: 'completed', output_text: JSON.stringify(graph) };
    });
    return response;
  });

  let settled = false;
  const pending = handleResearchRequest(new Request('https://example.test/deep-research-graph', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-session' },
    body: JSON.stringify({ topic: 'synthetic topic', include_pubmed: false, include_fda: false }),
  }), {
    isAuthenticated: async () => true, readTable: async () => [], readInteractions: async () => [], callAI,
  }).then(response => { settled = true; return response; });
  await providerReady;
  t.mock.timers.tick(90_000);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'the caller must leave the active provider request running after 90 seconds');
  releaseBody();
  const result = await (await pending).json();
  assert.equal(result.ai_provider, 'openai');
  assert.equal(result.research_summary, graph.research_summary);
  assert.equal(result.nodes[0].label, 'synthetic topic');
});
