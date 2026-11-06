import assert from 'node:assert/strict';
import test from 'node:test';
import { rankExactPathologyMatches, rankRecordedConditionMatches, type ClinicalPatientProfile } from '../src/lib/patientSimilarity/clinicalSimilarity.ts';
import { compareMeasurements, describeMeasurementState } from '../src/lib/patientSimilarity/measurementComparison.ts';
import { formatNumber, measurementTimestamp } from '../src/lib/patientSimilarity/comparisonFacts.ts';

const PATHOLOGY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
function patient(id: string, changes: Partial<ClinicalPatientProfile> = {}): ClinicalPatientProfile {
  return { id, patientCode: `SYNTHETIC-${id}`, age: null,
    diagnoses: [{ pathologyId: PATHOLOGY, name: 'Maladie documentée', diagnosedAt: '2022-03-01' }],
    history: [], medications: [], labs: [], symptoms: [], ...changes };
}
const lab = (value: number | null, measuredAt = '2025-02-01') => ({ name: 'CRP', value, unit: 'mg/L', measuredAt, referenceMax: 5 });
const match = (source: ClinicalPatientProfile, peer: ClinicalPatientProfile) => rankExactPathologyMatches(source, PATHOLOGY, [peer])[0];

test('laboratory concordance reflects actual numbers, not just two abnormal flags', () => {
  const result = match(patient('source', { labs: [lab(60)] }), patient('peer', { labs: [lab(600)] }));
  assert.ok(Math.abs(result.componentScores.laboratory! - 0.1) < 1e-10);
});

test('one undocumented counterpart does not count as a complete comparison dimension', () => {
  const result = match(patient('source', {
    diagnoses: [{ pathologyId: PATHOLOGY }, { pathologyId: 'other' }],
    history: [{ name: 'Eczéma' }], medications: [{ substance: 'Substance A' }], symptoms: [{ id: 'symptom-a' }],
  }), patient('peer'));
  assert.equal(result.coveragePercent, 0);
  for (const key of ['coDiagnoses', 'medicalHistory', 'medications', 'symptoms'] as const) assert.equal(result.componentScores[key], null);
});

test('a missing newest value never silently falls back to an older valid result', () => {
  const source = patient('source', { labs: [lab(60, '2024-01-01'), lab(null, '2025-02-01')] });
  const result = match(source, patient('peer', { labs: [lab(60)] }));
  assert.equal(result.componentScores.laboratory, null);
  assert.equal(result.details.labs[0].source.selected?.value, null);
  assert.equal(result.details.labs[0].source.records.length, 2);
});

test('side-by-side laboratory evidence preserves dates, numbers, reference intervals and the signed difference', () => {
  const result = match(patient('source', { labs: [lab(60)] }), patient('peer', { labs: [lab(80, '2025-02-03')] }));
  const row = result.details.labs[0];
  assert.equal(row.source.selected?.value, 60);
  assert.equal(row.peer.selected?.value, 80);
  assert.equal(row.source.selected?.referenceMax, 5);
  assert.equal(row.peer.selected?.measuredAt, '2025-02-03');
  assert.equal(row.delta, 20);
  assert.equal(row.relativeDifference, 0.25);
  assert.equal(row.timeGapDays, 2);
  assert.equal(result.componentScores.laboratory, row.numericSimilarity);
});

test('incompatible units remain visible but never contribute a numeric difference or score', () => {
  for (const unit of ['mg/dL', 'g/L', 'MG/L', null]) {
    const row = compareMeasurements([lab(10)], [{ ...lab(10), unit }])[0];
    assert.equal(row.delta, null);
    assert.equal(row.numericSimilarity, null);
    assert.equal(row.peer.selected?.unit, unit);
  }
  assert.equal(compareMeasurements([{ ...lab(10), unit: 'µmol/L' }], [{ ...lab(10), unit: 'μmol/L' }])[0].numericSimilarity, 1);
});

test('zero and very small values are preserved, and numeric closeness never asserts normality', () => {
  const zero = { name: 'Variable', value: 0, unit: '/10', measuredAt: '2025-02-01' };
  assert.equal(compareMeasurements([zero], [zero])[0].numericSimilarity, 1);
  assert.equal(compareMeasurements([zero], [{ ...zero, value: 2 }])[0].numericSimilarity, 0);
  assert.equal(describeMeasurementState(zero), 'Références non renseignées');
  assert.notEqual(formatNumber(0.00000001), '0');
  const overflow = compareMeasurements([{ ...zero, value: -Number.MAX_VALUE }], [{ ...zero, value: Number.MAX_VALUE }])[0];
  assert.equal(overflow.numericSimilarity, null);
  assert.equal(overflow.delta, null);
});

