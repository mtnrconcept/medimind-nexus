/** Semantic families are independent from layout rings and clinical certainty. */
export type GraphFamily = 'anatomy' | 'pathologies' | 'manifestations' | 'treatments' |
    'genetics' | 'molecules' | 'complications' | 'examinations' | 'interactions' |
    'research' | 'mechanisms' | 'daily_life';

export type EdgeQualifier = 'established' | 'association' | 'research' | 'unverified';
export type EvidenceStatus = 'supported' | 'limited' | 'hypothesis' | 'conflicting' | 'unavailable';
export type EvidencePolarity = 'supports' | 'contradicts' | 'mixed' | 'unknown';

export interface GraphReference {
    id: string;
    url?: string;
    doi?: string;
    pmid?: string;
    title?: string;
    source?: string;
    year?: number;
    verification_status?: 'verified' | 'unverified' | 'unavailable';
    [key: string]: unknown;
}

export interface GraphEvidence {
    status: EvidenceStatus;
    study_type?: string;
    population?: string;
    limitations: string[];
    sources: GraphReference[];
    retrieved_at?: string;
    polarity?: EvidencePolarity;
    [key: string]: unknown;
}

export interface RingNode {
    id: string;
    ring: number;
    lane: string;
    name: string;
    node_type?: string;
    properties: Record<string, any>;
    proximity_score: number;
    evidence_grade: string;
    translation_gap: boolean;
    // Ontology facets
    category_id?: string;
    subcategory?: string;
    tags?: string[];
    is_inherited?: boolean; // True if node came from previous expansion
    parent_pathology?: string; // For comorbidity: which pathology this node belongs to
    canonical_id?: string;
    aliases?: string[];
    family?: GraphFamily;
    entity_kind?: string;
    references?: GraphReference[];
    parent_pathologies?: string[];
    is_root?: boolean;
}

export interface RingEdge {
    id: string;
    source: string;
    target: string;
    relationship: string;
    evidence_grade: string;
    translation_gap: boolean;
    weight: number;
    qualifier?: EdgeQualifier;
    evidence?: GraphEvidence;
    evidence_items?: GraphEvidence[];
    direction?: 'directed' | 'undirected';
    polarity?: EvidencePolarity;
    context?: Record<string, unknown> | string;
    rationale?: string;
}

export interface KnowledgeNode extends RingNode {
    family: GraphFamily;
    entity_kind: string;
    aliases: string[];
    references: GraphReference[];
    /** IDs from source payloads, retained when explicit canonical identities merge. */
    source_ids: string[];
    parent_pathologies: string[];
    is_root: boolean;
    [key: string]: unknown;
}

export interface KnowledgeEdge extends RingEdge {
    qualifier: EdgeQualifier;
    evidence: GraphEvidence;
    /** Separate observations are retained; the summary never replaces them. */
    evidence_items: GraphEvidence[];
    direction: 'directed' | 'undirected';
    polarity: EvidencePolarity;
    source_ids: string[];
    [key: string]: unknown;
}

export interface GraphDiagnostics {
    inputNodeCount: number;
    inputEdgeCount: number;
    invalidNodes: Array<{ index: number; reason: string }>;
    danglingEdges: Array<{ edgeId: string; source: string; target: string; reason: string }>;
    ambiguousNodeIds: string[];
    mergedNodeIds: Record<string, string>;
    mergedEdgeIds: Record<string, string>;
    migratedReferenceNodes: Array<{ nodeId: string; referenceIds: string[]; attachedTo: string[] }>;
    unverifiedEdgeIds: string[];
    orphanNodeIds: string[];
    disconnectedNodeIds: string[];
    filteredNodeIds: string[];
    filteredEdgeIds: string[];
    warnings: string[];
}

export interface KnowledgeGraphModel {
    schema_version: 2;
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
    root_ids: string[];
    references?: GraphReference[];
    diagnostics: GraphDiagnostics;
    [key: string]: unknown;
}

export interface MicroSignal {
    id: string;
    observation: string;
    confidence: number;
    triangulation_score: number;
    kill_criteria?: string;
}

export interface RadialRingsData {
    knowledge_graph: {
        nodes: RingNode[];
        edges: RingEdge[];
    };
    micro_signals: MicroSignal[];
    hypotheses: any[];
}
