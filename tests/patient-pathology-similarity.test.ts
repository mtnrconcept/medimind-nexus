import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPathologyChoices, rankExactPathologyMatches, rankRecordedConditionMatches, type ClinicalPatientProfile } from '../src/lib/patientSimilarity/clinicalSimilarity.ts';

const PATHOLOGY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const CANCER = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';

function patient(id: string, changes: Partial<ClinicalPatientProfile> = {}): ClinicalPatientProfile {
  return {
    id,
    patientCode: `PAT-${id}`,
    age: 45,
    diagnoses: [{ pathologyId: PATHOLOGY, diagnosedAt: '2022-08-01' }],
    history: [],
    medications: [],
    labs: [],
    symptoms: [],
    ...changes,
  };
}

test('offers a unique list of the source dossier’s recorded pathologies, never a guessed diagnosis', () => {
  const choices = buildPathologyChoices(
    { id: PATHOLOGY, name: 'Polyarthrite rhumatoïde', icdCode: 'M06.9' },
    [
      { id: PATHOLOGY, name: 'Polyarthrite rhumatoïde', icdCode: 'M06.9' },
      { id: OTHER, name: 'Hypothyroïdie', icdCode: 'E03.9' },
      { id: OTHER, name: 'Hypothyroïdie', icdCode: 'E03.9' },
    ],
  );
  assert.deepEqual(choices.map(p => p.id), [OTHER, PATHOLOGY]);
  assert.equal(buildPathologyChoices(null, []).length, 0);
});

test('includes uncoded diseases recorded in personal history, without treating procedures or blank entries as pathologies', () => {
  const choices = buildPathologyChoices(null, [{ id: PATHOLOGY, name: 'Asthme' }], [
    { id: '10000000-0000-4000-8000-000000000001', conditionType: 'disease', name: 'Eczéma' },
    { id: '10000000-0000-4000-8000-000000000002', conditionType: 'disease', name: '  eczéma  ' },
    { id: '10000000-0000-4000-8000-000000000003', conditionType: 'disease', name: 'Migraine' },
    { id: '10000000-0000-4000-8000-000000000004', conditionType: 'disease', name: 'Allergie suspectée' },
    { id: '10000000-0000-4000-8000-000000000005', conditionType: 'surgery', name: 'Appendicectomie' },
    { id: '10000000-0000-4000-8000-000000000006', conditionType: 'hospitalization', name: 'Séjour hospitalier' },
    { id: '10000000-0000-4000-8000-000000000007', conditionType: 'disease', name: '   ' },
  ]);
  assert.deepEqual(choices.map(p => p.name), ['Allergie suspectée', 'Asthme', 'Eczéma', 'Migraine']);
  assert.equal(choices.find(p => p.name === 'Asthme')?.source, 'catalogue');
  assert.equal(choices.find(p => p.name === 'Eczéma')?.source, 'history');
  assert.equal(choices.find(p => p.name === 'Eczéma')?.id, 'history:10000000-0000-4000-8000-000000000001');
});

test('keeps separate canonical identities and the uncoded provenance even when labels coincide', () => {
  const choices = buildPathologyChoices({ id: PATHOLOGY, name: 'Asthme' }, [{ id: OTHER, name: 'Asthme' }], [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Asthme', conditionType: 'disease' },
  ]);
  assert.equal(choices.length, 3);
  assert.deepEqual(choices.filter(p => p.source === 'catalogue').map(p => p.id).sort(), [PATHOLOGY, OTHER].sort());
});

test('uncoded matching uses the complete recorded disease label across history and catalogue, without confirming a shared diagnosis', () => {
  const source = patient('source', { diagnoses: [], history: [{ name: 'Eczéma', conditionType: 'disease' }] });
  const sourceBefore = structuredClone(source);
  const results = rankRecordedConditionMatches(source, 'Eczéma', [
    patient('history', { diagnoses: [], history: [{ name: '  ECZEMA  ', conditionType: 'disease' }] }),
    patient('coded', { diagnoses: [{ pathologyId: OTHER, name: 'Eczéma' }] }),
    patient('suspected', { diagnoses: [], history: [{ name: 'Eczéma suspecté', conditionType: 'disease' }] }),
    patient('negation', { diagnoses: [], history: [{ name: 'Absence d’eczéma', conditionType: 'disease' }] }),
    patient('procedure', { diagnoses: [], history: [{ name: 'Eczéma', conditionType: 'surgery' }] }),
    patient('unknown-kind', { diagnoses: [], history: [{ name: 'Eczéma' }] }),
    source,
    patient('history', { diagnoses: [], history: [{ name: 'Eczéma', conditionType: 'disease' }] }),
  ]);
  assert.deepEqual(results.map(p => p.patientId).sort(), ['coded', 'history']);
  for (const result of results) {
    assert.equal(result.samePathology, false);
    assert.equal(result.matchBasis, 'recorded-label');
    assert.equal(result.componentScores.medicalHistory, null);
    assert.equal(result.componentScores.coDiagnoses, null);
    assert.ok(result.score < 25, 'the entry being compared must not inflate similarity by counting itself');
  }
  assert.deepEqual(source, sourceBefore, 'scoring must never change clinical records');
});

