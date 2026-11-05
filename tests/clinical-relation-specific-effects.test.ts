import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPairCandidates, normalizeCausalLink, type MedicalEntityType } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import {
  RELATION_ENGINE_VERSION, contextualRelationExplanation, relationPresentation, validateRelationEvidence,
  type EvidenceSource, type RelationKind,
} from '../supabase/functions/cross-data-analyzer/relation-contract.ts';
import { buildAutomaticPathologyGraph, type GraphEntity, type GraphRelation } from '../src/components/patient/crossGraphGroups.ts';

const sourceUrl = 'https://pubmed.ncbi.nlm.nih.gov/12345678/';

test('a contextual native interaction remains an uncertain risk, not mere coadministration', () => {
  const context = { validationVersion: RELATION_ENGINE_VERSION, evidenceSupport: 'contextual' as const,
    citationVerification: 'provider_trace' as const };
  const interaction = relationPresentation({ ...context, relationKind: 'interaction' });
  assert.equal(interaction.label, 'Interaction possible');
  assert.equal(interaction.tone, 'caution');
  assert.equal(relationPresentation({ ...context, relationKind: 'adverse_effect' }).label, 'Effet indésirable possible');
  assert.equal(relationPresentation({ ...context, relationKind: 'coadministration' }).tone, 'neutral');
  assert.equal(relationPresentation({ ...context, citationVerification: 'verbatim', relationKind: 'interaction' }).label,
    'Co-utilisation rapportée', 'Legacy excerpt presentation keeps its existing semantics');
});
const examples = [
  { kind: 'symptom_relief', target: 'symptom', passage: 'Oral synthetic treatment relieved the selected symptom after exposure in this controlled study.',
    directLabel: 'Soulagement symptomatique rapporté', contextualLabel: 'Soulagement symptomatique possible', tone: 'neutral' },
  { kind: 'contraindication', target: 'pathology', passage: 'The oral synthetic treatment is contraindicated in participants with the selected disease.',
    directLabel: 'Contre-indication rapportée', contextualLabel: 'Prudence à évaluer', tone: 'caution' },
  { kind: 'disease_worsening', target: 'pathology', passage: 'The oral synthetic treatment caused worsening of the selected disease after exposure.',
    directLabel: 'Aggravation rapportée', contextualLabel: 'Aggravation possible', tone: 'caution' },
] as const;

function validate(kind: typeof examples[number]['kind'], options: {
  fromType?: MedicalEntityType; toType?: MedicalEntityType; reverse?: boolean;
  passage?: string; publicationTypes?: string[]; context?: Record<string, string>;
} = {}) {
  const example = examples.find(example => example.kind === kind)!;
  const from = { name: 'Traitement synthétique comprimé', type: options.fromType ?? 'medication' as const };
  const to = { name: 'Élément clinique synthétique', type: options.toType ?? example.target };
  const elements = [from, to];
  const pair = buildPairCandidates(elements)[0];
  const [origin, target] = options.reverse ? [to, from] : elements;
  const passage = options.passage ?? example.passage;
  const source: EvidenceSource = { url: sourceUrl, title: 'Synthetic contract fixture', abstract: passage,
    publicationTypes: options.publicationTypes ?? ['Randomized Controlled Trial'] };
  const raw = {
    from: origin.name, fromType: origin.type, to: target.name, toType: target.type,
    relationKind: kind, relationship: 'Relation proposée', evidence: 'Interprétation à vérifier.',
    context: { condition: 'same', route: 'same', temporality: 'after_exposure', ...options.context },
    evidenceQuotes: [{ url: sourceUrl, quote: passage, support: 'direct' }],
    isAppropriate: true, effectType: 'therapeutic', dangerLevel: 'high',
  };
  const normalized = normalizeCausalLink(raw, elements)!;
  return validateRelationEvidence(raw, normalized, pair, [source]);
}

test('symptom relief, formal contraindication and disease worsening retain distinct evidence-sensitive labels', () => {
  for (const example of examples) {
    const direct = relationPresentation({ relationKind: example.kind, validationVersion: RELATION_ENGINE_VERSION, evidenceSupport: 'direct' });
    const contextual = relationPresentation({ relationKind: example.kind, validationVersion: RELATION_ENGINE_VERSION, evidenceSupport: 'contextual' });
    assert.equal(direct.label, example.directLabel);
    assert.equal(contextual.label, example.contextualLabel);
    assert.equal(direct.tone, example.tone);
    assert.equal(contextual.tone, example.tone);
    assert.ok(contextualRelationExplanation(example.kind).length > 70);
    assert.equal(relationPresentation({ relationKind: example.kind }).label, 'À réexaminer');
  }
});

