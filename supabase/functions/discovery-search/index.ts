import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DISCOVERY SEARCH ENGINE v4.0 - EVIDENCE-BASED
 * 
 * CRITICAL REQUIREMENTS:
 * - Every claim MUST have a source (PMID/DOI/NCT/Guideline)
 * - Evidence levels MUST be tagged
 * - No unsourced extrapolation
 * - Web search for additional evidence
 * 
 * Uses Claude Opus 4 for maximum reasoning capability
 */

interface StreamEvent {
    type: 'step_update' | 'text' | 'discovery' | 'sources' | 'warning' | 'done';
    step?: { id: number; status: string; details?: string; data?: any; source?: string };
    content?: string;
    discovery?: any;
    warning?: string;
}

// Evidence levels taxonomy (GRADE-like)
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

// STRICT SYSTEM PROMPT - Evidence-based only
const SYSTEM_PROMPT = `Tu es un pharmacologue clinicien expert. Tu analyses les preuves disponibles et génères des recommandations UNIQUEMENT basées sur des sources vérifiées.

# RÈGLES ABSOLUES (VIOLATION = REJET)

## 1. TOUTE affirmation DOIT avoir une source primaire
- Format obligatoire: [PMID:12345678] ou [DOI:10.xxx/xxx] ou [NCT########] ou [Guideline: KDIGO 2024]
- JAMAIS de chiffre sans source (ex: "60% de réduction" → REFUSÉ si pas de citation)
- Les "rosettes-E 33,5% → 69,3%" sans PMID = REFUSÉ

## 2. Tagger CHAQUE preuve avec son niveau (GRADE-like)
- guideline: Recommandations sociétés savantes (KDIGO, EULAR, etc.)
- meta_analysis: Méta-analyses publiées
- rct: Essais randomisés contrôlés
- cohort: Études de cohorte prospectives
- case_control: Études cas-témoins
- case_series: Séries de cas (<10 patients)
- animal: Modèles animaux (préciser espèce)
- in_vitro: Études cellulaires
- hypothesis: Raisonnement mécanistique SANS preuve clinique (CLAIREMENT marqué)

## 3. Distinguer clairement
- ✅ VALIDÉ CLINIQUEMENT: preuves RCT/guideline
- ⚠️ TRANSLATIONNEL: données précliniques cohérentes mais pas de preuve clinique
- ❌ SPÉCULATIF: chaîne mécanistique sans aucune preuve

## 4. Signaler les DRAPEAUX ROUGES
- Dosages différents de la littérature
- Anciens marqueurs non standardisés
- Affirmations contraires aux guidelines
- Risques de sécurité (ex: lévamisole = surveillance hémato)

## 5. FORMAT JSON OBLIGATOIRE
{
  "discoveries": [{
    "claim": "Affirmation précise",
    "evidence_level": "rct|cohort|animal|hypothesis",
    "sources": [
      {"id": "PMID:34567890", "type": "rct", "finding": "Résumé du finding", "year": 2023},
      {"id": "KDIGO 2021", "type": "guideline", "finding": "Recommandation exacte"}
    ],
    "clinical_validity": "validated|translational|speculative",
    "confidence_score": 0.85,
    "safety_flags": ["Surveillance hémato requise"],
    "contraindications": [],
    "dosage_note": "Littérature: 2-2.5 mg/kg un jour sur deux (PAS 2x/semaine)",
    "actionable": true|false,
    "requires_specialist": true|false,
    "alternative_sources_searched": ["web search terms used"]
  }],
  "unsourced_claims_rejected": ["Liste des affirmations rejetées car non sourcées"],
  "web_search_performed": true,
  "total_pmid_cited": 12
}

## 6. Si la preuve n'existe pas, le DIRE
Ne pas inventer. Répondre: "Aucune preuve clinique identifiée pour X. Niveau de preuve maximal: [in_vitro/animal/hypothesis]"

## 7. Priorités de recherche
1. Guidelines récentes (KDIGO, NICE, HAS, EULAR)
2. Méta-analyses Cochrane
3. RCTs phase III
4. Études observationnelles larges
5. Préclinique SEULEMENT si rien d'autre`;

// ============================================
// API CONNECTORS (unchanged from v3)
// ============================================

