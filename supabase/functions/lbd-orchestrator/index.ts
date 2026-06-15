import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * LBD ORCHESTRATOR
 * 
 * Manages the frontier queue for recursive Literature-Based Discovery.
 * Each node becomes a central point for exploration, with faceted expansion.
 * 
 * Endpoints:
 * - POST /start: Initialize exploration from a hypothesis/node
 * - POST /process: Process next pending jobs (called by cron or manually)
 * - GET /status: Get current exploration status
 * - POST /cancel: Cancel pending jobs for a hypothesis
 */

interface StartExplorationRequest {
    hypothesis_id?: string;
    node_id?: string;
    node_label?: string;
    node_type?: string;
    max_depth?: number;
    budget?: number;
    facets?: string[];
}

interface ProcessRequest {
    max_jobs?: number;
}

// Default exploration facets
const DEFAULT_FACETS = [
    'mechanism',    // Voies, enzymes, récepteurs
    'phenotype',    // Symptômes, endotypes
    'molecule',     // Classe chimique, métabolisme
    'intervention', // Drugs, procédures
    'biomarker',    // Biomarqueurs
];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.pathname.split('/').pop();

    try {
        // ============================================
        // START EXPLORATION
        // ============================================
        if (action === 'start' && req.method === 'POST') {
            const body: StartExplorationRequest = await req.json();

            if (!body.hypothesis_id && !body.node_id) {
                return new Response(
                    JSON.stringify({ error: "hypothesis_id or node_id required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const facets = body.facets || DEFAULT_FACETS;
            const maxDepth = body.max_depth || 5;
            const budget = body.budget || 100;

            // Get initial nodes to explore
            let seedNodes: any[] = [];

            if (body.node_id) {
                // Single node exploration
                const { data: node } = await supabase
                    .from('graph_nodes')
                    .select('*')
                    .eq('id', body.node_id)
                    .single();

                if (node) {
                    seedNodes.push(node);
                }
            } else if (body.hypothesis_id) {
                // All nodes from hypothesis (start with pathology as priority)
                const { data: nodes } = await supabase
                    .from('graph_nodes')
                    .select('*')
                    .eq('hypothesis_id', body.hypothesis_id)
                    .order('node_type', { ascending: true });  // pathology first

                seedNodes = nodes || [];
            }

            if (seedNodes.length === 0) {
                return new Response(
                    JSON.stringify({ error: "No nodes found to explore" }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Create frontier jobs for each node × facet combination
            const jobs = [];
            for (const node of seedNodes) {
                // Priority: pathology > treatment > others
                const basePriority = node.node_type === 'pathology' ? 1.0
                    : node.node_type === 'treatment' ? 0.8
                        : node.node_type === 'molecule' ? 0.7
                            : 0.5;

                for (const facet of facets) {
                    jobs.push({
                        node_id: node.id,
                        node_label: node.label,
                        node_type: node.node_type,
                        hypothesis_id: body.hypothesis_id || node.hypothesis_id,
                        facet,
                        priority: basePriority * (facet === 'mechanism' ? 1.0 : 0.9),
                        depth: 0,
                        max_depth: maxDepth,
                        budget_remaining: Math.floor(budget / seedNodes.length / facets.length),
                        status: 'pending'
                    });
                }
            }

            const { data: createdJobs, error: insertError } = await supabase
                .from('frontier_jobs')
                .insert(jobs)
                .select();

            if (insertError) {
                throw new Error(`Failed to create jobs: ${insertError.message}`);
            }

            console.log(`✅ Created ${createdJobs?.length} frontier jobs`);

            return new Response(JSON.stringify({
                success: true,
                jobs_created: createdJobs?.length || 0,
                seed_nodes: seedNodes.length,
                facets_per_node: facets.length,
                jobs: createdJobs?.slice(0, 5)  // Preview first 5
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // ============================================
        // PROCESS PENDING JOBS
        // ============================================
        if (action === 'process' && req.method === 'POST') {
            const body: ProcessRequest = await req.json().catch(() => ({}));
            const maxJobs = body.max_jobs || 5;

            // Get highest priority pending jobs
            const { data: pendingJobs, error: fetchError } = await supabase
                .from('frontier_jobs')
                .select('*')
                .eq('status', 'pending')
                .order('priority', { ascending: false })
                .limit(maxJobs);

            if (fetchError) {
                throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
            }

            if (!pendingJobs || pendingJobs.length === 0) {
                return new Response(JSON.stringify({
                    success: true,
                    message: "No pending jobs",
                    processed: 0
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            console.log(`🔄 Processing ${pendingJobs.length} jobs...`);

            const results = [];
            for (const job of pendingJobs) {
                // Mark as running
                await supabase
                    .from('frontier_jobs')
                    .update({ status: 'running', started_at: new Date().toISOString() })
                    .eq('id', job.id);

                const startTime = Date.now();

                try {
                    // Call the expand-node function
                    const expandResponse = await fetch(`${supabaseUrl}/functions/v1/lbd-expand-node`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}`
                        },
                        body: JSON.stringify({
                            job_id: job.id,
                            node_id: job.node_id,
                            node_label: job.node_label,
                            node_type: job.node_type,
                            facet: job.facet,
                            hypothesis_id: job.hypothesis_id,
                            depth: job.depth,
                            max_depth: job.max_depth,
                            budget: job.budget_remaining
                        })
                    });

                    const expandResult = await expandResponse.json();

                    // Update job status
                    await supabase
                        .from('frontier_jobs')
                        .update({
                            status: expandResult.success ? 'completed' : 'failed',
                            completed_at: new Date().toISOString(),
                            execution_time_ms: Date.now() - startTime,
                            claims_generated: expandResult.claims_count || 0,
                            hypotheses_generated: expandResult.hypotheses_count || 0,
                            error_message: expandResult.error || null
                        })
                        .eq('id', job.id);

                    results.push({
                        job_id: job.id,
                        node_label: job.node_label,
                        facet: job.facet,
                        success: expandResult.success,
                        claims: expandResult.claims_count || 0
                    });

                } catch (err: any) {
                    await supabase
                        .from('frontier_jobs')
                        .update({
                            status: 'failed',
                            completed_at: new Date().toISOString(),
                            execution_time_ms: Date.now() - startTime,
                            error_message: err.message
                        })
                        .eq('id', job.id);

                    results.push({
                        job_id: job.id,
                        success: false,
                        error: err.message
                    });
                }
            }

            return new Response(JSON.stringify({
                success: true,
                processed: results.length,
                results
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // ============================================
        // GET STATUS
        // ============================================
        if (action === 'status' && req.method === 'GET') {
            const hypothesisId = url.searchParams.get('hypothesis_id');

            let query = supabase.from('frontier_jobs').select('status, count(*)');
            if (hypothesisId) {
                query = query.eq('hypothesis_id', hypothesisId);
            }

            const { data: statusCounts, error: rpcError } = await supabase.rpc('get_frontier_status', {
                p_hypothesis_id: hypothesisId
            });

            if (rpcError) console.warn('⚠️ RPC Error:', rpcError.message);

            // Fallback if RPC doesn't exist
            const { data: jobs } = await supabase
                .from('frontier_jobs')
                .select('status, claims_generated, hypotheses_generated')
                .eq(hypothesisId ? 'hypothesis_id' : 'id', hypothesisId || 'null');

            const stats = {
                pending: 0,
                running: 0,
                completed: 0,
                failed: 0,
                total_claims: 0,
                total_hypotheses: 0
            };

            if (jobs) {
                for (const j of jobs) {
                    stats[j.status as keyof typeof stats]++;
                    stats.total_claims += j.claims_generated || 0;
                    stats.total_hypotheses += j.hypotheses_generated || 0;
                }
            }

            return new Response(JSON.stringify({
                success: true,
                status: stats
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // ============================================
        // CANCEL JOBS
        // ============================================
        if (action === 'cancel' && req.method === 'POST') {
            const body = await req.json();
            const hypothesisId = body.hypothesis_id;

            if (!hypothesisId) {
                return new Response(
                    JSON.stringify({ error: "hypothesis_id required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const { data, error } = await supabase
                .from('frontier_jobs')
                .update({ status: 'cancelled' })
                .eq('hypothesis_id', hypothesisId)
                .eq('status', 'pending')
                .select();

            return new Response(JSON.stringify({
                success: true,
                cancelled: data?.length || 0
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Unknown endpoint
        return new Response(
            JSON.stringify({ error: "Unknown endpoint", available: ["/start", "/process", "/status", "/cancel"] }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error("LBD Orchestrator error:", error);
        return new Response(
            JSON.stringify({ error: "Orchestrator failed", details: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
