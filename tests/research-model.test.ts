import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callAI, prepareClinicalAICall } from '../supabase/functions/_shared/ai-client.ts';
import { detectHighRiskContext, selectClinicalModel } from '../supabase/functions/_shared/clinical-brain.ts';
import { researchAIOptions, RESEARCH_MODEL } from '../supabase/functions/_shared/research-model.ts';

test('medical research uses Astra even when a literature topic has no critical patient flags', () => {
  const route = selectClinicalModel({
    task: 'research_synthesis',
    riskAssessment: detectHighRiskContext({ freeText: 'Revue de la littérature sur le psoriasis.' }),
    hasExternalEvidence: true,
  });
  assert.equal(route.model, 'gpt-6-astra');
  assert.equal(route.reasoningEffort, 'high');
  assert.equal(route.finalReviewRequired, true);
});

test('an explicit research route keeps routine dictionary lookups on their existing route', () => {
  const route = selectClinicalModel({
    task: 'simple_lookup',
    riskAssessment: detectHighRiskContext({ freeText: 'Traduire un terme de recherche.' }),
  });
  assert.equal(route.model, 'gpt-6-luna');
  assert.equal(route.reasoningEffort, 'low');
});

test('an ordinary official-label or known-interaction phrase cannot downgrade scientific research', () => {
  const options = researchAIOptions({ maxTokens: 4_000, reasoningEffort: 'medium' });
  const prepared = prepareClinicalAICall(
    'Synthétise une notice officielle et une interaction connue, avec leurs sources.',
    'Recherche sur le psoriasis.',
    options,
    key => key.endsWith('_MODEL') ? 'gpt-5.5' : undefined,
  );
  assert.equal(prepared.options.model, RESEARCH_MODEL);
  assert.equal(prepared.options.forceModel, true);
  assert.equal(prepared.options.reasoningEffort, 'high');
  assert.equal(prepared.options.maxTokens, 32_768);
  assert.equal(prepared.clinicalRoute?.task, 'research_synthesis');
  assert.equal(prepared.clinicalSafety?.riskLevel, 'low');
  assert.ok(prepared.systemPrompt.includes('CONTRAT CLINIQUE VERIFIABLE'));
  assert.equal(prepared.options.hasExternalEvidence, undefined, 'a model route does not fabricate retrieved evidence');
});

test('research retains long-form budgets and stronger requested reasoning while respecting the output cap', () => {
  assert.equal(researchAIOptions({ maxTokens: 80_000 }).maxTokens, 80_000);
  assert.equal(researchAIOptions({ reasoningEffort: 'xhigh' }).maxTokens, 65_536);
  assert.equal(researchAIOptions({ reasoningEffort: 'max', maxTokens: 200_000 }).maxTokens, 128_000);
  assert.equal(researchAIOptions({ reasoningEffort: 'max' }).reasoningEffort, 'max');
  assert.equal(researchAIOptions({ maxTokens: Number.NaN }).maxTokens, 32_768);
  assert.equal(researchAIOptions({ timeoutMs: 40_000 }).timeoutMs, 40_000, 'the caller still owns its deadline');
});

test('critical research retains max/pro reasoning and human verification', () => {
  const prepared = prepareClinicalAICall('Analyse scientifique.', 'Hémorragie sous warfarin.', researchAIOptions(), () => undefined);
  assert.equal(prepared.options.model, RESEARCH_MODEL);
  assert.equal(prepared.options.reasoningEffort, 'max');
  assert.equal(prepared.options.reasoningMode, 'pro');
  assert.equal(prepared.clinicalSafety?.riskLevel, 'critical');
  assert.equal(prepared.clinicalRoute?.finalReviewRequired, true);
  assert.equal(prepared.options.maxTokens, 65_536);
});

test('a full research API call sends Astra and high reasoning instead of a generic model override', async t => {
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => ({ OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'gpt-5.5',
      OPENAI_CLINICAL_STANDARD_MODEL: 'gpt-5.5', OPENAI_CLINICAL_CRITICAL_MODEL: 'gpt-5.5' } as Record<string, string>)[key] },
  };
  t.after(() => { (globalThis as { Deno?: unknown }).Deno = originalDeno; });
  let request: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.ok(url.endsWith('/responses'));
    request = JSON.parse(String(init.body));
    return Response.json({ id: 'resp_research_fixture', status: 'completed', output_text: '{"review":"fixture"}' });
  });
  const result = await callAI('Revue scientifique et contre-indications.', 'Sujet de recherche synthétique.',
    researchAIOptions({ responseFormat: { type: 'json_object' }, maxTokens: 40_000, temperature: 0.2 }));
  assert.equal(result.model, RESEARCH_MODEL);
  assert.equal(request.model, RESEARCH_MODEL);
  assert.deepEqual(request.reasoning, { effort: 'high' });
  assert.equal(request.max_output_tokens, 40_000);
  assert.deepEqual(request.text, { format: { type: 'json_object' } });
  assert.equal('temperature' in request, false, 'the existing Responses capability policy remains applied');
});
