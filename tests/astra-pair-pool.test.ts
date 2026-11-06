import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentPairPool, runAgentPairPool, type AgentPairPool } from '../supabase/functions/cross-data-analyzer/agent-pair-pool.ts';
import { applyAgentResult, createAgentState, nextAgentStep, type AgentMatrixState } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';
import { ASTRA_MODEL } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';
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

function provider(clock: () => number, latencyMs = 0, foreignSecondSource = false) {
  const requests: { id: string; at: number; pairs: PairCandidate[]; options: AICallOptions }[] = [];
  return {
    requests,
    async start(_system: string, input: string, options: AICallOptions) {
      const pairs = JSON.parse(input).pairs.map((item: { pair: PairCandidate }) => item.pair);
      const id = `resp_pool_${requests.length}`;
      requests.push({ id, at: clock(), pairs, options });
      return { id, status: 'queued', model: ASTRA_MODEL, provider: 'openai' as const, maxOutputTokens: options.maxTokens };
    },
    async retrieve(id: string): Promise<AIBackgroundPollResult> {
      const request = requests.find(r => r.id === id)!;
      const ready = clock() - request.at >= latencyMs;
      return { id, model: ASTRA_MODEL, provider: 'openai', status: ready ? 'completed' : 'in_progress',
        ...(ready ? { text: JSON.stringify({ cells: cells(request.pairs, foreignSecondSource) }), webSearchCalls: 1,
          webSources: foreignSecondSource && id === 'resp_pool_1' ? [{ ...source, url: 'https://www.swissmedic.ch/different-fixture' }] : [source] } : {}) };
    },
  };
}

test('candidate batches have the same concurrency and the final review waits for every candidate crossing', async () => {
  let state = createAgentState(selection(9));
  while (nextAgentStep(state).kind === 'pairs') {
    const step = nextAgentStep(state);
    applyAgentResult(state, step, { cells: cells(step.pairs) }, [], 1);
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
      return { id, model: ASTRA_MODEL, provider: 'openai', status: 'in_progress' };
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
