// ============================================
// INDEX KNOWLEDGE - Multi-source Data Integration
// Indexes data from local DB + external APIs into semantic ontology
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// TYPES
// ============================================

interface IndexRequest {
    source: 'all' | 'openfda' | 'drugbank' | 'local';
    target_drug?: string;
    target_pathology?: string;
    limit?: number;
}

interface IndexResult {
    nodes_created: number;
    nodes_updated: number;
    edges_created: number;
    errors: string[];
}

// ============================================
// OPENFDA INTEGRATION - Side Effects
// ============================================

async function indexFromOpenFDA(supabase: any, drugName: string): Promise<IndexResult> {
    const result: IndexResult = { nodes_created: 0, nodes_updated: 0, edges_created: 0, errors: [] };

    try {
        const encodedDrug = encodeURIComponent(drugName);
        const url = `https://api.fda.gov/drug/event.json?search=patient.drug.openfda.brand_name:"${encodedDrug}"&count=patient.reaction.reactionmeddrapt.exact&limit=20`;

        const response = await fetch(url);
        if (!response.ok) {
            result.errors.push(`OpenFDA API error: ${response.status}`);
            return result;
        }

        const data = await response.json();
        const reactions = data.results || [];

        // Find or create drug node
        const { data: drugNode, error: drugError } = await supabase
            .from('semantic_nodes')
            .upsert({
                node_type: 'DRUG',
                label: drugName,
                source: 'local',
                attributes: { indexed_from_openfda: new Date().toISOString() }
            }, { onConflict: 'node_type,label' })
            .select()
            .single();

        if (drugError) {
            result.errors.push(`Drug node error: ${drugError.message}`);
            return result;
        }

        // Create complication nodes and edges for each reaction
        for (const reaction of reactions) {
            const reactionName = reaction.term;
            const count = reaction.count;

            // Calculate weight based on frequency
            const maxCount = reactions[0]?.count || 1;
            const weight = Math.min(0.95, 0.3 + (count / maxCount) * 0.6);

            // Create complication node
            const { data: compNode, error: compError } = await supabase
                .from('semantic_nodes')
                .upsert({
                    node_type: 'COMPLICATION',
                    label: reactionName,
                    source: 'openfda',
                    attributes: {
                        report_count: count,
                        last_indexed: new Date().toISOString()
                    }
                }, { onConflict: 'node_type,label' })
                .select()
                .single();

            if (compError) {
                result.errors.push(`Complication node error: ${compError.message}`);
                continue;
            }

            if (compNode) {
                result.nodes_created++;

                // Create COMPLICATES edge
                const { error: edgeError } = await supabase
                    .from('semantic_edges')
                    .upsert({
                        source_node_id: drugNode.id,
                        target_node_id: compNode.id,
                        edge_type: 'COMPLICATES',
                        source: 'openfda',
                        meta: {
                            direction: 'source_to_target',
                            weight: weight,
                            rationale: `Effet indésirable rapporté (${count} cas FAERS)`,
                            tags: ['side_effect', 'openfda'],
                            evidence_level: count > 100 ? 'B' : 'C',
                            source_refs: ['OpenFDA FAERS']
                        }
                    }, { onConflict: 'source_node_id,target_node_id,edge_type' });

                if (!edgeError) {
                    result.edges_created++;
                }
            }
        }

        console.log(`[INDEX] OpenFDA: ${reactions.length} reactions for ${drugName}`);

    } catch (err) {
        result.errors.push(`OpenFDA error: ${String(err)}`);
    }

    return result;
}

// ============================================
// LOCAL DB SYNC - Ensure all data is in ontology
// ============================================

