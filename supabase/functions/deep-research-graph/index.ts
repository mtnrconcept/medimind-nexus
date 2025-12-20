// ============================================
// DEEP RESEARCH SEMANTIC GRAPH ENGINE
// Uses Claude Opus 4.5 for comprehensive multi-source research
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

interface SemanticNode {
    id: string;
    node_type: 'PATHOLOGY' | 'DRUG' | 'MEDICATION' | 'SYMPTOM' | 'TREATMENT' | 'COMPLICATION' | 'LAB' | 'GUIDELINE' | 'LIFESTYLE' | 'EVIDENCE';
    label: string;
    description: string;
    category_id?: string;
    weight: number; // 0-1, importance score
    source: string;
    parent_pathology?: string; // For comorbidity: which pathology this node belongs to
}

interface SemanticEdge {
    source_id: string;
    target_id: string;
    edge_type: string;
    weight: number;
    rationale: string;
}

interface ResearchResult {
    nodes: SemanticNode[];
    edges: SemanticEdge[];
    sources_consulted: string[];
    research_summary: string;
}

// ============================================
// EXTERNAL API FETCHERS
// ============================================

async function fetchPubMedData(topic: string): Promise<any[]> {
    try {
        // Search for recent articles
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(topic)}&retmax=10&retmode=json&sort=relevance`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        const ids = searchData.esearchresult?.idlist || [];
        if (ids.length === 0) return [];

        // Fetch article details
        const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
        const fetchRes = await fetch(fetchUrl);
        const fetchData = await fetchRes.json();

        return Object.values(fetchData.result || {}).filter((item: any) => item.uid);
    } catch (error) {
        console.error('[PUBMED] Error:', error);
        return [];
    }
}

async function fetchOpenFDAData(drugName: string): Promise<any[]> {
    try {
        const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=20`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
    } catch (error) {
        console.error('[OPENFDA] Error:', error);
        return [];
    }
}

// ============================================
// LOCAL DATABASE QUERIES
// ============================================

async function fetchLocalData(supabase: any, topic: string): Promise<{
    pathologies: any[];
    symptoms: any[];
    treatments: any[];
    medications: any[];
    interactions: any[];
}> {
    const searchPattern = `%${topic}%`;

    // Parallel queries - increased limits
    const [pathologies, symptoms, treatments, medications, interactions] = await Promise.all([
        supabase.from('pathologies')
            .select('id, name, description, category, severity')
            .or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
            .limit(30),
        supabase.from('symptoms')
            .select('id, name, description, body_system')
            .or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
            .limit(50),
        supabase.from('treatments')
            .select('id, name, description, type, pathology_id')
            .or(`name.ilike.${searchPattern},description.ilike.${searchPattern}`)
            .limit(40),
        supabase.from('medications')
            .select('id, name, description, atc_code, substance')
            .or(`name.ilike.${searchPattern},substance.ilike.${searchPattern}`)
            .limit(50),
        supabase.from('drug_interactions')
            .select('id, medication_id, interacting_drug, severity, description')
            .limit(30)
    ]);

    return {
        pathologies: pathologies.data || [],
        symptoms: symptoms.data || [],
        treatments: treatments.data || [],
        medications: medications.data || [],
        interactions: interactions.data || []
    };
}

// ============================================
// CLAUDE OPUS SYNTHESIS
// ============================================

