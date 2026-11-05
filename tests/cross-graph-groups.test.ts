import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELATION_ENGINE_VERSION } from '../supabase/functions/cross-data-analyzer/relation-contract.ts';
import {
  buildAutomaticPathologyGraph,
  canonicalGraphKey,
  collectCanonicalGraphEntities,
  graphSelectionIds,
  projectClinicalGraphLinks,
  reconcileGraphSelectionRequest,
  restoreSnapshotGraphEntities,
  snapshotSelectionIds,
  type GraphEntity,
  type GraphRelation,
} from '../src/components/patient/crossGraphGroups.ts';

const entities: GraphEntity[] = [
  { id: 'd1', type: 'pathology', name: 'Maladie A' },
  { id: 'd2', type: 'pathology', name: 'Maladie B' },
  { id: 'm1', type: 'medication', name: 'Médicament partagé' },
  { id: 'm2', type: 'medication', name: 'Autre médicament' },
  { id: 's1', type: 'symptom', name: 'Symptôme observé' },
];

test('restoring a snapshot retains external identities and does not replace frozen labels with renamed catalogue rows', () => {
  const selection = { pathologyIds: ['d1'], medicationIds: ['m1'], externalTreatments: [{ id: 'external-t1', name: 'Traitement externe' }] };
  assert.deepEqual(snapshotSelectionIds(selection), { pathologyIds: ['d1'], symptomIds: [], medicationIds: ['m1'], treatmentIds: ['external-t1'] });
  const snapshot = { jobId: 'saved-job', selection, elements: [
    { type: 'pathology' as const, name: 'Maladie A' }, { type: 'medication' as const, name: 'Médicament partagé' },
    { type: 'treatment' as const, name: 'Traitement externe' },
  ] };
  const restored = restoreSnapshotGraphEntities(snapshot, [entities[0], { ...entities[2], name: 'Présentation renommée' }]);
  assert.equal(restored.find(entity => entity.type === 'pathology')!.id, 'd1');
  assert.equal(restored.find(entity => entity.type === 'treatment')!.id, 'external-t1');
  const medication = restored.find(entity => entity.type === 'medication')!;
  assert.equal(medication.name, 'Médicament partagé');
  assert.match(medication.id, /^snapshot-/);
  assert.ok(medication.id.length < 100);
  assert.deepEqual(restoreSnapshotGraphEntities(snapshot, [entities[0], { ...entities[2], name: 'Présentation renommée' }]), restored);
});

test('reanalysis converts unresolved snapshot IDs to explicit external concepts while preserving known DB selections', () => {
  const selection = { pathologyIds: ['d1'], medicationIds: ['gone-medication'], treatmentIds: ['external-t1'], symptomIds: [],
    externalPathologies: [], externalSymptoms: [], externalMedications: [], externalTreatments: [] };
  const request = reconcileGraphSelectionRequest(selection, [entities[0],
    { id: 'gone-medication', name: 'Médicament original', type: 'medication' },
    { id: 'external-t1', name: 'Traitement externe', type: 'treatment' },
  ], entities);
  assert.deepEqual(request.pathologyIds, ['d1']);
  assert.deepEqual(request.medicationIds, []);
  assert.deepEqual(request.treatmentIds, []);
  assert.deepEqual(request.externalMedications, [{ id: 'gone-medication', name: 'Médicament original' }]);
  assert.deepEqual(request.externalTreatments, [{ id: 'external-t1', name: 'Traitement externe' }]);
  assert.deepEqual(selection.medicationIds, ['gone-medication'], 'the persisted request must never be mutated');
});

function relation(from: number, to: number, kind: GraphRelation['relationKind'], extra: Partial<GraphRelation> = {}): GraphRelation {
  return {
    from: entities[from].name, fromType: entities[from].type,
    to: entities[to].name, toType: entities[to].type,
    relationKind: kind, validationVersion: RELATION_ENGINE_VERSION,
    evidenceSupport: 'direct', ...extra,
  };
}

function asNodes(plan: ReturnType<typeof buildAutomaticPathologyGraph>) {
  return plan.instances.map(instance => ({
    id: instance.id, parentId: instance.groupId,
    data: { label: instance.name, type: instance.type, entityId: instance.entityId, canonicalId: instance.canonicalId },
  }));
}

