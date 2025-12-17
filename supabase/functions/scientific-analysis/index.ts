import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    evidence_depth?: 'basic' | 'standard' | 'deep';
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

async function fetchPubMedEvidence(query: string, limit: number = 10): Promise<ScientificEvidence[]> {
    const evidence: ScientificEvidence[] = [];

    try {
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json&sort=relevance`;
        if (ncbiApiKey) searchUrl += `&api_key=${ncbiApiKey}`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return evidence;

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];
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

async function fetchOpenFDAEvents(drugName: string): Promise<ScientificEvidence[]> {
    const evidence: ScientificEvidence[] = [];

    try {
        const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=10`;
        const res = await fetch(url);
        if (!res.ok) return evidence;

        const data = await res.json();
        const totalEvents = data?.meta?.results?.total || 0;

        if (totalEvents > 0) {
            // Aggregate reactions
            const reactions = new Map<string, number>();
            for (const event of data.results || []) {
                for (const reaction of event.patient?.reaction || []) {
                    const r = reaction.reactionmeddrapt;
                    if (r) reactions.set(r, (reactions.get(r) || 0) + 1);
                }
            }

            const topReactions = [...reactions.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([r, c]) => `${r} (n=${c})`);

            evidence.push({
                source: 'openfda',
                title: `Pharmacovigilance: ${drugName} (${totalEvents} événements)`,
                summary: `Réactions les plus fréquentes: ${topReactions.join(', ')}`,
                relevance_score: 0.7,
                evidence_level: 'cohort'
            });
        }
    } catch (e) {
        console.error("OpenFDA fetch error:", e);
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

    // Call Claude Opus
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model: "claude-3-opus-20240229", // Claude Opus for maximum capability
            max_tokens: 8000,
            temperature: 0.2, // Low temperature for scientific rigor
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

    const claudeData = await claudeResponse.json();
    let textContent = "";
    for (const block of claudeData.content || []) {
        if (block.type === "text") {
            textContent += block.text;
        }
    }

    // Parse JSON response
    let parsedAnalysis: any = {};
    try {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsedAnalysis = JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error("JSON parse error:", e);
        parsedAnalysis = { raw_response: textContent };
    }

    // Calculate tokens used
    const tokensUsed = claudeData.usage?.input_tokens + claudeData.usage?.output_tokens || 0;

    // Build response
    const response: AnalysisResponse = {
        analysis_id: `ANA-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase(),
        generated_at: new Date().toISOString(),
        analysis_type: request.analysis_type,
        model_used: "claude-3-opus-20240229",

        executive_summary: parsedAnalysis.executive_summary || "Analyse non disponible",
        detailed_analysis: parsedAnalysis.detailed_analysis || "",

        hypotheses: parsedAnalysis.hypotheses || [],
        recommendations: parsedAnalysis.recommendations || [],
        risk_factors: parsedAnalysis.risk_factors || [],

        evidence_base: evidence,
        knowledge_graph_insights: kgInsights,

        confidence_level: parsedAnalysis.confidence_level || 0.5,
        limitations: parsedAnalysis.limitations || [],
        areas_of_uncertainty: parsedAnalysis.areas_of_uncertainty || [],

        sources_consulted: [
            'PubMed/MEDLINE',
            'OpenFDA FAERS',
            'ClinicalTrials.gov',
            'Knowledge Graph (CYP450, Causal Rules)'
        ],
        tokens_used: tokensUsed
    };

    return response;
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

        // Determine evidence depth
        const pubmedLimit = request.evidence_depth === 'deep' ? 20 : request.evidence_depth === 'basic' ? 5 : 10;

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

        // Fetch evidence from all sources in parallel
        const [pubmedEvidence, openfdaEvidence, trialsEvidence, kgInsights] = await Promise.all([
            request.include_literature !== false ? fetchPubMedEvidence(searchQuery, pubmedLimit) : [],
            medications.length > 0 ? fetchOpenFDAEvents(medications[0]) : [],
            request.include_trials !== false ? fetchClinicalTrialsEvidence(searchQuery, 5) : [],
            fetchKnowledgeGraphInsights(supabase, medications, pathologies)
        ]);

        // Combine all evidence
        const allEvidence = [...pubmedEvidence, ...openfdaEvidence, ...trialsEvidence];

        // Perform scientific analysis with Claude Opus
        const analysis = await performScientificAnalysis(request, allEvidence, kgInsights, supabase);

        return new Response(JSON.stringify(analysis), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Scientific analysis error:", error);
        return new Response(
            JSON.stringify({ error: "Scientific analysis failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