test('legacy verified excerpts accept the new relations for either a medicine or a treatment without asserting suitability', () => {
  for (const example of examples) {
    for (const fromType of ['medication', 'treatment'] as const) {
      const link = validate(example.kind, { fromType });
      assert.ok(link);
      assert.equal(link.relationKind, example.kind);
      assert.equal(link.evidenceSupport, 'direct');
      assert.equal(link.relationship, example.directLabel);
      assert.equal(link.isAppropriate, undefined);
      assert.equal(link.effectType, undefined);
      assert.equal(link.dangerLevel, undefined);
    }
  }
});

test('the new kinds reject reverse directions and incompatible typed pairs', () => {
  for (const example of examples) {
    assert.equal(validate(example.kind, { reverse: true }), null);
    assert.equal(validate(example.kind, { fromType: 'pathology' }), null);
    for (const toType of ['medication', 'treatment', example.target === 'symptom' ? 'pathology' : 'symptom'] as const) {
      assert.equal(validate(example.kind, { toType }), null);
    }
  }
});

test('case reports and mismatched routes keep the new causal interpretations contextual', () => {
  for (const example of examples) {
    for (const options of [{ publicationTypes: ['Case Reports'] }, { context: { route: 'different' } }]) {
      const link = validate(example.kind, options)!;
      assert.equal(link.evidenceSupport, 'contextual');
      assert.equal(link.relationship, example.contextualLabel);
      assert.equal(link.evidence, contextualRelationExplanation(example.kind));
    }
  }
});

test('symptom relief and worsening require exposure chronology, while a formal contraindication is not a temporal claim', () => {
  for (const kind of ['symptom_relief', 'disease_worsening'] as const) {
    assert.equal(validate(kind, { context: { temporality: 'not_reported' } })?.evidenceSupport, 'contextual');
  }
  assert.equal(validate('contraindication', { context: { temporality: 'not_reported' } })?.evidenceSupport, 'direct');
});

test('co-occurrence and ordinary precautions cannot establish the three specific effects', () => {
  const passage = 'The oral synthetic treatment and the selected clinical condition were described together; caution was advised.';
  for (const example of examples) {
    const link = validate(example.kind, { passage })!;
    assert.equal(link.evidenceSupport, 'contextual');
    assert.equal(link.relationship, example.contextualLabel);
  }
  assert.equal(validate('contraindication', {
    passage: 'The oral synthetic treatment is not contraindicated for the selected condition, but monitoring is advised.',
  })?.evidenceSupport, 'contextual');
});

test('relieving a disease-associated symptom or carrying a hazard never invents a treatment membership', () => {
  const entities: GraphEntity[] = [
    { id: 'medicine', name: 'Traitement synthétique comprimé', type: 'medication' },
    { id: 'disease-a', name: 'Maladie synthétique A', type: 'pathology' },
    { id: 'disease-b', name: 'Maladie synthétique B', type: 'pathology' },
    { id: 'symptom', name: 'Symptôme synthétique', type: 'symptom' },
  ];
  const link = (from: number, to: number, relationKind: RelationKind): GraphRelation => ({
    from: entities[from].name, fromType: entities[from].type, to: entities[to].name, toType: entities[to].type,
    relationKind, evidenceSupport: 'direct', validationVersion: RELATION_ENGINE_VERSION,
  });
  const links = [link(2, 3, 'manifestation'), link(0, 3, 'symptom_relief'),
    link(0, 2, 'contraindication'), link(0, 2, 'disease_worsening')];
  const unassigned = buildAutomaticPathologyGraph(entities, links).instances.filter(instance => instance.entityId === 'medicine');
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].groupId, undefined);
  assert.deepEqual(unassigned[0].membershipKinds, []);
  const graph = buildAutomaticPathologyGraph(entities, [...links, link(0, 1, 'indication')]);
  const medicine = graph.instances.filter(instance => instance.entityId === 'medicine');
  assert.equal(medicine.length, 1);
  assert.equal(medicine[0].groupId, graph.groups.find(group => group.pathologyName === entities[1].name)!.id);
  assert.deepEqual(medicine[0].membershipKinds, ['indication']);
});
