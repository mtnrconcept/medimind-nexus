import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentPairPool, runAgentPairPool, type AgentPairPool } from '../supabase/functions/cross-data-analyzer/agent-pair-pool.ts';
import { applyAgentResult, buildAgentRequest, createAgentState, nextAgentStep, type AgentMatrixState, type AgentStep } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';
import { ASTRA_MODEL, FAST_PAIR_MODEL } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';
import { typedElementKey, type PairCandidate, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import type { AICallOptions, AIBackgroundPollResult } from '../supabase/functions/_shared/ai-client.ts';

const selection = (n: number): SelectedElement[] => Array.from({ length: n }, (_, i) => ({ name: `Concept fictif ${i}`, type: 'pathology' }));
const source = { title: 'Synthetic source', url: 'https://www.swissmedic.ch/synthetic-pool-fixture' };
function cells(pairs: PairCandidate[], cited = false) {
  return pairs.map(pair => ({ pairHash: pair.pairHash, links: [], directions: [[pair.left, pair.right], [pair.right, pair.left]].map(([from, to]) => ({
    fromKey: typedElementKey(from), toKey: typedElementKey(to), verdict: cited ? 'hypothesis' : 'insufficient',
    explanation: 'Fixture synthétique, sans conclusion clinique.', limitations: 'Aucune donnée patient.', sourceUrls: cited ? [source.url] : [],
  })) }));
}

function plannedQueries(state: AgentMatrixState, step: AgentStep): string[] {
  return JSON.parse(buildAgentRequest(state, step).user).pairs.map((item: { researchQuery: string }) => item.researchQuery);
}

function provider(clock: () => number, latencyMs = 0, foreignSecondSource = false) {
  const requests: { id: string; at: number; pairs: PairCandidate[]; queries: string[]; options: AICallOptions }[] = [];
  return {
    requests,
    async start(_system: string, input: string, options: AICallOptions) {
      const entries: { pair: PairCandidate; researchQuery?: string }[] = JSON.parse(input).pairs;
      const pairs = entries.map(item => item.pair);
      const queries = entries.flatMap(item => item.researchQuery ? [item.researchQuery] : []);
      const id = `resp_pool_${requests.length}`;
      requests.push({ id, at: clock(), pairs, queries, options });
      return { id, status: 'queued', model: options.model!, reasoningEffort: options.reasoningEffort,
        provider: 'openai' as const, maxOutputTokens: options.maxTokens };
    },
    async retrieve(id: string): Promise<AIBackgroundPollResult> {
      const request = requests.find(r => r.id === id)!;
      const ready = clock() - request.at >= latencyMs;
      return { id, model: request.options.model!, provider: 'openai', status: ready ? 'completed' : 'in_progress',
        maxOutputTokens: request.options.maxTokens,
        ...(ready ? { text: JSON.stringify({ cells: cells(request.pairs, foreignSecondSource) }), webSearchCalls: 1,
          webQueryCalls: 1, webSearchQueries: request.queries,
          webSources: foreignSecondSource && id === 'resp_pool_1' ? [{ ...source, url: 'https://www.swissmedic.ch/different-fixture' }] : [source] } : {}) };
    },
  };
}

test('candidate batches have the same concurrency and the final review waits for every candidate crossing', async () => {
  let state = createAgentState(selection(9));
  while (nextAgentStep(state).kind === 'pairs') {
    const step = nextAgentStep(state);
    applyAgentResult(state, step, { cells: cells(step.pairs) }, [], 1,
      { webQueryCalls: 1, webSearchQueries: plannedQueries(state, step) });
  }
  const candidate = { name: 'Traitement fictif', type: 'treatment' as const };
  applyAgentResult(state, nextAgentStep(state), { status: 'review_required', summary: 'Fixture synthétique.', globalRisks: [], missingData: [],
    candidates: [candidate], options: [{ id: 'synthetic', title: 'Option fictive', rationale: 'Fixture synthétique.', sourceUrls: [source.url],
      changes: [{ action: 'discuss_add', target: candidate.name, replacement: null, rationale: 'Fixture synthétique.', sourceUrls: [source.url] }] }] }, [source], 1);
  assert.equal(nextAgentStep(state).kind, 'candidate_pairs');
  const engine = provider(Date.now);
  const stages: string[] = [];
  const result = await runAgentPairPool(state, undefined, { ...engine, async persist(next) { stages.push(nextAgentStep(next).kind); } });
  state = result.state;
  assert.deepEqual(engine.requests.map(r => r.pairs.length), [4, 4, 1]);
  assert.equal(result.pool.peakConcurrentBatches, 3);
  assert.ok(engine.requests.every(request => request.options.model === FAST_PAIR_MODEL && request.options.reasoningEffort === 'low'));
  assert.equal(state.analysis.agentReview?.coverage.reviewedCandidatePairs, 9);
  assert.equal(nextAgentStep(state).kind, 'final');
  assert.ok(stages.slice(0, -1).every(stage => stage === 'candidate_pairs'));
});

test('a parallel batch cannot reuse a sibling web trace to approve its unsupported citations', async () => {
  const state = createAgentState(selection(5));
  const engine = provider(Date.now, 0, true);
  const result = await runAgentPairPool(state, undefined, { ...engine, async persist() {} });
  assert.equal(result.blocked, false);
  const unsupported = new Set(engine.requests[1].pairs.map(p => p.pairHash));
  const assessments = result.state.analysis.pairAssessments!.filter(a => unsupported.has(a.pairHash));
  assert.equal(assessments.length, 4);
  assert.ok(assessments.every(a => a.directions?.every(d => d.sourceUrls.length === 0)));
  assert.equal(result.state.analysis.causalLinks.length, 0);
  assert.ok(result.state.agent.sourceRegistry.some(s => s.url === source.url), 'A sibling source exists globally, but is never borrowed by the invalid citation.');
});

test('351-pair scheduler benchmark compares serial and parallel execution with a controlled provider latency', async t => {
  let clock = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => clock);
  async function simulate(concurrency: number, batchSize: number, latency: number) {
    clock = 1_800_000_000_000;
    const start = clock;
    let state: AgentMatrixState = createAgentState(selection(27));
    state.batchSize = batchSize;
    let pool: AgentPairPool = { ...createAgentPairPool(), concurrency };
    const engine = provider(() => clock, latency);
    let passes = 0;
    while (nextAgentStep(state).kind === 'pairs') {
      assert.ok(passes++ < 3000);
      const next = await runAgentPairPool(state, pool, { ...engine, async persist() {} });
      state = next.state; pool = next.pool;
      if (nextAgentStep(state).kind === 'pairs') clock += 10_000;
    }
    assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 351);
    assert.equal(new Set(engine.requests.flatMap(r => r.pairs.map(p => p.pairHash))).size, 351);
    return { pairStageSeconds: (clock - start) / 1000, responses: engine.requests.length, peak: pool.peakConcurrentBatches };
  }
  const serial = await simulate(1, 1, 60_000);
  const parallel = await simulate(8, 4, 60_000);
  const slowerBatches = await simulate(8, 4, 120_000);
  assert.equal(serial.responses, 351);
  assert.equal(parallel.responses, 88);
  assert.equal(parallel.peak, 8);
  assert.ok(serial.pairStageSeconds / parallel.pairStageSeconds > 30);
  t.diagnostic(JSON.stringify({ simulated: true, providerLatencySeconds: 60, serial, parallel, doubleLatencyBatches: slowerBatches,
    sameLatencyGain: serial.pairStageSeconds / parallel.pairStageSeconds,
    doubleBatchLatencyGain: serial.pairStageSeconds / slowerBatches.pairStageSeconds }));
});

