import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeEdges, getEdgeKey, getSemanticEdgeColor, mergeRadialResearchGraph, transformEdge, transformNode } from '../src/utils/graphUtils.ts';
import { completeResearch, handleResearchRequest, parseResearchInput, prepareResearch, type ResearchServices } from '../supabase/functions/deep-research-graph/handler.ts';

const request = (body: unknown) => new Request('https://example.test/deep-research-graph', {
  method: 'POST', headers: { authorization: 'Bearer session' }, body: JSON.stringify(body),
});
const services: ResearchServices = {
  async isAuthenticated() { return true; },
  async readTable() { return []; },
  async readInteractions() { return []; },
  async fetcher() { return Response.json({ esearchresult: { idlist: [], count: '0' } }); },
  async callAI() { return { text: '', model: 'test', provider: 'none' }; },
};

test('the radial graph retains multiple clinical relations and both directions for the same pair', () => {
  const edges = [
    { source_id: 'drug', target_id: 'disease', edge_type: 'TREATS', weight: 0.8 },
    { source_id: 'drug', target_id: 'disease', edge_type: 'CONTRAINDICATED_IF', weight: 0.7 },
    { source_id: 'disease', target_id: 'drug', edge_type: 'ALTERS_EXPOSURE', weight: 0.6 },
  ].map(transformEdge);
  assert.equal(new Set(edges.map(getEdgeKey)).size, 3);
  assert.equal(new Set(edges.map(edge => edge.id)).size, 3);
  assert.equal(dedupeEdges([...edges, edges[0]]).length, 3);
});

test('graph transformations retain explanation and references without deriving evidence from proximity', () => {
  const references = [{ id: '123', title: 'Retrieved study', url: 'https://pubmed.ncbi.nlm.nih.gov/123/',
    abstract: 'Synthetic population context.', journal: 'Test journal', year: '2025',
    publication_types: ['Randomized Controlled Trial'], abstract_truncated: false }];
  const edge = transformEdge({ source_id: 'a', target_id: 'b', edge_type: 'TREATS', weight: 0.99,
    rationale: 'A result needs population-specific interpretation.', references, evidence_status: 'source_linked' });
  assert.equal(edge.rationale, 'A result needs population-specific interpretation.');
  assert.deepEqual(edge.references, references);
  assert.equal(edge.evidence_grade, 'D');
  assert.equal(edge.evidence_status, 'source_linked');
  const node = transformNode({ id: 'b', label: 'Shared concept', node_type: 'DRUG', weight: 0.99,
    description: 'Full description', references, parent_pathology: 'B' }, ['A', 'B'], 'A');
  assert.equal(node.evidence_grade, 'D');
  assert.deepEqual(node.properties.references, references);
  assert.equal(node.parent_pathology, 'B');
});

test('research passes local descriptions and all selected disease context to forced Astra', async () => {
  let captured: { system: string; prompt: string; options: Record<string, unknown> } | undefined;
  const response = await handleResearchRequest(request({ topic: 'A + B', pathologies: ['A', 'B'] }), {
    ...services,
    async readTable(table) { return table.table === 'treatments'
      ? [{ id: 't1', name: 'Selected therapy', description: 'Distinct indication and monitoring context.' }] : []; },
    async callAI(system, prompt, options) {
      captured = { system, prompt, options };
      return { provider: 'openai', model: 'gpt-6-astra', text: JSON.stringify({ nodes: [
        { id: 'c0', label: 'A', node_type: 'PATHOLOGY' }, { id: 'c1', label: 'B', node_type: 'PATHOLOGY' },
      ], edges: [] }) };
    },
  });
  assert.equal(response.status, 200);
  assert.ok(captured);
  assert.equal(captured.options.model, 'gpt-6-astra');
  assert.equal(captured.options.forceModel, true);
  assert.ok(Number(captured.options.maxTokens) >= 65_536);
  assert.match(captured.prompt, /Distinct indication and monitoring context/);
  assert.match(captured.system, /entre les (?:nouveaux )?concepts/i);
  assert.deepEqual(JSON.parse(captured.prompt).pathologies, ['A', 'B']);
});

