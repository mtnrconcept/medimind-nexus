/**
 * Medical Knowledge Graph Color Coding System
 * 
 * This configuration file defines the visual system for the knowledge graph:
 * - Node colors based on type (WHAT)
 * - Label colors based on qualification/state (STATE)
 * - Edge styles based on relation and risk (RELATION/RISK)
 * - Scoring formulas and priority rules
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type NodeType =
    | 'MEDICATION'
    | 'TREATMENT'
    | 'SYMPTOM'
    | 'PATHOLOGY'
    | 'COMPLICATION'
    | 'ANALYSIS'
    | 'SUGGESTION';

export type LabelState =
    | 'VALIDATED'
    | 'SUBOPTIMAL'
    | 'MONITORING'
    | 'HIGH_RISK'
    | 'CONTRAINDICATED'
    | 'HYPOTHESIS'
    | 'NEUTRAL';

export type EdgeRelation =
    | 'TREATS_NO_SE'
    | 'TREATS_PARTIAL'
    | 'PREVENTIVE'
    | 'MEASURES'
    | 'SIDE_EFFECT'
    | 'POSSIBLE_SE'
    | 'CONTRAINDICATION'
    | 'CRITICAL_CI'
    | 'ASSOCIATED';

// ============================================================================
// NODE TYPE CONFIGURATION (WHAT)
// ============================================================================

export interface NodeTypeConfig {
    color: string;
    colorHex: string;
    display: string;
    displayFr: string;
    shape: 'circle' | 'diamond' | 'square' | 'hexagon' | 'triangle';
    icon: string;
}

export const NODE_TYPES: Record<NodeType, NodeTypeConfig> = {
    MEDICATION: {
        color: 'green',
        colorHex: '#22c55e',
        display: 'Medication',
        displayFr: 'Médicament',
        shape: 'circle',
        icon: '💊'
    },
    TREATMENT: {
        color: 'blue',
        colorHex: '#3b82f6',
        display: 'Treatment',
        displayFr: 'Traitement',
        shape: 'square',
        icon: '🩺'
    },
    SYMPTOM: {
        color: 'yellow',
        colorHex: '#eab308',
        display: 'Symptom',
        displayFr: 'Symptôme',
        shape: 'diamond',
        icon: '🤒'
    },
    PATHOLOGY: {
        color: 'red',
        colorHex: '#ef4444',
        display: 'Pathology',
        displayFr: 'Pathologie',
        shape: 'hexagon',
        icon: '🦠'
    },
    COMPLICATION: {
        color: 'orange',
        colorHex: '#f97316',
        display: 'Complication',
        displayFr: 'Complication',
        shape: 'triangle',
        icon: '⚡'
    },
    ANALYSIS: {
        color: 'violet',
        colorHex: '#8b5cf6',
        display: 'Analysis',
        displayFr: 'Analyses',
        shape: 'square',
        icon: '🔬'
    },
    SUGGESTION: {
        color: 'gray',
        colorHex: '#9ca3af',
        display: 'Suggestion',
        displayFr: 'Suggestion',
        shape: 'circle',
        icon: '💡'
    }
};

// ============================================================================
// LABEL STATE CONFIGURATION (STATE)
// ============================================================================

export interface LabelStateConfig {
    color: string;
    colorHex: string;
    display: string;
    displayFr: string;
    haloColor: string;
    haloOpacity: number;
    confidenceBoost: number;
    riskBoost: number;
}

export const LABEL_STATES: Record<LabelState, LabelStateConfig> = {
    VALIDATED: {
        color: 'green',
        colorHex: '#22c55e',
        display: 'Validated / Recommended',
        displayFr: 'Validé / Recommandé',
        haloColor: '#22c55e',
        haloOpacity: 0.3,
        confidenceBoost: 0.2,
        riskBoost: -0.1
    },
    SUBOPTIMAL: {
        color: 'blue',
        colorHex: '#3b82f6',
        display: 'Suboptimal',
        displayFr: 'Suboptimal',
        haloColor: '#3b82f6',
        haloOpacity: 0.25,
        confidenceBoost: 0.1,
        riskBoost: 0.05
    },
    MONITORING: {
        color: 'yellow',
        colorHex: '#eab308',
        display: 'To Monitor',
        displayFr: 'À surveiller',
        haloColor: '#eab308',
        haloOpacity: 0.3,
        confidenceBoost: 0,
        riskBoost: 0.15
    },
    HIGH_RISK: {
        color: 'orange',
        colorHex: '#f97316',
        display: 'High Risk',
        displayFr: 'Risque élevé',
        haloColor: '#f97316',
        haloOpacity: 0.35,
        confidenceBoost: 0,
        riskBoost: 0.3
    },
    CONTRAINDICATED: {
        color: 'red',
        colorHex: '#ef4444',
        display: 'Contraindicated',
        displayFr: 'Interdit / CI',
        haloColor: '#ef4444',
        haloOpacity: 0.4,
        confidenceBoost: -0.1,
        riskBoost: 0.5
    },
    HYPOTHESIS: {
        color: 'violet',
        colorHex: '#8b5cf6',
        display: 'Hypothesis',
        displayFr: 'En validation / Hypothèse',
        haloColor: '#8b5cf6',
        haloOpacity: 0.2,
        confidenceBoost: -0.2,
        riskBoost: 0.1
    },
    NEUTRAL: {
        color: 'gray',
        colorHex: '#9ca3af',
        display: 'Neutral / Info',
        displayFr: 'Neutre / Info',
        haloColor: '#9ca3af',
        haloOpacity: 0.15,
        confidenceBoost: 0,
        riskBoost: 0
    }
};

// ============================================================================
// EDGE RELATION CONFIGURATION (RELATION/RISK)
// ============================================================================

export interface EdgeRelationConfig {
    color: string;
    colorHex: string;
    display: string;
    displayFr: string;
    verb: string;
    verbFr: string;
    style: 'solid' | 'dashed';
    width: 'thin' | 'normal' | 'bold';
    icon: string;
    riskLevel: number; // 0-5 scale
    priority: number;  // Higher = drawn on top
    animated: boolean;
    glowEffect: boolean;
}

export const EDGE_RELATIONS: Record<EdgeRelation, EdgeRelationConfig> = {
    TREATS_NO_SE: {
        color: 'green',
        colorHex: '#22c55e',
        display: 'Treats (no side effects)',
        displayFr: 'Traite sans EI',
        verb: 'treats',
        verbFr: 'traite',
        style: 'solid',
        width: 'normal',
        icon: '✅',
        riskLevel: 0,
        priority: 1,
        animated: false,
        glowEffect: false
    },
    TREATS_PARTIAL: {
        color: 'blue',
        colorHex: '#3b82f6',
        display: 'Partially Treats',
        displayFr: 'Traite partiellement',
        verb: 'partially treats',
        verbFr: 'traite partiellement',
        style: 'dashed',
        width: 'normal',
        icon: '🔹',
        riskLevel: 1,
        priority: 2,
        animated: false,
        glowEffect: false
    },
    PREVENTIVE: {
        color: 'teal',
        colorHex: '#14b8a6',
        display: 'Preventive',
        displayFr: 'Préventif',
        verb: 'prevents',
        verbFr: 'prévient',
        style: 'solid',
        width: 'thin',
        icon: '🛡️',
        riskLevel: 0,
        priority: 1,
        animated: false,
        glowEffect: false
    },
    MEASURES: {
        color: 'violet',
        colorHex: '#8b5cf6',
        display: 'Measures',
        displayFr: 'Mesure',
        verb: 'measures',
        verbFr: 'mesure',
        style: 'dashed',
        width: 'thin',
        icon: '📊',
        riskLevel: 0,
        priority: 1,
        animated: false,
        glowEffect: false
    },
    SIDE_EFFECT: {
        color: 'yellow',
        colorHex: '#eab308',
        display: 'Side Effect',
        displayFr: 'Effet indésirable',
        verb: 'causes',
        verbFr: 'cause',
        style: 'solid',
        width: 'normal',
        icon: '⚠️',
        riskLevel: 2,
        priority: 3,
        animated: false,
        glowEffect: false
    },
    POSSIBLE_SE: {
        color: 'amber',
        colorHex: '#f59e0b',
        display: 'Possible Side Effect',
        displayFr: 'EI possible',
        verb: 'may cause',
        verbFr: 'peut causer',
        style: 'dashed',
        width: 'thin',
        icon: '❓',
        riskLevel: 1,
        priority: 2,
        animated: false,
        glowEffect: false
    },
    CONTRAINDICATION: {
        color: 'orange',
        colorHex: '#f97316',
        display: 'Contraindication',
        displayFr: 'Contre-indication',
        verb: 'contraindicates',
        verbFr: 'contre-indique',
        style: 'solid',
        width: 'bold',
        icon: '⛔',
        riskLevel: 4,
        priority: 4,
        animated: false,
        glowEffect: true
    },
    CRITICAL_CI: {
        color: 'red',
        colorHex: '#ef4444',
        display: 'Critical Contraindication',
        displayFr: 'CI critique',
        verb: 'critically contraindicates',
        verbFr: 'contre-indique (critique)',
        style: 'solid',
        width: 'bold',
        icon: '☠️',
        riskLevel: 5,
        priority: 10, // Always on top
        animated: true,
        glowEffect: true
    },
    ASSOCIATED: {
        color: 'gray',
        colorHex: '#9ca3af',
        display: 'Associated',
        displayFr: 'Associé',
        verb: 'is associated with',
        verbFr: 'est associé à',
        style: 'dashed',
        width: 'thin',
        icon: '🔗',
        riskLevel: 0,
        priority: 0,
        animated: false,
        glowEffect: false
    }
};

// ============================================================================
// PRIORITY RULES
// ============================================================================

/**
 * When multiple edges exist between nodes, apply these priority rules:
 * 1. CRITICAL_CI always overrides all other edges
 * 2. CONTRAINDICATION overrides all except CRITICAL_CI
 * 3. Higher riskLevel edges override lower ones
 * 4. For same riskLevel, use the priority field
 */