test('different latest measurements on the same date are ambiguous rather than arbitrarily chosen', () => {
  const row = compareMeasurements([lab(60), lab(80)], [lab(60)])[0];
  assert.equal(row.source.selected, null);
  assert.equal(row.numericSimilarity, null);
  assert.match(row.excludedReason!, /différents/);
  assert.equal(row.source.records.length, 2);
  assert.equal(compareMeasurements([lab(60), lab(60)], [lab(60)])[0].numericSimilarity, 1);
});

test('undated and invalid-date results remain visible without inventing a latest date', () => {
  for (const date of ['', '2025-02-30', '2025', '2025-01-01T25:00:00Z']) {
    const row = compareMeasurements([lab(60, date)], [lab(60)])[0];
    assert.equal(row.numericSimilarity, null);
    assert.equal(row.source.undatedCount, 1);
    assert.equal(row.source.selected?.value, 60);
  }
  const row = compareMeasurements([lab(20, ''), lab(60)], [lab(60)])[0];
  assert.equal(row.source.selected?.value, 60);
  assert.equal(row.source.undatedCount, 1);
  assert.equal(measurementTimestamp('2025-02-01T12:00:00+01:00'), Date.parse('2025-02-01T11:00:00Z'));
});

test('conflicting flags and invalid reference metadata are exposed and excluded', () => {
  const malformed = [
    { ...lab(2), referenceMin: 0, isAbnormal: true },
    { ...lab(20), isAbnormal: false },
    { ...lab(2), referenceMin: 10, referenceMax: 5 },
    { ...lab(2), referenceMin: Number.NaN },
  ];
  for (const record of malformed) {
    const row = compareMeasurements([record], [lab(2)])[0];
    assert.equal(row.numericSimilarity, null);
    assert.ok(row.excludedReason);
  }
  assert.equal(describeMeasurementState(lab(2)), 'Borne respectée ; intervalle incomplet');
});

test('latest timestamp is selected independently for each clinical variable', () => {
  const variables = [
    { name: 'Poids', value: 81, unit: 'kg', measuredAt: '2025-02-01T08:00:00Z' },
    { name: 'Poids', value: 80, unit: 'kg', measuredAt: '2025-02-01T16:00:00Z' },
    { name: 'Douleur', value: 0, unit: '/10', measuredAt: '2025-01-01T12:00:00Z' },
  ];
  const result = match(patient('source', { variables }), patient('peer', { variables }));
  assert.equal(result.details.variables.find(r => r.name === 'Poids')?.source.selected?.value, 80);
  assert.equal(result.details.variables.find(r => r.name === 'Douleur')?.source.selected?.value, 0);
  assert.equal(result.coveragePercent, 0, 'context variables do not silently change ranking weights');
});

test('uncoded evidence retains original diagnosis dates and provenance, not temporary scoring anchors', () => {
  const source = patient('source', { diagnoses: [], history: [
    { name: 'Eczéma', conditionType: 'disease', diagnosisDate: '2018-05-02' },
    { name: 'Migraine', conditionType: 'disease', diagnosisDate: '2010-01-01' },
    { name: 'Asthme', conditionType: 'disease', diagnosisDate: '2024-01-01' },
  ] });
  const peer = patient('peer', { diagnoses: [{ pathologyId: PATHOLOGY, name: 'Eczéma', diagnosedAt: '2020-06-03' }], history: [
    { name: 'Migraine', conditionType: 'disease', diagnosisDate: '2012-01-01' },
  ] });
  const before = structuredClone(source);
  const result = rankRecordedConditionMatches(source, 'Eczéma', [peer])[0];
  assert.equal(result.details.sourceIndexDate, '2018-05-02');
  assert.equal(result.details.peerIndexDate, '2020-06-03');
  assert.equal(result.details.indexCondition.source[0].origin, 'Antécédent personnel');
  assert.equal(result.details.indexCondition.peer[0].origin, 'Diagnostic du catalogue');
  assert.equal(result.details.conditions.find(c => c.name === 'Asthme')?.peer.length, 0);
  assert.ok(result.details.conditions.find(c => c.name === 'Asthme')!.source[0].daysFromIndex! > 0);
  assert.ok(!JSON.stringify(result.details).includes('recorded-label:'));
  assert.deepEqual(source, before);
});

test('missing diagnosis dates stay unknown instead of being inferred from age or treatments', () => {
  const result = match(patient('source', { age: 50, diagnoses: [{ pathologyId: PATHOLOGY }], medications: [{ substance: 'A', startDate: '2005-01-01' }] }), patient('peer'));
  assert.equal(result.details.sourceIndexDate, null);
  assert.equal(result.details.indexCondition.source[0].date, null);
  assert.ok(result.details.dataGaps.some(g => g.includes('diagnostic') && g.includes('actuel')));
});

