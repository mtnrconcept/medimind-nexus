import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildNavigation } from '../src/components/layout/navigation.ts';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const page = () => readFileSync(new URL('../src/pages/MicroSignalsLab.tsx', import.meta.url), 'utf8');

test('synthetic cohort route requires resolved server admin role', () => {
  assert.match(app, /path="\/research\/microsignals"\s+element=\{<ProtectedRoute requiredRole="admin">/);
  assert.ok(buildNavigation('admin').flatMap(g => g.items.map(i => i.path)).includes('/research/microsignals'));
  assert.ok(!buildNavigation('doctor').flatMap(g => g.items.map(i => i.path)).includes('/research/microsignals'));
});

test('synthetic lab does not fetch real patient data or transmit synthetic observations', () => {
  const content=page();
  assert.match(content,/SIMULATION|SIMULÉ|SYNTHÉTIQUE/);
  assert.match(content,/donnée.*réelle|dossiers réels/i);
  assert.match(content,/applySyntheticLabEvent/);
  assert.doesNotMatch(content,/supabase\.from\(|supabase\.functions\.invoke|patient_lab_results/);
});
