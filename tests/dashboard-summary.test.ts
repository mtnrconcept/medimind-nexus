import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayCount, displayPatientName, getGreeting } from '../src/lib/dashboardSummary.ts';

test('dashboard metrics never invent counts when the query is unavailable', () => {
  assert.equal(displayCount(null), '—');
  assert.equal(displayCount(undefined), '—');
  assert.equal(displayCount(-1), '—');
  assert.equal(displayCount(NaN), '—');
  assert.equal(displayCount(0), '0');
  assert.equal(displayCount(1000).replace(/\s/g, ''), '1000');
});

test('name formatting tolerates missing names without leaking a raw UUID', () => {
  assert.equal(displayPatientName({ first_name: 'Eva', last_name: 'Martin', patient_id: 'P-18' }), 'Eva Martin');
  assert.equal(displayPatientName({ first_name: null, last_name: '', patient_id: 'P-18' }), 'Patient P-18');
  assert.equal(displayPatientName({ first_name: null, last_name: null, patient_id: '' }), 'Patient');
});

test('greetings adapt to the hour', () => {
  assert.equal(getGreeting(9), 'Bonjour');
  assert.equal(getGreeting(15), 'Bon après-midi');
  assert.equal(getGreeting(20), 'Bonsoir');
});
