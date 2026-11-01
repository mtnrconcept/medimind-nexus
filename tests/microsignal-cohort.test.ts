import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import fixture from '../fixtures/clinical/microsignals-cohort-50.json' with { type: 'json' };
import { generateSyntheticCohort, syntheticStreamEvents } from '../src/lib/microSignals/synthetic.ts';

const cohort = fixture as ReturnType<typeof generateSyntheticCohort>;

test('fifty individually identified, rich synthetic patient records are reproducible', () => {
  assert.equal(cohort.length, 50);
  assert.deepEqual(cohort, generateSyntheticCohort());
  assert.equal(new Set(cohort.map(p => p.id)).size, 50);
  for (const p of cohort) {
    assert.match(p.id, /^SIM-P\d{3}$/);
    assert.equal(p.dataOrigin, 'synthetic');
    assert.equal(p.studyId, 'SIM-CLOZAPINE-MYOCARDITIS-2026');
    assert.equal(p.provenance.realPatientData, false);
    assert.ok(p.demographics.dateOfBirth && p.demographics.nationality);
    assert.ok(p.demographics.heightCm > 100 && p.demographics.weightKg > 35);
    assert.ok(p.socioEconomic && p.lifestyle && p.familyHistory.length > 0);
    assert.ok(p.allergies.length && p.vaccinations.length);
    assert.ok(p.medications.length >= 2 && p.diagnoses.length >= 1);
    assert.ok(p.labs.length >= 12 && p.vitals.length >= 3);
    assert.ok(p.encounters.length >= 2 && p.ecgs.length >= 1);
    assert.ok(p.timeline.length >= 8);
    assert.ok(p.labs.every(l => Number.isFinite(l.value) && l.source === 'simulated_lab'));
    assert.ok(p.diagnoses.every(d => Number.isFinite(Date.parse(d.diagnosedAt))));
    assert.ok(p.medications.every(m => Date.parse(m.startedAt) <= Date.parse(m.endedAt || '2999-01-01')));
    assert.equal(p.provenance.references.includes('PMID:21524186'), true);
  }
});

test('cohort contains similar exposures and independently modelled outcomes plus controls', () => {
  const exposed = cohort.filter(p => p.medications.some(m => m.code === 'ATC:N05AH02'));
  const comparator = cohort.filter(p => !p.medications.some(m => m.code === 'ATC:N05AH02'));
  assert.ok(exposed.length >= 20);
  assert.ok(comparator.length >= 20);
  assert.ok(exposed.filter(p => p.diagnoses.some(d => d.code === 'ICD10:I40.9' && d.status === 'confirmed')).length >= 3);
  assert.ok(comparator.some(p => p.diagnoses.some(d => d.code === 'ICD10:I40.9')));
  assert.ok(cohort.some(p => p.diagnoses.some(d => d.code === 'ICD10:J06.9')));
  assert.ok(cohort.some(p => p.labs.some(l => l.code === 'LOINC:1988-5' && l.value >= 50)));
});

test('synthetic incoming event stream is isolated, chronological and not part of the baseline', () => {
  const events = syntheticStreamEvents();
  assert.ok(events.length >= 4);
  assert.ok(events.every(e => cohort.some(p => p.id === e.patientId)));
  assert.equal(new Set(events.map(e => e.observation.id)).size, events.length);
  assert.ok(events.every(e => !cohort.find(p => p.id === e.patientId)!.labs.some(l => l.id === e.observation.id)));
  assert.equal(cohort.some(p => p.id.includes('rbarman')), false);
});

test('every synthetic dossier is also a separate independently auditable JSON file', () => {
  const dir = new URL('../fixtures/clinical/patients/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  assert.equal(files.length, 50);
  for (const p of cohort) {
    const filename = `${p.id}.json`;
    assert.ok(files.includes(filename));
    assert.deepEqual(JSON.parse(readFileSync(new URL(filename, dir), 'utf8')), p);
  }
});

test('age at treatment initiation agrees with birth date and index event chronology', () => {
  for (const patient of cohort) {
    const indexMedication=patient.medications.find(m=>m.code === 'ATC:N05AH02' || m.code === 'ATC:N05AH03')!;
    const start=indexMedication.startedAt;
    const dob=patient.demographics.dateOfBirth;
    let age=Number(start.slice(0,4))-Number(dob.slice(0,4));
    if(start.slice(5)<dob.slice(5))age--;
    assert.equal(patient.demographics.ageAtIndex,age,patient.id);
    assert.ok(patient.timeline.every((e,i)=>i===0||e.date>=patient.timeline[i-1].date));
  }
});
