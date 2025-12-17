import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * NEURAL KNOWLEDGE GRAPH - Embedding & Network Initialization
 * 
 * Features:
 * - Generate embeddings for nodes using AI
 * - Auto-link nodes based on semantic similarity
 * - Activate and propagate through network
 * - Reinforce learning (Hebbian)
 * - Cluster nodes semantically
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate embeddings using OpenAI or local model
async function generateEmbedding(text: string, apiKey?: string): Promise<number[] | null> {
    try {
        // Use OpenAI embeddings API (or substitute with local model)
        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                input: text,
                model: "text-embedding-3-small", // 1536D, will need to truncate/project to 384D
                dimensions: 384 // OpenAI supports dimension reduction
            })
        });

        if (!response.ok) {
            console.error("Embedding error:", await response.text());
            return null;
        }

        const data = await response.json();
        return data.data?.[0]?.embedding || null;
    } catch (e) {
        console.error("Embedding generation failed:", e);
        return null;
    }
}

// Alternative: Use Claude for embeddings via description generation
async function generateNodeDescription(node: any, claudeApiKey: string): Promise<string> {
    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": claudeApiKey,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 200,
                messages: [{
                    role: "user",
                    content: `Generate a concise medical description for embedding about: "${node.name}" (type: ${node.node_type}). Include key medical properties, mechanisms, and relationships. Keep it under 100 words.`
                }]
            })
        });

        if (!response.ok) return node.name;

        const data = await response.json();
        return data.content?.[0]?.text || node.name;
    } catch (e) {
        return node.name;
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { action, options } = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        const claudeKey = Deno.env.get("CLAUDE_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY");
        const supabase = createClient(supabaseUrl, supabaseKey);

        let result: any = {};

        switch (action) {
            // ========================================
            // ACTION: Generate embeddings for nodes
            // ========================================
            case "generate-embeddings": {
                const batchSize = options?.batch_size || 50;
                const nodeType = options?.node_type || null;

                // Get nodes without embeddings
                let query = supabase
                    .from('cde_nodes')
                    .select('id, name, node_type, properties')
                    .is('embedding', null)
                    .limit(batchSize);

                if (nodeType) {
                    query = query.eq('node_type', nodeType);
                }

                const { data: nodes, error } = await query;

                if (error) throw error;
                if (!nodes || nodes.length === 0) {
                    result = { success: true, message: "No nodes need embeddings", count: 0 };
                    break;
                }

                let embedded = 0;

                for (const node of nodes) {
                    // Create text for embedding
                    const text = `${node.name} (${node.node_type}): ${JSON.stringify(node.properties || {})}`;

                    const embedding = await generateEmbedding(text, openaiKey);

                    if (embedding) {
                        await supabase
                            .from('cde_nodes')
                            .update({ embedding: `[${embedding.join(',')}]` })
                            .eq('id', node.id);
                        embedded++;
                    }

                    // Rate limiting
                    await new Promise(r => setTimeout(r, 100));
                }

                result = {
                    success: true,
                    embedded,
                    total_processed: nodes.length
                };
                break;
            }

            // ========================================
            // ACTION: Copy embeddings from source tables
            // ========================================
            case "sync-embeddings": {
                // Copy embeddings from pathologies, substances, etc. to cde_nodes
                let synced = 0;

                // Pathologies
                const { data: pathNodes } = await supabase
                    .from('cde_nodes')
                    .select('id, external_id')
                    .eq('node_type', 'pathology')
                    .is('embedding', null);

                for (const node of pathNodes || []) {
                    if (node.external_id) {
                        const { data: pathology } = await supabase
                            .from('pathologies')
                            .select('embedding')
                            .eq('id', node.external_id)
                            .single();

                        if (pathology?.embedding) {
                            await supabase
                                .from('cde_nodes')
                                .update({ embedding: pathology.embedding })
                                .eq('id', node.id);
                            synced++;
                        }
                    }
                }

                // Substances
                const { data: substNodes } = await supabase
                    .from('cde_nodes')
                    .select('id, name')
                    .eq('node_type', 'substance')
                    .is('embedding', null);

                for (const node of substNodes || []) {
                    const { data: substance } = await supabase
                        .from('substances')
                        .select('embedding')
                        .ilike('name', node.name)
                        .single();

                    if (substance?.embedding) {
                        await supabase
                            .from('cde_nodes')
                            .update({ embedding: substance.embedding })
                            .eq('id', node.id);
                        synced++;
                    }
                }

                // Symptoms
                const { data: sympNodes } = await supabase
                    .from('cde_nodes')
                    .select('id, external_id')
                    .eq('node_type', 'symptom')
                    .is('embedding', null);

                for (const node of sympNodes || []) {
                    if (node.external_id) {
                        const { data: symptom } = await supabase
                            .from('symptoms')
                            .select('embedding')
                            .eq('id', node.external_id)
                            .single();

                        if (symptom?.embedding) {
                            await supabase
                                .from('cde_nodes')
                                .update({ embedding: symptom.embedding })
                                .eq('id', node.id);
                            synced++;
                        }
                    }
                }

                result = { success: true, synced };
                break;
            }

            // ========================================
            // ACTION: Create semantic links
            // ========================================
            case "create-semantic-links": {
                const threshold = options?.threshold || 0.75;
                const maxLinks = options?.max_links || 10;
                const batchSize = options?.batch_size || 500;

                const { data, error } = await supabase.rpc('create_semantic_links', {
                    similarity_threshold: threshold,
                    max_links_per_node: maxLinks,
                    batch_size: batchSize
                });

                if (error) throw error;
                result = data;
                break;
            }

            // ========================================
            // ACTION: Activate node and propagate
            // ========================================
            case "activate-node": {
                const nodeId = options?.node_id;
                const strength = options?.strength || 1.0;
                const depth = options?.depth || 3;
                const decay = options?.decay || 0.7;

                if (!nodeId) throw new Error("node_id required");

                const { data, error } = await supabase.rpc('activate_node', {
                    node_id_input: nodeId,
                    activation_strength: strength,
                    propagation_depth: depth,
                    decay_factor: decay
                });

                if (error) throw error;
                result = { success: true, activated_nodes: data };
                break;
            }

            // ========================================
            // ACTION: Reinforce an edge (Hebbian learning)
            // ========================================
            case "reinforce-edge": {
                const sourceId = options?.source_id;
                const targetId = options?.target_id;
                const strength = options?.strength || 0.1;

                if (!sourceId || !targetId) throw new Error("source_id and target_id required");

                const { data, error } = await supabase.rpc('reinforce_edge', {
                    source_id: sourceId,
                    target_id: targetId,
                    reinforcement_strength: strength
                });

                if (error) throw error;
                result = { success: true, new_weight: data };
                break;
            }

            // ========================================
            // ACTION: Optimize network weights
            // ========================================
            case "optimize-weights": {
                const learningRate = options?.learning_rate || 0.01;
                const momentum = options?.momentum || 0.9;

                const { data, error } = await supabase.rpc('optimize_network_weights', {
                    learning_rate: learningRate,
                    momentum: momentum
                });

                if (error) throw error;
                result = data;
                break;
            }

            // ========================================
            // ACTION: Decay unused connections
            // ========================================
            case "decay-weights": {
                const days = options?.inactivity_days || 30;
                const decay = options?.decay_amount || 0.05;
                const min = options?.min_weight || 0.1;

                const { data, error } = await supabase.rpc('decay_unused_weights', {
                    inactivity_days: days,
                    decay_amount: decay,
                    min_weight: min
                });

                if (error) throw error;
                result = { success: true, decayed_count: data };
                break;
            }

            // ========================================
            // ACTION: Cluster nodes
            // ========================================
            case "cluster-nodes": {
                const numClusters = options?.num_clusters || 10;
                const iterations = options?.iterations || 5;

                const { data, error } = await supabase.rpc('cluster_nodes_semantically', {
                    num_clusters: numClusters,
                    iterations: iterations
                });

                if (error) throw error;
                result = data;
                break;
            }

            // ========================================
            // ACTION: Initialize full neural network
            // ========================================
            case "initialize-network": {
                const threshold = options?.threshold || 0.7;
                const maxLinks = options?.max_links || 15;

                // First sync embeddings
                const syncResult = await supabase.functions.invoke('neural-kg', {
                    body: { action: 'sync-embeddings', options: {} }
                });

                // Then initialize network
                const { data, error } = await supabase.rpc('initialize_neural_knowledge_graph', {
                    similarity_threshold: threshold,
                    max_links: maxLinks
                });

                if (error) throw error;
                result = {
                    ...data,
                    embeddings_synced: syncResult.data?.synced || 0
                };
                break;
            }

            // ========================================
            // ACTION: Get network statistics
            // ========================================
            case "get-stats": {
                const { data: nodeStats } = await supabase
                    .from('cde_nodes')
                    .select('node_type, embedding')
                    .limit(10000);

                const { data: linkStats } = await supabase
                    .from('cde_semantic_links')
                    .select('weight, similarity_score, activation_count')
                    .limit(10000);

                const { count: edgeCount } = await supabase
                    .from('cde_edges')
                    .select('*', { count: 'exact', head: true });

                const nodesWithEmbeddings = (nodeStats || []).filter(n => n.embedding).length;
                const avgWeight = linkStats?.length
                    ? linkStats.reduce((s, l) => s + (l.weight || 0), 0) / linkStats.length
                    : 0;
                const avgSimilarity = linkStats?.length
                    ? linkStats.reduce((s, l) => s + (l.similarity_score || 0), 0) / linkStats.length
                    : 0;

                result = {
                    total_nodes: nodeStats?.length || 0,
                    nodes_with_embeddings: nodesWithEmbeddings,
                    semantic_links: linkStats?.length || 0,
                    explicit_edges: edgeCount || 0,
                    average_link_weight: Math.round(avgWeight * 1000) / 1000,
                    average_similarity: Math.round(avgSimilarity * 1000) / 1000,
                    total_activations: linkStats?.reduce((s, l) => s + (l.activation_count || 0), 0) || 0
                };
                break;
            }

            // ========================================
            // ACTION: Find path between nodes
            // ========================================
            case "find-path": {
                const fromId = options?.from_id;
                const toId = options?.to_id;
                const maxDepth = options?.max_depth || 5;

                if (!fromId || !toId) throw new Error("from_id and to_id required");

                // BFS to find path
                const visited = new Set<string>();
                const queue: { id: string; path: string[]; depth: number }[] = [
                    { id: fromId, path: [fromId], depth: 0 }
                ];

                let foundPath: string[] | null = null;

                while (queue.length > 0 && !foundPath) {
                    const current = queue.shift()!;

                    if (current.id === toId) {
                        foundPath = current.path;
                        break;
                    }

                    if (current.depth >= maxDepth || visited.has(current.id)) continue;
                    visited.add(current.id);

                    // Get connected nodes
                    const { data: links } = await supabase
                        .from('cde_semantic_links')
                        .select('source_node_id, target_node_id, weight')
                        .or(`source_node_id.eq.${current.id},target_node_id.eq.${current.id}`)
                        .order('weight', { ascending: false })
                        .limit(20);

                    for (const link of links || []) {
                        const nextId = link.source_node_id === current.id
                            ? link.target_node_id
                            : link.source_node_id;

                        if (!visited.has(nextId)) {
                            queue.push({
                                id: nextId,
                                path: [...current.path, nextId],
                                depth: current.depth + 1
                            });
                        }
                    }
                }

                // Get node details for path
                if (foundPath) {
                    const { data: pathNodes } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type')
                        .in('id', foundPath);

                    const orderedPath = foundPath.map(id =>
                        pathNodes?.find(n => n.id === id)
                    );

                    result = {
                        success: true,
                        found: true,
                        path: orderedPath,
                        path_length: foundPath.length - 1
                    };
                } else {
                    result = {
                        success: true,
                        found: false,
                        message: `No path found within ${maxDepth} hops`
                    };
                }
                break;
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Neural KG error:", error);
        return new Response(
            JSON.stringify({ error: "Neural KG operation failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
