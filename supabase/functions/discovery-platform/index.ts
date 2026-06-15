import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// TYPES
// ============================================

interface Paper {
    id?: string;
    pmid?: string;
    pmcid?: string;
    doi?: string;
    title: string;
    authors?: string[];
    abstract?: string;
    publication_date?: string;
    journal?: string;
    source: 'pubmed' | 'europepmc' | 'pmc' | 'clinicaltrials' | 'openalex';
}

interface EvidenceSnippet {
    paper_id: string;
    passage: string;
    entities?: string[];
    claim_tags?: string[];
}

interface EvidencePack {
    query_intent: {
        disease?: string;
        target?: string;
        focus?: string;
    };
    papers: Paper[];
    snippets: EvidenceSnippet[];
    graph_context?: any;
}

interface Hypothesis {
    hypothesis_id: string;
    statement: string;
    detailed_analysis?: any;
    predictions: string[];
    minimal_tests: any[];
    risks_confounders: string[];
    scores: {
        novelty: number;
        plausibility: number;
        strength: number;
        feasibility: number;
        impact: number;
        total: number;
    };
    evidence_citations: string[];
    status: 'pending' | 'validated' | 'rejected';
}

// ============================================
// DATE NORMALIZATION HELPER
// ============================================

function normalizeDate(dateStr: string | undefined | null): string | undefined {
    if (!dateStr) return undefined;

    const str = dateStr.toString().trim();

    // Already valid YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }

    // Year only: "2025" -> "2025-01-01"
    if (/^\d{4}$/.test(str)) {
        return `${str}-01-01`;
    }

    // Year-month: "2016-06" -> "2016-06-01"
    if (/^\d{4}-\d{2}$/.test(str)) {
        return `${str}-01`;
    }

    // Try to parse other formats like "2025 Jan" or "January 2025"
    const yearMatch = str.match(/\d{4}/);
    if (yearMatch) {
        return `${yearMatch[0]}-01-01`;
    }

    // Invalid format - return undefined
    return undefined;
}

// ============================================
// RATE LIMITER (Token Bucket)
// ============================================

const rateLimiters: Map<string, { tokens: number; lastRefill: number }> = new Map();

const RATE_LIMITS: Record<string, { tokensPerSecond: number; maxTokens: number }> = {
    'ncbi': { tokensPerSecond: 3, maxTokens: 10 }, // 3 req/s without key, 10 with key
    'openalex': { tokensPerSecond: 10, maxTokens: 10 },
    'clinicaltrials': { tokensPerSecond: 5, maxTokens: 10 },
    'europepmc': { tokensPerSecond: 5, maxTokens: 10 },
};

function checkRateLimit(domain: string): boolean {
    const config = RATE_LIMITS[domain] || { tokensPerSecond: 5, maxTokens: 10 };
    const now = Date.now();

    if (!rateLimiters.has(domain)) {
        rateLimiters.set(domain, { tokens: config.maxTokens, lastRefill: now });
    }

    const limiter = rateLimiters.get(domain)!;
    const elapsed = (now - limiter.lastRefill) / 1000;
    limiter.tokens = Math.min(config.maxTokens, limiter.tokens + elapsed * config.tokensPerSecond);
    limiter.lastRefill = now;

    if (limiter.tokens >= 1) {
        limiter.tokens -= 1;
        return true;
    }
    return false;
}