export function getHighestPriorityEdge(edges: EdgeRelation[]): EdgeRelation {
    if (edges.length === 0) return 'ASSOCIATED';

    // Sort by riskLevel (desc), then by priority (desc)
    const sorted = [...edges].sort((a, b) => {
        const configA = EDGE_RELATIONS[a];
        const configB = EDGE_RELATIONS[b];

        if (configB.riskLevel !== configA.riskLevel) {
            return configB.riskLevel - configA.riskLevel;
        }
        return configB.priority - configA.priority;
    });

    return sorted[0];
}

/**
 * When a node has multiple states, apply these priority rules:
 * 1. CONTRAINDICATED always wins
 * 2. HIGH_RISK overrides all except CONTRAINDICATED
 * 3. MONITORING overrides SUBOPTIMAL, HYPOTHESIS, NEUTRAL
 * 4. VALIDATED/SUBOPTIMAL based on most recent data
 */
export function getHighestPriorityState(states: LabelState[]): LabelState {
    const priorityOrder: LabelState[] = [
        'CONTRAINDICATED',
        'HIGH_RISK',
        'MONITORING',
        'SUBOPTIMAL',
        'HYPOTHESIS',
        'VALIDATED',
        'NEUTRAL'
    ];

    for (const state of priorityOrder) {
        if (states.includes(state)) {
            return state;
        }
    }

    return 'NEUTRAL';
}

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

