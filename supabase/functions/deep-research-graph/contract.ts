import type { SourceRecord, SourceStatus } from './sources.ts';
import { MEDICAL_WEB_DOMAINS } from '../cross-data-analyzer/agent-contract.ts';

export const GRAPH_SCHEMA_VERSION = 2;
export const GRAPH_FAMILIES = ['anatomy', 'pathologies', 'manifestations', 'treatments', 'genetics', 'molecules',
    'complications', 'examinations', 'interactions', 'research', 'mechanisms', 'daily_life'] as const;
export type GraphFamily = typeof GRAPH_FAMILIES[number];
export const GRAPH_WEB_DOMAINS = [...MEDICAL_WEB_DOMAINS, 'ncbi.nlm.nih.gov', 'nih.gov', 'medlineplus.gov',
    'orpha.net', 'theipna.org', 'nejm.org', 'nature.com', 'thelancet.com', 'jamanetwork.com', 'bmj.com'] as const;

const nodeKinds: Record<string, { kind: string; family: GraphFamily; ring: number }> = {
    PATHOLOGY: { kind: 'pathology', family: 'pathologies', ring: 2 },
    DISEASE: { kind: 'pathology', family: 'pathologies', ring: 2 },
    ORGAN: { kind: 'organ', family: 'anatomy', ring: 3 },
    TISSUE: { kind: 'tissue', family: 'anatomy', ring: 3 },
    CELL: { kind: 'cell', family: 'anatomy', ring: 3 },
    ANATOMY: { kind: 'anatomy', family: 'anatomy', ring: 3 },
    GENE: { kind: 'gene', family: 'genetics', ring: 3 },
    GENETIC_VARIANT: { kind: 'genetic_variant', family: 'genetics', ring: 3 },
    MOLECULE: { kind: 'molecule', family: 'molecules', ring: 3 },
    PROTEIN: { kind: 'protein', family: 'molecules', ring: 3 },
    ANTIBODY: { kind: 'antibody', family: 'molecules', ring: 3 },
    CYTOKINE: { kind: 'cytokine', family: 'molecules', ring: 3 },
    HORMONE: { kind: 'hormone', family: 'molecules', ring: 3 },
    MECHANISM: { kind: 'mechanism', family: 'mechanisms', ring: 3 },
    PATHWAY: { kind: 'pathway', family: 'mechanisms', ring: 3 },
    DRUG: { kind: 'drug', family: 'treatments', ring: 5 },
    MEDICATION: { kind: 'drug', family: 'treatments', ring: 5 },
    ACTIVE_SUBSTANCE: { kind: 'drug', family: 'treatments', ring: 5 },
    TREATMENT: { kind: 'treatment', family: 'treatments', ring: 4 },
    PROCEDURE: { kind: 'procedure', family: 'treatments', ring: 4 },
    SYMPTOM: { kind: 'symptom', family: 'manifestations', ring: 1 },
    SIGN: { kind: 'sign', family: 'manifestations', ring: 1 },
    COMPLICATION: { kind: 'complication', family: 'complications', ring: 2 },
    LAB: { kind: 'biomarker', family: 'examinations', ring: 3 },
    BIOMARKER: { kind: 'biomarker', family: 'examinations', ring: 3 },
    TEST: { kind: 'examination', family: 'examinations', ring: 3 },
    EXAM: { kind: 'examination', family: 'examinations', ring: 3 },
    MONITORING: { kind: 'monitoring', family: 'examinations', ring: 3 },
    EXPOSURE: { kind: 'exposure', family: 'daily_life', ring: 3 },
    LIFESTYLE: { kind: 'lifestyle', family: 'daily_life', ring: 3 },
    NUTRITION: { kind: 'nutrition', family: 'daily_life', ring: 3 },
    INTERACTION: { kind: 'interaction', family: 'interactions', ring: 3 },
    HYPOTHESIS: { kind: 'hypothesis', family: 'research', ring: 6 },
    RESEARCH: { kind: 'research', family: 'research', ring: 6 },
};
export const GRAPH_NODE_TYPES = Object.keys(nodeKinds);
// A family describes a concept's role in this graph; it never changes its entity kind.
// In particular a gene cannot become a protein merely by changing a display family.
const familyRoles: Partial<Record<string, readonly GraphFamily[]>> = {
    pathology: ['complications'],
    gene: ['mechanisms'], genetic_variant: ['mechanisms'],
    molecule: ['mechanisms', 'interactions', 'examinations', 'treatments'],
    protein: ['mechanisms', 'interactions', 'examinations', 'treatments'],
    antibody: ['mechanisms', 'interactions', 'examinations', 'treatments'],
    cytokine: ['mechanisms', 'interactions', 'examinations', 'treatments'],
    hormone: ['mechanisms', 'interactions', 'examinations', 'treatments'],
    mechanism: ['interactions'], pathway: ['interactions'],
    drug: ['interactions', 'molecules', 'examinations'],
    treatment: ['interactions', 'daily_life'], procedure: ['interactions', 'examinations'],
    symptom: ['complications'], sign: ['complications'], complication: ['pathologies', 'manifestations'],
    biomarker: ['molecules', 'mechanisms'],
    exposure: ['interactions'], lifestyle: ['interactions', 'treatments'], nutrition: ['interactions', 'treatments'],
    interaction: ['mechanisms'],
};
function semanticFamily(nodeType: string, value: unknown): GraphFamily {
    const kind = nodeKinds[nodeType] ?? nodeKinds.PATHOLOGY;
    const candidate = typeof value === 'string' ? value.trim().toLowerCase() as GraphFamily : undefined;
    return candidate && GRAPH_FAMILIES.includes(candidate) &&
        (candidate === kind.family || candidate === 'research' || familyRoles[kind.kind]?.includes(candidate)) ? candidate : kind.family;
}
export const validTerm = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200 && !/\p{Cc}/u.test(v);
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 1600) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const strings = (v: unknown, max = 12, length = 400) => Array.isArray(v)
    ? [...new Set(v.map(item => text(item, length)).filter(Boolean))].slice(0, max) : [];
