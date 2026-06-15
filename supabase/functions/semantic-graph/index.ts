import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GraphRequest {
    central_node_id?: string;
    central_node_name?: string;
    max_nodes?: number;
    similarity_threshold?: number;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const body: GraphRequest = await req.json().catch(() => ({}));

        let centralNodeId = body.central_node_id;
        const maxNodes = body.max_nodes || 100;
        const similarityThreshold = body.similarity_threshold || 0.3;

        // If no central node specified, find one by name or use first available
        if (!centralNodeId && body.central_node_name) {
            const { data: foundNode } = await supabase
                .from("cde_nodes")
                .select("id")
                .ilike("name", `%${body.central_node_name}%`)
                .limit(1)
                .single();

            if (foundNode) {
                centralNodeId = foundNode.id;
            }
        }

        // If still no central node, get one with an embedding
        if (!centralNodeId) {
            const { data: anyNode } = await supabase
                .from("cde_nodes")
                .select("id")
                .not("embedding", "is", null)
                .limit(1)
                .single();

            if (anyNode) {
                centralNodeId = anyNode.id;
            } else {
                // No nodes with embeddings, return empty graph
                return new Response(
                    JSON.stringify({
                        success: true,
                        knowledge_graph: {
                            nodes: [],
                            edges: [],
                            central_node: null
                        },
                        message: "No nodes with embeddings found. Run generate-embeddings first."
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // Call the database function to get semantic graph
        const { data: graphData, error } = await supabase.rpc("get_semantic_graph", {
            central_node_id: centralNodeId,
            max_nodes: maxNodes,
            similarity_threshold: similarityThreshold
        });

        if (error) {
            console.error("Graph query error:", error);
            throw error;
        }

        // Transform to frontend format
        const nodes = (graphData?.nodes || []).map((node: any) => ({
            id: node.id,
            name: node.name,
            node_type: node.node_type,
            ring: node.ring,
            lane: node.lane,
            proximity_score: node.proximity_score,
            properties: node.properties || {}
        }));

        const edges = (graphData?.edges || []).map((edge: any) => ({
            source: edge.source,
            target: edge.target,
            relationship: edge.relationship,
            evidence_grade: edge.evidence_grade,
            weight: edge.weight,
            translation_gap: edge.translation_gap
        }));

        return new Response(
            JSON.stringify({
                success: true,
                knowledge_graph: {
                    nodes,
                    edges,
                    central_node: centralNodeId
                },
                stats: {
                    total_nodes: nodes.length,
                    total_edges: edges.length,
                    rings: {
                        ring0: nodes.filter((n: any) => n.ring === 0).length,
                        ring1: nodes.filter((n: any) => n.ring === 1).length,
                        ring2: nodes.filter((n: any) => n.ring === 2).length,
                        ring3: nodes.filter((n: any) => n.ring === 3).length,
                        ring4: nodes.filter((n: any) => n.ring === 4).length,
                    }
                }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
        );
    }
});
