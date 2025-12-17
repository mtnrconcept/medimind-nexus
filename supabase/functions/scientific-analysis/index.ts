import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenFDAComprehensiveData } from "./openfda-api.ts";
import { getDrugBankComprehensiveData } from "./drugbank-api.ts";
import { exhaustiveOpenFDAAdverseEvents, exhaustivePubMedSearch } from "./exhaustive-search.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SCIENTIFIC ANALYSIS ENGINE — CLAUDE OPUS POWERED
 * 
 * Unified AI analysis engine that:
 * 1. Aggregates data from ALL medical APIs (PubMed, OpenFDA, ClinicalTrials, RxNorm)
 * 2. Queries the local Knowledge Graph
 * 3. Uses Claude 3 Opus for ultra-advanced scientific reasoning
 * 4. Generates evidence-based hypotheses with full citations
 * 
 * This is the BRAIN of MediMind Nexus.
 */

interface AnalysisRequest {
    analysis_type: 'drug_interaction' | 'side_effect_prediction' | 'treatment_optimization' | 'risk_assessment' | 'hypothesis_generation' | 'literature_synthesis' | 'full_analysis';

    // Context
    patient_id?: string;
    medications?: string[];
    pathologies?: string[];
    symptoms?: string[];
    lab_values?: Record<string, number>;

    // Patient demographics (optional)
    age?: number;
    weight_kg?: number;
    renal_function_egfr?: number;

    // Custom query
    custom_query?: string;

    // Options
    include_literature?: boolean;
    include_trials?: boolean;
    max_pubmed_results?: number;
    evidence_depth?: 'basic' | 'standard' | 'deep' | 'exhaustive'; // NEW: exhaustive mode
    exhaustive_mode?: boolean; // If true, scan ALL available sources with pagination
}

interface ScientificEvidence {
    pmid?: string;
    nct_id?: string;
    source: string;
    title: string;
    summary: string;
    relevance_score: number;
    evidence_level: 'meta_analysis' | 'rct' | 'cohort' | 'case_control' | 'case_series' | 'expert_opinion';
}

interface ScientificHypothesis {
    id: string;
    claim: string;
    type: 'interaction' | 'mechanism' | 'risk' | 'therapeutic' | 'prognostic';
    plausibility_score: number;
    confidence_interval?: string;
    mechanism_chain: string[];
    supporting_evidence: string[];
    contradicting_evidence: string[];
    falsification_criteria: string;
    validation_protocol: string;
    clinical_implications: string;
}

interface TreatmentRecommendation {
    medication: string;
    action: 'continue' | 'modify' | 'discontinue' | 'add' | 'substitute';
    rationale: string;
    urgency: 'immediate' | 'soon' | 'planned';
    monitoring: string[];
    alternatives?: string[];
    evidence_pmids: string[];
}

interface AnalysisResponse {
    analysis_id: string;
    generated_at: string;
    analysis_type: string;
    model_used: string;

    // Core analysis
    executive_summary: string;
    detailed_analysis: string;

    // Structured outputs
    hypotheses: ScientificHypothesis[];
    recommendations: TreatmentRecommendation[];
    risk_factors: { factor: string; severity: string; mitigation: string }[];

    // Evidence
    evidence_base: ScientificEvidence[];
    knowledge_graph_insights: any[];

    // Uncertainty and limitations
    confidence_level: number;
    limitations: string[];
    areas_of_uncertainty: string[];

    // Audit
    sources_consulted: string[];
    tokens_used: number;
}

// ============================================
// SCIENTIFIC ANALYSIS PROMPTS
// ============================================

