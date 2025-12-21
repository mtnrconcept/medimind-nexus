
import { RingNode, RingEdge } from '../types/graph';

// ============================================
// WEBGL CHECK
// ============================================

export function isWebGLAvailable(): boolean {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return false;

        // Test if shaders can actually compile
        const webgl = gl as WebGLRenderingContext;

        // Create a simple vertex shader
        const vertShader = webgl.createShader(webgl.VERTEX_SHADER);
        if (!vertShader) return false;

        webgl.shaderSource(vertShader, 'attribute vec4 p;void main(){gl_Position=p;}');
        webgl.compileShader(vertShader);

        if (!webgl.getShaderParameter(vertShader, webgl.COMPILE_STATUS)) {
            webgl.deleteShader(vertShader);
            return false;
        }

        // Create a simple fragment shader
        const fragShader = webgl.createShader(webgl.FRAGMENT_SHADER);
        if (!fragShader) {
            webgl.deleteShader(vertShader);
            return false;
        }

        webgl.shaderSource(fragShader, 'precision mediump float;void main(){gl_FragColor=vec4(1.0);}');
        webgl.compileShader(fragShader);

        if (!webgl.getShaderParameter(fragShader, webgl.COMPILE_STATUS)) {
            webgl.deleteShader(vertShader);
            webgl.deleteShader(fragShader);
            return false;
        }

        // Create and link program
        const program = webgl.createProgram();
        if (!program) {
            webgl.deleteShader(vertShader);
            webgl.deleteShader(fragShader);
            return false;
        }

        webgl.attachShader(program, vertShader);
        webgl.attachShader(program, fragShader);
        webgl.linkProgram(program);

        const success = webgl.getProgramParameter(program, webgl.LINK_STATUS);

        // Cleanup
        webgl.deleteProgram(program);
        webgl.deleteShader(vertShader);
        webgl.deleteShader(fragShader);

        return !!success;
    } catch {
        return false;
    }
}

// ============================================
// DEDUPLICATION UTILS
// ============================================

export function getEdgeKey(edge: RingEdge | { source: string, target: string }): string {
    return [edge.source, edge.target].sort().join('-');
}

