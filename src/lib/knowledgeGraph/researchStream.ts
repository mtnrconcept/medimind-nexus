import type { RadialRingsData } from '../../types/graph';
import { normalizeGraphSearch, normalizeKnowledgeGraph, normalizeKnowledgeNode, type KnowledgeGraphModel, type KnowledgeNode } from './model';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const endpoint = (value: unknown): string => typeof value === 'string' ? value : typeof object(value).id === 'string' ? object(value).id as string : '';

export interface ResearchSourceStatus {
  source: string;
  status: string;
  count: number;
  detail?: string;
  [key: string]: unknown;
}

function sourceStatuses(value: unknown): ResearchSourceStatus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(value => {
    const raw = object(value);
    if (typeof raw.source !== 'string' || typeof raw.status !== 'string') return [];
    const result: ResearchSourceStatus = { ...raw, source: raw.source, status: raw.status,
      count: typeof raw.count === 'number' && Number.isFinite(raw.count) && raw.count >= 0 ? raw.count : 0 };
    if (typeof raw.detail !== 'string') delete result.detail;
    return [result];
  });
}

function metadataFrom(value: JsonObject): JsonObject {
  const nested = object(value.research);
  return { ...value,
    ...(nested.status !== undefined ? { research_status: nested.status } : {}),
    ...(nested.source_statuses !== undefined ? { source_statuses: nested.source_statuses } : {}),
    ...(nested.limitations !== undefined ? { limitations: nested.limitations } : {}),
    ...(nested.summary !== undefined ? { research_summary: nested.summary } : {}),
    ...(nested.exploration !== undefined ? { exploration: nested.exploration } : {}),
  };
}

export interface ResearchGraphData extends RadialRingsData {
  schema_version: 2;
  knowledge_scope: 'general';
  knowledge_graph: KnowledgeGraphModel;
  research: {
    status: 'loading' | 'complete' | 'partial' | 'unavailable';
    source_statuses: ResearchSourceStatus[];
    limitations: string[];
    summary: string;
    exploration?: JsonObject;
  };
}

export function asResearchGraph(input: unknown): ResearchGraphData {
  const envelope = object(input);
  const graph = normalizeKnowledgeGraph(input);
  const metadata = metadataFrom({ ...graph, ...envelope });
  return { ...envelope, schema_version: 2, knowledge_scope: 'general', knowledge_graph: graph,
    micro_signals: Array.isArray(envelope.micro_signals) ? envelope.micro_signals : [],
    hypotheses: Array.isArray(envelope.hypotheses) ? envelope.hypotheses : [],
    research: {
      status: ['complete', 'partial', 'unavailable', 'loading'].includes(String(metadata.research_status)) ? metadata.research_status as ResearchGraphData['research']['status'] : 'complete',
      source_statuses: sourceStatuses(metadata.source_statuses),
      limitations: Array.isArray(metadata.limitations) ? metadata.limitations.filter((x): x is string => typeof x === 'string') : [],
      summary: typeof metadata.research_summary === 'string' ? metadata.research_summary : '',
      ...(metadata.exploration ? { exploration: object(metadata.exploration) } : {}),
    } };
}

const localText = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const localStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const localNumber = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const bibliographicKinds = new Set(['reference', 'publication', 'citation', 'source', 'paper', 'article', 'evidence', 'guideline', 'report', 'trial']);

function localContext(value: unknown): string | JsonObject | undefined {
  if (typeof value === 'string') return value;
  const raw = object(value);
  const context: JsonObject = {};
  for (const key of ['species', 'population', 'setting', 'condition', 'indication', 'dose', 'timing']) {
    const item = raw[key];
    if (typeof item === 'string' || typeof item === 'boolean' || localNumber(item) !== undefined) context[key] = item;
  }
  return Object.keys(context).length ? context : undefined;
}