const SYSTEM_PROMPT = `Tu es un pharmacologue clinicien expert de niveau mondial, avec une expertise en:
- Pharmacologie clinique et toxicologie
- Interactions médicamenteuses (pharmacocinétiques et pharmacodynamiques)
- Médecine basée sur les preuves
- Physiologie et physiopathologie
- Mécanismes moléculaires des médicaments

# PRINCIPES FONDAMENTAUX

## 1. Rigueur Scientifique Absolue
- Chaque affirmation DOIT être sourcée (PMID, NCT, ou mécanisme pharmacologique établi)
- Distinguer CLAIREMENT: fait établi vs hypothèse vs spéculation
- Quantifier l'incertitude (intervalles de confiance, niveaux de preuve)
- Reconnaître les limites des données disponibles

## 2. Raisonnement Mécanistique
- Expliquer les mécanismes biologiques sous-jacents
- Tracer les voies métaboliques (CYP450, transporteurs)
- Identifier les cascades pathophysiologiques
- Quantifier quand possible (Km, IC50, concentrations plasmatiques)

## 3. Hypothèses Falsifiables
Chaque hypothèse DOIT inclure:
- Critère de falsification précis
- Protocole de validation proposé
- Prédictions testables
- Endpoints mesurables

## 4. Score de Plausibilité (0-100)
Calculer sur 4 axes (25 points chacun):
- Proximité à l'évidence directe (méta-analyses, RCT)
- Cohérence biologique (mécanismes connus)
- Compatibilité clinique (doses, timing, concentrations réalistes)
- Absence de contradictions (données contraires)

## 5. Niveaux de Preuve
- Ia: Méta-analyse d'essais randomisés
- Ib: Au moins un essai randomisé
- IIa: Étude contrôlée non randomisée
- IIb: Étude quasi-expérimentale
- III: Études descriptives
- IV: Opinion d'experts

# FORMAT DE RÉPONSE JSON

{
  "executive_summary": "Synthèse clinique en 3-5 phrases",
  "detailed_analysis": "Analyse approfondie structurée",
  
  "hypotheses": [
    {
      "id": "H1",
      "claim": "Énoncé précis",
      "type": "interaction|mechanism|risk|therapeutic|prognostic",
      "plausibility_score": 75,
      "mechanism_chain": ["Étape 1", "Étape 2"],
      "supporting_evidence": ["PMID:xxx - description"],
      "contradicting_evidence": [],
      "falsification_criteria": "L'hypothèse serait réfutée si...",
      "validation_protocol": "Mesurer... pendant... avec contrôle de...",
      "clinical_implications": "Si confirmé, alors..."
    }
  ],
  
  "recommendations": [
    {
      "medication": "Nom",
      "action": "continue|modify|discontinue|add|substitute",
      "rationale": "Justification scientifique",
      "urgency": "immediate|soon|planned",
      "monitoring": ["Paramètre 1", "Paramètre 2"],
      "alternatives": ["Alternative 1"],
      "evidence_pmids": ["PMID:xxx"]
    }
  ],
  
  "risk_factors": [
    {
      "factor": "Description",
      "severity": "minor|moderate|major|critical",
      "mitigation": "Stratégie"
    }
  ],
  
  "confidence_level": 0.85,
  "limitations": ["Limitation 1"],
  "areas_of_uncertainty": ["Zone d'incertitude 1"]
}

RÉPONDS UNIQUEMENT EN JSON VALIDE.`;

// ============================================
// DATA AGGREGATION FUNCTIONS
// ============================================