const normalized = (v: string) => v.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
const weight = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(v, 1)) : 0.5;
function hash(value: string) {
    let result = 2166136261;
    for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0).toString(36);
}

export interface ExistingNode {
    id?: string; name: string; node_type: string; canonical_id?: string; family?: string;
}
export interface GraphInput {
    topic: string; topicType: string; pathologies: string[]; existingNodes: ExistingNode[]; maxNodes: number; maxDepth: number;
}
export interface GraphNode {
    id: string; node_type: string; label: string; description: string; weight: number; source: string;
    canonical_id: string; family: GraphFamily; entity_kind: string; aliases: string[];
    ring: number; depth: number; parent_pathology?: string; parent_pathologies?: string[]; tags?: string[];
}
export interface GraphEvidenceSource {
    id: string; url: string; title: string; source: string; pmid?: string; year?: string;
    publication_types?: string[];
    verification_status: 'verified'; content_level: 'abstract' | 'metadata' | 'report' | 'web';
}
export interface GraphEvidence {
    status: 'supported' | 'limited' | 'hypothesis' | 'conflicting' | 'unavailable';
    study_type?: string; population?: string; limitations: string[]; sources: GraphEvidenceSource[];
}
export interface GraphEdge {
    id: string; source_id: string; target_id: string; edge_type: string; weight: number; rationale: string;
    qualifier: 'established' | 'association' | 'research' | 'unverified'; evidence: GraphEvidence;
    context?: string; polarity: 'supports' | 'contradicts' | 'mixed' | 'unknown'; directness: 'direct' | 'indirect';
}

/** These are application identities, never fabricated SNOMED/OMIM/HGNC accessions. */
function identity(label: string, nodeType: string) {
    return 'local:' + (nodeKinds[nodeType]?.kind ?? 'concept') + ':' + normalized(label);
}