test('research keeps retrieved citations per relation, rejects invented URLs and never auto-validates a high weight', async () => {
  const json = await (await handleResearchRequest(request({ topic: 'A' }), {
    ...services,
    async callAI() {
      return { provider: 'openai', model: 'gpt-6-astra', webSearchCalls: 1, webSourcesTruncated: false,
        webSources: [{ title: 'Retrieved official result', url: 'https://www.ema.europa.eu/en/example' }],
        text: JSON.stringify({ nodes: [{ id: 'c0', label: 'A', node_type: 'PATHOLOGY' },
          { id: 't', label: 'Therapy', node_type: 'TREATMENT', source_urls: ['https://www.ema.europa.eu/en/example'] }],
          edges: [{ source_id: 't', target_id: 'c0', edge_type: 'TREATS', weight: 0.99,
            rationale: 'Study-specific result, to be reviewed.',
            source_urls: ['https://www.ema.europa.eu/en/example', 'https://invented.example/paper'] }],
          research_summary: 'Synthetic test only.' }) };
    },
  })).json();
  assert.equal(json.edges.length, 1);
  assert.equal(json.edges[0].rationale, 'Study-specific result, to be reviewed.');
  assert.equal(json.edges[0].evidence_grade, 'D');
  assert.equal(json.edges[0].evidence_status, 'source_linked');
  assert.deepEqual(json.edges[0].references.map((reference: { url: string }) => reference.url), ['https://www.ema.europa.eu/en/example']);
  assert.ok(!JSON.stringify(json).includes('invented.example'));
  assert.ok(json.source_statuses.some((status: { source: string; count: number }) => status.source === 'Recherche spécialisée Astra' && status.count === 1));
});

test('repeated concepts in different pathology groups remain distinct and node limits are explicit', async () => {
  const json = await (await handleResearchRequest(request({ topic: 'A + B', pathologies: ['A', 'B'], max_nodes: 4 }), {
    ...services,
    async callAI() { return { provider: 'openai', model: 'gpt-6-astra', text: JSON.stringify({ nodes: [
      { id: 'c0', label: 'A', node_type: 'PATHOLOGY' }, { id: 'c1', label: 'B', node_type: 'PATHOLOGY' },
      { id: 'ta', label: 'Shared therapy', node_type: 'DRUG', parent_pathology: 'A' },
      { id: 'tb', label: 'Shared therapy', node_type: 'DRUG', parent_pathology: 'B' },
      { id: 'extra', label: 'Other', node_type: 'LAB' },
    ], edges: [{ source_id: 'ta', target_id: 'c0', edge_type: 'TREATS' },
      { source_id: 'tb', target_id: 'c1', edge_type: 'TREATS' }] }) }; },
  })).json();
  assert.equal(json.nodes.filter((node: { label: string }) => node.label === 'Shared therapy').length, 2);
  assert.equal(json.result_status, 'partial');
  assert.ok(json.limitations.some((message: string) => /limite|tronqu/i.test(message)));
  assert.equal(json.edges.length, 2);
});

test('an expansion preserves the selected concept type instead of making every central node a disease', async () => {
  const json = await (await handleResearchRequest(request({ topic: 'Marker', topic_type: 'LAB', include_pubmed: false, include_fda: false }), {
    ...services,
    async callAI() { return { provider: 'openai', model: 'gpt-6-astra', text: JSON.stringify({ nodes: [
      { id: 'c0', label: 'Marker', node_type: 'LAB' },
    ], edges: [] }) }; },
  })).json();
  assert.equal(json.nodes[0].node_type, 'LAB');
  assert.equal(json.nodes[0].ring, 3);
});

test('a source outage stays visible even if Astra supplies a graph', async () => {
  const json = await (await handleResearchRequest(request({ topic: 'A' }), {
    ...services,
    async fetcher() { return Response.json({}, { status: 503 }); },
    async callAI() { return { provider: 'openai', model: 'gpt-6-astra', text: JSON.stringify({ nodes: [
      { id: 'c0', label: 'A', node_type: 'PATHOLOGY' },
    ], edges: [] }) }; },
  })).json();
  assert.equal(json.result_status, 'partial');
  assert.ok(json.source_statuses.some((source: { source: string; status: string }) => source.source === 'PubMed' && source.status === 'unavailable'));
  assert.ok(json.limitations.length > 0);
});

test('expansion maps same-name medicines by pathology, retains old links and attaches existing-to-existing discoveries', () => {
  const nodes = [
    { id: 'a', label: 'A', node_type: 'PATHOLOGY', parent_pathology: 'A' },
    { id: 'b', label: 'B', node_type: 'PATHOLOGY', parent_pathology: 'B' },
    { id: 'ma', label: 'Shared medicine', node_type: 'DRUG', parent_pathology: 'A' },
    { id: 'mb', label: 'Shared medicine', node_type: 'DRUG', parent_pathology: 'B' },
  ].map(node => transformNode(node, ['A', 'B'], 'A'));
  const prior = { nodes, edges: [transformEdge({ source_id: 'ma', target_id: 'a', edge_type: 'TREATS' })] };
  const merged = mergeRadialResearchGraph(prior, { nodes: [
    { id: 'c0', label: 'A', node_type: 'PATHOLOGY', parent_pathology: 'A' },
    { id: 'm1', label: 'Shared medicine', node_type: 'MEDICATION', parent_pathology: 'A' },
    { id: 'm2', label: 'Shared medicine', node_type: 'MEDICATION', parent_pathology: 'B' },
  ], edges: [
    { source_id: 'm1', target_id: 'c0', edge_type: 'CONTRAINDICATED_IF', rationale: 'Conditional concern.' },
    { source_id: 'm2', target_id: 'b', edge_type: 'TREATS', rationale: 'Separate indication.' },
    { source_id: 'Shared medicine', target_id: 'b', edge_type: 'ASSOCIATED_WITH' },
  ] }, { pathologies: ['A', 'B'], primaryPathology: 'A', scopeId: 'expansion-one' });
  assert.equal(merged.nodes.length, 4);
  assert.deepEqual(merged.edges.map(edge => [edge.source, edge.target, edge.relationship]), [
    ['ma', 'a', 'TREATS'], ['ma', 'a', 'CONTRAINDICATED_IF'], ['mb', 'b', 'TREATS'],
  ]);
  assert.equal(merged.unresolvedEdges, 1, 'An ambiguous name cannot silently select the wrong disease group.');
});

