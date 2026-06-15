import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";
import { getOpenFDAComprehensiveData } from "./openfda-api.ts";
import { getDrugBankComprehensiveData } from "./drugbank-api.ts";

/**
 * SYSTEMATIC RESEARCH - Recherche Systématique
 * 
 * Mode: Analyse méthodique complète d'un sujet médical
 * - Revue complète d'une pathologie
 * - Évaluation d'un nouveau traitement
 * - Analyse comparative de thérapies
 * - État de l'art sur un biomarqueur
 * 
 * Configuration: temperature=0.2, max_tokens=16000
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
interface StreamEvent {
    type: 'step_update' | 'text' | 'hypothesis' | 'evidence_synthesis' | 'gap_analysis' | 'sources' | 'done';
    step?: { id: number; status: string; details?: string; source?: string };
    content?: string;
    hypothesis?: any;
    evidence_synthesis?: any;
    gap_analysis?: any;
    sources?: any[];
}

// SYSTEMATIC MODE SYSTEM PROMPT (~4000 tokens)
const SYSTEM_PROMPT = `Tu es MEDIMIND en mode RECHERCHE SYSTÉMATIQUE - analyse méthodique exhaustive.

# MISSION
Produire une revue systématique d'un sujet médical avec méthodologie GRADE et identification des gaps de connaissance.

# MÉTHODOLOGIE OBLIGATOIRE

## 1. FRAMEWORK PRISMA-LIKE
- Définir la question PICO (Population, Intervention, Comparator, Outcome)
- Critères d'inclusion/exclusion implicites
- Synthèse des preuves par niveau

## 2. ÉVALUATION GRADE DE CHAQUE PREUVE
| Niveau | Confiance | Downgrade si... |
|--------|-----------|-----------------|
| High | ⬆️⬆️⬆️⬆️ | - |
| Moderate | ⬆️⬆️⬆️ | Risk of bias, Inconsistency |
| Low | ⬆️⬆️ | Indirectness, Imprecision |
| Very Low | ⬆️ | Publication bias |

## 3. ANALYSE MULTI-DIMENSIONNELLE (5D)
1. **MOLÉCULAIRE**: Cibles, voies de signalisation, interactions
2. **CELLULAIRE**: Types cellulaires, réponses, plasticité
3. **TISSULAIRE**: Distribution, barrières, métabolisme
4. **SYSTÉMIQUE**: Effets multi-organes, microbiome, rythmes
5. **POPULATIONNELLE**: Pharmacogénomique, comorbidités, disparités

## 4. SOURÇAGE OBLIGATOIRE
- Format: [PMID:xxx] [DOI:xxx] [NCT:xxx] [Guideline: XXX 2024]
- Minimum 20 sources pour analyse systématique
- Priorité: Guidelines > Méta-analyses > RCTs > Cohortes

## 5. FORMAT JSON OBLIGATOIRE

{
  "systematic_review": {
    "title": "Titre de la revue",
    "pico_question": {
      "population": "Description",
      "intervention": "Description",
      "comparator": "Description",
      "outcomes": ["Outcome 1", "Outcome 2"]
    },
    "search_summary": {
      "databases": ["PubMed", "Local KG"],
      "total_records": 150,
      "included_studies": 45
    }
  },
  
  "evidence_by_dimension": {
    "molecular": {
      "key_findings": ["Finding 1 [PMID:xxx]"],
      "mechanisms": ["Mechanism 1"],
      "targets": ["Target 1"]
    },
    "cellular": {...},
    "tissue": {...},
    "systemic": {...},
    "population": {...}
  },
  
  "grade_synthesis": [{
    "outcome": "Primary outcome",
    "studies_n": 12,
    "patients_n": 5420,
    "effect_estimate": "RR 0.75 [0.65-0.87]",
    "certainty": "Moderate",
    "downgrade_reasons": ["Risk of bias"],
    "recommendation": "Conditional recommendation"
  }],
  
  "hypotheses_generated": [{
    "id": "H1",
    "title": "Titre",
    "statement": "Énoncé",
    "mechanism": "Explication mécanistique",
    "evidence_base": [{"pmid": "xxx", "finding": "Résumé"}],
    "novelty_score": 75,
    "plausibility_score": 68,
    "validation_required": ["Étude 1", "Étude 2"],
    "clinical_potential": "High|Medium|Low"
  }],
  
  "knowledge_gaps": [{
    "domain": "Domaine",
    "gap_description": "Ce qui manque",
    "importance": "High|Medium|Low",
    "research_priority": 1,
    "suggested_study_design": "RCT|Cohorte|etc."
  }],
  
  "clinical_implications": {
    "current_practice": "État actuel",
    "recommended_changes": ["Changement 1"],
    "contraindications_identified": ["CI 1"],
    "monitoring_required": ["Paramètre 1"],
    "special_populations": {
      "pediatric": "Considérations",
      "geriatric": "Considérations",
      "pregnancy": "Considérations",
      "renal_impaired": "Considérations"
    }
  },
  
  "limitations": ["Limitation 1", "Limitation 2"],
  "conflicts_of_interest": "Déclaration",
  "total_sources_cited": 45
}

## 6. DRAPEAUX ROUGES
Signaler obligatoirement:
- 🚨 Contradictions entre études
- 🚨 Données de sécurité insuffisantes
- 🚨 Populations sous-représentées
- 🚨 Biais de publication suspectés
- 🚨 Guidelines obsolètes (>5 ans)

## 7. HONNÊTETÉ SCIENTIFIQUE
- Distinguer fait établi vs hypothèse
- Quantifier l'incertitude
- Reconnaître les limites méthodologiques

## 8. DÉTECTION DE NOUVEAUTÉ (CRITIQUE)
Pour chaque hypothèse générée, OBLIGATOIREMENT:
- **novelty_score**: 0-100 (0=bien documenté, 100=jamais rapporté)
  - Score \u003e 70 = DÉCOUVERTE POTENTIELLE (mécanisme inconnu, lien non documenté)
  - Score 40-70 = Hypothèse plausible nécessitant validation
  - Score \u003c 40 = Confirmé par littérature existante
- Si novelty_score \u003e 70, marquer "discovery_type" comme "découverte" au lieu de "aucun"
- Justifier le score avec références précises (présence/absence dans littérature)

IMPORTANT: Une vraie découverte mérite une analyse EXHAUSTIVE. N'hésite pas à utiliser tout l'espace disponible pour détailler mécanismes, implications, et validation requise.

Réponds TOUJOURS en français avec JSON structuré.`;

// PubMed comprehensive search
async function comprehensivePubMedSearch(
    mainQuery: string,
    apiKey?: string
): Promise<{ guidelines: any[], rcts: any[], reviews: any[], observational: any[], preclinical: any[] }> {

    const results = {
        guidelines: [] as any[],
        rcts: [] as any[],
        reviews: [] as any[],
        observational: [] as any[],
        preclinical: [] as any[]
    };

    const searchPubMed = async (query: string, maxResults: number = 25): Promise<any[]> => {
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
                const abstract = abstractMatches.map(m => m[1]).join(" ").replace(/<[^>]*>/g, '').substring(0, 600);

                if (pmid && title) {
                    articles.push({ pmid, title, year: parseInt(year || '0'), journal, abstract });
                }
            }
            return articles;
        } catch (e) {
            console.error("PubMed search error:", e);
            return [];
        }
    };

    // Parallel searches for different study types
    const [guidelines, rcts, reviews, observational] = await Promise.all([
        searchPubMed(`${mainQuery} AND (guideline[pt] OR practice guideline[pt] OR consensus[ti])`, 15),
        searchPubMed(`${mainQuery} AND (randomized controlled trial[pt] OR clinical trial phase III[pt])`, 25),
        searchPubMed(`${mainQuery} AND (meta-analysis[pt] OR systematic review[pt])`, 20),
        searchPubMed(`${mainQuery} AND (cohort study[mh] OR case-control studies[mh])`, 15)
    ]);

    results.guidelines = guidelines;
    results.rcts = rcts;
    results.reviews = reviews;
    results.observational = observational;

    return results;
}

// Query ClinicalTrials.gov
async function queryClinicalTrials(searchTerm: string): Promise<any[]> {
    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(searchTerm)}&pageSize=30&format=json&filter.overallStatus=COMPLETED,ACTIVE_NOT_RECRUITING,RECRUITING`;

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
                conditions: p?.conditionsModule?.conditions?.join(', '),
                interventions: p?.armsInterventionsModule?.interventions?.map((i: any) => i.name).join(', ')
            };
        });
    } catch (e) {
        console.error("ClinicalTrials error:", e);
        return [];
    }
}

// Comprehensive local database query
async function queryLocalDatabaseComprehensive(supabase: any, topic: string): Promise<any> {
    const results: any = {
        kg_nodes: [],
        kg_edges: [],
        pathologies: [],
        medications: [],
        substances: [],
        interactions: [],
        treatments: [],
        side_effects: []
    };

    try {
        // Knowledge Graph nodes
        const { data: nodes } = await supabase
            .from('cde_nodes')
            .select('id, name, node_type, properties')
            .or(`name.ilike.%${topic}%,properties->description.ilike.%${topic}%`)
            .limit(100);
        results.kg_nodes = nodes || [];

        // Related edges
        const nodeIds = (nodes || []).map((n: any) => n.id);
        if (nodeIds.length > 0) {
            const { data: edges } = await supabase
                .from('cde_edges')
                .select('*, source:cde_nodes!source_node_id(name, node_type), target:cde_nodes!target_node_id(name, node_type)')
                .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`)
                .limit(200);
            results.kg_edges = edges || [];
        }

        // Pathologies
        const { data: pathologies } = await supabase
            .from('pathologies')
            .select('id, name, name_fr, icd_code, description, severity, category')
            .or(`name.ilike.%${topic}%,name_fr.ilike.%${topic}%,description.ilike.%${topic}%`)
            .limit(30);
        results.pathologies = pathologies || [];

        // Medications
        const { data: medications } = await supabase
            .from('medications')
            .select('id, name, substance, therapeutic_class, mechanism, indications, contraindications')
            .or(`name.ilike.%${topic}%,substance.ilike.%${topic}%,indications.ilike.%${topic}%`)
            .limit(50);
        results.medications = medications || [];

        // Substances
        const { data: substances } = await supabase
            .from('substances')
            .select('id, name, atc_code, mechanism_of_action, half_life, metabolism')
            .or(`name.ilike.%${topic}%,mechanism_of_action.ilike.%${topic}%`)
            .limit(30);
        results.substances = substances || [];

        // Drug interactions
        const { data: interactions } = await supabase
            .from('drug_interactions')
            .select('*')
            .or(`medication_name.ilike.%${topic}%,interacting_drug.ilike.%${topic}%,mechanism.ilike.%${topic}%`)
            .limit(50);
        results.interactions = interactions || [];

        // Treatments
        const { data: treatments } = await supabase
            .from('treatments')
            .select('id, name, description, treatment_type')
            .ilike('name', `%${topic}%`)
            .limit(30);
        results.treatments = treatments || [];

    } catch (e) {
        console.error("Local DB comprehensive error:", e);
    }

    return results;
}

// Check if a pair has already been analyzed (cache lookup)
async function isPairAnalyzed(supabase: any, substanceA: string, substanceB: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .rpc('is_pair_analyzed', { a_name: substanceA, b_name: substanceB });

        if (error) {
            console.error('Error checking pair cache:', error);
            return false;
        }

        return data === true;
    } catch (e) {
        console.error('Pair cache lookup error:', e);
        return false;
    }
}

// Record an analyzed pair in the cache
async function recordAnalyzedPair(
    supabase: any,
    substanceA: string,
    substanceB: string,
    discoveryType?: string,
    plausibility?: number,
    isDocumented?: boolean
): Promise<void> {
    try {
        await supabase.rpc('record_analyzed_pair', {
            a_name: substanceA,
            b_name: substanceB,
            discovery: discoveryType || null,
            plausibility: plausibility || null,
            documented: isDocumented || false
        });
    } catch (e) {
        console.error('Error recording analyzed pair:', e);
    }
}

// Detect if analysis contains novel discovery
function detectNovelty(analysisText: string): { isNovel: boolean; noveltyScore: number; reason: string } {
    const lowerText = analysisText.toLowerCase();

    // High novelty indicators
    const highNoveltyPatterns = [
        /novelty[_\s]score[:\s]*([7-9]\d|100)/i,
        /undocumented|non[_\s]?document[ée]|jamais[_\s]?document[ée]/i,
        /découverte|discovery|novel\s+finding/i,
        /never\s+previously\s+reported|not\s+found\s+in\s+literature/i,
        /mécanisme\s+inconnu|unknown\s+mechanism/i,
        /nouvelle\s+interaction|new\s+interaction/i
    ];

    // Low novelty indicators (already documented)
    const lowNoveltyPatterns = [
        /well[_\s]?established|bien[_\s]?établi/i,
        /widely[_\s]?known|largement[_\s]?connu/i,
        /documented\s+in\s+literature|documenté\s+dans\s+la\s+littérature/i,
        /discovery_type[:\s]*["']?(aucun|standard)/i
    ];

    let noveltyScore = 50; // Default neutral score
    let reason = "Standard analysis";

    // Check for high novelty
    for (const pattern of highNoveltyPatterns) {
        if (pattern.test(analysisText)) {
            noveltyScore = 85;
            reason = "High novelty indicators detected";
            break;
        }
    }

    // Check for low novelty (overrides neutral, but not high)
    if (noveltyScore === 50) {
        for (const pattern of lowNoveltyPatterns) {
            if (pattern.test(analysisText)) {
                noveltyScore = 20;
                reason = "Well-documented finding";
                break;
            }
        }
    }

    // Look for explicit novelty score in JSON
    const scoreMatch = analysisText.match(/"novelty_score":\s*(\d+)/);
    if (scoreMatch) {
        const explicitScore = parseInt(scoreMatch[1]);
        if (!isNaN(explicitScore)) {
            noveltyScore = explicitScore;
            reason = `Explicit novelty score: ${explicitScore}`;
        }
    }

    return {
        isNovel: noveltyScore >= 70,
        noveltyScore,
        reason
    };
}

// Select appropriate model and token count based on discovery potential
function selectModelStrategy(isNovel: boolean): { model: string; maxTokens: number; rationale: string } {
    if (isNovel) {
        return {
            model: "gpt-5.5",
            maxTokens: 40000,
            rationale: "High novelty detected - using OpenAI with extended tokens for comprehensive analysis"
        };
    } else {
        return {
            model: "gpt-5.5",
            maxTokens: 4000,
            rationale: "Standard comparison - using OpenAI with minimal tokens for efficiency"
        };
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { topic, focus_areas, depth } = await req.json();

        if (!topic) {
            return new Response(
                JSON.stringify({ error: "topic is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log(`[SYSTEMATIC-RESEARCH] Topic: ${topic}`);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event: StreamEvent) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                };

                try {
                    // Step 1: Comprehensive Local Search
                    sendEvent({ type: 'step_update', step: { id: 1, status: 'running', details: '📁 Analyse exhaustive base locale...', source: 'Supabase KG' } });

                    const localData = await queryLocalDatabaseComprehensive(supabase, topic);
                    const totalLocal = Object.values(localData).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 1, status: 'completed',
                            details: `✅ ${totalLocal} entrées locales analysées`,
                            source: 'Knowledge Graph'
                        }
                    });

                    // Step 2: Guidelines Search
                    sendEvent({ type: 'step_update', step: { id: 2, status: 'running', details: '📋 Recherche Guidelines & Consensus...', source: 'PubMed' } });

                    const pubmedData = await comprehensivePubMedSearch(topic, ncbiApiKey);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 2, status: 'completed',
                            details: `✅ ${pubmedData.guidelines.length} guidelines, ${pubmedData.reviews.length} revues`,
                            source: 'PubMed Guidelines'
                        }
                    });

                    // Step 3: RCTs & Clinical Evidence
                    sendEvent({ type: 'step_update', step: { id: 3, status: 'running', details: '🔬 Analyse RCTs & essais cliniques...', source: 'PubMed + ClinicalTrials' } });

                    const trials = await queryClinicalTrials(topic);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 3, status: 'completed',
                            details: `✅ ${pubmedData.rcts.length} RCTs, ${trials.length} essais ClinicalTrials.gov`,
                            source: 'Clinical Evidence'
                        }
                    });

                    // Step 4: OpenFDA Global Database
                    sendEvent({ type: 'step_update', step: { id: 4, status: 'running', details: '🌍 Recherche OpenFDA (médicaments globaux)...', source: 'FDA' } });

                    const fdaData = await getOpenFDAComprehensiveData(topic);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 4, status: 'completed',
                            details: `✅ ${fdaData.totalDrugs} médicaments FDA, ${fdaData.totalAdverseEvents} événements indésirables`,
                            source: 'OpenFDA'
                        }
                    });

                    // Step 5: DrugBank Global Database
                    sendEvent({ type: 'step_update', step: { id: 5, status: 'running', details: '🌍 Recherche DrugBank (pharmacologie)...', source: 'DrugBank' } });

                    const drugbankApiKey = Deno.env.get("DRUGBANK_API_KEY");
                    const drugbankData = await getDrugBankComprehensiveData(topic, drugbankApiKey);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 5, status: 'completed',
                            details: drugbankData.found
                                ? `✅ ${drugbankData.searchResults.length} médicaments DrugBank avec détails complets`
                                : '⚠️ DrugBank: aucun résultat ou API non configurée',
                            source: 'DrugBank'
                        }
                    });

                    // Step 6: OpenAI Systematic Analysis (adaptive token strategy)
                    sendEvent({ type: 'step_update', step: { id: 6, status: 'running', details: '🧠 Synthèse systématique (analyse initiale)...', source: 'OpenAI' } });

                    const comprehensiveContext = `
# REVUE SYSTÉMATIQUE: ${topic}

## Domaines de focus demandés
${focus_areas?.join(', ') || 'Analyse complète multi-dimensionnelle'}

## Profondeur d'analyse
${depth || 'comprehensive'}

---

# DONNÉES KNOWLEDGE GRAPH LOCAL

## Nœuds pertinents (${localData.kg_nodes.length})
${localData.kg_nodes.slice(0, 30).map((n: any) => `- ${n.name} (${n.node_type}): ${JSON.stringify(n.properties || {}).substring(0, 100)}`).join('\n')}

## Relations identifiées (${localData.kg_edges.length})
${localData.kg_edges.slice(0, 40).map((e: any) => `- ${e.source?.name || '?'} --[${e.relationship_type}]--> ${e.target?.name || '?'} (confiance: ${e.confidence_score || 'N/A'})`).join('\n')}

## Pathologies liées (${localData.pathologies.length})
${localData.pathologies.map((p: any) => `- ${p.name} (${p.icd_code || 'N/A'}): ${p.description?.substring(0, 100) || 'N/A'}`).join('\n')}

## Médicaments pertinents (${localData.medications.length})
${localData.medications.slice(0, 20).map((m: any) => `- ${m.name}: ${m.mechanism || 'N/A'} - Indications: ${m.indications?.substring(0, 80) || 'N/A'}`).join('\n')}

## Substances actives (${localData.substances.length})
${localData.substances.map((s: any) => `- ${s.name} (${s.atc_code || 'N/A'}): ${s.mechanism_of_action?.substring(0, 100) || 'N/A'}`).join('\n')}

## Interactions médicamenteuses connues (${localData.interactions.length})
${localData.interactions.slice(0, 25).map((i: any) => `- ${i.medication_name} ↔ ${i.interacting_drug}: ${i.severity} - ${i.mechanism?.substring(0, 60) || ''}`).join('\n')}

## Traitements (${localData.treatments.length})
${localData.treatments.map((t: any) => `- ${t.name}: ${t.description?.substring(0, 80) || 'N/A'}`).join('\n')}

---

# LITTÉRATURE SCIENTIFIQUE

## GUIDELINES & CONSENSUS (${pubmedData.guidelines.length})
${pubmedData.guidelines.map((g: any) => `[PMID:${g.pmid}] "${g.title}" (${g.year}) - ${g.journal}
Abstract: ${g.abstract?.substring(0, 300) || 'N/A'}...`).join('\n\n')}

## MÉTA-ANALYSES & REVUES SYSTÉMATIQUES (${pubmedData.reviews.length})
${pubmedData.reviews.map((r: any) => `[PMID:${r.pmid}] "${r.title}" (${r.year}) - ${r.journal}
Abstract: ${r.abstract?.substring(0, 300) || 'N/A'}...`).join('\n\n')}

## ESSAIS RANDOMISÉS CONTRÔLÉS (${pubmedData.rcts.length})
${pubmedData.rcts.map((rct: any) => `[PMID:${rct.pmid}] "${rct.title}" (${rct.year}) - ${rct.journal}
Abstract: ${rct.abstract?.substring(0, 250) || 'N/A'}...`).join('\n\n')}

## ÉTUDES OBSERVATIONNELLES (${pubmedData.observational.length})
${pubmedData.observational.map((o: any) => `[PMID:${o.pmid}] "${o.title}" (${o.year})`).join('\n')}

## ESSAIS CLINIQUES (ClinicalTrials.gov) (${trials.length})
${trials.slice(0, 15).map((t: any) => `[${t.nct_id}] "${t.title}" - Phase: ${t.phase || 'N/A'} - Statut: ${t.status} - N=${t.enrollment || '?'}
Interventions: ${t.interventions || 'N/A'}`).join('\n\n')}

---

# DONNÉES GLOBALES EXTERNES

## OPENFDA - Médicaments et événements indésirables (${fdaData.totalDrugs} médicaments, ${fdaData.totalAdverseEvents} événements)
${fdaData.drugs.slice(0, 10).map((d: any) => `### ${d.brand_name || d.generic_name}
- Ingrédients actifs: ${d.active_ingredients?.join(', ') || 'N/A'}
- Indications: ${Array.isArray(d.indications_and_usage) ? d.indications_and_usage.join(' ').substring(0, 200) : 'N/A'}
- Interactions: ${Array.isArray(d.drug_interactions) ? d.drug_interactions.join(' ').substring(0, 200) : 'N/A'}
- Avertissements: ${Array.isArray(d.warnings) ? d.warnings.join(' ').substring(0, 150) : 'N/A'}`).join('\n\n')}

### Événements indésirables FDA rapportés
${fdaData.adverseEvents.slice(0, 10).map((e: any) => `- ${e.reactions.join(', ')} (${e.serious ? 'GRAVE' : 'Non grave'}) - Médicaments: ${e.drugs.join(', ')}`).join('\n')}

## DRUGBANK - Pharmacologie détaillée
${drugbankData.found && drugbankData.detailed ? `
### ${drugbankData.detailed.name} (${drugbankData.detailed.drugbank_id})
- **Description**: ${drugbankData.detailed.description?.substring(0, 300) || 'N/A'}
- **Mécanisme d'action**: ${drugbankData.detailed.mechanism_of_action?.substring(0, 400) || 'N/A'}
- **Pharmacodynamique**: ${drugbankData.detailed.pharmacodynamics?.substring(0, 300) || 'N/A'}
- **Demi-vie**: ${drugbankData.detailed.half_life || 'N/A'}
- **Métabolisme**: ${drugbankData.detailed.metabolism?.substring(0, 200) || 'N/A'}
- **Cibles moléculaires** (${drugbankData.detailed.targets?.length || 0}): ${drugbankData.detailed.targets?.slice(0, 5).map((t: any) => `${t.name} (${t.actions?.join(', ')})`).join(', ') || 'N/A'}
- **Interactions documentées** (${drugbankData.detailed.interactions?.length || 0}): ${drugbankData.detailed.interactions?.slice(0, 10).map((i: any) => `${i.name}: ${i.description.substring(0, 100)}`).join(' | ') || 'N/A'}
- **Voies métaboliques** (${drugbankData.detailed.pathways?.length || 0}): ${drugbankData.detailed.pathways?.slice(0, 5).map((p: any) => p.name).join(', ') || 'N/A'}
` : 'DrugBank: Aucune donnée disponible (vérifiez la clé API)'}

---

# INSTRUCTIONS FINALES

Produis une REVUE SYSTÉMATIQUE COMPLÈTE en JSON structuré selon le format défini.

Objectifs:
1. Synthétiser TOUTES les preuves par niveau (GRADE)
2. Analyser selon les 5 dimensions (moléculaire→populationnelle)
3. Générer au moins 3 HYPOTHÈSES INNOVANTES avec scores
4. Identifier les GAPS DE CONNAISSANCE prioritaires
5. Formuler des IMPLICATIONS CLINIQUES pratiques

Cite TOUTES les sources (PMID, NCT, Guidelines).
`;

                    // ADAPTIVE MODEL SELECTION
                    // Start with a compact token budget for initial analysis
                    let initialStrategy = selectModelStrategy(false); // Start conservative

                    sendEvent({ type: 'step_update', step: { id: 6, status: 'running', details: `🧠 Analyse initiale (${initialStrategy.model})...`, source: 'AI' } });

                    const initialAIResponse = await callAI(
                        SYSTEM_PROMPT,
                        comprehensiveContext,
                        {
                            model: initialStrategy.model,
                            maxTokens: initialStrategy.maxTokens,
                            temperature: 0.2
                        }
                    );

                    let textContent = initialAIResponse.text || "";

                    // DETECT NOVELTY from initial analysis
                    const noveltyDetection = detectNovelty(textContent);
                    console.log(`[NOVELTY DETECTION] Score: ${noveltyDetection.noveltyScore}, Is Novel: ${noveltyDetection.isNovel}, Reason: ${noveltyDetection.reason}`);

                    // If high novelty detected, re-analyze with expanded context budget.
                    if (noveltyDetection.isNovel && initialStrategy.maxTokens < 40000) {
                        sendEvent({
                            type: 'step_update',
                            step: {
                                id: 6,
                                status: 'running',
                                details: `🚀 Découverte détectée! Re-analyse OpenAI approfondie (${noveltyDetection.noveltyScore}% nouveauté)...`,
                                source: 'OpenAI'
                            }
                        });

                        const upgradeStrategy = selectModelStrategy(true);
                        console.log(`[MODEL UPGRADE] ${initialStrategy.model} -> ${upgradeStrategy.model} (${upgradeStrategy.rationale})`);

                        // Re-run with upgraded model and max tokens
                        try {
                            const upgradeAIResponse = await callAI(
                                SYSTEM_PROMPT,
                                comprehensiveContext,
                                {
                                    model: upgradeStrategy.model,
                                    maxTokens: upgradeStrategy.maxTokens,
                                    temperature: 0.2
                                }
                            );

                            if (upgradeAIResponse.text) {
                                textContent = upgradeAIResponse.text;
                                console.log(`[MODEL UPGRADE SUCCESS] Used ${upgradeStrategy.maxTokens} tokens for comprehensive discovery analysis`);
                            }
                        } catch (upgradeError) {
                            console.error("Upgrade analysis failed, using initial analysis:", upgradeError);
                        }
                    }

                    sendEvent({ type: 'step_update', step: { id: 6, status: 'completed', details: `✅ Revue systématique complète (Novelty: ${noveltyDetection.noveltyScore}%)`, source: 'OpenAI' } });

                    // Send full analysis
                    sendEvent({ type: 'text', content: textContent });

                    // Extract and emit structured data
                    try {
                        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);

                            // Emit hypotheses
                            if (parsed.hypotheses_generated) {
                                for (const h of parsed.hypotheses_generated) {
                                    sendEvent({ type: 'hypothesis', hypothesis: h });
                                }
                            }

                            // Emit evidence synthesis
                            if (parsed.grade_synthesis) {
                                sendEvent({ type: 'evidence_synthesis', evidence_synthesis: parsed.grade_synthesis });
                            }

                            // Emit gap analysis
                            if (parsed.knowledge_gaps) {
                                sendEvent({ type: 'gap_analysis', gap_analysis: parsed.knowledge_gaps });
                            }
                        }
                    } catch { }

                    // Summary sources
                    const totalSources = pubmedData.guidelines.length + pubmedData.rcts.length +
                        pubmedData.reviews.length + pubmedData.observational.length + trials.length +
                        fdaData.totalDrugs + drugbankData.searchResults.length;

                    sendEvent({
                        type: 'sources', sources: [
                            { type: 'Knowledge Graph', count: localData.kg_nodes.length + localData.kg_edges.length },
                            { type: 'Guidelines', count: pubmedData.guidelines.length },
                            { type: 'Méta-analyses', count: pubmedData.reviews.length },
                            { type: 'RCTs', count: pubmedData.rcts.length },
                            { type: 'Essais cliniques', count: trials.length },
                            { type: 'OpenFDA', count: fdaData.totalDrugs },
                            { type: 'DrugBank', count: drugbankData.searchResults.length },
                            { type: 'Total sources', count: totalSources }
                        ]
                    });

                    sendEvent({ type: 'done' });

                } catch (err) {
                    console.error("Systematic research error:", err);
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
            JSON.stringify({ error: "Systematic research failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