/** Local generation supplies proposed concepts and topology, never consulted-source metadata. */
export function createLocalResearchEvent(input: unknown): JsonObject {
  const response = object(input);
  if (!Array.isArray(response.nodes) || !Array.isArray(response.edges)) throw new Error('Le modèle local n’a pas retourné de graphe exploitable.');
  // Build every object from allowed primitive fields: neither nested envelopes nor alternate
  // reference fields may reach the lossless normalizer and become saved provenance later.
  const nodes = response.nodes.flatMap(value => {
    const raw = object(value), properties = object(raw.properties);
    const node = normalizeKnowledgeNode({
      id: localText(raw.id ?? raw.node_id ?? raw.canonical_id),
      name: localText(raw.name ?? raw.label ?? raw.preferred_label),
      node_type: localText(raw.node_type), entity_kind: localText(raw.entity_kind ?? properties.entity_kind ?? raw.node_type ?? raw.lane),
      canonical_id: localText(raw.canonical_id), family: localText(raw.family ?? properties.family),
      description: localText(raw.description ?? properties.description), aliases: localStrings(raw.aliases ?? properties.aliases),
      parent_pathology: localText(raw.parent_pathology), parent_pathologies: localStrings(raw.parent_pathologies),
      ring: localNumber(raw.ring), weight: localNumber(raw.weight), proximity_score: localNumber(raw.proximity_score),
      ...(typeof raw.is_root === 'boolean' ? { is_root: raw.is_root } : {}),
      source: 'Modèle local', evidence_grade: 'D',
    });
    // Bibliographic nodes would otherwise migrate into references, even with no URL.
    if (!node || bibliographicKinds.has(node.entity_kind) || /^(?:https?:\/\/|PMID[:\s]|doi[:\s]|NCT\d{8}\b)/i.test(node.name)) return [];
    return [node];
  });
  const edges = response.edges.map(value => {
    const raw = object(value);
    return {
      id: localText(raw.id), source: endpoint(raw.source ?? raw.source_id ?? raw.source_node_id),
      target: endpoint(raw.target ?? raw.target_id ?? raw.target_node_id),
      relationship: localText(raw.relationship ?? raw.edge_type ?? raw.relationship_type) ?? 'UNSPECIFIED',
      direction: raw.direction === 'undirected' || raw.directed === false ? 'undirected' : 'directed',
      weight: localNumber(raw.weight), rationale: localText(raw.rationale), context: localContext(raw.context),
      qualifier: 'unverified', polarity: 'unknown', evidence_grade: 'D',
      evidence: { status: 'unavailable', sources: [], limitations: ['Références non consultées par le modèle local.'] },
    };
  });
  return { schema_version: 2, knowledge_scope: 'general', nodes, edges,
    research_summary: localText(response.research_summary) ?? '', research_status: 'partial',
    source_statuses: [{ source: 'Références externes', status: 'skipped', count: 0 }],
    limitations: ['Graphe proposé par le modèle local : chaque relation reste à vérifier.',
      ...(nodes.length < response.nodes.length ? ['Des entrées invalides ou bibliographiques proposées par le modèle local ont été écartées.'] : [])],
    exploration: { exhaustive: false },
  };
}

/** Page-local IDs are scoped before merging. Names only identify the explicitly requested centre. */
export class ResearchPageAccumulator {
  private base: ResearchGraphData;
  private nodes: JsonObject[] = [];
  private edges: JsonObject[] = [];
  private ids = new Map<string, string>();
  private rawNodes = new Map<string, KnowledgeNode>();
  private ambiguousIds = new Set<string>();
  private metadata: JsonObject = {};
  private completed = false;
  private existing: KnowledgeNode[];

  constructor(base: unknown, private scope: string, private focusNodeId?: string) {
    this.base = asResearchGraph(base);
    this.existing = normalizeKnowledgeGraph(this.base).nodes;
  }

  accept(event: JsonObject): void {
    const type = event.type;
    if (type === 'node') this.addNode(event.node);
    if (type === 'cached' || type === 'graph' || (!type && Array.isArray(event.nodes))) {
      if (Array.isArray(event.nodes)) event.nodes.forEach(node => this.addNode(node));
      if (Array.isArray(event.edges)) this.edges.push(...event.edges.map(object));
    }
    if (type === 'edges' && Array.isArray(event.edges)) this.edges.push(...event.edges.map(object));
    if (type === 'complete' || type === 'sources' || type === 'cached' || type === 'graph' || !type) this.metadata = { ...this.metadata, ...metadataFrom(event) };
    if (type === 'complete' || (!type && Array.isArray(event.nodes))) this.completed = true;
    if (type === 'error') {
      this.completed = false;
      this.metadata = { ...this.metadata, research_status: 'partial' };
    }
  }

  private addNode(value: unknown): void {
    const raw = object(value), normalized = normalizeKnowledgeNode(value);
    if (!normalized) return;
    const previous = this.rawNodes.get(normalized.id);
    if (this.ambiguousIds.has(normalized.id) || (previous && (previous.entity_kind !== normalized.entity_kind ||
      normalizeGraphSearch(previous.name) !== normalizeGraphSearch(normalized.name) ||
      (previous.canonical_id && normalized.canonical_id && previous.canonical_id !== normalized.canonical_id)))) {
      // An ambiguous upstream ID must not silently redirect a clinical edge.
      this.ambiguousIds.add(normalized.id);
      this.ids.delete(normalized.id);
      this.nodes.push({ ...raw, id: `${this.scope}:${normalized.id}:ambiguous:${this.nodes.length}`, source_ids: [], is_root: false });
      return;
    }
    this.rawNodes.set(normalized.id, normalized);
    const sameCanonical = normalized.canonical_id && this.existing.find(node => node.entity_kind === normalized.entity_kind && node.canonical_id === normalized.canonical_id);
    const explicitCenter = this.existing.find(node => (node.id === this.focusNodeId || node.is_root === true)
      && node.entity_kind === normalized.entity_kind && normalizeGraphSearch(node.name) === normalizeGraphSearch(normalized.name)
      && (!node.canonical_id || !normalized.canonical_id || node.canonical_id === normalized.canonical_id));
    const keeper = sameCanonical || explicitCenter;
    const id = keeper ? keeper.id : `${this.scope}:${normalized.id}`;
    this.ids.set(normalized.id, id);
    // Preserve identities across repeated events while avoiding cross-page c0/c1 collisions.
    this.nodes.push({ ...raw, id, source_ids: [id],
      ...(keeper?.canonical_id ? { canonical_id: keeper.canonical_id } : {}),
      is_root: keeper?.is_root === true || (!this.focusNodeId && normalized.is_root),
      ...(this.focusNodeId && keeper?.id !== this.focusNodeId ? { ring: Math.max(1, normalized.ring) } : {}),
    });
  }

