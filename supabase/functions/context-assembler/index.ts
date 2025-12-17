import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * CONTEXT ASSEMBLER — The Central Data Aggregation Engine
 * 
 * This is the HEART of the MediMind AI pipeline.
 * It assembles a unified context from:
 * 1. Patient data (demographics, pathologies, medications, labs)
 * 2. Knowledge Graph (causal rules, CYP interactions, contraindications)
 * 3. Scientific literature (PubMed abstracts)
 * 4. Historical decisions (previous analyses, validated hypotheses)
 * 
 * The output is a structured JSON that feeds ALL AI tools.
 */

// ============================================
// TYPES
// ============================================

interface AssemblerRequest {
    patient_id: string;
    include_literature?: boolean;
    literature_query?: string;
    max_pubmed_results?: number;
    include_history?: boolean;
}

interface PatientDemographics {
    id: string;
    first_name: string;
    last_name: string;
    age: number;
    date_of_birth: string;
    gender: string;
    weight_kg?: number;
    height_cm?: number;
    bmi?: number;
}

interface PatientPathology {
    id: string;
    name: string;
    icd_code?: string;
    diagnosed_at?: string;
    severity?: string;
    is_active: boolean;
}

interface PatientMedication {
    id: string;
    name: string;
    atc_code?: string;
    dosage?: string;
    frequency?: string;
    route?: string;
    start_date?: string;
    is_active: boolean;
}

interface LabResult {
    id: string;
    parameter_name: string;
    value: number;
    unit: string;
    reference_min?: number;
    reference_max?: number;
    is_abnormal: boolean;
    measured_at: string;
    trend?: 'stable' | 'increasing' | 'decreasing';
}

interface CausalRule {
    id: string;
    source_type: string;
    source_name: string;
    target_type: string;
    target_name: string;
    relation_type: string;
    strength: string;
    evidence_level: string;
    recommended_action?: string;
    urgency?: string;
    pmid?: string[];
}

interface CYPInteraction {
    enzyme: string;
    clinical_significance: string;
    involved_medications: {
        name: string;
        role: 'substrate' | 'inhibitor' | 'inducer';
        effect_strength?: string;
    }[];
    risk_description: string;
}

interface PopulationFlag {
    factor_type: string;
    applies: boolean;
    modification_type?: string;
    modification_details?: string;
    affected_medications?: string[];
}

interface PubMedArticle {
    pmid: string;
    title: string;
    authors: string;
    journal: string;
    year: string;
    abstract: string;
    relevance_score?: number;
}

interface HistoricalAnalysis {
    id: string;
    created_at: string;
    analysis_type: string;
    summary: string;
    key_findings: string[];
}

interface UnifiedContext {
    // Metadata
    assembled_at: string;
    patient_id: string;
    context_version: string;

    // Patient data
    patient: {
        demographics: PatientDemographics;
        pathologies: PatientPathology[];
        medications: PatientMedication[];
        recent_labs: LabResult[];
        allergies: string[];
        vital_signs?: Record<string, number>;
    };

    // Knowledge Graph insights
    knowledge: {
        applicable_causal_rules: CausalRule[];
        cyp_interactions: CYPInteraction[];
        contraindications: CausalRule[];
        population_flags: PopulationFlag[];
        risk_level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
        urgent_alerts: string[];
    };

    // Literature (optional)
    literature?: {
        query_used: string;
        articles: PubMedArticle[];
        key_evidence_summary?: string;
    };

    // History (optional)
    history?: {
        recent_analyses: HistoricalAnalysis[];
        validated_hypotheses: string[];
        rejected_hypotheses: string[];
    };

