import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRAPH_FAMILIES,
  filterKnowledgeGraph,
  getConnectedPath,
  getGraphDistances,
  normalizeKnowledgeGraph,
} from '../src/lib/knowledgeGraph/model.ts';
import { dedupeEdges, getEdgeKey, transformEdge, transformNode } from '../src/utils/graphUtils.ts';
import { GRAPH_NODE_TYPES, normalizeGraph as normalizeServerGraph } from '../supabase/functions/deep-research-graph/contract.ts';

const source = { id: 'guide', title: 'Source fixture', url: 'https://example.org/guide', verification_status: 'verified' };
const node = (id: string, type = 'PATHOLOGY', extra: Record<string, unknown> = {}) => ({ id, label: id, node_type: type, ...extra });
const edge = (from: string, to: string, extra: Record<string, unknown> = {}) => ({
  source_id: from, target_id: to, edge_type: 'ASSOCIATED_WITH',
  qualifier: 'association', evidence: { status: 'limited', sources: [source] }, ...extra,
});

test('legacy, API and database inputs retain context, references and zero-valued weights', () => {
  const graph = normalizeKnowledgeGraph({
    knowledge_graph: {
      nodes: [node('n1', 'GENE', { label: 'NPHS1', canonical_id: 'HGNC:7908', aliases: ['NPHN'],
        parent_pathology: 'Syndrome néphrotique', properties: { description: 'Contexte conservé', tissue: 'podocyte' },
        references: [source], weight: 0, evidence_grade: 'B' }),
      { id: 'n2', name: 'Néphrine', node_type: 'PROTEIN', properties: { location: 'slit diaphragm' } }],
      edges: [{ id: 'db-edge', source_node_id: 'n1', target_node_id: 'n2', relationship_type: 'ENCODES',
        qualifier: 'established', evidence: { status: 'supported', population: 'human', sources: [source] },
        context: { tissue: 'kidney' }, rationale: 'Fixture uniquement', weight: 0 }],
    }, source_statuses: [{ source: 'test', status: 'available' }],
  });
  assert.equal(graph.nodes[0].family, 'genetics');
  assert.equal(graph.nodes[1].family, 'molecules');
  assert.equal(graph.nodes[0].properties.tissue, 'podocyte');
  assert.equal(graph.nodes[0].parent_pathology, 'Syndrome néphrotique');
  assert.deepEqual(graph.nodes[0].aliases, ['NPHN']);
  assert.equal(graph.nodes[0].proximity_score, 0);
  assert.equal(graph.nodes[0].references[0].url, source.url);
  assert.equal(graph.edges[0].relationship, 'ENCODES');
  assert.equal(graph.edges[0].weight, 0);
  assert.deepEqual(graph.edges[0].context, { tissue: 'kidney' });
  assert.equal(graph.edges[0].evidence.population, 'human');
  assert.equal(graph.edges[0].qualifier, 'established');
  assert.deepEqual(graph.source_statuses, [{ source: 'test', status: 'available' }]);
});

test('all twelve families have stable IDs and legacy type aliases map conservatively', () => {
  assert.equal(new Set(GRAPH_FAMILIES.map(f => f.id)).size, 12);
  const kinds = ['ORGAN', 'PATHOLOGY', 'SYMPTOM', 'DRUG', 'GENE', 'PROTEIN', 'COMPLICATION', 'LAB',
    'DRUG_INTERACTION', 'HYPOTHESIS', 'MECHANISM', 'LIFESTYLE'];
  const graph = normalizeKnowledgeGraph({ nodes: kinds.map((type, i) => node(String(i), type)), edges: [] });
  assert.deepEqual(graph.nodes.map(n => n.family), GRAPH_FAMILIES.map(f => f.id));
});

test('backend semantic roles survive frontend normalization for every supported kind and family', () => {
  for (const nodeType of GRAPH_NODE_TYPES) {
    const candidates = GRAPH_FAMILIES.map(({ id }) => ({ id: `candidate-${id}`, label: `${nodeType} ${id}`, node_type: nodeType, family: id }));
    const server = normalizeServerGraph({ nodes: candidates,
      edges: candidates.map(candidate => ({ source_id: 'c0', target_id: candidate.id, edge_type: 'ASSOCIATED_WITH' })) },
    { topic: 'Root', topicType: 'PATHOLOGY', pathologies: ['Root'], existingNodes: [], maxNodes: 50, maxDepth: 3 }, []);
    const frontend = normalizeKnowledgeGraph(server);
    assert.equal(frontend.nodes.length, server.nodes.length, nodeType);
    for (const expected of server.nodes) {
      const actual = frontend.nodes.find(node => node.id === expected.id);
      assert.equal(actual?.family, expected.family, `${nodeType} / ${expected.id}`);
      assert.equal(actual?.entity_kind, expected.entity_kind, `${nodeType} must retain its entity kind`);
      assert.equal(actual?.canonical_id, expected.canonical_id, `${nodeType} must retain its identity`);
    }
  }
});

