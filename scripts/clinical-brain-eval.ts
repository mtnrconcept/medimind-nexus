import assert from 'node:assert/strict';

import { prepareClinicalAICall } from '../supabase/functions/_shared/ai-client.ts';
import {
  CLINICAL_RESPONSE_CONTRACT,
  detectHighRiskContext,
  profileClinicalPrompt,
  selectClinicalModel,
} from '../supabase/functions/_shared/clinical-brain.ts';

const lowRisk = detectHighRiskContext({
  medications: [{ name: 'Paracetamol' }],
  pathologies: [{ name: 'Rhinopharyngite' }],
  selectedElementCount: 2,
});

assert.equal(lowRisk.riskLevel, 'low');
assert.equal(lowRisk.requiresHumanValidation, false);

const simpleRoute = selectClinicalModel({
  task: 'simple_lookup',
  riskAssessment: lowRisk,
  elementCount: 2,
});

assert.equal(simpleRoute.model, 'gpt-5.4-mini');
assert.equal(simpleRoute.reasoningEffort, 'low');
assert.equal(simpleRoute.finalReviewRequired, false);

const promptProfile = profileClinicalPrompt(
  'Analyse clinique patient: warfarin, insuffisance renale, interaction medicamenteuse et sources PubMed.',
  undefined,
  7,
);

assert.equal(promptProfile.isClinical, true);
assert.equal(promptProfile.task, 'polypharmacy');
assert.equal(promptProfile.hasExternalEvidence, true);
assert.equal(promptProfile.elementCount, 7);

const criticalRisk = detectHighRiskContext({
  medications: [
    { name: 'Warfarin', substance: 'warfarin' },
    { name: 'Lithium' },
    { name: 'Insuline' },
  ],
  pathologies: [{ name: 'Insuffisance renale chronique chez personne agee' }],
  symptoms: [{ name: 'Hemorragie digestive' }],
  selectedElementCount: 8,
});

assert.equal(criticalRisk.riskLevel, 'critical');
assert.equal(criticalRisk.requiresHumanValidation, true);
assert.equal(criticalRisk.requiresSecondPass, true);
assert.ok(criticalRisk.flags.includes('high_risk_medication'));
assert.ok(criticalRisk.flags.includes('vulnerable_context'));
assert.ok(criticalRisk.flags.includes('critical_clinical_context'));
assert.ok(criticalRisk.flags.includes('polypharmacy_or_dense_graph'));

const criticalRoute = selectClinicalModel(
  {
    task: 'polypharmacy',
    riskAssessment: criticalRisk,
    elementCount: 8,
    hasExternalEvidence: true,
  },
  {
    OPENAI_CLINICAL_CRITICAL_MODEL: 'gpt-5.5-pro',
    OPENAI_CLINICAL_FINAL_REVIEW_MODEL: 'gpt-5.5-pro',
  },
);

assert.equal(criticalRoute.model, 'gpt-5.5-pro');
assert.equal(criticalRoute.reasoningEffort, 'xhigh');
assert.equal(criticalRoute.finalReviewRequired, true);

assert.match(CLINICAL_RESPONSE_CONTRACT, /source de verite/);
assert.match(CLINICAL_RESPONSE_CONTRACT, /validation humaine/);
assert.match(CLINICAL_RESPONSE_CONTRACT, /Ne jamais produire une prescription/);

const nonClinicalPlan = prepareClinicalAICall(
  'Summarize operational dashboard notes.',
  'Group duplicate UI labels and return a short JSON object.',
  {},
  () => undefined,
);

assert.equal(nonClinicalPlan.clinicalSafety, undefined);
assert.equal(nonClinicalPlan.clinicalRoute, undefined);

const explicitGpt5Plan = prepareClinicalAICall(
  'Summarize operational dashboard notes.',
  'Group duplicate UI labels and return a short JSON object.',
  { model: 'gpt-5.5', reasoningEffort: 'low' },
  () => undefined,
);

assert.equal(explicitGpt5Plan.options.model, 'gpt-5.5');
assert.equal(explicitGpt5Plan.options.reasoningEffort, 'medium');
assert.equal(explicitGpt5Plan.clinicalSafety?.riskLevel, 'low');

const skippedClinicalPlan = prepareClinicalAICall(
  'Analyse clinique patient.',
  'Patient sous warfarin avec hemorragie.',
  { skipClinicalBrain: true },
  () => undefined,
);

assert.equal(skippedClinicalPlan.clinicalSafety, undefined);

const autoCriticalPlan = prepareClinicalAICall(
  'Analyse clinique patient et interactions medicamenteuses.',
  'Patient age sous warfarin, lithium et insuline avec insuffisance renale et hemorragie digestive. Sources PubMed disponibles.',
  { model: 'gpt-5.4-mini', reasoningEffort: 'low', elementCount: 8 },
  (key) => {
    if (key === 'OPENAI_CLINICAL_CRITICAL_MODEL') return 'gpt-5.5';
    if (key === 'OPENAI_CLINICAL_FINAL_REVIEW_MODEL') return 'gpt-5.5';
    return undefined;
  },
);

assert.equal(autoCriticalPlan.options.model, 'gpt-5.5');
assert.equal(autoCriticalPlan.options.reasoningEffort, 'xhigh');
assert.equal(autoCriticalPlan.clinicalSafety?.riskLevel, 'critical');
assert.equal(autoCriticalPlan.clinicalRoute?.finalReviewRequired, true);
assert.match(autoCriticalPlan.systemPrompt, /CONTRAT CLINIQUE VERIFIABLE/);

console.log('Clinical brain audit passed');