    // Prompt template for AI tools
    ai_prompt_context: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateAge(dob: string): number {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function assessRiskLevel(rules: CausalRule[], interactions: CYPInteraction[], flags: PopulationFlag[]): 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' {
    const urgentRules = rules.filter(r => r.urgency === 'IMMEDIATE' || r.urgency === 'URGENT').length;
    const contraindications = rules.filter(r => r.relation_type === 'CONTRE_INDIQUE').length;
    const cypRisks = interactions.length;
    const criticalFlags = flags.filter(f => f.applies && f.modification_type === 'CONTRE_INDICATION').length;

    const riskScore = (urgentRules * 3) + (contraindications * 4) + (cypRisks * 2) + (criticalFlags * 5);

    if (riskScore >= 10 || criticalFlags > 0) return 'CRITICAL';
    if (riskScore >= 5) return 'HIGH';
    if (riskScore >= 2) return 'MODERATE';
    return 'LOW';
}

async function searchPubMed(query: string, maxResults: number = 5): Promise<PubMedArticle[]> {
    try {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return [];

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];
        if (ids.length === 0) return [];

        const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        const fetchRes = await fetch(fetchUrl);
        const xmlText = await fetchRes.text();

        const articles: PubMedArticle[] = [];
        const articleChunks = xmlText.split('</PubmedArticle>');

        for (const chunk of articleChunks) {
            const pmid = chunk.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1];
            const title = chunk.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1];
            const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ").substring(0, 800);
            const journal = chunk.match(/<Title>(.*?)<\/Title>/)?.[1];
            const year = chunk.match(/<Year>(.*?)<\/Year>/)?.[1];
            const authorMatches = [...chunk.matchAll(/<LastName>(.*?)<\/LastName>.*?<Initials>(.*?)<\/Initials>/gs)];
            const authors = authorMatches.slice(0, 3).map(m => `${m[1]} ${m[2]}`).join(", ");

            if (pmid && title) {
                articles.push({
                    pmid,
                    title: title.replace(/<[^>]*>/g, ''),
                    authors: authors || 'Unknown',
                    journal: journal || 'Unknown',
                    year: year || 'Unknown',
                    abstract: abstract || 'No abstract available'
                });
            }
        }

        return articles;
    } catch (e) {
        console.error("PubMed search error:", e);
        return [];
    }
}

