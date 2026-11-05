/** Limits apply to serialized JSON characters, including escaping. Every omitted
 * record or shortened field is reported; client evidence is never re-labelled as verified. */
export const GRAPH_CHAT_CONTEXT_LIMITS = {
  characters: 200_000,
  messageCharacters: 12_000,
  nodes: 1_000,
  edges: 3_000,
  nodeCharacters: 60_000,
  edgeCharacters: 74_000,
  historyMessages: 12,
} as const;

type Data = Record<string, unknown>;
const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const boolean = (value: unknown) => typeof value === 'boolean' ? value : undefined;

export function buildGraphChatContext(value: unknown) {
  const input = object(value), graph = object(input.graphState), research = object(input.researchCoverage);
  let shortenedFields = 0, omittedItems = 0;
  function text(value: unknown, budget: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    if (value.length <= budget && JSON.stringify(value).length <= budget) return value;
    shortenedFields++;
    let low = 0, high = Math.min(value.length, budget);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (JSON.stringify(value.slice(0, middle) + '…').length <= budget) low = middle;
      else high = middle - 1;
    }
    return value.slice(0, low) + '…';
  }
  function exact(value: unknown, budget: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    if (value.length <= budget && JSON.stringify(value).length <= budget) return value;
    shortenedFields++;
    return undefined; // Do not fabricate a shortened identifier or source URL.
  }
  function list<T>(value: unknown, count: number, budget: number, normalize: (item: unknown) => T): T[] {
    const items = array(value), result: T[] = [];
    let used = 2;
    for (let index = 0; index < Math.min(items.length, count); index++) {
      const item = normalize(items[index]);
      const cost = JSON.stringify(item).length + 1;
      if (used + cost > budget) break;
      result.push(item); used += cost;
    }
    omittedItems += items.length - result.length;
    return result;
  }
  function reference(value: unknown): Data {
    const item = object(value);
    return { id: exact(item.id, 300), title: text(item.title, 1_000), url: exact(item.url, 2_000),
      abstract: text(item.abstract, 3_000), journal: text(item.journal, 300), year: text(item.year, 20) ?? number(item.year),
      pmid: exact(item.pmid, 40), doi: exact(item.doi, 500), abstract_truncated: boolean(item.abstract_truncated),
      publication_types: list(item.publication_types, 12, 1_000, entry => text(entry, 150) ?? '') };
  }
  function node(value: unknown): Data {
    const item = object(value), properties = object(item.properties);
    return { id: exact(item.id, 300), name: text(item.name ?? item.label, 500),
      node_type: text(item.node_type ?? item.type, 100), ring: number(item.ring),
      parent_pathology: text(item.parent_pathology, 500),
      description: text(item.description ?? properties.description, 6_000),
      source: text(item.source ?? properties.source, 500),
      evidence_grade: text(item.evidence_grade, 50), evidence_status: text(item.evidence_status, 100),
      translation_gap: boolean(item.translation_gap),
      references: list(item.references ?? properties.references, 12, 8_000, reference) };
  }
  function edge(value: unknown): Data {
    const item = object(value);
    return { id: exact(item.id, 300), source: exact(item.source ?? item.source_id, 300),
      target: exact(item.target ?? item.target_id, 300), relationship: text(item.relationship ?? item.edge_type, 200),
      rationale: text(item.rationale, 6_000), description: text(item.description, 3_000), weight: number(item.weight),
      evidence_grade: text(item.evidence_grade, 50), evidence_status: text(item.evidence_status, 100),
      translation_gap: boolean(item.translation_gap), references: list(item.references, 12, 8_000, reference) };
  }
  // Keep source availability separate from the references attached to each relation.
  const rawStatuses = research.source_statuses;
  const sourceEntries: Array<{ topic?: string; value: unknown }> = [];
  let providedStatuses = 0;
  if (Array.isArray(rawStatuses)) {
    providedStatuses = rawStatuses.length;
    sourceEntries.push(...rawStatuses.slice(0, 200).map(value => ({ value })));
  } else {
    const groups = Object.entries(object(rawStatuses));
    for (const [topic, values] of groups) {
      providedStatuses += array(values).length;
      if (sourceEntries.length < 200) sourceEntries.push(...array(values).slice(0, 200 - sourceEntries.length).map(value => ({ topic, value })));
    }
  }
  omittedItems += providedStatuses - sourceEntries.length;
  const sourceStatuses = list(sourceEntries, 200, 5_500, entry => {
    const { topic, value } = entry as { topic?: string; value: unknown }, status = object(value);
    return { topic: text(topic, 300), source: text(status.source, 300), status: text(status.status, 80),
      count: number(status.count), detail: text(status.detail, 1_500) };
  });
  const limitations = list(input.researchLimitations, 50, 4_000, entry => text(entry, 1_000) ?? '');
  const questions = list(research.unresolved_questions, 30, 1_500, entry => text(entry, 800) ?? '');
  const references = list(input.references, 20, 8_000, reference);
  const history = array(input.conversationHistory);
  omittedItems += Math.max(0, history.length - GRAPH_CHAT_CONTEXT_LIMITS.historyMessages);
  const conversationHistory = list(history.slice(-GRAPH_CHAT_CONTEXT_LIMITS.historyMessages).reverse(), GRAPH_CHAT_CONTEXT_LIMITS.historyMessages, 8_000, value => {
    const item = object(value);
    return { role: item.role === 'assistant' ? 'assistant' : 'user', content: text(item.content, 2_000) };
  }).reverse();
  const nodes = list(graph.nodes, GRAPH_CHAT_CONTEXT_LIMITS.nodes, GRAPH_CHAT_CONTEXT_LIMITS.nodeCharacters, node);
  const edges = list(graph.edges, GRAPH_CHAT_CONTEXT_LIMITS.edges, GRAPH_CHAT_CONTEXT_LIMITS.edgeCharacters, edge);
  const details = {
    analysisContent: text(input.analysisContent, 24_000), rationale: text(input.rationale, 6_000),
    pathology: text(input.pathology, 500), sourceNode: text(input.sourceNode, 500), targetNode: text(input.targetNode, 500),
    references, researchLimitations: limitations,
    researchCoverage: { result_status: text(research.result_status, 64), source_statuses: sourceStatuses, unresolved_questions: questions },
    graphState: { nodes, edges }, conversationHistory,
  };
  return {
    ...details,
    sourceTrust: 'client_supplied_not_independently_verified',
    coverage: {
      partial: shortenedFields > 0 || omittedItems > 0,
      nodes: { provided: array(graph.nodes).length, included: nodes.length },
      edges: { provided: array(graph.edges).length, included: edges.length },
      shortenedFields, omittedItems, limits: GRAPH_CHAT_CONTEXT_LIMITS,
    },
  };
}
