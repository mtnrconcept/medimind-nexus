// ============================================
// RADIAL RINGS ENGINE - EDGE GENERATOR
// ============================================
// Génère les connexions "tout-avec-tout" avec pruning intelligent

import {
    RingNode, RingEdge, EdgeRelationship, EvidenceGrade,
    BudgetLevel, BUDGET_LIMITS, DiscoveryMode
} from './types.ts';

// ============================================
// EDGE SCORING FUNCTIONS
// ============================================

/**
 * Calculate semantic similarity between two nodes
 */
function calculateSemanticSimilarity(nodeA: RingNode, nodeB: RingNode): number {
    let score = 0;

    // Ring proximity (closer rings = higher score)
    const ringDiff = Math.abs(nodeA.ring - nodeB.ring);
    score += (4 - ringDiff) * 0.1; // Max 0.4

    // Lane compatibility
    const compatibleLanes: Record<string, string[]> = {
        'drugs': ['adverse_events', 'mechanisms', 'interactions', 'biomarkers'],
        'symptoms': ['biomarkers', 'drugs', 'triggers'],
        'biomarkers': ['drugs', 'symptoms', 'mechanisms', 'genetics'],
        'adverse_events': ['drugs', 'biomarkers', 'mechanisms'],
        'mechanisms': ['drugs', 'genetics', 'biomarkers', 'frontiers'],
        'genetics': ['mechanisms', 'exposures', 'frontiers'],
        'exposures': ['genetics', 'mechanisms', 'triggers'],
        'triggers': ['symptoms', 'exposures'],
        'frontiers': ['mechanisms', 'genetics']
    };

    if (compatibleLanes[nodeA.lane]?.includes(nodeB.lane)) {
        score += 0.3;
    }

    // Name overlap (simple word matching)
    const wordsA = nodeA.name.toLowerCase().split(/\s+/);
    const wordsB = nodeB.name.toLowerCase().split(/\s+/);
    const overlap = wordsA.filter(w => wordsB.includes(w) && w.length > 3).length;
    score += Math.min(overlap * 0.1, 0.3);

    return Math.min(score, 1.0);
}

/**
 * Infer relationship type between nodes based on lanes
 */
function inferRelationship(nodeA: RingNode, nodeB: RingNode): EdgeRelationship {
    const laneA = nodeA.lane;
    const laneB = nodeB.lane;

    // Drug → Adverse Event
    if (laneA === 'drugs' && laneB === 'adverse_events') return 'causes_AE';
    if (laneB === 'drugs' && laneA === 'adverse_events') return 'causes_AE';

    // Drug → Biomarker
    if (laneA === 'drugs' && laneB === 'biomarkers') return 'biomarker_of';
    if (laneB === 'drugs' && laneA === 'biomarkers') return 'biomarker_of';

    // Symptom → Biomarker
    if (laneA === 'symptoms' && laneB === 'biomarkers') return 'predicts';
    if (laneB === 'symptoms' && laneA === 'biomarkers') return 'predicts';

    // Drug → Mechanism
    if ((laneA === 'drugs' && laneB === 'mechanisms') ||
        (laneB === 'drugs' && laneA === 'mechanisms')) {
        return 'activates';
    }

    // Gene → Mechanism
    if ((laneA === 'genetics' && laneB === 'mechanisms') ||
        (laneB === 'genetics' && laneA === 'mechanisms')) {
        return 'upregulates';
    }

    // Exposure → Gene
    if ((laneA === 'exposures' && laneB === 'genetics') ||
        (laneB === 'exposures' && laneA === 'genetics')) {
        return 'associated_with';
    }

    // Trigger → Symptom
    if ((laneA === 'triggers' && laneB === 'symptoms') ||
        (laneB === 'triggers' && laneA === 'symptoms')) {
        return 'worsens';
    }

    // Frontier → Mechanism
    if ((laneA === 'frontiers' && laneB === 'mechanisms') ||
        (laneB === 'frontiers' && laneA === 'mechanisms')) {
        return 'inhibits';
    }

    // Default
    return 'associated_with';
}

/**
 * Calculate evidence grade for an inferred edge
 */
