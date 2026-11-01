import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callAI, prepareClinicalAICall } from '../supabase/functions/_shared/ai-client.ts';
import { detectHighRiskContext, profileClinicalPrompt, selectClinicalModel } from '../supabase/functions/_shared/clinical-brain.ts';

test('administrative text does not trigger vulnerable patient context through substrings', () => {
  const result = detectHighRiskContext({ freeText: 'Message de suivi administratif.' });
  assert.equal(result.riskLevel, 'low');
  assert.ok(!result.flags.includes('vulnerable_context'));
});

test('high risk medications present in free text are identified', () => {
  const result = detectHighRiskContext({ freeText: 'Patient sous warfarin.' });
  assert.equal(result.riskLevel, 'high');
  assert.ok(result.flags.includes('high_risk_medication'));
});

test('critical known interaction routes to Astra with the strongest reasoning', () => {
  const risk = detectHighRiskContext({ medications: [{ name: 'Warfarin' }], symptoms: [{ name: 'Hémorragie digestive' }] });
  const result = selectClinicalModel({ task: 'known_interaction', riskAssessment: risk });
  assert.equal(result.model, 'gpt-6-astra');
  assert.equal(result.reasoningEffort, 'max');
  assert.equal(result.finalReviewRequired, true);
});

test('critical official label review cannot be downgraded to the standard model', () => {
  const risk = detectHighRiskContext({ symptoms: [{ name: 'Anaphylaxie' }] });
  const route = selectClinicalModel({ task: 'official_label_summary', riskAssessment: risk });
  assert.equal(route.model, 'gpt-6-astra');
  assert.equal(route.reasoningEffort, 'max');
});

test('mere source mentions and unavailable PubMed evidence do not establish retrieved evidence', () => {
  for (const phrase of [
    'Sources PubMed indisponibles, aucune preuve récupérée.',
    'Analyse clinique patient avec sources PubMed disponibles.',
  ]) {
    assert.equal(profileClinicalPrompt(phrase).hasExternalEvidence, false);
  }
});

test('the verified evidence flag remains possible only when supplied explicitly', () => {
  const result = prepareClinicalAICall(
    'Analyse clinique des interactions.',
    'Patient avec interaction médicamenteuse.',
    { clinicalTask: 'known_interaction', hasExternalEvidence: true },
    () => undefined,
  );
  assert.equal(result.clinicalRoute?.task, 'known_interaction');
  assert.ok(result.systemPrompt.includes('CONTRAT CLINIQUE VERIFIABLE'));
});

test('system prompt examples do not inflate the risk of an otherwise low-risk patient query', () => {
  const result = prepareClinicalAICall(
    'Examples: warfarin, insuline, anaphylaxie.',
    'Patient: rhume banal, pas de médicaments.',
    { enforceClinicalContract: true },
    () => undefined,
  );
  assert.equal(result.clinicalSafety?.riskLevel, 'low');
});

test('critical call uses Astra Responses max/pro despite generic OPENAI_MODEL', async () => {
  const originalDeno = (globalThis as { Deno?: unknown }).Deno;
  const originalFetch = globalThis.fetch;
  let request: Record<string, unknown> = {};
  let requestURL = '';
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => ({ OPENAI_API_KEY: 'test-only-key', OPENAI_MODEL: 'gpt-5.5' } as Record<string, string>)[key] },
  };
  globalThis.fetch = async (input, init) => {
    requestURL = String(input);
    request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ output_text: 'Analyse limitée par les preuves disponibles.' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const result = await callAI('Analyse clinique patient.', 'Patient avec risque de saignement.', {
      clinicalTask: 'known_interaction',
      clinicalInput: { medications: [{ name: 'Warfarin' }], symptoms: [{ name: 'Hémorragie digestive' }] },
      responseFormat: { type: 'json_object' },
      temperature: 0.1,
    });
    assert.equal(result.model, 'gpt-6-astra');
    assert.ok(requestURL.endsWith('/responses'));
    assert.equal(request.model, 'gpt-6-astra');
    assert.deepEqual(request.reasoning, { effort: 'max', mode: 'pro' });
    assert.ok(Number(request.max_output_tokens) >= 25_000);
    assert.ok(!('temperature' in request));
    assert.deepEqual(request.text, { format: { type: 'json_object' } });
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
  }
});

test('legacy gpt-5.5 critical override uses its supported xhigh effort without pro mode', () => {
  const risk = detectHighRiskContext({ symptoms: [{ name: 'Hémorragie' }] });
  const result = selectClinicalModel({ task: 'known_interaction', riskAssessment: risk }, {
    OPENAI_CLINICAL_CRITICAL_MODEL: 'gpt-5.5',
  });
  assert.equal(result.model, 'gpt-5.5');
  assert.equal(result.reasoningEffort, 'xhigh');
  assert.equal(result.reasoningMode, undefined);
});

test('legacy caller cannot force an unsupported max effort on GPT-5.5', () => {
  const result = prepareClinicalAICall('Analyse clinique.', 'Patient avec hémorragie.', {
    clinicalTask: 'known_interaction',
    model: 'gpt-5.5',
    forceModel: true,
    reasoningEffort: 'max',
  }, () => undefined);
  assert.equal(result.options.model, 'gpt-5.5');
  assert.equal(result.options.reasoningEffort, 'xhigh');
  assert.equal(result.options.reasoningMode, undefined);
});
