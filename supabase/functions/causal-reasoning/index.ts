import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, streamAI, cleanJsonString } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Causal Reasoning Engine
 * - For link explanations: Uses OpenAI to generate detailed explanations
 * - For other queries: Queries the Knowledge Graph causal rules
 */

interface CausalQuery {
    query?: string; // For AI-powered explanation
    context?: {
        sourceNode?: string;
        targetNode?: string;
        multiNodes?: { name: string; type: string }[]; // For multi-node analysis
        relationship?: string;
        evidence_grade?: string;
        pathology?: string;
    };
    // Legacy fields for KG queries
    patient_id?: string;
    pathologies?: string[];
    medications?: string[];
    symptoms?: string[];
    age?: number;
    renal_function_egfr?: number;
    is_pregnant?: boolean;
    is_lactating?: boolean;
}

interface CausalResult {
    rules: CausalRule[];
    interactions: CYPInteraction[];
    population_flags: PopulationFlag[];
    risk_summary: RiskSummary;
}

interface CausalRule {
    id: string;
    source: string;
    target: string;
    relation: string;
    strength: string;
    evidence_level: string;
    action: string;
    urgency: string;
    pmid?: string[];
}

interface CYPInteraction {
    enzyme: string;
    inhibitors: string[];
    inducers: string[];
    substrates_at_risk: string[];
    clinical_note: string;
}

interface PopulationFlag {
    factor: string;
    affected_medications: string[];
    modification: string;
    details: string;
}

interface RiskSummary {
    overall_risk: 'FAIBLE' | 'MODERE' | 'ELEVE' | 'CRITIQUE';
    urgent_alerts: number;
    routine_alerts: number;
    key_concerns: string[];
}

// ============================================
// OPENAI LINK EXPLANATION
// ============================================

