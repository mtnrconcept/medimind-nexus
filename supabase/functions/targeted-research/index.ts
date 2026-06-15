import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamAI } from "../_shared/ai-client.ts";

/**
 * TARGETED RESEARCH - Recherche Ciblée
 * 
 * Mode: Questions précises sur un sujet médical spécifique
 * - Interactions médicamenteuses spécifiques
 * - Dosages pour populations particulières
 * - Contre-indications spécifiques
 * - Mécanismes d'action détaillés
 * 
 * Configuration: temperature=0.3, max_tokens=8000
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
interface StreamEvent {
    type: 'step_update' | 'text' | 'discovery' | 'sources' | 'warning' | 'done';
    step?: { id: number; status: string; details?: string; source?: string };
    content?: string;
    discovery?: any;
    warning?: string;
    sources?: any[];
}

// Evidence levels from config
const EVIDENCE_LEVELS = {
    'guideline': { rank: 1, label: '📋 Guideline/Consensus', confidence: 0.95 },
    'meta_analysis': { rank: 2, label: '📊 Méta-analyse', confidence: 0.90 },
    'rct': { rank: 3, label: '🔬 Essai randomisé (RCT)', confidence: 0.85 },
    'cohort': { rank: 4, label: '👥 Cohorte prospective', confidence: 0.70 },
    'case_control': { rank: 5, label: '📈 Cas-témoins', confidence: 0.60 },
    'case_series': { rank: 6, label: '📝 Série de cas', confidence: 0.45 },
    'animal': { rank: 7, label: '🐭 Études animales', confidence: 0.35 },
    'in_vitro': { rank: 8, label: '🧫 In vitro', confidence: 0.25 },
    'hypothesis': { rank: 9, label: '💡 Hypothèse mécanistique', confidence: 0.15 },
    'unsourced': { rank: 10, label: '⚠️ NON SOURCÉ', confidence: 0.0 }
};

// TARGETED MODE SYSTEM PROMPT
const SYSTEM_PROMPT = `Tu es MEDIMIND, un système d'IA médicale expert spécialisé en mode RECHERCHE CIBLÉE.

# MISSION
Répondre de manière précise et sourcée à des questions médicales spécifiques.

# RÈGLES ABSOLUES

## 1. SOURÇAGE OBLIGATOIRE
- Format: [PMID:12345678] ou [DOI:10.xxx/xxx] ou [NCT########] ou [Guideline: KDIGO 2024]
- JAMAIS de chiffre sans source

## 2. NIVEAUX D'ÉVIDENCE (obligatoire pour chaque affirmation)
- guideline: Recommandations sociétés savantes
- meta_analysis: Méta-analyses publiées
- rct: Essais randomisés contrôlés
- cohort: Études de cohorte prospectives
- case_series: Séries de cas
- animal: Modèles animaux
- in_vitro: Études cellulaires
- hypothesis: Raisonnement mécanistique SANS preuve

## 3. VALIDITÉ CLINIQUE
- ✅ VALIDÉ: preuves RCT/guideline
- ⚠️ TRANSLATIONNEL: données précliniques, pas de preuve clinique
- ❌ SPÉCULATIF: chaîne mécanistique sans preuve

## 4. DRAPEAUX ROUGES À SIGNALER
- Dosages différents de la littérature
- Affirmations contraires aux guidelines
- Risques de sécurité
- Interactions critiques

## 5. FORMAT JSON OBLIGATOIRE
{
  "answer": {
    "summary": "Réponse concise en 2-3 phrases",
    "detailed_response": "Réponse détaillée structurée",
    "key_points": ["Point clé 1", "Point clé 2"],
    "clinical_implications": "Implications pratiques"
  },
  "evidence": [{
    "claim": "Affirmation précise",
    "evidence_level": "rct|cohort|animal|hypothesis",
    "sources": [{"id": "PMID:xxx", "finding": "Résumé"}],
    "clinical_validity": "validated|translational|speculative",
    "confidence_score": 0.85
  }],
  "safety_alerts": [{
    "type": "interaction|contraindication|dosage|population",
    "description": "Description du risque",
    "severity": "critical|major|moderate|minor",
    "management": "Action recommandée"
  }],
  "limitations": ["Ce que l'on ne sait pas"],
  "sources_cited": 12
}

## 6. HONNÊTETÉ
Si la preuve n'existe pas: "Aucune preuve clinique identifiée. Niveau maximal: [type]. Études nécessaires."

Réponds TOUJOURS en français.`;

// PubMed search function
async function queryPubMed(query: string, apiKey?: string, maxResults: number = 20): Promise<any[]> {
    try {
        const searchQuery = encodeURIComponent(query);
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchQuery}&retmax=${maxResults}&retmode=json&sort=relevance`;
        if (apiKey) searchUrl += `&api_key=${apiKey}`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return [];

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];
        if (ids.length === 0) return [];

        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (apiKey) fetchUrl += `&api_key=${apiKey}`;

        const fetchRes = await fetch(fetchUrl);
        const xmlText = await fetchRes.text();

        const articles: any[] = [];
        const chunks = xmlText.split('</PubmedArticle>');

        for (const chunk of chunks) {
            const pmid = chunk.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1];
            const title = chunk.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1]?.replace(/<[^>]*>/g, '');
            const year = chunk.match(/<Year>(.*?)<\/Year>/)?.[1];
            const journal = chunk.match(/<Title>(.*?)<\/Title>/)?.[1];
            const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ").replace(/<[^>]*>/g, '').substring(0, 500);

            // Detect study type
            let studyType = 'unknown';
            const pubTypes = chunk.match(/<PublicationType[^>]*>(.*?)<\/PublicationType>/g) || [];
            for (const pt of pubTypes) {
                const type = pt.replace(/<[^>]*>/g, '').toLowerCase();
                if (type.includes('guideline')) { studyType = 'guideline'; break; }
                if (type.includes('meta-analysis')) { studyType = 'meta_analysis'; break; }
                if (type.includes('systematic review')) { studyType = 'meta_analysis'; break; }
                if (type.includes('randomized')) { studyType = 'rct'; break; }
                if (type.includes('clinical trial')) { studyType = 'rct'; break; }
                if (type.includes('cohort')) studyType = 'cohort';
                if (type.includes('case')) studyType = 'case_series';
            }

            if (pmid && title) {
                articles.push({
                    pmid,
                    title,
                    year: parseInt(year || '0'),
                    journal,
                    abstract,
                    studyType,
                    citation: `PMID:${pmid}`
                });
            }
        }

        // Sort by evidence level and recency
        articles.sort((a, b) => {
            const levelOrder = ['guideline', 'meta_analysis', 'rct', 'cohort', 'case_series', 'unknown'];
            const aLevel = levelOrder.indexOf(a.studyType);
            const bLevel = levelOrder.indexOf(b.studyType);
            if (aLevel !== bLevel) return aLevel - bLevel;
            return (b.year || 0) - (a.year || 0);
        });

        return articles;
    } catch (e) {
        console.error("PubMed error:", e);
        return [];
    }
}

// Query local database
async function queryLocalDatabase(supabase: any, query: string, targetType: string): Promise<any> {
    const results: any = {
        nodes: [],
        edges: [],
        medications: [],
        interactions: [],
        pathologies: []
    };

    try {
        // Search in cde_nodes
        const { data: nodes } = await supabase
            .from('cde_nodes')
            .select('id, name, node_type, properties')
            .or(`name.ilike.%${query}%,properties->description.ilike.%${query}%`)
            .limit(50);
        results.nodes = nodes || [];

        // Search medications
        const { data: medications } = await supabase
            .from('medications')
            .select('id, name, substance, therapeutic_class, mechanism, indications')
            .or(`name.ilike.%${query}%,substance.ilike.%${query}%`)
            .limit(30);
        results.medications = medications || [];

        // Search drug interactions
        const { data: interactions } = await supabase
            .from('drug_interactions')
            .select('*')
            .or(`medication_name.ilike.%${query}%,interacting_drug.ilike.%${query}%`)
            .limit(30);
        results.interactions = interactions || [];

        // Search pathologies if relevant
        if (targetType === 'pathology' || !targetType) {
            const { data: pathologies } = await supabase
                .from('pathologies')
                .select('id, name, icd_code, description, severity')
                .ilike('name', `%${query}%`)
                .limit(20);
            results.pathologies = pathologies || [];
        }

        // Get related edges
        const nodeIds = results.nodes.map((n: any) => n.id);
        if (nodeIds.length > 0) {
            const { data: edges } = await supabase
                .from('cde_edges')
                .select('*, source:cde_nodes!source_node_id(name, node_type), target:cde_nodes!target_node_id(name, node_type)')
                .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`)
                .limit(100);
            results.edges = edges || [];
        }

    } catch (e) {
        console.error("Local DB error:", e);
    }

    return results;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { query, targetType, context } = await req.json();

        if (!query) {
            return new Response(
                JSON.stringify({ error: "query is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        // API keys for AI are handled by callAI/streamAI
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log(`[TARGETED-RESEARCH] Query: ${query}`);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event: StreamEvent) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                };

                try {
                    // Step 1: Local Database
                    sendEvent({ type: 'step_update', step: { id: 1, status: 'running', details: '📁 Recherche base locale...', source: 'Supabase' } });

                    const localData = await queryLocalDatabase(supabase, query, targetType);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 1, status: 'completed',
                            details: `✅ ${localData.nodes.length} nœuds, ${localData.interactions.length} interactions`,
                            source: 'Local DB'
                        }
                    });

                    // Step 2: PubMed Search
                    sendEvent({ type: 'step_update', step: { id: 2, status: 'running', details: '🔬 Recherche PubMed ciblée...', source: 'NCBI' } });

                    const pubmedArticles = await queryPubMed(query, ncbiApiKey, 20);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 2, status: 'completed',
                            details: `✅ ${pubmedArticles.length} articles trouvés`,
                            source: 'PubMed'
                        }
                    });

                    // Step 3: OpenAI Analysis
                    sendEvent({ type: 'step_update', step: { id: 3, status: 'running', details: '🧠 Analyse ciblée OpenAI...', source: 'OpenAI' } });

                    const evidenceContext = `
# QUESTION DE RECHERCHE CIBLÉE
${query}

# CONTEXTE ADDITIONNEL
${context || 'Aucun contexte spécifique fourni'}

# DONNÉES LOCALES TROUVÉES

## Nœuds Knowledge Graph (${localData.nodes.length})
${localData.nodes.slice(0, 20).map((n: any) => `- ${n.name} (${n.node_type})`).join('\n')}

## Médicaments (${localData.medications.length})
${localData.medications.slice(0, 15).map((m: any) => `- ${m.name}: ${m.mechanism || 'N/A'}`).join('\n')}

## Interactions connues (${localData.interactions.length})
${localData.interactions.slice(0, 15).map((i: any) => `- ${i.medication_name} ↔ ${i.interacting_drug}: ${i.severity} - ${i.mechanism || ''}`).join('\n')}

## Relations dans le graphe (${localData.edges.length})
${localData.edges.slice(0, 20).map((e: any) => `- ${e.source?.name || 'N/A'} --[${e.relationship_type}]--> ${e.target?.name || 'N/A'}`).join('\n')}

# LITTÉRATURE PUBMED (${pubmedArticles.length} articles)
${pubmedArticles.map((a: any) => `- [PMID:${a.pmid}] "${a.title}" (${a.year}) - Type: ${a.studyType}
  Résumé: ${a.abstract?.substring(0, 200)}...`).join('\n\n')}

---
RAPPEL: Réponds en JSON valide. Cite chaque source (PMID). Niveau d'évidence obligatoire pour chaque claim.
`;

                    const aiResponse = await streamAI(
                        SYSTEM_PROMPT,
                        evidenceContext,
                        () => {
                            // Keeping original behavior of waiting for full response
                        },
                        {
                            model: "gpt-5.5",
                            maxTokens: 8000,
                            temperature: 0.3
                        }
                    );

                    const textContent = aiResponse.text;

                    sendEvent({ type: 'step_update', step: { id: 3, status: 'completed', details: '✅ Analyse terminée', source: 'OpenAI' } });

                    // Send analysis
                    sendEvent({ type: 'text', content: textContent });

                    // Extract and emit discoveries
                    try {
                        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);
                            if (parsed.evidence) {
                                for (const e of parsed.evidence) {
                                    sendEvent({ type: 'discovery', discovery: e });
                                }
                            }
                            if (parsed.safety_alerts?.length > 0) {
                                sendEvent({
                                    type: 'warning',
                                    warning: `⚠️ ${parsed.safety_alerts.length} alerte(s) de sécurité identifiée(s)`
                                });
                            }
                        }
                    } catch { }

                    sendEvent({
                        type: 'sources', sources: [
                            { type: 'Local DB', count: localData.nodes.length + localData.medications.length },
                            { type: 'PubMed', count: pubmedArticles.length }
                        ]
                    });

                    sendEvent({ type: 'done' });

                } catch (err) {
                    console.error("Targeted research error:", err);
                    sendEvent({ type: 'step_update', step: { id: 1, status: 'error', details: String(err) } });
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
        });

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ error: "Targeted research failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
