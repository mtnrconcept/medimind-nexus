import type {
  EdgeQualifier, EvidencePolarity, EvidenceStatus, GraphDiagnostics, GraphEvidence,
  GraphFamily, GraphReference, KnowledgeEdge, KnowledgeGraphModel, KnowledgeNode,
} from '../../types/graph';

export type {
  EdgeQualifier, EvidencePolarity, EvidenceStatus, GraphDiagnostics, GraphEvidence,
  GraphFamily, GraphReference, KnowledgeEdge, KnowledgeGraphModel, KnowledgeNode,
} from '../../types/graph';

export const GRAPH_FAMILIES: ReadonlyArray<{ id: GraphFamily; label: string; color: string }> = [
  { id: 'anatomy', label: 'Anatomie', color: '#16dce2' },
  { id: 'pathologies', label: 'Causes et pathologies', color: '#ff7b87' },
  { id: 'manifestations', label: 'Manifestations', color: '#f5d34f' },
  { id: 'treatments', label: 'Traitements', color: '#4ddd65' },
  { id: 'genetics', label: 'Génétique', color: '#ad7af5' },
  { id: 'molecules', label: 'Molécules et immunité', color: '#9974ed' },
  { id: 'complications', label: 'Complications', color: '#ff9a35' },
  { id: 'examinations', label: 'Examens et suivi', color: '#18d6f0' },
  { id: 'interactions', label: 'Interactions', color: '#f17bb7' },
  { id: 'research', label: 'Recherche et associations', color: '#bc91f3' },
  { id: 'mechanisms', label: 'Mécanismes', color: '#369cfa' },
  { id: 'daily_life', label: 'Vie quotidienne', color: '#72b8fc' },
];