function buildAIPromptContext(context: Partial<UnifiedContext>): string {
    const patient = context.patient;
    const knowledge = context.knowledge;

    let prompt = `## Contexte Patient\n\n`;

    if (patient?.demographics) {
        prompt += `**Patient**: ${patient.demographics.first_name} ${patient.demographics.last_name}, ${patient.demographics.age} ans, ${patient.demographics.gender}\n`;
        if (patient.demographics.weight_kg) prompt += `**Poids**: ${patient.demographics.weight_kg} kg\n`;
    }

    if (patient?.pathologies && patient.pathologies.length > 0) {
        prompt += `\n**Pathologies actives**:\n`;
        for (const p of patient.pathologies.filter(p => p.is_active)) {
            prompt += `- ${p.name}${p.icd_code ? ` (${p.icd_code})` : ''}\n`;
        }
    }

    if (patient?.medications && patient.medications.length > 0) {
        prompt += `\n**Traitements en cours**:\n`;
        for (const m of patient.medications.filter(m => m.is_active)) {
            prompt += `- ${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` ${m.frequency}` : ''}\n`;
        }
    }

    if (patient?.recent_labs && patient.recent_labs.length > 0) {
        const abnormalLabs = patient.recent_labs.filter(l => l.is_abnormal);
        if (abnormalLabs.length > 0) {
            prompt += `\n**Résultats de laboratoire anormaux**:\n`;
            for (const l of abnormalLabs) {
                prompt += `- ${l.parameter_name}: ${l.value} ${l.unit} (réf: ${l.reference_min}-${l.reference_max})${l.trend ? ` [${l.trend}]` : ''}\n`;
            }
        }
    }

    if (patient?.allergies && patient.allergies.length > 0) {
        prompt += `\n**Allergies**: ${patient.allergies.join(', ')}\n`;
    }

    if (knowledge) {
        prompt += `\n## Alertes Knowledge Graph\n\n`;
        prompt += `**Niveau de risque**: ${knowledge.risk_level}\n`;

        if (knowledge.urgent_alerts.length > 0) {
            prompt += `\n**⚠️ Alertes urgentes**:\n`;
            for (const alert of knowledge.urgent_alerts) {
                prompt += `- ${alert}\n`;
            }
        }

        if (knowledge.cyp_interactions.length > 0) {
            prompt += `\n**Interactions CYP450**:\n`;
            for (const i of knowledge.cyp_interactions) {
                prompt += `- ${i.enzyme}: ${i.risk_description}\n`;
            }
        }

        if (knowledge.contraindications.length > 0) {
            prompt += `\n**Contre-indications détectées**:\n`;
            for (const c of knowledge.contraindications) {
                prompt += `- ${c.source_name} ↔ ${c.target_name}: ${c.recommended_action || 'Attention requise'}\n`;
            }
        }
    }

    if (context.literature && context.literature.articles.length > 0) {
        prompt += `\n## Littérature Scientifique\n\n`;
        for (const a of context.literature.articles.slice(0, 3)) {
            prompt += `- **PMID ${a.pmid}**: ${a.title} (${a.year})\n`;
        }
    }

    return prompt;
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: AssemblerRequest = await req.json();

        if (!request.patient_id) {
            return new Response(
                JSON.stringify({ error: "patient_id is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const context: Partial<UnifiedContext> = {
            assembled_at: new Date().toISOString(),
            patient_id: request.patient_id,
            context_version: "1.0.0"
        };

        // ============================================
        // 1. FETCH PATIENT DATA
        // ============================================

        // Demographics
        const { data: patientData } = await supabase
            .from('patients')
            .select('*')
            .eq('id', request.patient_id)
            .single();

        if (!patientData) {
            return new Response(
                JSON.stringify({ error: "Patient not found" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const age = patientData.date_of_birth ? calculateAge(patientData.date_of_birth) : 0;
        const bmi = patientData.height_cm && patientData.weight_kg
            ? Math.round((patientData.weight_kg / ((patientData.height_cm / 100) ** 2)) * 10) / 10
            : undefined;

        // Pathologies
        const { data: pathologies } = await supabase
            .from('patient_pathologies')
            .select('*, pathologies(name, icd_code)')
            .eq('patient_id', request.patient_id);

        // Medications
        const { data: medications } = await supabase
            .from('patient_medications')
            .select('*, medications(name, atc_code)')
            .eq('patient_id', request.patient_id);

        // Lab results (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: labResults } = await supabase
            .from('patient_lab_results')
            .select('*')
            .eq('patient_id', request.patient_id)
            .gte('measured_at', thirtyDaysAgo.toISOString())
            .order('measured_at', { ascending: false });

        // Allergies
        const { data: allergies } = await supabase
            .from('patient_allergies')
            .select('allergen_name')
            .eq('patient_id', request.patient_id);

        context.patient = {
            demographics: {
                id: patientData.id,
                first_name: patientData.first_name,
                last_name: patientData.last_name,
                age,
                date_of_birth: patientData.date_of_birth,
                gender: patientData.gender,
                weight_kg: patientData.weight_kg,
                height_cm: patientData.height_cm,
                bmi
            },
            pathologies: (pathologies || []).map(p => ({
                id: p.id,
                name: p.pathologies?.name || p.pathology_name || 'Unknown',
                icd_code: p.pathologies?.icd_code,
                diagnosed_at: p.diagnosed_at,
                severity: p.severity,
                is_active: p.is_active !== false
            })),
            medications: (medications || []).map(m => ({
                id: m.id,
                name: m.medications?.name || m.medication_name || 'Unknown',
                atc_code: m.medications?.atc_code,
                dosage: m.dosage,
                frequency: m.frequency,
                route: m.route,
                start_date: m.start_date,
                is_active: m.is_active !== false
            })),
            recent_labs: (labResults || []).map(l => ({
                id: l.id,
                parameter_name: l.parameter_name,
                value: l.value,
                unit: l.unit,
                reference_min: l.reference_min,
                reference_max: l.reference_max,
                is_abnormal: l.value < (l.reference_min || 0) || l.value > (l.reference_max || Infinity),
                measured_at: l.measured_at
            })),
            allergies: (allergies || []).map(a => a.allergen_name)
        };

        // ============================================
        // 2. FETCH KNOWLEDGE GRAPH INSIGHTS
        // ============================================

        const pathologyNames = context.patient.pathologies.map(p => p.name);
        const medicationNames = context.patient.medications.map(m => m.name);

        // Causal rules for pathologies and medications
        let applicableRules: CausalRule[] = [];

        if (pathologyNames.length > 0 || medicationNames.length > 0) {
            const searchTerms = [...pathologyNames, ...medicationNames];
            const orConditions = searchTerms.map(t => `source_name.ilike.%${t}%`).join(',');

            const { data: rules } = await supabase
                .from('kg_causal_rules')
                .select('*')
                .or(orConditions)
                .limit(50);

            applicableRules = (rules || []).map(r => ({
                id: r.id,
                source_type: r.source_type,
                source_name: r.source_name,
                target_type: r.target_type,
                target_name: r.target_name,
                relation_type: r.relation_type,
                strength: r.strength,
                evidence_level: r.evidence_level,
                recommended_action: r.recommended_action,
                urgency: r.urgency,
                pmid: r.pmid
            }));
        }

        // CYP interactions
        const cypInteractions: CYPInteraction[] = [];

        if (medicationNames.length > 1) {
            const { data: enzymeMeds } = await supabase
                .from('kg_enzyme_medication')
                .select('*, kg_enzymes(name, clinical_significance)')
                .limit(100);

            if (enzymeMeds) {
                const enzymeMap = new Map<string, { meds: { name: string; role: string; strength?: string }[], significance: string }>();

                for (const em of enzymeMeds) {
                    const enzyme = em.kg_enzymes?.name;
                    if (!enzyme) continue;

                    // Check if this medication is in patient's list
                    const isRelevant = medicationNames.some(m =>
                        em.medication_name.toLowerCase().includes(m.toLowerCase()) ||
                        m.toLowerCase().includes(em.medication_name.toLowerCase())
                    );

                    if (isRelevant) {
                        if (!enzymeMap.has(enzyme)) {
                            enzymeMap.set(enzyme, { meds: [], significance: em.kg_enzymes?.clinical_significance || 'MODERATE' });
                        }
                        enzymeMap.get(enzyme)!.meds.push({
                            name: em.medication_name,
                            role: em.relationship_type as any,
                            strength: em.effect_strength
                        });
                    }
                }

                for (const [enzyme, data] of enzymeMap.entries()) {
                    const inhibitors = data.meds.filter(m => m.role === 'inhibitor');
                    const inducers = data.meds.filter(m => m.role === 'inducer');
                    const substrates = data.meds.filter(m => m.role.includes('substrate'));

                    if ((inhibitors.length > 0 || inducers.length > 0) && substrates.length > 0) {
                        cypInteractions.push({
                            enzyme,
                            clinical_significance: data.significance,
                            involved_medications: data.meds.map(m => ({
                                name: m.name,
                                role: m.role as any,
                                effect_strength: m.strength
                            })),
                            risk_description: inhibitors.length > 0
                                ? `${inhibitors.map(i => i.name).join(', ')} inhibe(nt) ${enzyme} → risque de surdosage de ${substrates.map(s => s.name).join(', ')}`
                                : `${inducers.map(i => i.name).join(', ')} induit ${enzyme} → risque de sous-dosage de ${substrates.map(s => s.name).join(', ')}`
                        });
                    }
                }
            }
        }

        // Population flags
        const populationFlags: PopulationFlag[] = [];

        // Age-based flags
        if (age < 18) {
            populationFlags.push({ factor_type: 'AGE_PEDIATRIC', applies: true, modification_type: 'PRUDENCE', modification_details: 'Population pédiatrique - adapter les posologies' });
        }
        if (age >= 65) {
            populationFlags.push({ factor_type: 'AGE_GERIATRIC', applies: true, modification_type: 'SURVEILLANCE_RENFORCEE', modification_details: 'Population gériatrique - surveillance accrue des effets indésirables' });
        }

        // Check for renal impairment
        const creatinine = context.patient.recent_labs.find(l => l.parameter_name.toLowerCase().includes('créatinine') || l.parameter_name.toLowerCase().includes('creatinine'));
        if (creatinine && creatinine.is_abnormal) {
            populationFlags.push({ factor_type: 'RENAL_IMPAIRMENT', applies: true, modification_type: 'AJUSTEMENT_DOSE', modification_details: 'Fonction rénale altérée - ajuster les doses des médicaments à élimination rénale' });
        }

        // Contraindications
        const contraindications = applicableRules.filter(r => r.relation_type === 'CONTRE_INDIQUE');

        // Urgent alerts
        const urgentAlerts = applicableRules
            .filter(r => r.urgency === 'URGENT' || r.urgency === 'IMMEDIATE')
            .map(r => `${r.source_name} → ${r.target_name}: ${r.recommended_action || r.relation_type}`);

        context.knowledge = {
            applicable_causal_rules: applicableRules,
            cyp_interactions: cypInteractions,
            contraindications,
            population_flags: populationFlags,
            risk_level: assessRiskLevel(applicableRules, cypInteractions, populationFlags),
            urgent_alerts: urgentAlerts
        };

        // ============================================
        // 3. FETCH LITERATURE (optional)
        // ============================================

        if (request.include_literature) {
            const query = request.literature_query ||
                `${pathologyNames[0] || ''} ${medicationNames[0] || ''} treatment interaction`.trim();

            const articles = await searchPubMed(query, request.max_pubmed_results || 5);

            context.literature = {
                query_used: query,
                articles
            };
        }

        // ============================================
        // 4. BUILD AI PROMPT CONTEXT
        // ============================================

        context.ai_prompt_context = buildAIPromptContext(context);

        // ============================================
        // RETURN UNIFIED CONTEXT
        // ============================================

        return new Response(JSON.stringify(context), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Context assembler error:", error);
        return new Response(
            JSON.stringify({ error: "Context assembly failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
