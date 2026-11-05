import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphResearchPersistenceError, runGraphResearchJob, safeGraphJobPayload } from '../supabase/functions/deep-research-graph/jobs.ts';
import { parseResearchInput, prepareResearch, type ResearchServices } from '../supabase/functions/deep-research-graph/handler.ts';

const services: ResearchServices = {
  async isAuthenticated() { return true; },
  async readTable() { return []; },
  async readInteractions() { return []; },
  async fetcher() { return Response.json({ esearchresult: { idlist: [], count: '0' } }); },
  async callAI() { assert.fail('The durable graph must never use foreground generation.'); },
};
const input = () => parseResearchInput({ topic: 'synthetic disease', include_fda: false })!;
const generated = {
  nodes: [{ id: 'c0', node_type: 'PATHOLOGY', label: 'synthetic disease', description: 'Synthetic fixture', weight: 1 }],
  edges: [], research_summary: 'Synthetic research summary; evidence remains limited.',
};
const accepted = { id: 'resp_graph_test', status: 'in_progress', model: 'gpt-6-astra', provider: 'openai' as const,
  reasoningEffort: 'high' as const, maxOutputTokens: 65_536 };

test('durable graph saves its evidence snapshot and yields before starting a background response', async () => {
  const events: string[] = [];
  const patches: Record<string, any>[] = [];
  const outcome = await runGraphResearchJob({ input: input() }, {
    services,
    async update() { assert.fail('Source collection must hand off before provider creation.'); },
    async advance(patch) { patches.push(patch); events.push('snapshot'); },
    async start() { assert.fail('Creation has its own worker budget after source collection.'); },
    async retrieve() { assert.fail('No retrieval before response ID is persisted.'); },
  });
  assert.equal(outcome, 'pending');
  assert.deepEqual(events, ['snapshot']);
  assert.ok(patches[0].request_payload._researchSnapshot);
});

test('the next leased graph worker creates one provider response from the saved evidence', async () => {
  const prepared = await prepareResearch(input(), services);
  const events: string[] = [];
  const patches: Record<string, any>[] = [];
  const outcome = await runGraphResearchJob({ input: input(), snapshot: prepared }, {
    services: { ...services, async readTable() { assert.fail('Sources were already saved.'); } },
    async update(patch) { patches.push(patch); events.push('provider'); },
    async advance() { assert.fail('Source collection was already handed off.'); },
    async start(_system, _prompt, options) {
      events.push('start');
      assert.equal(options?.forceModel, true);
      assert.equal(options?.model, 'gpt-6-astra');
      assert.ok((options?.maxTokens ?? 0) >= 65_536);
      assert.ok(options?.webSearch);
      return accepted;
    },
    async retrieve() { assert.fail('No retrieval before response ID is persisted.'); },
  });
  assert.equal(outcome, 'pending');
  assert.deepEqual(events, ['start', 'provider']);
  assert.equal(patches[0].provider_response_id, accepted.id);
  assert.ok(patches.every(patch => patch.status !== 'completed'));
});

test('graph finalization uses saved evidence and retrieves the same response with provenance', async () => {
  const prepared = await prepareResearch(input(), services);
  const updates: Record<string, any>[] = [];
  const outcome = await runGraphResearchJob({ input: input(), snapshot: prepared, providerResponseId: accepted.id }, {
    services: { ...services, async readTable() { assert.fail('Do not repeat source collection during finalization.'); } },
    async update(patch) { updates.push(patch); },
    async advance() { assert.fail('The finalizer must not repeat collection.'); },
    async start() { assert.fail('Never repeat a paid generation when its response ID is known.'); },
    async retrieve(id, options) {
      assert.equal(id, accepted.id);
      assert.ok(options?.webSearch, 'Retrieve the source trace together with the saved response.');
      return { ...accepted, status: 'completed', text: JSON.stringify(generated), webSources: [], webSearchCalls: 1 };
    },
  });
  assert.equal(outcome, 'completed');
  assert.equal(updates.at(-1)?.status, 'completed');
  assert.equal(updates.at(-1)?.result_payload.research_summary, generated.research_summary);
  assert.equal(updates.at(-1)?.result_payload.nodes[0].label, 'synthetic disease');
});