async function waitForRateLimit(domain: string): Promise<void> {
    while (!checkRateLimit(domain)) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// ============================================
// PUBMED FETCHER (NCBI E-utilities)
// ============================================

async function fetchPubMed(query: string, maxResults: number = 20): Promise<Paper[]> {
    await waitForRateLimit('ncbi');

    const apiKey = Deno.env.get("NCBI_API_KEY");
    let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    if (apiKey) searchUrl += `&api_key=${apiKey}`;

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    const ids = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) return [];

    await waitForRateLimit('ncbi');

    let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
    if (apiKey) fetchUrl += `&api_key=${apiKey}`;

    const fetchResponse = await fetch(fetchUrl);
    const xmlText = await fetchResponse.text();

    const papers: Paper[] = [];
    const xmlArticles = xmlText.split('</PubmedArticle>');

    for (const articleXml of xmlArticles) {
        if (!articleXml.includes('<PubmedArticle>')) continue;

        const idMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
        const pmid = idMatch ? idMatch[1] : '';
        if (!pmid) continue;

        const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
        const title = titleMatch ? titleMatch[1] : "Sans titre";

        const abstractMatches = [...articleXml.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
        const abstract = abstractMatches.map(m => m[1]).join(" ");

        const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
        const journal = journalMatch ? journalMatch[1] : "";

        const yearMatch = articleXml.match(/<Year>(.*?)<\/Year>/);
        const pubDate = yearMatch ? yearMatch[1] : "";

        const authorMatches = [...articleXml.matchAll(/<LastName>(.*?)<\/LastName>.*?<Initials>(.*?)<\/Initials>/gs)];
        const authors = authorMatches.map(m => `${m[1]} ${m[2]}`);

        // Try to get DOI
        const doiMatch = articleXml.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/);
        const doi = doiMatch ? doiMatch[1] : undefined;

        // Try to get PMCID
        const pmcidMatch = articleXml.match(/<ArticleId IdType="pmc">(.*?)<\/ArticleId>/);
        const pmcid = pmcidMatch ? pmcidMatch[1] : undefined;

        papers.push({
            pmid,
            pmcid,
            doi,
            title,
            authors,
            abstract: abstract || undefined,
            publication_date: normalizeDate(pubDate),
            journal,
            source: 'pubmed'
        });
    }

    return papers;
}

// ============================================
// EUROPE PMC FETCHER (Full-text OA)
// ============================================

async function fetchEuropePMC(query: string, maxResults: number = 10): Promise<Paper[]> {
    await waitForRateLimit('europepmc');

    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resultType=core&pageSize=${maxResults}&format=json`;

    const response = await fetch(url);
    const data = await response.json();

    const papers: Paper[] = [];

    for (const result of data?.resultList?.result || []) {
        papers.push({
            pmid: result.pmid,
            pmcid: result.pmcid,
            doi: result.doi,
            title: result.title,
            authors: result.authorString ? result.authorString.split(', ') : [],
            abstract: result.abstractText,
            publication_date: normalizeDate(result.pubYear),
            journal: result.journalTitle,
            source: 'europepmc'
        });
    }

    return papers;
}

// ============================================
// CLINICAL TRIALS FETCHER
// ============================================

async function fetchClinicalTrials(query: string, maxResults: number = 10): Promise<Paper[]> {
    await waitForRateLimit('clinicaltrials');

    const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=${maxResults}`;

    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();

    const papers: Paper[] = [];

    for (const study of data?.studies || []) {
        const protocol = study.protocolSection;
        if (!protocol) continue;

        const identification = protocol.identificationModule || {};
        const description = protocol.descriptionModule || {};
        const status = protocol.statusModule || {};

        papers.push({
            pmid: undefined,
            doi: undefined,
            title: identification.briefTitle || identification.officialTitle || 'Untitled',
            abstract: description.briefSummary || description.detailedDescription,
            publication_date: normalizeDate(status.startDateStruct?.date),
            journal: `ClinicalTrials.gov - ${identification.nctId}`,
            source: 'clinicaltrials',
            authors: []
        });
    }

    return papers;
}

// ============================================
// OPENALEX FETCHER (Citations & Trends)
// ============================================