export interface ScoringInput {
    baseConfidence: number;    // 0-1 base confidence from AI
    labelState: LabelState;
    edgeRelations: EdgeRelation[];
}

export interface ScoringOutput {
    confidenceScore: number;   // 0-1
    riskScore: number;         // 0-1
    actionScore: number;       // 0-1, higher = more actionable
    priorityScore: number;     // Combined score for sorting
}

/**
 * Calculate all scores for a node or edge
 */
export function calculateScores(input: ScoringInput): ScoringOutput {
    const labelConfig = LABEL_STATES[input.labelState];

    // Calculate risk from edges
    let maxEdgeRisk = 0;
    for (const edge of input.edgeRelations) {
        const edgeConfig = EDGE_RELATIONS[edge];
        maxEdgeRisk = Math.max(maxEdgeRisk, edgeConfig.riskLevel / 5);
    }

    // ConfidenceScore = base + label boost, clamped to 0-1
    const confidenceScore = Math.max(0, Math.min(1,
        input.baseConfidence + labelConfig.confidenceBoost
    ));

    // RiskScore = label boost + max edge risk, clamped to 0-1
    const riskScore = Math.max(0, Math.min(1,
        labelConfig.riskBoost + maxEdgeRisk
    ));

    // ActionScore = risk * (1 - confidence) - high risk + low confidence = high action needed
    const actionScore = riskScore * (1 - confidenceScore);

    // PriorityScore = weighted combination for sorting
    // Higher priority = needs attention first
    const priorityScore = (riskScore * 0.4) + (actionScore * 0.4) + ((1 - confidenceScore) * 0.2);

    return {
        confidenceScore,
        riskScore,
        actionScore,
        priorityScore
    };
}

// ============================================================================
// FINAL TAG LOOKUP (Combinatorial Grammar)
// ============================================================================

export interface FinalTagEntry {
    nodeType: NodeType;
    labelState: LabelState;
    edgeRelation: EdgeRelation;
    finalTag: string;
    reading: string;
    readingFr: string;
}

/**
 * Generate the final tag and canonical reading from the triplet
 */
