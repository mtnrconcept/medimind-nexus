import {
  buildPairCandidates,
  buildPairHash,
  buildEvidenceLinks,
  buildSelectedElements,
  computeSchemaStats,
  ensureSchemaComparison,
  ensureTreatmentSchemasShape,
  mergeAndValidateLinks,
  normalizeCausalLink,
  scoreFromStats,
  typedElementKey,
  type AnalysisResult,
  type CausalLink,
  type SelectedElement,
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

Deno.test('strips appropriateness from medication to symptom links', () => {
  const selected = buildSelectedElements(
    [],
    [{ name: 'Oedeme des paupieres' }],
    [],
    [{ name: 'Prednisolone' }],
  );

  const link = normalizeCausalLink({
    from: 'Prednisolone',
    fromType: 'medication',
    to: 'Oedeme des paupieres',
    toType: 'symptom',
    relationship: 'Effet indesirable possible des corticoides',
    probability: 'medium',
    evidence: 'Retention hydrosodee possible.',
    patientCount: 0,
    webSources: [],
    isAppropriate: false,
  }, selected);

  assert(link !== null, 'medication symptom link should be kept');
  assert(link.isAppropriate === undefined, 'isAppropriate should not classify medication symptoms');
  assert(link.effectType === 'adverse', 'medication symptom should default to an adverse effect when unspecified');
});

Deno.test('does not count symptom adverse effects as inappropriate treatment choices', () => {
  const stats = computeSchemaStats([{
    from: 'Prednisolone',
    fromType: 'medication',
    to: 'Oedeme des paupieres',
    toType: 'symptom',
    relationship: 'Effet indesirable possible',
    probability: 'medium',
    evidence: 'Retention hydrosodee possible.',
    patientCount: 0,
    webSources: [],
    effectType: 'adverse',
  }]);

  assert(stats.inappropriateCount === 0, 'symptom side effect should not be treatment inappropriateness');
  assert(stats.adverseEffectCount === 1, 'symptom side effect should remain an adverse effect');
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

Deno.test('computes only incremental pair work when elements are added', () => {
  const initialElements: SelectedElement[] = [
    { name: 'Syndrome nephrotique', type: 'pathology' },
    { name: 'prednisolone', type: 'medication' },
    { name: 'ciclosporine', type: 'medication' },
    { name: 'irfen', type: 'medication' },
  ];
  const addedElements: SelectedElement[] = [
    { name: 'varicelle', type: 'pathology' },
    { name: 'aciclovir', type: 'medication' },
  ];
  const expandedElements = [...initialElements, ...addedElements];

  const initialPairs = buildPairCandidates(initialElements);
  const expandedPairs = buildPairCandidates(expandedElements);
  const initialPairHashes = new Set(initialPairs.map((pair) => pair.pairHash));
  const initialElementKeys = new Set(initialElements.map(typedElementKey));
  const addedElementKeys = new Set(addedElements.map(typedElementKey));
  const pairsToAudit = expandedPairs.filter((pair) => !initialPairHashes.has(pair.pairHash));

  assert(initialPairs.length === 6, 'four initial elements should produce six cached pairs');
  assert(expandedPairs.length === 15, 'six expanded elements should produce fifteen total pairs');
  assert(pairsToAudit.length === 9, 'second search should audit only nine new pairs');
  assert(
    buildPairHash('Syndrome nephrotique', 'pathology', 'prednisolone', 'medication') ===
      'prednisolone|medication|syndrome nephrotique|pathology',
    'pair hash format must remain compatible with existing causal_links_cache rows',
  );
  assert(
    pairsToAudit.every((pair) => {
      const leftKey = typedElementKey(pair.left);
      const rightKey = typedElementKey(pair.right);
      return !(initialElementKeys.has(leftKey) && initialElementKeys.has(rightKey));
    }),
    'old-old pairs must stay covered by cache',
  );
  assert(
    pairsToAudit.some((pair) => {
      const leftKey = typedElementKey(pair.left);
      const rightKey = typedElementKey(pair.right);
      return (
        (initialElementKeys.has(leftKey) && addedElementKeys.has(rightKey)) ||
        (addedElementKeys.has(leftKey) && initialElementKeys.has(rightKey))
      );
    }),
    'old-new pairs should be audited',
  );
  assert(
    pairsToAudit.some((pair) => addedElementKeys.has(typedElementKey(pair.left)) && addedElementKeys.has(typedElementKey(pair.right))),
    'new-new pairs should be audited',
  );
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

Deno.test('normalizes treatment schema proposals and drops incomplete steps', () => {
  const schemas = ensureTreatmentSchemasShape([{
    title: 'Schéma sans AINS',
    priority: 'preferred',
    rationale: 'Réduit le risque rénal.',
    expectedBenefits: ['Moins de risque iatrogène'],
    residualRisks: ['Surveillance clinique nécessaire'],
    monitoringPlan: ['Créatinine', 'Tension artérielle'],
    patientWarnings: ['Consulter si œdèmes aggravés'],
    confidence: 'high',
    steps: [
      {
        action: 'replace',
        target: 'Ibuprofene',
        targetType: 'medication',
        replacement: 'Paracetamol',
        rationale: 'Évite la contre-indication rénale.',
      },
      {
        action: 'remove',
        target: '',
        rationale: 'incomplet',
      },
    ],
  }]);

  assert(schemas.length === 1, 'one valid treatment schema expected');
  assert(schemas[0].steps.length === 1, 'incomplete steps should be dropped');
  assert(schemas[0].steps[0].replacement === 'Paracetamol', 'replacement should be preserved');
});