test('uncoded chronology uses the recorded date while excluding the index condition from shared risk factors', () => {
  const source = patient('source', { diagnoses: [], history: [
    { name: 'Migraine', conditionType: 'disease', diagnosisDate: '2024-01-01' },
    { name: 'Eczéma', conditionType: 'disease', diagnosisDate: '2018-01-01' },
  ] });
  const earlier = patient('earlier', { diagnoses: [], history: [
    { name: 'Migraine', conditionType: 'disease', diagnosisDate: '2020-01-01' },
    { name: 'Eczéma', conditionType: 'disease', diagnosisDate: '2014-01-01' },
  ] });
  const future = patient('future', { diagnoses: [], history: [
    { name: 'Migraine', conditionType: 'disease', diagnosisDate: '2020-01-01' },
    { name: 'Eczéma', conditionType: 'disease', diagnosisDate: '2024-01-01' },
  ] });
  const matches = rankRecordedConditionMatches(source, 'Migraine', [future, earlier]);
  assert.equal(matches[0].patientId, 'earlier');
  assert.ok((matches[0].componentScores.chronology ?? 0) > 0.99);
  assert.equal(matches[1].componentScores.chronology, null);
  assert.ok(matches.every(p => p.sharedFactors.every(f => !f.includes('Migraine'))));
});

test('uncoded comparison requires a disease explicitly present in the source history', () => {
  const peer = patient('peer', { history: [{ name: 'Asthme', conditionType: 'disease' }] });
  assert.deepEqual(rankRecordedConditionMatches(patient('source'), 'Asthme', [peer]), []);
  assert.deepEqual(rankRecordedConditionMatches(patient('source', { history: [{ name: 'Asthme', conditionType: 'surgery' }] }), 'Asthme', [peer]), []);
});

test('includes patients with exactly the same pathology UUID, excluding label-only or different UUIDs', () => {
  const source = patient('source');
  const result = rankExactPathologyMatches(source, PATHOLOGY, [
    patient('exact'),
    patient('different', { diagnoses: [{ pathologyId: OTHER, diagnosedAt: '2022-08-01' }] }),
    patient('source'),
    patient('exact', { patientCode: 'duplicated' }),
  ]);
  assert.deepEqual(result.map(p => p.patientId), ['exact']);
  assert.equal(result[0].samePathology, true);
});

test('secondary recorded diagnoses qualify as exact matches to the selected disease', () => {
  const source = patient('source', { diagnoses: [{ pathologyId: PATHOLOGY }, { pathologyId: OTHER }] });
  const p = patient('secondary', { diagnoses: [{ pathologyId: CANCER }, { pathologyId: OTHER }] });
  assert.deepEqual(rankExactPathologyMatches(source, OTHER, [p]).map(x => x.patientId), ['secondary']);
});

test('more shared clinical history and co-morbidities rank above age alone', () => {
  const source = patient('source', {
    age: 44,
    diagnoses: [{ pathologyId: PATHOLOGY }, { pathologyId: OTHER }],
    history: [
      { name: 'Insuffisance rénale chronique', diagnosisDate: '2019-01-01' },
      { name: 'Chirurgie abdominale', diagnosisDate: '2016-09-10' },
    ],
  });
  const close = patient('close', {
    age: 50,
    diagnoses: [{ pathologyId: PATHOLOGY }, { pathologyId: OTHER }],
    history: [
      { name: 'Insuffisance rénale chronique', diagnosisDate: '2020-01-01' },
      { name: 'Chirurgie abdominale', diagnosisDate: '2017-09-10' },
    ],
  });
  const ageOnly = patient('age', { age: 44 });
  const result = rankExactPathologyMatches(source, PATHOLOGY, [ageOnly, close]);
  assert.deepEqual(result.map(x => x.patientId), ['close', 'age']);
  assert.ok(result[0].score > result[1].score);
  assert.ok(result[0].sharedFactors.some(x => /insuffisance renale/i.test(x.normalize('NFD').replace(/\p{Diacritic}/gu, ''))));
});

test('shared treatment substance matters, while different substances are not conflated', () => {
  const source = patient('source', { medications: [{ substance: 'Ciclosporine', medicationId: 'a' }] });
  const related = patient('related', { medications: [{ substance: 'ciclosporine', medicationId: 'b' }] });
  const unrelated = patient('unrelated', { medications: [{ substance: 'mycophénolate', medicationId: 'c' }] });
  const results = rankExactPathologyMatches(source, PATHOLOGY, [unrelated, related]);
  assert.equal(results[0].patientId, 'related');
  assert.ok(results[0].sharedFactors.some(f => /ciclosporine/i.test(f)));
});