export function getFinalTag(
    nodeType: NodeType,
    labelState: LabelState,
    edgeRelation: EdgeRelation
): FinalTagEntry {
    const nodeConfig = NODE_TYPES[nodeType];
    const labelConfig = LABEL_STATES[labelState];
    const edgeConfig = EDGE_RELATIONS[edgeRelation];

    // Generate final tag
    const finalTag = `${nodeType}_${labelState}_${edgeRelation}`;

    // Generate canonical reading
    const reading = `${nodeConfig.display} (${labelConfig.display}) ${edgeConfig.verb}`;
    const readingFr = `${nodeConfig.displayFr} (${labelConfig.displayFr}) ${edgeConfig.verbFr}`;

    return {
        nodeType,
        labelState,
        edgeRelation,
        finalTag,
        reading,
        readingFr
    };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get node color based on type
 */
export function getNodeColor(nodeType: NodeType | string): string {
    const config = NODE_TYPES[nodeType as NodeType];
    return config?.colorHex ?? NODE_TYPES.SUGGESTION.colorHex;
}

/**
 * Get label color based on state
 */
export function getLabelColor(labelState: LabelState | string): string {
    const config = LABEL_STATES[labelState as LabelState];
    return config?.colorHex ?? LABEL_STATES.NEUTRAL.colorHex;
}

/**
 * Get edge style configuration
 */
export function getEdgeStyle(edgeRelation: EdgeRelation | string): EdgeRelationConfig {
    const config = EDGE_RELATIONS[edgeRelation as EdgeRelation];
    return config ?? EDGE_RELATIONS.ASSOCIATED;
}

/**
 * Get halo configuration for a label state
 */
export function getHaloConfig(labelState: LabelState | string): { color: string; opacity: number } {
    const config = LABEL_STATES[labelState as LabelState];
    return {
        color: config?.haloColor ?? LABEL_STATES.NEUTRAL.haloColor,
        opacity: config?.haloOpacity ?? LABEL_STATES.NEUTRAL.haloOpacity
    };
}

/**
 * Map legacy node types to new system
 */
export function mapLegacyNodeType(legacyType: string): NodeType {
    const mapping: Record<string, NodeType> = {
        'medication': 'MEDICATION',
        'drug': 'MEDICATION',
        'medicine': 'MEDICATION',
        'treatment': 'TREATMENT',
        'therapy': 'TREATMENT',
        'symptom': 'SYMPTOM',
        'sign': 'SYMPTOM',
        'pathology': 'PATHOLOGY',
        'disease': 'PATHOLOGY',
        'condition': 'PATHOLOGY',
        'complication': 'COMPLICATION',
        'side_effect': 'COMPLICATION',
        'analysis': 'ANALYSIS',
        'test': 'ANALYSIS',
        'lab': 'ANALYSIS',
        'suggestion': 'SUGGESTION',
        'recommendation': 'SUGGESTION'
    };

    const normalized = legacyType.toLowerCase().trim();
    return mapping[normalized] ?? 'SUGGESTION';
}

/**
 * Map legacy relation types to new edge system
 */
export function mapLegacyRelationType(legacyRelation: string): EdgeRelation {
    const mapping: Record<string, EdgeRelation> = {
        'treats': 'TREATS_NO_SE',
        'treats_with_se': 'SIDE_EFFECT',
        'treats_partial': 'TREATS_PARTIAL',
        'prevents': 'PREVENTIVE',
        'measures': 'MEASURES',
        'causes': 'SIDE_EFFECT',
        'may_cause': 'POSSIBLE_SE',
        'contraindicates': 'CONTRAINDICATION',
        'contraindicated': 'CONTRAINDICATION',
        'critical_ci': 'CRITICAL_CI',
        'associated': 'ASSOCIATED',
        'related': 'ASSOCIATED',
        'linked': 'ASSOCIATED'
    };

    const normalized = legacyRelation.toLowerCase().trim();
    return mapping[normalized] ?? 'ASSOCIATED';
}

// ============================================================================
// EXPORT DEFAULT CONFIG OBJECT
// ============================================================================

export const GRAPH_CONFIG = {
    nodeTypes: NODE_TYPES,
    labelStates: LABEL_STATES,
    edgeRelations: EDGE_RELATIONS,
    getNodeColor,
    getLabelColor,
    getEdgeStyle,
    getHaloConfig,
    calculateScores,
    getFinalTag,
    getHighestPriorityEdge,
    getHighestPriorityState,
    mapLegacyNodeType,
    mapLegacyRelationType
} as const;

export default GRAPH_CONFIG;
