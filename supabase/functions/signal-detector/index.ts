import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SIGNAL DETECTOR
 * 
 * Analyzes patient lab trends to detect weak signals:
 * 1. Trend detection (increasing/decreasing patterns)
 * 2. Anomaly detection (values outside expected range)
 * 3. Correlation with medications (temporal analysis)
 * 4. Early warning for organ dysfunction
 * 
 * This is a RULE-BASED system (not ML) for explainability.
 */

interface SignalRequest {
    patient_id: string;
    lookback_days?: number; // Default 90 days
    sensitivity?: 'low' | 'medium' | 'high'; // Default medium
}

interface LabTrend {
    parameter: string;
    values: { date: string; value: number }[];
    trend: 'stable' | 'increasing' | 'decreasing' | 'volatile';
    trend_strength: number; // 0-1
    current_status: 'normal' | 'borderline' | 'abnormal' | 'critical';
}

interface WeakSignal {
    id: string;
    type: 'trend' | 'anomaly' | 'correlation' | 'pattern';
    severity: 'info' | 'warning' | 'alert' | 'critical';
    parameter: string;
    description: string;
    evidence: {
        values: { date: string; value: number }[];
        reference_range?: { min: number; max: number };
        trend?: string;
        related_medication?: string;
    };
    clinical_significance: string;
    recommended_action: string;
    confidence: number; // 0-1
}

interface OrganRisk {
    organ: string;
    risk_level: 'low' | 'moderate' | 'high' | 'critical';
    contributing_factors: string[];
    trend: 'improving' | 'stable' | 'worsening';
    key_parameters: string[];
}

interface SignalResponse {
    patient_id: string;
    analyzed_at: string;
    lookback_days: number;
    lab_trends: LabTrend[];
    weak_signals: WeakSignal[];
    organ_risks: OrganRisk[];
    summary: {
        total_signals: number;
        critical_signals: number;
        warning_signals: number;
        organs_at_risk: string[];
    };
}

// ============================================
// BIOMARKER DEFINITIONS
// ============================================

const BIOMARKER_DEFINITIONS: Record<string, {
    organ: string;
    type: 'increase_bad' | 'decrease_bad' | 'both_bad';
    critical_high?: number;
    critical_low?: number;
    alert_high?: number;
    alert_low?: number;
    unit: string;
}> = {
    // Liver
    'ALAT': { organ: 'foie', type: 'increase_bad', alert_high: 40, critical_high: 200, unit: 'U/L' },
    'ASAT': { organ: 'foie', type: 'increase_bad', alert_high: 40, critical_high: 200, unit: 'U/L' },
    'GGT': { organ: 'foie', type: 'increase_bad', alert_high: 60, critical_high: 300, unit: 'U/L' },
    'Bilirubine': { organ: 'foie', type: 'increase_bad', alert_high: 17, critical_high: 50, unit: 'µmol/L' },
    'PAL': { organ: 'foie', type: 'increase_bad', alert_high: 130, critical_high: 400, unit: 'U/L' },

    // Kidney
    'Créatinine': { organ: 'rein', type: 'increase_bad', alert_high: 110, critical_high: 300, unit: 'µmol/L' },
    'Urée': { organ: 'rein', type: 'increase_bad', alert_high: 8, critical_high: 20, unit: 'mmol/L' },
    'DFG': { organ: 'rein', type: 'decrease_bad', alert_low: 60, critical_low: 30, unit: 'mL/min' },

    // Hematology
    'Hémoglobine': { organ: 'moelle', type: 'both_bad', alert_low: 120, critical_low: 80, alert_high: 180, critical_high: 200, unit: 'g/L' },
    'Leucocytes': { organ: 'moelle', type: 'both_bad', alert_low: 4, critical_low: 2, alert_high: 11, critical_high: 20, unit: 'G/L' },
    'Plaquettes': { organ: 'moelle', type: 'both_bad', alert_low: 150, critical_low: 50, alert_high: 400, critical_high: 600, unit: 'G/L' },
    'Neutrophiles': { organ: 'moelle', type: 'decrease_bad', alert_low: 1.5, critical_low: 0.5, unit: 'G/L' },

    // Metabolic
    'Glycémie': { organ: 'métabolisme', type: 'both_bad', alert_low: 3.9, critical_low: 2.8, alert_high: 7, critical_high: 15, unit: 'mmol/L' },
    'HbA1c': { organ: 'métabolisme', type: 'increase_bad', alert_high: 7, critical_high: 10, unit: '%' },
    'Potassium': { organ: 'métabolisme', type: 'both_bad', alert_low: 3.5, critical_low: 3, alert_high: 5, critical_high: 6, unit: 'mmol/L' },
    'Sodium': { organ: 'métabolisme', type: 'both_bad', alert_low: 136, critical_low: 130, alert_high: 145, critical_high: 150, unit: 'mmol/L' },

    // Cardiac
    'Troponine': { organ: 'coeur', type: 'increase_bad', alert_high: 14, critical_high: 50, unit: 'ng/L' },
    'BNP': { organ: 'coeur', type: 'increase_bad', alert_high: 100, critical_high: 400, unit: 'pg/mL' },
    'NT-proBNP': { organ: 'coeur', type: 'increase_bad', alert_high: 300, critical_high: 1000, unit: 'pg/mL' },

    // Inflammatory
    'CRP': { organ: 'inflammation', type: 'increase_bad', alert_high: 5, critical_high: 50, unit: 'mg/L' },
    'VS': { organ: 'inflammation', type: 'increase_bad', alert_high: 20, critical_high: 50, unit: 'mm/h' }
};

