import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emptySystematicResult, executeSystematicStep, parseSystematicAnalysis,
  systematicCandidates, systematicPairCount, SystematicPersistenceError,
  type SystematicAnalysis, type SystematicEntity, type SystematicRunResult,
  type SystematicRunState, type SystematicWorkerRuntime,
} from '../supabase/functions/cde-systematic-analyze/durable-run.ts';
import type { AIBackgroundPollResult, AICallOptions } from '../supabase/functions/_shared/ai-client.ts';
import { RESEARCH_MODEL } from '../supabase/functions/_shared/research-model.ts';

const entities: SystematicEntity[] = Array.from({ length: 6 }, (_, index) => ({
  id: `synthetic-${index}`, name: `Synthetic substance ${index}`, source: 'local', node_type: 'substance',
}));
const stateFor = (count = 6): SystematicRunState => ({
  version: 1, runId: '11111111-1111-4111-8111-111111111111', owner: 'synthetic-owner',
  targetPathology: null, entities: structuredClone(entities.slice(0, count)), index: 0,
});
const pairFor = (name: string) => ({
  entity_b_name: name, is_documented: false, discovery_type: 'aucun', plausibility_score: 0,
  severity: 'faible', reasoning: 'Synthetic analysis.', mechanism: '', recommendation: '',
});
const analysisFor = (state: SystematicRunState): SystematicAnalysis => ({
  pairs: (state.batch?.pending ?? systematicCandidates(state.entities!.length, state.index))
    .map(index => pairFor(state.entities![index].name)),
  synthesis: 'Complete synthetic window.',
});

function harness(initial = stateFor()) {
  let savedState = structuredClone(initial);
  let result: SystematicRunResult | null = initial.entities ? emptySystematicResult(initial) : null;
  let responseId: string | undefined;
  const providerOutputs = new Map<string, string>();
  const pairRows = new Map<string, unknown>();
  const calls = {
    catalogs: 0, preparations: 0, checkpoints: 0, starts: [] as AICallOptions[],
    retrieves: [] as string[], remembered: [] as string[], saves: 0, advances: [] as boolean[], finishes: 0,
  };
  const runtime: SystematicWorkerRuntime = {
    async loadCatalog() { calls.catalogs++; return { entities: structuredClone(entities), pathologyContext: null }; },
    async prepareBatch(state) {
      calls.preparations++;
      const candidates = systematicCandidates(state.entities!.length, state.index);
      return { index: state.index, candidates, pending: [...candidates], cached: 0, documented: 0 };
    },
    async checkpoint(state) { calls.checkpoints++; savedState = structuredClone(state); },
    async start(_system, _prompt, options) {
      calls.starts.push(options);
      const id = `resp_${calls.starts.length}`;
      providerOutputs.set(id, JSON.stringify(analysisFor(savedState)));
      return { id, provider: 'openai', model: 'gpt-5.5',
        status: 'queued', maxOutputTokens: options.maxTokens };
    },
    async retrieve(id) {
      calls.retrieves.push(id);
      return { id, provider: 'openai', model: 'gpt-5.5', status: 'completed', text: providerOutputs.get(id) };
    },
    async rememberProvider(response) { calls.remembered.push(response.id); responseId = response.id; },
    async savePairs(state, _batch, analysis) {
      calls.saves++;
      for (const pair of analysis.pairs) pairRows.set(`${state.runId}:${state.index}:${pair.entity_b_name}`, pair);
    },
    async advance(state, next, resetStepWindow) {
      calls.advances.push(resetStepWindow);
      savedState = structuredClone(state); result = structuredClone(next); responseId = undefined;
    },
    async finish(state, next) {
      calls.finishes++;
      savedState = structuredClone(state); result = structuredClone(next); responseId = undefined;
    },
  };
  return {
    calls, runtime, pairRows,
    payload: () => ({ state: structuredClone(savedState), result: structuredClone(result), providerResponseId: responseId }),
    saved: () => ({ state: structuredClone(savedState), result: structuredClone(result), responseId }),
  };
}

test('catalog collection is checkpointed in an invocation separate from the first provider POST', async () => {
  const state = stateFor();
  delete state.entities;
  const h = harness(state);
  assert.equal(await executeSystematicStep(h.payload(), h.runtime), 'continued');
  assert.equal(h.calls.catalogs, 1);
  assert.equal(h.calls.starts.length, 0);
  assert.deepEqual(h.calls.advances, [false]);
  assert.equal(h.saved().state.entities?.length, 6);
  assert.equal(await executeSystematicStep(h.payload(), h.runtime), 'polling');
  assert.equal(h.calls.catalogs, 1);
  assert.equal(h.calls.starts.length, 1);
  assert.equal(h.calls.checkpoints, 1);
  assert.ok(h.saved().state.batch, 'the exact candidate set must be saved before creating a provider response');
});