test('a shared research family never merges a gene with its protein or permits cross-kind default families', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [
    node('gene', 'GENE', { label: 'NPHS1', canonical_id: 'shared-label', family: 'research' }),
    node('protein', 'PROTEIN', { label: 'NPHS1', canonical_id: 'shared-label', family: 'research' }),
    node('gene-wrong-role', 'GENE', { label: 'Other gene', family: 'molecules' }),
    node('protein-wrong-role', 'PROTEIN', { label: 'Other protein', family: 'genetics' }),
    node('gene-mechanism', 'GENE', { family: 'mechanisms' }),
    node('protein-measure', 'PROTEIN', { family: 'examinations' }),
  ], edges: [] });
  assert.equal(graph.nodes.length, 6);
  assert.deepEqual(graph.nodes.map(node => [node.entity_kind, node.family]), [
    ['gene', 'research'], ['protein', 'research'], ['gene', 'genetics'], ['protein', 'molecules'],
    ['gene', 'mechanisms'], ['protein', 'examinations'],
  ]);
});

test('only explicit roots and saved ring-zero centres become roots', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('root', 'PATHOLOGY', { is_root: true }),
    node('related-pathology'), node('legacy-root', 'PATHOLOGY', { ring: 0 }),
    node('uncategorised', 'UNCLASSIFIED_KIND')], edges: [] });
  assert.deepEqual(graph.root_ids, ['root', 'legacy-root']);
  assert.equal(graph.nodes[1].is_root, false);
  assert.equal(graph.nodes[3].family, 'research');
  assert.equal(graph.nodes[3].family_unclassified, true);
  assert.ok(graph.diagnostics.warnings.length > 0);
  assert.deepEqual(normalizeKnowledgeGraph(graph).root_ids, graph.root_ids);
});

test('canonical identity merges same entities but never merges a gene with its protein or identical labels alone', () => {
  const graph = normalizeKnowledgeGraph({
    nodes: [node('gene1', 'GENE', { label: 'NPHS1', canonical_id: 'local:nphs1', aliases: ['NPHN'], references: [source] }),
      node('gene2', 'GENE', { label: 'NPHS1 gene', canonical_id: 'local:nphs1', aliases: ['Nephrin gene'],
        references: [{ pmid: '123456' }] }),
      node('protein', 'PROTEIN', { label: 'NPHS1', canonical_id: 'local:nphs1' }),
      node('unresolved1', 'GENE', { label: 'Ambiguous symbol' }),
      node('unresolved2', 'GENE', { label: 'Ambiguous symbol' })],
    edges: [edge('gene2', 'protein', { edge_type: 'ENCODES' })],
  });
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.edges[0].source, 'gene1');
  assert.equal(graph.edges[0].target, 'protein');
  assert.ok(graph.nodes[0].aliases.includes('Nephrin gene'));
  assert.equal(graph.nodes[0].references.length, 2);
  assert.equal(graph.diagnostics.mergedNodeIds.gene2, 'gene1');
});

test('a stable placeholder ID can acquire a canonical ID without merging conflicting canonical identities', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('query0', 'PATHOLOGY', { label: 'Condition', is_root: true }),
    node('query0', 'PATHOLOGY', { label: 'Condition', canonical_id: 'local:condition' }),
    node('another-page-root', 'PATHOLOGY', { label: 'Condition', canonical_id: 'local:condition' }),
    node('other', 'PATHOLOGY', { label: 'Condition', canonical_id: 'ontology:first' }),
    node('other', 'PATHOLOGY', { label: 'Condition', canonical_id: 'ontology:second' })], edges: [] });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.nodes[0].canonical_id, 'local:condition');
  assert.equal(graph.nodes[0].is_root, true);
  assert.equal(graph.diagnostics.mergedNodeIds['another-page-root'], 'query0');
  assert.ok(graph.diagnostics.ambiguousNodeIds.includes('other'));
});