test('successful queued reads reset consecutive read failures without creating another response', async t => {
  let clock = 1_800_000_000_000, reads = 0;
  t.mock.method(Date, 'now', () => clock);
  let state = createAgentState(selection(5)), pool = createAgentPairPool();
  const engine = provider(() => clock);
  const retrieve = async (id: string): Promise<AIBackgroundPollResult> => {
    if (id === 'resp_pool_0' && reads++ < 18) {
      if (reads % 2) throw new Error('Synthetic temporary network interruption.');
      return { id, model: engine.requests.find(request => request.id === id)!.options.model!, provider: 'openai', status: 'in_progress' };
    }
    return engine.retrieve(id);
  };
  for (let i = 0; i < 30 && nextAgentStep(state).kind === 'pairs'; i++) {
    const result = await runAgentPairPool(state, pool, { ...engine, retrieve, async persist() {} });
    assert.equal(result.blocked, false);
    state = result.state; pool = result.pool; clock += 20_000;
  }
  assert.equal(nextAgentStep(state).kind, 'plan');
  assert.equal(engine.requests.length, 3);
});

test('Sol receipts retain their actual model and effort after all pool slots have completed', async t => {
  let clock = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => clock);
  const engine = provider(() => clock, 10_000);
  const first = await runAgentPairPool(createAgentState(selection(4)), undefined, { ...engine, async persist() {} });
  assert.equal(first.pool.model, FAST_PAIR_MODEL);
  assert.equal(first.pool.reasoningEffort, 'low');
  assert.equal(first.pool.slots.length, 2);
  assert.ok(first.pool.slots.every(slot => slot.model === FAST_PAIR_MODEL && slot.reasoningEffort === 'low'));
  assert.deepEqual(engine.requests.map(request => request.pairs.length), [4, 2]);
  for (const { options } of engine.requests) {
    assert.equal(options.clinicalTask, 'pair_relation_research');
    assert.equal(options.maxTokens, 16_384);
    assert.equal(options.webSearch?.required, true);
    assert.equal(options.webSearch?.searchContextSize, 'medium');
  }
  clock += 10_000;
  const second = await runAgentPairPool(first.state, first.pool, { ...engine, async persist() {} });
  assert.equal(second.blocked, false);
  assert.equal(second.pool.slots.length, 0);
  assert.equal(second.pool.model, FAST_PAIR_MODEL);
  assert.equal(second.pool.reasoningEffort, 'low');
  assert.equal(second.state.analysis.agentReview?.coverage.webSearchedPairs, 6);
});