  private resolve(value: unknown): string {
    const id = endpoint(value);
    // The empty ID can never identify a valid normalised node. Do not fall back to the first occurrence.
    if (!id || this.ambiguousIds.has(id)) return '';
    if (this.ids.has(id)) return this.ids.get(id)!;
    const exactId = this.existing.find(node => node.id === id);
    if (exactId) return exactId.id;
    const byName = this.existing.filter(node => normalizeGraphSearch(node.name) === normalizeGraphSearch(id));
    // The API historically references existing_nodes by exact name. Ambiguous names stay unresolved.
    if (byName.length === 1) return byName[0].id;
    if (byName.length > 1) return '';
    return `${this.scope}:${id}`;
  }

  snapshot(final = false): ResearchGraphData {
    const scopedEdges = this.edges.map((edge, index) => ({ ...edge, id: `${this.scope}:${typeof edge.id === 'string' ? edge.id : 'edge-' + index}`,
      source: this.resolve(edge.source ?? edge.source_id ?? edge.source_node_id),
      target: this.resolve(edge.target ?? edge.target_id ?? edge.target_node_id), source_ids: [] }));
    const model = normalizeKnowledgeGraph({ ...this.base.knowledge_graph,
      nodes: [...this.base.knowledge_graph.nodes, ...this.nodes], edges: [...this.base.knowledge_graph.edges, ...scopedEdges] });
    model.diagnostics.ambiguousNodeIds = [...new Set([...model.diagnostics.ambiguousNodeIds, ...[...this.ambiguousIds].map(id => `${this.scope}:${id}`)])];
    const statuses = sourceStatuses(this.metadata.source_statuses);
    const states = new Map(this.base.research.source_statuses.map(status => [status.source, status]));
    for (const status of statuses) states.set(status.source, status);
    const reportedStatus = this.metadata.research_status;
    const status = final || this.completed ? reportedStatus === 'unavailable' ? 'unavailable' : reportedStatus === 'partial' || !this.completed ? 'partial' : 'complete' : 'loading';
    const limitations = [...this.base.research.limitations,
      ...(Array.isArray(this.metadata.limitations) ? this.metadata.limitations.filter((value): value is string => typeof value === 'string') : [])];
    if (final && !this.completed) limitations.push('La réception a été interrompue. Les éléments déjà reçus ont été conservés.');
    if (final && model.diagnostics.danglingEdges.length) limitations.push(`${model.diagnostics.danglingEdges.length} relation(s) ne peuvent être affichées : extrémité absente ou ambiguë.`);
    return { ...this.base, knowledge_graph: model, research: { status,
      source_statuses: [...states.values()], limitations: [...new Set(limitations)],
      summary: typeof this.metadata.research_summary === 'string' ? this.metadata.research_summary : this.base.research.summary,
      ...(this.metadata.exploration ? { exploration: object(this.metadata.exploration) } : this.base.research.exploration ? { exploration: this.base.research.exploration } : {}),
    } };
  }
}

/** Consume chunked SSE (including CRLF and final frames) without losing buffered nodes or metadata. */
export async function readResearchResponse(response: Response, onEvent: (event: JsonObject) => void, signal?: AbortSignal): Promise<void> {
  const checkAborted = () => { if (signal?.aborted) throw new DOMException('Observation interrompue', 'AbortError'); };
  checkAborted();
  if (!response.ok) {
    const details = object(await response.json().catch(() => ({})));
    checkAborted();
    throw new Error(typeof details.error === 'string' ? details.error : `La recherche est indisponible (${response.status}).`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    const json = object(await response.json());
    checkAborted();
    if (typeof json.error === 'string') throw new Error(json.error);
    const graph = { ...json, ...object(json.knowledge_graph) };
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Le résultat ne contient pas de graphe exploitable.');
    onEvent({ ...graph, type: undefined });
    return;
  }
  if (!response.body) throw new Error('Le flux de recherche est vide.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  const processFrame = (frame: string) => {
    const payload = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!payload || payload === '[DONE]') return;
    let event: JsonObject;
    try { event = object(JSON.parse(payload)); } catch { throw new Error('Une réponse de recherche est incomplète ou illisible.'); }
    if (event.type === 'error') {
      onEvent(event);
      throw new Error(typeof event.message === 'string' ? event.message : typeof event.error === 'string' ? event.error : 'La recherche a été interrompue.');
    }
    onEvent(event);
  };
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      checkAborted();
      const { done, value } = await reader.read();
      checkAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 8_000_000) throw new Error('Le flux dépasse la taille maximale prise en charge.');
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        processFrame(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (done) { if (buffer.trim()) processFrame(buffer); break; }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
}