test('edge meaning comes from the actual relation rather than the types of its endpoints', () => {
  const medicine = transformNode({ id: 'm', label: 'Medicine', node_type: 'DRUG' }, ['A'], 'A');
  const symptom = transformNode({ id: 's', label: 'Symptom', node_type: 'SYMPTOM' }, ['A'], 'A');
  assert.equal(getSemanticEdgeColor(medicine, symptom, 'IMPROVES', 'D').type, 'positive');
  assert.equal(getSemanticEdgeColor(medicine, medicine, 'SEARCH_RESULT', 'D').type, 'neutral');
  assert.equal(getSemanticEdgeColor(medicine, medicine, 'ASSOCIATED_WITH', 'A').isDangerous, false);
});

test('interaction limits and long descriptions remain explicit in saved source coverage', async () => {
  for (const rows of [
    Array.from({ length: 30 }, (_, index) => ({ id: 'i' + index, medication_id: 'med', interacting_drug: 'Other', severity: null, description: 'Local context' })),
    [{ id: 'i', medication_id: 'med', interacting_drug: 'Other', severity: null, description: 'x'.repeat(3001) }],
  ]) {
    const prepared = await prepareResearch(parseResearchInput({ topic: 'A', include_pubmed: false, include_fda: false })!, {
      ...services,
      async readTable(table) { return table.table === 'medications' ? [{ id: 'med', name: 'Medicine', description: null }] : []; },
      async readInteractions() { return rows; },
    });
    assert.equal(prepared.local.truncated, true);
    assert.equal(prepared.local.status.status, 'partial');
    assert.match(prepared.local.status.detail ?? '', /limite|tronqu/i);
  }
});

test('merged relations retain separate rationales and citations; ambiguous names do not select a pathology group', async () => {
  const prepared = await prepareResearch(parseResearchInput({ topic: 'A', existing_nodes: [
    { id: 'm1', name: 'Shared', node_type: 'DRUG', parent_pathology: 'A' },
    { id: 'm2', name: 'Shared', node_type: 'DRUG', parent_pathology: 'B' },
  ], include_pubmed: false, include_fda: false })!, services);
  const result = completeResearch(prepared, { model: 'gpt-6-astra', provider: 'openai',
    webSources: [{ title: 'Source', url: 'https://www.ema.europa.eu/en/example' }],
    text: JSON.stringify({ nodes: [{ id: 'c0', label: 'A', node_type: 'PATHOLOGY' }], edges: [
      { source_id: 'm1', target_id: 'c0', edge_type: 'TREATS', rationale: 'Indication context.' },
      { source_id: 'm1', target_id: 'c0', edge_type: 'TREATS', rationale: 'Population limitation.', source_urls: ['https://www.ema.europa.eu/en/example'] },
      { source_id: 'Shared', target_id: 'c0', edge_type: 'TREATS', rationale: 'Ambiguous group.' },
    ] }),
  });
  assert.equal(result.edges.length, 1);
  assert.match(result.edges[0].rationale, /Indication context/);
  assert.match(result.edges[0].rationale, /Population limitation/);
  assert.equal(result.edges[0].references.length, 1);
  assert.equal(result.edges[0].evidence_status, 'source_linked');
  assert.ok(result.limitations.some(limit => /lien\(s\)/.test(limit)));
});

test('expansion retains the selected concept type inside a multi-pathology graph', async () => {
  const prepared = await prepareResearch(parseResearchInput({ topic: 'Marker', topic_type: 'LAB', pathologies: ['A', 'B'],
    include_pubmed: false, include_fda: false })!, services);
  const result = completeResearch(prepared, { model: 'gpt-6-astra', provider: 'openai', text: JSON.stringify({
    nodes: [{ id: 'c0', label: 'A', node_type: 'PATHOLOGY' }, { id: 'c1', label: 'B', node_type: 'PATHOLOGY' },
      { id: 'marker', label: 'Marker', node_type: 'PATHOLOGY', parent_pathology: 'A' }], edges: [],
  }) });
  assert.equal(result.nodes.find(node => node.label === 'Marker')?.node_type, 'LAB');
});