export function centralNodes(input: GraphInput): GraphNode[] {
    const allocated = new Set(input.existingNodes.map(node => node.id).filter(Boolean));
    return input.pathologies.map((label, index) => {
        const type = input.pathologies.length === 1 && normalized(label) === normalized(input.topic) ? input.topicType : 'PATHOLOGY';
        const kind = nodeKinds[type] ?? nodeKinds.PATHOLOGY;
        const key = identity(label, type);
        const existing = input.existingNodes.find(node => node.id && identity(node.name, node.node_type.toUpperCase()) === key);
        let id = existing?.id || 'c' + index;
        if (!existing && allocated.has(id)) id += '_' + hash(key);
        while (!existing && allocated.has(id)) id += '_';
        allocated.add(id);
        return { id, node_type: type, label, description: 'Concept de recherche, sans diagnostic individuel implicite.',
            weight: 1, source: 'Recherche', ring: 0, depth: 0, parent_pathology: label, parent_pathologies: [label], aliases: [],
            canonical_id: key, family: semanticFamily(type, existing?.family), entity_kind: kind.kind };
    });
}

export function referenceUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length > 4000 || /\p{Cc}/u.test(value)) return;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port ||
            !GRAPH_WEB_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) return;
        url.hash = '';
        if (url.hostname === 'pubmed.ncbi.nlm.nih.gov' && /^\/\d{1,10}\/?$/.test(url.pathname)) {
            url.pathname = '/' + url.pathname.replace(/\//g, '') + '/';
        }
        return url.href;
    } catch { return; }
}

export function webSourceStatus(response: { webSources?: { url: string; title: string }[]; webSearchCalls?: number; webSourcesTruncated?: boolean }, enabled: boolean): SourceStatus {
    if (!enabled) return { source: 'OpenAI web_search', status: 'skipped', count: 0, records: [], detail: 'Désactivé.' };
    if (!Number.isSafeInteger(response.webSearchCalls) || (response.webSearchCalls ?? 0) < 1) {
        return { source: 'OpenAI web_search', status: 'unavailable', count: 0, records: [], detail: 'Aucune recherche web exécutée et vérifiable.' };
    }
    const records = new Map<string, SourceRecord>();
    for (const entry of (response.webSources ?? []).slice(0, 128)) {
        const url = referenceUrl(entry.url);
        if (url) records.set(url, { id: 'web_' + hash(url), title: text(entry.title, 500) || new URL(url).hostname,
            url, content_level: 'web' });
    }
    return { source: 'OpenAI web_search', status: response.webSourcesTruncated ? 'partial' : records.size ? 'available' : 'empty',
        count: records.size, records: [...records.values()],
        detail: 'Provenance des recherches exécutées. La présence d’une source ne valide pas, à elle seule, une relation clinique.' };
}

function sourceRegistry(statuses: SourceStatus[]) {
    const result = new Map<string, GraphEvidenceSource>();
    for (const status of statuses) {
        if (!['available', 'partial'].includes(status.status)) continue;
        for (const source of status.records) {
            const url = referenceUrl(source.url);
            if (!url) continue;
            const entry: GraphEvidenceSource = { id: source.id, url, title: source.title, source: status.source,
                verification_status: 'verified', content_level: source.content_level ?? (status.source === 'OpenFDA' ? 'report' : 'metadata'),
                ...(status.source === 'PubMed' ? { pmid: source.id } : {}), ...(source.year ? { year: source.year } : {}),
                ...(source.publication_types?.length ? { publication_types: source.publication_types } : {}) };
            // Preserve abstract-level metadata when the same article also occurs in native web search.
            if (result.get(url)?.content_level !== 'abstract') result.set(url, entry);
        }
    }
    return result;
}