test('edge identity preserves direction, relation, population and contradictory evidence', () => {
  const graph = normalizeKnowledgeGraph({
    nodes: [node('a'), node('b')],
    edges: [edge('a', 'b', { edge_type: 'TREATS', polarity: 'supports', context: { population: 'adult' } }),
      edge('a', 'b', { edge_type: 'TREATS', polarity: 'supports', context: { population: 'adult' },
        evidence: { status: 'supported', sources: [{ pmid: '123456' }] } }),
      edge('b', 'a', { edge_type: 'TREATS', polarity: 'supports', context: { population: 'adult' } }),
      edge('a', 'b', { edge_type: 'WORSENS' }),
      edge('a', 'b', { edge_type: 'TREATS', polarity: 'contradicts', context: { population: 'adult' } }),
      edge('a', 'b', { edge_type: 'TREATS', polarity: 'supports', context: { population: 'child' } })],
  });
  assert.equal(graph.edges.length, 5);
  assert.equal(graph.edges[0].evidence.sources.length, 2);
  assert.equal(graph.edges[0].evidence_items.length, 2);
  assert.equal(new Set(graph.edges.map(e => e.id)).size, 5);
});

test('grade, proximity and an article title never promote a claim into established evidence', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('a'), node('b')], edges: [
    edge('a', 'b', { id: 'no-source', qualifier: 'established', evidence_grade: 'A', weight: 1, evidence: undefined }),
    edge('a', 'b', { id: 'title-only', qualifier: 'established', evidence: { status: 'supported', sources: [{ title: 'Promising findings' }] } }),
    edge('a', 'b', { id: 'explicit-association', qualifier: 'association', evidence_grade: 'A', weight: 1 }),
    edge('a', 'b', { id: 'unavailable', qualifier: 'established', evidence: { status: 'unavailable', sources: [source] } }),
  ] });
  assert.ok(graph.edges.filter(e => e.id !== 'explicit-association').every(e => e.qualifier === 'unverified'));
  assert.equal(graph.edges.find(e => e.id === 'explicit-association')?.qualifier, 'association');
  assert.ok(graph.diagnostics.unverifiedEdgeIds.includes('no-source'));
});

test('legacy publication nodes are attached as references without creating synthetic clinical links', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('condition'), node('drug', 'DRUG'),
    node('paper', 'EVIDENCE', { label: 'Study reference', properties: { pmid: '123456', url: 'https://pubmed.ncbi.nlm.nih.gov/123456/' } }),
    node('gap', 'EVIDENCE', { label: 'No source available', description: 'Recherche incomplète' })],
  edges: [edge('condition', 'paper', { edge_type: 'SUPPORTED_BY' }), edge('paper', 'drug', { edge_type: 'DISCUSSES' })] });
  assert.deepEqual(graph.nodes.map(n => n.id), ['condition', 'drug', 'gap']);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.nodes[0].references[0].pmid, '123456');
  assert.equal(graph.nodes[1].references[0].pmid, '123456');
  assert.equal(graph.diagnostics.migratedReferenceNodes[0].nodeId, 'paper');
  assert.equal(graph.nodes[2].family, 'research');
});

test('dangling edges and ambiguous duplicate IDs are reported instead of guessed', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('root'), node('collision', 'GENE'), node('collision', 'PROTEIN')],
    edges: [edge('root', 'absent', { id: 'dangling' }), edge('root', 'collision', { id: 'ambiguous' })] });
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.diagnostics.danglingEdges.length, 2);
  assert.ok(graph.diagnostics.ambiguousNodeIds.includes('collision'));
  assert.equal(new Set(graph.nodes.map(n => n.id)).size, 3);
});

test('distances and paths use real edges, retain references, and do not connect orphan nodes', () => {
  const graph = normalizeKnowledgeGraph({ nodes: ['a', 'b', 'c', 'orphan'].map(id => node(id)),
    edges: [edge('b', 'a', { id: 'ba' }), edge('b', 'c', { id: 'bc' })] });
  const distances = getGraphDistances(graph, 'a');
  assert.deepEqual([...distances], [['a', 0], ['b', 1], ['c', 2]]);
  const path = getConnectedPath(graph, 'a', 'c');
  assert.deepEqual(path?.nodeIds, ['a', 'b', 'c']);
  assert.deepEqual(path?.edgeIds, ['ba', 'bc']);
  assert.equal(path?.edges[0].evidence.sources[0].url, source.url);
  assert.equal(getConnectedPath(graph, 'a', 'orphan'), null);
  assert.equal(getConnectedPath(graph, 'missing', 'a'), null);
  assert.equal(getGraphDistances(graph, 'a', { direction: 'outgoing' }).size, 1);
});