async function synthesizeWithClaude(
    topic: string,
    localData: any,
    pubmedArticles: any[],
    fdaEvents: any[],
    existingNodes: Array<{ name: string; node_type: string }> = [],
    allPathologies: string[] = [] // NEW: For comorbidity analysis
): Promise<ResearchResult> {
    const anthropicKey = Deno.env.get("CLAUDE_API_KEY");
    if (!anthropicKey) {
        throw new Error("CLAUDE_API_KEY not configured");
    }

    // Prepare existing nodes context for cross-linking
    const existingNodesContext = existingNodes.length > 0
        ? `\n\nNOEUDS EXISTANTS SUR LE GRAPHE (à analyser pour liens croisés):
${existingNodes.map(n => `- ${n.name} (${n.node_type})`).join('\n')}

IMPORTANT: En plus des liens vers le noeud central "${topic}", analyse si les NOUVEAUX noeuds que tu génères ont des liens avec ces noeuds EXISTANTS. Si oui, crée les arêtes correspondantes avec les bons edge_type.`
        : '';

    // Build comorbidity context if multiple pathologies
    const comorbidityContext = allPathologies.length > 1
        ? `\n\n🚨 ANALYSE DE COMORBIDITÉ CRITIQUE 🚨
Patient avec PLUSIEURS conditions simultanées: ${allPathologies.join(' + ')}

Tu DOIS analyser:
1. INTERACTIONS entre ces conditions quand elles coexistent
2. COMPLICATIONS qui surviennent quand ces pathologies sont combinées
3. CONTRE-INDICATIONS de traitements: certains traitements pour une condition peuvent être DANGEREUX en présence de l'autre
4. PROTOCOLES ADAPTÉS: comment modifier le plan de traitement standard
5. URGENCE: identifier si la combinaison est une SITUATION CRITIQUE

Exemple: Syndrome néphrotique + Varicelle = situation CRITIQUE car l'immunosuppression du traitement du syndrome néphrotique aggrave la varicelle.

Crée des nœuds de type COMPLICATION et des arêtes CONTRAINDICATED_IF / DANGEROUS pour les interactions graves.`
        : '';

    const systemPrompt = `Tu es un expert en recherche sémantique médicale.
Ta mission: DÉCOUVRIR de nouveaux concepts médicaux sémantiquement liés à "${topic}" ET leurs INTERCONNEXIONS.${comorbidityContext}

RÈGLES DE DÉCOUVERTE:
1. Chaque nœud doit représenter un concept DISTINCT et NOUVEAU à explorer
2. Les concepts doivent être directement liés sémantiquement à "${topic}"
3. Inclure différents types: médicaments qui interagissent, complications possibles, examens diagnostiques, symptômes associés, facteurs de risque, traitements

RÈGLES CRITIQUES POUR LES ARÊTES (EDGES):
4. Chaque nœud DOIT avoir AU MOINS une arête le connectant au nœud source (id: "c0" = "${topic}")
5. MAIS AUSSI: crée des arêtes ENTRE les nouveaux nœuds quand ils ont une relation réelle!
   - Médicament → effet secondaire (SIDE_EFFECT)
   - Médicament → médicament avec interaction (DRUG_INTERACTION)
   - Traitement → symptôme qu'il améliore (IMPROVES)
   - Pathologie → complication (COMPLICATES)
   - Examens → ce qu'ils diagnostiquent (DIAGNOSED_BY)
6. IMPORTANT: le graphe doit être RICHE en interconnexions, pas juste des rayons depuis le centre!

TYPES DE NŒUDS (utilise exactement ces valeurs):
- PATHOLOGY: pour les pathologies/maladies
- SYMPTOM: pour les symptômes
- TREATMENT: pour les traitements (procédures, thérapies)
- DRUG: pour les médicaments/substances actives
- MEDICATION: alias pour les médicaments
- COMPLICATION: pour les complications
- LAB: pour les examens de laboratoire
- GUIDELINE: pour les recommandations cliniques
- LIFESTYLE: pour les facteurs de mode de vie
- EVIDENCE: pour les preuves scientifiques

TYPES D'ARÊTES (utilise ces valeurs pour un codage couleur correct):
- SYMPTOM_OF: symptôme associé à une pathologie (vert)
- TREATS: traitement d'une pathologie (vert)
- CAUSES: causalité (orange)
- SIDE_EFFECT: effet secondaire d'un médicament (orange)
- DRUG_INTERACTION: interaction entre médicaments (rouge)
- INTERACTS_WITH: interaction médicamenteuse (rouge)
- CONTRAINDICATED_IF: contre-indication médicament/pathologie (rouge + ☠️)
- CONTRAINDICATION: contre-indication grave (rouge + ☠️)
- DANGEROUS: relation dangereuse (rouge + ☠️)
- ASSOCIATED_WITH: association générale (orange)
- WORSENED_BY: aggravation (orange)
- IMPROVED_BY: amélioration (vert)
- PREVENTS: prévention (vert)
- DIAGNOSED_BY: diagnostic (bleu)
- COMPLICATES: complication (orange)

Maximum 30 nouveaux concepts, MAIS génère au minimum 50 arêtes (liens entre nœuds)!`;

    const userPrompt = `EXPANSION SÉMANTIQUE depuis: "${topic}"

Je souhaite découvrir de nouveaux concepts médicaux liés à "${topic}" pour approfondir ma recherche.

CONTEXTE - Données de référence:
- Pathologies: ${JSON.stringify(localData.pathologies.slice(0, 10).map((p: any) => p.name))}
- Symptômes: ${JSON.stringify(localData.symptoms.slice(0, 15).map((s: any) => s.name))}
- Traitements: ${JSON.stringify(localData.treatments.slice(0, 15).map((t: any) => t.name))}
- Médicaments: ${JSON.stringify(localData.medications.slice(0, 20).map((m: any) => m.name))}

LITTÉRATURE RÉCENTE:
${pubmedArticles.slice(0, 8).map((a: any) => `- ${a.title}`).join('\n')}

PHARMACOVIGILANCE:
${fdaEvents.slice(0, 10).map((e: any) => `- ${e.patient?.reaction?.[0]?.reactionmeddrapt || 'N/A'}`).join('\n')}

Génère des concepts NOUVEAUX à découvrir ET LEURS INTERCONNEXIONS:${existingNodesContext}

IMPORTANT: Génère beaucoup d'arêtes ENTRE les nœuds (pas seulement vers c0)!

${allPathologies.length > 1 ? `
🚨 MODE COMORBIDITÉ - RÈGLES CRITIQUES:
1. CHAQUE nœud DOIT avoir un champ "parent_pathology" indiquant à quelle pathologie il appartient
2. Génère AU MINIMUM 30-40 nœuds pour CHAQUE pathologie: ${allPathologies.join(', ')}
3. CHAQUE pathologie centrale (${allPathologies.join(', ')}) doit être un nœud de type PATHOLOGY avec ring: 0
4. Crée des arêtes spéciales COMORBIDITY_INTERACTION ou CONTRAINDICATED_IF entre nœuds de pathologies DIFFÉRENTES
5. PENSER LARGE: symptomes, traitements, médicaments, effets secondaires, complications, examens, contre-indications, interactions, facteurs de risque...
6. SITUATION CRITIQUE: Identifie pourquoi la combinaison ${allPathologies.join(' + ')} est dangereuse!
` : ''}

Génère un graphe RICHE avec ${allPathologies.length > 1 ? 'au moins 60-100 nœuds au total' : 'au moins 40-60 nœuds'}.

{
  "nodes": [
    {"id": "c0", "node_type": "PATHOLOGY", "label": "${allPathologies[0] || topic}", "description": "Pathologie centrale 1", "weight": 1.0, "source": "expansion", "parent_pathology": "${allPathologies[0] || topic}", "ring": 0}${allPathologies.length > 1 ? `,
    {"id": "c1", "node_type": "PATHOLOGY", "label": "${allPathologies[1]}", "description": "Pathologie centrale 2 - COMORBIDITÉ", "weight": 1.0, "source": "expansion", "parent_pathology": "${allPathologies[1]}", "ring": 0},
    {"id": "d1_p1", "node_type": "DRUG", "label": "Traitement principal ${allPathologies[0]}", "description": "...", "weight": 0.9, "source": "découverte", "parent_pathology": "${allPathologies[0]}", "ring": 1},
    {"id": "d1_p2", "node_type": "DRUG", "label": "Traitement principal ${allPathologies[1]}", "description": "...", "weight": 0.9, "source": "découverte", "parent_pathology": "${allPathologies[1]}", "ring": 1},
    {"id": "comp1", "node_type": "COMPLICATION", "label": "Complication grave de la comorbidité", "description": "Quand ${allPathologies[0]} + ${allPathologies[1]}", "weight": 0.95, "source": "comorbidité", "parent_pathology": "COMORBIDITY", "ring": 2}` : `,
    {"id": "d1", "node_type": "DRUG", "label": "Médicament A", "description": "Traitement de ${topic}", "weight": 0.9, "source": "découverte", "parent_pathology": "${topic}", "ring": 1}`}
  ],
  "edges": [
    {"source_id": "c0", "target_id": "d1_p1", "edge_type": "TREATS", "weight": 0.9, "rationale": "Médicament traite la pathologie"}${allPathologies.length > 1 ? `,
    {"source_id": "c1", "target_id": "d1_p2", "edge_type": "TREATS", "weight": 0.9, "rationale": "Traitement pathologie 2"},
    {"source_id": "d1_p1", "target_id": "c1", "edge_type": "CONTRAINDICATED_IF", "weight": 0.95, "rationale": "Ce traitement est dangereux en présence de ${allPathologies[1]}"},
    {"source_id": "c0", "target_id": "comp1", "edge_type": "COMPLICATES", "weight": 0.9, "rationale": "Complication liée à la comorbidité"},
    {"source_id": "c1", "target_id": "comp1", "edge_type": "COMPLICATES", "weight": 0.9, "rationale": "Complication liée à la comorbidité"}` : ``}
  ],
  "sources_consulted": ["Base locale", "PubMed", "OpenFDA"],
  "research_summary": "Expansion: X concepts pour ${allPathologies.length} pathologie(s)"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8000,
            messages: [
                { role: "user", content: userPrompt }
            ],
            system: systemPrompt
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${error}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "{}";

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonContent = content;
    if (content.includes("```json")) {
        jsonContent = content.split("```json")[1].split("```")[0];
    } else if (content.includes("```")) {
        jsonContent = content.split("```")[1].split("```")[0];
    }

    try {
        return JSON.parse(jsonContent.trim());
    } catch (e) {
        console.error('[CLAUDE] JSON parse error:', e);
        // Return minimal fallback
        return {
            nodes: localData.pathologies.slice(0, 1).map((p: any, i: number) => ({
                id: `p${i}`,
                node_type: 'PATHOLOGY' as const,
                label: p.name,
                description: p.description || '',
                weight: 0.9,
                source: 'local'
            })),
            edges: [],
            sources_consulted: ['local'],
            research_summary: `Recherche sur ${topic}`
        };
    }
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const startTime = Date.now();

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const {
            topic,
            pathologies: inputPathologies = [],
            isComorbidityAnalysis = false,
            max_nodes = 150,
            include_pubmed = true,
            include_fda = true,
            // NEW: Receive existing nodes for cross-link analysis
            existing_nodes = []
        } = await req.json();

        // Handle multiple pathologies for comorbidity analysis
        const allPathologies: string[] = inputPathologies.length > 0 ? inputPathologies : (topic ? [topic] : []);

        if (!topic) {
            return new Response(
                JSON.stringify({ error: "Topic is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[DEEP-RESEARCH] Starting research for: ${topic}`);

        // STEP 0: Check cache for existing nodes (HYBRID: use as base, not final result)
        let cachedNodes: any[] = [];
        let cachedEdges: any[] = [];
        let cacheId: string | null = null;

        if (existing_nodes.length === 0) {
            const normalizedTopic = topic.toLowerCase().trim()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9\s]/g, '');

            const { data: cached, error: cacheError } = await supabase
                .from('semantic_graph_cache')
                .select('*')
                .eq('topic_normalized', normalizedTopic)
                .single();

            if (cached && !cacheError) {
                console.log(`[DEEP-RESEARCH] Cache HIT - loading ${cached.nodes?.length || 0} cached nodes as base`);
                cachedNodes = cached.nodes || [];
                cachedEdges = cached.edges || [];
                cacheId = cached.id;

                // Update hit count
                await supabase
                    .from('semantic_graph_cache')
                    .update({ hit_count: cached.hit_count + 1, updated_at: new Date().toISOString() })
                    .eq('id', cached.id);
            } else {
                console.log('[DEEP-RESEARCH] Cache MISS, will generate full graph...');
            }
        }

        // Use cached nodes as existing_nodes for Claude to build upon
        const nodesForClaude = existing_nodes.length > 0 ? existing_nodes : cachedNodes;

        if (nodesForClaude.length > 0) {
            console.log(`[DEEP-RESEARCH] Passing ${nodesForClaude.length} existing nodes to Claude for expansion`);
        }

        // Step 1: Fetch local data
        console.log('[DEEP-RESEARCH] Fetching local data...');
        const localData = await fetchLocalData(supabase, topic);
        console.log(`[DEEP-RESEARCH] Found ${localData.pathologies.length} pathologies, ${localData.symptoms.length} symptoms`);

        // Step 2: Fetch external data (parallel)
        console.log('[DEEP-RESEARCH] Fetching external sources...');
        const [pubmedArticles, fdaEvents] = await Promise.all([
            include_pubmed ? fetchPubMedData(topic) : Promise.resolve([]),
            include_fda ? fetchOpenFDAData(topic) : Promise.resolve([])
        ]);
        console.log(`[DEEP-RESEARCH] PubMed: ${pubmedArticles.length}, FDA: ${fdaEvents.length}`);

        // Step 3: Claude synthesis (pass cached/existing nodes for incremental discovery)
        console.log('[DEEP-RESEARCH] Synthesizing with Claude...');
        const claudeResult = await synthesizeWithClaude(topic, localData, pubmedArticles, fdaEvents, nodesForClaude, allPathologies);
        console.log(`[DEEP-RESEARCH] Claude generated ${claudeResult.nodes.length} nodes, ${claudeResult.edges.length} edges`);

        // Step 4: MERGE cached nodes with Claude's new discoveries (deduplicate by ID)
        const existingNodeIds = new Set(cachedNodes.map((n: any) => n.id));
        const newNodesFromClaude = claudeResult.nodes.filter((n: any) => !existingNodeIds.has(n.id));
        const mergedNodes = [...cachedNodes, ...newNodesFromClaude];

        const existingEdgeIds = new Set(cachedEdges.map((e: any) => `${e.source_id}-${e.target_id}`));
        const newEdgesFromClaude = claudeResult.edges.filter((e: any) => !existingEdgeIds.has(`${e.source_id}-${e.target_id}`));
        const mergedEdges = [...cachedEdges, ...newEdgesFromClaude];

        console.log(`[DEEP-RESEARCH] Merged: ${cachedNodes.length} cached + ${newNodesFromClaude.length} new = ${mergedNodes.length} total nodes`);

        const result = {
            nodes: mergedNodes,
            edges: mergedEdges,
            sources_consulted: claudeResult.sources_consulted
        };

        // Step 5: Limit nodes if needed
        if (result.nodes.length > max_nodes) {
            result.nodes = result.nodes.slice(0, max_nodes);
            // Filter edges to only include nodes that exist
            const nodeIds = new Set(result.nodes.map((n: any) => n.id));
            result.edges = result.edges.filter((e: any) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));
        }

        const computeTime = Date.now() - startTime;

        // Step 5: Save to cache (only for new graph, not expansions, and only if we have enough nodes)
        const MIN_NODES_TO_CACHE = 10; // Don't cache incomplete results
        if (existing_nodes.length === 0 && result.nodes.length >= MIN_NODES_TO_CACHE) {
            const normalizedTopic = topic.toLowerCase().trim()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9\s]/g, '');

            try {
                await supabase.from('semantic_graph_cache').upsert({
                    topic,
                    topic_normalized: normalizedTopic,
                    nodes: result.nodes,
                    edges: result.edges,
                    sources_consulted: result.sources_consulted || [],
                    is_comorbidity: allPathologies.length > 1,
                    pathologies: allPathologies,
                    generation_time_ms: computeTime,
                    hit_count: 0,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'topic_normalized' });
                console.log(`[DEEP-RESEARCH] Cached graph for "${topic}" (${result.nodes.length} nodes)`);
            } catch (cacheErr) {
                console.warn('[DEEP-RESEARCH] Cache save failed:', cacheErr);
            }
        } else if (result.nodes.length < MIN_NODES_TO_CACHE) {
            console.log(`[DEEP-RESEARCH] Skipping cache - only ${result.nodes.length} nodes (min: ${MIN_NODES_TO_CACHE})`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                topic,
                ...result,
                from_cache: cachedNodes.length > 0 ? 'hybrid' : false,
                cache_stats: {
                    cached_nodes_used: cachedNodes.length,
                    new_nodes_discovered: newNodesFromClaude.length,
                    total_nodes: result.nodes.length
                },
                metrics: {
                    node_count: result.nodes.length,
                    edge_count: result.edges.length,
                    compute_time_ms: computeTime,
                    sources: {
                        local: localData.pathologies.length + localData.symptoms.length + localData.treatments.length + localData.medications.length,
                        pubmed: pubmedArticles.length,
                        fda: fdaEvents.length
                    }
                }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("[DEEP-RESEARCH] Error:", error);
        return new Response(
            JSON.stringify({ error: "Deep research failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
