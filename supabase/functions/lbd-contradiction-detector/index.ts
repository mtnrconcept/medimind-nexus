import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors.ts";
import { callAI } from "../_shared/ai-client.ts";

console.log("LBD Contradiction Detector Started");

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

/**
 * LBD CONTRADICTION DETECTOR
 * 
 * Analyzes claims for a specific hypothesis to identify and document contradictions.
 * Essential for "scientific seriousness" (Ultra requirement).
 */

interface ContradictionRequest {
    hypothesis_id: string;
    pathology_label?: string;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body: ContradictionRequest = await req.json();
        const { hypothesis_id, pathology_label } = body;

        console.log(`⚖️ Detecting contradictions for hypothesis ${hypothesis_id}`);

        // 1. Fetch all claims for this hypothesis
        const { data: claims, error: claimsError } = await supabase
            .from('lbd_claims')
            .select('*')
            .eq('hypothesis_id', hypothesis_id);

        if (claimsError || !claims || claims.length < 2) {
            return new Response(JSON.stringify({
                success: true,
                message: "Not enough claims to find contradictions",
                contradictions_found: 0
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // 2. Prepare analysis prompt
        const claimsList = claims.map((c: any) => `ID: ${c.id} | ${c.subject_text} ${c.predicate} ${c.object_text} (Score: ${c.aggregate_score})`).join('\n');

        const systemPrompt = `You are a scientific expert specialized in identifying contradictions in medical literature.
Identify clinical or mechanistic contradictions from the following list of claims.
A contradiction occurs when:
- One study says A treats B, another says A has no effect or harms B.
- Conflicting mechanisms are proposed for the same outcome.
- Opposite effect directions are reported.

For each contradiction found:
1. Provide the IDs of the two conflicting claims.
2. Explain the nature of the contradiction.
3. Propose a resolution (unresolved, population_specific, dose_dependent, methodological, temporal, superseded).
4. Assign relative weights to each side.

Return a JSON array of objects:
[{"claim_a_id": "...", "claim_b_id": "...", "explanation": "...", "resolution": "...", "support_weight": 0.X, "refute_weight": 0.Y}]`;

        const userPrompt = `Analyze these claims for contradictions:\n\n${claimsList}`;

        // Calling the "Ultra" model as requested by user manual edit
        const aiResponse = await callAI(systemPrompt, userPrompt, {
            model: 'gemini-3-flash-preview',
            maxTokens: 10000,
            temperature: 0.2
        });

        let contradictions: any[] = [];
        try {
            // Simple JSON extraction from AI response
            const jsonStr = aiResponse.text.match(/\[[\s\S]*\]/)?.[0] || '[]';
            contradictions = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse AI contradictions:", e);
        }

        // 3. Save contradictions to database
        const savedContradictions: any[] = [];
        for (const contra of contradictions) {
            const { data, error } = await supabase
                .from('lbd_contradictions')
                .upsert({
                    claim_support_id: contra.claim_a_id,
                    claim_refute_id: contra.claim_b_id,
                    resolution: contra.resolution,
                    explanation: contra.explanation,
                    support_weight: contra.support_weight,
                    refute_weight: contra.refute_weight
                }, { onConflict: 'claim_support_id,claim_refute_id' })
                .select()
                .single();

            if (data) savedContradictions.push(data);
        }

        // 4. Update reasoning trace
        await supabase.from('lbd_reasoning_traces').insert({
            hypothesis_id,
            inputs: { pathology_label },
            contradictions_found: savedContradictions.map(c => ({
                id: c.id,
                explanation: c.explanation,
                resolution: c.resolution
            })),
            execution_time_ms: 0 // Placeholder
        });

        // 5. Update parent hypothesis with enriched contradictions snapshot (for UI)
        if (savedContradictions.length > 0) {
            const enrichedContradictions = savedContradictions.map(c => {
                const claimA = claims.find((cl: any) => cl.id === c.claim_support_id);
                const claimB = claims.find((cl: any) => cl.id === c.claim_refute_id);
                return {
                    id: c.id,
                    explanation: c.explanation,
                    resolution: c.resolution,
                    claim_a_text: claimA ? `${claimA.subject_text} ${claimA.predicate} ${claimA.object_text}` : 'Claim A',
                    claim_b_text: claimB ? `${claimB.subject_text} ${claimB.predicate} ${claimB.object_text}` : 'Claim B',
                    support_weight: c.support_weight,
                    refute_weight: c.refute_weight
                };
            });

            await supabase
                .from('discovery_hypotheses')
                .update({
                    contradictions: enrichedContradictions
                })
                .eq('id', hypothesis_id);

            console.log(`✅ Synced ${enrichedContradictions.length} contradictions to hypothesis record`);
        }

        console.log(`✅ Identified ${savedContradictions.length} contradictions`);

        return new Response(JSON.stringify({
            success: true,
            contradictions_found: savedContradictions.length,
            details: savedContradictions
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("Contradiction detector error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
