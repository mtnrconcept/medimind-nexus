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
    node_type: 'PATHOLOGY' | 'DRUG' | 'SYMPTOM' | 'COMPLICATION' | 'LAB' | 'GUIDELINE' | 'LIFESTYLE' | 'EVIDENCE';
    label: string;
    description: string;
    category_id?: string;
    weight: number; // 0-1, importance score
    source: string;
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
    fdaEvents: any[]
): Promise<ResearchResult> {
    const anthropicKey = Deno.env.get("CLAUDE_API_KEY");
    if (!anthropicKey) {
        throw new Error("CLAUDE_API_KEY not configured");
    }

    const systemPrompt = `Tu es un expert en recherche sémantique médicale.
Ta mission: DÉCOUVRIR de nouveaux concepts médicaux sémantiquement liés à "${topic}".

Objectif: L'utilisateur explore un graphe de connaissances et veut ÉTENDRE sa recherche dans la direction de "${topic}".
Tu dois trouver des concepts NOUVEAUX et PERTINENTS qui permettent d'approfondir la compréhension de "${topic}".

RÈGLES DE DÉCOUVERTE:
1. Chaque nœud doit représenter un concept DISTINCT et NOUVEAU à explorer
2. Les concepts doivent être directement liés sémantiquement à "${topic}"
3. Inclure différents types: médicaments qui interagissent, complications possibles, examens diagnostiques, symptômes associés, facteurs de risque
4. Chaque nœud DOIT avoir une arête le connectant au nœud source (id: "c0" qui est "${topic}")
5. Les relations doivent être CLINIQUEMENT PERTINENTES
6. Types de nœuds: PATHOLOGY, DRUG, SYMPTOM, COMPLICATION, LAB, GUIDELINE, LIFESTYLE, EVIDENCE
7. Types d'arêtes: TREATS, CAUSES, ASSOCIATED_WITH, CONTRAINDICATED_IF, COMPLICATES, DIAGNOSED_BY, WORSENED_BY, IMPROVED_BY, PREVENTS, INTERACTS_WITH
8. Maximum 30 nouveaux concepts pour cette expansion`;

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

Génère des concepts NOUVEAUX à découvrir, chacun lié à "${topic}":

{
  "nodes": [
    {"id": "c0", "node_type": "TYPE_DU_TOPIC", "label": "${topic}", "description": "Point de départ de l'expansion", "weight": 1.0, "source": "expansion"},
    {"id": "d1", "node_type": "DRUG", "label": "Nouveau médicament lié", "description": "Pertinence pour ${topic}", "weight": 0.9, "source": "découverte"},
    {"id": "s1", "node_type": "SYMPTOM", "label": "Symptôme associé", "description": "Lien avec ${topic}", "weight": 0.8, "source": "découverte"}
  ],
  "edges": [
    {"source_id": "c0", "target_id": "d1", "edge_type": "ASSOCIATED_WITH", "weight": 0.8, "rationale": "Ce médicament est pertinent pour ${topic}"},
    {"source_id": "c0", "target_id": "s1", "edge_type": "CAUSES", "weight": 0.7, "rationale": "Ce symptôme est lié à ${topic}"}
  ],
  "sources_consulted": ["Base locale", "PubMed", "OpenFDA"],
  "research_summary": "Expansion depuis ${topic}: X nouveaux concepts découverts"
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

        const { topic, max_nodes = 50, include_pubmed = true, include_fda = true } = await req.json();

        if (!topic) {
            return new Response(
                JSON.stringify({ error: "Topic is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[DEEP-RESEARCH] Starting research for: ${topic}`);

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

        // Step 3: Claude synthesis
        console.log('[DEEP-RESEARCH] Synthesizing with Claude...');
        const result = await synthesizeWithClaude(topic, localData, pubmedArticles, fdaEvents);
        console.log(`[DEEP-RESEARCH] Generated ${result.nodes.length} nodes, ${result.edges.length} edges`);

        // Step 4: Limit nodes if needed
        if (result.nodes.length > max_nodes) {
            result.nodes = result.nodes.slice(0, max_nodes);
            // Filter edges to only include nodes that exist
            const nodeIds = new Set(result.nodes.map(n => n.id));
            result.edges = result.edges.filter(e => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));
        }

        const computeTime = Date.now() - startTime;

        return new Response(
            JSON.stringify({
                success: true,
                topic,
                ...result,
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