test('one medicine studied for two pathologies is represented in both groups with one clinical identity', () => {
  const plan = buildAutomaticPathologyGraph(entities, [relation(2, 0, 'indication'), relation(2, 1, 'indication')]);
  const copies = plan.instances.filter(instance => instance.entityId === 'm1');
  assert.equal(plan.groups.length, 2);
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0].id, copies[1].id);
  assert.notEqual(copies[0].groupId, copies[1].groupId);
  assert.equal(copies[0].canonicalId, copies[1].canonicalId);
  assert.ok(copies.every(copy => copy.sharedGroupCount === 2));
  assert.deepEqual(graphSelectionIds(asNodes(plan)).medicationIds, ['m2', 'm1']);
  assert.equal(collectCanonicalGraphEntities(asNodes(plan)).length, entities.length);
});

test('shared medicine-to-pathology edges use the copy in the corresponding group', () => {
  const links = [relation(2, 0, 'indication'), relation(2, 1, 'indication')];
  const plan = buildAutomaticPathologyGraph(entities, links);
  const edges = projectClinicalGraphLinks(links, asNodes(plan));
  assert.equal(edges.length, 2);
  for (const edge of edges) {
    const from = plan.instances.find(node => node.id === edge.source)!;
    const to = plan.instances.find(node => node.id === edge.target)!;
    assert.equal(from.groupId, to.groupId);
  }
});

test('interactions remain visible without generating a Cartesian product of shared aliases', () => {
  const links = [relation(2, 0, 'indication'), relation(2, 1, 'indication'), relation(3, 0, 'indication'),
    relation(3, 1, 'indication'), relation(2, 3, 'interaction')];
  const plan = buildAutomaticPathologyGraph(entities, links);
  const edges = projectClinicalGraphLinks(links, asNodes(plan)).filter(edge => edge.link.relationKind === 'interaction');
  assert.equal(edges.length, 2, 'one visual interaction per shared group, not four cross-product edges');
  assert.equal(new Set(edges.map(edge => edge.canonicalLinkId)).size, 1, 'the clinical interaction is counted only once');
});

test('different mechanisms and effects for the same pair remain separate clinical findings', () => {
  const interactions: GraphRelation[] = [
    relation(2, 3, 'interaction', { interactionEffect: 'increase_toxicity', evidence: 'Toxicité rénale cumulée.', webSources: ['https://example.org/a'] }),
    relation(2, 3, 'interaction', { interactionEffect: 'decrease_effect', evidence: 'Diminution de la concentration.', webSources: ['https://example.org/b'] }),
    relation(2, 3, 'interaction', { interactionEffect: 'increase_toxicity', evidence: 'Autre mécanisme documenté.', webSources: ['https://example.org/c', 'https://example.org/d'] }),
  ];
  const plan = buildAutomaticPathologyGraph(entities, []);
  const edges = projectClinicalGraphLinks(interactions, asNodes(plan));
  assert.equal(edges.length, 3);
  assert.equal(new Set(edges.map(edge => edge.id)).size, 3);
  const reorderedSources = { ...interactions[2], webSources: [...interactions[2].webSources!].reverse() };
  assert.equal(projectClinicalGraphLinks([reorderedSources], asNodes(plan))[0].id, edges[2].id);
  assert.equal(projectClinicalGraphLinks([...interactions, reorderedSources], asNodes(plan)).length, 3);
});

test('an inter-group interaction is rerouted to another visible alias if a group is hidden', () => {
  const thirdDisease: GraphEntity = { id: 'd3', type: 'pathology', name: 'Maladie C' };
  const links = [relation(2, 0, 'indication'), relation(2, 1, 'indication'),
    { ...relation(3, 0, 'indication'), to: thirdDisease.name }, relation(2, 3, 'interaction')];
  const plan = buildAutomaticPathologyGraph([...entities, thirdDisease], links);
  const nodes = asNodes(plan);
  const before = projectClinicalGraphLinks(links, nodes).find(edge => edge.link.relationKind === 'interaction')!;
  assert.ok(before);
  const hiddenParent = nodes.find(node => node.id === before.source)!.parentId!;
  const after = projectClinicalGraphLinks(links, nodes, new Set([hiddenParent])).find(edge => edge.link.relationKind === 'interaction')!;
  assert.ok(after, 'hiding a group must not erase an interaction when another copy remains visible');
  assert.notEqual(before.source, after.source);
  assert.equal(before.canonicalLinkId, after.canonicalLinkId);
});