async function queryPubMed(query: string, apiKey?: string, retmax: number = 25): Promise<any[]> {
    try {
        const searchQuery = encodeURIComponent(query);
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchQuery}&retmax=${retmax}&retmode=json&sort=relevance`;
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
            const abstract = abstractMatches.map(m => m[1]).join(" ").replace(/<[^>]*>/g, '').substring(0, 600);

            // Detect study type from publication types
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

            // Extract MeSH terms
            const meshMatches = [...chunk.matchAll(/<DescriptorName[^>]*>(.*?)<\/DescriptorName>/g)];
            const meshTerms = meshMatches.map(m => m[1].replace(/<[^>]*>/g, '')).slice(0, 8);

            if (pmid && title) {
                articles.push({
                    pmid,
                    title,
                    year: parseInt(year || '0'),
                    journal,
                    abstract,
                    studyType,
                    meshTerms,
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

async function queryClinicalTrials(condition: string, intervention?: string): Promise<any[]> {
    try {
        let url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(condition)}`;
        if (intervention) url += `&query.intr=${encodeURIComponent(intervention)}`;
        url += `&pageSize=20&format=json&filter.overallStatus=COMPLETED,ACTIVE_NOT_RECRUITING`;

        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        return (data.studies || []).map((s: any) => {
            const p = s.protocolSection;
            return {
                nct_id: p?.identificationModule?.nctId,
                title: p?.identificationModule?.briefTitle,
                status: p?.statusModule?.overallStatus,
                phase: p?.designModule?.phases?.join(', '),
                enrollment: p?.designModule?.enrollmentInfo?.count,
                has_results: s.hasResults,
                citation: `NCT:${p?.identificationModule?.nctId}`
            };
        });
    } catch (e) {
        console.error("ClinicalTrials error:", e);
        return [];
    }
}

