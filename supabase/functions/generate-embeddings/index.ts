import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEmbeddings } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmbeddingRequest {
    node_ids?: string[];
    batch_size?: number;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey);

        const body: EmbeddingRequest = await req.json().catch(() => ({}));
        const batchSize = body.batch_size || 50;

        let nodes: any[];

        if (body.node_ids && body.node_ids.length > 0) {
            // Process specific nodes
            const { data, error } = await supabase
                .from("cde_nodes")
                .select("id, name, node_type, properties")
                .in("id", body.node_ids);

            if (error) throw error;
            nodes = data || [];
        } else {
            // Get nodes without embeddings
            const { data, error } = await supabase.rpc("get_nodes_without_embeddings", {
                batch_limit: batchSize
            });

            if (error) throw error;
            nodes = data || [];
        }

        if (nodes.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: "No nodes to process",
                    processed: 0
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`Processing ${nodes.length} nodes for embeddings...`);

        // Prepare texts for embedding
        const texts = nodes.map(node => {
            const props = node.properties || {};
            const description = props.description || props.summary || "";
            const category = props.category || node.node_type || "";

            return `${node.name}. Type: ${category}. ${description}`.trim();
        });

        const embeddings = await createEmbeddings(texts, {
            model: "text-embedding-3-small",
            dimensions: 1536,
        });
        if (embeddings.length !== nodes.length) {
            console.warn(`Embedding count mismatch: expected ${nodes.length}, got ${embeddings.length}`);
        }

        // Update each node with its embedding
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const embedding = embeddings[i];
            if (!embedding) {
                console.error(`Missing embedding for node ${node.id}`);
                errorCount++;
                continue;
            }

            // Convert to pgvector format
            const vectorString = `[${embedding.join(",")}]`;

            const { error } = await supabase
                .from("cde_nodes")
                .update({ embedding: vectorString })
                .eq("id", node.id);

            if (error) {
                console.error(`Failed to update node ${node.id}:`, error);
                errorCount++;
            } else {
                successCount++;
            }
        }

        // Check if there are more nodes to process
        const { data: remaining } = await supabase.rpc("get_nodes_without_embeddings", {
            batch_limit: 1
        });

        const hasMore = remaining && remaining.length > 0;

        return new Response(
            JSON.stringify({
                success: true,
                processed: successCount,
                errors: errorCount,
                total_batch: nodes.length,
                has_more: hasMore,
                message: hasMore
                    ? `Processed ${successCount} nodes. More nodes pending.`
                    : `Completed! All ${successCount} nodes have embeddings.`
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
