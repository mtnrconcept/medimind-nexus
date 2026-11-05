import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPairCandidates, buildSelectedElements, typedElementKey } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { buildCanonicalClinicalContext, contextForPairs, type CanonicalCatalogInput } from '../supabase/functions/cross-data-analyzer/clinical-context.ts';
import { createAgentState, buildAgentRequest, nextAgentStep, globalAgentInput } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';

function syntheticCatalog(): CanonicalCatalogInput {
  return {
    pathologies: [{ name: 'Condition synthétique', icd_code: 'SYNTHETIC-CODE', synonyms: ['Alias synthétique'],
      category: 'Catégorie de test', description: 'Description de la condition.', specialty: 'Spécialité de test', severity: 'moderate' }],
    symptoms: [{ name: 'Symptôme synthétique', body_system: 'Système de test', description: 'Description du symptôme.' }],
    treatments: [{ name: 'Traitement synthétique', type: 'therapy', description: 'Description du traitement.',
      pathologies: { name: 'Condition synthétique', icd_code: 'SYNTHETIC-CODE' }, contraindications: ['Restriction de catalogue'] }],
    medications: [{ name: 'Médicament synthétique', substance: 'Substance de test', atc_code: 'SYNTHETIC-ATC',
      description: 'Description du médicament.', dosage_forms: ['Formulation de test'], indications: 'Indication documentaire.',
      posology: 'Information documentaire de posologie.', source_url: 'https://example.invalid/catalogue',
      side_effects: [{ name: 'Effet synthétique', description: 'Détail de cet effet.', frequency: 'unknown', severity: 'unknown' }],
      contraindications: [{ condition: 'Condition de test', description: 'Détail de la restriction.' }],
      drug_interactions: [{ interacting_drug: 'Deuxième molécule synthétique', interaction_type: 'unknown',
        description: 'Mécanisme à examiner.', recommendation: 'Vérification documentaire nécessaire.' }],
      patient_notes: 'PRIVATE_SENTINEL', user_instructions: 'PRIVATE_SENTINEL' }],
    symptomLinks: [{ pathologies: { name: 'Condition synthétique' }, symptoms: { name: 'Symptôme synthétique' }, frequency_percent: 0, is_primary: false },
      { pathologies: { name: 'Condition absente' }, symptoms: { name: 'Symptôme synthétique' }, frequency_percent: 50 }],
  };
}

test('canonical catalogue context preserves structured clinical details without manufacturing evidence', () => {
  const input = syntheticCatalog();
  const selected = buildSelectedElements(input.pathologies, input.symptoms, input.treatments, input.medications);
  const context = buildCanonicalClinicalContext(input, selected);
  const state = createAgentState(selected, context);
  assert.equal(context.catalog.length, 4);
  assert.equal(context.verification, 'unverified_context');
  const drug = context.catalog.find(item => item.type === 'medication')!.details;
  assert.equal(drug.posology, 'Information documentaire de posologie.');
  assert.deepEqual(drug.dosage_forms, ['Formulation de test']);
  assert.deepEqual(drug.drug_interactions, [{ interacting_drug: 'Deuxième molécule synthétique', interaction_type: 'unknown',
    description: 'Mécanisme à examiner.', recommendation: 'Vérification documentaire nécessaire.' }]);
  assert.deepEqual(context.associations, [{ fromKey: typedElementKey(selected[0]), toKey: typedElementKey(selected[1]), frequencyPercent: 0, isPrimary: false }]);
  assert.doesNotMatch(JSON.stringify(context), /PRIVATE_SENTINEL|patient_notes|user_instructions/);
  assert.deepEqual(state.cells, {});
  assert.deepEqual(state.analysis.causalLinks, []);
  assert.deepEqual(state.agent.sourceRegistry, []);
  assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 0);
  assert.deepEqual(globalAgentInput(state).clinicalContext, context);
  assert.match(buildAgentRequest(state, nextAgentStep(state)).system, /indices non vérifiés/);
});

test('each pair receives its own catalogue context; new candidates and external concepts remain explicitly unknown', () => {
  const input = syntheticCatalog();
  const selected = buildSelectedElements(input.pathologies, input.symptoms, input.treatments, input.medications);
  const context = buildCanonicalClinicalContext(input, selected);
  const first = buildPairCandidates(selected)[0];
  const scoped = contextForPairs(context, [first])!;
  assert.deepEqual(scoped.catalog.map(item => item.key), [typedElementKey(first.left), typedElementKey(first.right)]);
  assert.equal(scoped.associations.length, 1);
  const candidate = { name: 'Candidat externe synthétique', type: 'medication' as const };
  const pair = buildPairCandidates([selected[0], candidate])[0];
  const candidateContext = contextForPairs(context, [pair])!;
  assert.deepEqual(candidateContext.unavailableKeys, [typedElementKey(candidate)]);
  assert.equal(candidateContext.catalog.length, 1);
  assert.deepEqual(candidateContext.associations, []);
  assert.equal(contextForPairs(undefined, [pair]), undefined, 'Already persisted jobs remain readable without invented context.');
});

test('catalogue text and lists have explicit truncation metadata and bounded payloads', () => {
  const medications = Array.from({ length: 50 }, (_, i) => ({ name: 'Médicament synthétique ' + i,
    indications: 'x'.repeat(12_000), posology: 'y'.repeat(12_000),
    side_effects: Array.from({ length: 30 }, (_, j) => ({ name: 'Effet de test ' + j, description: 'z'.repeat(12_000) })) }));
  const selected = buildSelectedElements([], [], [], medications);
  const context = buildCanonicalClinicalContext({ pathologies: [], symptoms: [], treatments: [], medications, symptomLinks: [] }, selected);
  assert.equal(context.catalog.length, 50);
  assert.ok(context.truncations.some(t => t.unit === 'characters' && t.available === 12_000 && t.retained === 1200));
  assert.ok(context.truncations.some(t => t.field === 'side_effects' && t.unit === 'items' && t.available === 30 && t.retained <= 12));
  assert.ok(context.truncations.some(t => t.unit === 'characters' && t.retained === 0), 'The exhausted total budget is never silently hidden.');
  assert.ok(JSON.stringify(context).length < 180_000);
  const state = createAgentState(selected, context);
  assert.ok(state.analysis.warnings.some(w => /abrégé/.test(w)));
  assert.deepEqual(state.analysis.causalLinks, []);
});

test('unselected canonical entities and malformed catalogue URLs cannot enter the prompt as sources', () => {
  const input = syntheticCatalog();
  const selected = buildSelectedElements(input.pathologies, [], [], input.medications);
  (input.medications[0] as Record<string, unknown>).source_url = 'javascript:untrusted()';
  const context = buildCanonicalClinicalContext(input, selected);
  assert.equal(context.catalog.length, 2);
  assert.deepEqual(context.associations, []);
  assert.equal(context.catalog.find(item => item.type === 'medication')!.details.source_url, undefined);
});