test('partial and absent batch query traces retain only attested pairs and requeue the others individually', async t => {
  for (const traced of [0, 1]) await t.test(`${traced} attested in first batch`, async () => {
    const engine = provider(Date.now);
    const retrieve = async (id: string): Promise<AIBackgroundPollResult> => {
      const result = await engine.retrieve(id);
      return id === 'resp_pool_0' ? { ...result, webSearchQueries: result.webSearchQueries?.slice(0, traced) } : result;
    };
    const first = await runAgentPairPool(createAgentState(selection(4)), undefined, { ...engine, retrieve, async persist() {} });
    assert.equal(first.blocked, false);
    assert.equal(first.state.batchSize, 1);
    assert.equal(Object.keys(first.state.cells).length, 2 + traced);
    assert.equal(first.state.analysis.agentReview?.coverage.webSearchedPairs, 2 + traced);
    const attested = new Set(Object.keys(first.state.cells));
    const missing = engine.requests[0].pairs.slice(traced).map(pair => pair.pairHash);
    assert.ok(missing.every(hash => !attested.has(hash)));
    assert.deepEqual(engine.requests.slice(2).map(request => request.pairs.length), Array(4 - traced).fill(1));
    assert.ok(engine.requests.slice(2).every(request => missing.includes(request.pairs[0].pairHash)));
    const second = await runAgentPairPool(first.state, first.pool, { ...engine, retrieve, async persist() {} });
    assert.equal(second.blocked, false);
    assert.equal(nextAgentStep(second.state).kind, 'plan');
    assert.equal(second.pool.completedPairs, 6);
    assert.equal(second.state.analysis.agentReview?.coverage.webSearchedPairs, 6);
    assert.ok(second.state.analysis.pairAssessments?.every(assessment => assessment.searchVerification === 'planned_query'));
    for (const hash of attested) assert.equal(engine.requests.flatMap(request => request.pairs).filter(pair => pair.pairHash === hash).length, 1);
  });
});

