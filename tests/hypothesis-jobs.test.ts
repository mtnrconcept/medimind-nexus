import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  advanceHypothesisProvider, buildHypothesisMirror, extractHypothesisJSON, hypothesisClaimId,
  hypothesisLegacyPatch, publishHypothesisOnce,
  type HypothesisProviderRuntime,
} from '../supabase/functions/_shared/hypothesis-jobs.ts';
import type { AIBackgroundPollResult } from '../supabase/functions/_shared/ai-client.ts';
import { RESEARCH_MODEL } from '../supabase/functions/_shared/research-model.ts';

const jobId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const now = 1_800_000_000_000;

test('long completed reports preserve literal braces and escaped quotes inside narrative fields', () => {
  const report = { statement: 'A {literal} condition with an unmatched } and "quoted" text.',
    detail: 'Long scientific narrative. '.repeat(2000) };
  const json = JSON.stringify(report);
  assert.deepEqual(JSON.parse(extractHypothesisJSON(`Result:\n${json}\nEnd.`)), report);
  assert.deepEqual(JSON.parse(extractHypothesisJSON(`\`\`\`json\n${json}\n\`\`\``)), report);
});

test('the owner-scoped hypothesis mirror stores only a legacy reference and internal monitor state', () => {
  const mirror = buildHypothesisMirror(jobId, ownerId, now);
  assert.equal(mirror.id, jobId);
  assert.equal(mirror.requested_by, ownerId);
  assert.equal(mirror.function_name, 'hypothesis-processor');
  assert.equal(mirror.analysis_mode, 'hypothesis_generation');
  assert.equal(mirror.status, 'queued');
  assert.equal(mirror.model, RESEARCH_MODEL);
  assert.equal(mirror.reasoning_effort, 'high');
  assert.deepEqual(Object.keys(mirror.request_payload).sort(), ['_background_monitor', 'legacyJobId']);
  assert.equal(mirror.request_payload.legacyJobId, jobId);
  assert.equal(mirror.expires_at, new Date(now + 24 * 60 * 60_000).toISOString());
});

test('an invalid job or owner cannot create a durable mirror', () => {
  assert.throws(() => buildHypothesisMirror('bad', ownerId, now));
  assert.throws(() => buildHypothesisMirror(jobId, '', now));
});

test('provider progress and terminal failure reach the legacy polling screen', () => {
  const mirror = buildHypothesisMirror(jobId, ownerId, now);
  assert.equal(hypothesisLegacyPatch(mirror).status, 'pending');
  assert.deepEqual(hypothesisLegacyPatch({ ...mirror, status: 'failed', progress_percentage: 80,
    progress_message: 'Réponse incomplète', error_message: 'Budget épuisé', completed_at: 'done' }), {
    status: 'failed', progress_percentage: 80, progress_message: 'Réponse incomplète',
    error_message: 'Budget épuisé', completed_at: 'done',
  });
});

test('the completed mirror exposes the same published hypothesis to legacy clients', () => {
  const mirror = buildHypothesisMirror(jobId, ownerId, now);
  const patch = hypothesisLegacyPatch({ ...mirror, status: 'completed', progress_percentage: 100,
    result_payload: { success: true, job_id: jobId, hypothesis_id: jobId } });
  assert.equal(patch.status, 'completed');
  assert.equal(patch.hypothesis_id, jobId);
  assert.equal(patch.progress_percentage, 100);
});

function providerHarness() {
  const calls = { start: [] as number[], retrieve: [] as string[], writes: [] as Array<Record<string, unknown>> };
  let response: AIBackgroundPollResult = {
    id: 'resp_hypothesis', provider: 'openai', model: 'gpt-5.5', status: 'completed', text: '{"statement":"fixture"}',
  };
  const runtime: HypothesisProviderRuntime = {
    async start(maxTokens) {
      calls.start.push(maxTokens);
      return { id: 'resp_hypothesis', provider: 'openai', model: 'gpt-5.5',
        status: 'queued', maxOutputTokens: maxTokens };
    },
    async retrieve(id) { calls.retrieve.push(id); return response; },
    async update(patch, budget) { calls.writes.push({ ...patch, budget }); },
    now: () => now,
  };
  return { calls, runtime, respond(value: AIBackgroundPollResult) { response = value; } };
}

