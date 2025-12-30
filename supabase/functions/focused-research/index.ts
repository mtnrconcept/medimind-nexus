import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, streamAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StreamEvent {
    type: 'step_update' | 'text' | 'discovery' | 'simple_explanation' | 'done';
    step?: {
        id: number;
        status: 'pending' | 'running' | 'completed' | 'error';
        details?: string;
    };
    content?: string;
    discovery?: any;
}

// Function to search PubMed with optional API Key support
// Function to search PubMed with optional API Key support and Abstract fetching
async function searchPubMed(query: string, maxResults: number = 10, apiKey?: string): Promise<any[]> {
    try {
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
        if (apiKey) {
            searchUrl += `&api_key=${apiKey}`;
        }

        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
            console.error(`PubMed search failed: ${searchResponse.status}`);
            return [];
        }

        const searchData = await searchResponse.json();
        const ids = searchData?.esearchresult?.idlist || [];

        if (ids.length === 0) return [];

        // Use efetch to get full records including ABSTRACTS (XML only)
        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (apiKey) {
            fetchUrl += `&api_key=${apiKey}`;
        }

        const fetchResponse = await fetch(fetchUrl);
        const xmlText = await fetchResponse.text();

        // Simple XML parsing for Deno Edge (avoiding heavy DOM parsers)
        const sources: any[] = [];

        // Split by article to process individually
        const articles = xmlText.split('</PubmedArticle>');

        for (const articleXml of articles) {
            if (!articleXml.includes('<PubmedArticle>')) continue;

            // Extract ID
            const idMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
            const id = idMatch ? idMatch[1] : '';
            if (!id || !ids.includes(id)) continue;

            // Extract Title
            const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
            const title = titleMatch ? titleMatch[1] : "Sans titre";

            // Extract Abstract (handle multiple sections)
            const abstractMatches = [...articleXml.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ");

            // Extract Journal
            const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
            const journal = journalMatch ? journalMatch[1] : "";

            // Extract Year
            const yearMatch = articleXml.match(/<Year>(.*?)<\/Year>/);
            const year = yearMatch ? yearMatch[1] : "";

            // Extract Authors
            const authorMatches = [...articleXml.matchAll(/<LastName>(.*?)<\/LastName>.*?<Initials>(.*?)<\/Initials>/gs)];
            const authors = authorMatches.slice(0, 3).map(m => `${m[1]} ${m[2]}`).join(", ");

            sources.push({
                title: title,
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                authors: authors,
                year: year,
                journal: journal,
                abstract: abstract || "Résumé non disponible."
            });
        }

        return sources;
    } catch (error) {
        console.error('PubMed search error:', error);
        return [];
    }
}

