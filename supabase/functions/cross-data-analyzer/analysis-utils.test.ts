import {
  buildEvidenceLinks,
  buildSelectedElements,
  computeSchemaStats,
  ensureSchemaComparison,
  mergeAndValidateLinks,
  normalizeCausalLink,
  scoreFromStats,
  type AnalysisResult,
  type CausalLink,
} from './analysis-utils.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('rejects causal links that reference unselected entities', () => {
  const selected = buildSelectedElements([{ name: 'Diabete' }], [{ name: 'Fatigue' }], [], []);
  const link = normalizeCausalLink({
    from: 'Aspirine',
    fromType: 'medication',
    to: 'Fatigue',
    toType: 'symptom',
    relationship: 'Effet indesirable',
    probability: 'high',
    evidence: 'Mention hors selection',
    patientCount: 0,
    webSources: [],
  }, selected);
  assert(link === null, 'unselected medication should be rejected');
});

Deno.test('normalizes pathology to symptom links without treatment-only fields', () => {
  const selected = buildSelectedElements([{ name: 'Varicelle' }], [{ name: 'Fievre' }], [], []);
  const link = normalizeCausalLink({
    from: 'Varicelle',
    fromType: 'pathology',
    to: 'Fievre',
    toType: 'symptom',
    relationship: 'Signe frequent',
    probability: 'high',
    evidence: 'Symptome typique',
    patientCount: 0,
    webSources: [],
    isAppropriate: true,
    effectType: 'therapeutic',
    dangerLevel: 'high',
  }, selected);
  assert(link !== null, 'pathology symptom link should be kept');
  assert(link.symptomFrequency === 'possible', 'missing frequency should default to possible');
  assert(link.isAppropriate === undefined, 'isAppropriate should be removed for pathology symptoms');
  assert(link.effectType === undefined, 'effectType should be removed for pathology symptoms');
  assert(link.dangerLevel === undefined, 'dangerLevel should be removed for pathology symptoms');
});

Deno.test('deduplicates drug-drug interactions independent of direction', () => {
  const selected = buildSelectedElements([], [], [], [{ name: 'Warfarine' }, { name: 'Ibuprofene' }]);
  const links = mergeAndValidateLinks(selected, [
    {
      from: 'Warfarine',
      fromType: 'medication',
      to: 'Ibuprofene',
      toType: 'medication',
      relationship: 'Interaction',
      probability: 'medium',
      evidence: 'Interaction possible',
      patientCount: 0,
      webSources: [],
      dangerLevel: 'moderate',
    },
    {
      from: 'Ibuprofene',
      fromType: 'medication',
      to: 'Warfarine',
      toType: 'medication',
      relationship: 'Interaction majeure',
      probability: 'high',
      evidence: 'Risque hemorragique documente avec meilleure preuve',
      patientCount: 0,
      webSources: [],
      dangerLevel: 'critical',
    },
  ]);
  assert(links.length === 1, 'drug-drug interaction should be deduplicated');
  assert(links[0].dangerLevel === 'critical', 'stronger evidence should win');
});

Deno.test('computes schema risk score from dangerous and beneficial links', () => {
  const links: CausalLink[] = [
    {
      from: 'Ibuprofene',
      fromType: 'medication',
      to: 'Insuffisance renale',
      toType: 'pathology',
      relationship: 'Contre-indication',
      probability: 'high',
      evidence: 'Risque renal',
      patientCount: 0,
      webSources: [],
      isAppropriate: false,
      effectType: 'adverse',
      dangerLevel: 'high',
      interactionType: 'pathology-danger',
    },
    {
      from: 'Insuffisance renale',
      fromType: 'pathology',
      to: 'Oedeme',
      toType: 'symptom',
      relationship: 'Symptome frequent',
      probability: 'high',
      evidence: 'Signe attendu',
      patientCount: 0,
      webSources: [],
      symptomFrequency: 'frequent',
    },
  ];
  const stats = computeSchemaStats(links);
  assert(stats.redLinks === 1, 'one high danger link expected');
  assert(stats.greenLinks === 1, 'one beneficial/expected link expected');
  assert(stats.inappropriateCount === 1, 'inappropriate medication count expected');
  assert(scoreFromStats(stats) === 65, 'score should follow release formula');
});

Deno.test('builds deterministic evidence links from DB side effects and contraindications', () => {
  const links = buildEvidenceLinks({
    pathologies: [{ id: 'p1', name: 'Insuffisance renale' }],
    symptoms: [{ id: 's1', name: 'Nausee' }],
    treatments: [],
    medications: [{
      id: 'm1',
      name: 'Ibuprofene',
      side_effects: [{ name: 'Nausee', severity: 'moderate', frequency: 'common' }],
      contraindications: [{ condition: 'Insuffisance renale', severity: 'critical' }],
      drug_interactions: [],
    }],
    symptomLinks: [],
  });
  assert(links.length === 2, 'contraindication and side-effect links expected');
  assert(links.some((link) => link.to === 'Insuffisance renale' && link.dangerLevel === 'critical'), 'critical contraindication expected');
  assert(links.some((link) => link.to === 'Nausee' && link.effectType === 'adverse'), 'side effect link expected');
});

Deno.test('ensures schema comparison even when the model omits it', () => {
  const analysis: AnalysisResult = {
    causalLinks: [{
      from: 'Ibuprofene',
      fromType: 'medication',
      to: 'Insuffisance renale',
      toType: 'pathology',
      relationship: 'Contre-indication',
      probability: 'high',
      evidence: 'Risque renal',
      patientCount: 0,
      webSources: [],
      isAppropriate: false,
      effectType: 'adverse',
      dangerLevel: 'critical',
      interactionType: 'pathology-danger',
    }],
    summary: '',
    warnings: [],
    recommendations: [],
    alternatives: [],
    webResearch: [],
  };
  const comparison = ensureSchemaComparison(analysis);
  assert(comparison.currentStats.redLinks === 1, 'one critical link should be counted');
  assert(comparison.proposedChanges.length === 1, 'fallback mitigation should be generated');
  assert(comparison.proposedScore >= comparison.currentScore, 'proposal should not reduce score');
});
