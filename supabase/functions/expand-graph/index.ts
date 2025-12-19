// ============================================
// EXPAND GRAPH - Progressive Node Expansion
// ============================================
// Returns new nodes and edges when expanding from a node
// Uses caching to avoid recalculating existing relationships

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExpandRequest {
    center_node: string;          // Node to expand from
    existing_nodes: string[];     // Nodes already on canvas
    node_type?: string;           // Type of the center node (drug, symptom, etc.)
}

interface NodeData {
    id: string;
    name: string;
    node_type: string;
    properties: Record<string, any>;
}

interface EdgeData {
    id: string;
    source: string;
    target: string;
    relationship: string;
    weight: number;
    evidence_grade: string;
    link_type: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const body: ExpandRequest = await req.json();
        const { center_node, existing_nodes = [], node_type } = body;

        if (!center_node) {
            return new Response(
                JSON.stringify({ error: "center_node is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[EXPAND] Expanding from: ${center_node}`);
        console.log(`[EXPAND] Existing nodes: ${existing_nodes.length}`);

        const newNodes: NodeData[] = [];
        const newEdges: EdgeData[] = [];
        const existingSet = new Set(existing_nodes.map(n => n.toLowerCase()));

        // 1. Get cached links for this node
        const { data: cachedLinks } = await supabase.rpc('get_node_links', {
            node_name: center_node
        });

        console.log(`[EXPAND] Found ${cachedLinks?.length || 0} cached links`);

        // Add cached links that connect to existing nodes
        for (const link of (cachedLinks || [])) {
            const otherNode = link.source_name === center_node ? link.target_name : link.source_name;

            // If the other node is already on canvas, add the edge
            if (existingSet.has(otherNode.toLowerCase())) {
                newEdges.push({
                    id: link.id,
                    source: link.source_name,
                    target: link.target_name,
                    relationship: link.relationship,
                    weight: link.weight,
                    evidence_grade: link.evidence_grade,
                    link_type: link.link_type
                });
            }
        }

        // 2. Find related nodes from database tables
        const relatedNodes: { name: string; type: string; properties: any }[] = [];

        // Get symptoms related to pathologies
        const { data: symptoms } = await supabase
            .from('pathology_symptoms')
            .select('*, symptoms(id, name, description, body_system), pathologies(name)')
            .or(`pathologies.name.ilike.%${center_node}%`)
            .limit(15);

        for (const ps of (symptoms || [])) {
            if (ps.symptoms && !existingSet.has(ps.symptoms.name.toLowerCase())) {
                relatedNodes.push({
                    name: ps.symptoms.name,
                    type: 'symptom',
                    properties: { body_system: ps.symptoms.body_system, is_primary: ps.is_primary }
                });
            }
        }

        // Get treatments
        const { data: treatments } = await supabase
            .from('treatments')
            .select('*, pathologies(name)')
            .or(`pathologies.name.ilike.%${center_node}%,name.ilike.%${center_node}%`)
            .limit(10);

        for (const t of (treatments || [])) {
            if (!existingSet.has(t.name.toLowerCase())) {
                relatedNodes.push({
                    name: t.name,
                    type: 'treatment',
                    properties: { type: t.type, description: t.description }
                });
            }
        }

        // Get medications
        const { data: medications } = await supabase
            .from('medications')
            .select('id, name, mechanism, atc_code')
            .ilike('name', `%${center_node}%`)
            .limit(10);

        for (const m of (medications || [])) {
            if (!existingSet.has(m.name.toLowerCase())) {
                relatedNodes.push({
                    name: m.name,
                    type: 'medication',
                    properties: { mechanism: m.mechanism, atc_code: m.atc_code }
                });
            }
        }

        // Get drug interactions
        const { data: interactions } = await supabase
            .from('drug_interactions')
            .select('*')
            .or(`interacting_drug.ilike.%${center_node}%`)
            .limit(10);

        for (const inter of (interactions || [])) {
            if (!existingSet.has(inter.interacting_drug.toLowerCase())) {
                relatedNodes.push({
                    name: inter.interacting_drug,
                    type: 'interaction',
                    properties: { severity: inter.severity, mechanism: inter.mechanism }
                });

                // Cache this interaction link
                await supabase.rpc('upsert_node_link', {
                    p_source: center_node,
                    p_target: inter.interacting_drug,
                    p_relationship: `interaction_${inter.severity}`,
                    p_weight: inter.severity === 'major' ? 0.9 : 0.6,
                    p_evidence_grade: 'B',
                    p_link_type: 'drug_interaction',
                    p_properties: { severity: inter.severity }
                });
            }
        }

        // Get side effects
        const { data: sideEffects } = await supabase
            .from('side_effects')
            .select('id, name, severity, frequency')
            .limit(10);

        for (const se of (sideEffects || []).slice(0, 5)) {
            if (!existingSet.has(se.name.toLowerCase())) {
                relatedNodes.push({
                    name: se.name,
                    type: 'side_effect',
                    properties: { severity: se.severity, frequency: se.frequency }
                });
            }
        }

        // 3. Create new nodes and edges
        for (const related of relatedNodes) {
            const nodeId = `node_${related.name.replace(/\s+/g, '_').substring(0, 50)}`;

            newNodes.push({
                id: nodeId,
                name: related.name,
                node_type: related.type,
                properties: related.properties
            });

            // Create edge to center
            const edgeId = `edge_${center_node}_${related.name}`.replace(/\s+/g, '_').substring(0, 100);
            newEdges.push({
                id: edgeId,
                source: center_node,
                target: related.name,
                relationship: `related_${related.type}`,
                weight: 0.7,
                evidence_grade: 'B',
                link_type: related.type
            });

            // Cache this link
            await supabase.rpc('upsert_node_link', {
                p_source: center_node,
                p_target: related.name,
                p_relationship: `related_${related.type}`,
                p_weight: 0.7,
                p_evidence_grade: 'B',
                p_link_type: related.type,
                p_properties: related.properties
            });
        }

        // 4. Find inter-node connections between new nodes and existing nodes
        const allNodeNames = [...existing_nodes, ...newNodes.map(n => n.name)];
        const { data: interLinks } = await supabase.rpc('get_links_between_nodes', {
            node_names: allNodeNames
        });

        for (const link of (interLinks || [])) {
            // Only add if not already in newEdges
            if (!newEdges.some(e => e.source === link.source_name && e.target === link.target_name)) {
                newEdges.push({
                    id: link.id,
                    source: link.source_name,
                    target: link.target_name,
                    relationship: link.relationship,
                    weight: link.weight,
                    evidence_grade: link.evidence_grade,
                    link_type: link.link_type
                });
            }
        }

        console.log(`[EXPAND] Returning ${newNodes.length} new nodes, ${newEdges.length} new edges`);

        return new Response(
            JSON.stringify({
                success: true,
                new_nodes: newNodes,
                new_edges: newEdges,
                center_node,
                stats: {
                    new_nodes_count: newNodes.length,
                    new_edges_count: newEdges.length,
                    cached_links_found: cachedLinks?.length || 0
                }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("[EXPAND] Error:", error);
        return new Response(
            JSON.stringify({ error: "Expansion failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
