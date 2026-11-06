import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeKnowledgeGraph } from '../src/lib/knowledgeGraph/model.ts';
import { asResearchGraph, createLocalResearchEvent, readResearchResponse, ResearchPageAccumulator } from '../src/lib/knowledgeGraph/researchStream.ts';

const reference = { id: 'fixture', title: 'Fixture de protocole', url: 'https://example.org/fixture',
  verification_status: 'verified', content_level: 'abstract' };
const n = (id: string, label: string, node_type = 'PATHOLOGY', extra: Record<string, unknown> = {}) => ({ id, label, node_type, ...extra });
const e = (source_id: string, target_id: string, extra: Record<string, unknown> = {}) => ({
  source_id, target_id, edge_type: 'ASSOCIATED_WITH', qualifier: 'association',
  evidence: { status: 'limited', sources: [reference], population: 'adult', limitations: ['Fixture uniquement.'] }, ...extra,
});
const empty = () => asResearchGraph({ nodes: [], edges: [] });
const frame = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;
const jsonGraph = (nodes: unknown[], edges: unknown[], extra: Record<string, unknown> = {}) => ({ nodes, edges, ...extra });

function streamResponse(chunks: Array<string | Uint8Array>): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

test('chunked SSE supports split UTF-8, CRLF, comments, multiline data and the final frame without delimiter', async () => {
  const text = ': heartbeat\r\n\r\n' + frame({ type: 'node', node: n('c0', 'Néphrotique 🧬') }).replace(/\n/g, '\r\n') +
    'data: {"type":"edges",\r\ndata: "edges":[]}\r\n\r\n' + 'data: {"type":"complete","research_status":"complete"}';
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < bytes.length; index += 3) chunks.push(bytes.slice(index, index + 3));
  const events: Record<string, unknown>[] = [];
  await readResearchResponse(streamResponse(chunks), event => events.push(event));
  assert.deepEqual(events.map(event => event.type), ['node', 'edges', 'complete']);
  assert.equal((events[0].node as { label: string }).label, 'Néphrotique 🧬');
});

test('edges received before nodes stay pending and resolve only when both actual endpoints arrive', () => {
  const page = new ResearchPageAccumulator(empty(), 'page');
  page.accept({ type: 'edges', edges: [e('c0', 'c1')] });
  assert.equal(page.snapshot().knowledge_graph.edges.length, 0);
  page.accept({ type: 'node', node: n('c0', 'Condition', 'PATHOLOGY', { is_root: true }) });
  assert.equal(page.snapshot().knowledge_graph.edges.length, 0);
  page.accept({ type: 'node', node: n('c1', 'Manifestation', 'SYMPTOM') });
  const graph = normalizeKnowledgeGraph(page.snapshot());
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].source, 'page:c0');
  assert.equal(graph.edges[0].target, 'page:c1');
  assert.equal(graph.diagnostics.danglingEdges.length, 0);
});

test('a streamed root enriches its placeholder without a duplicate and related pathologies are not roots', () => {
  const base = asResearchGraph({ nodes: [n('query-0', 'Condition', 'PATHOLOGY', { is_root: true, ring: 0 })], edges: [] });
  const page = new ResearchPageAccumulator(base, 'initial');
  page.accept({ type: 'node', node: n('c0', 'Condition', 'PATHOLOGY', { canonical_id: 'local:condition', is_root: true }) });
  page.accept({ type: 'node', node: n('c1', 'Other disease') });
  page.accept({ type: 'edges', edges: [e('c0', 'c1')] });
  const graph = normalizeKnowledgeGraph(page.snapshot());
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.nodes[0].id, 'query-0');
  assert.equal(graph.nodes[0].canonical_id, 'local:condition');
  assert.deepEqual(graph.root_ids, ['query-0']);
  assert.equal(graph.edges[0].source, 'query-0');
});

