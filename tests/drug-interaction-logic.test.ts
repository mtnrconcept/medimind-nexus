import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateInteractionEvidence,
  buildInteractionSummary,
  type InteractionEvidenceInput,
  type SourceStatus,
} from '../supabase/functions/drug-interaction-checker/logic.ts';

test('keeps corroborating evidence for the same drug pair', () => {
  const evidence: InteractionEvidenceInput[] = [
    {
      drugA: 'Warfarin',
      drugB: 'Ibuprofen',
      source: 'drugbank',
      sourceKind: 'curated',
      severity: 'major',
      description: 'Increased bleeding risk.',
      clinicalAction: 'Review combination.',
    },
    {
      drugA: 'Ibuprofen',
      drugB: 'Warfarin',
      source: 'openfda-label',
      sourceKind: 'official_label',
      severity: 'moderate',
      description: 'Label warns about anticoagulants.',
      clinicalAction: 'Consult the official label.',
    },
  ];

  const interactions = aggregateInteractionEvidence(evidence);

  assert.equal(interactions.length, 1);
  assert.equal(interactions[0].evidence.length, 2);
  assert.equal(interactions[0].severity, 'major');
});

test('pharmacovigilance alone cannot establish a major interaction', () => {
  const interactions = aggregateInteractionEvidence([
    {
      drugA: 'Drug A',
      drugB: 'Drug B',
      source: 'openfda-faers',
      sourceKind: 'pharmacovigilance',
      severity: 'major',
      description: 'Co-reported adverse events.',
      clinicalAction: 'Treat as a signal only.',
    },
  ]);

  assert.equal(interactions.length, 1);
  assert.equal(interactions[0].severity, 'unknown');
});

test('does not claim absence of risk when an authoritative source is unavailable', () => {
  const statuses: SourceStatus[] = [
    { source: 'internal-database', authoritative: true, status: 'available' },
    { source: 'drugbank', authoritative: true, status: 'unavailable', detail: 'timeout' },
    { source: 'openfda-label', authoritative: true, status: 'available' },
  ];

  const summary = buildInteractionSummary([], statuses);

  assert.equal(summary.verificationComplete, false);
  assert.match(summary.message, /incompl/i);
  assert.doesNotMatch(summary.message, /aucune interaction majeure détectée/i);
});

test('may report no documented interaction only when authoritative sources completed', () => {
  const statuses: SourceStatus[] = [
    { source: 'internal-database', authoritative: true, status: 'available' },
    { source: 'openfda-label', authoritative: true, status: 'available' },
    { source: 'openfda-faers', authoritative: false, status: 'partial' },
  ];

  const summary = buildInteractionSummary([], statuses);

  assert.equal(summary.verificationComplete, true);
  assert.match(summary.message, /aucune interaction documentée/i);
});
