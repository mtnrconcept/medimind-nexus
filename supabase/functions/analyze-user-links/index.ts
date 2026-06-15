import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey);
        const authHeader = req.headers.get('Authorization');

        // Get user from token
        const { data: { user }, error: authError } = await supabase.auth.getUser(
            authHeader?.replace('Bearer ', '') || ''
        );

        if (authError || !user) {
            throw new Error("Non authentifié");
        }

        const { edgeIds } = await req.json();

        if (!edgeIds || !Array.isArray(edgeIds) || edgeIds.length === 0) {
            throw new Error("Aucun lien à analyser");
        }

        // Fetch edges with node details
        const { data: edges, error: edgesError } = await supabase
            .from('cde_user_edges')
            .select(`
                *,
                source_node:cde_nodes!source_node_id(id, name, node_type, properties),
                target_node:cde_nodes!target_node_id(id, name, node_type, properties)
            `)
            .in('id', edgeIds)
            .eq('user_id', user.id);

        if (edgesError) throw edgesError;
        if (!edges || edges.length === 0) {
            throw new Error("Liens non trouvés");
        }

        // Build context for Claude
        const linksContext = edges.map(edge => {
            const source = edge.source_node as any;
            const target = edge.target_node as any;
            return `
- **${source?.name}** (${source?.node_type}) --[${edge.relationship_type}]--> **${target?.name}** (${target?.node_type})
  Notes: ${edge.notes || 'Aucune'}
  Propriétés source: ${JSON.stringify(source?.properties || {})}
  Propriétés cible: ${JSON.stringify(target?.properties || {})}`;
        }).join('\n');

        const systemPrompt = `Tu es un expert en pharmacologie et médecine clinique. Tu analyses des relations médicales créées par un professionnel de santé.

Pour chaque lien, tu dois:
1. Évaluer la validité scientifique de la relation
2. Donner un score de confiance (0-1)
3. Expliquer le mécanisme sous-jacent si applicable
4. Identifier les risques potentiels
5. Suggérer des actions ou précautions

Réponds au format JSON:
{
  "analyses": [
    {
      "edge_id": "id_du_lien",
      "is_valid": true/false,
      "confidence": 0.0-1.0,
      "summary": "Résumé concis de l'analyse",
      "mechanism": "Mécanisme d'action ou explication",
      "risks": ["risque1", "risque2"],
      "recommendations": ["recommandation1", "recommandation2"]
    }
  ]
}`;

        const userPrompt = `Analyse les liens médicaux suivants créés par un utilisateur:

${linksContext}

Fournis une analyse détaillée de chaque lien.`;

        // Call AI API
        const aiResult = await callAI(
            systemPrompt,
            userPrompt,
            {
                model: "claude-3-5-sonnet-20240620",
                maxTokens: 4096,
            }
        );

        const content = aiResult.text || "";

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Failed to parse AI response");
        }

        const analysisResult = JSON.parse(jsonMatch[0]);
        let analyzedCount = 0;

        // Update each edge with analysis result
        for (const analysis of analysisResult.analyses || []) {
            const edge = edges.find(e => e.id === analysis.edge_id);
            if (!edge) continue;

            const { error: updateError } = await supabase
                .from('cde_user_edges')
                .update({
                    is_analyzed: true,
                    confidence_score: analysis.confidence || 0.5,
                    analysis_result: {
                        is_valid: analysis.is_valid,
                        summary: analysis.summary,
                        mechanism: analysis.mechanism,
                        risks: analysis.risks,
                        recommendations: analysis.recommendations,
                        analyzed_at: new Date().toISOString(),
                    },
                    analyzed_at: new Date().toISOString(),
                })
                .eq('id', edge.id);

            if (!updateError) analyzedCount++;
        }

        // If we couldn't match by ID, update all edges with general analysis
        if (analyzedCount === 0 && analysisResult.analyses?.length > 0) {
            for (let i = 0; i < edges.length && i < analysisResult.analyses.length; i++) {
                const analysis = analysisResult.analyses[i];
                await supabase
                    .from('cde_user_edges')
                    .update({
                        is_analyzed: true,
                        confidence_score: analysis.confidence || 0.5,
                        analysis_result: {
                            is_valid: analysis.is_valid,
                            summary: analysis.summary,
                            mechanism: analysis.mechanism,
                            risks: analysis.risks,
                            recommendations: analysis.recommendations,
                            analyzed_at: new Date().toISOString(),
                        },
                        analyzed_at: new Date().toISOString(),
                    })
                    .eq('id', edges[i].id);
                analyzedCount++;
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                analyzed: analyzedCount,
                total: edges.length,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Analyze user links error:", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error"
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