test('a batch-size fallback also splits unsubmitted token retries while retaining their previous receipt', async () => {
  const engine = provider(Date.now);
  const retrieve = async (id: string): Promise<AIBackgroundPollResult> => {
    const result = await engine.retrieve(id);
    if (id === 'resp_pool_0') return { ...result, webSearchQueries: [] };
    if (id === 'resp_pool_1') return { ...result, status: 'incomplete', incompleteReason: 'max_output_tokens' };
    return result;
  };
  const first = await runAgentPairPool(createAgentState(selection(4)), undefined, { ...engine, retrieve, async persist() {} });
  assert.equal(first.blocked, false);
  assert.equal(first.state.batchSize, 1);
  assert.equal(Object.keys(first.state.cells).length, 0);
  assert.deepEqual(engine.requests.slice(2).map(request => request.pairs.length), Array(6).fill(1));
  const retried = first.pool.slots.filter(slot => slot.previousResponseId === 'resp_pool_1');
  assert.equal(retried.length, 2);
  assert.ok(retried.every(slot => slot.pairHashes.length === 1 && slot.tokenRetries === 1 && slot.maxOutputTokens === 32_768));
  const second = await runAgentPairPool(first.state, first.pool, { ...engine, retrieve, async persist() {} });
  assert.equal(second.blocked, false);
  assert.equal(second.state.analysis.agentReview?.coverage.webSearchedPairs, 6);
  assert.equal(nextAgentStep(second.state).kind, 'plan');
});

test('an incomplete response from the wrong model keeps its receipt without an automatic token retry', async () => {
  const engine = provider(Date.now);
  const result = await runAgentPairPool(createAgentState(selection(2)), undefined, { ...engine,
    async retrieve(id) {
      return { id, model: ASTRA_MODEL, provider: 'openai', status: 'incomplete', incompleteReason: 'max_output_tokens', maxOutputTokens: 16_384 };
    }, async persist() {} });
  assert.equal(result.blocked, true);
  assert.equal(engine.requests.length, 1);
  assert.deepEqual(result.state.cells, {});
  assert.equal(result.pool.slots[0].responseId, 'resp_pool_0');
  assert.equal(result.pool.slots[0].phase, 'blocked');
  assert.equal(result.pool.slots[0].recovery, 'regenerate');
  assert.equal(result.pool.slots[0].tokenRetries, 0);
});

test('a saved legacy Astra slot without model or query policy is read without recreating or upgrading it', async () => {
  const state = createAgentState(selection(2));
  delete state.agent.pairModel; delete state.agent.reviewModel; delete state.agent.pairSearchPolicy;
  const step = nextAgentStep(state);
  const pool: AgentPairPool = { ...createAgentPairPool(), slots: [{
    id: 'legacy-slot', kind: 'pairs', pairHashes: step.pairs.map(pair => pair.pairHash), phase: 'running', responseId: 'legacy-response',
    startedAt: Date.now(), tokenRetries: 0, rateRetries: 0, readFailures: 0,
  }] };
  let reads = 0;
  const result = await runAgentPairPool(state, pool, {
    async start() { return assert.fail('An accepted legacy receipt must not cause another paid creation.'); },
    async retrieve(id, options) {
      reads++;
      assert.equal(id, 'legacy-response');
      assert.equal(options.model, ASTRA_MODEL);
      assert.equal(options.clinicalTask, 'polypharmacy');
      return { id, model: ASTRA_MODEL, provider: 'openai', status: 'completed',
        text: JSON.stringify({ cells: cells(step.pairs) }), webSearchCalls: 1, webSources: [] };
    }, async persist() {},
  });
  assert.equal(reads, 1);
  assert.equal(result.blocked, false);
  assert.equal(result.pool.concurrency, 8);
  assert.equal(result.pool.slots.length, 0);
  assert.equal(Object.keys(result.state.cells).length, 1);
  assert.equal(result.state.analysis.agentReview?.pairModel, ASTRA_MODEL);
});