test('adverse effects and co-occurrence alone do not make a medicine a treatment of the disease', () => {
  for (const kind of ['adverse_effect', 'association', 'risk_factor', 'interaction', 'coadministration'] as const) {
    const plan = buildAutomaticPathologyGraph(entities, [relation(2, 0, kind)]);
    assert.equal(plan.instances.find(node => node.entityId === 'm1')?.groupId, undefined, kind);
  }
  const contextual = buildAutomaticPathologyGraph(entities, [relation(2, 0, 'indication', { evidenceSupport: 'contextual' })]);
  assert.equal(contextual.instances.find(node => node.entityId === 'm1')?.groupId, undefined);
});

test('a reported adjunctive use can be grouped with an explicit non-indication role', () => {
  const plan = buildAutomaticPathologyGraph(entities, [relation(2, 0, 'adjunctive_use', { evidenceSupport: 'contextual' })]);
  const member = plan.instances.find(node => node.entityId === 'm1')!;
  assert.ok(member.groupId);
  assert.deepEqual(member.membershipKinds, ['adjunctive_use']);
});

test('symptoms with disease and drug origins are grouped independent of link arrival order', () => {
  const links = [relation(2, 4, 'adverse_effect'), relation(2, 1, 'indication'), relation(0, 4, 'manifestation'), relation(2, 0, 'indication')];
  const first = buildAutomaticPathologyGraph(entities, links);
  const reverse = buildAutomaticPathologyGraph([...entities].reverse(), [...links].reverse());
  assert.deepEqual(first, reverse);
  const symptomCopies = first.instances.filter(node => node.entityId === 's1');
  assert.equal(symptomCopies.length, 2);
  assert.ok(symptomCopies.some(node => node.membershipKinds.includes('adverse_effect') && node.membershipKinds.includes('manifestation')));
  assert.ok(symptomCopies.some(node => node.membershipKinds.length === 1 && node.membershipKinds[0] === 'adverse_effect'));
});

test('canonical matching distinguishes types and full drug formulations, even with colliding database IDs', () => {
  const mixed: GraphEntity[] = [
    { id: 'same-id', type: 'pathology', name: 'Même nom' },
    { id: 'same-id', type: 'medication', name: 'Même nom' },
    { id: 'm-short', type: 'medication', name: 'Ciclosporine' },
    { id: 'm-eye', type: 'medication', name: 'Ciclosporine collyre' },
  ];
  const links: GraphRelation[] = [{ from: 'Ciclosporine collyre', fromType: 'medication', to: 'Même nom', toType: 'pathology',
    relationKind: 'indication', evidenceSupport: 'direct', validationVersion: RELATION_ENGINE_VERSION }];
  const plan = buildAutomaticPathologyGraph(mixed, links);
  assert.equal(new Set(plan.instances.map(node => node.id)).size, 4);
  assert.equal(plan.instances.find(node => node.entityId === 'm-short')?.groupId, undefined);
  assert.ok(plan.instances.find(node => node.entityId === 'm-eye')?.groupId);
  assert.notEqual(canonicalGraphKey(mixed[0]), canonicalGraphKey(mixed[1]));
  assert.deepEqual(graphSelectionIds(asNodes(plan)), {
    pathologyIds: ['same-id'], symptomIds: [], treatmentIds: [], medicationIds: ['m-short', 'm-eye', 'same-id'],
  });
});

test('older or unvalidated relations cannot populate automatic groups or reviewed edges', () => {
  const links = [relation(2, 0, 'indication', { validationVersion: RELATION_ENGINE_VERSION - 1 }),
    relation(3, 1, 'indication', { validationVersion: undefined })];
  const plan = buildAutomaticPathologyGraph(entities, links);
  assert.ok(plan.instances.filter(node => node.type === 'medication').every(node => !node.groupId));
  assert.deepEqual(projectClinicalGraphLinks(links, asNodes(plan)), []);
});

test('incremental findings preserve IDs and never leave obsolete copies behind', () => {
  const initial = buildAutomaticPathologyGraph(entities, [relation(2, 0, 'indication')]);
  const complete = buildAutomaticPathologyGraph(entities, [relation(2, 0, 'indication'), relation(2, 1, 'indication')]);
  const restored = buildAutomaticPathologyGraph(entities, [relation(2, 0, 'indication')]);
  assert.deepEqual(initial, restored);
  const existingCopy = initial.instances.find(node => node.entityId === 'm1')!;
  assert.ok(complete.instances.some(node => node.id === existingCopy.id));
  assert.equal(restored.instances.filter(node => node.entityId === 'm1').length, 1);
});
