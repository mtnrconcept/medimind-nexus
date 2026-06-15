import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * LBD ANALOGY FINDER
 * 
 * Finds mechanistic analogies across conditions:
 * If Condition A and Condition D share a mechanism B
 * And Treatment C acts on mechanism B with benefit in D
 * Then C becomes a candidate for A
 * 
 * This enables "drug repositioning" discoveries.
 */

interface AnalogyRequest {
    hypothesis_id: string;
    pathology_node_id?: string;
    min_similarity?: number;
}

// Mechanism keywords for matching
const MECHANISM_KEYWORDS = [
    'inflammation', 'immune', 'oxidative', 'apoptosis', 'proliferation',
    'fibrosis', 'angiogenesis', 'metabolism', 'signaling', 'receptor',
    'enzyme', 'kinase', 'cytokine', 'interleukin', 'tumor necrosis',
    'growth factor', 'transcription', 'mitochondrial', 'autophagy'
];

function extractMechanisms(text: string): string[] {
    const lowerText = text.toLowerCase();
    return MECHANISM_KEYWORDS.filter(kw => lowerText.includes(kw));
}

function calculateSimilarity(mechanisms1: string[], mechanisms2: string[]): number {
    if (mechanisms1.length === 0 || mechanisms2.length === 0) return 0;
    const set1 = new Set(mechanisms1);
    const set2 = new Set(mechanisms2);
    const intersection = [...set1].filter(x => set2.has(x));
    const union = new Set([...set1, ...set2]);
    return intersection.length / union.size;  // Jaccard similarity
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body: AnalogyRequest = await req.json();
        const { hypothesis_id, pathology_node_id, min_similarity = 0.3 } = body;

        console.log(`🔬 Running analogy search for hypothesis ${hypothesis_id}`);

        // Get the central pathology node
        let pathologyNode: any;
        if (pathology_node_id) {
            const { data } = await supabase
                .from('graph_nodes')
                .select('*')
                .eq('id', pathology_node_id)
                .single();
            pathologyNode = data;
        } else {
            // Find pathology node from hypothesis
            const { data } = await supabase
                .from('graph_nodes')
                .select('*')
                .eq('hypothesis_id', hypothesis_id)
                .eq('node_type', 'pathology')
                .single();
            pathologyNode = data;
        }

        if (!pathologyNode) {
            return new Response(JSON.stringify({
                success: false,
                error: "No pathology node found"
            }), {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`🎯 Target pathology: ${pathologyNode.label}`);

        // Get all claims involving this pathology
        const { data: pathologyClaims } = await supabase
            .from('lbd_claims')
            .select('*')
            .or(`subject_text.ilike.%${pathologyNode.label}%,object_text.ilike.%${pathologyNode.label}%`)
            .eq('hypothesis_id', hypothesis_id);

        // Extract mechanisms from pathology claims
        const pathologyMechanisms = new Set<string>();
        const mechanismObjects = new Map<string, any[]>();  // mechanism → claims

        for (const claim of (pathologyClaims || [])) {
            const allText = `${claim.subject_text} ${claim.object_text} ${claim.predicate}`;
            const mechanisms = extractMechanisms(allText);
            mechanisms.forEach(m => {
                pathologyMechanisms.add(m);
                if (!mechanismObjects.has(m)) mechanismObjects.set(m, []);
                mechanismObjects.get(m)!.push(claim);
            });
        }

        if (pathologyMechanisms.size === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: "No mechanisms identified for analogy search",
                analogies_found: 0
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`🔍 Identified ${pathologyMechanisms.size} mechanisms: ${[...pathologyMechanisms].join(', ')}`);

        // Search for other conditions with similar mechanisms in the database
        // Look through all claims that mention treatments and similar mechanisms
        const { data: allTreatmentClaims } = await supabase
            .from('lbd_claims')
            .select('*')
            .or('predicate.ilike.%TREAT%,predicate.ilike.%TARGET%,predicate.ilike.%INHIBIT%')
            .neq('hypothesis_id', hypothesis_id)  // Different hypothesis = different condition
            .limit(500);

        const analogies: any[] = [];
        const seenTreatments = new Set<string>();

        for (const claim of (allTreatmentClaims || [])) {
            const allText = `${claim.subject_text} ${claim.object_text}`;
            const claimMechanisms = extractMechanisms(allText);

            if (claimMechanisms.length === 0) continue;

            // Calculate mechanism similarity
            const similarity = calculateSimilarity([...pathologyMechanisms], claimMechanisms);

            if (similarity < min_similarity) continue;

            // Identify the treatment (usually the subject for TREATS predicate)
            const treatment = claim.predicate.includes('TREAT')
                ? claim.subject_text
                : claim.object_text;

            // Skip if we've already seen this treatment
            const treatmentKey = treatment.toLowerCase();
            if (seenTreatments.has(treatmentKey)) continue;
            seenTreatments.add(treatmentKey);

            // Shared mechanisms
            const sharedMechanisms = claimMechanisms.filter(m => pathologyMechanisms.has(m));

            analogies.push({
                treatment,
                original_condition: claim.subject_text,
                shared_mechanisms: sharedMechanisms,
                similarity_score: similarity,
                evidence_score: claim.aggregate_score || 0.5,
                combined_score: similarity * (claim.aggregate_score || 0.5),
                source_claim_id: claim.id
            });
        }

        // Sort by combined score
        analogies.sort((a, b) => b.combined_score - a.combined_score);

        console.log(`🔍 Found ${analogies.length} analogous treatments`);

        // Create hypothesis claims for top analogies
        const maxHypotheses = 15;
        const newHypotheses: any[] = [];

        for (const analogy of analogies.slice(0, maxHypotheses)) {
            const hypothesisClaim = {
                subject_text: pathologyNode.label,
                subject_type: 'pathology',
                subject_node_id: pathologyNode.id,
                predicate: 'POTENTIAL_TREATMENT_ANALOGY',
                object_text: analogy.treatment,
                object_type: 'treatment',

                evidence_quality: 0.35,  // Analogy-based
                replication_count: 1,
                effect_direction: 'unknown',
                population_match: 0.5,
                recency_score: 0.5,
                mechanistic_plausibility: analogy.similarity_score,
                aggregate_score: analogy.combined_score * 0.7,  // Discount for being analogy

                is_hypothesis: true,
                inference_rule: 'analogy',
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
                    treatment: analogy.treatment,
                    via_condition: analogy.original_condition,
                    shared_mechanisms: analogy.shared_mechanisms,
                    score: analogy.combined_score
                });
            }
        }

        // Log reasoning trace
        await supabase.from('lbd_reasoning_traces').insert({
            hypothesis_id,
            inputs: {
                pathology: pathologyNode.label,
                mechanisms: [...pathologyMechanisms]
            },
            inference_steps: analogies.slice(0, 30).map(a => ({
                rule: 'analogy',
                treatment: a.treatment,
                via_condition: a.original_condition,
                shared_mechanisms: a.shared_mechanisms,
                score: a.combined_score
            })),
            output_claims: newHypotheses
        });

        console.log(`✅ Created ${newHypotheses.length} analogy hypotheses`);

        return new Response(JSON.stringify({
            success: true,
            pathology: pathologyNode.label,
            mechanisms_identified: [...pathologyMechanisms],
            analogies_found: analogies.length,
            hypotheses_generated: newHypotheses.length,
            top_hypotheses: newHypotheses.slice(0, 10)
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("Analogy finder error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