test('independent pages can reuse c0 and c1 without cross-connecting unrelated concepts', () => {
  const first = new ResearchPageAccumulator(empty(), 'first');
  first.accept(jsonGraph([n('c0', 'A'), n('c1', 'A symptom', 'SYMPTOM')], [e('c0', 'c1')]));
  const second = new ResearchPageAccumulator(first.snapshot(true), 'second');
  second.accept(jsonGraph([n('c0', 'B'), n('c1', 'B symptom', 'SYMPTOM')], [e('c0', 'c1')]));
  const graph = normalizeKnowledgeGraph(second.snapshot(true));
  assert.equal(graph.nodes.length, 4);
  assert.deepEqual(graph.edges.map(edge => [edge.source, edge.target]), [['first:c0', 'first:c1'], ['second:c0', 'second:c1']]);
});

test('expansion retains a gene and its protein as separate entities despite identical labels', () => {
  const base = asResearchGraph({ nodes: [n('gene', 'NPHS1', 'GENE', { canonical_id: 'gene:NPHS1' })], edges: [] });
  const page = new ResearchPageAccumulator(base, 'expand', 'gene');
  page.accept(jsonGraph([n('c0', 'NPHS1', 'GENE', { canonical_id: 'gene:NPHS1', ring: 0 }),
    n('c1', 'NPHS1', 'PROTEIN', { canonical_id: 'protein:NPHS1' })], [e('c0', 'c1', { edge_type: 'ENCODES' })]));
  const graph = normalizeKnowledgeGraph(page.snapshot(true));
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.nodes.map(node => node.entity_kind), ['gene', 'protein']);
  assert.equal(graph.edges[0].source, 'gene');
  assert.equal(graph.edges[0].target, 'expand:c1');
  assert.deepEqual(graph.root_ids, []);
});

test('edge qualification, exact references, source records and research limitations survive streaming', () => {
  const page = new ResearchPageAccumulator(empty(), 'page');
  page.accept(jsonGraph([n('a', 'A'), n('b', 'B')], [e('a', 'b', {
    context: { species: 'human' }, qualifier: 'research', evidence: { status: 'hypothesis', sources: [reference] },
  })]));
  const status = { source: 'PubMed', status: 'available', count: 1, records: [reference], detail: 'Notice consultée.' };
  page.accept({ type: 'complete', source_statuses: [status], research_status: 'partial', research_summary: 'Synthèse limitée.', limitations: ['Résumé seul.'] });
  const result = page.snapshot(true);
  const edge = normalizeKnowledgeGraph(result).edges[0];
  assert.equal(edge.qualifier, 'research');
  assert.equal(edge.evidence.sources[0].content_level, 'abstract');
  assert.deepEqual(edge.context, { species: 'human' });
  assert.deepEqual(result.research.source_statuses[0], status);
  assert.equal(result.research.status, 'partial');
  assert.equal(result.research.summary, 'Synthèse limitée.');
  assert.ok(result.research.limitations.includes('Résumé seul.'));
});

test('an EOF without complete remains partial while retaining all received concepts and edges', async () => {
  const page = new ResearchPageAccumulator(empty(), 'partial');
  await readResearchResponse(streamResponse([frame({ type: 'node', node: n('a', 'A') }),
    frame({ type: 'node', node: n('b', 'B') }), frame({ type: 'edges', edges: [e('a', 'b')] })]), event => page.accept(event));
  const result = page.snapshot(true);
  assert.equal(result.research.status, 'partial');
  assert.equal(result.knowledge_graph.nodes.length, 2);
  assert.equal(result.knowledge_graph.edges.length, 1);
  assert.ok(result.research.limitations.some(value => /interrompue/.test(value)));
});

test('stream errors preserve delivered data and propagate their actual message', async () => {
  const page = new ResearchPageAccumulator(empty(), 'failure');
  await assert.rejects(readResearchResponse(streamResponse([frame({ type: 'node', node: n('a', 'A') }),
    frame({ type: 'error', message: 'Source en échec.' })]), event => page.accept(event)), /Source en échec/);
  assert.equal(page.snapshot(true).knowledge_graph.nodes.length, 1);
  assert.equal(page.snapshot(true).research.status, 'partial');
});

test('a truncated final JSON frame fails explicitly instead of producing a completed graph', async () => {
  const page = new ResearchPageAccumulator(empty(), 'broken');
  await assert.rejects(readResearchResponse(streamResponse([frame({ type: 'node', node: n('a', 'A') }),
    'data: {"type":"complete",']), event => page.accept(event)), /incomplète|illisible/);
  assert.equal(page.snapshot(true).knowledge_graph.nodes.length, 1);
  assert.equal(page.snapshot(true).research.status, 'partial');
});