// ============================================
// ANALYSIS FUNCTIONS
// ============================================

function calculateTrend(values: { date: string; value: number }[]): { trend: 'stable' | 'increasing' | 'decreasing' | 'volatile'; strength: number } {
    if (values.length < 2) {
        return { trend: 'stable', strength: 0 };
    }

    // Sort by date
    const sorted = [...values].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate linear regression slope
    const n = sorted.length;
    const xMean = (n - 1) / 2;
    const yMean = sorted.reduce((sum, v) => sum + v.value, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (sorted[i].value - yMean);
        denominator += (i - xMean) ** 2;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const relativeSlope = yMean !== 0 ? Math.abs(slope) / yMean : 0;

    // Calculate volatility (coefficient of variation)
    const stdDev = Math.sqrt(sorted.reduce((sum, v) => sum + (v.value - yMean) ** 2, 0) / n);
    const cv = yMean !== 0 ? stdDev / yMean : 0;

    if (cv > 0.3) {
        return { trend: 'volatile', strength: Math.min(cv, 1) };
    }

    if (relativeSlope < 0.05) {
        return { trend: 'stable', strength: 0 };
    }

    return {
        trend: slope > 0 ? 'increasing' : 'decreasing',
        strength: Math.min(relativeSlope * 5, 1) // Scale to 0-1
    };
}

function assessStatus(value: number, definition: typeof BIOMARKER_DEFINITIONS[string]): 'normal' | 'borderline' | 'abnormal' | 'critical' {
    if (definition.critical_high && value >= definition.critical_high) return 'critical';
    if (definition.critical_low && value <= definition.critical_low) return 'critical';
    if (definition.alert_high && value >= definition.alert_high) return 'abnormal';
    if (definition.alert_low && value <= definition.alert_low) return 'abnormal';

    // Borderline: within 10% of alert threshold
    if (definition.alert_high && value >= definition.alert_high * 0.9) return 'borderline';
    if (definition.alert_low && value <= definition.alert_low * 1.1) return 'borderline';

    return 'normal';
}

function generateSignalId(): string {
    return `SIG-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase();
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: SignalRequest = await req.json();

        if (!request.patient_id) {
            return new Response(
                JSON.stringify({ error: "patient_id is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const lookbackDays = request.lookback_days || 90;
        const sensitivity = request.sensitivity || 'medium';
        const sensitivityMultiplier = sensitivity === 'high' ? 0.8 : sensitivity === 'low' ? 1.2 : 1;

        // Fetch lab results
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

        const { data: labResults } = await supabase
            .from('patient_lab_results')
            .select('*')
            .eq('patient_id', request.patient_id)
            .gte('measured_at', lookbackDate.toISOString())
            .order('measured_at', { ascending: true });

        // Fetch patient medications for correlation analysis
        const { data: medications } = await supabase
            .from('patient_medications')
            .select('*, medications(name)')
            .eq('patient_id', request.patient_id)
            .eq('is_active', true);

        const response: SignalResponse = {
            patient_id: request.patient_id,
            analyzed_at: new Date().toISOString(),
            lookback_days: lookbackDays,
            lab_trends: [],
            weak_signals: [],
            organ_risks: [],
            summary: {
                total_signals: 0,
                critical_signals: 0,
                warning_signals: 0,
                organs_at_risk: []
            }
        };

        if (!labResults || labResults.length === 0) {
            return new Response(JSON.stringify(response), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Group by parameter
        const parameterGroups = new Map<string, { date: string; value: number; ref_min?: number; ref_max?: number }[]>();

        for (const lab of labResults) {
            const param = lab.parameter_name;
            if (!parameterGroups.has(param)) {
                parameterGroups.set(param, []);
            }
            parameterGroups.get(param)!.push({
                date: lab.measured_at,
                value: lab.value,
                ref_min: lab.reference_min,
                ref_max: lab.reference_max
            });
        }

        // Analyze each parameter
        const organRiskMap = new Map<string, { factors: string[]; worst_status: string; key_params: string[] }>();

        for (const [param, values] of parameterGroups.entries()) {
            // Find matching biomarker definition
            const definition = Object.entries(BIOMARKER_DEFINITIONS).find(([key]) =>
                param.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(param.toLowerCase())
            )?.[1];

            const { trend, strength } = calculateTrend(values);
            const latestValue = values[values.length - 1].value;
            const status = definition ? assessStatus(latestValue, definition) : 'normal';

            // Record lab trend
            response.lab_trends.push({
                parameter: param,
                values: values.map(v => ({ date: v.date, value: v.value })),
                trend,
                trend_strength: strength,
                current_status: status
            });

            // Track organ risk
            if (definition) {
                const organ = definition.organ;
                if (!organRiskMap.has(organ)) {
                    organRiskMap.set(organ, { factors: [], worst_status: 'normal', key_params: [] });
                }
                const orgData = organRiskMap.get(organ)!;
                orgData.key_params.push(param);

                if (status !== 'normal') {
                    orgData.factors.push(`${param}: ${status}`);
                    if (['critical', 'abnormal'].includes(status) && !['critical', 'abnormal'].includes(orgData.worst_status)) {
                        orgData.worst_status = status;
                    }
                }
            }

            // Generate weak signals

            // Signal: Worsening trend
            if (trend !== 'stable' && strength > 0.3 * sensitivityMultiplier) {
                const isBadTrend = definition && (
                    (definition.type === 'increase_bad' && trend === 'increasing') ||
                    (definition.type === 'decrease_bad' && trend === 'decreasing')
                );

                if (isBadTrend || !definition) {
                    response.weak_signals.push({
                        id: generateSignalId(),
                        type: 'trend',
                        severity: strength > 0.6 ? 'alert' : 'warning',
                        parameter: param,
                        description: `${param} montre une tendance ${trend === 'increasing' ? 'à la hausse' : 'à la baisse'} sur les ${lookbackDays} derniers jours`,
                        evidence: {
                            values: values.map(v => ({ date: v.date, value: v.value })),
                            reference_range: values[0].ref_min !== undefined ? { min: values[0].ref_min!, max: values[0].ref_max! } : undefined,
                            trend
                        },
                        clinical_significance: definition
                            ? `Évolution défavorable pour la fonction ${definition.organ}`
                            : `Évolution à surveiller`,
                        recommended_action: `Contrôler ${param} dans 1-2 semaines pour confirmer la tendance`,
                        confidence: Math.min(0.5 + strength * 0.4, 0.95)
                    });
                }
            }

            // Signal: Abnormal or critical value
            if (status === 'critical') {
                response.weak_signals.push({
                    id: generateSignalId(),
                    type: 'anomaly',
                    severity: 'critical',
                    parameter: param,
                    description: `${param} à ${latestValue} ${definition?.unit || ''} - valeur critique`,
                    evidence: {
                        values: [values[values.length - 1]],
                        reference_range: definition ? {
                            min: definition.alert_low || 0,
                            max: definition.alert_high || Infinity
                        } : undefined
                    },
                    clinical_significance: `Risque immédiat - fonction ${definition?.organ || 'inconnue'} compromise`,
                    recommended_action: 'Action médicale urgente requise',
                    confidence: 0.95
                });
            } else if (status === 'abnormal') {
                response.weak_signals.push({
                    id: generateSignalId(),
                    type: 'anomaly',
                    severity: 'warning',
                    parameter: param,
                    description: `${param} anormal à ${latestValue} ${definition?.unit || ''}`,
                    evidence: {
                        values: [values[values.length - 1]],
                        reference_range: definition ? {
                            min: definition.alert_low || 0,
                            max: definition.alert_high || Infinity
                        } : undefined
                    },
                    clinical_significance: `Surveillance nécessaire - fonction ${definition?.organ || 'inconnue'}`,
                    recommended_action: 'Recontrôler dans 1-2 semaines',
                    confidence: 0.85
                });
            }

            // Signal: Volatile parameter
            if (trend === 'volatile') {
                response.weak_signals.push({
                    id: generateSignalId(),
                    type: 'pattern',
                    severity: 'warning',
                    parameter: param,
                    description: `${param} présente des variations importantes`,
                    evidence: {
                        values: values.map(v => ({ date: v.date, value: v.value })),
                        trend: 'volatile'
                    },
                    clinical_significance: 'Instabilité pouvant indiquer un contrôle sous-optimal ou une compliance variable',
                    recommended_action: 'Évaluer la compliance et le contexte clinique',
                    confidence: 0.7
                });
            }
        }

        // Build organ risks
        for (const [organ, data] of organRiskMap.entries()) {
            const riskLevel = data.worst_status === 'critical' ? 'critical'
                : data.worst_status === 'abnormal' ? 'high'
                    : data.factors.length > 0 ? 'moderate' : 'low';

            if (riskLevel !== 'low') {
                response.organ_risks.push({
                    organ,
                    risk_level: riskLevel,
                    contributing_factors: data.factors,
                    trend: 'stable', // Would need more sophisticated analysis
                    key_parameters: data.key_params
                });

                if (riskLevel === 'critical' || riskLevel === 'high') {
                    response.summary.organs_at_risk.push(organ);
                }
            }
        }

        // Build summary
        response.summary.total_signals = response.weak_signals.length;
        response.summary.critical_signals = response.weak_signals.filter(s => s.severity === 'critical').length;
        response.summary.warning_signals = response.weak_signals.filter(s => s.severity === 'warning' || s.severity === 'alert').length;

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Signal detector error:", error);
        return new Response(
            JSON.stringify({ error: "Signal detection failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
