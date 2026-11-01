import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, generateSyntheticCohort, syntheticStreamEvents } from '../src/lib/microSignals/synthetic.ts';
import { applySyntheticLabEvent, buildCohortAnalysis, detectPatientSignals, findClinicalTwins } from '../src/lib/microSignals/engine.ts';

const people = generateSyntheticCohort();

test('a confirmed case can show an early troponin/CRP warning within 42 days', () => {
  const p = people.find(p => p.id === 'SIM-P003')!;
  const alerts = detectPatientSignals(p);
  assert.ok(alerts.some(a => a.level === 'urgent_review'));
  assert.ok(alerts.some(a => a.evidence.some(e => e.startsWith('lab:'))));
  assert.ok(alerts.every(a => a.humanReviewRequired && a.isDiagnosis === false));
  assert.ok(alerts.every(a => a.references.includes('PMID:21524186')));
});

test('isolated tachycardia or CRP from intercurrent infection never establishes myocarditis', () => {
  const p = people.find(p => p.id === 'SIM-P009')!;
  const alerts = detectPatientSignals(p);
  assert.equal(alerts.some(a => a.level === 'urgent_review'), false);
  assert.ok(alerts.every(a => a.isDiagnosis === false));
});

test('missing or incompatible troponin units cannot imply a normal biomarker result', () => {
  const p = structuredClone(people[2]);
  p.labs = p.labs.filter(l => l.code !== 'LOINC:89579-7');
  const alerts = detectPatientSignals(p);
  assert.ok(alerts.some(a => a.missing.includes('troponin')));
  assert.ok(alerts.some(a => a.level === 'urgent_review' && a.missing.includes('troponin')));
  const invalid = structuredClone(people[2]);
  invalid.labs = invalid.labs.map(l => l.code === 'LOINC:89579-7' ? { ...l, unit: 'mg/dL' } : l);
  assert.ok(detectPatientSignals(invalid).some(a => a.missing.includes('troponin')));
});

test('labs and diagnosis preceding treatment cannot trigger post-exposure inference', () => {
  const p = structuredClone(people[2]);
  const index = p.medications.find(m => m.code === 'ATC:N05AH02')!.startedAt;
  p.labs = p.labs.map(l => ({ ...l, observedAt: '2020-01-02' }));
  p.diagnoses = p.diagnoses.map(d => d.code === 'ICD10:I40.9' ? { ...d, diagnosedAt: '2020-01-02' } : d);
  assert.ok(index > '2020-01-02');
  assert.equal(detectPatientSignals(p).some(a => a.level === 'urgent_review'), false);
  const result = buildCohortAnalysis([p, ...people.filter(x => x.id !== p.id)]);
  assert.equal(result.confirmedExposedCases, 4);
});

test('cohort engine separates exposed and comparators without pretending to estimate incidence', () => {
  const r = buildCohortAnalysis(people);
  assert.equal(r.synthetic, true);
  assert.equal(r.cohortSize, 50);
  assert.equal(r.exposed, 26);
  assert.equal(r.comparators, 24);
  assert.equal(r.confirmedExposedCases, 5);
  assert.equal(r.confirmedComparatorCases, 1);
  assert.equal(r.earlyWarningsBeforeDiagnosis, 5);
  assert.ok(r.medianSimulatedLeadDays !== null && r.medianSimulatedLeadDays >= 8);
  assert.ok(r.warningsWithoutConfirmedOutcome >= 1);
  assert.match(r.caveat, /artifici|incidence|non representatif/i);
  assert.ok(r.clusters.some(c => c.sharedMedicationCodes.includes('ATC:N05AH02') && c.patientCount >= 3));
  assert.ok(r.alerts.length > 0);
  assert.ok(r.alerts.every(a => a.humanReviewRequired && !a.isDiagnosis));
  assert.ok(r.sources.includes('PMID:35048875'));
});

test('clinical twins share clinical exposure/indication but not merely identity or country', () => {
  const sim = people[2];
  const twins = findClinicalTwins(people, sim.id);
  assert.ok(twins.length >= 2);
  assert.ok(twins.every(t => t.id !== sim.id && t.sharedFeatures.length >= 2));
  assert.ok(twins.every(t => t.sharedFeatures.some(f => f.includes('clozapine'))));
});

test('new simulated observations trigger deterministic recomputation and duplicate protection', () => {
  const incoming = syntheticStreamEvents()[0];
  const before = buildCohortAnalysis(people);
  const updated = applySyntheticLabEvent(people, incoming);
  assert.equal(updated.length, 50);
  assert.equal(updated.find(p => p.id === incoming.patientId)!.labs.length, people.find(p => p.id === incoming.patientId)!.labs.length + 1);
  assert.deepEqual(applySyntheticLabEvent(updated, incoming), updated);
  const after = buildCohortAnalysis(updated);
  assert.equal(after.cohortSize, before.cohortSize);
  assert.notDeepEqual(after.patientAlerts.filter(a=>a.patientId===incoming.patientId), before.patientAlerts.filter(a=>a.patientId===incoming.patientId));
  assert.equal(people.find(p=>p.id===incoming.patientId)!.labs.some(l=>l.id===incoming.observation.id), false);
});

test('untrusted stream events are rejected rather than corrupting records', () => {
  const e = syntheticStreamEvents()[0];
  assert.throws(() => applySyntheticLabEvent(people, {...e, patientId:'REAL-0001'}));
  assert.throws(() => applySyntheticLabEvent(people, {...e, observation: {...e.observation, unit:'wrong'}}));
  assert.throws(() => applySyntheticLabEvent(people, {...e, observation: {...e.observation, value:Number.NaN}}));
});

test('a sub-threshold rising CRP with new persistent tachycardia is flagged as non-specific micro signal', () => {
  const p = structuredClone(people[0]);
  const start = p.medications.find(m => m.code === 'ATC:N05AH02')!.startedAt;
  const j7 = p.labs.find(l => l.code === 'LOINC:1988-5' && l.observedAt === addDays(start, 7))!;
  const j14 = p.labs.find(l => l.code === 'LOINC:1988-5' && l.observedAt === addDays(start, 14))!;
  j7.value = 17;
  j14.value = 39;
  p.vitals.filter(v => [addDays(start, 7), addDays(start, 14)].includes(v.date))
    .forEach(v => { v.heartRateBpm = 116; });
  const alerts = detectPatientSignals(p);
  assert.ok(alerts.some(a => a.code === 'early_inflammatory_trend' && a.level === 'watch'));
  assert.equal(alerts.some(a => a.level === 'urgent_review'), false);
});

test('fabricated identity in a real-looking record is rejected from the synthetic engine', () => {
  const p = structuredClone(people[0]);
  p.id = 'REAL-PATIENT-ID';
  assert.throws(() => buildCohortAnalysis([p]));
});

test('myocarditis occurring outside the 42-day observation window is not a cohort case', () => {
  const p = structuredClone(people[2]);
  const start = p.medications.find(m => m.code === 'ATC:N05AH02')!.startedAt;
  p.diagnoses = p.diagnoses.map(d => d.code === 'ICD10:I40.9' ? {...d, diagnosedAt: addDays(start, 270)} : d);
  const analysis=buildCohortAnalysis([p,...people.filter(c=>c.id!==p.id)]);
  assert.equal(analysis.confirmedExposedCases,4);
});