test('JSON responses support flat and nested graph payloads', async () => {
  for (const payload of [jsonGraph([n('a', 'A'), n('b', 'B')], [e('a', 'b')]),
    { knowledge_graph: jsonGraph([n('a', 'A'), n('b', 'B')], [e('a', 'b')]) }]) {
    const page = new ResearchPageAccumulator(empty(), 'json');
    await readResearchResponse(Response.json(payload), event => page.accept(event));
    const result = page.snapshot(true);
    assert.equal(result.research.status, 'complete');
    assert.equal(result.knowledge_graph.edges.length, 1);
  }
});

test('JSON graph imports retain database endpoint field names', async () => {
  const page = new ResearchPageAccumulator(empty(), 'db');
  await readResearchResponse(Response.json({ nodes: [n('a', 'A'), n('b', 'B')], edges: [
    { source_node_id: 'a', target_node_id: 'b', relationship_type: 'ASSOCIATED_WITH' },
  ] }), event => page.accept(event));
  const graph = normalizeKnowledgeGraph(page.snapshot(true));
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].source, 'db:a');
  assert.equal(graph.edges[0].target, 'db:b');
});

test('malformed JSON graph shapes and API error objects are rejected', async () => {
  for (const payload of [{ nodes: {}, edges: [] }, { nodes: [], edges: {} }, { knowledge_graph: { nodes: {}, edges: [] } }]) {
    await assert.rejects(readResearchResponse(Response.json(payload), () => assert.fail('Invalid graph accepted')), /graphe exploitable/);
  }
  await assert.rejects(readResearchResponse(Response.json({ error: 'Budget dépassé.' }), () => assert.fail('Error object accepted')), /Budget dépassé/);
  await assert.rejects(readResearchResponse(Response.json({ error: 'Non autorisé.' }, { status: 401 }), () => assert.fail('HTTP error accepted')), /Non autorisé/);
});

test('asResearchGraph migrates top-level result provenance and availability status', () => {
  const status = { source: 'PubMed', status: 'unavailable', count: 0, detail: 'HTTP 429.' };
  const result = asResearchGraph({ nodes: [n('a', 'A')], edges: [], research_status: 'unavailable',
    source_statuses: [status], research_summary: 'Sources indisponibles.', limitations: ['Échec de collecte.'], exploration: { exhausted: false } });
  assert.equal(result.research.status, 'unavailable');
  assert.deepEqual(result.research.source_statuses, [status]);
  assert.equal(result.research.summary, 'Sources indisponibles.');
  assert.deepEqual(result.research.limitations, ['Échec de collecte.']);
  assert.deepEqual(result.research.exploration, { exhausted: false });
});

test('saved nested research status is preserved when replayed as JSON', async () => {
  const saved = asResearchGraph({ nodes: [n('a', 'A')], edges: [], research: { status: 'partial',
    limitations: ['Étude manquante.'], summary: 'Résultat incomplet.' } });
  const page = new ResearchPageAccumulator(empty(), 'saved');
  await readResearchResponse(Response.json(saved), event => page.accept(event));
  const result = page.snapshot(true);
  assert.equal(result.research.status, 'partial');
  assert.ok(result.research.limitations.includes('Étude manquante.'));
});

