import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPairCandidates, normalizeCausalLink, typedElementKey, type MedicalEntityType } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import {
  RELATION_ENGINE_VERSION, contextualRelationExplanation, relationPresentation, validateRelationEvidence,
  type EvidenceSource, type RelationKind,
} from '../supabase/functions/cross-data-analyzer/relation-contract.ts';
import { buildAutomaticPathologyGraph, type GraphEntity, type GraphRelation } from '../src/components/patient/crossGraphGroups.ts';
import { buildAgentPairFormat, readAgentCells } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';

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

const interactionElements = [
  { name: 'Traitement synthétique A comprimé', type: 'medication' as const },
  { name: 'Traitement synthétique B comprimé', type: 'medication' as const },
];
const [interactionPair] = buildPairCandidates(interactionElements);
const nativeSource = { title: 'Notice synthétique, aucune donnée clinique réelle',
  url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=synthetic-effect-test' };

function nativeInteraction(effect: string, evidence: string) {
  const [left, right] = interactionElements;
  return {
    pairHash: interactionPair.pairHash,
    directions: [[left, right], [right, left]].map(([from, to], index) => ({
      fromKey: typedElementKey(from), toKey: typedElementKey(to), verdict: index === 0 ? 'cited_relation' : 'insufficient',
      explanation: index === 0 ? evidence : 'Le sens inverse n’est pas établi dans cette fixture synthétique.',
      limitations: 'Scénario synthétique uniquement ; applicabilité individuelle non établie.', sourceUrls: index === 0 ? [nativeSource.url] : [],
    })),
    links: [{ fromKey: typedElementKey(left), toKey: typedElementKey(right), relationKind: 'interaction',
      evidence, sourceUrls: [nativeSource.url], confidence: 'medium', evidenceSupport: 'direct',
      context: { condition: 'same', route: 'same', population: 'same', temporality: 'after_exposure' },
      contextLimitations: ['Fixture synthétique uniquement.'], dangerLevel: 'unknown', interactionEffect: effect }],
  };
}

test('an explicitly reported complete cancellation keeps its distinct effect and native provenance', () => {
  const cell = nativeInteraction('cancel_effect', 'La notice synthétique rapporte que A annule complètement l’effet thérapeutique de B.');
  const parsed = readAgentCells([cell], [interactionPair], [nativeSource], 1);
  const link = parsed.cells[interactionPair.pairHash][0];
  assert.equal(link.interactionEffect, 'cancel_effect');
  assert.equal(link.relationship, 'Annulation d’effet rapportée');
  assert.deepEqual(link.webSources, [nativeSource.url]);
  assert.equal(link.citationVerification, 'provider_trace', 'A traced URL must not become a verified verbatim excerpt');
  assert.match(JSON.stringify(buildAgentPairFormat([interactionPair])), /"cancel_effect"/);
  cell.links[0].sourceUrls = ['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=untraced-effect'];
  assert.equal(readAgentCells([cell], [interactionPair], [nativeSource], 1).assessments.length, 0,
    'The new effect must not bypass the per-edge native source check');
});

test('partial reduction, potentiation, negation and hypothetical cancellation never become complete cancellation', () => {
  const statements = [
    'La source synthétique rapporte une diminution partielle de l’effet de B par interaction avec A.',
    'La source synthétique rapporte une potentialisation de l’effet de B en présence de A.',
    'L’interaction ne supprime pas complètement l’effet thérapeutique de B dans la source synthétique.',
    'The synthetic oral interaction did not completely abolish the therapeutic effect of B.',
    'La source synthétique évoque une interaction qui pourrait annuler complètement l’effet de B.',
    'The synthetic interaction completely blocked receptor X, partially reducing the therapeutic effect of B.',
  ];
  for (const statement of statements) {
    const parsed = readAgentCells([nativeInteraction('cancel_effect', statement)], [interactionPair], [nativeSource], 1);
    const link = parsed.cells[interactionPair.pairHash][0];
    assert.equal(link.interactionEffect, 'unknown', statement);
    assert.notEqual(link.relationship, 'Annulation d’effet rapportée');
    assert.ok(link.contextLimitations?.some(limit => /annulation complète/i.test(limit)), statement);
  }
  const overclaimed = nativeInteraction('cancel_effect', statements[0]);
  overclaimed.directions[0].explanation = 'A annule complètement l’effet thérapeutique de B.';
  const uncertain = readAgentCells([overclaimed], [interactionPair], [nativeSource], 1).assessments[0];
  assert.doesNotMatch(uncertain.explanation, /A annule complètement/,
    'A rejected cancellation must not survive in the directional narrative');
  assert.equal(uncertain.directions?.[0].verdict, 'hypothesis');
  assert.match(uncertain.limitations, /annulation complète/i);
  const incoherent = nativeInteraction('cancel_effect', 'A annule complètement l’effet thérapeutique de B.');
  incoherent.links[0].relationKind = 'coadministration';
  const downgraded = readAgentCells([incoherent], [interactionPair], [nativeSource], 1).cells[interactionPair.pairHash][0];
  assert.equal(downgraded.interactionEffect, 'unknown');
  assert.doesNotMatch(downgraded.evidence, /A annule complètement/,
    'The displayed evidence and final-review input must not retain an incompatible cancellation claim');
  for (const effect of ['increase_effect', 'decrease_effect']) {
    const statement = effect === 'increase_effect' ? 'Une potentialisation est rapportée, sans facteur multiplicatif dans la source synthétique.'
      : 'Une diminution de l’effet est rapportée, sans annulation complète démontrée.';
    const link = readAgentCells([nativeInteraction(effect, statement)], [interactionPair], [nativeSource], 1).cells[interactionPair.pairHash][0];
    assert.equal(link.interactionEffect, effect);
    assert.equal(link.evidence, statement);
    assert.doesNotMatch(link.relationship, /annulation|(?:x|×)\s*10/i);
  }
});

test('legacy cancellation classification requires an explicit complete effect in the retrieved excerpt', () => {
  for (const [passage, expected] of [
    ['The oral synthetic drug interaction completely abolished the therapeutic effect of treatment B.', 'cancel_effect'],
    ['The oral synthetic drug interaction reduced the therapeutic effect of treatment B by a moderate amount.', 'unknown'],
    ['The oral synthetic drug interaction did not completely abolish the therapeutic effect of treatment B.', 'unknown'],
  ]) {
    const [from, to] = interactionElements;
    const raw = { from: from.name, fromType: from.type, to: to.name, toType: to.type,
      relationKind: 'interaction', interactionEffect: 'cancel_effect', relationship: 'Annulation d’effet rapportée',
      evidence: 'A annule complètement l’effet thérapeutique de B.',
      context: { condition: 'same', route: 'same', population: 'same', temporality: 'after_exposure' },
      evidenceQuotes: [{ url: sourceUrl, quote: passage, support: 'direct' }] };
    const source: EvidenceSource = { url: sourceUrl, title: 'Synthetic interaction fixture', abstract: passage };
    const link = validateRelationEvidence(raw, normalizeCausalLink(raw, interactionElements)!, interactionPair, [source])!;
    assert.equal(link.interactionEffect, expected, passage);
    assert.equal(link.relationship === 'Annulation d’effet rapportée', expected === 'cancel_effect');
    if (expected === 'unknown') {
      assert.doesNotMatch(link.evidence, /A annule complètement/);
      assert.ok(link.contextLimitations?.some(limit => /annulation complète/i.test(limit)));
    }
  }
});

test('a full eight-link cell keeps every sourced mechanism and explicitly reports the coverage limit', () => {
  const cell = nativeInteraction('increase_effect', 'La source synthétique décrit un mécanisme de potentialisation.');
  cell.links = Array.from({ length: 8 }, (_, index) => ({ ...cell.links[0], evidence: `Mécanisme synthétique distinct ${index + 1} avec source tracée.` }));
  const parsed = readAgentCells([cell], [interactionPair], [nativeSource], 1);
  assert.equal(parsed.cells[interactionPair.pairHash].length, 8, 'The bounded result must retain all eight cited mechanisms');
  assert.match(parsed.assessments[0].limitations, /8 liens/);
  assert.match(parsed.assessments[0].limitations, /exhaustiv/i);
  assert.ok(parsed.assessments[0].directions?.every(direction => /8 liens/.test(direction.limitations)));
  assert.ok(parsed.warnings.some(warning => warning.includes(interactionElements[0].name) && /8 liens/.test(warning)));
  cell.links.pop();
  const belowLimit = readAgentCells([cell], [interactionPair], [nativeSource], 1);
  assert.equal(belowLimit.cells[interactionPair.pairHash].length, 7);
  assert.doesNotMatch(belowLimit.assessments[0].limitations, /8 liens/);
  assert.deepEqual(belowLimit.warnings, []);
});