test('hypotheses start once in background with a 65,536-token budget and persist the response id', async () => {
  const h = providerHarness();
  assert.deepEqual(await advanceHypothesisProvider({}, h.runtime), { ready: false });
  assert.deepEqual(h.calls.start, [65_536]);
  assert.deepEqual(h.calls.retrieve, []);
  assert.equal(h.calls.writes[0].provider_response_id, 'resp_hypothesis');
  assert.equal(h.calls.writes[0].budget, 65_536);
});

test('a monitor retry increases the hypothesis budget without changing models or discarding its cap', async () => {
  const h = providerHarness();
  await advanceHypothesisProvider({ maxTokens: 128_000 }, h.runtime);
  assert.deepEqual(h.calls.start, [128_000]);
});

test('an ambiguous creation error is never retried automatically', async () => {
  const h = providerHarness();
  h.runtime.start = async () => { h.calls.start.push(65_536); throw new Error('network lost after POST'); };
  await assert.rejects(advanceHypothesisProvider({}, h.runtime), /lancement OpenAI/i);
  assert.equal(h.calls.start.length, 1);
  assert.equal(h.calls.writes.length, 0);
});

test('a finalizer retrieves the saved provider response and never starts a second generation', async () => {
  const h = providerHarness();
  assert.deepEqual(await advanceHypothesisProvider({ providerResponseId: 'resp_saved' }, h.runtime), {
    ready: true, text: '{"statement":"fixture"}',
  });
  assert.deepEqual(h.calls.start, []);
  assert.deepEqual(h.calls.retrieve, ['resp_saved']);
});

test('a transient finalizer GET releases its lease to polling while retaining the saved response', async () => {
  const h = providerHarness();
  h.runtime.retrieve = async id => { h.calls.retrieve.push(id); throw new Error('temporary disconnect'); };
  assert.deepEqual(await advanceHypothesisProvider({ providerResponseId: 'resp_saved' }, h.runtime), { ready: false });
  assert.deepEqual(h.calls.start, []);
  assert.equal(h.calls.writes[0].provider_status, 'in_progress');
  assert.equal('provider_response_id' in h.calls.writes[0], false);
  assert.equal('status' in h.calls.writes[0], false);
});

test('an incomplete provider snapshot never reaches JSON repair or clinical publication', async () => {
  const h = providerHarness();
  h.respond({ id: 'resp_saved', provider: 'openai', model: 'gpt-5.5', status: 'incomplete',
    incompleteReason: 'max_output_tokens', partialText: '{"statement":"truncated' });
  assert.deepEqual(await advanceHypothesisProvider({ providerResponseId: 'resp_saved' }, h.runtime), { ready: false });
  assert.equal(h.calls.start.length, 0);
  assert.equal(h.calls.writes[0].provider_status, 'in_progress');
});

test('a completed response without visible output cannot publish an empty hypothesis', async () => {
  const h = providerHarness();
  h.respond({ id: 'resp_saved', provider: 'openai', model: 'gpt-5.5', status: 'completed', text: ' ' });
  await assert.rejects(advanceHypothesisProvider({ providerResponseId: 'resp_saved' }, h.runtime), /vide/i);
});

test('publication can recover after a lost DB acknowledgment without duplicating or replacing a hypothesis', async () => {
  const saved = new Map<string, { id: string; statement: string }>();
  let inserts = 0;
  const publish = (statement: string) => publishHypothesisOnce(jobId, {
    async insertIfAbsent() {
      if (saved.has(jobId)) return null;
      const row = { id: jobId, statement };
      saved.set(jobId, row);
      inserts += 1;
      return row;
    },
    async load() { return saved.get(jobId) ?? null; },
  });
  await publish('original');
  const recovered = await publish('must not overwrite');
  assert.equal(recovered.statement, 'original');
  assert.equal(inserts, 1);
});

test('claim identifiers remain stable across finalization retries and distinct across jobs', async () => {
  const first = await hypothesisClaimId(jobId, 0);
  assert.match(first, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(first, await hypothesisClaimId(jobId, 0));
  assert.notEqual(first, await hypothesisClaimId(jobId, 1));
  assert.notEqual(first, await hypothesisClaimId(ownerId, 0));
});
