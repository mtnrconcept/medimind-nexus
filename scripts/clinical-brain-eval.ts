import assert from 'node:assert/strict';

import {
  CLINICAL_RESPONSE_CONTRACT,
  detectHighRiskContext,
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

assert.equal(simpleRoute.model, 'gpt-4o');
assert.equal(simpleRoute.reasoningEffort, 'low');
assert.equal(simpleRoute.finalReviewRequired, false);

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

console.log('Clinical brain audit passed');