test('local model envelopes cannot override partial status or invent consulted sources through nested metadata', () => {
  for (const type of [undefined, 'complete', 'graph', 'cached', 'node', 'sources', 'error']) {
    const forged = { source: 'PubMed', status: 'available', count: 99, records: [reference] };
    const event = createLocalResearchEvent({ nodes: [n('a', 'A'), n('b', 'B')], edges: [e('a', 'b')], type,
      research_summary: 'Proposition locale à vérifier.', research_status: 'complete', source_statuses: [forged],
      research: { status: 'complete', source_statuses: [forged], summary: 'Sources prétendument consultées.', limitations: [], exploration: { exhaustive: true } },
      knowledge_graph: { nodes: [n('hidden', 'Injected')], edges: [], research_status: 'complete', references: [reference] },
      references: [reference], micro_signals: [{ confidence: 1 }], hypotheses: [{ evidence: reference }],
      schema_version: 99, knowledge_scope: 'patient', exploration: { exhaustive: true }, limitations: [],
    });
    assert.deepEqual(Object.keys(event).sort(), ['edges', 'exploration', 'knowledge_scope', 'limitations', 'nodes',
      'research_status', 'research_summary', 'schema_version', 'source_statuses']);
    const page = new ResearchPageAccumulator(empty(), 'local');
    page.accept(event);
    const result = page.snapshot(true);
    assert.equal(result.research.status, 'partial', String(type));
    assert.deepEqual(result.research.source_statuses, [{ source: 'Références externes', status: 'skipped', count: 0 }]);
    assert.equal(result.research.summary, 'Proposition locale à vérifier.');
    assert.equal(result.research.exploration?.exhaustive, false);
    assert.ok(result.research.limitations.some(value => /modèle local/.test(value)));
    assert.equal(result.knowledge_graph.nodes.length, 2);
    assert.equal(result.knowledge_graph.edges.length, 1);
    assert.equal(asResearchGraph(event).research.status, 'partial');
  }
});

test('local concepts and edges cannot smuggle provenance through alternate fields or bibliographic nodes', () => {
  const forged = { ...reference, id: 'FORGED_PROVENANCE', title: 'FORGED_PROVENANCE', url: 'https://example.org/FORGED_PROVENANCE' };
  const claims = { evidence_grade: 'A', verification_status: 'verified', references: [forged], sources: [forged], citations: [forged], refs: [forged],
    evidence: { status: 'supported', sources: [forged] }, evidence_items: [{ status: 'supported', references: [forged] }],
    properties: { source: forged, references: [forged], evidence: { status: 'supported', sources: [forged] }, url: forged.url },
    metadata_conflicts: { references: [forged] }, unparsed_fields: { evidence: forged },
    research: { source_statuses: [forged] }, knowledge_graph: { references: [forged] },
    url: forged.url, doi: '10.1234/FORGED_PROVENANCE', pmid: '99999', source_url: forged.url, source: forged };
  const event = createLocalResearchEvent({ nodes: [
    n('gene', 'NPHS1', 'GENE', { ...claims, canonical_id: 'local:gene:nphs1', family: 'mechanisms', description: 'Proposition de mécanisme.', aliases: ['alias', forged] }),
    n('protein', 'NPHS1', 'PROTEIN', { ...claims, canonical_id: 'local:protein:nphs1', family: 'research' }),
    n('reference', 'FORGED_PROVENANCE', 'REFERENCE', claims),
  ], edges: [e('gene', 'protein', { ...claims, source: { id: 'gene', references: [forged] }, target: { id: 'protein', evidence: forged },
    edge_type: 'ENCODES', qualifier: 'established', evidence_qualifier: 'established', direction: 'directed', polarity: 'supports',
    context: { species: 'human', references: [forged] }, rationale: 'Proposition locale.' })] });
  assert.doesNotMatch(JSON.stringify(event), /FORGED_PROVENANCE/);
  const page = new ResearchPageAccumulator(empty(), 'local'); page.accept(event);
  const graph = normalizeKnowledgeGraph(page.snapshot(true));
  assert.equal(graph.nodes.length, 2);
  assert.deepEqual(graph.nodes.map(node => [node.entity_kind, node.family]), [['gene', 'mechanisms'], ['protein', 'research']]);
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(graph.nodes.map(node => node.references), [[], []]);
  assert.deepEqual(graph.references, []);
  assert.deepEqual(graph.nodes.map(node => node.evidence_grade), ['D', 'D']);
  assert.deepEqual(graph.nodes[0].aliases, ['alias']);
  const edge = graph.edges[0];
  assert.equal(edge.relationship, 'ENCODES');
  assert.equal(edge.direction, 'directed');
  assert.equal(edge.rationale, 'Proposition locale.');
  assert.equal(edge.qualifier, 'unverified');
  assert.equal(edge.evidence.status, 'unavailable');
  assert.equal(edge.evidence_grade, 'D');
  assert.equal(edge.polarity, 'unknown');
  assert.deepEqual(edge.evidence.sources, []);
  assert.ok(edge.evidence_items.every(item => item.status === 'unavailable' && item.sources.length === 0));
  assert.doesNotMatch(JSON.stringify(graph), /FORGED_PROVENANCE/);
});

