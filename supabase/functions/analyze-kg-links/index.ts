import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserEdge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    relationship_type: string;
    notes: string | null;
    source_node?: { id: string; name: string; node_type: string; properties: any };
    target_node?: { id: string; name: string; node_type: string; properties: any };
}

interface ResearchLead {
    title: string;
    description: string;
    type: 'discovery' | 'validation' | 'warning' | 'suggestion';
    confidence: 'high' | 'medium' | 'low';
    relatedLinks: string[];
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // Get auth token from request
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            throw new Error("Authorization header required");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { edgeIds, customPrompt, targetPathology, targetMedication } = await req.json();

        // Verify user and get their edges
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            throw new Error("Invalid token");
        }

        console.log(`[analyze-kg-links] Starting analysis for user ${user.id}`);
        console.log(`[analyze-kg-links] Custom prompt: ${customPrompt || 'none'}`);
        console.log(`[analyze-kg-links] Target pathology: ${targetPathology || 'none'}`);
        console.log(`[analyze-kg-links] Target medication: ${targetMedication || 'none'}`);

        // Fetch user's edges with node details
        let query = supabase
            .from('cde_user_edges')
            .select(`
                *,
                source_node:cde_nodes!source_node_id(id, name, node_type, properties),
                target_node:cde_nodes!target_node_id(id, name, node_type, properties)
            `)
            .eq('user_id', user.id);

        if (edgeIds && edgeIds.length > 0) {
            query = query.in('id', edgeIds);
        }

        const { data: userEdges, error: edgesError } = await query;

        if (edgesError) {
            throw new Error(`Failed to fetch edges: ${edgesError.message}`);
        }

        if (!userEdges || userEdges.length === 0) {
            return new Response(JSON.stringify({
                error: "No edges found",
                researchLeads: []
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Collect all unique nodes involved
        const nodeIds = new Set<string>();
        userEdges.forEach((edge: UserEdge) => {
            nodeIds.add(edge.source_node_id);
            nodeIds.add(edge.target_node_id);
        });

        // Fetch existing edges from the knowledge graph for context
        const { data: kgEdges } = await supabase
            .from('cde_edges')
            .select('*, source:cde_nodes!source_node_id(name, node_type), target:cde_nodes!target_node_id(name, node_type)')
            .or(`source_node_id.in.(${Array.from(nodeIds).join(',')}),target_node_id.in.(${Array.from(nodeIds).join(',')})`)
            .limit(100);

        // Fetch additional context if target pathology/medication specified
        let targetContext = '';
        if (targetPathology) {
            const { data: pathologyData } = await supabase
                .from('pathologies')
                .select('*')
                .ilike('name', `%${targetPathology}%`)
                .limit(1)
                .single();

            if (pathologyData) {
                targetContext += `\n### Pathologie ciblée: ${pathologyData.name}\nDescription: ${pathologyData.description || 'N/A'}\nCatégorie: ${pathologyData.category || 'N/A'}\n`;
            }
        }

        if (targetMedication) {
            const { data: medData } = await supabase
                .from('medications')
                .select('*')
                .ilike('name', `%${targetMedication}%`)
                .limit(1)
                .single();

            if (medData) {
                targetContext += `\n### Médicament ciblé: ${medData.name}\nSubstance: ${medData.substance || 'N/A'}\nClasse: ${medData.therapeutic_class || 'N/A'}\nMécanisme: ${medData.mechanism || 'N/A'}\n`;
            }
        }

        // Build context for OpenAI
        const userLinksContext = userEdges.map((edge: UserEdge) => {
            const source = edge.source_node as any;
            const target = edge.target_node as any;
            return `- [${source?.node_type || '?'}] ${source?.name || '?'} --[${edge.relationship_type}]--> [${target?.node_type || '?'}] ${target?.name || '?'}${edge.notes ? ` (Note: ${edge.notes})` : ''}`;
        }).join('\n');

        const existingKgContext = (kgEdges || []).map((edge: any) => {
            return `- ${edge.source?.name || '?'} --[${edge.relationship_type}]--> ${edge.target?.name || '?'}`;
        }).join('\n');

        const analysisContext = `
## LIENS CRÉÉS PAR L'UTILISATEUR (${userEdges.length} liens)

${userLinksContext}

## CONTEXTE DU KNOWLEDGE GRAPH EXISTANT

${existingKgContext || 'Aucun lien existant dans le graphe pour ces nœuds.'}

${targetContext}

${customPrompt ? `## DEMANDE SPÉCIFIQUE DE L'UTILISATEUR:\n${customPrompt}\n` : ''}
`;

        const systemPrompt = `Tu es un assistant de recherche médicale expert. L'utilisateur a créé des liens hypothétiques entre des entités médicales dans un Knowledge Graph (médicaments, pathologies, symptômes, substances).

## TA MISSION
Analyse ces liens et génère des **pistes de recherche** structurées:

1. **Valide ou critique** chaque lien selon tes connaissances médicales
2. **Identifie les risques** potentiels (interactions, contre-indications)
3. **Propose des synergies** thérapeutiques possibles
4. **Suggère des directions de recherche** prometteuses
5. **Réponds à la demande spécifique** de l'utilisateur s'il en a formulé une

## FORMAT DE RÉPONSE

Pour chaque insight, structure ta réponse ainsi:

### 🔍 [Titre de la piste]
**Type**: discovery | validation | warning | suggestion
**Confiance**: high | medium | low
**Description**: [Explication détaillée]
**Liens concernés**: [Liste des liens pertinents]
**Prochaines étapes**: [Actions recommandées]

---

À LA FIN, génère un bloc JSON récapitulatif:
\`\`\`json
{
  "researchLeads": [
    {
      "title": "...",
      "description": "...",
      "type": "discovery|validation|warning|suggestion",
      "confidence": "high|medium|low",
      "relatedLinks": ["source -> target", ...]
    }
  ],
  "globalAssessment": "...",
  "priorityActions": ["action 1", "action 2", ...]
}
\`\`\`

Sois rigoureux mais créatif. Cherche des connexions non évidentes.`;

        // Call OpenAI with streaming
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const aiResponse = await streamAI(
                        systemPrompt,
                        `Analyse les liens suivants et génère des pistes de recherche:\n\n${analysisContext}`,
                        (text) => {
                            // Format compatible for frontend
                            const chunk = {
                                choices: [{ delta: { content: text } }]
                            };
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                        },
                        {
                            model: "gpt-5.5",
                            reasoningEffort: "high",
                            maxTokens: 8192
                        }
                    );

                    const fullText = aiResponse.text;

                    // Parse research leads from the full text
                    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
                    if (jsonMatch) {
                        try {
                            const result = JSON.parse(jsonMatch[1]);
                            if (result.researchLeads) {
                                // Send research leads as a separate event
                                const leadsEvent = {
                                    researchLeads: result.researchLeads,
                                    globalAssessment: result.globalAssessment,
                                    priorityActions: result.priorityActions
                                };
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(leadsEvent)}\n\n`));

                                // Mark edges as analyzed
                                for (const edge of userEdges) {
                                    await supabase
                                        .from('cde_user_edges')
                                        .update({
                                            is_analyzed: true,
                                            analysis_result: {
                                                summary: result.globalAssessment?.slice(0, 200) || 'Analysis complete',
                                                leads_count: result.researchLeads?.length || 0,
                                                timestamp: new Date().toISOString()
                                            }
                                        })
                                        .eq('id', edge.id);
                                }
                            }
                        } catch (parseError) {
                            console.error("Error parsing research leads JSON:", parseError);
                        }
                    }

                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (e) {
                    console.error("Stream error:", e);
                    controller.error(e);
                }
            },
        });

        return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });

    } catch (error) {
        console.error("analyze-kg-links error:", error);
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error"
        }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