async function fetchOpenAlex(query: string, maxResults: number = 10): Promise<Paper[]> {
    await waitForRateLimit('openalex');

    const email = Deno.env.get("OPENALEX_EMAIL") || "research@example.com";
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${maxResults}&mailto=${email}`;

    const response = await fetch(url);
    const data = await response.json();

    const papers: Paper[] = [];

    for (const work of data?.results || []) {
        papers.push({
            doi: work.doi?.replace('https://doi.org/', ''),
            title: work.title,
            authors: work.authorships?.map((a: any) => a.author?.display_name).filter(Boolean) || [],
            abstract: work.abstract_inverted_index ? reconstructAbstract(work.abstract_inverted_index) : undefined,
            publication_date: work.publication_year?.toString(),
            journal: work.primary_location?.source?.display_name,
            source: 'openalex'
        });
    }

    return papers;
}

function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
    const words: Array<{ word: string; position: number }> = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
        for (const pos of positions) {
            words.push({ word, position: pos });
        }
    }
    words.sort((a, b) => a.position - b.position);
    return words.map(w => w.word).join(' ');
}

// ============================================
// EVIDENCE PACK BUILDER
// ============================================

function buildEvidencePack(query: string, papers: Paper[]): EvidencePack {
    const snippets: EvidenceSnippet[] = [];

    for (const paper of papers) {
        if (paper.abstract) {
            snippets.push({
                paper_id: paper.pmid || paper.doi || paper.title,
                passage: paper.abstract.slice(0, 1000), // Limit to ~1000 chars
                entities: extractEntities(paper.abstract),
                claim_tags: extractClaimTags(paper.abstract)
            });
        }
    }

    return {
        query_intent: parseQueryIntent(query),
        papers,
        snippets
    };
}

function parseQueryIntent(query: string): { disease?: string; target?: string; focus?: string } {
    // Simple heuristic parsing
    const parts = query.toLowerCase().split(/\s+(?:et|and|in)\s+/i);
    return {
        disease: parts[0],
        focus: parts[1] || undefined
    };
}

function extractEntities(text: string): string[] {
    // Simple entity extraction (would use NER in production)
    const entities: string[] = [];
    const patterns = [
        /\b(IL-\d+|TNF-?α?|NF-κB|NLRP3|TREM2|α-synuclein|dopamine|GABA)\b/gi,
        /\b(Parkinson|Alzheimer|neuroinflammation|microglia|astrocyte)\b/gi
    ];

    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) entities.push(...matches);
    }

    return [...new Set(entities)];
}

function extractClaimTags(text: string): string[] {
    const tags: string[] = [];
    const lowerText = text.toLowerCase();

    if (lowerText.includes('inhibit')) tags.push('INHIBITS');
    if (lowerText.includes('activate') || lowerText.includes('induce')) tags.push('ACTIVATES');
    if (lowerText.includes('associated with') || lowerText.includes('correlation')) tags.push('ASSOCIATED_WITH');
    if (lowerText.includes('reduce') || lowerText.includes('decrease')) tags.push('REDUCES');
    if (lowerText.includes('increase') || lowerText.includes('enhance')) tags.push('INCREASES');
    if (lowerText.includes('neuroprotect')) tags.push('NEUROPROTECTIVE');

    return tags;
}

// ============================================
// HYPOTHESIS GENERATOR (OpenAI or OpenAI)
// ============================================

async function generateHypotheses(evidencePack: EvidencePack, onChunk?: (text: string) => void): Promise<Hypothesis[]> {
    const systemPrompt = `Tu es un expert scientifique médical chargé de générer un RAPPORT DE RECHERCHE COMMITTEE-GRADE sur une hypothèse thérapeutique.

FORMAT DE SORTIE - JSON strict:
    {
        "hypotheses": [
            {
                "hypothesis_id": "HYP-{TOPIC}-{TIMESTAMP}",
                "statement": "Énoncé principal de l'hypothèse",

                "executive_summary": {
                    "context": "Contexte clinique en 1 paragraphe (maladie, traitement actuel, besoin non satisfait)",
                    "central_hypothesis_operational": "Hypothèse formulée de manière OPÉRATIONNELLE et TESTABLE",
                    "scope_decisions": "Population cible + niveau de preuve attendu + timeline",
                    "go_nogo_table": [
                        {
                            "block": "In vitro",
                            "minimal_design": "Design expérimental minimal (ex: Culture podocytes + inhibiteur CYP)",
                            "primary_endpoint": "Endpoint primaire mesurable (ex: Viabilité cellulaire, IC50)",
                            "go_nogo_signal": "Critère GO quantitatif (ex: IC50 > 10 µM = sécurité OK)"
                        },
                        {
                            "block": "In vivo",
                            "minimal_design": "Modèle animal + intervention",
                            "primary_endpoint": "Endpoint cliniquement pertinent",
                            "go_nogo_signal": "Seuil de succès (ex: Réduction protéinurie > 30% vs contrôle)"
                        },
                        {
                            "block": "Clinique",
                            "minimal_design": "Phase I/IIa pilote (N, durée, design)",
                            "primary_endpoint": "PK/PD + Safety",
                            "go_nogo_signal": "Critères passage Phase II (ex: Absence SAE + PK conforme)"
                        }
                    ]
                },

                "clinical_scope": {
                    "operational_definitions": "Définitions précises (ex: SSNS = 2+ rechutes/an malgré corticoïdes, protéinurie > 40 mg/m²/h)",
                    "recommended_comparators": "Comparateurs pour essais précoces (ex: Placebo + standard of care, ou dose standard)"
                },

                "rival_hypotheses": {
                    "h1_main": "Hypothèse PRINCIPALE (ex: Optimisation PK/PD via inhibition CYP)",
                    "h2_secondary": "Hypothèse SECONDAIRE (ex: Shift métabolites améliore safety)",
                    "h0_null": "Hypothèse NULLE (ex: Aucun effet PK/PD significatif)",
                    "h3_rival": "Hypothèse RIVALE 1 (ex: Bénéfice non-PK, immunomodulation directe)",
                    "h4_rival_toxicity": "Hypothèse RIVALE 2 (ex: Toxicité accrue sans bénéfice efficacité)",
                    "dag_textual": "DIAGRAMME CAUSAL (format texte avec flèches):\\n[Intervention] → [Mécanisme PK] → [Effet bio] → [Outcome]\\n                ↘ [Risque toxicité]"
                },

                "evidence_snapshot": [
                    {
                        "claim": "Assertion scientifique concise (ex: Efficacité lévamisole SSNS pédiatrique)",
                        "context_population": "Population/contexte (ex: Enfants 2-18 ans, SSNS cortico-dépendant)",
                        "oxford_level": "1a|1b|2a|2b|3|4|5",
                        "signal_effect": "Effet quantitatif si disponible (ex: OR 2.45 [IC95% 1.8-3.2], réduction rechutes)",
                        "key_references": ["PMID:12345678", "DOI:10.xxxx", "Cochrane Review 2023"]
                    }
                ],

                "mechanistic_model": {
                    "pkpd_robust": "Éléments PK/PD ROBUSTES (prouvés dans la littérature)",
                    "pkpd_unknown": "Éléments PK/PD INCONNUS (hypothèses à tester)",
                    "organ_risk_mapping": [
                        {
                            "organ_system": "Organe/Système (ex: Foie, Moelle osseuse, Rein)",
                            "role": "Rôle dans hypothèse ou état baseline (ex: Métabolisme CYP2C19)",
                            "risk_checkpoint": "Risque ou point de contrôle (ex: Neutropénie, agranulocytose)"
                        }
                    ]
                },

                "risks_monitoring": {
                    "key_risks": ["Risque majeur 1", "Risque majeur 2", "Risque majeur 3"],
                    "monitoring_table": [
                        {
                            "parameter": "Paramètre biologique/clinique (ex: NFS complète)",
                            "frequency": "Timeline précise (ex: J0, J7, J14, J28, puis mensuel)",
                            "action_threshold": "Seuil quantitatif (ex: Neutrophiles < 1500/mm³)",
                            "required_action": "Action si seuil franchi (ex: Arrêt temporaire + rééval 48h)"
                        }
                    ],
                    "pharmacogenetic_recommendations": "Recommandations pharmacogénétiques (ex: Génotypage CYP2C19 si disponible, ajustement dose PM/IM)"
                },

                "detailed_analysis": {
                    "background_context": "Contexte scientifique approfondi",
                    "pathophysiology": "Physiopathologie détaillée",
                    "mechanism_of_action": "Mécanisme d'action proposé",
                    "molecular_targets": "Cibles moléculaires (protéines, enzymes, récepteurs)",
                    "organ_functions": "Fonctions organiques impliquées",
                    "contraindications_interactions": "Contre-indications et interactions",
                    "unexplored_avenues": "Pistes innovantes jamais explorées",
                    "literature_synthesis": "Synthèse de la littérature",
                    "clinical_implications": "Implications cliniques",
                    "research_gaps": "Lacunes de recherche identifiées",
                    "key_evidence_summary": ["Point de preuve clé 1", "Point 2", "Point 3"]
                },

                "predictions": ["Prédiction testable 1", "Prédiction 2"],
                "minimal_tests": [{ "type": "in_vitro/in_vivo/clinical", "description": "Description" }],
                "risks_confounders": ["Facteur de confusion principal"],
                "drug_repurposing_candidates": ["Médicament repositionnable 1"],
                "scores": { "novelty": 0 - 10, "plausibility": 0 - 10, "strength": 0 - 10, "feasibility": 0 - 10, "impact": 0 - 10 },
                "evidence_citations": ["PMID:xxxxx - Description courte"]
            }
        ]
    }

CONSIGNES CRITIQUES:

    1. ** NIVEAUX OXFORD / EBM ** (sois rigoureux):
    - 1a = Méta - analyse systématique de RCTs
        - 1b = RCT individuel bien conduit
            - 2a = Étude de cohorte / cas - témoins de bonne qualité
                - 2b = Cohorte / cas - témoins de qualité moindre
                    - 3 = Série de cas, étude cas - témoins
                        - 4 = Opinion d'expert, cas isolés
                            - 5 = Physiologie, bench research
                                - Si niveau inconnu: "À confirmer"

    2. ** TABLEAU GO / NO - GO **: ENDPOINTS QUANTITATIFS obligatoires(pas de vague "efficacité OK")

    3. ** HYPOTHÈSES RIVALES **: Formule H3 / H4 pour permettre DÉPARTAGE scientifique

    4. ** DAG **: Format textuel avec flèches(→, ↘) pour causalité

    5. ** MONITORING **: Timeline PRÉCISE(J0, J7...) + seuils QUANTITATIFS

CONTRAINTE CRITIQUE:
- detailed_analysis: MAX 2-3 phrases concises par sous-section
- Évite répétitions
- Privilégie tableaux/listes

GÉNÈRE UN RAPPORT AUDIT - READY POUR COMITÉ SCIENTIFIQUE / IRB.`;

    const userPrompt = `GÉNÈRE UN RAPPORT COMMITTEE - GRADE basé sur les preuves ci - dessous.

        CONTEXTE:
    - Maladie / Cible: ${evidencePack.query_intent.disease || 'Non spécifié'}
    - Focus: ${evidencePack.query_intent.focus || 'Général'}

    PREUVES(${evidencePack.snippets.length} extraits):
${(() => {
            let evidenceText = "";
            const MAX_CHARS = 12000;

            for (let i = 0; i < evidencePack.snippets.length; i++) {
                const s = evidencePack.snippets[i];
                const snippetText = `\n[${i + 1}] ${s.paper_id}: "${s.passage.slice(0, 500)}..."\n`;
                if (evidenceText.length + snippetText.length > MAX_CHARS) break;
                evidenceText += snippetText;
            }
            return evidenceText;
        })()
        }

    INSTRUCTIONS:
    1. Génère UNE SEULE hypothèse avec TOUTES les sections du format(executive_summary, rival_hypotheses, evidence_snapshot avec niveaux Oxford / EBM, mechanistic_model, risks_monitoring)
    2. Tableau Go / No - Go: endpoints QUANTITATIFS obligatoires
    3. Hypothèses rivales: H1, H2, H0, H3, H4 pour départage
    4. Evidence Snapshot: classifie CHAQUE claim avec niveau Oxford / EBM rigoureux
    5. Monitoring: timelines PRÉCISES(J0, J7...) + seuils quantitatifs

Retourne JSON strict selon le format spécifié.`;

    try {
        // Call OpenAI with streaming
        const aiResponse = await streamAI(
            systemPrompt,
            userPrompt,
            (text) => {
                if (onChunk) onChunk(text);
            },
            {
                model: "gpt-5.5",
                reasoningEffort: "medium",
                maxTokens: 30000
            }
        );

        let content = aiResponse.text;

        // Fallback to OpenAI if OpenAI failed or not available (omitted for stream mode simplicity)

        if (!content) {
            // If we failed to get content (e.g. OpenAI off), return empty
            return [];
        }

        // Try to parse JSON from response
        let jsonMatch = content.match(/\{[\s\S]*\}/);
        let finalContent = content;

        // Parse final JSON
        if (jsonMatch) {
            let jsonStr = jsonMatch[0];
            try {
                const parsed = JSON.parse(jsonStr);
                return (parsed.hypotheses || []).map((h: any) => ({
                    ...h,
                    scores: {
                        ...h.scores,
                        total: ((h.scores?.novelty || 0) + (h.scores?.plausibility || 0) + (h.scores?.strength || 0) + (h.scores?.feasibility || 0) + (h.scores?.impact || 0)) / 5
                    },
                    status: 'pending'
                }));
            } catch (e) {
                console.warn('JSON parse failed even after continuation. Length:', jsonStr.length);
                console.warn('Error:', e);

                // Attempt JSON repair for common issues
                try {
                    // Try to close unclosed braces
                    const openBraces = (jsonStr.match(/\{/g) || []).length;
                    const closeBraces = (jsonStr.match(/\}/g) || []).length;
                    const missingBraces = openBraces - closeBraces;

                    if (missingBraces > 0) {
                        jsonStr = jsonStr + '}'.repeat(missingBraces);
                        const repaired = JSON.parse(jsonStr);
                        console.log('✅ JSON repaired successfully');
                        return (repaired.hypotheses || []).map((h: any) => ({
                            ...h,
                            scores: {
                                ...h.scores,
                                total: ((h.scores?.novelty || 0) + (h.scores?.plausibility || 0) + (h.scores?.strength || 0) + (h.scores?.feasibility || 0) + (h.scores?.impact || 0)) / 5
                            },
                            status: 'pending'
                        }));
                    }
                } catch (repairError) {
                    console.error('JSON repair failed:', repairError);
                }

                return [];
            }
        }
        return [];
    } catch (e) {
        console.error('Hypothesis generation error:', e);
        return [];
    }
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, query, maxResults = 20 } = await req.json();
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // ===================================
        // ACTION: GENERATE HYPOTHESES (ASYNC JOB)
        // ===================================
        if (action === 'generate_hypotheses') {
            try {
                // 1. Fetch Papers
                const [pubMedPapers, pmcPapers, trialsPapers] = await Promise.all([
                    fetchPubMed(query, maxResults),
                    fetchEuropePMC(query, Math.floor(maxResults / 2)),
                    fetchClinicalTrials(query, Math.floor(maxResults / 2))
                ]);

                const allPapers = [...pubMedPapers, ...pmcPapers, ...trialsPapers];

                // 2. Build Evidence Pack
                const evidencePack = buildEvidencePack(query, allPapers);

                // 3. Create job record
                const { data: job, error: jobError } = await supabase
                    .from('hypothesis_generation_jobs')
                    .insert({
                        query,
                        query_intent: evidencePack.query_intent,
                        evidence_pack: evidencePack,
                        status: 'pending',
                        progress_percentage: 0,
                        progress_message: 'En attente de traitement...'
                    })
                    .select()
                    .single();

                if (jobError || !job) {
                    throw new Error('Failed to create job: ' + (jobError?.message || 'Unknown error'));
                }

                // 4. Trigger background processor (invoke the function)
                try {
                    // Fire and forget - don't wait for response
                    fetch(`${supabaseUrl}/functions/v1/hypothesis-processor`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ job_id: job.id })
                    }).catch(e => console.warn('Background trigger failed:', e));
                } catch (e) {
                    console.warn('Failed to trigger background processor:', e);
                }

                // 5. Return job info immediately
                return new Response(JSON.stringify({
                    job_id: job.id,
                    status: job.status,
                    message: 'Job créé avec succès. Utilisez Realtime ou polling pour suivre le statut.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            } catch (error: any) {
                console.error('Job creation error:', error);
                return new Response(JSON.stringify({ error: error.message }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 500
                });
            }
        }

        // ===================================
        // OTHER ACTIONS (Standard JSON)
        // ===================================

        let data;
        if (action === 'search_pubmed' || action === 'search') {
            // Handle 'search' or 'search_pubmed'
            // 1. Fetch from multiple sources
            const includeOthers = action === 'search';

            const [pubMedPapers, pmcPapers, trialsPapers] = await Promise.all([
                fetchPubMed(query, maxResults),
                includeOthers ? fetchEuropePMC(query, Math.floor(maxResults / 2)) : Promise.resolve([]),
                includeOthers ? fetchClinicalTrials(query, Math.floor(maxResults / 2)) : Promise.resolve([])
            ]);

            const allPapers = [...pubMedPapers, ...pmcPapers, ...trialsPapers];

            // 2. Deduplicate
            const seen = new Set<string>();
            const uniquePapers = allPapers.filter(p => {
                const key = p.doi || p.pmid || p.title;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // 3. Return structured response
            data = {
                papers: uniquePapers,
                total: uniquePapers.length,
                sources: {
                    pubmed: pubMedPapers.length,
                    europepmc: pmcPapers.length,
                    clinicaltrials: trialsPapers.length
                }
            };
        } else if (action === 'fetch_details') {
            data = { message: "Not implemented yet" };
        } else {
            // Fallback for older clients or different actions
            data = { error: `Unknown action: ${action} ` };
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
