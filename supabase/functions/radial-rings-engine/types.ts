// ============================================
// RADIAL RINGS DISCOVERY ENGINE - TYPES
// ============================================
// Structures de données pour le moteur de découverte par anneaux concentriques

// ============================================
// RING CONFIGURATION
// ============================================

export type RingLevel = 0 | 1 | 2 | 3 | 4;

export type RingLane =
    | 'pathology'           // Ring 0
    | 'drugs'               // Ring 1
    | 'symptoms'            // Ring 1
    | 'biomarkers'          // Ring 1
    | 'adverse_events'      // Ring 2
    | 'mechanisms'          // Ring 2
    | 'interactions'        // Ring 2
    | 'triggers'            // Ring 3
    | 'genetics'            // Ring 3
    | 'exposures'           // Ring 3
    | 'frontiers';          // Ring 4

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D';
// A = RCT/Meta-analysis, B = Cohort/Case-control, C = Case report/Series, D = Preclinical/In silico

export type DiscoveryMode = 'THERAPY' | 'SAFETY' | 'ETIOLOGY' | 'RELAPSE';

export type BudgetLevel = 'small' | 'medium' | 'large';
export const BUDGET_LIMITS: Record<BudgetLevel, number> = {
    small: 3,
    medium: 7,
    large: 15
};

// ============================================
// RING NODE
// ============================================

export interface RingNode {
    id: string;
    ring: RingLevel;
    lane: RingLane;
    name: string;
    properties: Record<string, any>;

    // Scoring
    proximity_score: number;        // 0-1, distance sémantique au centre
    evidence_grade: EvidenceGrade;
    translation_gap: boolean;       // Preuve préclinique seulement?

    // Sources
    sources: string[];              // PMIDs, NCTs, etc.
}

// ============================================
// RING EDGE (Connection)
// ============================================

export type EdgeRelationship =
    // Therapeutic
    | 'treats'
    | 'improves'
    | 'worsens'
    // Safety
    | 'causes_AE'
    | 'increases_risk'
    | 'contraindicated_in'
    // Biomarkers
    | 'biomarker_of'
    | 'predicts'
    | 'correlates_with'
    // Mechanisms
    | 'upregulates'
    | 'downregulates'
    | 'activates'
    | 'inhibits'
    | 'shares_pathway_with'
    | 'mechanistically_similar_to'
    // Interactions
    | 'interacts_with'
    | 'substrate_of'
    | 'inhibitor_of'
    // Association
    | 'associated_with'
    | 'risk_factor_for'
    | 'protective_against';

export interface RingEdge {
    id: string;
    source: string;              // Node ID
    target: string;              // Node ID
    relationship: EdgeRelationship;

    // Evidence
    evidence_grade: EvidenceGrade;
    refs: string[];              // PMIDs
    justification: string;       // 1 sentence explanation
    translation_gap: boolean;

    // Scoring
    weight: number;              // 0-1, strength of connection
}

// ============================================
// MICRO-SIGNAL (Weak Signal Detection)
// ============================================

export interface TriangulationAngles {
    epidemio: boolean;           // Epidemiological evidence
    mechanism: boolean;          // Biological mechanism
    pharma: boolean;             // Pharmacological data
    genetic: boolean;            // Genetic/epigenetic evidence
}

export interface MicroSignal {
    id: string;

    // Observation chain
    observation: string;
    entity: string;
    mechanism_path: string[];
    expected_biomarker: string;

    // Hypothesis
    testable_hypothesis: string;
    falsification_test: string;
    kill_criteria: string;

    // Triangulation
    triangulation_angles: TriangulationAngles;
    triangulation_score: number;  // 0-4 (count of angles)

    // Evidence
    supporting_edges: string[];   // Edge IDs
    confidence: number;           // 0-1

    // PubMed queries for further research
    pubmed_queries: string[];
}

// ============================================
// COUNTER-HYPOTHESIS (Anti-Bias)
// ============================================

