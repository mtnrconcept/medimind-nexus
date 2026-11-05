import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPairCandidates, typedElementKey, type PairCandidate, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { readAgentCells } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';
import { buildAgentRequest, candidatePairs, createAgentState, nextAgentStep } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';
import { RELATION_KINDS } from '../supabase/functions/cross-data-analyzer/relation-contract.ts';

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: string[];
  items?: Schema;
  anyOf?: Schema[];
  minItems?: number;
  maxItems?: number;
}

const medication: SelectedElement = { name: 'Médicament initial oral', type: 'medication' };
const candidate: SelectedElement = { name: 'Médicament candidat oral', type: 'medication' };
const pathologies: SelectedElement[] = ['alpha', 'bêta', 'gamma'].map(name => ({ name: `Pathologie ${name}`, type: 'pathology' }));
const source = { title: 'Source synthétique', url: 'https://www.swissmedic.ch/synthetic-pair-schema' };

function assertStrictObjects(schema: Schema) {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties!)));
  }
  Object.values(schema.properties || {}).forEach(assertStrictObjects);
  schema.anyOf?.forEach(assertStrictObjects);
  if (schema.items) assertStrictObjects(schema.items);
}

function assertPairCell(schema: Schema, pair: PairCandidate) {
  const properties = schema.properties!;
  assert.deepEqual(properties.pairHash.enum, [pair.pairHash]);
  assert.equal(properties.directions.minItems, 2);
  assert.equal(properties.directions.maxItems, 2);
  assert.equal(properties.links.maxItems, 8);
  const endpoints = [typedElementKey(pair.left), typedElementKey(pair.right)];
  for (const field of ['directions', 'links']) {
    const alternatives = properties[field].items!.anyOf!;
    assert.equal(alternatives.length, 2, 'Only the two opposite endpoint directions may be generated');
    assert.deepEqual(alternatives.map(item => [item.properties!.fromKey.enum, item.properties!.toKey.enum]), [
      [[endpoints[0]], [endpoints[1]]], [[endpoints[1]], [endpoints[0]]],
    ]);
  }
  for (const branch of properties.links.items!.anyOf!) {
    assert.deepEqual(branch.properties!.relationKind.enum, RELATION_KINDS.filter(kind => kind !== 'uncertain'),
      'Generation constraints must restrict identity, without preselecting a clinical conclusion');
  }
}

for (const kind of ['pairs', 'candidate_pairs'] as const) {
  test(`${kind} generation limits every endpoint to its scheduled pair despite the wider clinical context`, () => {
    const state = createAgentState(kind === 'pairs' ? [medication, candidate, ...pathologies] : [medication, ...pathologies]);
    if (kind === 'candidate_pairs') state.agent.candidates = [candidate];
    const pairs = kind === 'pairs' ? nextAgentStep(state).pairs : candidatePairs(state).filter(pair =>
      pair.left.type === 'medication' && pair.right.type === 'medication');
    assert.equal(pairs.length, 1);
    const request = buildAgentRequest(state, { kind, pairs });
    const format = request.options.responseFormat as { type: string; strict: boolean; schema: Schema };
    assert.equal(format.type, 'json_schema');
    assert.equal(format.strict, true);
    const cells = format.schema.properties!.cells;
    assert.equal(cells.minItems, 1);
    assert.equal(cells.maxItems, 1);
    assertPairCell(cells.items!, pairs[0]);
    assertStrictObjects(format.schema);
    for (const pathology of pathologies) {
      assert.equal(JSON.stringify(format.schema).includes(typedElementKey(pathology)), false,
        'A context pathology cannot become an endpoint in a medication-medication cell');
    }
    const payload = JSON.parse(request.user);
    assert.deepEqual(payload.pairs.map(({ pair }: { pair: PairCandidate }) => pair.pairHash), pairs.map(pair => pair.pairHash));
    assert.equal(payload.selectionContext.length, state.elements.length + state.agent.candidates.length,
      'The wider selection remains available as context, without expanding the output pair');
    assert.match(request.system, /selectionContext/);
  });
}

test('the response schema binds each scheduled hash to its own endpoints and exact cell count', () => {
  const state = createAgentState([medication, candidate, ...pathologies]);
  const pairs = buildPairCandidates(state.elements).slice(0, 2);
  const format = buildAgentRequest(state, { kind: 'pairs', pairs }).options.responseFormat as { schema: Schema };
  const cells = format.schema.properties!.cells;
  assert.equal(cells.minItems, pairs.length);
  assert.equal(cells.maxItems, pairs.length);
  assert.equal(cells.items!.anyOf!.length, pairs.length);
  cells.items!.anyOf!.forEach((cell, index) => assertPairCell(cell, pairs[index]));
  assertStrictObjects(format.schema);
});

test('the server still rejects a cell that appends five contextual pathology links to three valid pair links', () => {
  const [pair] = buildPairCandidates([medication, candidate]);
  const left = typedElementKey(pair.left), right = typedElementKey(pair.right);
  const link = (fromKey: string, toKey: string, relationKind: string) => ({
    fromKey, toKey, relationKind, evidence: 'Relation synthétique sans conclusion médicale réelle.',
    sourceUrls: [source.url], confidence: 'high', evidenceSupport: 'direct',
    context: { condition: 'same', route: 'same', population: 'unknown', temporality: 'not_reported' },
    contextLimitations: ['Scénario synthétique.'], dangerLevel: 'unknown', interactionEffect: 'unknown',
  });
  const validLinks = [link(left, right, 'interaction'), link(right, left, 'interaction'), link(right, left, 'coadministration')];
  const directions = [[left, right], [right, left]].map(([fromKey, toKey]) => ({
    fromKey, toKey, verdict: 'cited_relation', explanation: 'Cette direction synthétique possède une source traçable.',
    limitations: 'Exemple de test uniquement.', sourceUrls: [source.url],
  }));
  const cell = { pairHash: pair.pairHash, directions, links: validLinks };
  assert.equal(readAgentCells([cell], [pair], [source], 1).cells[pair.pairHash].length, 3);
  const extraLinks = [
    ...pathologies.map(pathology => link(left, typedElementKey(pathology), 'indication')),
    ...pathologies.slice(0, 2).map(pathology => link(right, typedElementKey(pathology), 'indication')),
  ];
  const rejected = readAgentCells([{ ...cell, links: [...validLinks, ...extraLinks] }], [pair], [source], 1);
  assert.deepEqual(rejected.cells, {});
  assert.deepEqual(rejected.assessments, [], 'A rejected response must not silently count the pair as reviewed');
});
