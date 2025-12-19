// ============================================
// SEMANTIC GRAPH ENGINE
// Core engine for semantic mind map with:
// - Cache-first strategy
// - Rules R1-R5 implementation
// - Multi-source integration
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// TYPES
// ============================================

interface SemanticNode {
    id: string;
    node_type: string;
    label: string;
    description?: string;
    attributes: Record<string, any>;
    source: string;
}

interface SemanticEdge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    edge_type: string;
    meta: {
        direction?: string;
        weight?: number;
        rationale?: string;
        tags?: string[];
        evidence_level?: string;
        source_refs?: string[];
    };
}

interface GraphPayload {
    nodes: SemanticNode[];
    edges: SemanticEdge[];
    metrics: {
        node_count: number;
        edge_count: number;
        compute_time_ms: number;
        from_cache: boolean;
    };
}

interface RequestParams {
    central_node_id?: string;
    central_label?: string;
    central_type?: string;
    max_nodes?: number;
    min_weight?: number;
    include_types?: string[];
    exclude_types?: string[];
    // NEW: Category and edge type filtering
    include_categories?: string[];
    exclude_categories?: string[];
    include_edge_types?: string[];
    exclude_edge_types?: string[];
    layout_profile?: 'radial' | 'force' | 'radial_force_hybrid';
    explain_mode?: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateCacheKey(nodeId: string, params: RequestParams, version: number): string {
    const paramsStr = JSON.stringify({
        max_nodes: params.max_nodes || 50,
        min_weight: params.min_weight || 0.3,
        include_types: params.include_types?.sort() || [],
        exclude_types: params.exclude_types?.sort() || [],
        include_categories: params.include_categories?.sort() || [],
        exclude_categories: params.exclude_categories?.sort() || [],
        include_edge_types: params.include_edge_types?.sort() || [],
        exclude_edge_types: params.exclude_edge_types?.sort() || []
    });
    return `${nodeId}:${paramsStr}:v${version}`;
}

// ============================================
// RULE ENGINE
// ============================================

// R1: Relation directe (distance 1, seuil pertinence)
function applyRuleR1(edges: SemanticEdge[], minWeight: number): SemanticEdge[] {
    return edges.filter(e => {
        const weight = e.meta?.weight || 0.5;
        return weight >= minWeight;
    });
}

// R2: Qualité > exhaustivité (pas de liens génériques faibles)
function applyRuleR2(edges: SemanticEdge[]): SemanticEdge[] {
    return edges.filter(e => {
        // Reject weak ASSOCIATED_WITH links
        if (e.edge_type === 'ASSOCIATED_WITH') {
            const weight = e.meta?.weight || 0.5;
            const hasRationale = !!e.meta?.rationale;
            // Only keep if weight > 0.6 OR has explicit rationale
            return weight > 0.6 || hasRationale;
        }
        return true;
    });
}

// R3: Explicabilité obligatoire (type + rationale + score)
function applyRuleR3(edges: SemanticEdge[]): SemanticEdge[] {
    return edges.map(e => {
        // Ensure all edges have minimum metadata
        if (!e.meta) e.meta = {};
        if (!e.meta.rationale) {
            e.meta.rationale = generateDefaultRationale(e.edge_type);
        }
        if (e.meta.weight === undefined) {
            e.meta.weight = 0.5;
        }
        return e;
    });
}

function generateDefaultRationale(edgeType: string): string {
    const rationales: Record<string, string> = {
        'TREATS': 'Ce traitement est indiqué pour cette pathologie',
        'ASSOCIATED_WITH': 'Association clinique observée',
        'CAUSES': 'Relation causale établie',
        'LEADS_TO': 'Évolution possible',
        'RISK_INCREASED_BY': 'Facteur de risque identifié',
        'INDICATED_IF': 'Indication conditionnelle',
        'CONTRAINDICATED_IF': 'Contre-indication formelle',
        'MANAGED_BY': 'Stratégie de prise en charge',
        'COMPLICATES': 'Complication connue',
        'MONITOR_WITH': 'Surveillance recommandée',
        // NEW edge types
        'TARGETS': 'Cible thérapeutique identifiée',
        'BIOMARKER_OF': 'Biomarqueur de cette condition',
        'DIAGNOSED_BY': 'Méthode diagnostique',
        'PREDISPOSED_BY': 'Prédisposition génétique/terrain',
        'WORSENED_BY': 'Facteur aggravant',
        'IMPROVED_BY': 'Facteur d\'amélioration',
        'INTERACTS_WITH': 'Interaction médicamenteuse',
        'CONFLICTS_WITH': 'Conflit/contre-indication',
        'PREVENTS': 'Effet préventif'
    };
    return rationales[edgeType] || 'Relation sémantique';
}

// R5: Gestion densité (top N par catégorie)
function applyRuleR5(nodes: SemanticNode[], edges: SemanticEdge[], maxPerCategory: number = 10): {
    nodes: SemanticNode[];
    edges: SemanticEdge[];
} {
    // Group nodes by type
    const nodesByType = new Map<string, SemanticNode[]>();
    for (const node of nodes) {
        if (!nodesByType.has(node.node_type)) {
            nodesByType.set(node.node_type, []);
        }
        nodesByType.get(node.node_type)!.push(node);
    }

    // Get node IDs with their edge weights for sorting
    const nodeWeights = new Map<string, number>();
    for (const edge of edges) {
        const weight = edge.meta?.weight || 0.5;
        const targetId = edge.target_node_id;
        nodeWeights.set(targetId, Math.max(nodeWeights.get(targetId) || 0, weight));
    }

    // Keep top N per category, sorted by weight
    const filteredNodes: SemanticNode[] = [];
    const keptNodeIds = new Set<string>();

    for (const [type, typeNodes] of nodesByType) {
        const sorted = typeNodes.sort((a, b) => {
            return (nodeWeights.get(b.id) || 0) - (nodeWeights.get(a.id) || 0);
        });
        const kept = sorted.slice(0, maxPerCategory);
        filteredNodes.push(...kept);
        kept.forEach(n => keptNodeIds.add(n.id));
    }

    // Filter edges to only kept nodes
    const filteredEdges = edges.filter(e =>
        keptNodeIds.has(e.source_node_id) || keptNodeIds.has(e.target_node_id)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const startTime = Date.now();

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const params: RequestParams = await req.json();

        // ============================================
        // STEP 1: Find or validate central node
        // ============================================

        let centralNode: SemanticNode | null = null;

        if (params.central_node_id) {
            const { data } = await supabase
                .from('semantic_nodes')
                .select('*')
                .eq('id', params.central_node_id)
                .single();
            centralNode = data;
        } else if (params.central_label) {
            const query = supabase
                .from('semantic_nodes')
                .select('*')
                .ilike('label', `%${params.central_label}%`);

            if (params.central_type) {
                query.eq('node_type', params.central_type);
            }

            const { data } = await query.limit(1).single();
            centralNode = data;
        }

        if (!centralNode) {
            return new Response(
                JSON.stringify({ error: "Central node not found" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[SEMANTIC] Central node: ${centralNode.label} (${centralNode.node_type})`);

        // ============================================
        // STEP 2: Check cache
        // ============================================

        const { data: versionData } = await supabase.rpc('get_knowledge_version');
        const knowledgeVersion = versionData || 1;
        const cacheKey = generateCacheKey(centralNode.id, params, knowledgeVersion);

        const { data: cachedPayload } = await supabase.rpc('get_graph_cache', {
            p_cache_key: cacheKey
        });

        if (cachedPayload) {
            console.log(`[SEMANTIC] Cache HIT for ${cacheKey}`);
            const payload = cachedPayload as GraphPayload;
            payload.metrics.from_cache = true;
            payload.metrics.compute_time_ms = Date.now() - startTime;

            return new Response(
                JSON.stringify({ success: true, central_node: centralNode, ...payload }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[SEMANTIC] Cache MISS - computing graph for ${centralNode.label}`);

        // ============================================
        // STEP 3: Fetch neighbors (R1: distance 1)
        // ============================================

        const minWeight = params.min_weight || 0.3;
        const maxNodes = params.max_nodes || 50;

        // Use v2 function with category/edge type filtering
        const { data: neighbors } = await supabase.rpc('get_node_neighbors_v2', {
            p_node_id: centralNode.id,
            p_max_results: maxNodes * 2, // Fetch extra for filtering
            p_min_weight: minWeight,
            p_include_categories: params.include_categories || null,
            p_exclude_categories: params.exclude_categories || null,
            p_include_edge_types: params.include_edge_types || null,
            p_exclude_edge_types: params.exclude_edge_types || null
        });

        if (!neighbors || neighbors.length === 0) {
            // No neighbors - return just central node
            const payload: GraphPayload = {
                nodes: [centralNode],
                edges: [],
                metrics: {
                    node_count: 1,
                    edge_count: 0,
                    compute_time_ms: Date.now() - startTime,
                    from_cache: false
                }
            };

            return new Response(
                JSON.stringify({ success: true, central_node: centralNode, ...payload }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ============================================
        // STEP 4: Build nodes and edges
        // ============================================

        const nodeMap = new Map<string, SemanticNode>();
        nodeMap.set(centralNode.id, centralNode);

        let edges: SemanticEdge[] = [];

        for (const neighbor of neighbors) {
            // Add neighbor node
            if (!nodeMap.has(neighbor.node_id)) {
                nodeMap.set(neighbor.node_id, {
                    id: neighbor.node_id,
                    node_type: neighbor.node_type,
                    label: neighbor.label,
                    attributes: neighbor.attributes || {},
                    source: 'local'
                });
            }

            // Add edge
            edges.push({
                id: neighbor.edge_id,
                source_node_id: neighbor.direction === 'outgoing' ? centralNode.id : neighbor.node_id,
                target_node_id: neighbor.direction === 'outgoing' ? neighbor.node_id : centralNode.id,
                edge_type: neighbor.edge_type,
                meta: neighbor.edge_meta || {}
            });
        }

        // ============================================
        // STEP 5: Apply semantic rules
        // ============================================

        // R1: Already applied via min_weight in query
        // R2: Quality > exhaustivity
        edges = applyRuleR2(edges);

        // R3: Explicability
        edges = applyRuleR3(edges);

        // R5: Density management
        const maxPerCategory = Math.ceil(maxNodes / 5); // Distribute across ~5 categories
        const filtered = applyRuleR5(Array.from(nodeMap.values()), edges, maxPerCategory);

        // Ensure central node is always included
        if (!filtered.nodes.find(n => n.id === centralNode.id)) {
            filtered.nodes.unshift(centralNode);
        }

        // ============================================
        // STEP 6: Build payload and cache
        // ============================================

        const payload: GraphPayload = {
            nodes: filtered.nodes,
            edges: filtered.edges,
            metrics: {
                node_count: filtered.nodes.length,
                edge_count: filtered.edges.length,
                compute_time_ms: Date.now() - startTime,
                from_cache: false
            }
        };

        // Cache the result (fire and forget)
        supabase.rpc('set_graph_cache', {
            p_cache_key: cacheKey,
            p_central_node_id: centralNode.id,
            p_params_hash: JSON.stringify(params),
            p_knowledge_version: knowledgeVersion,
            p_payload: payload
        }).then(
            () => console.log(`[SEMANTIC] Cached result for ${cacheKey}`),
            (err) => console.error(`[SEMANTIC] Cache write failed:`, err)
        );

        console.log(`[SEMANTIC] Returning ${payload.nodes.length} nodes, ${payload.edges.length} edges`);

        return new Response(
            JSON.stringify({ success: true, central_node: centralNode, ...payload }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("[SEMANTIC] Error:", error);
        return new Response(
            JSON.stringify({ error: "Graph computation failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