test('filters retain the selected centre, report orphans and never bridge hidden intermediate nodes', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('root'), node('middle', 'GENE'), node('drug', 'DRUG'), node('loose', 'DRUG')],
    edges: [edge('root', 'middle'), edge('middle', 'drug')] });
  const filtered = filterKnowledgeGraph(graph, { centerId: 'root', families: ['treatments'] });
  assert.deepEqual(filtered.nodes.map(n => n.id), ['root', 'drug', 'loose']);
  assert.equal(filtered.edges.length, 0);
  assert.deepEqual(filtered.diagnostics.orphanNodeIds, ['root', 'drug', 'loose']);
  assert.deepEqual(filtered.diagnostics.disconnectedNodeIds, ['drug', 'loose']);
  assert.ok(filtered.diagnostics.filteredNodeIds.includes('middle'));
  const limited = filterKnowledgeGraph(graph, { centerId: 'root', maxDistance: 1 });
  assert.deepEqual(limited.nodes.map(n => n.id), ['root', 'middle']);
  assert.equal(limited.edges.length, 1);
});

test('qualifier and alias search filters are independent of evidence grades', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('root'), node('drug', 'MEDICATION', { aliases: ['Médicament alias'] }), node('other')],
    edges: [edge('root', 'drug'), edge('root', 'other', { qualifier: 'research', evidence: { status: 'hypothesis', sources: [source] } })] });
  const filtered = filterKnowledgeGraph(graph, { centerId: 'root', qualifiers: ['association'], query: 'medicament alias' });
  assert.deepEqual(filtered.nodes.map(n => n.id), ['root', 'drug']);
  assert.equal(filtered.edges.length, 1);
});

test('normalisation is idempotent for entities and evidence and does not mutate input', () => {
  const input = { nodes: [node('a'), node('b')], edges: [edge('a', 'b')] };
  const snapshot = JSON.stringify(input);
  const first = normalizeKnowledgeGraph(input);
  const second = normalizeKnowledgeGraph(first);
  assert.deepEqual(second.nodes, first.nodes);
  assert.deepEqual(second.edges, first.edges);
  assert.equal(JSON.stringify(input), snapshot);
});

test('unsafe source URLs cannot validate evidence', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('a'), node('b')], edges: [edge('a', 'b', {
    qualifier: 'established', evidence: { status: 'supported', sources: [
      { url: 'javascript:alert(1)' }, { url: 'https://user:secret@example.org/article' },
    ] },
  })] });
  assert.equal(graph.edges[0].qualifier, 'unverified');
  assert.ok(graph.edges[0].evidence.sources.every(ref => !ref.url));
});

test('malformed external display fields are retained as metadata rather than unsafe React text', () => {
  const graph = normalizeKnowledgeGraph({ nodes: [node('a', 'GENE', { canonical_id: { unexpected: 'object' },
    properties: { description: { unexpected: 'object' } } }), node('b')],
  edges: [edge('a', 'b', { rationale: { unexpected: 'object' }, evidence: {
    status: 'limited', population: { unexpected: 'object' }, study_type: ['unexpected'], sources: [
      { id: 'ref', title: { unexpected: 'object' }, url: source.url, year: { unexpected: 'object' } },
    ],
  } })] });
  assert.equal(graph.nodes[0].canonical_id, undefined);
  assert.equal(graph.nodes[0].properties.description, undefined);
  assert.equal(graph.edges[0].rationale, undefined);
  assert.equal(graph.edges[0].evidence.population, undefined);
  assert.equal(graph.edges[0].evidence.study_type, undefined);
  assert.equal(graph.edges[0].evidence.sources[0].title, undefined);
  assert.equal(graph.edges[0].evidence.sources[0].year, undefined);
});

test('legacy transforms preserve metadata and dedupe retains directed multi-relations', () => {
  const transformed = transformNode(node('gene', 'GENE', { weight: 1, family: 'genetics', aliases: ['alias'],
    properties: { tissue: 'kidney' }, references: [source] }), ['condition'], 'condition');
  assert.equal(transformed.evidence_grade, 'D');
  assert.equal(transformed.properties.tissue, 'kidney');
  assert.deepEqual(transformed.aliases, ['alias']);
  const a = transformEdge(edge('a', 'b', { id: 'first', weight: 1 }));
  const b = transformEdge({ source: 'b', target: 'a', relationship: 'ASSOCIATED_WITH' });
  const c = transformEdge({ source: 'a', target: 'b', relationship: 'TREATS' });
  assert.equal(a.evidence_grade, 'D');
  assert.equal(b.source, 'b');
  assert.notEqual(getEdgeKey(a), getEdgeKey(b));
  assert.equal(dedupeEdges([a, b, c]).length, 3);
});
