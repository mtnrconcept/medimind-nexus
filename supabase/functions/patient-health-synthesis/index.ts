// Supabase Edge Function: Patient Health Synthesis
// Analyzes complete patient dossier and generates comprehensive health report

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =====================================================
// TYPES
// =====================================================

interface HealthSynthesis {
    global_synthesis: string;
    health_score: number;
    risk_level: 'low' | 'moderate' | 'high' | 'critical';
    vigilance_points: Array<{
        category: string;
        level: 'info' | 'warning' | 'critical';
        title: string;
        description: string;
        action_needed?: string;
    }>;
    weak_signals: Array<{
        indicator: string;
        trend: 'stable' | 'improving' | 'worsening';
        observation: string;
        recommendation: string;
    }>;
    treatment_recommendations: Array<{
        category: string;
        current_situation: string;
        suggested_action: string;
        rationale: string;
        priority: 'low' | 'medium' | 'high';
    }>;
    prevention_alerts: Array<{
        screening: string;
        status: 'up_to_date' | 'due_soon' | 'overdue' | 'never_done';
        due_date?: string;
        recommendation: string;
    }>;
    lifestyle_advice: Array<{
        category: string;
        current_status: string;
        advice: string;
        impact: string;
    }>;
    drug_interactions: Array<{
        medications: string[];
        interaction_type: string;
        severity: 'mild' | 'moderate' | 'severe';
        recommendation: string;
    }>;
    summary_for_patient: string;
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { patient_id } = await req.json();

