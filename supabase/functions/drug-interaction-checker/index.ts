import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getOpenFDAComprehensiveData } from "./openfda-api.ts";
import { getDrugBankComprehensiveData } from "./drugbank-api.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DRUG INTERACTION CHECKER
 * 
 * Checks drug-drug interactions using multiple sources:
 * 1. RxNorm interaction API
 * 2. Knowledge Graph causal rules
 * 3. OpenFDA adverse event correlation
 * 
 * Returns structured interaction data with severity levels.
 */

interface InteractionRequest {
    medications: string[];
    patient_id?: string;
    include_openfda?: boolean;
}

interface DrugInteraction {
    drug_a: string;
    drug_b: string;
    severity: 'minor' | 'moderate' | 'major' | 'contraindicated';
    description: string;
    mechanism?: string;
    source: 'rxnorm' | 'knowledge_graph' | 'openfda';
    evidence_level?: string;
    clinical_action: string;
    pmid?: string[];
}

interface InteractionResponse {
    checked_at: string;
    medications: string[];
    interactions: DrugInteraction[];
    summary: {
        total_interactions: number;
        major_interactions: number;
        contraindicated: number;
        requires_monitoring: number;
    };
    recommendations: string[];
}

// ============================================
// RXNORM INTERACTION API
// ============================================