test('all associated diseases remain inspectable beyond the former five-factor summary', () => {
  const history = Array.from({ length: 24 }, (_, i) => ({ name: `Maladie ${i}`, conditionType: 'disease', diagnosisDate: `20${String(i).padStart(2, '0')}-01-01` }));
  const result = match(patient('source', { history }), patient('peer', { history }));
  assert.equal(result.details.conditions.length, 24);
  assert.equal(result.sharedFactors.length, 24);
});

test('same labels never collapse different canonical diagnoses or disease and procedure histories', () => {
  const result = match(patient('source', { diagnoses: [{ pathologyId: PATHOLOGY }, { pathologyId: 'a', name: 'Libellé identique' }], history: [{ name: 'Même texte', conditionType: 'disease' }] }),
    patient('peer', { diagnoses: [{ pathologyId: PATHOLOGY }, { pathologyId: 'b', name: 'Libellé identique' }], history: [{ name: 'Même texte', conditionType: 'surgery' }] }));
  assert.equal(result.details.conditions.length, 4);
  assert.equal(result.componentScores.coDiagnoses, 0);
  assert.equal(result.componentScores.medicalHistory, 0);
});

test('repeated condition dates produce deterministic chronological scores using the earliest recorded diagnosis', () => {
  const history = [{ name: 'Eczéma', diagnosisDate: '2020-01-01' }, { name: 'Eczéma', diagnosisDate: '2010-01-01' }];
  const a = match(patient('source', { history }), patient('peer', { history: [...history].reverse() }));
  assert.equal(a.componentScores.chronology, 1);
  assert.equal(a.details.conditions[0].source.length, 2);
});

test('score explanation reconstructs the displayed result and missing dimensions contribute no points', () => {
  const result = match(patient('source', { age: 50, history: [{ name: 'Eczéma' }], labs: [lab(60)] }),
    patient('peer', { age: 60, history: [{ name: 'Eczéma' }, { name: 'Migraine' }], labs: [lab(80)] }));
  const d = result.scoreDetails;
  assert.equal(d.availableWeight, 45);
  assert.equal(d.coverageMultiplier, 0.75);
  assert.equal(d.weightedSum, d.dimensions.reduce((sum, c) => sum + (c.weightedPoints ?? 0), 0));
  assert.equal(result.score, Math.round(100 * d.weightedSum / d.availableWeight * d.coverageMultiplier));
  assert.deepEqual(d.dimensions.find(c => c.component === 'medicalHistory'), { component: 'medicalHistory', weight: 25, score: 0.5, sourceCount: 1, peerCount: 2, commonCount: 1, weightedPoints: 12.5 });
  assert.equal(d.dimensions.find(c => c.component === 'medications')?.weightedPoints, null);
});

test('treatments and symptoms preserve actual dose, dates, status and severity', () => {
  const medications = [{ medicationId: 'm', substance: 'Substance A', name: 'Nom A', dosage: '5 mg', frequency: '1/j', startDate: '2023-03-04', endDate: null, isActive: false }];
  const symptoms = [{ id: 's', name: 'Symptôme A', onsetDate: '2015-01-01', severity: 'modérée', frequency: 'quotidienne', isResolved: true }];
  const result = match(patient('source', { medications, symptoms }), patient('peer', { medications: [{ ...medications[0], dosage: '10 mg', isActive: true }], symptoms }));
  assert.deepEqual(result.details.treatments[0].source, medications);
  assert.equal(result.details.treatments[0].peer[0].dosage, '10 mg');
  assert.deepEqual(result.details.symptoms[0].source, symptoms);
});

test('research leads distinguish observed facts, open questions and verification without claiming a causal result', () => {
  const history = [{ name: 'Autre maladie', conditionType: 'disease', diagnosisDate: '2010-01-01' }];
  const result = match(patient('source', { history, labs: [lab(60)], medications: [{ substance: 'Substance A' }] }),
    patient('peer', { history, labs: [lab(80)], medications: [{ substance: 'Substance A' }] }));
  assert.equal(result.details.researchLeads.length, 3);
  for (const lead of result.details.researchLeads) {
    assert.ok(lead.observation && lead.question.endsWith('?') && lead.verification);
    assert.ok(!JSON.stringify(lead).includes('SYNTHETIC-'));
  }
  assert.ok(result.details.researchLeads.some(l => l.observation.includes('60 mg/L') && l.observation.includes('80 mg/L')));
  assert.equal(match(patient('source'), patient('peer')).details.researchLeads.length, 1);
});
