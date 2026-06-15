import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * LBD SWANSON ABC INFERENCE
 * 
 * Implements the Swanson ABC model for Literature-Based Discovery:
 * If A→B (A is related to B) exists in literature
 * And B→C (B is related to C) exists in literature
 * But A→C is NOT explicitly described
 * Then propose A→C as a novel hypothesis
 * 
 * This is the core mechanism for "hors sentiers battus" discovery.
 */

interface SwansonRequest {
    hypothesis_id: string;
    source_node_id?: string;  // A node (optional, explore all)
    target_type?: string;     // Filter target type (e.g., 'treatment', 'molecule')
    min_score?: number;       // Minimum score threshold
    max_hops?: number;        // Maximum intermediate nodes (default 1 for A→B→C)
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body: SwansonRequest = await req.json();
        const { hypothesis_id, source_node_id, target_type, min_score = 0.3, max_hops = 1 } = body;

        console.log(`🔬 Running Swanson ABC inference for hypothesis ${hypothesis_id}`);

        // Get all existing claims for this hypothesis
        const { data: claims, error: claimsError } = await supabase
            .from('lbd_claims')
            .select('*')
            .eq('hypothesis_id', hypothesis_id)
            .eq('is_hypothesis', false);  // Only direct observations

        if (claimsError || !claims || claims.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: "No claims found to analyze",
                hypotheses_generated: 0
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`📊 Analyzing ${claims.length} existing claims...`);

        // Build adjacency map: subject → [objects]
        const subjectToObjects: Map<string, Set<string>> = new Map();
        const objectToSubjects: Map<string, Set<string>> = new Map();
        const claimsByPair: Map<string, any[]> = new Map();

        for (const claim of claims) {
            const subj = claim.subject_text.toLowerCase();
            const obj = claim.object_text.toLowerCase();
            const pairKey = `${subj}|${obj}`;

            if (!subjectToObjects.has(subj)) subjectToObjects.set(subj, new Set());
            subjectToObjects.get(subj)!.add(obj);

            if (!objectToSubjects.has(obj)) objectToSubjects.set(obj, new Set());
            objectToSubjects.get(obj)!.add(subj);

            if (!claimsByPair.has(pairKey)) claimsByPair.set(pairKey, []);
            claimsByPair.get(pairKey)!.push(claim);
        }

        // Find ABC paths: A→B, B→C where A→C doesn't exist
        const abcPaths: any[] = [];
        const existingPairs = new Set([...claimsByPair.keys()]);

        // A = source subjects
        const sources = source_node_id
            ? [claims.find(c => c.subject_node_id === source_node_id)?.subject_text.toLowerCase()]
            : [...subjectToObjects.keys()];

        for (const a of sources) {
            if (!a) continue;
            const bNodes = subjectToObjects.get(a);
            if (!bNodes) continue;

            for (const b of bNodes) {
                // Find B→C where B is now a subject
                const cNodes = subjectToObjects.get(b);
                if (!cNodes) continue;

                for (const c of cNodes) {
                    // Skip if A = C
                    if (a === c) continue;

                    // Check if A→C already exists
                    const acKey = `${a}|${c}`;
                    if (existingPairs.has(acKey)) continue;

                    // Get supporting claims
                    const abClaims = claimsByPair.get(`${a}|${b}`) || [];
                    const bcClaims = claimsByPair.get(`${b}|${c}`) || [];

                    if (abClaims.length === 0 || bcClaims.length === 0) continue;

                    // Calculate combined score
                    const abScore = Math.max(...abClaims.map(c => c.aggregate_score || 0.5));
                    const bcScore = Math.max(...bcClaims.map(c => c.aggregate_score || 0.5));
                    const combinedScore = Math.sqrt(abScore * bcScore);  // Geometric mean

                    if (combinedScore < min_score) continue;

                    // Filter by target type if specified
                    if (target_type) {
                        const cType = bcClaims[0]?.object_type;
                        if (cType && cType !== target_type) continue;
                    }

                    abcPaths.push({
                        a,
                        b,
                        c,
                        ab_predicate: abClaims[0]?.predicate,
                        bc_predicate: bcClaims[0]?.predicate,
                        ab_score: abScore,
                        bc_score: bcScore,
                        combined_score: combinedScore,
                        ab_claims: abClaims.map(cl => cl.id),
                        bc_claims: bcClaims.map(cl => cl.id),
                        c_type: bcClaims[0]?.object_type
                    });
                }
            }
        }

        // Sort by combined score
        abcPaths.sort((x, y) => y.combined_score - x.combined_score);

        console.log(`🔍 Found ${abcPaths.length} ABC paths`);

        // Create hypothesis claims for top results
        const maxHypotheses = 20;
        const newHypotheses: any[] = [];

        for (const path of abcPaths.slice(0, maxHypotheses)) {
            // Derive predicate from path
            let inferredPredicate = 'ASSOCIATED_WITH';
            if (path.ab_predicate === 'TREATS' || path.bc_predicate === 'TREATS') {
                inferredPredicate = 'POTENTIAL_TREATMENT';
            } else if (path.ab_predicate === 'CAUSES' && path.bc_predicate === 'TREATS') {
                inferredPredicate = 'POTENTIAL_TREATMENT';
            } else if (path.ab_predicate === 'TARGETS' || path.bc_predicate === 'TARGETS') {
                inferredPredicate = 'TARGETS_VIA';
            }

            const hypothesisClaim = {
                subject_text: path.a,
                subject_type: 'pathology',  // A is typically the disease
                predicate: inferredPredicate,
                object_text: path.c,
                object_type: path.c_type || 'unknown',

                // Scoring
                evidence_quality: 0.4,  // Hypothesis, not direct
                replication_count: path.ab_claims.length + path.bc_claims.length,
                effect_direction: 'unknown',
                population_match: 0.5,
                recency_score: 0.5,
                mechanistic_plausibility: path.combined_score,
                aggregate_score: path.combined_score * 0.8,  // Discount for being hypothesis

                is_hypothesis: true,
                inference_rule: 'swanson_abc',
                hypothesis_id: hypothesis_id,
                status: 'pending'
            };

            const { data: saved } = await supabase
                .from('lbd_claims')
                .insert(hypothesisClaim)
                .select()
                .single();

            if (saved) {
                newHypotheses.push({
                    id: saved.id,
                    path: `${path.a} → ${path.b} → ${path.c}`,
                    score: path.combined_score,
                    predicate: inferredPredicate
                });
            }
        }

        // Log reasoning trace
        await supabase.from('lbd_reasoning_traces').insert({
            hypothesis_id,
            inputs: { source_node_id, target_type, min_score },
            inference_steps: abcPaths.slice(0, 50).map(p => ({
                rule: 'swanson_abc',
                a: p.a,
                b: p.b,
                c: p.c,
                score: p.combined_score
            })),
            output_claims: newHypotheses
        });

        console.log(`✅ Created ${newHypotheses.length} ABC hypotheses`);

        return new Response(JSON.stringify({
            success: true,
            claims_analyzed: claims.length,
            abc_paths_found: abcPaths.length,
            hypotheses_generated: newHypotheses.length,
            top_hypotheses: newHypotheses.slice(0, 10)
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("Swanson ABC error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
