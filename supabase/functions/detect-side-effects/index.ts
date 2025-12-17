import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOpenFDAComprehensiveData } from "./openfda-api.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LabResult {
    id: string;
    test_name: string;
    value: number;
    unit: string;
    reference_min?: number;
    reference_max?: number;
    test_date: string;
}

interface PatientMedication {
    id: string;
    medication_id: string;
    medication_name: string;
    start_date: string;
    is_active: boolean;
}

interface BiomarkerTrend {
    name: string;
    category: string;
    values: { date: string; value: number }[];
    baselineValue: number;
    currentValue: number;
    changePercent: number;
    isAbnormal: boolean;
    unit: string;
}

// Biomarker categories and their clinical significance
const BIOMARKER_CONFIG: Record<string, { category: string; highConcern: string[] }> = {
    'ALT': { category: 'liver', highConcern: ['statins', 'paracetamol', 'methotrexate', 'isoniazid'] },
    'AST': { category: 'liver', highConcern: ['statins', 'paracetamol', 'methotrexate'] },
    'GGT': { category: 'liver', highConcern: ['alcohol', 'phenytoin', 'carbamazepine'] },
    'Bilirubine': { category: 'liver', highConcern: ['rifampicin', 'atazanavir'] },
    'Créatinine': { category: 'kidney', highConcern: ['AINS', 'metformin', 'lithium', 'aminoglycosides'] },
    'Urée': { category: 'kidney', highConcern: ['AINS', 'diuretics'] },
    'DFG': { category: 'kidney', highConcern: ['AINS', 'contrast agents'] },
    'Potassium': { category: 'electrolyte', highConcern: ['IEC', 'ARA2', 'spironolactone', 'trimethoprim'] },
    'Sodium': { category: 'electrolyte', highConcern: ['diuretics', 'ISRS', 'carbamazepine'] },
    'Hémoglobine': { category: 'hematology', highConcern: ['methotrexate', 'anticoagulants', 'AINS'] },
    'Plaquettes': { category: 'hematology', highConcern: ['heparin', 'valproate', 'carbamazepine'] },
    'Leucocytes': { category: 'hematology', highConcern: ['clozapine', 'carbimazole', 'methotrexate'] },
    'TSH': { category: 'thyroid', highConcern: ['amiodarone', 'lithium', 'interferon'] },
    'HbA1c': { category: 'metabolic', highConcern: ['corticosteroids', 'antipsychotics', 'thiazides'] },
    'Glycémie': { category: 'metabolic', highConcern: ['corticosteroids', 'antipsychotics'] },
    'CK': { category: 'muscle', highConcern: ['statins', 'fibrates', 'colchicine'] },
};

// ============================================
// OPENFDA FAERS DATA FETCHING
// ============================================

