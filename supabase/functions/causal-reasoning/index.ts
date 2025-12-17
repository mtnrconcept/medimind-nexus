import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Causal Reasoning Engine
 * Queries the Knowledge Graph causal rules to provide explainable clinical insights
 */

interface CausalQuery {
    patient_id?: string;
    pathologies?: string[];
    medications?: string[];
    symptoms?: string[];
    age?: number;
    renal_function_egfr?: number;
    is_pregnant?: boolean;
    is_lactating?: boolean;
}

interface CausalResult {
    rules: CausalRule[];
    interactions: CYPInteraction[];
    population_flags: PopulationFlag[];
    risk_summary: RiskSummary;
}

interface CausalRule {
    id: string;
    source: string;
    target: string;
    relation: string;
    strength: string;
    evidence_level: string;
    action: string;
    urgency: string;
    pmid?: string[];
}

interface CYPInteraction {
    enzyme: string;
    inhibitors: string[];
    inducers: string[];
    substrates_at_risk: string[];
    clinical_note: string;
}

interface PopulationFlag {
    factor: string;
    affected_medications: string[];
    modification: string;
    details: string;
}

interface RiskSummary {
    overall_risk: 'FAIBLE' | 'MODERE' | 'ELEVE' | 'CRITIQUE';
    urgent_alerts: number;
    routine_alerts: number;
    key_concerns: string[];
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const query: CausalQuery = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const results: CausalResult = {
            rules: [],
            interactions: [],
            population_flags: [],
            risk_summary: {
                overall_risk: 'FAIBLE',
                urgent_alerts: 0,
                routine_alerts: 0,
                key_concerns: []
            }
        };

        // 1. Query causal rules for pathologies
        if (query.pathologies && query.pathologies.length > 0) {
            const { data: pathologyRules } = await supabase
                .from('kg_causal_rules')
                .select('*')
                .or(`source_name.ilike.any.{${query.pathologies.map(p => `%${p}%`).join(',')}}`);

            if (pathologyRules) {
                for (const rule of pathologyRules) {
                    results.rules.push({
                        id: rule.id,
                        source: rule.source_name,
                        target: rule.target_name,
                        relation: rule.relation_type,
                        strength: rule.strength,
                        evidence_level: rule.evidence_level,
                        action: rule.recommended_action || '',
                        urgency: rule.urgency || 'INFORMATION',
                        pmid: rule.pmid
                    });

                    if (rule.urgency === 'URGENT' || rule.urgency === 'IMMEDIATE') {
                        results.risk_summary.urgent_alerts++;
                    } else {
                        results.risk_summary.routine_alerts++;
                    }
                }
            }
        }

        // 2. Query causal rules for medications
        if (query.medications && query.medications.length > 0) {
            const { data: medicationRules } = await supabase
                .from('kg_causal_rules')
                .select('*')
                .or(`source_name.ilike.any.{${query.medications.map(m => `%${m}%`).join(',')}}`);

            if (medicationRules) {
                for (const rule of medicationRules) {
                    if (!results.rules.some(r => r.id === rule.id)) {
                        results.rules.push({
                            id: rule.id,
                            source: rule.source_name,
                            target: rule.target_name,
                            relation: rule.relation_type,
                            strength: rule.strength,
                            evidence_level: rule.evidence_level,
                            action: rule.recommended_action || '',
                            urgency: rule.urgency || 'INFORMATION',
                            pmid: rule.pmid
                        });

                        if (rule.urgency === 'URGENT' || rule.urgency === 'IMMEDIATE') {
                            results.risk_summary.urgent_alerts++;
                        } else {
                            results.risk_summary.routine_alerts++;
                        }
                    }
                }
            }
        }

        // 3. Check CYP interactions
        if (query.medications && query.medications.length > 1) {
            const { data: enzymeMeds } = await supabase
                .from('kg_enzyme_medication')
                .select(`
                    *,
                    kg_enzymes!inner(name, clinical_significance)
                `)
                .or(`medication_name.ilike.any.{${query.medications.map(m => `%${m}%`).join(',')}}`);

            if (enzymeMeds) {
                // Group by enzyme
                const enzymeMap = new Map<string, { inhibitors: string[], inducers: string[], substrates: string[] }>();

                for (const em of enzymeMeds) {
                    const enzyme = em.kg_enzymes?.name || 'Unknown';
                    if (!enzymeMap.has(enzyme)) {
                        enzymeMap.set(enzyme, { inhibitors: [], inducers: [], substrates: [] });
                    }

                    const entry = enzymeMap.get(enzyme)!;
                    if (em.relationship_type === 'inhibitor') {
                        entry.inhibitors.push(em.medication_name);
                    } else if (em.relationship_type === 'inducer') {
                        entry.inducers.push(em.medication_name);
                    } else if (em.relationship_type.includes('substrate')) {
                        entry.substrates.push(em.medication_name);
                    }
                }

                // Check for interactions
                for (const [enzyme, data] of enzymeMap.entries()) {
                    if ((data.inhibitors.length > 0 || data.inducers.length > 0) && data.substrates.length > 0) {
                        results.interactions.push({
                            enzyme,
                            inhibitors: data.inhibitors,
                            inducers: data.inducers,
                            substrates_at_risk: data.substrates,
                            clinical_note: data.inhibitors.length > 0
                                ? `Risque de surdosage des substrats ${enzyme} (${data.substrates.join(', ')})`
                                : `Risque de sous-dosage des substrats ${enzyme} (${data.substrates.join(', ')})`
                        });

                        results.risk_summary.urgent_alerts++;
                        results.risk_summary.key_concerns.push(`Interaction ${enzyme}: ${data.inhibitors.concat(data.inducers).join(', ')} ↔ ${data.substrates.join(', ')}`);
                    }
                }
            }
        }

        // 4. Check population factors
        const populationFactors: string[] = [];
        if (query.age !== undefined && query.age < 18) populationFactors.push('AGE_PEDIATRIC');
        if (query.age !== undefined && query.age >= 65) populationFactors.push('AGE_GERIATRIC');
        if (query.is_pregnant) populationFactors.push('PREGNANCY');
        if (query.is_lactating) populationFactors.push('LACTATION');
        if (query.renal_function_egfr !== undefined && query.renal_function_egfr < 60) populationFactors.push('RENAL_IMPAIRMENT');

        if (populationFactors.length > 0) {
            const { data: popFactors } = await supabase
                .from('kg_population_factors')
                .select('*')
                .in('factor_type', populationFactors);

            if (popFactors) {
                for (const factor of popFactors) {
                    results.population_flags.push({
                        factor: factor.factor_type,
                        affected_medications: factor.affected_medication_ids || [],
                        modification: factor.modification_type,
                        details: factor.modification_details || ''
                    });
                }
            }
        }

        // 5. Calculate overall risk
        if (results.risk_summary.urgent_alerts >= 3 || results.interactions.length >= 2) {
            results.risk_summary.overall_risk = 'CRITIQUE';
        } else if (results.risk_summary.urgent_alerts >= 1 || results.interactions.length >= 1) {
            results.risk_summary.overall_risk = 'ELEVE';
        } else if (results.risk_summary.routine_alerts >= 3) {
            results.risk_summary.overall_risk = 'MODERE';
        }

        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Causal reasoning error:", error);
        return new Response(
            JSON.stringify({ error: "Causal reasoning failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