test('local expansion retains previously consulted provenance without accepting new source claims', () => {
  const previous = { source: 'PubMed', status: 'available', count: 1, records: [reference] };
  const base = asResearchGraph({ nodes: [n('a', 'A', 'PATHOLOGY', { is_root: true, references: [reference] }), n('b', 'B')],
    edges: [e('a', 'b')], source_statuses: [previous] });
  const page = new ResearchPageAccumulator(base, 'local', 'a');
  page.accept(createLocalResearchEvent({ nodes: [n('c', 'C')], edges: [e('a', 'c', { qualifier: 'established' })],
    research: { status: 'complete', source_statuses: [{ source: 'PubMed', status: 'available', count: 99 }] } }));
  const result = page.snapshot(true);
  assert.equal(result.research.status, 'partial');
  assert.deepEqual(result.research.source_statuses.find(status => status.source === 'PubMed'), previous);
  assert.equal(result.knowledge_graph.nodes.find(node => node.id === 'a')?.references[0].url, reference.url);
  assert.equal(result.knowledge_graph.edges.find(edge => edge.target === 'b')?.qualifier, 'association');
  assert.equal(result.knowledge_graph.edges.find(edge => edge.target === 'local:c')?.qualifier, 'unverified');
});

test('local mode rejects malformed or exclusively nested graphs and ignores non-string summaries', () => {
  for (const payload of [null, { nodes: {}, edges: [] }, { nodes: [], edges: {} }, { knowledge_graph: { nodes: [], edges: [] } }]) {
    assert.throws(() => createLocalResearchEvent(payload), /modèle local.*graphe exploitable/);
  }
  const event = createLocalResearchEvent({ nodes: [], edges: [], research_summary: { sources: [reference] } });
  assert.equal(event.research_summary, '');
});

test('ambiguous page IDs never fall back to the first concept and cannot reactivate on repeated events', () => {
  const page = new ResearchPageAccumulator(empty(), 'ambiguous');
  page.accept({ type: 'node', node: n('c0', 'Root') });
  page.accept({ type: 'node', node: n('c1', 'NPHS1', 'GENE') });
  page.accept({ type: 'node', node: n('c1', 'NPHS1', 'PROTEIN') });
  page.accept({ type: 'node', node: n('c1', 'NPHS1', 'GENE') });
  page.accept({ type: 'edges', edges: [e('c0', 'c1')] });
  const result = page.snapshot(true);
  assert.equal(result.knowledge_graph.edges.length, 0);
  assert.ok(result.research.limitations.some(value => /ambigu/.test(value)));
});

test('same page ID with incompatible canonical identities remains ambiguous', () => {
  const page = new ResearchPageAccumulator(empty(), 'canonical');
  page.accept({ type: 'node', node: n('root', 'Root') });
  page.accept({ type: 'node', node: n('x', 'Shared name', 'PATHOLOGY', { canonical_id: 'a' }) });
  page.accept({ type: 'node', node: n('x', 'Shared name', 'PATHOLOGY', { canonical_id: 'b' }) });
  page.accept({ type: 'edges', edges: [e('root', 'x')] });
  assert.equal(page.snapshot(true).knowledge_graph.edges.length, 0);
});

test('pre-aborted JSON and in-flight SSE cancellation reject with AbortError', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(readResearchResponse(Response.json({ nodes: [], edges: [] }), () => assert.fail('Event after cancellation'), before.signal), { name: 'AbortError' });
  const during = new AbortController();
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }),
    { headers: { 'content-type': 'text/event-stream' } });
  const pending = readResearchResponse(response, () => assert.fail('Event after cancellation'), during.signal);
  during.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cancelled, true);
});

test('an invalid stream cancels the observer instead of leaving an unread live response', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: invalid-json\n\n')); },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(readResearchResponse(response, () => assert.fail('Invalid event accepted')), /illisible/);
  assert.equal(cancelled, true);
});
