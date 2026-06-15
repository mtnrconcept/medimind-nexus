import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Discovery {
    id: string;
    title: string;
    hypothesis: string;
    type: string;
    severity: string;
    plausibility: string;
    reasoning_chain: string[];
    recommended_actions: string[];
    involved_medications: string[];
    sources?: any[];
    gaps_addressed?: string[];
}

interface ValidationRequest {
    discoveries: Discovery[];
    targetPathology?: string;
    validatedBy?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { discoveries, targetPathology, validatedBy }: ValidationRequest = await req.json();

        if (!discoveries || discoveries.length === 0) {
            return new Response(
                JSON.stringify({ error: "No discoveries provided" }),
                { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
            );
        }

        console.log(`Validating and storing ${discoveries.length} discoveries for ${targetPathology || 'general'}`);

        const results = {
            inserted: 0,
            duplicates: 0,
            errors: 0,
            details: [] as any[]
        };

        for (const discovery of discoveries) {
            try {
                // Check if discovery already exists (by title and discovery_id)
                const { data: existing } = await supabase
                    .from('cde_discoveries')
                    .select('id, title')
                    .eq('discovery_id', discovery.id)
                    .eq('title', discovery.title)
                    .maybeSingle();

                if (existing) {
                    results.duplicates++;
                    results.details.push({
                        discovery_id: discovery.id,
                        status: 'duplicate',
                        message: `Discovery "${discovery.title}" already exists`
                    });
                    continue;
                }

                // Also check for similar titles to avoid near-duplicates
                const { data: similar } = await supabase
                    .from('cde_discoveries')
                    .select('id, title')
                    .ilike('title', `%${discovery.title.slice(0, 50)}%`)
                    .limit(1);

                if (similar && similar.length > 0) {
                    results.duplicates++;
                    results.details.push({
                        discovery_id: discovery.id,
                        status: 'similar_exists',
                        message: `Similar discovery exists: "${similar[0].title}"`
                    });
                    continue;
                }

                // Calculate confidence score based on severity and plausibility
                let confidenceScore = 0.5;
                if (discovery.plausibility === 'forte') confidenceScore += 0.3;
                else if (discovery.plausibility === 'modérée') confidenceScore += 0.15;

                if (discovery.severity === 'critique' || discovery.severity === 'CRITIQUE') confidenceScore += 0.1;
                else if (discovery.severity === 'élevée' || discovery.severity === 'ÉLEVÉE') confidenceScore += 0.05;

                // Insert new discovery
                const { data: inserted, error } = await supabase
                    .from('cde_discoveries')
                    .insert({
                        discovery_id: discovery.id,
                        title: discovery.title,
                        hypothesis: discovery.hypothesis,
                        discovery_type: discovery.type,
                        severity: discovery.severity.toLowerCase(),
                        plausibility: discovery.plausibility.toLowerCase(),
                        reasoning_chain: discovery.reasoning_chain || [],
                        recommended_actions: discovery.recommended_actions || [],
                        involved_medications: discovery.involved_medications || [],
                        sources: discovery.sources || [],
                        gaps_addressed: discovery.gaps_addressed || [],
                        target_pathology: targetPathology || null,
                        validation_status: 'validated',
                        validated_at: new Date().toISOString(),
                        validated_by: validatedBy || 'CDE_Auto_Validation',
                        confidence_score: Math.min(confidenceScore, 1.0)
                    })
                    .select()
                    .single();

                if (error) {
                    console.error(`Error inserting discovery ${discovery.id}:`, error);
                    results.errors++;
                    results.details.push({
                        discovery_id: discovery.id,
                        status: 'error',
                        message: error.message
                    });
                } else {
                    results.inserted++;
                    results.details.push({
                        discovery_id: discovery.id,
                        status: 'inserted',
                        message: `Discovery "${discovery.title}" saved successfully`,
                        db_id: inserted?.id
                    });

                    // Also create edges in the Knowledge Graph for involved medications
                    if (discovery.involved_medications && discovery.involved_medications.length > 1) {
                        for (let i = 0; i < discovery.involved_medications.length - 1; i++) {
                            for (let j = i + 1; j < discovery.involved_medications.length; j++) {
                                const med1 = discovery.involved_medications[i];
                                const med2 = discovery.involved_medications[j];


                                // Find nodes for these medications
                                const { data: node1 } = await supabase
                                    .from('cde_nodes')
                                    .select('id')
                                    .ilike('name', `%${med1}%`)
                                    .limit(1)
                                    .maybeSingle();

                                const { data: node2 } = await supabase
                                    .from('cde_nodes')
                                    .select('id')
                                    .ilike('name', `%${med2}%`)
                                    .limit(1)
                                    .maybeSingle();

                                if (node1 && node2) {
                                    // Check if edge already exists
                                    const { data: existingEdge } = await supabase
                                        .from('cde_edges')
                                        .select('id')
                                        .eq('source_node_id', node1.id)
                                        .eq('target_node_id', node2.id)
                                        .maybeSingle();

                                    if (!existingEdge) {
                                        await supabase
                                            .from('cde_edges')
                                            .insert({
                                                source_node_id: node1.id,
                                                target_node_id: node2.id,
                                                relationship_type: discovery.type === 'interaction' ? 'INTERACTS_WITH' : 'RELATED_TO',
                                                provenance: 'cde_validated_discovery',
                                                confidence_score: confidenceScore,
                                                context: {
                                                    discovery_id: discovery.id,
                                                    severity: discovery.severity,
                                                    hypothesis: discovery.hypothesis.slice(0, 200)
                                                }
                                            });
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`Error processing discovery ${discovery.id}:`, e);
                results.errors++;
                results.details.push({
                    discovery_id: discovery.id,
                    status: 'error',
                    message: String(e)
                });
            }
        }

        console.log(`Validation complete: ${results.inserted} inserted, ${results.duplicates} duplicates, ${results.errors} errors`);

        return new Response(
            JSON.stringify({
                success: true,
                summary: {
                    total: discoveries.length,
                    inserted: results.inserted,
                    duplicates: results.duplicates,
                    errors: results.errors
                },
                details: results.details
            }),
            { headers: { ...corsHeaders, "content-type": "application/json" } }
        );

    } catch (error) {
        console.error("Validation error:", error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
    }
});
