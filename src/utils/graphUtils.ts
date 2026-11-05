
import { RingNode, RingEdge, type GraphReference } from '../types/graph';

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

export function getEdgeKey(edge: { source: string; target: string; relationship?: string }): string {
    // Direction and relation are clinical data. A pair can both improve a
    // symptom and cause it in a different context; neither link may disappear.
    return JSON.stringify([edge.source, edge.target, edge.relationship ?? 'ASSOCIATED_WITH']);
}

export function dedupeEdges(edges: RingEdge[]): RingEdge[] {
    const seen = new Map<string, RingEdge>();
    for (const edge of edges) {
        const key = getEdgeKey(edge);
        const previous = seen.get(key);
        if (!previous) { seen.set(key, edge); continue; }
        const references = [...new Map([...(previous.references ?? []), ...(edge.references ?? [])]
            .map(reference => [reference.url, reference])).values()];
        seen.set(key, { ...previous, references,
            rationale: [...new Set([previous.rationale, edge.rationale].filter(Boolean))].join('\n\n'),
            evidence_status: references.length ? 'source_linked' : 'hypothesis' });
    }
    return [...seen.values()];
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
    _sourceNode: RingNode | undefined,
    _targetNode: RingNode | undefined,
    relationship: string,
    _evidenceGrade: string
): { color: string; type: 'positive' | 'danger' | 'contraindication' | 'warning' | 'neutral' | 'deadly'; isDangerous: boolean; showSkull: boolean } => {
    const relation = (relationship ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const style = (color: string, type: 'positive' | 'danger' | 'contraindication' | 'warning' | 'neutral' | 'deadly',
        isDangerous = false, showSkull = false) => ({ color, type, isDangerous, showSkull });
    // Two medicines alone are not evidence of an interaction; a search match
    // and an evidence grade alone are not evidence of benefit or harm.
    if (['SEARCH_RESULT', 'EVIDENCE_GAP', 'ASSOCIATED_WITH', 'COMORBIDITY_INTERACTION'].includes(relation))
        return style('#94a3b8', 'neutral');
    if (/CRITICAL_CI|FATAL|MORTEL/.test(relation)) return style('#ef4444', 'deadly', true, true);
    if (/CONTRAINDIC|CONTRE.INDIC|INTERDIT|INCOMPATIBLE/.test(relation)) return style('#ef4444', 'contraindication', true);
    if (/DANGEROUS|DANGER|TOXIC|TOXIQUE|AGGRAVE/.test(relation)) return style('#ef4444', 'danger', true);
    if (/SIDE_EFFECT|CAUSES|COMPLICATES|WORSENED_BY|INCREASES_EXPOSURE|DECREASES_EXPOSURE|INTERACT|EFFET.INDESIRABLE/.test(relation))
        return style('#f97316', 'warning');
    if (/^(TREATS|IMPROVES|PREVENTS|IMPROVED_BY|MANAGED_BY)$/.test(relation) ||
        /TRAITE|AMELIORE|BENEFIQUE|PROTEGE|PREVIENT|SOULAGE|SYNERGIE/.test(relation)) return style('#22c55e', 'positive');
    if (/DIAGNOSED_BY|MONITOR_WITH|MEASURES|SYMPTOM_OF|MECHANISM/.test(relation)) return style('#06b6d4', 'neutral');
    if (/CAUTION|RISK|PRECAUTION|PRUDENCE|SURVEILLER|RISQUE/.test(relation)) return style('#eab308', 'warning');
    return style('#94a3b8', 'neutral');
};

// ============================================
// DATA TRANSFORMATION
// ============================================

// Transform node from API format to RingNode format
function graphReferences(value: unknown): GraphReference[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(reference => {
        if (!reference || typeof reference.url !== 'string') return [];
        try {
            const url = new URL(reference.url);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return [];
            return [{ id: String(reference.id ?? url.href), title: String(reference.title ?? url.href), url: url.href,
                ...(typeof reference.abstract === 'string' ? { abstract: reference.abstract } : {}),
                ...(typeof reference.year === 'string' ? { year: reference.year } : {}),
                ...(typeof reference.journal === 'string' ? { journal: reference.journal } : {}),
                ...(Array.isArray(reference.publication_types) ? { publication_types: reference.publication_types.filter((type: unknown) => typeof type === 'string') } : {}),
                ...(typeof reference.abstract_truncated === 'boolean' ? { abstract_truncated: reference.abstract_truncated } : {}) }];
        } catch { return []; }
    });
}
const proximity = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(value, 1)) : fallback;
const evidenceGrade = (value: unknown) => typeof value === 'string' && /^[ABCD]$/.test(value) ? value : 'D';