function inferEvidenceGrade(nodeA: RingNode, nodeB: RingNode): EvidenceGrade {
    // Take the weaker of the two node grades
    const gradeOrder: EvidenceGrade[] = ['A', 'B', 'C', 'D'];
    const gradeA = gradeOrder.indexOf(nodeA.evidence_grade);
    const gradeB = gradeOrder.indexOf(nodeB.evidence_grade);
    return gradeOrder[Math.max(gradeA, gradeB)];
}

// ============================================
// EDGE GENERATION
// ============================================

/**
 * Generate candidate edges between rings
 */
function generateCandidateEdges(
    newRingNodes: RingNode[],
    existingNodes: RingNode[]
): RingEdge[] {
    const candidates: RingEdge[] = [];

    for (const newNode of newRingNodes) {
        for (const existingNode of existingNodes) {
            // Skip if same node
            if (newNode.id === existingNode.id) continue;

            // Calculate similarity score
            const similarity = calculateSemanticSimilarity(newNode, existingNode);

            // Only create edge if similarity above threshold
            if (similarity > 0.2) {
                const edge: RingEdge = {
                    id: `edge_${newNode.id}_${existingNode.id}`,
                    source: newNode.id,
                    target: existingNode.id,
                    relationship: inferRelationship(newNode, existingNode),
                    evidence_grade: inferEvidenceGrade(newNode, existingNode),
                    refs: [...newNode.sources, ...existingNode.sources].filter(Boolean).slice(0, 3),
                    justification: `Inferred connection based on lane compatibility and semantic overlap`,
                    translation_gap: newNode.translation_gap || existingNode.translation_gap,
                    weight: similarity
                };
                candidates.push(edge);
            }
        }
    }

    return candidates;
}

// ============================================
// PRUNING
// ============================================

/**
 * Prune edges to stay within budget
 */
function pruneEdges(
    edges: RingEdge[],
    budget: BudgetLevel,
    mode: DiscoveryMode
): RingEdge[] {
    const maxEdgesPerNode = BUDGET_LIMITS[budget];
    const nodeEdgeCounts: Map<string, number> = new Map();
    const prunedEdges: RingEdge[] = [];

    // Apply mode-based boost
    const modeBoost: Record<DiscoveryMode, string[]> = {
        'THERAPY': ['drugs', 'mechanisms'],
        'SAFETY': ['adverse_events', 'interactions'],
        'ETIOLOGY': ['genetics', 'exposures', 'triggers'],
        'RELAPSE': ['triggers', 'biomarkers']
    };

    // Score edges with mode boost
    const scoredEdges = edges.map(edge => {
        let adjustedWeight = edge.weight;

        // Boost if edge connects to priority lanes for this mode
        const priorityLanes = modeBoost[mode];
        if (priorityLanes) {
            // This is simplified - in real implementation would check lane of source/target nodes
            adjustedWeight += 0.1;
        }

        // Boost edges with higher evidence
        const evidenceBoost: Record<EvidenceGrade, number> = { 'A': 0.2, 'B': 0.1, 'C': 0.05, 'D': 0 };
        adjustedWeight += evidenceBoost[edge.evidence_grade];

        return { edge, adjustedWeight };
    });

    // Sort by adjusted weight
    scoredEdges.sort((a, b) => b.adjustedWeight - a.adjustedWeight);

    // Select top edges per node
    for (const { edge } of scoredEdges) {
        const sourceCount = nodeEdgeCounts.get(edge.source) || 0;
        const targetCount = nodeEdgeCounts.get(edge.target) || 0;

        if (sourceCount < maxEdgesPerNode && targetCount < maxEdgesPerNode) {
            prunedEdges.push(edge);
            nodeEdgeCounts.set(edge.source, sourceCount + 1);
            nodeEdgeCounts.set(edge.target, targetCount + 1);
        }
    }

    return prunedEdges;
}

// ============================================
// MAIN EDGE GENERATION FUNCTION
// ============================================

/**
 * Generate all edges for the knowledge graph with pruning
 */