test('successive server invocations finish the complete run without browser-driven next-index calls', async () => {
  const state = stateFor();
  delete state.entities;
  const h = harness(state);
  for (let invocation = 0; invocation < 20 && !h.saved().result?.completed; invocation++) {
    await executeSystematicStep(h.payload(), h.runtime);
  }
  const final = h.saved().result!;
  assert.equal(final.completed, true);
  assert.equal(final.current_substance_index, 6);
  assert.equal(final.total_pairs, 14);
  assert.equal(final.pairs_analyzed, 14);
  assert.equal(final.pairs_processed, 14);
  assert.equal(final.steps.length, 5);
  assert.equal(h.calls.catalogs, 1);
  assert.equal(h.calls.starts.length, 5);
  assert.equal(h.calls.finishes, 1);
  assert.equal(h.pairRows.size, 14);
  assert.deepEqual(h.calls.retrieves, h.calls.remembered);
});

test('the original four-successor scope remains bounded at 470 candidate pairs for 120 entities', () => {
  assert.deepEqual(systematicCandidates(120, 0), [1, 2, 3, 4]);
  assert.deepEqual(systematicCandidates(120, 117), [118, 119]);
  assert.deepEqual(systematicCandidates(120, 119), []);
  assert.equal(systematicPairCount(120), 470);
});

test('finalization always retrieves the saved provider id without creating or refiltering another generation', async () => {
  const h = harness(stateFor(3));
  await executeSystematicStep(h.payload(), h.runtime);
  const payload = h.payload();
  h.runtime.prepareBatch = async () => { assert.fail('a persisted window was refiltered'); };
  h.runtime.start = async () => { assert.fail('a saved provider response caused a new POST'); };
  await executeSystematicStep(payload, h.runtime);
  assert.deepEqual(h.calls.retrieves, ['resp_1']);
  assert.equal(h.calls.saves, 1);
  assert.equal(h.saved().result!.pairs_analyzed, 2);
});

test('a transient finalizer GET keeps the same window pending without saving or advancing it', async () => {
  const h = harness(stateFor(3));
  await executeSystematicStep(h.payload(), h.runtime);
  h.runtime.retrieve = async () => null;
  assert.equal(await executeSystematicStep(h.payload(), h.runtime), 'polling');
  assert.equal(h.saved().state.index, 0);
  assert.equal(h.saved().responseId, 'resp_1');
  assert.equal(h.calls.saves, 0);
  assert.equal(h.calls.advances.length, 0);
  assert.equal(h.calls.starts.length, 1);
});

test('a provider response without its persisted candidate snapshot cannot be re-associated with a fresh window', async () => {
  const h = harness(stateFor(3));
  await assert.rejects(executeSystematicStep({ ...h.payload(), providerResponseId: 'resp_unbound' }, h.runtime));
  assert.equal(h.calls.preparations, 0);
  assert.equal(h.calls.starts.length, 0);
  assert.equal(h.calls.saves, 0);
  assert.equal(h.calls.advances.length, 0);
});

test('an ambiguous provider creation failure never advances or automatically repeats POST', async () => {
  const h = harness();
  let posts = 0;
  h.runtime.start = async () => { posts++; throw new Error('creation acknowledgment lost'); };
  await assert.rejects(executeSystematicStep(h.payload(), h.runtime), /acknowledgment/);
  assert.equal(posts, 1);
  assert.equal(h.calls.checkpoints, 1);
  assert.equal(h.calls.remembered.length, 0);
  assert.equal(h.calls.saves, 0);
  assert.equal(h.calls.advances.length, 0);
});

test('incomplete, failed, empty and malformed provider results never publish pairs or advance the cursor', async () => {
  const invalid: Partial<AIBackgroundPollResult>[] = [
    { status: 'incomplete', incompleteReason: 'max_output_tokens', partialText: '{"pairs":[' },
    { status: 'failed', errorMessage: 'Provider unavailable' },
    { status: 'completed', text: '' },
    { status: 'completed', text: '{"pairs":' },
    { status: 'completed', text: '{}' },
    { status: 'completed', text: '{"pairs":[]}' },
  ];
  for (const issue of invalid) {
    const h = harness(stateFor(3));
    await executeSystematicStep(h.payload(), h.runtime);
    h.runtime.retrieve = async () => ({ id: 'resp_1', provider: 'openai', model: 'gpt-5.5', status: 'completed', ...issue });
    await assert.rejects(executeSystematicStep(h.payload(), h.runtime));
    assert.equal(h.saved().state.index, 0);
    assert.equal(h.calls.saves, 0);
    assert.equal(h.calls.advances.length, 0);
    assert.equal(h.calls.finishes, 0);
    assert.equal(h.calls.starts.length, 1);
  }
});

test('a failed pair save is retryable against the same response and cannot advance the run', async () => {
  const h = harness(stateFor(3));
  await executeSystematicStep(h.payload(), h.runtime);
  const save = h.runtime.savePairs;
  h.runtime.savePairs = async (...args) => { await save(...args); throw new SystematicPersistenceError(); };
  await assert.rejects(executeSystematicStep(h.payload(), h.runtime), SystematicPersistenceError);
  assert.equal(h.saved().state.index, 0);
  assert.equal(h.calls.advances.length, 0);
  assert.equal(h.pairRows.size, 2);
  h.runtime.savePairs = save;
  await executeSystematicStep(h.payload(), h.runtime);
  assert.equal(h.pairRows.size, 2);
  assert.equal(h.saved().result!.pairs_analyzed, 2);
  assert.equal(h.calls.starts.length, 1);
  assert.deepEqual(h.calls.retrieves, ['resp_1', 'resp_1']);
});