async function generateLinkExplanationWithOpenAI(
    query: string,
    context: CausalQuery['context']
): Promise<string> {
    // Check if this is a multi-node analysis
    const isMultiNode = context?.multiNodes && context.multiNodes.length > 2;

    let systemPrompt: string;
    let userPrompt: string;

    if (isMultiNode) {
        // Multi-node analysis prompt
        systemPrompt = `Tu es un expert médical clinicien senior spécialisé dans l'analyse systémique des relations entre concepts médicaux.
    Ta mission est de produire une ANALYSE MULTI-NOEUDS COMPLÈTE et ACTIONNABLE des relations entre TOUS les concepts médicaux fournis.

    Règles:
    - Analyse TOUTES les relations entre TOUS les concepts fournis, pas seulement des paires.
    - Identifie les synergies, antagonismes et interactions croisées.
    - Fournis une vision holistique des implications thérapeutiques.
    - Ton ton doit être professionnel mais pédagogique.

    FORMAT DE RÉPONSE OBLIGATOIRE :

    ## 🔬 Analyse Multi-Concepts (${context.multiNodes!.length} nœuds)

    **Contexte pathologique:** [Pathologie]

    ### Vue d'ensemble
    [Paragraphe décrivant la relation globale entre tous ces concepts]

    ### Interactions Clés
    •   [Interaction 1]: [Description] 🔗
    •   [Interaction 2]: [Description] ⚠️
    •   [Interaction 3]: [Description] ✅

    ### Synergies Thérapeutiques
    [Description des combinaisons bénéfiques potentielles]

    ### Contre-indications et Risques Croisés
    [Description des risques quand ces concepts sont combinés]

    ### Recommandation Clinique Intégrée
    [Recommandation finale tenant compte de TOUS les concepts]

    IMPORTANT:
    - Utilise des puces (•) pour les listes.
    - Mets les emojis à la fin des points clés.
    - Analyse les ${context.multiNodes!.length} concepts ENSEMBLE, pas séparément.`;

        userPrompt = `Génère une ANALYSE MULTI-NOEUDS COMPLÈTE des relations entre ces ${context.multiNodes!.length} concepts médicaux:

${context.multiNodes!.map((n, i) => `${i + 1}. **${n.name}** (${n.type})`).join('\n')}

**Contexte pathologique:** ${context?.pathology || 'Non spécifié'}

${query}

Analyse TOUTES les interactions entre ces concepts et fournis une recommandation clinique globale.`;

    } else {
        // Standard 2-node analysis prompt (original)
        systemPrompt = `Tu es un expert médical clinicien senior spécialisé dans la synthèse des connaissances médicales.
    Ta mission est de produire une SYNTHÈSE COMPLÈTE et ACTIONNABLE de la relation entre deux concepts médicaux.

    Règles:
    - Ton ton doit être professionnel mais pédagogique.
    - Structure ta réponse exactement selon le modèle demandé ci-dessous.

    FORMAT DE RÉPONSE OBLIGATOIRE :

    L'analyse du lien entre [Concept 1] et [Concept 2] révèle une relation [nature de la relation: complexe, bidirectionnelle, causale, etc.]. [Brève explication contextuelle].

    Cette relation s'explique par [Nombre] mécanismes majeurs :
    •   [Nom du Mécanisme 1] : [Explication détaillée]. [Emoji pertinent: 🩺]
    •   [Nom du Mécanisme 2] : [Explication détaillée]. [Emoji pertinent: ⚠️]
    •   [Nom du Mécanisme 3] : [Explication détaillée]. [Emoji pertinent: 🔬]

    [Paragraphe de conclusion sur l'importance clinique, le pronostic ou l'implication thérapeutique]. ✅

    Souhaitez-vous approfondir un point précis ? Voici quelques suggestions :
    1. [Question d'approfondissement 1]
    2. [Question d'approfondissement 2]
    3. [Question d'approfondissement 3]

    IMPORTANT :
    - Utilise des puces (•) pour les mécanismes.
    - Mets les emojis à la fin des paragraphes correspondants.
    - La section "Suggestions" doit être numérotée 1, 2, 3.`;

        userPrompt = `Génère une SYNTHÈSE MÉDICALE COMPLÈTE sur la relation entre:

**Concept 1:** ${context?.sourceNode || 'Non spécifié'}
**Concept 2:** ${context?.targetNode || 'Non spécifié'}

**Contexte pathologique:** ${context?.pathology || 'Non spécifié'}
**Type de relation identifiée:** ${context?.relationship || 'À déterminer'}
**Grade d'évidence initial:** ${context?.evidence_grade || 'À évaluer'}

${query}

Produis une synthèse exhaustive et médicalement rigoureuse de cette relation.`;
    }

    try {
        const aiResponse = await callAI(
            systemPrompt,
            userPrompt,
            {
                model: 'gpt-5.5',
                reasoningEffort: 'high',
                maxTokens: isMultiNode ? 4000 : 2000 // More tokens for multi-node analysis
            }
        );

        return aiResponse.text || 'Analyse non disponible.';
    } catch (error) {
        console.error('[CAUSAL-REASONING] AI generation error:', error);
        throw error;
    }
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const query: CausalQuery = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // ============================================
        // MODE 1: AI-powered link explanation / graph analysis
        // ============================================
        if (query.query && query.context) {
            const explanationQuery = query.query;
            const explanationContext = query.context;

            // If stream: false is requested, return JSON directly
            if ((query as any).stream === false) {
                try {
                    // Check if this is a link explanation request (has source/target/pathology)
                    const isLinkExplanation = explanationContext.sourceNode && explanationContext.targetNode && explanationContext.pathology;
                    // Check if this is a multi-node analysis (more than 2 nodes)
                    const isMultiNodeAnalysis = explanationContext.multiNodes && explanationContext.multiNodes.length > 2;

                    if (isLinkExplanation || isMultiNodeAnalysis) {
                        if (isMultiNodeAnalysis) {
                            console.log(`[CAUSAL-REASONING] Generating MULTI-NODE analysis for ${explanationContext.multiNodes!.length} nodes`);
                        } else {
                            console.log(`[CAUSAL-REASONING] Generating JSON explanation for ${explanationContext.sourceNode} -> ${explanationContext.targetNode}`);
                        }
                        const explanation = await generateLinkExplanationWithOpenAI(
                            explanationQuery,
                            explanationContext
                        );

                        return new Response(JSON.stringify({
                            analysis: explanation,
                            explanation: explanation, // Support both field names for compatibility
                            isMultiNode: isMultiNodeAnalysis,
                            nodeCount: isMultiNodeAnalysis ? explanationContext.multiNodes!.length : 2
                        }), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    }

                    // Otherwise, handle as optimal treatment analysis (default)
                    const systemPrompt = `Tu es un expert médical clinicien senior spécialisé en optimisation thérapeutique.
Ta mission est d'analyser un graphe de connaissances médicales et d'identifier le schéma thérapeutique optimal.

Règles STRICTES:
- Réponds UNIQUEMENT en JSON valide
- N'inclus AUCUN texte avant ou après le JSON
- Sélectionne les nœuds formant le meilleur schéma de traitement
- Maximum 10 nœuds dans le schéma optimal`;

                    const userPrompt = explanationQuery;

                    const aiResponse = await callAI(
                        systemPrompt,
                        userPrompt,
                        {
                            model: "gpt-5.5",
                            reasoningEffort: "high",
                            maxTokens: 2000,
                            temperature: 0.1
                        }
                    );

                    // Try to parse JSON from response
                    // Try to parse JSON from response with cleaning
                    const responseText = aiResponse.text || '';
                    // First try to find JSON block
                    let formattedJson = responseText;
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) formattedJson = jsonMatch[0];

                    try {
                        const parsed = JSON.parse(cleanJsonString(formattedJson));
                        return new Response(JSON.stringify({
                            optimal_node_ids: parsed.optimal_node_ids || [],
                            treatment_summary: parsed.treatment_summary || parsed.summary || 'Analyse complétée',
                            rationale: parsed.rationale || ''
                        }), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    } catch (parseErr) {
                        console.error('[CAUSAL-REASONING] JSON parse error:', parseErr);
                        // Fallback below
                    }

                    // Fallback: return the raw text as treatment_summary
                    return new Response(JSON.stringify({
                        optimal_node_ids: [],
                        treatment_summary: responseText.substring(0, 500),
                        rationale: 'Réponse IA non structurée',
                        raw_response: responseText
                    }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });

                } catch (e) {
                    console.error('[CAUSAL-REASONING] Non-streaming AI error:', e);
                    return new Response(JSON.stringify({
                        error: String(e),
                        optimal_node_ids: [],
                        treatment_summary: 'Erreur lors de l\'analyse'
                    }), {
                        status: 500,
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
            }

            // Streaming mode (original behavior)
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    const sendEvent = (data: any) => {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                    };

                    try {
                        const systemPrompt = `Tu es un expert médical clinicien senior spécialisé dans la synthèse des connaissances médicales.
Ta mission est de produire une SYNTHÈSE COMPLÈTE et ACTIONNABLE de la relation entre deux concepts médicaux dans le contexte d'une pathologie donnée.

Règles:
- Produis une synthèse de qualité professionnelle pour un médecin.
- Explique les mécanismes biologiques et physiopathologiques.
- Cite des preuves cliniques avec niveaux d'évidence.
- Fournis des recommandations pratiques.`;

                        const userPrompt = `Analyse de la relation: ${explanationQuery}
Contexte:
- Source: ${explanationContext.sourceNode}
- Cible: ${explanationContext.targetNode}
- Relation: ${explanationContext.relationship}
- Niveau de preuve: ${explanationContext.evidence_grade}
- Pathologie concernée: ${explanationContext.pathology}`;

                        await streamAI(
                            systemPrompt,
                            userPrompt,
                            (chunk) => {
                                sendEvent({ type: 'text', content: chunk });
                            },
                            {
                                model: "gpt-5.5",
                                reasoningEffort: "high",
                                maxTokens: 4000,
                                temperature: 0.1
                            }
                        );
                        sendEvent({ type: 'done' });
                    } catch (e) {
                        sendEvent({ type: 'error', message: String(e) });
                    } finally {
                        controller.close();
                    }
                }
            });

            return new Response(stream, {
                headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
            });
        }


        // ============================================
        // MODE 2: Knowledge Graph causal rules query
        // ============================================
        const results: CausalResult = {
            rules: [],
            interactions: [],
            population_flags: [],
            risk_summary: {
                overall_risk: 'FAIBLE',
                urgent_alerts: 0,
                routine_alerts: 0,
                key_concerns: []
            }
        };

        // 1. Query causal rules for pathologies
        if (query.pathologies && query.pathologies.length > 0) {
            const { data: pathologyRules } = await supabase
                .from('kg_causal_rules')
                .select('*')
                .or(`source_name.ilike.any.{${query.pathologies.map(p => `%${p}%`).join(',')}}`);

            if (pathologyRules) {
                for (const rule of pathologyRules) {
                    results.rules.push({
                        id: rule.id,
                        source: rule.source_name,
                        target: rule.target_name,
                        relation: rule.relation_type,
                        strength: rule.strength,
                        evidence_level: rule.evidence_level,
                        action: rule.recommended_action || '',
                        urgency: rule.urgency || 'INFORMATION',
                        pmid: rule.pmid
                    });

                    if (rule.urgency === 'URGENT' || rule.urgency === 'IMMEDIATE') {
                        results.risk_summary.urgent_alerts++;
                    } else {
                        results.risk_summary.routine_alerts++;
                    }
                }
            }
        }

        // 2. Query causal rules for medications
        if (query.medications && query.medications.length > 0) {
            const { data: medicationRules } = await supabase
                .from('kg_causal_rules')
                .select('*')
                .or(`source_name.ilike.any.{${query.medications.map(m => `%${m}%`).join(',')}}`);

            if (medicationRules) {
                for (const rule of medicationRules) {
                    if (!results.rules.some(r => r.id === rule.id)) {
                        results.rules.push({
                            id: rule.id,
                            source: rule.source_name,
                            target: rule.target_name,
                            relation: rule.relation_type,
                            strength: rule.strength,
                            evidence_level: rule.evidence_level,
                            action: rule.recommended_action || '',
                            urgency: rule.urgency || 'INFORMATION',
                            pmid: rule.pmid
                        });

                        if (rule.urgency === 'URGENT' || rule.urgency === 'IMMEDIATE') {
                            results.risk_summary.urgent_alerts++;
                        } else {
                            results.risk_summary.routine_alerts++;
                        }
                    }
                }
            }
        }

        // 3. Check CYP interactions
        if (query.medications && query.medications.length > 1) {
            const { data: enzymeMeds } = await supabase
                .from('kg_enzyme_medication')
                .select(`
                    *,
                    kg_enzymes!inner(name, clinical_significance)
                `)
                .or(`medication_name.ilike.any.{${query.medications.map(m => `%${m}%`).join(',')}}`);

            if (enzymeMeds) {
                const enzymeMap = new Map<string, { inhibitors: string[], inducers: string[], substrates: string[] }>();

                for (const em of enzymeMeds) {
                    const enzyme = em.kg_enzymes?.name || 'Unknown';
                    if (!enzymeMap.has(enzyme)) {
                        enzymeMap.set(enzyme, { inhibitors: [], inducers: [], substrates: [] });
                    }

                    const entry = enzymeMap.get(enzyme)!;
                    if (em.relationship_type === 'inhibitor') {
                        entry.inhibitors.push(em.medication_name);
                    } else if (em.relationship_type === 'inducer') {
                        entry.inducers.push(em.medication_name);
                    } else if (em.relationship_type.includes('substrate')) {
                        entry.substrates.push(em.medication_name);
                    }
                }

                for (const [enzyme, data] of enzymeMap.entries()) {
                    if ((data.inhibitors.length > 0 || data.inducers.length > 0) && data.substrates.length > 0) {
                        results.interactions.push({
                            enzyme,
                            inhibitors: data.inhibitors,
                            inducers: data.inducers,
                            substrates_at_risk: data.substrates,
                            clinical_note: data.inhibitors.length > 0
                                ? `Risque de surdosage des substrats ${enzyme} (${data.substrates.join(', ')})`
                                : `Risque de sous-dosage des substrats ${enzyme} (${data.substrates.join(', ')})`
                        });

                        results.risk_summary.urgent_alerts++;
                        results.risk_summary.key_concerns.push(`Interaction ${enzyme}: ${data.inhibitors.concat(data.inducers).join(', ')} ↔ ${data.substrates.join(', ')}`);
                    }
                }
            }
        }

        // 4. Check population factors
        const populationFactors: string[] = [];
        if (query.age !== undefined && query.age < 18) populationFactors.push('AGE_PEDIATRIC');
        if (query.age !== undefined && query.age >= 65) populationFactors.push('AGE_GERIATRIC');
        if (query.is_pregnant) populationFactors.push('PREGNANCY');
        if (query.is_lactating) populationFactors.push('LACTATION');
        if (query.renal_function_egfr !== undefined && query.renal_function_egfr < 60) populationFactors.push('RENAL_IMPAIRMENT');

        if (populationFactors.length > 0) {
            const { data: popFactors } = await supabase
                .from('kg_population_factors')
                .select('*')
                .in('factor_type', populationFactors);

            if (popFactors) {
                for (const factor of popFactors) {
                    results.population_flags.push({
                        factor: factor.factor_type,
                        affected_medications: factor.affected_medication_ids || [],
                        modification: factor.modification_type,
                        details: factor.modification_details || ''
                    });
                }
            }
        }

        // 5. Calculate overall risk
        if (results.risk_summary.urgent_alerts >= 3 || results.interactions.length >= 2) {
            results.risk_summary.overall_risk = 'CRITIQUE';
        } else if (results.risk_summary.urgent_alerts >= 1 || results.interactions.length >= 1) {
            results.risk_summary.overall_risk = 'ELEVE';
        } else if (results.risk_summary.routine_alerts >= 3) {
            results.risk_summary.overall_risk = 'MODERE';
        }

        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Causal reasoning error:", error);
        return new Response(
            JSON.stringify({ error: "Causal reasoning failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