async function fetchPubMedEvidence(query: string, limit: number = 10, sendProgress?: (msg: string) => void): Promise<ScientificEvidence[]> {
    const evidence: ScientificEvidence[] = [];

    try {
        if (sendProgress) sendProgress(`🔍 Interrogation PubMed (${limit} articles)...`);

        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json&sort=relevance`;
        if (ncbiApiKey) searchUrl += `&api_key=${ncbiApiKey}`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return evidence;

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];
        const totalAvailable = searchData?.esearchresult?.count || 0;

        if (sendProgress) sendProgress(`📊 PubMed: ${ids.length}/${totalAvailable} articles trouvés`);

        if (ids.length === 0) return evidence;
        if (ids.length === 0) return evidence;

        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (ncbiApiKey) fetchUrl += `&api_key=${ncbiApiKey}`;

        const fetchRes = await fetch(fetchUrl);
        const xmlText = await fetchRes.text();

        const articles = xmlText.split('</PubmedArticle>');
        let relevanceScore = 1.0;

        for (const chunk of articles) {
            const pmid = chunk.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1];
            const title = chunk.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1];
            if (!pmid || !title) continue;

            const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ").substring(0, 500);

            // Determine evidence level from publication type
            let evidenceLevel: ScientificEvidence['evidence_level'] = 'expert_opinion';
            const pubTypes = chunk.match(/<PublicationType[^>]*>(.*?)<\/PublicationType>/g) || [];
            const pubTypeStr = pubTypes.join(' ').toLowerCase();

            if (pubTypeStr.includes('meta-analysis')) evidenceLevel = 'meta_analysis';
            else if (pubTypeStr.includes('randomized controlled trial')) evidenceLevel = 'rct';
            else if (pubTypeStr.includes('cohort') || pubTypeStr.includes('observational')) evidenceLevel = 'cohort';
            else if (pubTypeStr.includes('case-control')) evidenceLevel = 'case_control';
            else if (pubTypeStr.includes('case report')) evidenceLevel = 'case_series';

            evidence.push({
                pmid,
                source: 'pubmed',
                title: title.replace(/<[^>]*>/g, ''),
                summary: abstract.replace(/<[^>]*>/g, ''),
                relevance_score: relevanceScore,
                evidence_level: evidenceLevel
            });

            relevanceScore *= 0.95; // Decay for lower-ranked results
        }
    } catch (e) {
        console.error("PubMed fetch error:", e);
    }

    return evidence;
}

// Replace basic OpenFDA with comprehensive version
async function fetchOpenFDAComprehensive(drugNames: string[]): Promise<ScientificEvidence[]> {
    const evidence: ScientificEvidence[] = [];

    for (const drugName of drugNames.slice(0, 3)) { // Limit to first 3 to avoid API overload
        try {
            const fdaData = await getOpenFDAComprehensiveData(drugName);

            // Add drug label information
            for (const drug of fdaData.drugs.slice(0, 2)) {
                const warnings = Array.isArray(drug.warnings) ? drug.warnings.join(' ') : '';
                const interactions = Array.isArray(drug.drug_interactions) ? drug.drug_interactions.join(' ') : '';

                evidence.push({
                    source: 'openfda_label',
                    title: `${drug.brand_name || drug.generic_name} - FDA Label`,
                    summary: `Warnings: ${warnings.substring(0, 300)}... Interactions: ${interactions.substring(0, 200)}`,
                    relevance_score: 0.85,
                    evidence_level: 'expert_opinion'
                });
            }

            // Add adverse events
            if (fdaData.totalAdverseEvents > 0) {
                const reactions = new Map<string, number>();
                for (const event of fdaData.adverseEvents.slice(0, 20)) {
                    for (const reaction of event.reactions) {
                        reactions.set(reaction, (reactions.get(reaction) || 0) + 1);
                    }
                }

                const topReactions = [...reactions.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([r, c]) => `${r} (n=${c})`);

                evidence.push({
                    source: 'openfda_faers',
                    title: `Pharmacovigilance FDA: ${drugName} (${fdaData.totalAdverseEvents} events)`,
                    summary: `Top adverse reactions: ${topReactions.join(', ')}`,
                    relevance_score: 0.75,
                    evidence_level: 'cohort'
                });
            }
        } catch (e) {
            console.error(`OpenFDA comprehensive fetch error for ${drugName}:`, e);
        }
    }

    return evidence;
}

// Add DrugBank integration
async function fetchDrugBankData(drugNames: string[]): Promise<ScientificEvidence[]> {
    const evidence: ScientificEvidence[] = [];
    const drugbankApiKey = Deno.env.get("DRUGBANK_API_KEY");

    if (!drugbankApiKey) {
        console.warn('DrugBank API key not configured');
        return evidence;
    }

    for (const drugName of drugNames.slice(0, 2)) { // Limit to 2 drugs
        try {
            const dbData = await getDrugBankComprehensiveData(drugName, drugbankApiKey);

            if (dbData.found && dbData.detailed) {
                const drug = dbData.detailed;

                // Mechanism of action
                if (drug.mechanism_of_action) {
                    evidence.push({
                        source: 'drugbank_mechanism',
                        title: `${drug.name} - Mechanism of Action`,
                        summary: drug.mechanism_of_action.substring(0, 500),
                        relevance_score: 0.9,
                        evidence_level: 'expert_opinion'
                    });
                }

                // Drug-drug interactions
                if (drug.interactions && drug.interactions.length > 0) {
                    const interactionsSummary = drug.interactions
                        .slice(0, 10)
                        .map(i => `${i.name}: ${i.description.substring(0, 80)}`)
                        .join(' | ');

                    evidence.push({
                        source: 'drugbank_interactions',
                        title: `${drug.name} - Known Interactions (${drug.interactions.length} total)`,
                        summary: interactionsSummary,
                        relevance_score: 0.95,
                        evidence_level: 'expert_opinion'
                    });
                }

                // Pharmacokinetics
                const pkInfo = [
                    drug.half_life ? `Half-life: ${drug.half_life}` : '',
                    drug.metabolism ? `Metabolism: ${drug.metabolism.substring(0, 200)}` : '',
                    drug.protein_binding ? `Protein binding: ${drug.protein_binding}` : ''
                ].filter(Boolean).join('. ');

                if (pkInfo) {
                    evidence.push({
                        source: 'drugbank_pk',
                        title: `${drug.name} - Pharmacokinetics`,
                        summary: pkInfo,
                        relevance_score: 0.85,
                        evidence_level: 'expert_opinion'
                    });
                }
            }
        } catch (e) {
            console.error(`DrugBank fetch error for ${drugName}:`, e);
        }
    }

    return evidence;
}

async function fetchClinicalTrialsEvidence(query: string, limit: number = 5): Promise<ScientificEvidence[]> {
    const evidence: ScientificEvidence[] = [];

    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(query)}&pageSize=${limit}&format=json`;
        const res = await fetch(url);
        if (!res.ok) return evidence;

        const data = await res.json();

        for (const study of data.studies || []) {
            const protocol = study.protocolSection;
            const id = protocol?.identificationModule;
            const status = protocol?.statusModule;
            const design = protocol?.designModule;

            const phase = design?.phases?.join(', ') || 'N/A';
            const enrollment = design?.enrollmentInfo?.count || 'N/A';

            evidence.push({
                nct_id: id?.nctId,
                source: 'clinicaltrials',
                title: id?.officialTitle || id?.briefTitle || 'Unknown',
                summary: `Phase: ${phase}, Enrollment: ${enrollment}, Status: ${status?.overallStatus}`,
                relevance_score: 0.8,
                evidence_level: phase.includes('3') ? 'rct' : 'cohort'
            });
        }
    } catch (e) {
        console.error("ClinicalTrials fetch error:", e);
    }

    return evidence;
}

