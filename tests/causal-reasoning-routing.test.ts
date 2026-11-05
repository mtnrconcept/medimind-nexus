import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as researchModel from '../supabase/functions/_shared/research-model.ts';

const explanation = 'Explication synthétique du fournisseur de test.';
const treatment = { optimal_node_ids: ['node-a'], treatment_summary: 'Résumé de test.', rationale: 'Raisonnement de test.' };
const compiled = ts.transpileModule(readFileSync(new URL('../supabase/functions/causal-reasoning/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Load the real Edge handler; only the server adapter, database and AI provider are replaced. */
function endpoint(failProvider = false) {
  let handler: (request: Request) => Promise<Response>;
  const calls: Array<{ kind: string; system: string; prompt: string }> = [];
  const provider = {
    async callAI(system: string, prompt: string) {
      calls.push({ kind: 'json', system, prompt });
      if (failProvider) throw new Error('Synthetic provider failure');
      return { text: system.includes('optimisation thérapeutique') ? JSON.stringify(treatment) : explanation };
    },
    async streamAI(system: string, prompt: string, onChunk: (chunk: string) => void) {
      calls.push({ kind: 'stream', system, prompt });
      if (failProvider) throw new Error('Synthetic provider failure');
      onChunk(explanation);
    },
    cleanJsonString: (value: string) => value,
  };
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, Response, ReadableStream, TextEncoder, Error,
    console: { log() {}, error() {} },
    Deno: { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://project.invalid' : 'synthetic-service' } },
    require: (name: string) => {
      if (name.endsWith('/http/server.ts')) return { serve: (callback: typeof handler) => { handler = callback; } };
      if (name.includes('@supabase/supabase-js')) return { createClient: () => ({
        from: () => { throw new Error('Unexpected database access in an explanation request.'); },
      }) };
      if (name === '../_shared/ai-client.ts') return provider;
      if (name === '../_shared/research-model.ts') return researchModel;
      throw new Error('Unexpected endpoint dependency: ' + name);
    },
  }, { filename: 'causal-reasoning/index.ts' });
  return {
    calls,
    request: (body: unknown) => handler(new Request('https://project.invalid/functions/v1/causal-reasoning', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })),
  };
}

test('two-node JSON explanations preserve their format when pathology is absent or blank', async () => {
  for (const pathology of [undefined, null, '', '   ']) {
    const fixture = endpoint();
    const response = await fixture.request({ stream: false, query: 'Explain the synthetic link.', context: {
      sourceNode: ' Alpha ', targetNode: ' Beta ', pathology,
    } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.analysis, explanation);
    assert.equal(body.explanation, explanation);
    assert.equal(body.nodeCount, 2);
    assert.equal(body.isMultiNode, false);
    assert.equal('optimal_node_ids' in body, false, 'A link explanation must not enter treatment optimization.');
    assert.match(fixture.calls[0].prompt, /\*\*Concept 1:\*\* Alpha\n/);
    assert.match(fixture.calls[0].prompt, /\*\*Concept 2:\*\* Beta\n/);
    assert.match(fixture.calls[0].prompt, /\*\*Contexte pathologique:\*\* Non spécifié/);
  }
});

test('streaming link explanations use explicit defaults for optional context', async () => {
  const fixture = endpoint();
  const response = await fixture.request({ stream: true, query: 'Explain the synthetic link.', context: {
    sourceNode: ' Alpha ', targetNode: ' Beta ',
  } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /text\/event-stream/);
  const stream = await response.text();
  assert.ok(stream.includes(JSON.stringify({ type: 'text', content: explanation })));
  assert.ok(stream.includes(JSON.stringify({ type: 'done' })));
  assert.equal(fixture.calls[0].kind, 'stream');
  assert.match(fixture.calls[0].prompt, /- Source: Alpha\n/);
  assert.match(fixture.calls[0].prompt, /- Cible: Beta\n/);
  assert.match(fixture.calls[0].prompt, /- Pathologie concernée: Non spécifié/);
  assert.doesNotMatch(fixture.calls[0].prompt, /undefined|\[object Object\]/);
});

test('incomplete or non-text link contexts are rejected before an AI call in either mode', async () => {
  const contexts = [
    { sourceNode: 'Alpha' },
    { targetNode: 'Beta' },
    { sourceNode: '  ', targetNode: 'Beta' },
    { sourceNode: 123, targetNode: 'Beta' },
    { sourceNode: 'Alpha', targetNode: { name: 'Beta' } },
    { sourceNode: 'Alpha', targetNode: 'Beta', pathology: ['Synthetic'] },
    { sourceNode: 'Alpha', targetNode: 'Beta', relationship: {} },
    null,
  ];
  for (const stream of [false, true]) for (const context of contexts) {
    const fixture = endpoint();
    const response = await fixture.request({ stream, query: 'Explain the synthetic link.', context });
    assert.equal(response.status, 400, JSON.stringify({ stream, context }));
    const body = await response.json();
    assert.equal(typeof body.error, 'string');
    assert.equal('analysis' in body, false);
    assert.equal(fixture.calls.length, 0, 'Invalid input must not invoke the paid provider.');
  }
});

test('graph optimization and multi-node analysis keep their existing valid routes', async () => {
  const graph = endpoint();
  const graphResponse = await graph.request({ stream: false, query: 'Optimize the synthetic graph.', context: {
    pathology: 'Synthetic condition', graph_size: { nodes: 3, edges: 2 },
  } });
  assert.equal(graphResponse.status, 200);
  assert.deepEqual(await graphResponse.json(), treatment);

  const multi = endpoint();
  const multiResponse = await multi.request({ stream: false, query: 'Explain the synthetic group.', context: {
    multiNodes: [{ name: 'Alpha', type: 'molecule' }, { name: 'Beta', type: 'molecule' }, { name: 'Gamma', type: 'molecule' }],
  } });
  assert.equal(multiResponse.status, 200);
  const body = await multiResponse.json();
  assert.equal(body.analysis, explanation);
  assert.equal(body.isMultiNode, true);
  assert.equal(body.nodeCount, 3);
  assert.match(multi.calls[0].prompt, /ANALYSE MULTI-NOEUDS/);
});

test('provider failures remain errors without a deterministic clinical explanation', async () => {
  const json = endpoint(true);
  const response = await json.request({ stream: false, query: 'Explain the synthetic link.', context: {
    sourceNode: 'Alpha', targetNode: 'Beta',
  } });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
  assert.equal('analysis' in body, false);
  assert.equal('explanation' in body, false);
  assert.equal('degraded' in body, false);

  const sse = endpoint(true);
  const streamResponse = await sse.request({ stream: true, query: 'Explain the synthetic link.', context: {
    sourceNode: 'Alpha', targetNode: 'Beta',
  } });
  const frames = await streamResponse.text();
  assert.match(frames, /"type":"error"/);
  assert.doesNotMatch(frames, /"type":"(?:done|text)"/);
});