function edgeEvidence(raw: Record<string, unknown>, registry: Map<string, GraphEvidenceSource>, relation: string) {
    const evidence = record(raw.evidence);
    const candidates = Array.isArray(evidence.sources) ? evidence.sources : Array.isArray(raw.refs) ? raw.refs : [];
    const sources: GraphEvidenceSource[] = [];
    for (const candidate of candidates.slice(0, 20)) {
        const source = record(candidate);
        const rawUrl = typeof candidate === 'string' ? candidate : source.url;
        const url = referenceUrl(rawUrl);
        let match = url ? registry.get(url) : undefined;
        if (!match) {
            const id = text(source.pmid || source.id || (typeof candidate === 'string' ? candidate.replace(/^PMID:/i, '') : ''), 120);
            const matches = [...registry.values()].filter(entry => entry.id === id || entry.pmid === id);
            if (matches.length === 1) match = matches[0];
        }
        if (match && !sources.some(entry => entry.url === match.url)) sources.push(match);
    }
    let status: GraphEvidence['status'] = ['supported', 'limited', 'hypothesis', 'conflicting', 'unavailable'].includes(String(evidence.status))
        ? evidence.status as GraphEvidence['status'] : 'unavailable';
    let qualifier: GraphEdge['qualifier'] = ['established', 'association', 'research', 'unverified'].includes(String(raw.qualifier))
        ? raw.qualifier as GraphEdge['qualifier'] : 'unverified';
    const limitations = strings(evidence.limitations);
    let studyType = text(evidence.study_type, 160);
    const population = text(evidence.population, 700);
    let edgeType = relation;
    if (sources.length && sources.every(source => source.publication_types?.some(type => /^case reports?$/i.test(type)))) {
        studyType = 'case_report';
        limitations.push('Les publications retrouvées décrivent des cas cliniques, sans essai comparatif démontré.');
    }
    if (!sources.length) {
        qualifier = 'unverified';
        if (status !== 'hypothesis') status = 'unavailable';
        limitations.push('Aucune référence de cette relation n’a été retrouvée dans les sources effectivement consultées.');
    } else if (sources.every(source => source.content_level === 'report')) {
        status = 'limited'; qualifier = 'association'; edgeType = 'REPORTED_WITH';
        limitations.push('Signalement spontané : ni causalité, ni fréquence, ni efficacité démontrée.');
    } else if (sources.every(source => source.content_level === 'metadata' || source.content_level === 'report')) {
        if (status === 'supported') status = 'limited';
        qualifier = 'unverified';
        limitations.push('Notices bibliographiques sans contenu analysé suffisant pour valider cette relation.');
    } else if (/animal|murine|in[ _-]?vitro|in[ _-]?silico|preclinical|préclin/i.test(studyType)) {
        qualifier = 'research';
        limitations.push('Résultat préclinique : transposition à l’être humain non établie.');
    } else if (/case[ _-]?(report|series)|cas[ _-]?(clinique|isolé)/i.test(studyType)) {
        if (qualifier === 'established') qualifier = 'association';
        if (status === 'supported') status = 'limited';
    }
    if (qualifier === 'established' && (status !== 'supported' || !studyType || !population || !text(raw.rationale))) {
        qualifier = status === 'hypothesis' ? 'research' : sources.length ? 'association' : 'unverified';
    }
    return { edgeType, qualifier, evidence: { status, sources: sources.slice(0, 8), limitations: [...new Set(limitations)],
        ...(studyType ? { study_type: studyType } : {}), ...(population ? { population } : {}) } as GraphEvidence };
}