async function fetchOpenFDAAdverseEvents(medications: PatientMedication[]): Promise<Record<string, any>> {
    const fdaDataByMed: Record<string, any> = {};

    try {
        for (const med of medications.slice(0, 5)) { // Limit to 5 most important meds
            const fdaData = await getOpenFDAComprehensiveData(med.medication_name);

            if (fdaData.totalAdverseEvents > 0) {
                // Aggregate reactions by frequency
                const reactionCounts = new Map<string, number>();

                for (const event of fdaData.adverseEvents) {
                    for (const reaction of event.reactions) {
                        reactionCounts.set(reaction, (reactionCounts.get(reaction) || 0) + 1);
                    }
                }

                const topReactions = [...reactionCounts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15) // Top 15 reactions
                    .map(([reaction, count]) => ({
                        reaction,
                        count,
                        frequency: ((count / fdaData.totalAdverseEvents) * 100).toFixed(2) + '%'
                    }));

                fdaDataByMed[med.medication_name] = {
                    totalEvents: fdaData.totalAdverseEvents,
                    topReactions,
                    seriousEvents: fdaData.adverseEvents.filter(e => e.serious).length
                };
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } catch (error) {
        console.error('OpenFDA FAERS fetch error:', error);
    }

    return fdaDataByMed;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { patient_id, force_analysis = false } = await req.json();

        if (!patient_id) {
            return new Response(
                JSON.stringify({ error: "patient_id is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Initialize Supabase client with service role for full access
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Fetch patient lab results (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const { data: labResults, error: labError } = await supabase
            .from('lab_results')
            .select('*')
            .eq('patient_id', patient_id)
            .gte('test_date', sixMonthsAgo.toISOString())
            .order('test_date', { ascending: true });

        if (labError) throw new Error(`Error fetching labs: ${labError.message}`);

        if (!labResults || labResults.length < 2) {
            return new Response(
                JSON.stringify({ message: "Insufficient lab data for trend analysis", alerts: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Fetch patient medications
        const { data: medications, error: medError } = await supabase
            .from('patient_medications')
            .select('*, medications(name)')
            .eq('patient_id', patient_id);

        if (medError) throw new Error(`Error fetching medications: ${medError.message}`);

        const patientMeds: PatientMedication[] = (medications || []).map(m => ({
            id: m.id,
            medication_id: m.medication_id,
            medication_name: m.medications?.name || 'Unknown',
            start_date: m.start_date,
            is_active: m.is_active
        }));

        // 3. Group and analyze biomarker trends
        const labsByTest: Record<string, LabResult[]> = {};
        labResults.forEach((lab: any) => {
            const testName = lab.test_name?.trim();
            if (!testName) return;
            if (!labsByTest[testName]) labsByTest[testName] = [];
            labsByTest[testName].push(lab);
        });

        const suspiciousTrends: BiomarkerTrend[] = [];

        for (const [testName, labs] of Object.entries(labsByTest)) {
            if (labs.length < 2) continue;

            const config = BIOMARKER_CONFIG[testName];
            if (!config) continue; // Only analyze known biomarkers

            const sortedLabs = labs.sort((a, b) =>
                new Date(a.test_date).getTime() - new Date(b.test_date).getTime()
            );

            const baselineValue = sortedLabs[0].value;
            const currentValue = sortedLabs[sortedLabs.length - 1].value;
            const changePercent = ((currentValue - baselineValue) / baselineValue) * 100;

            // Detect abnormal trends (>20% change or out of reference range)
            const isOutOfRange = sortedLabs[sortedLabs.length - 1].reference_max
                ? currentValue > sortedLabs[sortedLabs.length - 1].reference_max
                : false;

            const significantChange = Math.abs(changePercent) > 20;

            if (significantChange || isOutOfRange) {
                suspiciousTrends.push({
                    name: testName,
                    category: config.category,
                    values: sortedLabs.map(l => ({ date: l.test_date, value: l.value })),
                    baselineValue,
                    currentValue,
                    changePercent,
                    isAbnormal: isOutOfRange,
                    unit: sortedLabs[0].unit || ''
                });
            }
        }

        if (suspiciousTrends.length === 0) {
            return new Response(
                JSON.stringify({ message: "No suspicious trends detected", alerts: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 4. Fetch OpenFDA FAERS data for context
        console.log('Fetching OpenFDA FAERS data...');
        const fdaData = await fetchOpenFDAAdverseEvents(patientMeds);
        const fdaSummary = Object.entries(fdaData)
            .map(([med, data]: [string, any]) =>
                `- ${med}: ${data.totalEvents} événements FDA (${data.seriousEvents} graves)\n  Top réactions: ${data.topReactions.slice(0, 5).map((r: any) => `${r.reaction} (${r.frequency})`).join(', ')}`
            )
            .join('\n');

        // 5. Call Claude for correlation analysis
        const claudeApiKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!claudeApiKey) {
            throw new Error("ANTHROPIC_API_KEY not configured");
        }

        const analysisPrompt = `Tu es un pharmacologue clinicien expert en pharmacovigilance avec accès à la base FDA FAERS (19.7M d'événements indésirables). Analyse ces données patient pour détecter des effets secondaires médicamenteux potentiels.

## Médicaments du patient:
${patientMeds.map(m => `- ${m.medication_name} (depuis ${m.start_date}, ${m.is_active ? 'actif' : 'arrêté'})`).join('\n')}

## Données OpenFDA FAERS (MONDIAL - 19.7M événements):
${fdaSummary || 'Aucune donnée disponible'}

## Tendances biologiques suspectes:
${suspiciousTrends.map(t => `- ${t.name} (${t.category}): ${t.baselineValue} → ${t.currentValue} ${t.unit} (${t.changePercent > 0 ? '+' : ''}${t.changePercent.toFixed(1)}%)
  Valeurs: ${t.values.map(v => `${v.date.split('T')[0]}: ${v.value}`).join(', ')}`).join('\n\n')}

Pour chaque tendance suspecte, évalue:
1. Le médicament le plus probablement responsable
2. Le niveau de confiance (0-1) de cette association
3. La recommandation clinique (surveillance, ajustement, arrêt)
4. Le raisonnement clinique

Réponds UNIQUEMENT en JSON valide avec ce format:
{
  "alerts": [
    {
      "biomarker": "...",
      "suspected_medication": "...",
      "confidence": 0.X,
      "recommendation": "...",
      "reasoning": "..."
    }
  ]
}`;

        const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": claudeApiKey,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 2000,
                messages: [{ role: "user", content: analysisPrompt }]
            })
        });

        if (!claudeResponse.ok) {
            const errorText = await claudeResponse.text();
            throw new Error(`Claude API error: ${errorText}`);
        }

        const claudeData = await claudeResponse.json();
        const aiResponseText = claudeData.content?.[0]?.text || "";

        // Parse AI response
        let aiAlerts: any[] = [];
        try {
            const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                aiAlerts = parsed.alerts || [];
            }
        } catch (parseError) {
            console.error("Failed to parse AI response:", parseError);
        }

        // 5. Create alerts in database
        const createdAlerts: any[] = [];

        for (const aiAlert of aiAlerts) {
            const trend = suspiciousTrends.find(t =>
                t.name.toLowerCase().includes(aiAlert.biomarker?.toLowerCase()) ||
                aiAlert.biomarker?.toLowerCase().includes(t.name.toLowerCase())
            );

            if (!trend) continue;

            const suspectedMed = patientMeds.find(m =>
                m.medication_name.toLowerCase().includes(aiAlert.suspected_medication?.toLowerCase()) ||
                aiAlert.suspected_medication?.toLowerCase().includes(m.medication_name.toLowerCase())
            );

            const alertData = {
                patient_id,
                suspected_medication_id: suspectedMed?.medication_id || null,
                suspected_medication_name: aiAlert.suspected_medication || 'Unknown',
                medication_start_date: suspectedMed?.start_date || null,
                biomarker_name: trend.name,
                biomarker_category: trend.category,
                baseline_value: trend.baselineValue,
                current_value: trend.currentValue,
                unit: trend.unit,
                change_percent: trend.changePercent,
                trend_description: `${trend.changePercent > 0 ? 'Élévation' : 'Diminution'} progressive de ${Math.abs(trend.changePercent).toFixed(1)}%`,
                first_abnormal_date: trend.values.find(v => v.value !== trend.baselineValue)?.date?.split('T')[0] || null,
                ai_confidence: aiAlert.confidence || 0.5,
                ai_recommendation: aiAlert.recommendation,
                ai_reasoning: aiAlert.reasoning,
                status: 'pending'
            };

            const { data: insertedAlert, error: insertError } = await supabase
                .from('side_effect_alerts')
                .insert(alertData)
                .select()
                .single();

            if (insertError) {
                console.error("Insert alert error:", insertError);
            } else if (insertedAlert) {
                createdAlerts.push(insertedAlert);
            }
        }

        return new Response(
            JSON.stringify({
                message: `Analysis complete. ${createdAlerts.length} alerts created.`,
                alerts: createdAlerts,
                analyzed_trends: suspiciousTrends.length
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Side effect detection error:", error);
        return new Response(
            JSON.stringify({
                error: "Detection analysis failed",
                details: error instanceof Error ? error.message : String(error)
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
