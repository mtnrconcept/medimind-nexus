import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";
import { buildMedicationCatalog, isInteractionDocumented } from "./medication-catalog.ts";
import { filterMedicationsByPathology, buildPathologyPrompt, buildPathologyUserPrompt, PathologyMapping } from "./pathology-filter.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Substance {
    id: string;
    name: string;
    properties: Record<string, any>;
}

interface PairAnalysis {
    substance_b_name: string;
    is_documented: boolean;
    discovery_type: string;
    plausibility_score: number;
    severity: string;
    reasoning: string;
    mechanism: string;
    recommendation: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { action, run_id, substance_index, target_pathology } = await req.json();

        // ============================================
        // ACTION: START - Create a new analysis run
        // ============================================
        if (action === "start") {
            // Get local substances from Knowledge Graph
            const { data: localSubstances, error: subError } = await supabase
                .from("cde_nodes")
                .select("id, name, node_type, properties")
                .eq("node_type", "substance")
                .order("name");

            if (subError) throw subError;

            console.log(`Local substances: ${(localSubstances || []).length}`);

            // BUILD COMPREHENSIVE MEDICATION CATALOG
            // This includes: Local DB (~1K) + OpenFDA (~100K+) + DrugBank (~76K)
            const drugbankApiKey = Deno.env.get("DRUGBANK_API_KEY");

            console.log(`Building comprehensive medication catalog...`);
            const comprehensiveCatalog = await buildMedicationCatalog(
                localSubstances || [],
                drugbankApiKey
            );

            console.log(`✅ Catalog built: ${comprehensiveCatalog.length} total medications`);

            // Apply pathology filter if specified
            let entities = comprehensiveCatalog;
            let pathologyContext: PathologyMapping | null = null;

            if (target_pathology) {
                const filterResult = filterMedicationsByPathology(comprehensiveCatalog, target_pathology);
                entities = filterResult.filtered;
                pathologyContext = filterResult.pathologyContext;
                console.log(`🎯 Pathology targeting: "${target_pathology}" → ${pathologyContext?.name || 'custom'}`);
            }

            if (entities.length < 2) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `Pas assez de substances pour l'analyse (trouvé: ${entities.length}, minimum: 2). Peuplez le KG d'abord.`
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Calculate total pairs
            const totalPairs = (entities.length * (entities.length - 1)) / 2;

            // Create analysis run (target_pathology stored in response, not DB until migration applied)
            const { data: run, error: runError } = await supabase
                .from("cde_analysis_runs")
                .insert({
                    status: "running",
                    total_substances: entities.length,
                    current_substance_index: 0,
                    pairs_analyzed: 0,
                    discoveries_found: 0
                })
                .select()
                .single();

            if (runError) throw runError;

            return new Response(JSON.stringify({
                success: true,
                run_id: run.id,
                total_substances: entities.length,
                total_pairs: totalPairs,
                substances: entities.slice(0, 50).map((e: any) => e.name),
                target_pathology: target_pathology || null,
                pathology_context: pathologyContext ? {
                    name: pathologyContext.name,
                    therapeutic_classes: pathologyContext.therapeuticClasses,
                    atc_prefixes: pathologyContext.atcPrefixes
                } : null
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ============================================
        // ACTION: ANALYZE - Analyze one entity against all remaining
        // ============================================
        if (action === "analyze") {
            if (!run_id || substance_index === undefined) {
                throw new Error("run_id et substance_index requis");
            }

            // Get run info
            const { data: run, error: runError } = await supabase
                .from("cde_analysis_runs")
                .select("*")
                .eq("id", run_id)
                .single();

            if (runError || !run) throw new Error("Run non trouvé");

            // Check if paused - if so, auto-resume after a delay
            if (run.status === "paused") {
                return new Response(JSON.stringify({
                    success: true,
                    paused: true,
                    message: "Analyse en pause. Reprendra automatiquement."
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Rebuild comprehensive catalog (same as START)
            const { data: localSubstances } = await supabase
                .from("cde_nodes")
                .select("id, name, node_type, properties")
                .eq("node_type", "substance")
                .order("name");

            const drugbankApiKey = Deno.env.get("DRUGBANK_API_KEY");
            const allEntities = await buildMedicationCatalog(
                localSubstances || [],
                drugbankApiKey
            );

            console.log(`Catalog rebuilt: ${allEntities.length} medications`);

            // Retrieve pathology context from run if set
            const runPathology = run.target_pathology || null;
            let pathologyContext: PathologyMapping | null = null;
            let sortedEntities = allEntities;

            if (runPathology) {
                const filterResult = filterMedicationsByPathology(allEntities, runPathology);
                sortedEntities = filterResult.filtered;
                pathologyContext = filterResult.pathologyContext;
                console.log(`🎯 Continuing with pathology: "${runPathology}"`);
            }

            const entityA = sortedEntities[substance_index];
            if (!entityA) {
                // Analysis complete
                await supabase
                    .from("cde_analysis_runs")
                    .update({ status: "completed", completed_at: new Date().toISOString() })
                    .eq("id", run_id);

                return new Response(JSON.stringify({
                    success: true,
                    completed: true,
                    message: "Analyse systématique terminée"
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Get remaining entities to test (avoid duplicates)
            let remainingEntities = sortedEntities.slice(substance_index + 1);

            // ============================================
            // FILTER: Remove already-analyzed pairs
            // ============================================
            const { data: existingPairs } = await supabase
                .from("cde_analyzed_pairs")
                .select("substance_a_name, substance_b_name")
                .or(`substance_a_name.eq.${entityA.name},substance_b_name.eq.${entityA.name}`);

            const analyzedSet = new Set<string>();
            if (existingPairs) {
                for (const p of existingPairs) {
                    // Add both orderings to the set
                    analyzedSet.add(`${p.substance_a_name}|${p.substance_b_name}`);
                    analyzedSet.add(`${p.substance_b_name}|${p.substance_a_name}`);
                }
            }

            // Filter out already analyzed entities
            const originalCount = remainingEntities.length;
            remainingEntities = remainingEntities.filter((e: any) => {
                const pairKey = `${entityA.name}|${e.name}`;
                return !analyzedSet.has(pairKey);
            });

            let analyticallyCachedCount = originalCount - remainingEntities.length;

            // ============================================
            // FILTER: Remove pairs already in drug_interactions (DOCUMENTED)
            // ============================================
            const filteredEntities = [];
            let documentedCount = 0;

            for (const entity of remainingEntities) {
                const isDocumented = await isInteractionDocumented(
                    supabase,
                    entityA.name,
                    entity.name
                );

                if (isDocumented) {
                    documentedCount++;
                    console.log(`⏭️  Skipping documented: ${entityA.name} ↔ ${entity.name}`);
                } else {
                    filteredEntities.push(entity);
                }
            }

            remainingEntities = filteredEntities;
            const totalSkipped = analyticallyCachedCount + documentedCount;

            console.log(`${entityA.name}: ${analyticallyCachedCount} cached + ${documentedCount} documented = ${totalSkipped} skipped, ${remainingEntities.length} novel pairs to test`);

            if (remainingEntities.length === 0) {
                // All pairs already analyzed, move to next
                return new Response(JSON.stringify({
                    success: true,
                    substance_completed: entityA.name,
                    next_index: substance_index + 1,
                    skipped: totalSkipped,
                    discoveries: []
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Build prompt for OpenAI - adapt based on entity type and pathology
            const entityType = entityA.node_type || 'substance';

            const baseSystemPrompt = `Tu es un chercheur en pharmacologie et toxicologie computationnelle. Tu analyses TOUTES les interactions potentielles entre:
- Substances médicamenteuses (principes actifs)
- Pathologies (maladies, syndromes)
- Aliments (qui peuvent interagir avec les médicaments)
- Allergènes

IMPORTANT: Cherche des interactions NON DOCUMENTÉES ou peu connues. Si bien documentée, indique is_documented: true.

Types d'analyses:
- SUBSTANCE ↔ SUBSTANCE: interactions pharmacocinétiques/dynamiques
- SUBSTANCE ↔ PATHOLOGIE: contre-indications, aggravations, effets bénéfiques
- SUBSTANCE ↔ ALIMENT: interactions pamplemousse/CYP450, absorption, etc.
- PATHOLOGIE ↔ PATHOLOGIE: comorbidités, synergies de risque

Réponds UNIQUEMENT en JSON valide.`;

            // Apply pathology-aware prompt enhancement
            const systemPrompt = buildPathologyPrompt(pathologyContext, baseSystemPrompt);
            const userPrompt = buildPathologyUserPrompt(entityA, remainingEntities, pathologyContext);

            // Call OpenAI (non-streaming for structured response)
            const aiResult = await callAI(
                systemPrompt,
                userPrompt,
                {
                    model: "gpt-5.5",
                    maxTokens: 4000
                }
            );

            const content = aiResult.text || "{}";

            // Parse JSON response
            let analysisResult;
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                analysisResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { pairs: [] };
            } catch (e) {
                console.error("JSON parse error:", e);
                analysisResult = { pairs: [] };
            }

            // Get existing discoveries to prevent duplicates
            const { data: existingDiscoveries } = await supabase
                .from("discovery_cards")
                .select("title, hypothesis")
                .limit(1000);

            const existingTitles = new Set(
                (existingDiscoveries || []).map(d => d.title.toLowerCase().trim())
            );

            // Save pairs to database
            const pairs = analysisResult.pairs || [];
            let discoveriesCount = 0;
            let skippedDuplicates = 0;

            for (const pair of pairs) {
                const entityBName = pair.entity_b_name || pair.substance_b_name;
                if (!entityBName) continue;

                const entityB = remainingEntities.find((e: any) =>
                    e.name.toLowerCase().includes(entityBName.toLowerCase()) ||
                    entityBName.toLowerCase().includes(e.name.toLowerCase())
                );

                // Generate potential discovery title for dedup check
                const potentialTitle = `Interaction ${entityA.name} - ${entityBName}`.toLowerCase().trim();
                const reverseTitle = `Interaction ${entityBName} - ${entityA.name}`.toLowerCase().trim();

                // Skip if already exists in discovery_cards
                if (existingTitles.has(potentialTitle) || existingTitles.has(reverseTitle)) {
                    console.log(`Skipping duplicate discovery: ${potentialTitle}`);
                    skippedDuplicates++;
                    continue;
                }

                // Check if this exact pair was already analyzed in this run
                const { data: existingPair } = await supabase
                    .from("cde_pair_analyses")
                    .select("id")
                    .eq("run_id", run_id)
                    .eq("substance_a_name", entityA.name)
                    .eq("substance_b_name", entityBName)
                    .maybeSingle();

                if (existingPair) {
                    console.log(`Pair already in this run: ${entityA.name} - ${entityBName}`);
                    skippedDuplicates++;
                    continue;
                }

                // Save to run-specific table
                await supabase.from("cde_pair_analyses").insert({
                    run_id,
                    substance_a_id: entityA.id,
                    substance_a_name: entityA.name,
                    substance_b_id: entityB?.id || null,
                    substance_b_name: entityBName,
                    is_documented: pair.is_documented || false,
                    discovery_type: pair.discovery_type || "aucun",
                    plausibility_score: pair.plausibility_score || 0,
                    severity: pair.severity || "faible",
                    reasoning: pair.reasoning || "",
                    mechanism: pair.mechanism || "",
                    recommendation: pair.recommendation || ""
                });

                // Record to global analyzed pairs table (prevents future re-analysis)
                await supabase.rpc("record_analyzed_pair", {
                    a_name: entityA.name,
                    b_name: entityBName,
                    discovery: pair.discovery_type || null,
                    plausibility: pair.plausibility_score || null,
                    documented: pair.is_documented || false
                });

                if (!pair.is_documented && pair.discovery_type !== "aucun") {
                    discoveriesCount++;
                    // Add to our set to prevent within-batch duplicates
                    existingTitles.add(potentialTitle);
                }
            }

            console.log(`${entityA.name}: ${discoveriesCount} new discoveries, ${skippedDuplicates} skipped duplicates`);

            // Update run progress
            await supabase
                .from("cde_analysis_runs")
                .update({
                    current_substance_index: substance_index + 1,
                    pairs_analyzed: run.pairs_analyzed + pairs.length,
                    discoveries_found: run.discoveries_found + discoveriesCount
                })
                .eq("id", run_id);

            // Build research steps for UI display
            const researchSteps = [
                {
                    step: 1,
                    title: "Identification de l'entité principale",
                    description: `Analyse de [${(entityA.node_type || entityType).toUpperCase()}] ${entityA.name}`,
                    details: entityA.properties || {}
                },
                {
                    step: 2,
                    title: "Sélection des entités à tester",
                    description: `${remainingEntities.length} entités restantes à analyser (${totalSkipped} déjà analysées ou documentées)`,
                    entities: remainingEntities.slice(0, 25).map((e: any) => ({
                        name: e.name,
                        type: e.node_type
                    }))
                },
                {
                    step: 3,
                    title: "Envoi au modèle OpenAI",
                    description: "Analyse pharmacologique et toxicologique des interactions potentielles",
                    prompt_preview: userPrompt.substring(0, 500) + "..."
                },
                {
                    step: 4,
                    title: "Analyse des résultats",
                    description: `${pairs.length} paires analysées, ${discoveriesCount} nouvelles découvertes`,
                    discoveries: pairs.filter((p: any) => !p.is_documented && p.discovery_type !== "aucun").map((p: any) => ({
                        entity: p.entity_b_name || p.substance_b_name,
                        type: p.discovery_type,
                        severity: p.severity,
                        mechanism: p.mechanism,
                        plausibility: p.plausibility_score
                    }))
                }
            ];

            return new Response(JSON.stringify({
                success: true,
                substance_analyzed: entityA.name,
                entity_type: entityA.node_type,
                pairs_count: pairs.length,
                discoveries_count: discoveriesCount,
                synthesis: analysisResult.synthesis || "",
                next_index: substance_index + 1,
                remaining: allEntities.length - substance_index - 1,
                // NEW: Research workflow details for UI
                research_steps: researchSteps,
                prompt_used: userPrompt,
                entities_tested: remainingEntities.slice(0, 25).map((e: any) => e.name),
                full_analysis: pairs.map((p: any) => ({
                    entity_b: p.entity_b_name || p.substance_b_name,
                    documented: p.is_documented,
                    discovery_type: p.discovery_type,
                    severity: p.severity,
                    mechanism: p.mechanism,
                    reasoning: p.reasoning,
                    recommendation: p.recommendation,
                    plausibility: p.plausibility_score
                }))
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ============================================
        // ACTION: STATUS - Get run status
        // ============================================
        if (action === "status") {
            const { data: run, error: runError } = await supabase
                .from("cde_analysis_runs")
                .select("*")
                .eq("id", run_id)
                .single();

            if (runError) throw runError;

            const { data: discoveries } = await supabase
                .from("cde_pair_analyses")
                .select("*")
                .eq("run_id", run_id)
                .eq("is_documented", false)
                .neq("discovery_type", "aucun")
                .order("plausibility_score", { ascending: false });

            return new Response(JSON.stringify({
                success: true,
                run,
                discoveries: discoveries || []
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ============================================
        // ACTION: PAUSE/RESUME
        // ============================================
        if (action === "pause" || action === "resume") {
            const newStatus = action === "pause" ? "paused" : "running";

            await supabase
                .from("cde_analysis_runs")
                .update({ status: newStatus })
                .eq("id", run_id);

            return new Response(JSON.stringify({
                success: true,
                status: newStatus
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        throw new Error(`Action non reconnue: ${action}`);

    } catch (error) {
        console.error("CDE Systematic error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Erreur inconnue"
        }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