// Helper to translate query using AI
async function translateQuery(query: string): Promise<string> {
    try {
        const response = await callAI(
            "Translate the following medical term or query from French to English. Return ONLY the English translation, no other text. If it is already English or a universal scientific term, return it as is.",
            `Query: "${query}"`,
            {
                model: "claude-3-haiku-20240307",
                maxTokens: 100,
                temperature: 0
            }
        );

        const translation = response.text.trim().replace(/"/g, '');
        return translation;
    } catch (e) {
        console.error("Translation error:", e);
        return query;
    }
}

// Medical knowledge: standard treatments and contraindications for pathologies
const MEDICAL_KNOWLEDGE: Record<string, { treatments: string[], contraindications: string[], comorbidities: string[] }> = {
    'syndrome néphrotique': {
        treatments: ['prednisolone', 'prednisone', 'ciclosporine', 'cyclosporine', 'tacrolimus', 'rituximab', 'mycophenolate', 'cellcept', 'enalapril', 'losartan', 'furosemide', 'albumine', 'heparine', 'ofatumumab', 'obinutuzumab', 'levamisole', 'cyclophosphamide', 'abatacept', 'sparsentan'],
        contraindications: ['ibuprofène', 'ibuprofen', 'algifor', 'irfen', 'naproxène', 'diclofenac', 'voltaren', 'aspirine', 'ains', 'nsaid', 'gentamicine', 'aminosides', 'produits iodés'],
        comorbidities: ['hypertension', 'thrombose', 'hyperlipidémie', 'infection', 'ostéoporose', 'insuffisance rénale']
    },
    'nephrotic syndrome': {
        treatments: ['prednisolone', 'prednisone', 'cyclosporine', 'tacrolimus', 'rituximab', 'mycophenolate', 'cellcept', 'enalapril', 'losartan', 'furosemide', 'albumin', 'heparin', 'ofatumumab', 'obinutuzumab', 'levamisole', 'cyclophosphamide', 'abatacept', 'sparsentan'],
        contraindications: ['ibuprofen', 'naproxen', 'diclofenac', 'aspirin', 'nsaid', 'gentamicin', 'aminoglycosides', 'iodinated contrast'],
        comorbidities: ['hypertension', 'thrombosis', 'hyperlipidemia', 'infection', 'osteoporosis', 'renal insufficiency']
    },
    'diabète': {
        treatments: ['metformine', 'insuline', 'glibenclamide', 'sitagliptine', 'empagliflozine', 'liraglutide', 'dapagliflozine'],
        contraindications: ['corticoides', 'thiazidiques'],
        comorbidities: ['hypertension', 'néphropathie', 'rétinopathie', 'neuropathie']
    },
    'hypertension': {
        treatments: ['amlodipine', 'lisinopril', 'enalapril', 'losartan', 'hydrochlorothiazide', 'atenolol', 'bisoprolol'],
        contraindications: ['ibuprofene', 'corticoides', 'réglisse'],
        comorbidities: ['diabète', 'insuffisance rénale', 'avc', 'infarctus']
    }
};

// DEEP MEDICAL KNOWLEDGE for innovative research - Nephrotic Syndrome focus
const NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE = {
    pathophysiology: {
        primary_mechanism: "Altération barrière filtration glomérulaire (podocytes, membrane basale, cellules endothéliales)",
        key_proteins: ["néphrine", "podocine", "CD2AP", "α-actinine-4", "TRPC5", "TRPC6"],
        autoantibodies: ["anti-néphrine (sous-groupe de patients)", "anti-PLA2R (GEM)"],
        circulating_factors: ["facteur de perméabilité circulant", "suPAR (controversé)", "cytokines"],
        genetic_mutations: ["NPHS1 (néphrine)", "NPHS2 (podocine)", "WT1", "LAMB2", "PLCE1"]
    },
    standard_treatments: {
        first_line: {
            corticosteroids: { drugs: ["prednisolone", "prednisone"], dose: "1mg/kg/j", efficacy: "85-90% réponse" },
            calcineurin_inhibitors: { drugs: ["ciclosporine", "tacrolimus"], mechanism: "Inhibition calcineurine/NFAT", risk: "néphrotoxicité long terme" },
            antimetabolites: { drugs: ["mycophenolate mofétil (CellCept)"], mechanism: "Inhibition synthèse ADN lymphocytaire" }
        },
        second_line: {
            anti_CD20: { drugs: ["rituximab", "ofatumumab", "obinutuzumab"], mechanism: "Déplétion lymphocytes B", efficacy: "90% rémission à 12 mois vs 63% tacrolimus" },
            alkylating_agents: { drugs: ["cyclophosphamide"], risk: "toxicité gonadique, cancers" },
            immunomodulators: { drugs: ["levamisole"], mechanism: "immunomodulation légère" }
        }
    },
    innovative_therapies: {
        CAR_T_anti_CD19: {
            description: "Lymphocytes T modifiés pour cibler CD19 et éliminer toutes cellules B",
            evidence: "5 patients lupus - rémission complète durable après 1 infusion (Nature Medicine 2022)",
            potential: "Reset complet système immunitaire, possible guérison",
            status: "expérimental, études en cours pour maladies rénales auto-immunes"
        },
        TRPC5_inhibitors: {
            mechanism: "Inhibition canaux TRPC5 dans podocytes - stabilisation cytosquelette",
            evidence: "Effets encourageants modèles animaux GSSF",
            status: "Phase 2 interrompue (effectif insuffisant), TRPC6 inhibiteur en recrutement"
        },
        ACTH_gel: {
            drugs: ["tétracosactide", "Acthar gel"],
            mechanism: "Stimulation corticostéroïdes endogènes + effets directs récepteurs mélanocortine podocytes",
            status: "Essai pilote ADRENL en cours"
        },
        sparsentan: {
            mechanism: "Double blocage angiotensine + endothéline",
            evidence: "Forte réduction protéinurie GSSF, autorisation conditionnelle USA",
            status: "approuvé pour GSSF aux USA"
        },
        plasmapheresis: {
            indication: "GSSF multirésistante, récidive post-greffe",
            mechanism: "Élimination facteurs pathogènes circulants"
        },
        abatacept: {
            mechanism: "Inhibiteur CD80/B7-1 (CTLA4-Ig)",
            status: "Essai phase 2 négatif, mais sous-groupe CD80+ potentiellement sensible"
        }
    },
    research_directions: {
        anti_nephrin_therapy: "Immunoadsorption spécifique ou tolérance immunitaire pour patients anti-néphrine+",
        microbiome: "Probiotiques (Lactobacillus) + SCFA pour potentialiser immunosuppression",
        chronotherapy: "Administration vespérale corticoïdes pour synchronisation rythmes circadiens",
        gene_therapy: "Réparation NPHS1/NPHS2 pour formes génétiques",
        stem_cells: "Autogreffe moelle osseuse pour reset immunitaire",
        precision_medicine: "Profilage immunologique individuel pour thérapie ciblée"
    },
    drug_interactions_critical: {
        curcumine_ciclosporine: {
            mechanism: "Curcumine inhibe CYP3A4 (IC50=15μM), ciclosporine métabolisée >90% par CYP3A4",
            risk: "Accumulation ciclosporine → néphrotoxicité paradoxale",
            severity: "CRITIQUE - suppléments curcuma à éviter absolument"
        },
        pamplemousse: {
            mechanism: "Inhibition CYP3A4 intestinal",
            drugs_affected: ["ciclosporine", "tacrolimus"],
            risk: "Surdosage immunosuppresseurs"
        }
    },
    // PARADOXE PHARMACOLOGIQUE MAJEUR - Levamisole
    levamisole_paradox: {
        therapeutic_use: {
            indication: "Syndrome néphrotique corticosensible à rechutes",
            dose: "2-2.5 mg/kg, 2x/semaine",
            efficacy: "Réduit rechutes de 2.7 à 1.8/an (p=0.02), recommandé KDIGO niveau 1b",
            mechanism_beneficial: "Restaure lymphocytes T anormaux, augmente rosettes-E de 33.5% à 69.3%",
            safety: "Traitement le moins toxique et le moins coûteux",
            side_effects: "Leucopénie réversible 1-2%, rarement toxicité hépatique, convulsions"
        },
        toxic_use_with_cocaine: {
            mechanism_pathologic: "Effet synergique cocaïne + lévamisole → glomérulonéphrite pauci-immune",
            autoantibodies: "ANCA atypiques anti-élastase neutrophile, anti-lactoferrine, anti-cathepsine G",
            clinical_signs: "Purpura rétiforme oreilles/visage, neutropénie, vascularite leucocytoclastique",
            kidney_damage: "Glomérulonéphrite crescentique pauci-immune (40-100% glomérules atteints)"
        },
        therapeutic_window_hypothesis: {
            beneficial_conditions: "Doses faibles + administration régulière + surveillance = immunomodulation bénéfique (Tregs↑)",
            toxic_conditions: "Doses variables + exposition intermittente + cocaïne = dérégulation immune (auto-anticorps)",
            context_dependent: "Enfant avec SN dérégulé → lévamisole RÉTABLIT | Adulte sain + cocaïne → lévamisole CRÉE déséquilibre"
        },
        research_questions: [
            "À quelle dose/fréquence le lévamisole passe-t-il de bénéfique à toxique?",
            "Quels biomarqueurs prédisent une réponse pathologique?",
            "Variants génétiques protecteurs ou à risque (HLA-B27)?",
            "Pourquoi restaure-t-il l'équilibre dans SN mais induit auto-anticorps avec cocaïne?"
        ],
        surveillance_pediatric: ["Numération leucocytaire régulière", "Attention lésions cutanées oreilles/visage", "Surveillance ANCA dans traitements prolongés"]
    },
    environmental_factors: {
        phtalates: "Perturbent récepteurs glucocorticoïdes → résistance stéroïdes",
        microplastics: "Accumulation rénale, toxicité podocytaire potentielle",
        pollution_PM25: "Corrélation hospitalisations 48h post-épisode"
    },
    prognosis: {
        evolution: "Beaucoup d'enfants 'sèvrent' la maladie à l'adolescence/âge adulte",
        recurrence_post_transplant: "20-50% formes idiopathiques vs 0% formes génétiques"
    }
};


// Helper to create edge if not exists
async function createEdgeIfNotExists(
    supabase: any,
    sourceNodeId: string,
    targetNodeId: string,
    relationshipType: string,
    provenance: string,
    context: Record<string, any> = {}
): Promise<boolean> {
    try {
        // Check if edge already exists
        const { data: existing } = await supabase
            .from('cde_edges')
            .select('id')
            .eq('source_node_id', sourceNodeId)
            .eq('target_node_id', targetNodeId)
            .eq('relationship_type', relationshipType)
            .maybeSingle();

        if (existing) {
            return false; // Already exists
        }

        // Create new edge
        const { error } = await supabase
            .from('cde_edges')
            .insert({
                source_node_id: sourceNodeId,
                target_node_id: targetNodeId,
                relationship_type: relationshipType,
                provenance: provenance,
                confidence_score: context.confidence || 0.8,
                context: context
            });

        if (error) {
            console.error('Error creating edge:', error);
            return false;
        }

        console.log(`Created edge: ${relationshipType} between ${sourceNodeId} and ${targetNodeId}`);
        return true;
    } catch (e) {
        console.error('Edge creation error:', e);
        return false;
    }
}

// Find or create node by name
async function findOrCreateNode(
    supabase: any,
    name: string,
    nodeType: string,
    properties: Record<string, any> = {}
): Promise<string | null> {
    try {
        // Try to find existing node
        const { data: existing } = await supabase
            .from('cde_nodes')
            .select('id')
            .ilike('name', name)
            .eq('node_type', nodeType)
            .maybeSingle();

        if (existing) {
            return existing.id;
        }

        // Create new node
        const { data: newNode, error } = await supabase
            .from('cde_nodes')
            .insert({
                name: name,
                node_type: nodeType,
                properties: properties
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error creating node:', error);
            return null;
        }

        console.log(`Created node: ${name} (${nodeType})`);
        return newNode.id;
    } catch (e) {
        console.error('Node creation error:', e);
        return null;
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { targetType, targetId, targetName, customPrompt } = await req.json();

        if (!targetName) {
            throw new Error("Target name is required");
        }

        console.log(`Focused Research started for: ${targetType} - ${targetName}`);
        console.log(`Custom prompt: ${customPrompt || 'none'}`);

        // Get user from auth header
        const authHeader = req.headers.get('Authorization');
        let userId: string | null = null;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id || null;
        }

        // Create research session in database
        let sessionId: string | null = null;
        if (userId) {
            const { data: sessionData } = await supabase
                .from('focused_research_sessions')
                .insert({
                    user_id: userId,
                    target_type: targetType || 'pathology',
                    target_id: targetId || null,
                    target_name: targetName,
                    status: 'running',
                    custom_prompt: customPrompt || null,
                })
                .select('id')
                .single();

            if (sessionData) {
                sessionId = sessionData.id;
                console.log(`Created research session: ${sessionId}`);
            }
        }

        const encoder = new TextEncoder();

        // Helper to send SSE events
        const sendEvent = (controller: ReadableStreamDefaultController, event: StreamEvent) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        // Variables to track results for session update
        let collectedDiscoveries: any[] = [];
        let collectedJourneySteps: any[] = [];
        let simpleExplanationText = '';
        let kgNodesCount = 0;
        let kgEdgesCount = 0;
        let pubmedCount = 0;

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // ============================================
                    // STEP 1: Knowledge Graph Exploration
                    // ============================================
                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 1, status: 'running', details: 'Chargement massif des nœuds...' }
                    });

                    // Get KG statistics first
                    const { count: totalNodes } = await supabase
                        .from('cde_nodes')
                        .select('*', { count: 'exact', head: true });

                    const { count: totalEdges } = await supabase
                        .from('cde_edges')
                        .select('*', { count: 'exact', head: true });

                    // MASSIVE NODE LOADING - Load ALL node types for comprehensive analysis
                    // Strategy 1: Direct name match (increased limit)
                    const { data: directMatches } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type, properties')
                        .ilike('name', `%${targetName}%`)
                        .limit(500);

                    // Strategy 2: Search in pathologies table
                    const { data: pathologyMatches } = await supabase
                        .from('pathologies')
                        .select('id, name, name_fr, icd_code, description')
                        .or(`name.ilike.%${targetName}%,name_fr.ilike.%${targetName}%,description.ilike.%${targetName}%`)
                        .limit(200);

                    // Strategy 3: Search in medications table
                    const { data: medicationMatches } = await supabase
                        .from('medications')
                        .select('id, name, substance, therapeutic_class, indications')
                        .or(`name.ilike.%${targetName}%,substance.ilike.%${targetName}%`)
                        .limit(300);

                    // Strategy 4: Search in substances table
                    const { data: substanceMatches } = await supabase
                        .from('substances')
                        .select('id, name, atc_code, mechanism_of_action, half_life, metabolism')
                        .or(`name.ilike.%${targetName}%,mechanism_of_action.ilike.%${targetName}%`)
                        .limit(300);

                    // Strategy 5: LOAD ALL NODE TYPES for cross-analysis
                    // Get ALL substances (most important for drug analysis)
                    const { data: allSubstanceNodes } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type, properties')
                        .eq('node_type', 'substance')
                        .limit(3000);

                    // Get ALL medications
                    const { data: allMedicationNodes } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type, properties')
                        .eq('node_type', 'medication')
                        .limit(2000);

                    // Get pathologies
                    const { data: allPathologyNodes } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type, properties')
                        .eq('node_type', 'pathology')
                        .limit(5000);

                    // Get symptoms
                    const { data: allSymptomNodes } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type, properties')
                        .eq('node_type', 'symptom')
                        .limit(1000);

                    // Get treatments
                    const { data: allTreatmentNodes } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type, properties')
                        .eq('node_type', 'treatment')
                        .limit(1000);

                    // Combine ALL nodes for comprehensive analysis
                    const allNodes = [
                        ...(directMatches || []),
                        ...(allSubstanceNodes || []),
                        ...(allMedicationNodes || []),
                        ...(allPathologyNodes || []),
                        ...(allSymptomNodes || []),
                        ...(allTreatmentNodes || [])
                    ];

                    // Deduplicate
                    const relatedNodes = allNodes
                        .filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i);
                    kgNodesCount = relatedNodes.length;

                    // Get all edges for found nodes
                    const nodeIds = relatedNodes.map(n => n.id);
                    let relatedEdges: any[] = [];
                    if (nodeIds.length > 0) {
                        const { data: edges } = await supabase
                            .from('cde_edges')
                            .select('*, source:cde_nodes!source_node_id(name, node_type), target:cde_nodes!target_node_id(name, node_type)')
                            .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`)
                            .limit(500);
                        relatedEdges = edges || [];
                    }
                    kgEdgesCount = relatedEdges.length;

                    // Get target-specific data from source tables
                    let targetData: any = null;
                    let relatedMedications: any[] = [];
                    let relatedSubstances: any[] = [];
                    let relatedTreatments: any[] = [];
                    let knownInteractions: any[] = [];

                    if (targetType === 'pathology') {
                        // Get pathology details with symptoms and treatments
                        if (targetId) {
                            const { data } = await supabase
                                .from('pathologies')
                                .select('*, pathology_symptoms(symptom_id, symptoms(name)), pathology_treatments(treatment_id, treatments(name))')
                                .eq('id', targetId)
                                .single();
                            targetData = data;
                        } else if (pathologyMatches && pathologyMatches.length > 0) {
                            const { data } = await supabase
                                .from('pathologies')
                                .select('*, pathology_symptoms(symptom_id, symptoms(name)), pathology_treatments(treatment_id, treatments(name))')
                                .eq('id', pathologyMatches[0].id)
                                .single();
                            targetData = data;
                        }

                        // CRITICAL: Get ALL treatments from the database
                        const { data: allTreatments } = await supabase
                            .from('treatments')
                            .select('id, name, description, treatment_type')
                            .limit(500);
                        relatedTreatments = allTreatments || [];

                        // Get ALL medications with their substances
                        const { data: allMedications } = await supabase
                            .from('medications')
                            .select('id, name, substance, therapeutic_class, indications')
                            .limit(500);
                        relatedMedications = allMedications || [];

                        // Get ALL substances with mechanisms
                        const { data: allSubstances } = await supabase
                            .from('substances')
                            .select('id, name, atc_code, mechanism_of_action, half_life, metabolism')
                            .limit(500);
                        relatedSubstances = allSubstances || [];

                        // Get ALL known drug interactions
                        const { data: allInteractions } = await supabase
                            .from('drug_interactions')
                            .select('id, medication_id, interacting_substance, severity, mechanism, clinical_effect, description')
                            .limit(1000);
                        knownInteractions = allInteractions || [];

                        // Search for specific drugs commonly used for the target pathology
                        const commonDrugsForPathology: Record<string, string[]> = {
                            'nephrotique': ['prednisolone', 'prednisone', 'ciclosporine', 'tacrolimus', 'rituximab', 'mycophenolate', 'enalapril', 'losartan', 'furosemide', 'albumine', 'heparine', 'warfarine'],
                            'nephrotic': ['prednisolone', 'prednisone', 'cyclosporine', 'tacrolimus', 'rituximab', 'mycophenolate', 'enalapril', 'losartan', 'furosemide', 'albumin', 'heparin', 'warfarin'],
                            'diabète': ['metformine', 'insuline', 'glibenclamide', 'sitagliptine', 'empagliflozine', 'liraglutide'],
                            'hypertension': ['amlodipine', 'lisinopril', 'losartan', 'hydrochlorothiazide', 'atenolol'],
                        };

                        const targetLower = targetName.toLowerCase();
                        let specificDrugs: string[] = [];
                        for (const [key, drugs] of Object.entries(commonDrugsForPathology)) {
                            if (targetLower.includes(key)) {
                                specificDrugs = drugs;
                                break;
                            }
                        }

                        if (specificDrugs.length > 0) {
                            const { data: specificMeds } = await supabase
                                .from('medications')
                                .select('*')
                                .or(specificDrugs.map(d => `name.ilike.%${d}%`).join(','));
                            if (specificMeds) {
                                relatedMedications = [...specificMeds, ...relatedMedications.filter((m: any) => !specificMeds.find((sm: any) => sm.id === m.id))];
                            }
                        }
                    } else if (targetType === 'medication' || targetType === 'substance') {
                        if (targetId) {
                            const { data } = await supabase
                                .from('medications')
                                .select('*, drug_interactions(*)')
                                .eq('id', targetId)
                                .single();
                            targetData = data;
                        } else if (medicationMatches && medicationMatches.length > 0) {
                            const { data } = await supabase
                                .from('medications')
                                .select('*, drug_interactions(*)')
                                .eq('id', medicationMatches[0].id)
                                .single();
                            targetData = data;
                        }
                    }

                    sendEvent(controller, {
                        type: 'step_update',
                        step: {
                            id: 1,
                            status: 'completed',
                            details: `${relatedNodes?.length || 0} nœuds, ${relatedEdges.length} arêtes existantes`
                        }
                    });

                    // ============================================
                    // STEP 1.5: AUTO-CREATE EDGES (Build the KG)
                    // ============================================
                    let edgesCreated = 0;
                    const targetLower = targetName.toLowerCase();

                    // Find or create the target node first
                    let targetNodeId: string | null = null;
                    const { data: existingTargetNode } = await supabase
                        .from('cde_nodes')
                        .select('id')
                        .ilike('name', `%${targetName}%`)
                        .maybeSingle();

                    if (existingTargetNode) {
                        targetNodeId = existingTargetNode.id;
                    } else {
                        targetNodeId = await findOrCreateNode(supabase, targetName, targetType || 'pathology', {
                            source: 'focused_research',
                            created_at: new Date().toISOString()
                        });
                    }

                    if (targetNodeId) {
                        // Search for matching medical knowledge
                        let knowledgeKey: string | null = null;
                        for (const key of Object.keys(MEDICAL_KNOWLEDGE)) {
                            if (targetLower.includes(key) || key.includes(targetLower)) {
                                knowledgeKey = key;
                                break;
                            }
                        }

                        if (knowledgeKey) {
                            const knowledge = MEDICAL_KNOWLEDGE[knowledgeKey];
                            console.log(`Found medical knowledge for ${knowledgeKey}: ${knowledge.treatments.length} treatments, ${knowledge.contraindications.length} contraindications`);

                            // Create edges for TREATMENTS
                            for (const treatment of knowledge.treatments) {
                                // Find drug in database
                                const { data: drugNodes } = await supabase
                                    .from('cde_nodes')
                                    .select('id, name')
                                    .or(`name.ilike.%${treatment}%,node_type.eq.substance,node_type.eq.medication`)
                                    .ilike('name', `%${treatment}%`)
                                    .limit(1);

                                if (drugNodes && drugNodes.length > 0) {
                                    const created = await createEdgeIfNotExists(
                                        supabase,
                                        targetNodeId,
                                        drugNodes[0].id,
                                        'TREATED_WITH',
                                        'focused_research_medical_knowledge',
                                        { drug_name: drugNodes[0].name, pathology: targetName, confidence: 0.9 }
                                    );
                                    if (created) edgesCreated++;
                                } else {
                                    // Create the drug node and edge
                                    const newDrugId = await findOrCreateNode(supabase, treatment, 'substance', {
                                        source: 'medical_knowledge',
                                        usage: 'treatment'
                                    });
                                    if (newDrugId) {
                                        const created = await createEdgeIfNotExists(
                                            supabase,
                                            targetNodeId,
                                            newDrugId,
                                            'TREATED_WITH',
                                            'focused_research_medical_knowledge',
                                            { drug_name: treatment, pathology: targetName, confidence: 0.85 }
                                        );
                                        if (created) edgesCreated++;
                                    }
                                }
                            }

                            // Create edges for CONTRAINDICATIONS
                            for (const contraindication of knowledge.contraindications) {
                                const { data: drugNodes } = await supabase
                                    .from('cde_nodes')
                                    .select('id, name')
                                    .ilike('name', `%${contraindication}%`)
                                    .limit(1);

                                if (drugNodes && drugNodes.length > 0) {
                                    const created = await createEdgeIfNotExists(
                                        supabase,
                                        targetNodeId,
                                        drugNodes[0].id,
                                        'CONTRAINDICATED_WITH',
                                        'focused_research_medical_knowledge',
                                        { drug_name: drugNodes[0].name, pathology: targetName, severity: 'high', confidence: 0.9 }
                                    );
                                    if (created) edgesCreated++;
                                } else {
                                    const newDrugId = await findOrCreateNode(supabase, contraindication, 'substance', {
                                        source: 'medical_knowledge',
                                        usage: 'contraindication'
                                    });
                                    if (newDrugId) {
                                        const created = await createEdgeIfNotExists(
                                            supabase,
                                            targetNodeId,
                                            newDrugId,
                                            'CONTRAINDICATED_WITH',
                                            'focused_research_medical_knowledge',
                                            { drug_name: contraindication, pathology: targetName, severity: 'high', confidence: 0.85 }
                                        );
                                        if (created) edgesCreated++;
                                    }
                                }
                            }

                            // Create edges for COMORBIDITIES
                            for (const comorbidity of knowledge.comorbidities) {
                                const { data: pathologyNodes } = await supabase
                                    .from('cde_nodes')
                                    .select('id, name')
                                    .ilike('name', `%${comorbidity}%`)
                                    .eq('node_type', 'pathology')
                                    .limit(1);

                                if (pathologyNodes && pathologyNodes.length > 0) {
                                    const created = await createEdgeIfNotExists(
                                        supabase,
                                        targetNodeId,
                                        pathologyNodes[0].id,
                                        'ASSOCIATED_WITH',
                                        'focused_research_medical_knowledge',
                                        { comorbidity: pathologyNodes[0].name, confidence: 0.8 }
                                    );
                                    if (created) edgesCreated++;
                                }
                            }
                        }

                        // Also create edges from loaded treatments/medications
                        for (const med of relatedMedications.slice(0, 20)) {
                            const { data: medNode } = await supabase
                                .from('cde_nodes')
                                .select('id')
                                .ilike('name', med.name)
                                .maybeSingle();

                            if (medNode) {
                                await createEdgeIfNotExists(
                                    supabase,
                                    targetNodeId,
                                    medNode.id,
                                    'MAY_BE_TREATED_WITH',
                                    'database_relation',
                                    { medication: med.name, confidence: 0.6 }
                                );
                            }
                        }
                    }

                    if (edgesCreated > 0) {
                        sendEvent(controller, {
                            type: 'text',
                            content: `\n\n🔗 **${edgesCreated} nouvelles arêtes créées** dans le Knowledge Graph!\n\n`
                        });
                    }

                    // ============================================
                    // STEP 2: PubMed Search
                    // ============================================
                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 2, status: 'running', details: 'Recherche PubMed en cours...' }
                    });

                    // Build specialized PubMed queries
                    const englishTargetName = await translateQuery(targetName);
                    console.log(`Translated "${targetName}" to "${englishTargetName}" for PubMed`);

                    // Create wildcard versions for broad "contains" search (prefix expansion)
                    // We remove quotes to allow PubMed Automatic Term Mapping (ATM)
                    // We add * to allow prefix matching (e.g. "nephr" -> "nephrotic")

                    const termClause = `(${targetName} OR "${targetName}" OR ${targetName}* OR ${englishTargetName} OR "${englishTargetName}" OR ${englishTargetName}*)`;

                    const pubmedQueries = [
                        `${termClause} AND (drug interaction OR mechanism OR treatment OR therapy) AND 2023:2024[dp]`,
                        `${termClause} AND (novel OR emerging OR discovery OR breakthrough) AND 2022:2024[dp]`,
                        `${termClause} AND (adverse effect OR side effect OR toxicity OR contraindication)`
                    ];

                    // Get NCBI API Key
                    const ncbiApiKey = Deno.env.get("NCBI_API_KEY");

                    let allPubmedSources: any[] = [];
                    for (const query of pubmedQueries) {
                        const sources = await searchPubMed(query, 5, ncbiApiKey);
                        allPubmedSources = [...allPubmedSources, ...sources];
                    }

                    // Deduplicate
                    const seenUrls = new Set();
                    allPubmedSources = allPubmedSources.filter(s => {
                        if (seenUrls.has(s.url)) return false;
                        seenUrls.add(s.url);
                        return true;
                    });
                    pubmedCount = allPubmedSources.length;

                    sendEvent(controller, {
                        type: 'step_update',
                        step: {
                            id: 2,
                            status: 'completed',
                            details: `${allPubmedSources.length} articles PubMed trouvés`
                        }
                    });

                    // ============================================
                    // STEP 3: AI Deep Analysis
                    // ============================================
                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 3, status: 'running', details: 'Analyse IA en cours...' }
                    });

                    // Build context for Claude with ALL available data
                    const medicationsList = relatedMedications.slice(0, 100).map((m: any) =>
                        `- **${m.name}** (${m.substance || 'N/A'}) - Classe: ${m.therapeutic_class || 'N/A'}`
                    ).join('\n') || 'Aucun médicament chargé';

                    const substancesList = relatedSubstances.slice(0, 100).map((s: any) =>
                        `- **${s.name}** (ATC: ${s.atc_code || 'N/A'}) - Mécanisme: ${s.mechanism_of_action?.slice(0, 60) || 'N/A'} - T½: ${s.half_life || 'N/A'}`
                    ).join('\n') || 'Aucune substance chargée';

                    const treatmentsList = relatedTreatments.slice(0, 50).map((t: any) =>
                        `- **${t.name}** (${t.treatment_type || 'N/A'}) - ${t.description?.slice(0, 80) || ''}`
                    ).join('\n') || 'Aucun traitement chargé';

                    const interactionsList = knownInteractions.slice(0, 50).map((i: any) =>
                        `- ${i.interacting_substance || 'N/A'} (Sévérité: ${i.severity || '?'}) - ${i.clinical_effect?.slice(0, 60) || i.description?.slice(0, 60) || ''}`
                    ).join('\n') || 'Aucune interaction connue';

                    const kgContext = `
## KNOWLEDGE GRAPH - CIBLE: ${targetName} (${targetType})

### STATISTIQUES DE LA BASE DE DONNÉES
- **TOTAL NŒUDS dans la BDD**: ${totalNodes || 0}
- **Nœuds chargés pour analyse**: ${relatedNodes?.length || 0}
- **Arêtes existantes**: ${relatedEdges.length}
- **Médicaments disponibles**: ${relatedMedications.length}
- **Substances documentées**: ${relatedSubstances.length}
- **Traitements enregistrés**: ${relatedTreatments.length}
- **Interactions connues**: ${knownInteractions.length}
- **ARÊTES CRÉÉES PENDANT CETTE RECHERCHE**: ${edgesCreated}

### Données de la cible:
${targetData ? JSON.stringify(targetData, null, 2) : 'Pas de données spécifiques dans la table source'}

### BASE DE DONNÉES MÉDICALE COMPLÈTE

#### MÉDICAMENTS DISPONIBLES (${relatedMedications.length}):
${medicationsList}

#### SUBSTANCES/PRINCIPES ACTIFS (${relatedSubstances.length}):
${substancesList}

#### TRAITEMENTS (${relatedTreatments.length}):
${treatmentsList}

#### INTERACTIONS MÉDICAMENTEUSES CONNUES (${knownInteractions.length}):
${interactionsList}

### Nœuds liés du Knowledge Graph (échantillon de ${relatedNodes?.length || 0}):
${relatedNodes?.slice(0, 30).map(n =>
                        `- [${n.node_type}] ${n.name}`
                    ).join('\n') || 'Aucun nœud trouvé directement lié'}

### Relations/Arêtes existantes dans le graphe (${relatedEdges.length}):
${relatedEdges.slice(0, 20).map(e =>
                        `- ${(e.source as any)?.name || '?'} --[${e.relationship_type}]--> ${(e.target as any)?.name || '?'}`
                    ).join('\n') || 'Aucune arête existante - les premières ont été créées pendant cette recherche!'}

### Articles PubMed récents:
${allPubmedSources.slice(0, 10).map(s =>
                        `- "${s.title}" (${s.year}) - ${s.journal}`
                    ).join('\n') || 'Aucun article trouvé'}

${targetLower.includes('néphrotique') || targetLower.includes('nephrotic') ? `
### ⚠️ CONNAISSANCES APPROFONDIES SYNDROME NÉPHROTIQUE (UTILISE CES DONNÉES!)

#### PHYSIOPATHOLOGIE DÉTAILLÉE:
- Mécanisme: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.pathophysiology.primary_mechanism}
- Protéines clés: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.pathophysiology.key_proteins.join(', ')}
- Autoanticorps: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.pathophysiology.autoantibodies.join(', ')}
- Facteurs circulants: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.pathophysiology.circulating_factors.join(', ')}
- Mutations génétiques: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.pathophysiology.genetic_mutations.join(', ')}

#### THÉRAPIES INNOVANTES À EXPLORER:
1. **CAR-T anti-CD19**: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.innovative_therapies.CAR_T_anti_CD19.description}
   - Évidence: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.innovative_therapies.CAR_T_anti_CD19.evidence}
   - Potentiel: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.innovative_therapies.CAR_T_anti_CD19.potential}

2. **Inhibiteurs TRPC5**: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.innovative_therapies.TRPC5_inhibitors.mechanism}

3. **ACTH/Acthar gel**: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.innovative_therapies.ACTH_gel.mechanism}

4. **Sparsentan**: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.innovative_therapies.sparsentan.mechanism} - ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.innovative_therapies.sparsentan.status}

#### PISTES DE RECHERCHE PROMETTEUSES:
- Anticorps anti-néphrine: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.research_directions.anti_nephrin_therapy}
- Microbiome: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.research_directions.microbiome}
- Chronothérapie: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.research_directions.chronotherapy}
- Thérapie génique: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.research_directions.gene_therapy}
- Cellules souches: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.research_directions.stem_cells}

#### ⚠️ INTERACTIONS CRITIQUES:
- Curcumine + Ciclosporine: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.drug_interactions_critical.curcumine_ciclosporine.risk}
- Pamplemousse: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.drug_interactions_critical.pamplemousse.risk}

#### FACTEURS ENVIRONNEMENTAUX:
- Phtalates: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.environmental_factors.phtalates}
- Microplastiques: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.environmental_factors.microplastics}

#### 🔬 PARADOXE PHARMACOLOGIQUE MAJEUR - LÉVAMISOLE:
**Usage thérapeutique (bénéfique):**
- Indication: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.therapeutic_use.indication}
- Dose: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.therapeutic_use.dose}
- Efficacité: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.therapeutic_use.efficacy}
- Mécanisme bénéfique: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.therapeutic_use.mechanism_beneficial}

**Usage toxique (avec cocaïne):**
- Mécanisme pathologique: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.toxic_use_with_cocaine.mechanism_pathologic}
- Auto-anticorps: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.toxic_use_with_cocaine.autoantibodies}
- Dommages rénaux: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.toxic_use_with_cocaine.kidney_damage}

**Hypothèse de la fenêtre thérapeutique:**
- Conditions bénéfiques: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.therapeutic_window_hypothesis.beneficial_conditions}
- Conditions toxiques: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.therapeutic_window_hypothesis.toxic_conditions}
- Dépendance au contexte: ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.therapeutic_window_hypothesis.context_dependent}

**Questions de recherche non résolues:**
${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.levamisole_paradox.research_questions.map((q: string) => `- ${q}`).join('\n')}

#### PRONOSTIC:
- ${NEPHROTIC_SYNDROME_DEEP_KNOWLEDGE.prognosis.evolution}
` : ''}

### INSTRUCTIONS CRITIQUES POUR L'ANALYSE:
1. UTILISE les médicaments ET LES THÉRAPIES INNOVANTES listées ci-dessus
2. EXPLORE les pistes de recherche prometteuses (CAR-T, TRPC5, microbiome, chronothérapie)
3. IDENTIFIE les combinaisons HORS DES SENTIERS BATTUS
4. CHERCHE des synergies entre immunosuppresseurs classiques et approches innovantes
5. PROPOSE des approches thérapeutiques RÉVOLUTIONNAIRES basées sur les mécanismes moléculaires
6. PENSE aux thérapies cellulaires (CAR-T) et à la médecine de précision
7. CONSIDÈRE les facteurs environnementaux et épigénétiques
8. VISE LA GUÉRISON, pas seulement la rémission
`;

                    const systemPrompt = `Tu es un chercheur médical de calibre Nobel spécialisé dans la découverte de relations médicales inédites. Tu analyses "${targetName}" (${targetType}).

## MÉTHODOLOGIE DE RECHERCHE (4 PHASES OBLIGATOIRES)

### PHASE 1 - COLLECTE EXHAUSTIVE (à afficher)
Rassemble et structure TOUT ce qu'on sait sur "${targetName}":
- Mécanismes physiopathologiques / mécanismes d'action
- Voies métaboliques impliquées (CYP450, transporteurs, récepteurs)
- Interactions connues (médicaments, aliments, comorbidités)
- Populations à risque
- Évolution épidémiologique récente
- Traitements actuels et émergents

### PHASE 2 - IDENTIFICATION DES GAPS CRITIQUES (à afficher)
Identifie les MANQUES dans les connaissances actuelles:
- Quelles données sont absentes du Knowledge Graph ?
- Quelles interactions ne sont pas documentées ?
- Quels profils de patients sont sous-étudiés ?
- Quels mécanismes restent hypothétiques ?
- Quelles associations pourraient exister mais ne sont pas explorées ?

### PHASE 3 - GÉNÉRATION D'HYPOTHÈSES INNOVANTES (minimum 4)
Pour CHAQUE gap identifié, génère une hypothèse structurée:

**Structure obligatoire:**
- **Titre** : Nom concis de l'hypothèse
- **Raisonnement étape par étape** (minimum 4 étapes):
  1. [Fait A établi] (source: KG/PubMed/mécanisme connu)
  2. [Fait B établi] 
  3. [Connexion logique A+B]
  4. [Conclusion hypothétique]
- **Type** : interaction | contre-indication | synergie | risque_combiné | signal_faible | corrélation_émergente
- **Plausibilité** : 0.0-1.0 avec justification
- **Gravité** : 0.0-1.0 avec justification
- **Nouveauté** : why this is novel/unknown

### PHASE 4 - DÉTECTION DE SIGNAUX FAIBLES
Cherche des corrélations subtiles et inattendues:
- Liens entre voies métaboliques apparemment non liées
- Associations épidémiologiques inexpliquées
- Patterns dans les effets indésirables
- Connexions avec facteurs environnementaux/sociaux
- Synergies ou antagonismes cachés

## CATÉGORIES D'HYPOTHÈSES À EXPLORER

1. **Interactions pharmacocinétiques** : CYP450, transporteurs, protéines de liaison
2. **Interactions pharmacodynamiques** : récepteurs, canaux ioniques, voies de signalisation  
3. **Co-infections/comorbidités** : pathologies associées, risques croisés
4. **Facteurs environnementaux** : pollution, alimentation, mode de vie
5. **Schémas thérapeutiques** : combinaisons optimales, chronothérapie, médecine personnalisée
6. **Émergences** : nouveaux variants, résistances, thérapies innovantes

## ⚠️ FORMAT DE SORTIE CRITIQUE - RESPECTER STRICTEMENT

**RÈGLE ABSOLUE** : Commence DIRECTEMENT par le bloc JSON. Pas d'introduction, pas de préambule.

**STRUCTURE OBLIGATOIRE** (dans cet ordre exact) :

### PARTIE 1 : JSON DES DÉCOUVERTES (OBLIGATOIRE EN PREMIER)
\`\`\`json
{
  "discoveries": [
    {
      "id": "discovery_1",
      "title": "Titre concis et scientifique",
      "hypothesis": "Si [A] + [B], alors [effet] via [mécanisme]",
      "reasoning_chain": ["Étape 1: fait", "Étape 2: fait", "Étape 3: connexion", "Conclusion"],
      "treatment_schema": "Description du schéma de traitement proposé si applicable",
      "novelty": "novel|emerging|controversial",
      "evidence_level": "ai_inferred",
      "severity_score": 0.7,
      "plausibility_score": 0.6,
      "status": "raw_signal",
      "sources": [{"type": "mechanism", "title": "source"}],
      "recommended_actions": ["Action 1", "Action 2"]
    }
  ]
}
\`\`\`

### PARTIE 2 : SYNTHÈSE RAISONNEMENT (10-15 lignes max)
RAISONNEMENT:
- Points clés de l'analyse (bullet points concis)
- Schéma thérapeutique principal proposé
- Gaps critiques identifiés

### PARTIE 3 : EXPLICATION ENFANT (5 phrases max)
EXPLICATION_ENFANT:
[Métaphore simple pour enfant de 10 ans]

## CONTRAINTES IMPÉRATIVES
- ❌ PAS de longues explications narratives
- ❌ PAS de répétition d'informations connues
- ✅ FOCUS sur hypothèses originales et schémas de traitement
- ✅ JSON COMPLET avec minimum 4 découvertes
- ✅ CONCIS : privilégie la densité d'information`;

                    const userPrompt = `## RECHERCHE CIBLÉE: ${targetName} (${targetType})

${kgContext}

---

${customPrompt ? `## DEMANDE SPÉCIFIQUE (PRIORITÉ #1):
${customPrompt}

Réponds à cette demande en intégrant ta réponse dans les découvertes JSON.
` : ''}

## INSTRUCTIONS CONCISES

⚠️ **COMMENCE IMMÉDIATEMENT par le bloc JSON** avec tes 4-6 découvertes.

Après le JSON, ajoute uniquement:
1. RAISONNEMENT (10-15 lignes max - bullet points)
2. EXPLICATION_ENFANT (5 phrases max)

**FOCUS**: Schémas de traitement, hypothèses originales, mécanismes clés.
**ÉVITE**: Longues explications, répétitions, préambules.

Commence par le JSON maintenant.`;


                    // Call AI with streaming (handles Anthropic -> Gemini fallback)
                    let fullText = "";
                    await streamAI(
                        systemPrompt,
                        userPrompt,
                        (text) => {
                            fullText += text;
                            sendEvent(controller, { type: 'text', content: text });
                        },
                        {
                            model: "claude-3-5-sonnet-20240620",
                            maxTokens: 32000,
                        }
                    );

                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 3, status: 'completed', details: 'Analyse terminée' }
                    });

                    // ============================================
                    // STEP 4: Parse and send discoveries
                    // ============================================
                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 4, status: 'running', details: 'Extraction des découvertes...' }
                    });

                    // Parse JSON discoveries with robust error handling
                    const extractDiscoveries = (text: string) => {
                        // Strategy 1: Try standard markdown code block
                        let jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
                        if (jsonMatch) {
                            return jsonMatch[1];
                        }

                        // Strategy 2: Try finding raw JSON object
                        const jsonStart = text.lastIndexOf('{"discoveries"');
                        if (jsonStart !== -1) {
                            let depth = 0;
                            let inString = false;
                            let escape = false;
                            for (let i = jsonStart; i < text.length; i++) {
                                const char = text[i];
                                if (escape) {
                                    escape = false;
                                    continue;
                                }
                                if (char === '\\') {
                                    escape = true;
                                    continue;
                                }
                                if (char === '"' && !escape) {
                                    inString = !inString;
                                    continue;
                                }
                                if (!inString) {
                                    if (char === '{') depth++;
                                    if (char === '}') {
                                        depth--;
                                        if (depth === 0) {
                                            return text.slice(jsonStart, i + 1);
                                        }
                                    }
                                }
                            }
                        }

                        // Strategy 3: Find any JSON array of discoveries
                        const arrayMatch = text.match(/"discoveries"\s*:\s*\[([\s\S]*?)\]/);
                        if (arrayMatch) {
                            return `{"discoveries": [${arrayMatch[1]}]}`;
                        }

                        // Strategy 4: Extract individual discovery objects when JSON is truncated
                        // This handles cases where the AI output was cut off mid-JSON
                        const discoveryPattern = /\{\s*"id"\s*:\s*"discovery_\d+"[\s\S]*?"title"\s*:\s*"([^"]+)"[\s\S]*?"hypothesis"\s*:\s*"([^"]+)"[\s\S]*?"(?:severity_score|plausibility_score)"\s*:\s*([\d.]+)/g;
                        const partialDiscoveries: any[] = [];
                        let match;

                        while ((match = discoveryPattern.exec(text)) !== null) {
                            // Try to extract a complete discovery object
                            const startIdx = match.index;
                            let braceCount = 0;
                            let endIdx = startIdx;
                            let foundStart = false;

                            for (let i = startIdx; i < text.length; i++) {
                                if (text[i] === '{' && !foundStart) {
                                    foundStart = true;
                                    braceCount = 1;
                                } else if (text[i] === '{') {
                                    braceCount++;
                                } else if (text[i] === '}') {
                                    braceCount--;
                                    if (braceCount === 0) {
                                        endIdx = i + 1;
                                        break;
                                    }
                                }
                            }

                            if (endIdx > startIdx) {
                                const objStr = text.slice(startIdx, endIdx);
                                try {
                                    const cleaned = objStr
                                        .replace(/,\s*([\}\]])/g, '$1')
                                        .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
                                    const obj = JSON.parse(cleaned);
                                    if (obj.title && obj.hypothesis) {
                                        partialDiscoveries.push(obj);
                                    }
                                } catch (e) {
                                    // Try to extract just the essential fields
                                    const titleMatch = objStr.match(/"title"\s*:\s*"([^"]+)"/);
                                    const hypothesisMatch = objStr.match(/"hypothesis"\s*:\s*"([^"]+)"/);
                                    const severityMatch = objStr.match(/"severity_score"\s*:\s*([\d.]+)/);
                                    const plausibilityMatch = objStr.match(/"plausibility_score"\s*:\s*([\d.]+)/);

                                    if (titleMatch && hypothesisMatch) {
                                        partialDiscoveries.push({
                                            title: titleMatch[1],
                                            hypothesis: hypothesisMatch[1],
                                            severity_score: severityMatch ? parseFloat(severityMatch[1]) : 0.5,
                                            plausibility_score: plausibilityMatch ? parseFloat(plausibilityMatch[1]) : 0.5,
                                            novelty: 'emerging',
                                            evidence_level: 'ai_inferred',
                                            reasoning_chain: [],
                                            sources: [],
                                            recommended_actions: []
                                        });
                                    }
                                }
                            }
                        }

                        if (partialDiscoveries.length > 0) {
                            console.log(`Extracted ${partialDiscoveries.length} discoveries from partial JSON`);
                            return JSON.stringify({ discoveries: partialDiscoveries });
                        }

                        return null;
                    };

                    const cleanJsonString = (jsonStr: string) => {
                        let cleaned = jsonStr
                            // Remove trailing commas before } or ]
                            .replace(/,\s*([\}\]])/g, '$1')
                            // Fix merged objects like: "title": "...autype": "clinical" -> proper separation
                            .replace(/"([^"]+)au(type|source|clinical|mechanism|pubmed)":\s*"/g, '"$1"}, {"$2": "')
                            // Fix missing commas between array elements
                            .replace(/\}\s*\{/g, '}, {')
                            // Fix missing opening brace for id fields
                            .replace(/,\s*"id":\s*"discovery_/g, ', {"id": "discovery_')
                            // Remove unquoted keys
                            .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
                            // Remove comments
                            .replace(/\/\/[^\n]*/g, '')
                            // Fix truncated strings by closing them
                            .replace(/"([^"]*)\n\s*\]/g, '"$1"]')
                            // Fix common score format issues
                            .replace(/"(severity_score|plausibility_score|confidence_score)"\s*:\s*"?([0-9.]+)"?-[0-9.]+/g, '"$1": $2')
                            // Remove incomplete trailing arrays/objects
                            .replace(/,\s*"[^"]*":\s*\[\s*$/g, '')
                            .replace(/,\s*"[^"]*":\s*$/g, '')
                            // Fix missing closing brackets for sources arrays
                            .replace(/"sources":\s*\[\s*\{[^\]]*?\}\s*(?=[,\}])/g, (match) => {
                                if (!match.endsWith(']')) return match + ']';
                                return match;
                            })
                            // Fix missing closing brackets for recommended_actions
                            .replace(/"recommended_actions":\s*\[\s*"[^\]]*?"\s*(?=[,\}])/g, (match) => {
                                if (!match.endsWith(']')) return match + ']';
                                return match;
                            });

                        // Aggressive bracket balancing for discoveries array
                        try {
                            // Try to find and extract individual discovery objects
                            const discPattern = /"id"\s*:\s*"discovery_\d+"/g;
                            const matches = [...cleaned.matchAll(discPattern)];

                            if (matches.length > 0) {
                                const extractedDiscoveries: any[] = [];

                                for (let i = 0; i < matches.length; i++) {
                                    const startIdx = cleaned.lastIndexOf('{', matches[i].index!);
                                    const endMatch = i < matches.length - 1 ? matches[i + 1].index! : cleaned.length;
                                    let endIdx = cleaned.lastIndexOf('}', endMatch);

                                    if (startIdx >= 0 && endIdx > startIdx) {
                                        let objStr = cleaned.slice(startIdx, endIdx + 1);

                                        // Balance brackets within this object
                                        let openBraces = (objStr.match(/\{/g) || []).length;
                                        let closeBraces = (objStr.match(/\}/g) || []).length;
                                        let openBrackets = (objStr.match(/\[/g) || []).length;
                                        let closeBrackets = (objStr.match(/\]/g) || []).length;

                                        // Add missing closing brackets
                                        while (openBrackets > closeBrackets) {
                                            objStr += ']';
                                            closeBrackets++;
                                        }
                                        while (openBraces > closeBraces) {
                                            objStr += '}';
                                            closeBraces++;
                                        }

                                        try {
                                            const parsed = JSON.parse(objStr);
                                            if (parsed.title && parsed.hypothesis) {
                                                extractedDiscoveries.push(parsed);
                                            }
                                        } catch (e) {
                                            // Try more aggressive cleaning
                                            const title = objStr.match(/"title"\s*:\s*"([^"]+)"/)?.[1];
                                            const hypothesis = objStr.match(/"hypothesis"\s*:\s*"([^"]+)"/)?.[1];
                                            const severity = parseFloat(objStr.match(/"severity_score"\s*:\s*([\d.]+)/)?.[1] || '0.5');
                                            const plausibility = parseFloat(objStr.match(/"plausibility_score"\s*:\s*([\d.]+)/)?.[1] || '0.5');
                                            const treatmentSchema = objStr.match(/"treatment_schema"\s*:\s*"([^"]+)"/)?.[1];
                                            const novelty = objStr.match(/"novelty"\s*:\s*"([^"]+)"/)?.[1] || 'emerging';

                                            // Extract reasoning_chain array
                                            const reasoningChain: string[] = [];
                                            const reasoningMatch = objStr.match(/"reasoning_chain"\s*:\s*\[([\s\S]*?)\]/);
                                            if (reasoningMatch) {
                                                const stepMatches = reasoningMatch[1].matchAll(/"([^"]+)"/g);
                                                for (const match of stepMatches) {
                                                    if (match[1] && match[1].length > 5) {
                                                        reasoningChain.push(match[1]);
                                                    }
                                                }
                                            }

                                            // Extract recommended_actions array
                                            const recommendedActions: string[] = [];
                                            const actionsMatch = objStr.match(/"recommended_actions"\s*:\s*\[([\s\S]*?)\]/);
                                            if (actionsMatch) {
                                                const actionMatches = actionsMatch[1].matchAll(/"([^"]+)"/g);
                                                for (const match of actionMatches) {
                                                    if (match[1] && match[1].length > 5) {
                                                        recommendedActions.push(match[1]);
                                                    }
                                                }
                                            }

                                            if (title && hypothesis) {
                                                extractedDiscoveries.push({
                                                    id: `discovery_${i + 1}`,
                                                    title,
                                                    hypothesis,
                                                    treatment_schema: treatmentSchema || '',
                                                    severity_score: severity,
                                                    plausibility_score: plausibility,
                                                    novelty: novelty,
                                                    evidence_level: 'ai_inferred',
                                                    status: 'raw_signal',
                                                    reasoning_chain: reasoningChain,
                                                    sources: [],
                                                    recommended_actions: recommendedActions
                                                });
                                            }
                                        }
                                    }
                                }

                                if (extractedDiscoveries.length > 0) {
                                    console.log(`Rescued ${extractedDiscoveries.length} discoveries via aggressive parsing`);
                                    return JSON.stringify({ discoveries: extractedDiscoveries });
                                }
                            }
                        } catch (e) {
                            console.error('Aggressive parsing failed:', e);
                        }

                        return cleaned;
                    };

                    const jsonStr = extractDiscoveries(fullText);
                    let discoveriesParsed = 0;

                    if (jsonStr) {
                        try {
                            const cleanedJson = cleanJsonString(jsonStr);
                            const discoveries = JSON.parse(cleanedJson);

                            if (discoveries.discoveries && Array.isArray(discoveries.discoveries)) {
                                for (const discovery of discoveries.discoveries) {
                                    try {
                                        // Validate required fields
                                        if (!discovery.title || !discovery.hypothesis) {
                                            console.warn('Discovery missing required fields:', discovery);
                                            continue;
                                        }

                                        // Parse scores safely
                                        const severityScore = typeof discovery.severity_score === 'number'
                                            ? discovery.severity_score
                                            : parseFloat(String(discovery.severity_score).replace(/[^0-9.]/g, '')) || 0.5;
                                        const plausibilityScore = typeof discovery.plausibility_score === 'number'
                                            ? discovery.plausibility_score
                                            : parseFloat(String(discovery.plausibility_score).replace(/[^0-9.]/g, '')) || 0.5;

                                        // Save to database
                                        const { data: savedCard, error: insertError } = await supabase
                                            .from('discovery_cards')
                                            .insert({
                                                title: String(discovery.title).slice(0, 500),
                                                hypothesis: String(discovery.hypothesis).slice(0, 2000),
                                                reasoning_chain: Array.isArray(discovery.reasoning_chain) ? discovery.reasoning_chain : [],
                                                novelty: discovery.novelty || 'emerging',
                                                evidence_level: discovery.evidence_level || 'ai_inferred',
                                                severity_score: Math.max(0, Math.min(1, severityScore)),
                                                plausibility_score: Math.max(0, Math.min(1, plausibilityScore)),
                                                status: 'raw_signal',
                                                sources: Array.isArray(discovery.sources) && discovery.sources.length > 0
                                                    ? [...discovery.sources, {
                                                        type: 'focused_research',
                                                        target_type: targetType,
                                                        target_id: targetId,
                                                        target_name: targetName,
                                                        title: `Recherche ciblée: ${targetName}`
                                                    }]
                                                    : [{
                                                        type: targetType,
                                                        target_type: targetType,
                                                        target_id: targetId,
                                                        target_name: targetName,
                                                        title: targetName
                                                    }],
                                                recommended_actions: Array.isArray(discovery.recommended_actions) ? discovery.recommended_actions : [],
                                            })
                                            .select()
                                            .single();

                                        if (!insertError && savedCard) {
                                            discoveriesParsed++;
                                            collectedDiscoveries.push(savedCard);
                                            sendEvent(controller, {
                                                type: 'discovery',
                                                discovery: savedCard
                                            });
                                        } else if (insertError) {
                                            console.error('Error saving discovery:', insertError);
                                        }
                                    } catch (discoveryError) {
                                        console.error('Error processing individual discovery:', discoveryError);
                                    }
                                }
                            }
                        } catch (parseError) {
                            console.error("Error parsing discoveries JSON:", parseError);
                            console.error("Attempted to parse:", jsonStr?.slice(0, 500));

                            // Send error event to client
                            sendEvent(controller, {
                                type: 'text',
                                content: `\n\n⚠️ Erreur de parsing JSON. ${discoveriesParsed} découvertes extraites.`
                            });
                        }
                    } else {
                        console.warn("No JSON block found in response");
                    }

                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 4, status: 'completed', details: 'Découvertes extraites' }
                    });

                    // ============================================
                    // STEP 5: Extract simple explanation
                    // ============================================
                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 5, status: 'running', details: 'Génération de l\'explication...' }
                    });

                    // Extract EXPLICATION_ENFANT section
                    const explanationMatch = fullText.match(/EXPLICATION_ENFANT:\s*([\s\S]*?)(?:$|```)/i);
                    if (explanationMatch) {
                        const simpleExplanation = explanationMatch[1].trim();
                        simpleExplanationText = simpleExplanation;
                        sendEvent(controller, {
                            type: 'simple_explanation',
                            content: simpleExplanation
                        });
                    }

                    sendEvent(controller, {
                        type: 'step_update',
                        step: { id: 5, status: 'completed', details: 'Recherche terminée !' }
                    });

                    // Save session results to database
                    if (sessionId) {
                        await supabase
                            .from('focused_research_sessions')
                            .update({
                                status: 'completed',
                                completed_at: new Date().toISOString(),
                                discoveries: collectedDiscoveries,
                                simple_explanation: simpleExplanationText,
                                kg_nodes_analyzed: kgNodesCount,
                                kg_edges_analyzed: kgEdgesCount,
                                pubmed_articles_found: pubmedCount,
                                hypotheses_generated: collectedDiscoveries.length,
                                full_analysis_text: fullText.slice(0, 50000), // Store truncated full analysis
                            })
                            .eq('id', sessionId);

                        console.log(`Updated research session ${sessionId} with ${collectedDiscoveries.length} discoveries`);
                    }

                    sendEvent(controller, { type: 'done' });
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();

                } catch (error) {
                    console.error("Focused research error:", error);

                    // Update session with error status
                    if (sessionId) {
                        await supabase
                            .from('focused_research_sessions')
                            .update({
                                status: 'error',
                                error_message: error instanceof Error ? error.message : 'Unknown error',
                                completed_at: new Date().toISOString(),
                            })
                            .eq('id', sessionId);
                    }

                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'step_update',
                        step: { id: 1, status: 'error', details: error instanceof Error ? error.message : 'Unknown error' }
                    })}\n\n`));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });

    } catch (error) {
        console.error("Focused Research error:", error);
        return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error"
        }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