test('missing documentation and matching ages alone do not produce a high clinical similarity', () => {
  const source = patient('source', { age: 23 });
  const other = patient('other', { age: 23 });
  const result = rankExactPathologyMatches(source, PATHOLOGY, [other])[0];
  assert.ok(result.score < 25);
  assert.ok(result.coveragePercent <= 10);
  assert.equal(result.evidenceLevel, 'insufficient');
  assert.equal(result.statisticalCorrelation, false);
});

test('lab findings are comparable only for identical analyte and compatible unit', () => {
  const source = patient('source', { labs: [{ name: 'CRP', unit: 'mg/L', value: 64, measuredAt: '2025-01-02', referenceMax: 5 }] });
  const similar = patient('similar', { labs: [{ name: 'CRP', unit: 'mg/L', value: 80, measuredAt: '2025-01-03', referenceMax: 5 }] });
  const incompatible = patient('incompatible', { labs: [{ name: 'CRP', unit: 'mg/dL', value: 6.4, measuredAt: '2025-01-03', referenceMax: 0.5 }] });
  const noLab = patient('no-lab');
  const results = rankExactPathologyMatches(source, PATHOLOGY, [incompatible, noLab, similar]);
  assert.equal(results[0].patientId, 'similar');
  assert.ok(results[0].sharedFactors.some(f => /CRP/i.test(f)));
  assert.equal(results.find(x => x.patientId === 'incompatible')?.componentScores.laboratory, null);
  assert.equal(results.find(x => x.patientId === 'no-lab')?.componentScores.laboratory, null);
});

test('cannot infer normality or similarity from missing reference ranges or missing lab values', () => {
  const source = patient('source', { labs: [{ name: 'CRP', unit: 'mg/L', value: 12, measuredAt: '2025-01-03' }] });
  const peer = patient('peer', { labs: [{ name: 'CRP', unit: 'mg/L', value: null, measuredAt: '2025-01-03' }] });
  const result = rankExactPathologyMatches(source, PATHOLOGY, [peer])[0];
  assert.equal(result.componentScores.laboratory, null);
  assert.ok(result.sharedFactors.every(f => !/biolog/i.test(f)));
});

test('dated conditions preceding index diagnosis enable a separate chronological comparison', () => {
  const source = patient('source', { diagnoses: [{ pathologyId: PATHOLOGY, diagnosedAt: '2024-01-01' }], history: [{ name: 'Asthme', diagnosisDate: '2018-01-01' }] });
  const peer = patient('peer', { diagnoses: [{ pathologyId: PATHOLOGY, diagnosedAt: '2020-01-01' }], history: [{ name: 'Asthme', diagnosisDate: '2014-01-01' }] });
  const reversed = patient('reversed', { diagnoses: [{ pathologyId: PATHOLOGY, diagnosedAt: '2020-01-01' }], history: [{ name: 'Asthme', diagnosisDate: '2024-01-01' }] });
  const results = rankExactPathologyMatches(source, PATHOLOGY, [reversed, peer]);
  assert.equal(results[0].patientId, 'peer');
  assert.ok((results[0].componentScores.chronology || 0) > 0.95);
  assert.equal(results.find(x => x.patientId === 'reversed')?.componentScores.chronology, null);
});

test('tie scores sort deterministically by code, not by insertion order', () => {
  const source = patient('source');
  const a = patient('a', { patientCode: 'PAT-001' });
  const b = patient('b', { patientCode: 'PAT-002' });
  assert.deepEqual(rankExactPathologyMatches(source, PATHOLOGY, [b, a]).map(x => x.patientId), ['a', 'b']);
});

test('does not expose a ranked result for an unrecorded source pathology', () => {
  const results = rankExactPathologyMatches(patient('source'), OTHER, [patient('peer', { diagnoses: [{ pathologyId: OTHER }] })]);
  assert.deepEqual(results, []);
});

test('invalid reference intervals and contradictory flags are not used as positive biological evidence', () => {
  const source = patient('source', { labs: [{ name: 'CRP', value: 5, unit: 'mg/L', measuredAt: '2025-01-03', referenceMin: 10, referenceMax: 2 }] });
  const peer = patient('peer', { labs: [{ name: 'CRP', value: 5, unit: 'mg/L', measuredAt: '2025-01-04', referenceMin: 10, referenceMax: 2 }] });
  assert.equal(rankExactPathologyMatches(source, PATHOLOGY, [peer])[0].componentScores.laboratory, null);
  const conflict = patient('conflict', { labs: [{ name: 'CRP', value: 2, unit: 'mg/L', measuredAt: '2025-01-03', referenceMax: 5, isAbnormal: true }] });
  assert.equal(rankExactPathologyMatches(conflict, PATHOLOGY, [conflict, peer])[0].componentScores.laboratory, null);
});
