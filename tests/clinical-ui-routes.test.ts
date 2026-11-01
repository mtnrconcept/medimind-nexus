import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('data import is protected as an administrative action at the route boundary', () => {
  const routes = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(routes, /path="\/populate-data"\s+element=\{<ProtectedRoute\s+requiredRole="admin"/);
});

test('the new workspace does not use fabricated clinical status and counts', () => {
  const layout = readFileSync(new URL('../src/components/layout/AppLayout.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /Status: Optimal|Health Index: 98%|AES-256/);
  assert.doesNotMatch(dashboard, /criticalAlerts:\s*12|aiAnalyses:\s*847|activeMonitoring:\s*34/);
});

test('patient page does not simulate decryption or hide missing access behind an endless spinner', () => {
  const source = readFileSync(new URL('../src/pages/PatientDetail.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setDecrypting|Déchiffrement des données patient/);
  assert.match(source, /Dossier introuvable ou accès non autorisé/);
});

test('switching patient dossiers clears any previous AI synthesis before loading new data', () => {
  const source = readFileSync(new URL('../src/pages/PatientDetail.tsx', import.meta.url), 'utf8');
  assert.match(source, /const fetchPatient = async \(\) => \{\s*setLoading\(true\);\s*setLoadError\(null\);\s*setPatient\(null\);\s*setAiSynthesis\(null\);/);
});