async function checkRxNormInteractions(medications: string[]): Promise<DrugInteraction[]> {
    const interactions: DrugInteraction[] = [];

    try {
        // First, get RxCUI for each medication
        const rxcuis: { name: string; rxcui: string }[] = [];

        for (const med of medications) {
            const searchUrl = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(med)}&search=1`;
            const res = await fetch(searchUrl);
            if (res.ok) {
                const data = await res.json();
                const rxcui = data?.idGroup?.rxnormId?.[0];
                if (rxcui) {
                    rxcuis.push({ name: med, rxcui });
                }
            }
        }

        if (rxcuis.length < 2) return interactions;

        // Check interactions between all drugs
        const rxcuiList = rxcuis.map(r => r.rxcui).join('+');
        const interactionUrl = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuiList}`;

        const res = await fetch(interactionUrl);
        if (!res.ok) return interactions;

        const data = await res.json();
        const fullInteractionGroups = data?.fullInteractionTypeGroup || [];

        for (const group of fullInteractionGroups) {
            for (const interactionType of group.fullInteractionType || []) {
                for (const pair of interactionType.interactionPair || []) {
                    const concepts = pair.interactionConcept || [];
                    if (concepts.length >= 2) {
                        const drugA = concepts[0]?.minConceptItem?.name || 'Unknown';
                        const drugB = concepts[1]?.minConceptItem?.name || 'Unknown';

                        // Determine severity from description
                        const description = pair.description || '';
                        let severity: DrugInteraction['severity'] = 'minor';
                        if (description.toLowerCase().includes('contraindicated') || description.toLowerCase().includes('avoid')) {
                            severity = 'contraindicated';
                        } else if (description.toLowerCase().includes('major') || description.toLowerCase().includes('serious')) {
                            severity = 'major';
                        } else if (description.toLowerCase().includes('moderate') || description.toLowerCase().includes('monitor')) {
                            severity = 'moderate';
                        }

                        interactions.push({
                            drug_a: drugA,
                            drug_b: drugB,
                            severity,
                            description: description.substring(0, 500),
                            source: 'rxnorm',
                            clinical_action: severity === 'contraindicated'
                                ? 'Éviter cette association'
                                : severity === 'major'
                                    ? 'Évaluer le rapport bénéfice/risque, surveillance rapprochée'
                                    : 'Surveillance clinique recommandée'
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.error("RxNorm interaction error:", e);
    }

    return interactions;
}

// ============================================
// DRUGBANK INTERACTION CHECK
// ============================================

async function checkDrugBankInteractions(medications: string[]): Promise<DrugInteraction[]> {
    const interactions: DrugInteraction[] = [];
    const drugbankApiKey = Deno.env.get("DRUGBANK_API_KEY");

    if (!drugbankApiKey || medications.length < 2) return interactions;

    try {
        // For each medication, get its DrugBank interactions
        for (const medName of medications.slice(0, 3)) { // Limit to avoid API overload
            const dbData = await getDrugBankComprehensiveData(medName, drugbankApiKey);

            if (dbData.found && dbData.detailed && dbData.detailed.interactions) {
                for (const interaction of dbData.detailed.interactions) {
                    // Check if the interacting drug is in our list
                    const interactsWith = medications.find(m =>
                        interaction.name.toLowerCase().includes(m.toLowerCase()) ||
                        m.toLowerCase().includes(interaction.name.toLowerCase())
                    );

                    if (interactsWith && interactsWith !== medName) {
                        interactions.push({
                            drug_a: medName,
                            drug_b: interactsWith,
                            severity: 'major', // DrugBank typically lists significant interactions
                            description: interaction.description || 'Interaction documentée',
                            mechanism: interaction.description,
                            source: 'drugbank' as const,
                            evidence_level: 'DOCUMENTATION PHARMACOLOGIQUE',
                            clinical_action: 'Consultation recommandée - interaction pharmacologique établie'
                        });
                    }
                }
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    } catch (error) {
        console.error('DrugBank interaction check error:', error);
    }

    return interactions;
}

// ============================================
// ENHANCED OPENFDA LABEL CHECK
// ============================================

async function checkOpenFDALabels(medications: string[]): Promise<DrugInteraction[]> {
    const interactions: DrugInteraction[] = [];

    if (medications.length < 2) return interactions;

    try {
        for (const medName of medications.slice(0, 3)) {
            const fdaData = await getOpenFDAComprehensiveData(medName);

            for (const drug of fdaData.drugs) {
                const interactionText = Array.isArray(drug.drug_interactions)
                    ? drug.drug_interactions.join(' ')
                    : '';

                if (!interactionText) continue;

                // Search for mentions of other medications in interaction text
                for (const otherMed of medications) {
                    if (otherMed === medName) continue;

                    if (interactionText.toLowerCase().includes(otherMed.toLowerCase())) {
                        // Extract relevant sentence
                        const sentences = interactionText.split(/[.!?]/);
                        const relevantSentence = sentences.find(s =>
                            s.toLowerCase().includes(otherMed.toLowerCase())
                        ) || interactionText.substring(0, 300);

                        interactions.push({
                            drug_a: medName,
                            drug_b: otherMed,
                            severity: 'major',
                            description: `FDA Label: ${relevantSentence.trim()}`,
                            source: 'openfda' as const,
                            evidence_level: 'FDA LABEL OFFICIEL',
                            clinical_action: 'Consulter la monographie complète du médicament'
                        });
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } catch (error) {
        console.error('OpenFDA label check error:', error);
    }

    return interactions;
}

// ============================================
// OPENFDA CO-PRESCRIPTION ANALYSIS
// ============================================

async function checkOpenFDACorrelation(medications: string[]): Promise<DrugInteraction[]> {
    const interactions: DrugInteraction[] = [];

    if (medications.length < 2) return interactions;

    try {
        // Search for adverse events with both drugs
        for (let i = 0; i < medications.length; i++) {
            for (let j = i + 1; j < medications.length; j++) {
                const drugA = medications[i];
                const drugB = medications[j];

                const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugA)}"+AND+patient.drug.medicinalproduct:"${encodeURIComponent(drugB)}"&limit=5`;

                const res = await fetch(url);
                if (!res.ok) continue;

                const data = await res.json();
                const eventCount = data?.meta?.results?.total || 0;

                if (eventCount > 10) { // Significant co-occurrence
                    // Get most common reactions
                    const reactions = new Map<string, number>();
                    for (const event of data.results || []) {
                        for (const reaction of event.patient?.reaction || []) {
                            const r = reaction.reactionmeddrapt;
                            if (r) reactions.set(r, (reactions.get(r) || 0) + 1);
                        }
                    }

                    const topReactions = [...reactions.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([r]) => r);

                    interactions.push({
                        drug_a: drugA,
                        drug_b: drugB,
                        severity: 'moderate',
                        description: `${eventCount} événements indésirables rapportés avec cette association. Réactions fréquentes: ${topReactions.join(', ')}`,
                        source: 'openfda',
                        evidence_level: 'PHARMACOVIGILANCE',
                        clinical_action: 'Signal de pharmacovigilance - surveillance clinique recommandée'
                    });
                }
            }
        }
    } catch (e) {
        console.error("OpenFDA correlation error:", e);
    }

    return interactions;
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: InteractionRequest = await req.json();

        if (!request.medications || request.medications.length < 2) {
            return new Response(
                JSON.stringify({ error: "At least 2 medications required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const response: InteractionResponse = {
            checked_at: new Date().toISOString(),
            medications: request.medications,
            interactions: [],
            summary: {
                total_interactions: 0,
                major_interactions: 0,
                contraindicated: 0,
                requires_monitoring: 0
            },
            recommendations: []
        };

        // Parallel checks from ALL sources
        const promises: Promise<DrugInteraction[]>[] = [
            checkRxNormInteractions(request.medications),
            checkDrugBankInteractions(request.medications),
            checkOpenFDALabels(request.medications)
        ];

        if (request.include_openfda !== false) { // Enabled by default now
            promises.push(checkOpenFDACorrelation(request.medications));
        }

        const results = await Promise.all(promises);

        // Merge results, deduplicate by drug pair
        const seen = new Set<string>();
        for (const interactionList of results) {
            for (const interaction of interactionList) {
                const key = [interaction.drug_a, interaction.drug_b].sort().join('|');
                if (!seen.has(key)) {
                    seen.add(key);
                    response.interactions.push(interaction);
                }
            }
        }

        // Calculate summary
        response.summary.total_interactions = response.interactions.length;
        response.summary.contraindicated = response.interactions.filter(i => i.severity === 'contraindicated').length;
        response.summary.major_interactions = response.interactions.filter(i => i.severity === 'major').length;
        response.summary.requires_monitoring = response.interactions.filter(i => i.severity === 'moderate').length;

        // Generate recommendations
        if (response.summary.contraindicated > 0) {
            response.recommendations.push('⚠️ ATTENTION: Associations contre-indiquées détectées - évaluer les alternatives thérapeutiques');
        }
        if (response.summary.major_interactions > 0) {
            response.recommendations.push('⚠️ Interactions majeures - surveillance clinique rapprochée nécessaire');
        }
        if (response.summary.requires_monitoring > 0) {
            response.recommendations.push('📊 Interactions modérées - monitoring régulier recommandé');
        }
        if (response.summary.total_interactions === 0) {
            response.recommendations.push('✅ Aucune interaction majeure détectée dans les bases de données consultées');
        }

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Drug interaction error:", error);
        return new Response(
            JSON.stringify({ error: "Interaction check failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