test('missing saved evidence cannot be replaced by a new lookup for an existing response', async () => {
  await assert.rejects(runGraphResearchJob({ input: input(), providerResponseId: accepted.id }, {
    services,
    async update() { assert.fail('Missing snapshot cannot be marked complete.'); },
    async advance() { assert.fail('Missing snapshot cannot trigger new research.'); },
    async start() { assert.fail('No new paid request.'); },
    async retrieve() { assert.fail('No response can be validated without its evidence snapshot.'); },
  }), /contexte.*enregistré/i);
});

test('an evidence persistence failure prevents provider creation', async () => {
  await assert.rejects(runGraphResearchJob({ input: input() }, {
    services,
    async update() { assert.fail('No provider exists.'); },
    async advance() { throw new Error('snapshot store unavailable'); },
    async start() { assert.fail('Do not create an untracked provider response.'); },
    async retrieve() { assert.fail('No response exists.'); },
  }), /snapshot store unavailable/);
});

test('incomplete, invalid, or wrong-model results never become successful graphs', async () => {
  const prepared = await prepareResearch(input(), services);
  for (const response of [
    { ...accepted, status: 'incomplete', partialText: '{', incompleteReason: 'max_output_tokens' },
    { ...accepted, status: 'completed', text: '{' },
    { ...accepted, status: 'completed', model: 'other-model', text: JSON.stringify(generated) },
  ]) {
    await assert.rejects(runGraphResearchJob({ input: input(), snapshot: prepared, providerResponseId: accepted.id }, {
      services,
      async update(patch) { assert.notEqual(patch.status, 'completed'); },
      async advance() { assert.fail('Do not repeat collection.'); },
      async start() { assert.fail('No duplicate creation.'); },
      async retrieve() { return response; },
    }));
  }
});

test('provider reconnection preserves the current job rather than creating a new response', async () => {
  const prepared = await prepareResearch(input(), services);
  const outcome = await runGraphResearchJob({ input: input(), snapshot: prepared, providerResponseId: accepted.id }, {
    services,
    async update(patch) { assert.notEqual(patch.status, 'failed'); },
    async advance() { assert.fail('Do not repeat collection.'); },
    async start() { assert.fail('Never retry POST during a transient GET failure.'); },
    async retrieve() { return null; },
  });
  assert.equal(outcome, 'pending');
});

test('browser controls and injected research snapshots are never accepted into a new job', () => {
  const payload = safeGraphJobPayload(input());
  assert.equal(payload.topic, 'synthetic disease');
  assert.equal(payload.streaming, false);
  assert.equal(payload.async, true);
  assert.deepEqual(Object.keys(payload).sort(), [
    'async', 'existing_nodes', 'include_fda', 'include_pubmed', 'max_nodes', 'pathologies', 'streaming', 'topic',
  ]);
  assert.equal(Object.hasOwn(payload, 'providerResponseId'), false);
  assert.equal(Object.hasOwn(payload, '_researchSnapshot'), false);
});

test('the type of an expanded drug or examination survives the durable request roundtrip', () => {
  for (const type of ['DRUG', 'LAB', 'SYMPTOM']) {
    const original = parseResearchInput({ topic: 'synthetic concept', topic_type: type })!;
    const restored = parseResearchInput(safeGraphJobPayload(original))!;
    assert.equal(restored.topicType, type);
  }
});

test('a final write failure is retryable without replacing the saved provider response', async () => {
  const prepared = await prepareResearch(input(), services);
  let starts = 0;
  await assert.rejects(runGraphResearchJob({ input: input(), snapshot: prepared, providerResponseId: accepted.id }, {
    services,
    async update() { throw new Error('Database is temporarily unavailable.'); },
    async advance() { assert.fail('Do not clear the completed provider response.'); },
    async start() { starts++; return accepted; },
    async retrieve() { return { ...accepted, status: 'completed', text: JSON.stringify(generated), webSearchCalls: 1 }; },
  }), GraphResearchPersistenceError);
  assert.equal(starts, 0);
});