test('documented and cached candidates advance explicitly without charging an OpenAI generation', async () => {
  const h = harness(stateFor(3));
  h.runtime.prepareBatch = async () => ({ index: 0, candidates: [1, 2], pending: [], cached: 1, documented: 1 });
  assert.equal(await executeSystematicStep(h.payload(), h.runtime), 'continued');
  assert.equal(h.calls.starts.length, 0);
  assert.equal(h.calls.saves, 0);
  assert.equal(h.saved().result!.pairs_analyzed, 0);
  assert.equal(h.saved().result!.pairs_skipped, 2);
  assert.equal(h.saved().result!.pairs_processed, 2);
  assert.equal(h.saved().state.index, 1);
});

test('reconciling a saved step replaces its existing counters instead of double-counting them', async () => {
  const h = harness(stateFor(3));
  await executeSystematicStep(h.payload(), h.runtime);
  const before = h.payload();
  await executeSystematicStep(before, h.runtime);
  const completedWindow = h.saved().result!;
  await executeSystematicStep({ ...before, result: completedWindow }, h.runtime);
  assert.equal(h.saved().result!.steps.length, 1);
  assert.equal(h.saved().result!.pairs_analyzed, 2);
  assert.equal(h.saved().result!.pairs_processed, 2);
  assert.equal(h.pairRows.size, 2);
  assert.equal(h.calls.starts.length, 1);
});

test('strict pair validation rejects missing, duplicate, foreign and invalid-scored candidates', () => {
  const expected = entities.slice(1, 3);
  const first = pairFor(expected[0].name);
  const second = pairFor(expected[1].name);
  for (const pairs of [
    [first], [first, first], [first, { ...second, entity_b_name: 'Foreign candidate' }],
    [first, { ...second, plausibility_score: 20 }], [first, { ...second, is_documented: 'false' }],
  ]) assert.throws(() => parseSystematicAnalysis(JSON.stringify({ pairs }), expected));
  const accepted = parseSystematicAnalysis(JSON.stringify({ pairs: [first, second] }), expected);
  assert.deepEqual(accepted.pairs.map(pair => pair.entity_b_name), expected.map(entity => entity.name));
});

test('a resumed output-budget retry preserves its increased budget and uses Astra with the clinical research contract', async () => {
  const h = harness();
  await executeSystematicStep({ ...h.payload(), maxOutputTokens: 128_000 }, h.runtime);
  assert.equal(h.calls.starts[0].maxTokens, 128_000);
  assert.equal(h.calls.starts[0].model, RESEARCH_MODEL);
  assert.equal(h.calls.starts[0].reasoningEffort, 'high');
  assert.equal(h.calls.starts[0].forceModel, true);
  assert.equal(h.calls.starts[0].enforceClinicalContract, true);
  assert.equal(h.calls.starts[0].clinicalTask, 'research_synthesis');
  assert.equal(h.calls.starts[0].elementCount, 5);
  assert.equal(h.calls.starts[0].hasExternalEvidence, true);
});

test('a completed pre-Astra systematic response finalizes without another provider creation', async () => {
  const state = stateFor(2);
  state.batch = { index: 0, candidates: [1], pending: [1], cached: 0, documented: 0 };
  const h = harness(state);
  h.runtime.retrieve = async responseId => {
    h.calls.retrieves.push(responseId);
    return { id: responseId, provider: 'openai', model: 'gpt-5.5', reasoningEffort: 'medium',
      status: 'completed', text: JSON.stringify(analysisFor(state)) };
  };
  assert.equal(await executeSystematicStep({ ...h.payload(), providerResponseId: 'resp_historical' }, h.runtime), 'completed');
  assert.equal(h.calls.starts.length, 0);
  assert.deepEqual(h.calls.retrieves, ['resp_historical']);
  assert.equal(h.saved().result?.pairs_analyzed, 1);
  assert.equal(h.calls.finishes, 1);
});

test('completed long clinical fields are preserved through validation and persistence input', () => {
  const pair = { ...pairFor(entities[1].name),
    reasoning: 'Synthetic reasoning. '.repeat(400) + 'Final observation.',
    mechanism: 'Synthetic mechanism. '.repeat(400) + 'Final mechanism.',
    recommendation: 'Synthetic recommendation. '.repeat(400) + 'Final qualification.',
  };
  const synthesis = 'Synthetic synthesis. '.repeat(600) + 'Final synthesis.';
  const parsed = parseSystematicAnalysis(JSON.stringify({ pairs: [pair], synthesis }), [entities[1]]);
  assert.deepEqual(parsed.pairs[0], pair);
  assert.equal(parsed.synthesis, synthesis);
});