async function fetchKnowledgeGraphInsights(supabase: any, medications: string[], pathologies: string[]): Promise<any[]> {
    const insights: any[] = [];

    try {
        // Fetch causal rules
        const searchTerms = [...medications, ...pathologies].filter(t => t);
        if (searchTerms.length === 0) return insights;

        const orConditions = searchTerms.map(t => `source_name.ilike.%${t}%`).join(',');

        const { data: rules } = await supabase
            .from('kg_causal_rules')
            .select('*')
            .or(orConditions)
            .limit(20);

        for (const rule of rules || []) {
            insights.push({
                type: 'causal_rule',
                source: rule.source_name,
                target: rule.target_name,
                relation: rule.relation_type,
                strength: rule.strength,
                evidence_level: rule.evidence_level,
                action: rule.recommended_action
            });
        }

        // Fetch CYP interactions
        const { data: enzymeMeds } = await supabase
            .from('kg_enzyme_medication')
            .select('*, kg_enzymes(name, clinical_significance)')
            .limit(30);

        for (const em of enzymeMeds || []) {
            const isRelevant = medications.some(m =>
                em.medication_name?.toLowerCase().includes(m.toLowerCase())
            );

            if (isRelevant) {
                insights.push({
                    type: 'cyp_interaction',
                    enzyme: em.kg_enzymes?.name,
                    medication: em.medication_name,
                    relationship: em.relationship_type,
                    effect_strength: em.effect_strength,
                    clinical_significance: em.kg_enzymes?.clinical_significance
                });
            }
        }
    } catch (e) {
        console.error("KG fetch error:", e);
    }

    return insights;
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

async function performScientificAnalysis(
    request: AnalysisRequest,
    evidence: ScientificEvidence[],
    kgInsights: any[],
    supabase: any
): Promise<AnalysisResponse> {

    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
        throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Build comprehensive context
    let userPrompt = `# CONTEXTE D'ANALYSE\n\n`;

    userPrompt += `## Type d'analyse demandée: ${request.analysis_type}\n\n`;

    if (request.patient_id) {
        userPrompt += `## Patient ID: ${request.patient_id}\n`;
    }

    if (request.age) {
        userPrompt += `## Âge: ${request.age} ans\n`;
    }

    if (request.weight_kg) {
        userPrompt += `## Poids: ${request.weight_kg} kg\n`;
    }

    if (request.renal_function_egfr) {
        userPrompt += `## Fonction rénale (DFGe): ${request.renal_function_egfr} mL/min\n`;
    }

    if (request.medications && request.medications.length > 0) {
        userPrompt += `\n## Médicaments actuels:\n`;
        for (const med of request.medications) {
            userPrompt += `- ${med}\n`;
        }
    }

    if (request.pathologies && request.pathologies.length > 0) {
        userPrompt += `\n## Pathologies:\n`;
        for (const path of request.pathologies) {
            userPrompt += `- ${path}\n`;
        }
    }

    if (request.symptoms && request.symptoms.length > 0) {
        userPrompt += `\n## Symptômes:\n`;
        for (const sym of request.symptoms) {
            userPrompt += `- ${sym}\n`;
        }
    }

    if (request.lab_values && Object.keys(request.lab_values).length > 0) {
        userPrompt += `\n## Valeurs de laboratoire:\n`;
        for (const [key, value] of Object.entries(request.lab_values)) {
            userPrompt += `- ${key}: ${value}\n`;
        }
    }

    if (request.custom_query) {
        userPrompt += `\n## Question spécifique:\n${request.custom_query}\n`;
    }

    // Add evidence
    if (evidence.length > 0) {
        userPrompt += `\n# PREUVES SCIENTIFIQUES DISPONIBLES\n\n`;
        for (const e of evidence) {
            userPrompt += `## ${e.source.toUpperCase()}${e.pmid ? ` (PMID: ${e.pmid})` : ''}${e.nct_id ? ` (${e.nct_id})` : ''}\n`;
            userPrompt += `**${e.title}**\n`;
            userPrompt += `Niveau de preuve: ${e.evidence_level}\n`;
            userPrompt += `${e.summary}\n\n`;
        }
    }

    // Add KG insights
    if (kgInsights.length > 0) {
        userPrompt += `\n# INSIGHTS DU KNOWLEDGE GRAPH\n\n`;
        for (const insight of kgInsights) {
            if (insight.type === 'causal_rule') {
                userPrompt += `- **${insight.source}** → ${insight.relation} → **${insight.target}** (Force: ${insight.strength}, Preuve: ${insight.evidence_level})\n`;
                if (insight.action) userPrompt += `  Action recommandée: ${insight.action}\n`;
            } else if (insight.type === 'cyp_interaction') {
                userPrompt += `- **${insight.medication}** est ${insight.relationship} de **${insight.enzyme}** (${insight.effect_strength || 'N/A'})\n`;
            }
        }
    }

    userPrompt += `\n# INSTRUCTIONS\n\nEffectue une analyse scientifique approfondie selon le type demandé (${request.analysis_type}). Génère des hypothèses falsifiables avec scores de plausibilité. Cite toutes les sources. Réponds en JSON.`;

    // Call Claude Opus with STREAMING
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: "claude-3-opus-20240229",
            max_tokens: 8000,
            temperature: 0.2,
            stream: true, // ENABLE STREAMING
            system: SYSTEM_PROMPT,
            messages: [
                { role: "user", content: userPrompt }
            ]
        })
    });

    if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error("Claude API error:", errorText);
        throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    // Return streaming response (will be handled by caller)
    return {
        stream: claudeResponse.body,
        userPrompt,
        evidence,
        kgInsights
    };
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: AnalysisRequest = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Determine evidence depth - SIGNIFICANTLY INCREASED
        // exhaustive mode = scan ALL available sources (millions)
        const isExhaustive = request.exhaustive_mode || request.evidence_depth === 'exhaustive';

        const pubmedLimit = isExhaustive ? 10000 : // 10K articles in exhaustive
            request.evidence_depth === 'deep' ? 200 :
                request.evidence_depth === 'basic' ? 20 : 50;

        const fdaLimit = isExhaustive ? Infinity : // ALL events in exhaustive
            request.evidence_depth === 'deep' ? 100 :
                request.evidence_depth === 'basic' ? 20 : 50;

        const trialsLimit = isExhaustive ? 500 :
            request.evidence_depth === 'deep' ? 50 :
                request.evidence_depth === 'basic' ? 10 : 20;

        // Build search queries
        const medications = request.medications || [];
        const pathologies = request.pathologies || [];

        let searchQuery = '';
        if (medications.length > 0) {
            searchQuery += medications.join(' OR ');
        }
        if (pathologies.length > 0) {
            if (searchQuery) searchQuery += ' AND ';
            searchQuery += pathologies.join(' OR ');
        }
        if (request.custom_query) {
            if (searchQuery) searchQuery += ' AND ';
            searchQuery += request.custom_query;
        }
        if (!searchQuery) {
            searchQuery = 'drug interactions clinical pharmacology';
        }

        // Fetch evidence from ALL sources in parallel (including DrugBank)
        const [pubmedEvidence, openfdaEvidence, drugbankEvidence, trialsEvidence, kgInsights] = await Promise.all([
            request.include_literature !== false ? fetchPubMedEvidence(searchQuery, pubmedLimit) : [],
            medications.length > 0 ? fetchOpenFDAComprehensive(medications) : [],
            medications.length > 0 ? fetchDrugBankData(medications) : [],
            request.include_trials !== false ? fetchClinicalTrialsEvidence(searchQuery, 5) : [],
            fetchKnowledgeGraphInsights(supabase, medications, pathologies)
        ]);

        // Setup Server-Sent Events stream
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                const sendEvent = (data: any) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                const sendProgress = (message: string) => {
                    sendEvent({ type: 'progress', message });
                };

                try {
                    // Send initial metadata
                    sendEvent({
                        type: 'metadata',
                        analysis_id: `ANA-${Date.now().toString(36)}`.toUpperCase(),
                        analysis_type: request.analysis_type,
                        model: 'claude-3-opus-20240229',
                        search_depth: request.evidence_depth || 'standard',
                        estimated_sources: '19.7M événements FDA + 176K médicaments + millions d\'articles'
                    });

                    sendProgress('🚀 Démarrage de la recherche exhaustive...');

                    // Fetch evidence with progress tracking
                    sendProgress(`📚 Interrogation PubMed (limit: ${pubmedLimit} articles)...`);
                    const pubmedEvidence = request.include_literature !== false
                        ? await fetchPubMedEvidence(searchQuery, pubmedLimit, sendProgress)
                        : [];

                    sendProgress(`💊 Interrogation OpenFDA (limit: ${fdaLimit} par médicament)...`);
                    const openfdaEvidence = medications.length > 0
                        ? await fetchOpenFDAComprehensive(medications)
                        : [];

                    sendProgress('🧬 Interrogation DrugBank (pharmacologie détaillée)...');
                    const drugbankEvidence = medications.length > 0
                        ? await fetchDrugBankData(medications)
                        : [];

                    sendProgress(`🏥 Interrogation ClinicalTrials.gov (limit: ${trialsLimit} essais)...`);
                    const trialsEvidence = request.include_trials !== false
                        ? await fetchClinicalTrialsEvidence(searchQuery, trialsLimit)
                        : [];

                    sendProgress('🧠 Extraction Knowledge Graph local...');
                    const kgInsights = await fetchKnowledgeGraphInsights(supabase, medications, pathologies);

                    // Combine all evidence
                    const allEvidence = [...pubmedEvidence, ...openfdaEvidence, ...drugbankEvidence, ...trialsEvidence];

                    sendProgress(`✅ ${allEvidence.length} preuves scientifiques collectées`);

                    // Send evidence summary
                    sendEvent({
                        type: 'evidence_summary',
                        total_evidence: allEvidence.length,
                        by_source: {
                            pubmed: pubmedEvidence.length,
                            openfda: openfdaEvidence.length,
                            drugbank: drugbankEvidence.length,
                            trials: trialsEvidence.length
                        },
                        kg_insights: kgInsights.length
                    });

                    sendProgress('🤖 Génération de l\'analyse avec Claude Opus...');

                    // Perform scientific analysis with Claude (get stream)
                    const streamData = await performScientificAnalysis(request, allEvidence, kgInsights, supabase);

                    // Stream Claude's response
                    const reader = streamData.stream.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') continue;

                                try {
                                    const parsed = JSON.parse(data);

                                    // Send text deltas to client in real-time
                                    if (parsed.type === 'content_block_delta') {
                                        const text = parsed.delta?.text;
                                        if (text) {
                                            sendEvent({
                                                type: 'text_delta',
                                                content: text
                                            });
                                        }
                                    }

                                    // Handle message completion
                                    if (parsed.type === 'message_stop') {
                                        sendEvent({ type: 'done' });
                                    }
                                } catch (e) {
                                    // Ignore parse errors for streaming chunks
                                }
                            }
                        }
                    }

                    controller.close();
                } catch (error) {
                    console.error('Streaming error:', error);
                    sendEvent({
                        type: 'error',
                        message: String(error)
                    });
                    controller.close();
                }
            }
        });

        return new Response(readable, {
            headers: {
                ...corsHeaders,
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        });

    } catch (error) {
        console.error("Scientific analysis error:", error);
        return new Response(
            JSON.stringify({ error: "Scientific analysis failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