const familyIds = new Set<string>(GRAPH_FAMILIES.map(f => f.id));
const qualifiers = new Set<EdgeQualifier>(['established', 'association', 'research', 'unverified']);
const statuses = new Set<EvidenceStatus>(['supported', 'limited', 'hypothesis', 'conflicting', 'unavailable']);
const polarities = new Set<EvidencePolarity>(['supports', 'contradicts', 'mixed', 'unknown']);
type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function list(value: unknown): unknown[] { return Array.isArray(value) ? value : value == null ? [] : [value]; }
function strings(value: unknown): string[] { return unique(list(value).map(text).filter((v): v is string => !!v)); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function finite(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

function keepDisplayText(target: RecordValue, keys: string[]): void {
  const unparsed = new Map(Object.entries(record(target.unparsed_fields)));
  for (const key of keys) {
    const normalized = text(target[key]);
    if (normalized) target[key] = normalized;
    else if (target[key] !== undefined) { unparsed.set(key, target[key]); delete target[key]; }
  }
  if (unparsed.size) target.unparsed_fields = Object.fromEntries(unparsed);
}

export function normalizeGraphSearch(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

function token(value: unknown): string {
  return normalizeGraphSearch(text(value) ?? '').replace(/[\s-]+/g, '_');
}

/** Stable local identity only; it does not claim to be an ontology identifier. */
function hash(value: string): string {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0).toString(36);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(record(value)[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

function safeUrl(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

function doi(value: unknown): string | undefined {
  const candidate = text(value)?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  return candidate && /^10\.\d{4,9}\/[^\s<>]+$/i.test(candidate) ? candidate.toLowerCase() : undefined;
}

function pmid(value: unknown): string | undefined {
  const candidate = text(value)?.replace(/^pmid:\s*/i, '').replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?$/i, '$1');
  return candidate && /^\d{1,10}$/.test(candidate) ? candidate : undefined;
}

export function normalizeGraphReference(value: unknown): GraphReference | null {
  const raw = typeof value === 'string' ? { url: value, title: value } : record(value);
  if (!Object.keys(raw).length) return null;
  const rawUrl = safeUrl(raw.url ?? raw.href ?? raw.link);
  const referenceDoi = doi(raw.doi) ?? (rawUrl?.includes('doi.org/') ? doi(rawUrl) : undefined) ?? doi(typeof value === 'string' ? value : undefined);
  const referencePmid = pmid(raw.pmid) ?? (rawUrl?.includes('pubmed.ncbi.nlm.nih.gov/') ? pmid(rawUrl) : undefined) ??
    (typeof value === 'string' && /^pmid:/i.test(value) ? pmid(value) : undefined);
  const url = rawUrl ?? (referenceDoi ? `https://doi.org/${referenceDoi}` : referencePmid ? `https://pubmed.ncbi.nlm.nih.gov/${referencePmid}/` : undefined);
  const title = text(raw.title ?? raw.name);
  const explicitId = text(raw.id);
  if (!url && !referenceDoi && !referencePmid && !title && !explicitId) return null;
  const verification = text(raw.verification_status);
  const normalized: GraphReference = {
    ...raw,
    id: explicitId ?? (referenceDoi ? `doi:${referenceDoi}` : referencePmid ? `pmid:${referencePmid}` : `reference:${hash(url ?? title ?? '')}`),
    ...(title ? { title } : {}),
    ...(text(raw.source) ? { source: text(raw.source) } : {}),
    verification_status: verification === 'verified' || verification === 'unavailable' ? verification : 'unverified',
  };
  // Remove rejected locator aliases too: no consumer should accidentally render them.
  delete normalized.href;
  delete normalized.link;
  delete normalized.url;
  delete normalized.doi;
  delete normalized.pmid;
  if (url) normalized.url = url;
  if (referenceDoi) normalized.doi = referenceDoi;
  if (referencePmid) normalized.pmid = referencePmid;
  keepDisplayText(normalized, ['title', 'source']);
  if (typeof raw.year === 'number' && Number.isInteger(raw.year)) normalized.year = raw.year;
  else if (raw.year !== undefined) {
    normalized.unparsed_fields = { ...record(normalized.unparsed_fields), year: raw.year };
    delete normalized.year;
  }
  return normalized;
}

function referenceKey(reference: GraphReference): string {
  return reference.doi ? `doi:${reference.doi}` : reference.pmid ? `pmid:${reference.pmid}` : reference.url ?? reference.id;
}

export function mergeGraphReferences(...values: unknown[]): GraphReference[] {
  const result = new Map<string, GraphReference>();
  for (const candidate of values.flatMap(list)) {
    const reference = normalizeGraphReference(candidate);
    if (!reference) continue;
    const key = referenceKey(reference);
    const previous = result.get(key);
    if (!previous) result.set(key, reference);
    else {
      // Keep conflicting verification reports inspectable; a failed read is not an absence of evidence.
      const reports = unique([...strings(previous.verification_reports), previous.verification_status,
        reference.verification_status].filter((v): v is string => !!v));
      const verification = previous.verification_status === reference.verification_status ? reference.verification_status : 'unverified';
      result.set(key, { ...previous, ...reference, id: previous.id, verification_status: verification,
        ...(reports.length > 1 ? { verification_reports: reports } : {}) });
    }
  }
  return [...result.values()];
}

function hasLocator(reference: GraphReference): boolean {
  return !!(reference.url || reference.doi || reference.pmid) && reference.verification_status !== 'unavailable';
}

const kindAliases: Record<string, string> = {
  genes: 'gene', genetic: 'gene', genetics: 'gene', gene_symbol: 'gene',
  proteins: 'protein', protein_target: 'protein', polypeptide: 'protein',
  medication: 'drug', medications: 'drug', drugs: 'drug', medicament: 'drug', medicaments: 'drug', active_substance: 'drug',
  pathology: 'pathology', pathologie: 'pathology', pathologies: 'pathology', disease: 'pathology', diseases: 'pathology', condition: 'pathology',
  symptoms: 'symptom', symptome: 'symptom', symptomes: 'symptom', clinical_sign: 'sign',
  organs: 'organ', organe: 'organ', organes: 'organ',
  traitements: 'treatment', traitement: 'treatment', treatments: 'treatment',
  biomarkers: 'biomarker', exam: 'examination', molecule: 'molecule', molecules: 'molecule',
  mechanisms: 'mechanism', mecanisme: 'mechanism', complications: 'complication',
  interactions: 'interaction', lifestyle: 'lifestyle', daily_life: 'lifestyle',
};

const kindFamilies: Record<string, GraphFamily> = {
  organ: 'anatomy', tissue: 'anatomy', cell: 'anatomy', anatomy: 'anatomy', anatomical_structure: 'anatomy',
  pathology: 'pathologies', syndrome: 'pathologies', diagnosis: 'pathologies',
  symptom: 'manifestations', sign: 'manifestations', manifestation: 'manifestations', phenotype: 'manifestations',
  drug: 'treatments', treatment: 'treatments', procedure: 'treatments', vaccine: 'treatments', therapy: 'treatments',
  gene: 'genetics', variant: 'genetics', genetic_variant: 'genetics', genotype: 'genetics',
  protein: 'molecules', molecule: 'molecules', substance: 'molecules', enzyme: 'molecules', receptor: 'molecules', antibody: 'molecules', cytokine: 'molecules', hormone: 'molecules', metabolite: 'molecules',
  complication: 'complications', adverse_event: 'complications', adverse_events: 'complications', side_effect: 'complications',
  lab: 'examinations', biomarker: 'examinations', test: 'examinations', monitoring: 'examinations', examination: 'examinations', diagnostic_test: 'examinations',
  interaction: 'interactions', drug_interaction: 'interactions',
  hypothesis: 'research', research: 'research', evidence: 'research', reference: 'research', publication: 'research', citation: 'research', source: 'research', guideline: 'research', suggestion: 'research', trial: 'research', frontiers: 'research',
  mechanism: 'mechanisms', pathway: 'mechanisms', biological_process: 'mechanisms', cause: 'mechanisms',
  lifestyle: 'daily_life', food: 'daily_life', nutrition: 'daily_life', exposure: 'daily_life', exposures: 'daily_life', trigger: 'daily_life', triggers: 'daily_life', environment: 'daily_life', allergen: 'daily_life',
};

const familyAliases: Record<string, GraphFamily> = {
  anatomie: 'anatomy', organs: 'anatomy', pathology: 'pathologies', diseases: 'pathologies', disease: 'pathologies',
  symptoms: 'manifestations', symptoms_signs: 'manifestations', symptomes: 'manifestations',
  drugs: 'treatments', drug: 'treatments', medications: 'treatments', therapies: 'treatments', traitements: 'treatments',
  genes: 'genetics', genetic: 'genetics', genetique: 'genetics', proteins: 'molecules', molecule: 'molecules',
  complication: 'complications', adverse_events: 'complications',
  biomarkers: 'examinations', monitoring: 'examinations', exams: 'examinations', examens: 'examinations', lab: 'examinations',
  interaction: 'interactions', recherche: 'research', evidence: 'research', mechanisms: 'mechanisms', mecanismes: 'mechanisms',
  lifestyle: 'daily_life', exposures: 'daily_life', nutrition: 'daily_life', vie_quotidienne: 'daily_life',
};

// Family is the role shown in this graph, not the canonical entity kind.
// Cross-boundary tests cover these roles against deep-research-graph/contract.ts.
const molecularRoles: readonly GraphFamily[] = ['mechanisms', 'interactions', 'examinations', 'treatments'];
const familyRoles: Partial<Record<string, readonly GraphFamily[]>> = {
  pathology: ['complications'], syndrome: ['complications'], diagnosis: ['complications'],
  gene: ['mechanisms'], genetic_variant: ['mechanisms'], variant: ['mechanisms'], genotype: ['mechanisms'],
  molecule: molecularRoles, protein: molecularRoles, antibody: molecularRoles, cytokine: molecularRoles,
  hormone: molecularRoles, substance: molecularRoles, enzyme: molecularRoles, receptor: molecularRoles, metabolite: molecularRoles,
  mechanism: ['interactions'], pathway: ['interactions'],
  drug: ['interactions', 'molecules', 'examinations'],
  treatment: ['interactions', 'daily_life'], procedure: ['interactions', 'examinations'],
  symptom: ['complications'], sign: ['complications'], complication: ['pathologies', 'manifestations'],
  biomarker: ['molecules', 'mechanisms'], lab: ['molecules', 'mechanisms'],
  exposure: ['interactions'], lifestyle: ['interactions', 'treatments'], nutrition: ['interactions', 'treatments'],
  interaction: ['mechanisms'],
};

export function getGraphFamily(value: unknown, entityKind?: string): GraphFamily {
  const rawKind = token(entityKind);
  const kind = kindAliases[rawKind] ?? rawKind;
  const defaultFamily = kindFamilies[kind] ?? 'research';
  const normalized = token(value);
  const candidate = familyIds.has(normalized) ? normalized as GraphFamily : familyAliases[normalized];
  if (!candidate) return defaultFamily;
  // Preserve explicit legacy categorisation for unknown custom kinds, without changing their identity.
  if (!kindFamilies[kind]) return candidate;
  return candidate === defaultFamily || candidate === 'research' || familyRoles[kind]?.includes(candidate)
    ? candidate : defaultFamily;
}

const legacyRings: Record<string, number> = { pathology: 0, symptom: 1, sign: 1, complication: 2,
  lab: 3, biomarker: 3, cause: 3, treatment: 4, drug: 5, guideline: 6, evidence: 6, lifestyle: 6, suggestion: 6 };

export function normalizeKnowledgeNode(value: unknown): KnowledgeNode | null {
  const raw = record(value);
  const props = record(raw.properties);
  const id = text(raw.id ?? raw.node_id ?? raw.canonical_id);
  const name = text(raw.name ?? raw.label ?? raw.preferred_label);
  if (!id || !name) return null;
  const rawKind = token(raw.entity_kind ?? props.entity_kind ?? raw.node_type ?? raw.lane);
  const kind = (kindAliases[rawKind] ?? rawKind) || 'unknown';
  const family = getGraphFamily(raw.family ?? props.family, kind);
  const description = text(raw.description) ?? text(props.description);
  const source = raw.source ?? props.source;
  const references = mergeGraphReferences(raw.references, raw.citations, raw.sources, props.references, props.citations,
    record(raw.evidence).sources, typeof source === 'object' || safeUrl(source) || doi(source) ? source : undefined);
  const parents = unique([...strings(raw.parent_pathologies), ...strings(raw.parent_pathology)]);
  const result: KnowledgeNode = {
    ...raw, id, name,
    ring: Math.max(0, Math.floor(finite(raw.ring, legacyRings[kind] ?? 6))),
    lane: text(raw.lane) ?? kind,
    node_type: text(raw.node_type) ?? kind.toUpperCase(),
    entity_kind: kind, family,
    ...(text(raw.canonical_id) ? { canonical_id: text(raw.canonical_id) } : {}),
    aliases: strings(raw.aliases ?? props.aliases),
    properties: { ...props, ...(description ? { description } : {}), ...(source !== undefined ? { source } : {}) },
    proximity_score: finite(raw.proximity_score, finite(raw.weight, 0.5)),
    // Evidence grades are descriptive metadata, never inferred from a layout weight.
    evidence_grade: text(raw.evidence_grade) ?? 'D',
    translation_gap: raw.translation_gap === true,
    references,
    source_ids: unique([...strings(raw.source_ids), id]),
    parent_pathologies: parents,
    is_root: raw.is_root === true || (raw.is_root === undefined && raw.ring === 0),
    ...(text(raw.parent_pathology) ? { parent_pathology: text(raw.parent_pathology) } : {}),
  };
  keepDisplayText(result, ['canonical_id', 'parent_pathology', 'category_id', 'subcategory', 'description']);
  keepDisplayText(result.properties, ['description']);
  return result;
}

function normalizeEvidence(value: unknown, extraSources: unknown[] = []): GraphEvidence {
  const raw = record(value);
  const sources = mergeGraphReferences(raw.sources, raw.references, raw.citations, ...extraSources);
  const explicit = token(raw.status) as EvidenceStatus;
  const status = statuses.has(explicit) ? explicit : sources.some(hasLocator) ? 'limited' : 'unavailable';
  const result: GraphEvidence = { ...raw, status, limitations: strings(raw.limitations), sources,
    ...(text(raw.study_type) ? { study_type: text(raw.study_type) } : {}),
    ...(text(raw.population) ? { population: text(raw.population) } : {}) };
  keepDisplayText(result, ['study_type', 'population', 'retrieved_at']);
  const polarity = token(raw.polarity) as EvidencePolarity;
  if (polarities.has(polarity)) result.polarity = polarity;
  else delete result.polarity;
  return result;
}

function mergeEvidence(items: GraphEvidence[]): GraphEvidence {
  const uniqueItems = [...new Map(items.map(item => [stable(item), item])).values()];
  const allStatuses = unique(uniqueItems.map(item => item.status));
  const allPolarities = unique(uniqueItems.map(item => item.polarity).filter(Boolean));
  const conflicting = allStatuses.includes('conflicting') || (allPolarities.includes('supports') && allPolarities.includes('contradicts'));
  const status: EvidenceStatus = conflicting ? 'conflicting' : allStatuses.length === 1 ? allStatuses[0] : 'limited';
  const populations = unique(uniqueItems.map(item => item.population).filter((v): v is string => !!v));
  const studies = unique(uniqueItems.map(item => item.study_type).filter((v): v is string => !!v));
  return { ...uniqueItems[0], status, limitations: unique(uniqueItems.flatMap(item => item.limitations)),
    sources: mergeGraphReferences(...uniqueItems.map(item => item.sources)),
    ...(populations.length === 1 ? { population: populations[0] } : populations.length > 1 ? { population: populations.join(' ; '), populations } : {}),
    ...(studies.length === 1 ? { study_type: studies[0] } : studies.length > 1 ? { study_type: studies.join(' ; '), study_types: studies } : {}),
    ...(allStatuses.length > 1 ? { reported_statuses: allStatuses } : {}),
  };
}

function endpoint(value: unknown): string { return text(value) ?? text(record(value).id) ?? ''; }

export function normalizeKnowledgeEdge(value: unknown, index = 0): KnowledgeEdge | null {
  const raw = record(value);
  const props = record(raw.properties);
  const source = endpoint(raw.source ?? raw.source_id ?? raw.source_node_id);
  const target = endpoint(raw.target ?? raw.target_id ?? raw.target_node_id);
  if (!source || !target) return null;
  const relationship = text(raw.relationship ?? raw.edge_type ?? raw.relationship_type) ?? 'UNSPECIFIED';
  const evidenceValue = raw.evidence ?? props.evidence;
  const sourceCandidates = [raw.references, raw.sources, raw.citations, props.references, props.sources];
  const evidenceItems = Array.isArray(raw.evidence_items) && raw.evidence_items.length ? raw.evidence_items.map(item => normalizeEvidence(item))
    : Array.isArray(evidenceValue) && evidenceValue.length ? evidenceValue.map(item => normalizeEvidence(item, sourceCandidates))
    : [normalizeEvidence(evidenceValue, sourceCandidates)];
  const evidence = mergeEvidence(evidenceItems);
  const claimed = token(raw.qualifier ?? raw.evidence_qualifier ?? props.qualifier ?? record(evidenceValue).qualifier) as EdgeQualifier;
  let qualifier: EdgeQualifier = qualifiers.has(claimed) ? claimed : evidence.status === 'hypothesis' ? 'research' : 'unverified';
  if (!evidence.sources.some(hasLocator) || evidence.status === 'unavailable' || (qualifier === 'established' && evidence.status === 'conflicting')) qualifier = 'unverified';
  const rawPolarity = token(raw.polarity ?? record(evidenceValue).polarity) as EvidencePolarity;
  const polarity: EvidencePolarity = polarities.has(rawPolarity) ? rawPolarity : evidence.status === 'conflicting' ? 'mixed' : 'unknown';
  const direction = raw.direction === 'undirected' || raw.directed === false ? 'undirected' : 'directed';
  const result: KnowledgeEdge = {
    ...raw, id: text(raw.id) ?? `edge:${hash(stable([source, target, relationship, direction, polarity, raw.context, qualifier]))}:${index}`,
    source, target, relationship, direction, polarity, qualifier,
    evidence, evidence_items: [...new Map(evidenceItems.map(item => [stable(item), item])).values()],
    weight: finite(raw.weight, 0.5), evidence_grade: text(raw.evidence_grade) ?? 'D', translation_gap: raw.translation_gap === true,
    source_ids: strings(raw.source_ids),
  };
  result.source_ids = unique([...result.source_ids, result.id]);
  if ('source_id' in raw) result.source_id = source;
  if ('target_id' in raw) result.target_id = target;
  if ('source_node_id' in raw) result.source_node_id = source;
  if ('target_node_id' in raw) result.target_node_id = target;
  keepDisplayText(result, ['rationale']);
  return result;
}

/** Unlike an undirected pair key, this cannot erase reverse or contradictory claims. */
export function getKnowledgeEdgeKey(value: unknown): string {
  const raw = record(value);
  let source = endpoint(raw.source ?? raw.source_id ?? raw.source_node_id);
  let target = endpoint(raw.target ?? raw.target_id ?? raw.target_node_id);
  const direction = raw.direction === 'undirected' || raw.directed === false ? 'undirected' : 'directed';
  if (direction === 'undirected' && source > target) [source, target] = [target, source];
  return stable([source, target, text(raw.relationship ?? raw.edge_type ?? raw.relationship_type) ?? 'UNSPECIFIED',
    direction, raw.polarity ?? 'unknown', raw.qualifier ?? 'unverified', raw.context ?? null,
    record(raw.evidence).population ?? null, raw.pathology_ids ?? null, raw.directness ?? null]);
}

export function mergeKnowledgeEdges(edges: KnowledgeEdge[], diagnostics?: GraphDiagnostics): KnowledgeEdge[] {
  const result = new Map<string, KnowledgeEdge>();
  const usedIds = new Set<string>();
  for (const candidate of edges) {
    const key = getKnowledgeEdgeKey(candidate);
    const previous = result.get(key);
    if (!previous) {
      let id = candidate.id;
      if (usedIds.has(id)) id = `${id}:${hash(key)}`;
      let suffix = 2;
      while (usedIds.has(id)) id = `${candidate.id}:${hash(key)}:${suffix++}`;
      usedIds.add(id);
      result.set(key, { ...candidate, id });
    } else {
      const items = [...new Map([...previous.evidence_items, ...candidate.evidence_items].map(item => [stable(item), item])).values()];
      result.set(key, { ...previous, evidence_items: items, evidence: mergeEvidence(items),
        source_ids: unique([...previous.source_ids, ...candidate.source_ids, candidate.id]),
        rationales: unique([...strings(previous.rationales), ...strings(candidate.rationales), ...strings(previous.rationale), ...strings(candidate.rationale)]),
        metadata_conflicts: metadataConflicts(previous, candidate, ['id', 'source_ids', 'evidence', 'evidence_items', 'rationale', 'rationales']) });
      if (diagnostics && candidate.id !== previous.id) diagnostics.mergedEdgeIds[candidate.id] = previous.id;
    }
  }
  return [...result.values()];
}

function emptyDiagnostics(nodeCount: number, edgeCount: number): GraphDiagnostics {
  return { inputNodeCount: nodeCount, inputEdgeCount: edgeCount, invalidNodes: [], danglingEdges: [], ambiguousNodeIds: [],
    mergedNodeIds: Object.create(null), mergedEdgeIds: Object.create(null), migratedReferenceNodes: [], unverifiedEdgeIds: [],
    orphanNodeIds: [], disconnectedNodeIds: [], filteredNodeIds: [], filteredEdgeIds: [], warnings: [] };
}

function bibliographyReferences(node: KnowledgeNode): GraphReference[] | null {
  const bibliographic = ['reference', 'publication', 'citation', 'source', 'paper', 'article'].includes(node.entity_kind);
  const props = node.properties;
  const self = normalizeGraphReference({ id: `reference:${node.id}`, title: node.name,
    url: node.url ?? props.url ?? (safeUrl(node.source ?? props.source) ? node.source ?? props.source : undefined),
    doi: node.doi ?? props.doi, pmid: node.pmid ?? props.pmid, source: node.source ?? props.source });
  const refs = mergeGraphReferences(node.references, self);
  if (bibliographic || (node.entity_kind === 'evidence' && refs.some(hasLocator))) return refs;
  return null;
}

function mergeNodes(previous: KnowledgeNode, next: KnowledgeNode): KnowledgeNode {
  return { ...next, ...previous, properties: { ...next.properties, ...previous.properties },
    ...(previous.canonical_id || next.canonical_id ? { canonical_id: previous.canonical_id ?? next.canonical_id } : {}),
    aliases: unique([...previous.aliases, ...next.aliases, ...(next.name !== previous.name ? [next.name] : [])]),
    references: mergeGraphReferences(previous.references, next.references),
    source_ids: unique([...previous.source_ids, ...next.source_ids]),
    parent_pathologies: unique([...previous.parent_pathologies, ...next.parent_pathologies]),
    is_root: previous.is_root === true || next.is_root === true,
    metadata_conflicts: metadataConflicts(previous, next, ['id', 'name', 'label', 'aliases', 'references', 'source_ids', 'parent_pathology', 'parent_pathologies', 'is_root']),
  };
}

/** Keep competing metadata instead of silently choosing one source as the truth. */
function metadataConflicts(previous: RecordValue, next: RecordValue, ignoredKeys: string[]): RecordValue {
  const entries = new Map(Object.entries({ ...record(previous.metadata_conflicts), ...record(next.metadata_conflicts) }));
  const ignored = new Set([...ignoredKeys, 'metadata_conflicts']);
  const compare = (a: RecordValue, b: RecordValue, prefix = '') => {
    for (const key of Object.keys(a)) {
      if (!prefix && ignored.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(b, key) || a[key] === undefined || b[key] === undefined || stable(a[key]) === stable(b[key])) continue;
      if (!prefix && key === 'properties') { compare(record(a[key]), record(b[key]), 'properties.'); continue; }
      const values = [...list(entries.get(prefix + key)), a[key], b[key]];
      entries.set(prefix + key, [...new Map(values.map(value => [stable(value), value])).values()]);
    }
  };
  compare(previous, next);
  return Object.fromEntries(entries);
}

function orphanIds(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): string[] {
  const connected = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  return nodes.filter(node => !connected.has(node.id)).map(node => node.id);
}

/** Lossless adapter at the graph boundary. It never creates a clinical connection. */
export function normalizeKnowledgeGraph(input: unknown): KnowledgeGraphModel {
  const envelope = record(input);
  const raw = Object.keys(record(envelope.knowledge_graph)).length ? record(envelope.knowledge_graph) : envelope;
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const diagnostics = emptyDiagnostics(rawNodes.length, rawEdges.length);
  const nodes = new Map<string, KnowledgeNode>();
  const canonical = new Map<string, string>();
  const endpointCandidates = new Map<string, Set<string>>();
  const bibliography = new Map<string, GraphReference[]>();
  const register = (from: string, to: string) => {
    const values = endpointCandidates.get(from) ?? new Set<string>();
    values.add(to); endpointCandidates.set(from, values);
  };
  for (const [index, value] of rawNodes.entries()) {
    let node = normalizeKnowledgeNode(value);
    if (!node) { diagnostics.invalidNodes.push({ index, reason: 'Identifiant ou libellé de nœud manquant.' }); continue; }
    const originalId = node.id;
    const refs = bibliographyReferences(node);
    const canonicalKey = node.canonical_id ? stable([node.entity_kind, node.canonical_id]) : undefined;
    const identityId = canonicalKey ? canonical.get(canonicalKey) : undefined;
    const sameId = nodes.get(originalId);
    const compatibleId = sameId && sameId.entity_kind === node.entity_kind &&
      (((!sameId.canonical_id || !node.canonical_id) && normalizeGraphSearch(sameId.name) === normalizeGraphSearch(node.name)) ||
        (sameId.canonical_id && sameId.canonical_id === node.canonical_id));
    const existingId = identityId ?? (compatibleId ? originalId : undefined);
    if (existingId && nodes.has(existingId) && !refs) {
      const merged = mergeNodes(nodes.get(existingId)!, node);
      nodes.set(existingId, merged);
      for (const sourceId of node.source_ids) register(sourceId, existingId);
      if (node.canonical_id) register(node.canonical_id, existingId);
      if (canonicalKey) canonical.set(canonicalKey, existingId);
      if (originalId !== existingId) diagnostics.mergedNodeIds[originalId] = existingId;
      continue;
    }
    let suffix = 1;
    while (nodes.has(node.id) || bibliography.has(node.id)) node = { ...node, id: `${originalId}::${node.entity_kind}:${suffix++}` };
    for (const sourceId of node.source_ids) register(sourceId, node.id);
    register(node.id, node.id);
    if (node.canonical_id) register(node.canonical_id, node.id);
    if (refs) {
      bibliography.set(node.id, refs);
      diagnostics.migratedReferenceNodes.push({ nodeId: node.id, referenceIds: refs.map(ref => ref.id), attachedTo: [] });
      continue;
    }
    if (canonicalKey) canonical.set(canonicalKey, node.id);
    const rawFamily = token(record(value).family ?? record(record(value).properties).family);
    if (!kindFamilies[node.entity_kind] && !familyIds.has(rawFamily) && !familyAliases[rawFamily]) {
      diagnostics.warnings.push(`Type non classé pour ${node.id} : conservé dans Recherche sans qualification clinique.`);
      node = { ...node, family_unclassified: true };
    }
    nodes.set(node.id, node);
  }
  diagnostics.ambiguousNodeIds = [...endpointCandidates.entries()].filter(([, ids]) => ids.size > 1).map(([id]) => id);
  const resolve = (id: string) => {
    const candidates = endpointCandidates.get(id);
    return candidates?.size === 1 ? [...candidates][0] : undefined;
  };
  const normalizedEdges: KnowledgeEdge[] = [];
  for (const [index, value] of rawEdges.entries()) {
    const rawEdge = record(value);
    const sourceId = endpoint(rawEdge.source ?? rawEdge.source_id ?? rawEdge.source_node_id);
    const targetId = endpoint(rawEdge.target ?? rawEdge.target_id ?? rawEdge.target_node_id);
    const source = resolve(sourceId), target = resolve(targetId);
    const edgeId = text(rawEdge.id) ?? `input-edge:${index}`;
    if (!source || !target) {
      diagnostics.danglingEdges.push({ edgeId, source: sourceId, target: targetId,
        reason: (endpointCandidates.get(sourceId)?.size ?? 0) > 1 || (endpointCandidates.get(targetId)?.size ?? 0) > 1 ? 'Identifiant de nœud ambigu.' : 'Extrémité absente du graphe.' });
      continue;
    }
    if (bibliography.has(source) || bibliography.has(target)) {
      for (const [referenceId, conceptId] of [[source, target], [target, source]]) {
        const refs = bibliography.get(referenceId), concept = nodes.get(conceptId);
        if (refs && concept) {
          nodes.set(conceptId, { ...concept, references: mergeGraphReferences(concept.references, refs) });
          diagnostics.migratedReferenceNodes.find(item => item.nodeId === referenceId)!.attachedTo.push(conceptId);
        }
      }
      continue;
    }
    if (source === target && sourceId !== targetId) {
      diagnostics.danglingEdges.push({ edgeId, source: sourceId, target: targetId, reason: 'Boucle produite par fusion canonique ; relation conservée dans le diagnostic.' });
      continue;
    }
    const edge = normalizeKnowledgeEdge({ ...rawEdge, source, target }, index);
    if (edge) normalizedEdges.push(edge);
  }
  const edges = mergeKnowledgeEdges(normalizedEdges, diagnostics);
  diagnostics.unverifiedEdgeIds = edges.filter(edge => edge.qualifier === 'unverified').map(edge => edge.id);
  for (const migrated of diagnostics.migratedReferenceNodes) migrated.attachedTo = unique(migrated.attachedTo);
  const explicitRoots = strings(raw.root_ids ?? envelope.root_ids).map(id => resolve(id)).filter((id): id is string => !!id && nodes.has(id));
  const rootSet = new Set(explicitRoots);
  const nodeList = [...nodes.values()].map(node => rootSet.has(node.id) ? { ...node, is_root: true } : node);
  diagnostics.orphanNodeIds = orphanIds(nodeList, edges);
  const result: KnowledgeGraphModel = { ...envelope, ...raw, schema_version: 2, nodes: nodeList, edges,
    root_ids: unique([...explicitRoots, ...nodeList.filter(node => node.is_root).map(node => node.id)]),
    references: mergeGraphReferences(raw.references, ...bibliography.values()), diagnostics };
  delete result.knowledge_graph;
  return result;
}

export interface GraphTraversalOptions { direction?: 'either' | 'outgoing' | 'incoming' }
type Adjacency = Map<string, Array<{ nodeId: string; edge: KnowledgeEdge }>>;

function adjacency(graph: KnowledgeGraphModel, options: GraphTraversalOptions): Adjacency {
  const adjacent: Adjacency = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    if (!adjacent.has(edge.source) || !adjacent.has(edge.target)) continue;
    const direction = edge.direction === 'undirected' ? 'either' : options.direction ?? 'either';
    if (direction !== 'incoming') adjacent.get(edge.source)!.push({ nodeId: edge.target, edge });
    if (direction !== 'outgoing') adjacent.get(edge.target)!.push({ nodeId: edge.source, edge });
  }
  return adjacent;
}

/** Undirected graph distance by default, not causal or clinical proximity. */
export function getGraphDistances(graph: KnowledgeGraphModel, centerId: string, options: GraphTraversalOptions = {}): Map<string, number> {
  const adjacent = adjacency(graph, options);
  const distances = new Map<string, number>();
  if (!adjacent.has(centerId)) return distances;
  const queue = [centerId]; distances.set(centerId, 0);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    for (const next of adjacent.get(current) ?? []) {
      if (distances.has(next.nodeId)) continue;
      distances.set(next.nodeId, distances.get(current)! + 1); queue.push(next.nodeId);
    }
  }
  return distances;
}

export interface ConnectedGraphPath { nodeIds: string[]; edgeIds: string[]; edges: KnowledgeEdge[] }

/** A path contains the actual assertions/references; traversal does not assert causality. */
export function getConnectedPath(graph: KnowledgeGraphModel, sourceId: string, targetId: string,
  options: GraphTraversalOptions = {}): ConnectedGraphPath | null {
  const adjacent = adjacency(graph, options);
  if (!adjacent.has(sourceId) || !adjacent.has(targetId)) return null;
  const visited = new Set([sourceId]);
  const previous = new Map<string, { nodeId: string; edge: KnowledgeEdge }>();
  const queue = [sourceId];
  for (let i = 0; i < queue.length && !visited.has(targetId); i++) {
    for (const next of adjacent.get(queue[i]) ?? []) {
      if (visited.has(next.nodeId)) continue;
      visited.add(next.nodeId); previous.set(next.nodeId, { nodeId: queue[i], edge: next.edge }); queue.push(next.nodeId);
    }
  }
  if (!visited.has(targetId)) return null;
  const nodeIds = [targetId], edges: KnowledgeEdge[] = [];
  let current = targetId;
  while (current !== sourceId) {
    const step = previous.get(current)!;
    edges.unshift(step.edge); nodeIds.unshift(step.nodeId); current = step.nodeId;
  }
  return { nodeIds, edgeIds: edges.map(edge => edge.id), edges };
}

export interface GraphFilterOptions {
  families?: Iterable<GraphFamily>;
  qualifiers?: Iterable<EdgeQualifier>;
  query?: string;
  centerId?: string;
  maxDistance?: number;
  includeUnverified?: boolean;
  includeOrphans?: boolean;
}

export function filterKnowledgeGraph(graph: KnowledgeGraphModel, options: GraphFilterOptions = {}): KnowledgeGraphModel {
  const families = options.families ? new Set(options.families) : undefined;
  const selectedQualifiers = options.qualifiers ? new Set(options.qualifiers) : undefined;
  const query = normalizeGraphSearch(options.query ?? '');
  const centerId = options.centerId;
  let nodes = graph.nodes.filter(node => node.id === centerId ||
    ((!families || families.has(node.family)) && (!query || normalizeGraphSearch([node.name, node.id, node.canonical_id,
      ...node.aliases].filter(Boolean).join(' ')).includes(query))));
  let nodeIds = new Set(nodes.map(node => node.id));
  let edges = graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) &&
    (!selectedQualifiers || selectedQualifiers.has(edge.qualifier)) && (options.includeUnverified !== false || edge.qualifier !== 'unverified'));
  if (centerId && typeof options.maxDistance === 'number' && Number.isFinite(options.maxDistance)) {
    const distances = getGraphDistances({ ...graph, nodes, edges }, centerId);
    const maxDistance = Math.max(0, Math.floor(options.maxDistance));
    nodes = nodes.filter(node => distances.has(node.id) && distances.get(node.id)! <= maxDistance);
    nodeIds = new Set(nodes.map(node => node.id));
    edges = edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  }
  if (options.includeOrphans === false) {
    const orphans = new Set(orphanIds(nodes, edges));
    nodes = nodes.filter(node => node.id === centerId || !orphans.has(node.id));
    nodeIds = new Set(nodes.map(node => node.id));
  }
  const distances = centerId ? getGraphDistances({ ...graph, nodes, edges }, centerId) : undefined;
  const edgeIds = new Set(edges.map(edge => edge.id));
  return { ...graph, nodes, edges, root_ids: graph.root_ids.filter(id => nodeIds.has(id)), diagnostics: { ...graph.diagnostics,
    filteredNodeIds: unique([...graph.diagnostics.filteredNodeIds, ...graph.nodes.filter(node => !nodeIds.has(node.id)).map(node => node.id)]),
    filteredEdgeIds: unique([...graph.diagnostics.filteredEdgeIds, ...graph.edges.filter(edge => !edgeIds.has(edge.id)).map(edge => edge.id)]),
    orphanNodeIds: orphanIds(nodes, edges),
    disconnectedNodeIds: distances ? nodes.filter(node => !distances.has(node.id)).map(node => node.id) : [],
  } };
}