async function syncLocalData(supabase: any): Promise<IndexResult> {
    const result: IndexResult = { nodes_created: 0, nodes_updated: 0, edges_created: 0, errors: [] };

    try {
        // Sync pathologies
        const { data: pathologies } = await supabase
            .from('pathologies')
            .select('id, name, description, icd_code, category, severity');

        for (const p of pathologies || []) {
            const { error } = await supabase
                .from('semantic_nodes')
                .upsert({
                    node_type: 'PATHOLOGY',
                    label: p.name,
                    description: p.description,
                    source: 'local',
                    source_id: p.id,
                    attributes: {
                        icd_code: p.icd_code,
                        category: p.category,
                        severity: p.severity
                    }
                }, { onConflict: 'node_type,label' });

            if (!error) result.nodes_created++;
        }

        // Sync treatments
        const { data: treatments } = await supabase
            .from('treatments')
            .select('id, name, description, type, dosage, pathology_id, pathologies(name)');

        for (const t of treatments || []) {
            const { data: drugNode } = await supabase
                .from('semantic_nodes')
                .upsert({
                    node_type: 'DRUG',
                    label: t.name,
                    description: t.description,
                    source: 'local',
                    source_id: t.id,
                    attributes: { type: t.type, dosage: t.dosage }
                }, { onConflict: 'node_type,label' })
                .select()
                .single();

            if (drugNode) {
                result.nodes_created++;

                // Create TREATS edge to pathology
                if (t.pathologies?.name) {
                    const { data: pathoNode } = await supabase
                        .from('semantic_nodes')
                        .select('id')
                        .eq('node_type', 'PATHOLOGY')
                        .eq('label', t.pathologies.name)
                        .single();

                    if (pathoNode) {
                        await supabase
                            .from('semantic_edges')
                            .upsert({
                                source_node_id: drugNode.id,
                                target_node_id: pathoNode.id,
                                edge_type: 'TREATS',
                                source: 'local',
                                meta: {
                                    direction: 'source_to_target',
                                    weight: 0.85,
                                    rationale: 'Traitement indiqué pour cette pathologie',
                                    evidence_level: 'B'
                                }
                            }, { onConflict: 'source_node_id,target_node_id,edge_type' });
                        result.edges_created++;
                    }
                }
            }
        }

        // Sync symptoms
        const { data: symptoms } = await supabase
            .from('symptoms')
            .select('id, name, description, body_system');

        for (const s of symptoms || []) {
            const { error } = await supabase
                .from('semantic_nodes')
                .upsert({
                    node_type: 'SYMPTOM',
                    label: s.name,
                    description: s.description,
                    source: 'local',
                    source_id: s.id,
                    attributes: { body_system: s.body_system }
                }, { onConflict: 'node_type,label' });

            if (!error) result.nodes_created++;
        }

        // Sync pathology_symptoms edges
        const { data: pathSymptoms } = await supabase
            .from('pathology_symptoms')
            .select('pathology_id, symptom_id, is_primary, pathologies(name), symptoms(name)');

        for (const ps of pathSymptoms || []) {
            if (ps.pathologies?.name && ps.symptoms?.name) {
                const { data: pathoNode } = await supabase
                    .from('semantic_nodes')
                    .select('id')
                    .eq('node_type', 'PATHOLOGY')
                    .eq('label', ps.pathologies.name)
                    .single();

                const { data: symptomNode } = await supabase
                    .from('semantic_nodes')
                    .select('id')
                    .eq('node_type', 'SYMPTOM')
                    .eq('label', ps.symptoms.name)
                    .single();

                if (pathoNode && symptomNode) {
                    await supabase
                        .from('semantic_edges')
                        .upsert({
                            source_node_id: pathoNode.id,
                            target_node_id: symptomNode.id,
                            edge_type: 'ASSOCIATED_WITH',
                            source: 'local',
                            meta: {
                                direction: 'source_to_target',
                                weight: ps.is_primary ? 0.9 : 0.6,
                                rationale: ps.is_primary ? 'Symptôme principal' : 'Symptôme associé',
                                tags: ps.is_primary ? ['primary'] : ['secondary'],
                                evidence_level: 'A'
                            }
                        }, { onConflict: 'source_node_id,target_node_id,edge_type' });
                    result.edges_created++;
                }
            }
        }

        console.log(`[INDEX] Local sync: ${result.nodes_created} nodes, ${result.edges_created} edges`);

    } catch (err) {
        result.errors.push(`Local sync error: ${String(err)}`);
    }

    return result;
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const params: IndexRequest = await req.json();
        const results: IndexResult[] = [];

        console.log(`[INDEX] Starting indexation: source=${params.source}`);

        // Sync local data first
        if (params.source === 'all' || params.source === 'local') {
            const localResult = await syncLocalData(supabase);
            results.push(localResult);
        }

        // Index from OpenFDA if drug specified
        if ((params.source === 'all' || params.source === 'openfda') && params.target_drug) {
            const openfdaResult = await indexFromOpenFDA(supabase, params.target_drug);
            results.push(openfdaResult);
        }

        // Increment knowledge version after indexing
        await supabase.rpc('increment_knowledge_version', {
            reason: `Indexation from ${params.source}`
        });

        // Aggregate results
        const totalResult: IndexResult = {
            nodes_created: results.reduce((sum, r) => sum + r.nodes_created, 0),
            nodes_updated: results.reduce((sum, r) => sum + r.nodes_updated, 0),
            edges_created: results.reduce((sum, r) => sum + r.edges_created, 0),
            errors: results.flatMap(r => r.errors)
        };

        console.log(`[INDEX] Complete: ${totalResult.nodes_created} nodes, ${totalResult.edges_created} edges`);

        return new Response(
            JSON.stringify({ success: true, ...totalResult }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("[INDEX] Error:", error);
        return new Response(
            JSON.stringify({ error: "Indexation failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