export interface CounterHypothesis {
    id: string;
    claim: string;
    type: 'base_rate' | 'confounder' | 'alternative_mechanism' | 'contradicting_evidence';

    // Comparison
    why_stronger: string;        // Pourquoi cette hypothèse est plus probable
    why_weaker: string;          // Pourquoi elle est moins probable

    // Evidence
    base_rate?: number;          // Pour type 'base_rate' (ex: 0.85 pour idiopathique)
    refs: string[];
    evidence_grade: EvidenceGrade;
}

// ============================================
// KNOWLEDGE GRAPH OUTPUT
// ============================================

export interface RadialKnowledgeGraph {
    nodes: RingNode[];
    edges: RingEdge[];

    // Organized by rings
    rings: {
        ring: RingLevel;
        lanes: Record<RingLane, RingNode[]>;
    }[];
}

// ============================================
// HYPOTHESIS OUTPUT
// ============================================

export interface RadialHypothesis {
    id: string;
    title: string;
    description: string;

    // Chain of reasoning
    mechanism_chain: string[];
    involved_nodes: string[];    // Node IDs
    involved_edges: string[];    // Edge IDs

    // Scoring
    probability: number;         // 0-100%
    evidence_grade: EvidenceGrade;
    translation_gap: boolean;

    // Testing
    validation_test: string;
    if_validated: string;
    if_refuted: string;

    // Micro-signal link
    micro_signal_id?: string;

    // Counter-hypotheses
    counter_hypotheses: CounterHypothesis[];
}

// ============================================
// REQUEST/RESPONSE
// ============================================

export interface RadialRingsRequest {
    pathology: string;
    subtypes?: string[];         // Ex: ['SSNS', 'SRNS']
    mode: DiscoveryMode;
    budget: BudgetLevel;

    // Context
    context?: {
        patient_age?: number;
        comorbidities?: string[];
        current_treatments?: string[];
        lab_results?: Record<string, number>;
        exposures?: {
            name: string;
            timing: 'prenatal' | 'preconception' | 'childhood' | 'ongoing';
            agent: string;
            person: 'patient' | 'mother' | 'father';
        }[];
        genetic_info?: string[];
    };

    // Mechanistic axes to explore (seed)
    mechanistic_axes?: string[];
}

export interface RadialRingsResponse {
    request_id: string;
    analyzed_at: string;

    // Knowledge graph
    knowledge_graph: RadialKnowledgeGraph;

    // Micro-signals detected
    micro_signals: MicroSignal[];

    // Hypotheses generated
    hypotheses: RadialHypothesis[];

    // Statistics
    stats: {
        total_nodes: number;
        total_edges: number;
        edges_by_ring: Record<RingLevel, number>;
        micro_signals_detected: number;
        hypotheses_generated: number;
    };

    // Next steps
    pubmed_queries: string[];
    clinical_trials_queries: string[];
}

// ============================================
// MECHANISTIC AXES (Configurable Seeds)
// ============================================

export const DEFAULT_MECHANISTIC_AXES: Record<string, string> = {
    'A1': 'Podocyte / filtration barrier / cytoskeleton',
    'A2': 'Immunity (T/B cells, cytokines, permeability)',
    'A3': 'Endothelium / microcirculation / pressure',
    'A4': 'Lipid metabolism / systemic inflammation',
    'A5': 'Coagulation / thrombotic risk',
    'A6': 'Drug toxicity / nephrotoxicity',
    'A7': 'Genetics & epigenetics (renal development, immune response)'
};

// ============================================
// RING LANE CONFIGURATION
// ============================================

export const RING_LANE_CONFIG: Record<RingLevel, RingLane[]> = {
    0: ['pathology'],
    1: ['drugs', 'symptoms', 'biomarkers'],
    2: ['adverse_events', 'mechanisms', 'interactions'],
    3: ['triggers', 'genetics', 'exposures'],
    4: ['frontiers']
};
