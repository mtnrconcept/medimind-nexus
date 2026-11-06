import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeKnowledgeGraph } from '../src/lib/knowledgeGraph/model.ts';
import { asResearchGraph, readResearchResponse, ResearchPageAccumulator } from '../src/lib/knowledgeGraph/researchStream.ts';

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