export function dedupeEdges(edges: RingEdge[]): RingEdge[] {
    const seen = new Set<string>();
    return edges.filter(edge => {
        const key = getEdgeKey(edge);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ============================================
// SEMANTIC HELPERS
// ============================================

// Helper to check node type
export const isNodeType = (nodeType: string | undefined, types: string[]): boolean => {
    if (!nodeType) return false;
    const upper = nodeType.toUpperCase();
    return types.some(t => upper.includes(t));
};

// Determine edge color based on connected node types and relationship
export const getSemanticEdgeColor = (
    sourceNode: RingNode | undefined,
    targetNode: RingNode | undefined,
    relationship: string,
    evidenceGrade: string
): { color: string; type: 'positive' | 'danger' | 'contraindication' | 'warning' | 'neutral' | 'deadly'; isDangerous: boolean; showSkull: boolean } => {
    const rel = relationship.toUpperCase();
    const sourceType = sourceNode?.node_type?.toUpperCase() || '';
    const targetType = targetNode?.node_type?.toUpperCase() || '';

    // Check for drug-related nodes
    const isDrug = (type: string) => type.includes('DRUG') || type.includes('MEDICATION') || type.includes('MEDICAMENT');
    const isSymptom = (type: string) => type.includes('SYMPTOM') || type.includes('SYMPTOME');
    const isPathology = (type: string) => type.includes('PATHOLOGY') || type.includes('PATHOLOGIE');
    const isTreatment = (type: string) => type.includes('TREATMENT') || type.includes('TRAITEMENT');

    // 1. CONTRE-INDICATION MÉDICAMENT/PATHOLOGIE → Rouge clignotant + tête de mort ☠️
    if ((isDrug(sourceType) && isPathology(targetType)) || (isPathology(sourceType) && isDrug(targetType))) {
        if (rel.includes('CONTRAINDIC') || rel.includes('CONTRE-INDIC') || rel.includes('DANGEROUS') ||
            rel.includes('TOXIC') || rel.includes('INTERDIT') || rel.includes('FATAL')) {
            return { color: '#ef4444', type: 'deadly', isDangerous: true, showSkull: true };
        }
    }

    // 2. INTERACTION ENTRE MÉDICAMENTS → Rouge
    if (isDrug(sourceType) && isDrug(targetType)) {
        if (rel.includes('INTERACT') || rel.includes('CONTRAINDIC') || rel.includes('DANGEROUS') ||
            rel.includes('TOXIC') || rel.includes('INCOMPATIBLE')) {
            return { color: '#ef4444', type: 'danger', isDangerous: true, showSkull: rel.includes('DANGEROUS') || rel.includes('TOXIC') };
        }
        // Default for drug-drug relationship is red (potential interaction)
        return { color: '#ef4444', type: 'danger', isDangerous: false, showSkull: false };
    }

    // 3. SYMPTÔME LIÉ À MÉDICAMENT/TRAITEMENT → Orange
    if ((isSymptom(sourceType) && (isDrug(targetType) || isTreatment(targetType))) ||
        ((isDrug(sourceType) || isTreatment(sourceType)) && isSymptom(targetType))) {
        return { color: '#f97316', type: 'warning', isDangerous: false, showSkull: false };
    }

    // 4. SYMPTÔMES ASSOCIÉS À PATHOLOGIE → Vert
    if ((isSymptom(sourceType) && isPathology(targetType)) || (isPathology(sourceType) && isSymptom(targetType))) {
        return { color: '#22c55e', type: 'positive', isDangerous: false, showSkull: false };
    }

    // 5. TRAITEMENT DE PATHOLOGIE → Vert (bénéfique)
    if ((isTreatment(sourceType) && isPathology(targetType)) || (isPathology(sourceType) && isTreatment(targetType))) {
        if (rel.includes('TREAT') || rel.includes('TRAITE') || rel.includes('MANAGE') || rel.includes('IMPROVE')) {
            return { color: '#22c55e', type: 'positive', isDangerous: false, showSkull: false };
        }
    }

    // Fallback: Use relationship text analysis (legacy logic)
    const relLower = relationship.toLowerCase();

    // Positive/Beneficial relationships
    if (relLower.includes('traite') || relLower.includes('améliore') || relLower.includes('bénéfique') ||
        relLower.includes('thérapeutique') || relLower.includes('efficace') || relLower.includes('protège') ||
        relLower.includes('prévient') || relLower.includes('réduit') || relLower.includes('soulage') ||
        relLower.includes('positive') || relLower.includes('synergie')) {
        return { color: '#22c55e', type: 'positive', isDangerous: false, showSkull: false };
    }

    // Danger/Severe interaction
    if (relLower.includes('danger') || relLower.includes('toxique') || relLower.includes('mortel') ||
        relLower.includes('grave') || relLower.includes('sévère') || relLower.includes('fatal') ||
        relLower.includes('aggrave') || (evidenceGrade === 'A' && relLower.includes('risque'))) {
        return { color: '#ef4444', type: 'danger', isDangerous: true, showSkull: relLower.includes('mortel') || relLower.includes('fatal') };
    }

    // Contraindication
    if (relLower.includes('contre-indic') || relLower.includes('interdit') || relLower.includes('éviter') ||
        relLower.includes('incompatible') || relLower.includes('ne pas') || relLower.includes('exclu')) {
        return { color: '#ef4444', type: 'contraindication', isDangerous: true, showSkull: false };
    }

    // Warning/Slight risk
    if (relLower.includes('précaution') || relLower.includes('prudence') || relLower.includes('surveiller') ||
        relLower.includes('attention') || relLower.includes('modéré') || relLower.includes('possible') ||
        relLower.includes('risque') || relLower.includes('interaction')) {
        return { color: '#eab308', type: 'warning', isDangerous: false, showSkull: false };
    }

    // Neutral/Unknown - use evidence grade for color
    if (evidenceGrade === 'A') return { color: '#22c55e', type: 'positive', isDangerous: false, showSkull: false };
    if (evidenceGrade === 'B') return { color: '#3b82f6', type: 'neutral', isDangerous: false, showSkull: false };
    if (evidenceGrade === 'C') return { color: '#eab308', type: 'warning', isDangerous: false, showSkull: false };
    return { color: '#6b7280', type: 'neutral', isDangerous: false, showSkull: false };
};

// ============================================
// DATA TRANSFORMATION
// ============================================

// Transform node from API format to RingNode format
export const transformNode = (node: any, allPathologies: string[], primaryPathology: string): RingNode => {
    // Enforce 7-Ring Semantic Layout
    const typeToRing: Record<string, number> = {
        'PATHOLOGY': 0,
        'SYMPTOM': 1,
        'COMPLICATION': 2,
        'LAB': 3, 'BIOMARKER': 3, 'CAUSE': 3,
        'TREATMENT': 4,
        'DRUG': 5, 'MEDICATION': 5,
        'GUIDELINE': 6, 'EVIDENCE': 6, 'LIFESTYLE': 6, 'SUGGESTION': 6
    };
    return {
        id: node.id,
        ring: node.ring !== undefined ? node.ring : (typeToRing[node.node_type] ?? 2),
        lane: node.node_type?.toLowerCase() || 'unknown',
        name: node.label,
        node_type: node.node_type,
        properties: { description: node.description, source: node.source },
        proximity_score: node.weight || 0.7,
        evidence_grade: node.weight > 0.8 ? 'A' : node.weight > 0.5 ? 'B' : 'C',
        translation_gap: false,
        category_id: node.category_id,
        subcategory: node.subcategory,
        tags: node.tags,
        parent_pathology: node.parent_pathology || allPathologies[0] || primaryPathology
    };
};

export const transformEdge = (edge: any): RingEdge => ({
    id: `${edge.source_id}-${edge.target_id}`,
    source: edge.source_id,
    target: edge.target_id,
    relationship: edge.edge_type,
    weight: edge.weight || 0.5,
    evidence_grade: edge.weight > 0.8 ? 'A' : edge.weight > 0.5 ? 'B' : 'C',
    translation_gap: false
});