        if (!patient_id) {
            return new Response(
                JSON.stringify({ error: "patient_id is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // =====================================================
        // FETCH ALL PATIENT DATA
        // =====================================================

        // Basic patient info
        const { data: patient } = await supabase
            .from("patients")
            .select("*, pathologies(*)")
            .eq("id", patient_id)
            .single();

        if (!patient) {
            return new Response(
                JSON.stringify({ error: "Patient not found" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Fetch all related data in parallel
        const [
            { data: medications },
            { data: patientPathologies },
            { data: allergies },
            { data: vaccinations },
            { data: symptoms },
            { data: medicalHistory },
            { data: familyHistory },
            { data: lifestyle },
            { data: clinicalData },
            { data: labResults },
            { data: prevention },
            { data: administrative },
        ] = await Promise.all([
            supabase.from("patient_medications").select("*, medications(*)").eq("patient_id", patient_id),
            supabase.from("patient_pathologies").select("*, pathologies(*)").eq("patient_id", patient_id),
            supabase.from("patient_allergies").select("*").eq("patient_id", patient_id),
            supabase.from("patient_vaccinations").select("*").eq("patient_id", patient_id),
            supabase.from("patient_symptoms").select("*, symptoms(*)").eq("patient_id", patient_id).eq("is_active", true),
            supabase.from("patient_medical_history").select("*").eq("patient_id", patient_id),
            supabase.from("patient_family_history").select("*").eq("patient_id", patient_id),
            supabase.from("patient_lifestyle").select("*").eq("patient_id", patient_id).maybeSingle(),
            supabase.from("patient_clinical_data").select("*").eq("patient_id", patient_id).order("recorded_at", { ascending: false }).limit(10),
            supabase.from("patient_lab_results").select("*").eq("patient_id", patient_id).order("test_date", { ascending: false }).limit(50),
            supabase.from("patient_prevention").select("*").eq("patient_id", patient_id),
            supabase.from("patient_administrative").select("*").eq("patient_id", patient_id).maybeSingle(),
        ]);

        // =====================================================
        // BUILD PATIENT CONTEXT
        // =====================================================

        const patientContext = {
            demographics: {
                age: patient.age,
                gender: patient.gender,
                nationality: patient.nationality,
                weight_kg: patient.weight_kg,
                height_cm: patient.height_cm,
            },
            current_medications: medications?.map(m => ({
                name: m.medications?.name,
                dosage: m.dosage,
                frequency: m.frequency,
                is_active: m.is_active,
            })) || [],
            current_pathologies: patientPathologies?.map(p => ({
                name: p.pathologies?.name,
                icd_code: p.pathologies?.icd_code,
                status: p.status,
                diagnosis_date: p.diagnosis_date,
            })) || [],
            allergies: allergies?.map(a => ({
                allergen: a.allergen,
                type: a.allergen_type,
                severity: a.severity,
                reaction: a.reaction,
            })) || [],
            vaccinations: vaccinations?.map(v => ({
                vaccine: v.vaccine_name,
                date: v.vaccination_date,
                booster_due: v.booster_date,
            })) || [],
            active_symptoms: symptoms?.map(s => ({
                name: s.symptom_name,
                severity: s.severity,
                onset: s.onset_date,
            })) || [],
            medical_history: medicalHistory?.map(h => ({
                category: h.category,
                title: h.title,
                date: h.start_date,
                is_ongoing: h.is_ongoing,
            })) || [],
            family_history: familyHistory?.map(f => ({
                relationship: f.relationship,
                condition: f.condition,
                hereditary: f.is_hereditary,
            })) || [],
            lifestyle: lifestyle ? {
                smoking: lifestyle.smoking_status,
                alcohol: lifestyle.alcohol_status,
                physical_activity: lifestyle.physical_activity_level,
                sleep_quality: lifestyle.sleep_quality,
                pack_years: lifestyle.pack_years,
            } : null,
            recent_vitals: clinicalData?.[0] ? {
                bp: `${clinicalData[0].systolic_bp}/${clinicalData[0].diastolic_bp}`,
                heart_rate: clinicalData[0].heart_rate,
                weight: clinicalData[0].weight_kg,
                bmi: clinicalData[0].bmi,
                temperature: clinicalData[0].temperature,
            } : null,
            recent_labs: labResults?.slice(0, 20).map(l => ({
                test: l.test_name,
                value: l.value,
                unit: l.unit,
                is_abnormal: l.is_abnormal,
                date: l.test_date,
            })) || [],
            prevention_status: prevention?.map(p => ({
                screening: p.screening_type,
                last_done: p.last_screening_date,
                next_due: p.next_due_date,
                status: p.result_status,
            })) || [],
        };

        // =====================================================
        // CALL CLAUDE FOR ANALYSIS
        // =====================================================

        const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");

        if (!CLAUDE_API_KEY) {
            // Return basic analysis without AI
            const basicSynthesis: HealthSynthesis = {
                global_synthesis: "Analyse IA non disponible. Veuillez configurer la clé API Claude.",
                health_score: 50,
                risk_level: 'moderate',
                vigilance_points: [],
                weak_signals: [],
                treatment_recommendations: [],
                prevention_alerts: [],
                lifestyle_advice: [],
                drug_interactions: [],
                summary_for_patient: "Consultez votre médecin pour une analyse complète.",
            };

            return new Response(
                JSON.stringify(basicSynthesis),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const systemPrompt = `Tu es un assistant médical expert. Analyse le dossier patient complet fourni et génère une synthèse de santé détaillée.

IMPORTANT: Tu dois répondre UNIQUEMENT en JSON valide selon le schéma suivant:
{
    "global_synthesis": "Synthèse narrative de l'état de santé global du patient (2-3 paragraphes)",
    "health_score": <nombre de 0 à 100>,
    "risk_level": "low" | "moderate" | "high" | "critical",
    "vigilance_points": [
        {
            "category": "cardiovascular|metabolic|respiratory|neurological|oncological|infectious|mental|other",
            "level": "info|warning|critical",
            "title": "Titre court",
            "description": "Description détaillée",
            "action_needed": "Action recommandée (optionnel)"
        }
    ],
    "weak_signals": [
        {
            "indicator": "Nom de l'indicateur",
            "trend": "stable|improving|worsening",
            "observation": "Observation clinique",
            "recommendation": "Recommandation"
        }
    ],
    "treatment_recommendations": [
        {
            "category": "medication|therapy|procedure|monitoring|lifestyle",
            "current_situation": "Situation actuelle",
            "suggested_action": "Action suggérée",
            "rationale": "Justification médicale",
            "priority": "low|medium|high"
        }
    ],
    "prevention_alerts": [
        {
            "screening": "Type de dépistage",
            "status": "up_to_date|due_soon|overdue|never_done",
            "due_date": "YYYY-MM-DD (optionnel)",
            "recommendation": "Recommandation"
        }
    ],
    "lifestyle_advice": [
        {
            "category": "nutrition|exercise|sleep|stress|tobacco|alcohol|other",
            "current_status": "État actuel",
            "advice": "Conseil spécifique",
            "impact": "Impact attendu sur la santé"
        }
    ],
    "drug_interactions": [
        {
            "medications": ["Médicament 1", "Médicament 2"],
            "interaction_type": "Type d'interaction",
            "severity": "mild|moderate|severe",
            "recommendation": "Recommandation"
        }
    ],
    "summary_for_patient": "Résumé simple et compréhensible pour le patient (1-2 phrases)"
}

Analyse avec attention:
1. Les interactions médicamenteuses potentielles
2. Les facteurs de risque combinés
3. Les signaux faibles qui pourraient indiquer un problème émergent
4. Les dépistages manquants ou en retard
5. Les contradictions entre traitements et pathologies
6. L'impact du mode de vie sur les pathologies existantes
7. Les antécédents familiaux pertinents

Sois précis, factuel et cliniquement pertinent. Le score de santé doit refléter objectivement l'état global.`;

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "claude-opus-4-5-20251101",
                max_tokens: 4096,
                system: systemPrompt,
                messages: [
                    {
                        role: "user",
                        content: `Voici le dossier patient complet à analyser:\n\n${JSON.stringify(patientContext, null, 2)}`
                    }
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Claude API error:", errorText);
            throw new Error(`Claude API error: ${response.status}`);
        }

        const claudeResponse = await response.json();
        const content = claudeResponse.content[0]?.text || "";

        // Parse JSON response
        let synthesis: HealthSynthesis;
        try {
            let jsonContent = content;

            // Remove markdown code blocks if present
            const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                jsonContent = codeBlockMatch[1].trim();
            }

            // Extract JSON object from response
            const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                synthesis = JSON.parse(jsonMatch[0]);

                // Validate essential fields
                if (typeof synthesis.health_score !== 'number') {
                    synthesis.health_score = 50;
                }
                if (!synthesis.risk_level) {
                    synthesis.risk_level = 'moderate';
                }
                if (!synthesis.global_synthesis || synthesis.global_synthesis.startsWith('{')) {
                    synthesis.global_synthesis = "Synthèse en cours de génération...";
                }
                if (!Array.isArray(synthesis.vigilance_points)) {
                    synthesis.vigilance_points = [];
                }
                if (!Array.isArray(synthesis.weak_signals)) {
                    synthesis.weak_signals = [];
                }
                if (!Array.isArray(synthesis.treatment_recommendations)) {
                    synthesis.treatment_recommendations = [];
                }
                if (!Array.isArray(synthesis.prevention_alerts)) {
                    synthesis.prevention_alerts = [];
                }
                if (!Array.isArray(synthesis.lifestyle_advice)) {
                    synthesis.lifestyle_advice = [];
                }
                if (!Array.isArray(synthesis.drug_interactions)) {
                    synthesis.drug_interactions = [];
                }
                if (!synthesis.summary_for_patient) {
                    synthesis.summary_for_patient = "Consultez votre médecin pour plus de détails.";
                }
            } else {
                throw new Error("No JSON found in response");
            }
        } catch (parseError) {
            console.error("Error parsing Claude response:", parseError, "Content:", content.substring(0, 500));
            synthesis = {
                global_synthesis: "Erreur lors de l'analyse. Le dossier patient semble incomplet ou vide. Veuillez ajouter des données cliniques pour obtenir une synthèse pertinente.",
                health_score: 50,
                risk_level: 'moderate',
                vigilance_points: [],
                weak_signals: [],
                treatment_recommendations: [],
                prevention_alerts: [],
                lifestyle_advice: [],
                drug_interactions: [],
                summary_for_patient: "Impossible de générer une synthèse complète. Consultez votre médecin.",
            };
        }

        return new Response(
            JSON.stringify(synthesis),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error in health synthesis:", error);
        return new Response(
            JSON.stringify({ error: error.message || "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