export function normalizeGraph(raw: unknown, input: GraphInput, statuses: SourceStatus[]) {
    const value = record(raw);
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error('Invalid graph');
    const centers = centralNodes(input);
    const nodes: GraphNode[] = [...centers];
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const ids = new Set(centers.map(node => node.id));
    const references = new Map<string, string>();
    const names = new Map<string, Set<string>>();
    const nameReference = (name: string, id: string) => names.set(name, new Set([...(names.get(name) ?? []), id]));
    const identities = new Map<string, string>();
    const anchors = new Set(centers.map(node => node.id));
    for (const node of centers) {
        references.set(node.id, node.id); nameReference(node.label, node.id); references.set(node.canonical_id, node.id);
        identities.set(node.canonical_id, node.id);
        const claimed = value.nodes.filter(item => record(item).id === node.id);
        if (claimed.some(item => normalized(text(record(item).label)) !== normalized(node.label) ||
            nodeKinds[text(record(item).node_type).toUpperCase()]?.kind !== node.entity_kind)) throw new Error('Invalid central node');
    }
    for (const node of input.existingNodes) {
        const id = node.id || node.name;
        const key = identity(node.name, node.node_type.toUpperCase());
        const target = identities.get(key) || id;
        identities.set(key, target); references.set(id, target); nameReference(node.name, target);
        if (node.canonical_id) references.set(node.canonical_id, target);
        anchors.add(target);
    }
    let rejectedNodes = 0;
    const rawIds = new Map<string, Set<string>>();
    for (const item of value.nodes.slice(0, 600).map(record)) if (validTerm(item.id) && validTerm(item.label) && validTerm(item.node_type)) {
        rawIds.set(item.id, new Set([...(rawIds.get(item.id) ?? []), identity(item.label, item.node_type.toUpperCase())]));
    }
    for (const rawNode of value.nodes.slice(0, 600)) {
        const item = record(rawNode);
        if (!validTerm(item.id) || !validTerm(item.label) || !validTerm(item.node_type)) { rejectedNodes++; continue; }
        const type = item.node_type.toUpperCase();
        const kind = nodeKinds[type];
        // References, guidelines, reports and "no evidence" notices belong to provenance, never to the medical graph.
        if (!kind || (rawIds.get(item.id)?.size ?? 0) > 1 || /^(?:https?:\/\/|PMID[:\s]|doi[:\s]|NCT\d{8}\b)/i.test(item.label.trim())) { rejectedNodes++; continue; }
        const key = identity(item.label, type);
        const parents = strings([item.parent_pathology, ...(Array.isArray(item.parent_pathologies) ? item.parent_pathologies : [])])
            .filter(parent => input.pathologies.includes(parent));
        const mergeParents = (target: GraphNode | undefined) => {
            if (!target || !parents.length) return;
            target.parent_pathologies = [...new Set([...(target.parent_pathologies ?? []), ...parents])];
            target.parent_pathology ??= target.parent_pathologies[0];
        };
        if (ids.has(item.id)) { mergeParents(nodesById.get(item.id)); continue; }
        const duplicate = identities.get(key);
        if (duplicate) { references.set(item.id, duplicate); mergeParents(nodesById.get(duplicate)); continue; }
        if (references.has(item.id)) { rejectedNodes++; continue; }
        const label = item.label.trim();
        ids.add(item.id); identities.set(key, item.id); references.set(item.id, item.id); nameReference(label, item.id);
        references.set(key, item.id);
        const node: GraphNode = { id: item.id, label, node_type: type, canonical_id: key,
            family: semanticFamily(type, item.family), entity_kind: kind.kind,
            aliases: strings(item.aliases, 10, 200), description: text(item.description), weight: weight(item.weight),
            source: 'Analyse de connaissances générales', ring: kind.ring, depth: 0,
            ...(parents.length ? { parent_pathology: parents[0], parent_pathologies: parents } : {}),
            ...(Array.isArray(item.tags) ? { tags: strings(item.tags, 12, 100) } : {}) };
        nodes.push(node); nodesById.set(node.id, node);
    }
    // A legacy name-only endpoint is usable only if it identifies one concept.
    // A gene and a protein can share a label and must never be conflated.
    for (const [name, candidates] of names) if (candidates.size === 1 && !references.has(name)) references.set(name, [...candidates][0]);
    const registry = sourceRegistry(statuses);
    const edges: GraphEdge[] = [];
    const edgeIds = new Set<string>();
    const observations = new Set<string>();
    let rejectedEdges = 0;
    for (const rawEdge of value.edges.slice(0, 2400)) {
        const item = record(rawEdge);
        const source = references.get(text(item.source_id, 200));
        const target = references.get(text(item.target_id, 200));
        const relation = text(item.edge_type, 80).toUpperCase();
        const rationale = text(item.rationale) || 'Relation non documentée.';
        if (!source || !target || source === target || !/^[A-Z][A-Z0-9_]{1,79}$/.test(relation)) { rejectedEdges++; continue; }
        const context = text(item.context, 700);
        const evidence = edgeEvidence(item, registry, relation);
        const polarity: GraphEdge['polarity'] = ['supports', 'contradicts', 'mixed', 'unknown'].includes(String(item.polarity))
            ? item.polarity as GraphEdge['polarity'] : evidence.evidence.status === 'conflicting' ? 'mixed' : 'unknown';
        // Preserve different studies and findings on one relation for frontend evidence_items aggregation.
        // Ordering citations or limitations differently does not create another scientific observation.
        const observation = JSON.stringify([source, target, evidence.edgeType, context, polarity, evidence.qualifier, rationale,
            { ...evidence.evidence, limitations: [...evidence.evidence.limitations].sort(),
                sources: [...evidence.evidence.sources].sort((a, b) => a.url.localeCompare(b.url)).map(source => ({ ...source,
                    ...(source.publication_types ? { publication_types: [...source.publication_types].sort() } : {}) })) }]);
        if (observations.has(observation)) continue;
        observations.add(observation);
        let id = 'edge_' + hash(observation);
        // A hash collision must never erase a distinct observation.
        while (edgeIds.has(id)) id += '_';
        edgeIds.add(id);
        edges.push({ id, source_id: source, target_id: target, edge_type: evidence.edgeType, rationale,
            weight: weight(item.weight), qualifier: evidence.qualifier, evidence: evidence.evidence, polarity,
            directness: centers.some(node => node.id === source || node.id === target) ? 'direct' : 'indirect',
            ...(context ? { context } : {}) });
    }
    // Graph reach is undirected; the scientific arrow above keeps its original direction.
    // Existing concepts anchor an explicit expansion. No edge is invented to attach an orphan.
    const distances = new Map([...anchors].map(id => [id, 0]));
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
        adjacency.set(edge.source_id, [...(adjacency.get(edge.source_id) ?? []), edge.target_id]);
        adjacency.set(edge.target_id, [...(adjacency.get(edge.target_id) ?? []), edge.source_id]);
    }
    const queue = [...anchors];
    for (let index = 0; index < queue.length; index++) {
        const id = queue[index], depth = distances.get(id)!;
        if (depth >= input.maxDepth) continue;
        for (const next of adjacency.get(id) ?? []) if (!distances.has(next)) { distances.set(next, depth + 1); queue.push(next); }
    }
    const reached = nodes.filter(node => distances.has(node.id));
    const selected = reached.sort((a, b) => distances.get(a.id)! - distances.get(b.id)!).slice(0, input.maxNodes)
        .map(node => ({ ...node, depth: distances.get(node.id)! }));
    const endpoints = new Set([...selected.map(node => node.id), ...anchors]);
    const selectedEdges = edges.filter(edge => endpoints.has(edge.source_id) && endpoints.has(edge.target_id));
    const truncated = selected.length < nodes.length || value.nodes.length > 600 || value.edges.length > 2400;
    const limitations = strings(value.limitations, 12, 500);
    if (rejectedNodes || rejectedEdges) limitations.push('Des éléments invalides, des références utilisées comme nœuds ou des liens sans extrémités valides ont été écartés.');
    if (truncated) limitations.push('Exploration bornée : certains concepts sont hors de cette page, sans chemin explicite ou au-delà de la profondeur demandée.');
    return { nodes: selected, edges: selectedEdges, research_summary: text(value.research_summary, 6000), limitations,
        exploration: { max_depth: input.maxDepth, returned_nodes: selected.length, returned_edges: selectedEdges.length,
            truncated, can_expand: true, exhaustive: false, rejected_nodes: rejectedNodes, rejected_edges: rejectedEdges } };
}

const string = { type: 'string' };
const array = (items: unknown) => ({ type: 'array', items });
const shape = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const GRAPH_RESPONSE_FORMAT = { type: 'json_schema', name: 'medical_knowledge_graph_v2', strict: true,
    schema: shape({ nodes: array(shape({ id: string, label: string, node_type: { type: 'string', enum: GRAPH_NODE_TYPES },
        family: { type: 'string', enum: GRAPH_FAMILIES },
        description: string, aliases: array(string), parent_pathology: string, parent_pathologies: array(string), weight: { type: 'number' } })),
    edges: array(shape({ source_id: string, target_id: string, edge_type: string, rationale: string, context: string,
        weight: { type: 'number' }, qualifier: { type: 'string', enum: ['established', 'association', 'research', 'unverified'] },
        polarity: { type: 'string', enum: ['supports', 'contradicts', 'mixed', 'unknown'] },
        evidence: shape({ status: { type: 'string', enum: ['supported', 'limited', 'hypothesis', 'conflicting', 'unavailable'] },
            study_type: string, population: string, limitations: array(string), sources: array(shape({ url: string })) }) })),
    research_summary: string, limitations: array(string) }) };