export const transformNode = (node: any, allPathologies: string[], primaryPathology: string): RingNode => {
    // Enforce 7-Ring Semantic Layout
    const typeToRing: Record<string, number> = {
        'PATHOLOGY': 0,
        'SYMPTOM': 1,
        'COMPLICATION': 2,
        'LAB': 3, 'BIOMARKER': 3, 'CAUSE': 3, 'GENE': 3, 'PROTEIN': 3, 'PATHWAY': 3, 'MECHANISM': 3,
        'TREATMENT': 4,
        'DRUG': 5, 'MEDICATION': 5,
        'GUIDELINE': 6, 'EVIDENCE': 6, 'LIFESTYLE': 6, 'SUGGESTION': 6, 'RISK_FACTOR': 6,
    };
    const references = graphReferences(node.references ?? node.properties?.references);
    return {
        id: node.id,
        ring: node.ring !== undefined ? node.ring : (typeToRing[node.node_type] ?? 2),
        lane: node.node_type?.toLowerCase() || 'unknown',
        name: node.label ?? node.name,
        node_type: node.node_type,
        properties: { ...node.properties, description: node.description ?? node.properties?.description,
            source: node.source ?? node.properties?.source, references },
        proximity_score: proximity(node.weight ?? node.proximity_score, 0.7),
        evidence_grade: evidenceGrade(node.evidence_grade),
        evidence_status: references.length ? 'source_linked' : 'hypothesis',
        translation_gap: false,
        category_id: node.category_id,
        subcategory: node.subcategory,
        tags: node.tags,
        parent_pathology: node.parent_pathology || allPathologies[0] || primaryPathology
    };
};

export const transformEdge = (edge: any): RingEdge => {
    const source = edge.source_id ?? edge.source;
    const target = edge.target_id ?? edge.target;
    const relationship = edge.edge_type ?? edge.relationship ?? 'ASSOCIATED_WITH';
    const references = graphReferences(edge.references);
    return { id: getEdgeKey({ source, target, relationship }), source, target, relationship,
        weight: proximity(edge.weight, 0.5), evidence_grade: evidenceGrade(edge.evidence_grade),
        evidence_status: references.length ? 'source_linked' : 'hypothesis', references,
        rationale: typeof edge.rationale === 'string' ? edge.rationale : '', translation_gap: edge.translation_gap === true };
};

/** Merge a research/expansion response without equating same-name concepts from
 * different disease groups or treating a bidirectional pair as one relation. */
export function getNodeConceptKey(node: RingNode): string {
    const normalize = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('fr');
    return JSON.stringify([normalize(node.name),
        ['DRUG', 'MEDICATION'].includes((node.node_type ?? '').toUpperCase()) ? 'DRUG' : (node.node_type ?? node.lane).toUpperCase(),
        normalize(node.parent_pathology ?? '')]);
}

export function mergeRadialResearchGraph(
    current: { nodes: RingNode[]; edges: RingEdge[] },
    incoming: { nodes: any[]; edges: any[] },
    options: { pathologies: string[]; primaryPathology: string; scopeId: string; parentPathology?: string },
): { nodes: RingNode[]; edges: RingEdge[]; unresolvedEdges: number } {
    const normalize = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('fr');
    const nodes = current.nodes.map(node => ({ ...node }));
    const byConcept = new Map(nodes.map(node => [getNodeConceptKey(node), node.id]));
    const responseIds = new Map<string, string>();
    for (const [index, raw] of incoming.nodes.entries()) {
        if (!raw || typeof raw.id !== 'string' || typeof (raw.label ?? raw.name) !== 'string') continue;
        const candidate = transformNode({ ...raw, parent_pathology: raw.parent_pathology ?? options.parentPathology },
            options.pathologies, options.primaryPathology);
        const key = getNodeConceptKey(candidate);
        const existing = byConcept.get(key);
        const id = existing ?? `${options.scopeId}-${index}`;
        responseIds.set(raw.id, id);
        if (existing) {
            const position = nodes.findIndex(node => node.id === existing);
            const previous = nodes[position];
            const references = [...new Map([...(previous.properties.references ?? []), ...(candidate.properties.references ?? [])]
                .map((reference: GraphReference) => [reference.url, reference])).values()];
            nodes[position] = { ...previous, ...candidate, id, evidence_status: references.length ? 'source_linked' : 'hypothesis',
                properties: { ...previous.properties, ...candidate.properties,
                    description: [...new Set([previous.properties.description, candidate.properties.description].filter(Boolean))].join('\n\n'), references } };
        } else { nodes.push({ ...candidate, id }); byConcept.set(key, id); }
    }
    const ids = new Set(nodes.map(node => node.id));
    const byName = new Map<string, string[]>();
    for (const node of nodes) {
        const name = normalize(node.name);
        byName.set(name, [...(byName.get(name) ?? []), node.id]);
    }
    const resolveId = (value: unknown) => {
        if (typeof value !== 'string') return undefined;
        if (responseIds.has(value)) return responseIds.get(value);
        if (ids.has(value)) return value;
        const matches = byName.get(normalize(value));
        // Guessing an ambiguous name would attach evidence to the wrong group.
        return matches?.length === 1 ? matches[0] : undefined;
    };
    const discovered: RingEdge[] = [];
    let unresolvedEdges = 0;
    for (const raw of incoming.edges) {
        const source = resolveId(raw?.source_id ?? raw?.source);
        const target = resolveId(raw?.target_id ?? raw?.target);
        if (!source || !target || source === target) { unresolvedEdges++; continue; }
        discovered.push(transformEdge({ ...raw, source_id: source, target_id: target }));
    }
    return { nodes, edges: dedupeEdges([...current.edges, ...discovered]), unresolvedEdges };
}