export function generateAllEdges(
    nodes: RingNode[],
    budget: BudgetLevel,
    mode: DiscoveryMode
): RingEdge[] {
    console.log(`[EDGES] Generating edges with budget=${budget}, mode=${mode}`);

    const allEdges: RingEdge[] = [];

    // SIMPLIFIED: Only Ring 0 (center) and Ring 1 (first circle)
    // Ring 1 nodes are connected to their specific pathology (if linked_pathology exists)
    // Otherwise, they connect to all Ring 0 nodes
    const ring0Nodes = nodes.filter(n => n.ring === 0);
    const ring1Nodes = nodes.filter(n => n.ring === 1);

    // Create nodeId lookup for pathology names
    const pathologyNameToNodeId = new Map<string, string>();
    for (const r0Node of ring0Nodes) {
        pathologyNameToNodeId.set(r0Node.name.toLowerCase(), r0Node.id);
    }

    // Create edges from each Ring 1 node to its specific pathology (or all if not specified)
    for (const r1Node of ring1Nodes) {
        const linkedPathology = r1Node.properties?.linked_pathology;

        if (linkedPathology) {
            // Find the specific Ring-0 node for this pathology
            const targetNodeId = pathologyNameToNodeId.get(linkedPathology.toLowerCase());
            const targetNode = ring0Nodes.find(n =>
                n.name.toLowerCase() === linkedPathology.toLowerCase() ||
                n.id === targetNodeId
            );

            if (targetNode) {
                const edge: RingEdge = {
                    id: `edge_${r1Node.id}_${targetNode.id}`,
                    source: r1Node.id,
                    target: targetNode.id,
                    relationship: inferRelationship(r1Node, targetNode),
                    evidence_grade: r1Node.evidence_grade,
                    refs: [...r1Node.sources, ...targetNode.sources].filter(Boolean).slice(0, 3),
                    justification: `Direct association with ${targetNode.name}`,
                    translation_gap: r1Node.translation_gap || targetNode.translation_gap,
                    weight: r1Node.proximity_score
                };
                allEdges.push(edge);
            } else {
                // Fall back to first Ring-0 node if no match found
                console.log(`[EDGES] Warning: No pathology found for "${linkedPathology}", linking to main`);
                if (ring0Nodes[0]) {
                    const edge: RingEdge = {
                        id: `edge_${r1Node.id}_${ring0Nodes[0].id}`,
                        source: r1Node.id,
                        target: ring0Nodes[0].id,
                        relationship: inferRelationship(r1Node, ring0Nodes[0]),
                        evidence_grade: r1Node.evidence_grade,
                        refs: r1Node.sources.filter(Boolean).slice(0, 3),
                        justification: `Association with central pathology`,
                        translation_gap: r1Node.translation_gap,
                        weight: r1Node.proximity_score
                    };
                    allEdges.push(edge);
                }
            }
        } else {
            // No linked_pathology: connect to ALL Ring-0 nodes (backward compatible)
            for (const r0Node of ring0Nodes) {
                const edge: RingEdge = {
                    id: `edge_${r1Node.id}_${r0Node.id}`,
                    source: r1Node.id,
                    target: r0Node.id,
                    relationship: inferRelationship(r1Node, r0Node),
                    evidence_grade: r1Node.evidence_grade,
                    refs: [...r1Node.sources, ...r0Node.sources].filter(Boolean).slice(0, 3),
                    justification: `Direct association with central pathology`,
                    translation_gap: r1Node.translation_gap || r0Node.translation_gap,
                    weight: r1Node.proximity_score
                };
                allEdges.push(edge);
            }
        }
    }

    console.log(`[EDGES] Ring 1→Ring 0: ${allEdges.length} edges (with pathology-specific linking)`);
    console.log(`[EDGES] Total: ${allEdges.length} edges generated`);
    return allEdges;
}

// ============================================
// SPECIAL EDGE DETECTION
// ============================================

/**
 * Find edges that connect exposures to genetics (key for micro-signal detection)
 */
export function findExposureGeneticEdges(edges: RingEdge[], nodes: RingNode[]): RingEdge[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    return edges.filter(edge => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);

        if (!source || !target) return false;

        return (source.lane === 'exposures' && target.lane === 'genetics') ||
            (source.lane === 'genetics' && target.lane === 'exposures');
    });
}

/**
 * Find rare/weak edges (candidates for micro-signal detection)
 */
export function findWeakEdges(edges: RingEdge[]): RingEdge[] {
    return edges.filter(edge =>
        edge.evidence_grade === 'D' ||
        edge.translation_gap === true ||
        edge.weight < 0.4
    );
}
