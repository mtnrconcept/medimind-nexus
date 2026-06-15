import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// DISCOVERY GRAPH ENGINE
// Graph neighborhood expansion, pattern mining,
// and multi-criteria hypothesis scoring
// ============================================

interface GraphNode {
    id: string;
    label: string;
    type: string;
    properties?: Record<string, any>;
    frequency?: number;
    centrality?: number;
}

interface GraphEdge {
    source: string;
    target: string;
    type: string;
    weight?: number;
    evidence_count?: number;
    papers?: string[];
}

interface GraphNeighborhood {
    nodes: GraphNode[];
    edges: GraphEdge[];
    center_node: string;
    depth: number;
}

interface CoOccurrencePattern {
    entities: string[];
    frequency: number;
    papers: string[];
    relation_types: string[];
}

interface HypothesisScore {
    novelty: number;        // 0-10: How novel is the hypothesis?
    plausibility: number;   // 0-10: How biologically plausible?
    strength: number;       // 0-10: How strong is the evidence?
    feasibility: number;    // 0-10: How testable is it?
    impact: number;         // 0-10: What's the potential impact?
    total: number;          // Weighted average
    confidence_interval: [number, number];
    rationale: Record<string, string>;
}

// ============================================
// GRAPH OPERATIONS
// ============================================

function buildGraphFromTriples(triples: any[]): { nodes: GraphNode[], edges: GraphEdge[] } {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    for (const triple of triples) {
        // Add subject node
        if (!nodes.has(triple.subject_id)) {
            nodes.set(triple.subject_id, {
                id: triple.subject_id,
                label: triple.subject_name,
                type: triple.subject_type,
                frequency: 1
            });
        } else {
            nodes.get(triple.subject_id)!.frequency!++;
        }

        // Add object node
        if (!nodes.has(triple.object_id)) {
            nodes.set(triple.object_id, {
                id: triple.object_id,
                label: triple.object_name,
                type: triple.object_type,
                frequency: 1
            });
        } else {
            nodes.get(triple.object_id)!.frequency!++;
        }

        // Add edge
        edges.push({
            source: triple.subject_id,
            target: triple.object_id,
            type: triple.relation,
            weight: triple.confidence_score || 0.5,
            evidence_count: triple.provenance?.length || 0
        });
    }

    return {
        nodes: [...nodes.values()],
        edges
    };
}

function expandNeighborhood(
    graph: { nodes: GraphNode[], edges: GraphEdge[] },
    centerId: string,
    depth: number = 2
): GraphNeighborhood {
    const visitedNodes = new Set<string>([centerId]);
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];

    let frontier = [centerId];

    for (let d = 0; d < depth; d++) {
        const nextFrontier: string[] = [];

        for (const nodeId of frontier) {
            // Find connected edges
            for (const edge of graph.edges) {
                let neighborId: string | null = null;

                if (edge.source === nodeId && !visitedNodes.has(edge.target)) {
                    neighborId = edge.target;
                } else if (edge.target === nodeId && !visitedNodes.has(edge.source)) {
                    neighborId = edge.source;
                }

                if (neighborId) {
                    visitedNodes.add(neighborId);
                    nextFrontier.push(neighborId);
                    resultEdges.push(edge);
                }
            }
        }

        frontier = nextFrontier;
    }

    // Collect nodes
    for (const nodeId of visitedNodes) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (node) resultNodes.push(node);
    }

    return {
        nodes: resultNodes,
        edges: resultEdges,
        center_node: centerId,
        depth
    };
}

// ============================================
// PATTERN MINING
// ============================================

function findCoOccurrences(
    triples: any[],
    minFrequency: number = 2
): CoOccurrencePattern[] {
    const coOccurrences = new Map<string, CoOccurrencePattern>();

    // Group triples by paper
    const triplesPerPaper = new Map<string, any[]>();
    for (const triple of triples) {
        for (const paperId of triple.provenance || []) {
            if (!triplesPerPaper.has(paperId)) {
                triplesPerPaper.set(paperId, []);
            }
            triplesPerPaper.get(paperId)!.push(triple);
        }
    }

    // Find entity co-occurrences within papers
    for (const [paperId, paperTriples] of triplesPerPaper.entries()) {
        const entities = new Set<string>();
        const relations = new Set<string>();

        for (const triple of paperTriples) {
            entities.add(triple.subject_id);
            entities.add(triple.object_id);
            relations.add(triple.relation);
        }

        const entityList = [...entities].sort();

        // Generate co-occurrence pairs and triples
        for (let i = 0; i < entityList.length; i++) {
            for (let j = i + 1; j < entityList.length; j++) {
                const key = `${entityList[i]}|${entityList[j]}`;

                if (!coOccurrences.has(key)) {
                    coOccurrences.set(key, {
                        entities: [entityList[i], entityList[j]],
                        frequency: 0,
                        papers: [],
                        relation_types: []
                    });
                }

                const pattern = coOccurrences.get(key)!;
                pattern.frequency++;
                pattern.papers.push(paperId);
                pattern.relation_types.push(...relations);
            }
        }
    }

    // Filter by minimum frequency and deduplicate
    return [...coOccurrences.values()]
        .filter(p => p.frequency >= minFrequency)
        .map(p => ({
            ...p,
            papers: [...new Set(p.papers)],
            relation_types: [...new Set(p.relation_types)]
        }))
        .sort((a, b) => b.frequency - a.frequency);
}

// ============================================
// HYPOTHESIS SCORING
// ============================================