async function searchGuidelines(topic: string): Promise<any[]> {
    // Search for guidelines specifically
    const guidelineQuery = `${topic} AND (guideline[pt] OR practice guideline[pt] OR consensus[ti])`;
    return queryPubMed(guidelineQuery, undefined, 10);
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { targetName, targetType, customPrompt, condition } = await req.json();

        if (!targetName) {
            return new Response(
                JSON.stringify({ error: "targetName is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        const supabase = createClient(supabaseUrl, supabaseKey);

        if (!anthropicApiKey) {
            return new Response(
                JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event: StreamEvent) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                };

                try {
                    const allData: Record<string, any> = {};
                    const searchTerm = targetName.toLowerCase();
                    const conditionTerm = condition || targetType || '';

                    // ============================================
                    // PHASE 1: LOCAL DATABASE
                    // ============================================

                    sendEvent({ type: 'step_update', step: { id: 1, status: 'running', details: '📁 Base locale...', source: 'Supabase' } });

                    const { data: interactions } = await supabase
                        .from('drug_interactions')
                        .select('*')
                        .or(`medication_name.ilike.%${searchTerm}%,interacting_drug.ilike.%${searchTerm}%`)
                        .limit(30);
                    allData.local_interactions = interactions || [];

                    const { data: medications } = await supabase
                        .from('medications')
                        .select('*')
                        .ilike('name', `%${searchTerm}%`)
                        .limit(10);
                    allData.medications = medications || [];

                    sendEvent({
                        type: 'step_update', step: {
                            id: 1, status: 'completed',
                            details: `✅ ${allData.local_interactions.length} interactions, ${allData.medications.length} médicaments`,
                            source: 'Local DB'
                        }
                    });

                    // ============================================
                    // PHASE 2: GUIDELINES SEARCH (Priority)
                    // ============================================

                    sendEvent({ type: 'step_update', step: { id: 2, status: 'running', details: '📋 Recherche Guidelines...', source: 'PubMed' } });

                    const guidelineQuery = conditionTerm
                        ? `${targetName} ${conditionTerm} guideline`
                        : `${targetName} clinical guideline`;
                    allData.guidelines = await searchGuidelines(guidelineQuery);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 2, status: 'completed',
                            details: `✅ ${allData.guidelines.length} guidelines trouvées`,
                            data: allData.guidelines.slice(0, 3),
                            source: 'PubMed Guidelines'
                        }
                    });

                    // ============================================
                    // PHASE 3: META-ANALYSES & RCTs
                    // ============================================

                    sendEvent({ type: 'step_update', step: { id: 3, status: 'running', details: '📊 Méta-analyses & RCTs...', source: 'PubMed' } });

                    const rctQuery = conditionTerm
                        ? `${targetName} ${conditionTerm} AND (randomized controlled trial[pt] OR meta-analysis[pt])`
                        : `${targetName} AND (randomized controlled trial[pt] OR meta-analysis[pt])`;
                    allData.rcts = await queryPubMed(rctQuery, ncbiApiKey, 20);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 3, status: 'completed',
                            details: `✅ ${allData.rcts.length} RCTs/méta-analyses`,
                            data: allData.rcts.slice(0, 3),
                            source: 'PubMed RCT/MA'
                        }
                    });

                    // ============================================
                    // PHASE 4: CLINICAL TRIALS
                    // ============================================

                    sendEvent({ type: 'step_update', step: { id: 4, status: 'running', details: '🔬 ClinicalTrials.gov...', source: 'ClinicalTrials API' } });

                    allData.trials = await queryClinicalTrials(conditionTerm || targetName, targetName);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 4, status: 'completed',
                            details: `✅ ${allData.trials.length} essais cliniques`,
                            data: allData.trials.slice(0, 3),
                            source: 'ClinicalTrials.gov'
                        }
                    });

                    // ============================================
                    // PHASE 5: SAFETY & PHARMACOVIGILANCE
                    // ============================================

                    sendEvent({ type: 'step_update', step: { id: 5, status: 'running', details: '⚠️ Données de sécurité...', source: 'PubMed + FDA' } });

                    const safetyQuery = `${targetName} AND (adverse effects[mh] OR drug toxicity[mh] OR safety[ti])`;
                    allData.safety = await queryPubMed(safetyQuery, ncbiApiKey, 10);

                    // OpenFDA adverse events
                    try {
                        const fdaUrl = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(targetName)}"&count=patient.reaction.reactionmeddrapt.exact&limit=20`;
                        const fdaRes = await fetch(fdaUrl);
                        if (fdaRes.ok) {
                            const fdaData = await fdaRes.json();
                            allData.fda_events = (fdaData.results || []).map((r: any) => ({
                                reaction: r.term,
                                count: r.count
                            }));
                        }
                    } catch { allData.fda_events = []; }

                    sendEvent({
                        type: 'step_update', step: {
                            id: 5, status: 'completed',
                            details: `✅ ${allData.safety.length} articles sécurité, ${allData.fda_events?.length || 0} signaux FDA`,
                            source: 'Safety data'
                        }
                    });

                    // ============================================
                    // PHASE 6: MECHANISM / PRECLINICAL (Lower priority)
                    // ============================================

                    sendEvent({ type: 'step_update', step: { id: 6, status: 'running', details: '🧬 Recherche mécanistique...', source: 'PubMed' } });

                    const mechQuery = `${targetName} AND (mechanism[ti] OR pathway[ti] OR pharmacology[mh])`;
                    allData.mechanisms = await queryPubMed(mechQuery, ncbiApiKey, 10);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 6, status: 'completed',
                            details: `✅ ${allData.mechanisms.length} articles mécanismes`,
                            source: 'PubMed Mechanisms'
                        }
                    });

                    // ============================================
                    // PHASE 7: CLAUDE OPUS ANALYSIS
                    // ============================================

                    sendEvent({ type: 'step_update', step: { id: 7, status: 'running', details: '🧠 Analyse Claude Opus (evidence-based)...', source: 'Anthropic' } });

                    // Build evidence context with citations
                    const evidenceContext = `
# DONNÉES COLLECTÉES - ANALYSE EVIDENCE-BASED

## Sujet: ${targetName} ${conditionTerm ? `pour ${conditionTerm}` : ''}

## 1. GUIDELINES IDENTIFIÉES (${allData.guidelines.length})
${allData.guidelines.map((g: any) => `- [PMID:${g.pmid}] "${g.title}" (${g.year}) - ${g.journal} - Type: ${g.studyType}`).join('\n')}

## 2. RCTs & MÉTA-ANALYSES (${allData.rcts.length})
${allData.rcts.map((r: any) => `- [PMID:${r.pmid}] "${r.title}" (${r.year}) - Type: ${r.studyType}\n  Résumé: ${r.abstract?.substring(0, 200)}...`).join('\n\n')}

## 3. ESSAIS CLINIQUES (${allData.trials.length})
${allData.trials.map((t: any) => `- [${t.citation}] "${t.title}" - Phase: ${t.phase} - Statut: ${t.status} - ${t.enrollment} patients`).join('\n')}

## 4. DONNÉES DE SÉCURITÉ (${allData.safety.length})
${allData.safety.map((s: any) => `- [PMID:${s.pmid}] "${s.title}" (${s.year})`).join('\n')}

## 5. SIGNAUX FDA (FAERS)
${allData.fda_events?.slice(0, 15).map((e: any) => `- ${e.reaction}: ${e.count} cas`).join('\n') || 'Aucun signal'}

## 6. MÉCANISMES (préclinique - LOWER EVIDENCE)
${allData.mechanisms.map((m: any) => `- [PMID:${m.pmid}] "${m.title}" (${m.year}) - Type: ${m.studyType}`).join('\n')}

## 7. INTERACTIONS LOCALES (${allData.local_interactions.length})
${allData.local_interactions.slice(0, 10).map((i: any) => `- ${i.medication_name} ↔ ${i.interacting_drug}: ${i.severity} - Source: ${i.source}`).join('\n')}

---

# CONSIGNE UTILISATEUR
${customPrompt || `Analyse complète de ${targetName} ${conditionTerm ? `dans le contexte de ${conditionTerm}` : ''}`}

---

RAPPEL: Tu DOIS citer chaque source (PMID/NCT). Aucune affirmation sans preuve. Niveau d'évidence obligatoire.
`;

                    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-api-key": anthropicApiKey,
                            "anthropic-version": "2023-06-01"
                        },
                        body: JSON.stringify({
                            model: "claude-opus-4-5-20250514", // Claude Opus 4.5 - Most powerful
                            max_tokens: 12000,
                            temperature: 0.1, // Very low for factual accuracy
                            system: SYSTEM_PROMPT,
                            messages: [{ role: "user", content: evidenceContext }]
                        })
                    });

                    if (!claudeResponse.ok) {
                        const err = await claudeResponse.text();
                        console.error("Claude error:", err);
                        throw new Error(`Claude: ${claudeResponse.status}`);
                    }

                    const claudeData = await claudeResponse.json();
                    let textContent = "";
                    for (const block of claudeData.content || []) {
                        if (block.type === "text") textContent += block.text;
                    }

                    sendEvent({ type: 'step_update', step: { id: 7, status: 'completed', details: '✅ Analyse terminée', source: 'Claude Opus' } });

                    // Send analysis
                    sendEvent({ type: 'text', content: textContent });

                    // Extract discoveries
                    const discoveries: any[] = [];
                    try {
                        const jsonMatch = textContent.match(/\{[\s\S]*"discoveries"[\s\S]*\}/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);
                            if (parsed.discoveries) discoveries.push(...parsed.discoveries);

                            // Emit warnings for unsourced claims
                            if (parsed.unsourced_claims_rejected?.length > 0) {
                                sendEvent({
                                    type: 'warning',
                                    warning: `⚠️ ${parsed.unsourced_claims_rejected.length} affirmations rejetées (non sourcées)`
                                });
                            }
                        }
                    } catch { }

                    for (const d of discoveries) {
                        sendEvent({ type: 'discovery', discovery: d });
                    }

                    // Summary with evidence stats
                    const evidenceStats = {
                        guidelines: allData.guidelines.length,
                        rcts_meta: allData.rcts.filter((r: any) => r.studyType === 'rct' || r.studyType === 'meta_analysis').length,
                        trials: allData.trials.length,
                        safety_articles: allData.safety.length,
                        fda_signals: allData.fda_events?.length || 0,
                        discoveries: discoveries.length,
                        high_evidence: discoveries.filter((d: any) => ['guideline', 'meta_analysis', 'rct'].includes(d.evidence_level)).length,
                        speculative: discoveries.filter((d: any) => d.clinical_validity === 'speculative').length
                    };

                    sendEvent({
                        type: 'sources', sources: [
                            { type: 'Guidelines', count: evidenceStats.guidelines },
                            { type: 'RCTs/MA', count: evidenceStats.rcts_meta },
                            { type: 'Trials', count: evidenceStats.trials },
                            { type: 'Safety', count: evidenceStats.safety_articles }
                        ]
                    });

                    sendEvent({ type: 'done' });

                } catch (err) {
                    console.error("Discovery error:", err);
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
            JSON.stringify({ error: "Discovery search failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
