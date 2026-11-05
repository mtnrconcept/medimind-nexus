
export interface GraphReference {
    id: string;
    title: string;
    url: string;
    abstract?: string;
    year?: string;
    journal?: string;
    publication_types?: string[];
    abstract_truncated?: boolean;
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
    evidence_status?: 'source_linked' | 'hypothesis';
}

export interface RingEdge {
    id: string;
    source: string;
    target: string;
    relationship: string;
    evidence_grade: string;
    translation_gap: boolean;
    weight: number;
    rationale?: string;
    references?: GraphReference[];
    evidence_status?: 'source_linked' | 'hypothesis';
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
    research?: {
        summary: string;
        model: string;
        result_status: 'complete' | 'partial' | 'fallback';
        limitations: string[];
        unresolved_questions: string[];
        source_statuses: Record<string, import('../../supabase/functions/deep-research-graph/sources').SourceStatus[]>;
    };
}