function scoreHypothesis(
    hypothesis: {
        statement: string;
        evidence_citations: string[];
        predictions?: string[];
    },
    evidenceStats: {
        total_papers: number;
        clinical_evidence_count: number;
        in_vivo_count: number;
        in_vitro_count: number;
        supporting_papers: number;
        contradicting_papers: number;
        years_span: number;
        citation_count: number;
    }
): HypothesisScore {
    const rationale: Record<string, string> = {};

    // NOVELTY (0-10)
    // Higher if fewer papers, recent focus, unique combinations
    let novelty = 5;
    if (evidenceStats.total_papers < 5) {
        novelty += 3; // Very few papers = novel area
        rationale.novelty = "Peu d'études existantes, domaine émergent";
    } else if (evidenceStats.total_papers < 20) {
        novelty += 1;
        rationale.novelty = "Nombre modéré d'études, potentiel de découverte";
    } else {
        novelty -= 2;
        rationale.novelty = "Domaine bien étudié";
    }
    novelty = Math.max(0, Math.min(10, novelty));

    // PLAUSIBILITY (0-10)
    // Based on mechanism support and biological reasoning
    let plausibility = 5;
    if (evidenceStats.in_vivo_count > 0 && evidenceStats.in_vitro_count > 0) {
        plausibility += 2; // Both levels of evidence
        rationale.plausibility = "Preuves in vitro ET in vivo";
    }
    if (evidenceStats.contradicting_papers === 0) {
        plausibility += 1;
    } else if (evidenceStats.contradicting_papers > evidenceStats.supporting_papers) {
        plausibility -= 3;
        rationale.plausibility = "Preuves contradictoires importantes";
    }
    plausibility = Math.max(0, Math.min(10, plausibility));

    // STRENGTH (0-10)
    // Quality and consistency of evidence
    let strength = 3;
    if (evidenceStats.clinical_evidence_count > 0) {
        strength += 3;
        rationale.strength = "Preuves cliniques disponibles";
    }
    if (evidenceStats.in_vivo_count >= 3) {
        strength += 2;
    }
    if (evidenceStats.years_span >= 5) {
        strength += 1; // Consistent findings over time
    }
    strength = Math.max(0, Math.min(10, strength));

    // FEASIBILITY (0-10)
    // Can it be tested?
    let feasibility = 5;
    if (hypothesis.predictions && hypothesis.predictions.length >= 2) {
        feasibility += 2;
        rationale.feasibility = "Prédictions testables définies";
    }
    if (evidenceStats.in_vitro_count > 0) {
        feasibility += 1; // Existing models
    }
    feasibility = Math.max(0, Math.min(10, feasibility));

    // IMPACT (0-10)
    // Therapeutic/diagnostic potential
    let impact = 5;
    if (evidenceStats.clinical_evidence_count > 0) {
        impact += 2;
        rationale.impact = "Implications cliniques";
    }
    if (evidenceStats.citation_count > 100) {
        impact += 1; // High interest in field
    }
    impact = Math.max(0, Math.min(10, impact));

    // Weighted total
    const weights = {
        novelty: 0.15,
        plausibility: 0.25,
        strength: 0.25,
        feasibility: 0.20,
        impact: 0.15
    };

    const total =
        novelty * weights.novelty +
        plausibility * weights.plausibility +
        strength * weights.strength +
        feasibility * weights.feasibility +
        impact * weights.impact;

    // Confidence interval based on evidence quantity
    const uncertainty = Math.max(0.5, 2 - (evidenceStats.total_papers / 50));

    return {
        novelty,
        plausibility,
        strength,
        feasibility,
        impact,
        total: Math.round(total * 10) / 10,
        confidence_interval: [
            Math.max(0, total - uncertainty),
            Math.min(10, total + uncertainty)
        ],
        rationale
    };
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { action, ...params } = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Supabase configuration missing");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        switch (action) {
            case 'expand_neighborhood': {
                const { center_id, depth = 2 } = params;

                // Fetch triples from database
                const { data: triples, error } = await supabase
                    .from('discovery_kg_triples')
                    .select('*')
                    .or(`subject_id.eq.${center_id},object_id.eq.${center_id}`)
                    .limit(500);

                if (error) throw error;

                const graph = buildGraphFromTriples(triples || []);
                const neighborhood = expandNeighborhood(graph, center_id, depth);

                return new Response(
                    JSON.stringify(neighborhood),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            case 'find_patterns': {
                const { entity_types, min_frequency = 2, limit = 50 } = params;

                // Fetch triples
                let query = supabase
                    .from('discovery_kg_triples')
                    .select('*');

                if (entity_types) {
                    query = query.in('subject_type', entity_types);
                }

                const { data: triples, error } = await query.limit(1000);

                if (error) throw error;

                const patterns = findCoOccurrences(triples || [], min_frequency);

                return new Response(
                    JSON.stringify({
                        patterns: patterns.slice(0, limit),
                        total_patterns: patterns.length
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            case 'score_hypothesis': {
                const { hypothesis, evidence_stats } = params;

                if (!hypothesis || !evidence_stats) {
                    throw new Error("hypothesis and evidence_stats required");
                }

                const score = scoreHypothesis(hypothesis, evidence_stats);

                return new Response(
                    JSON.stringify(score),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            case 'build_graph': {
                const { triples } = params;

                if (!triples || !Array.isArray(triples)) {
                    throw new Error("triples array required");
                }

                const graph = buildGraphFromTriples(triples);

                return new Response(
                    JSON.stringify(graph),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            default:
                return new Response(
                    JSON.stringify({
                        error: "Unknown action",
                        available_actions: ['expand_neighborhood', 'find_patterns', 'score_hypothesis', 'build_graph']
                    }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
        }
    } catch (error) {
        console.error("Discovery graph engine error:", error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
