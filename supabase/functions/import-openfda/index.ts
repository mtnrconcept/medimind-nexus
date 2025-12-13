import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenFDA API endpoints
const OPENFDA_DRUG_LABEL_URL = 'https://api.fda.gov/drug/label.json';
const OPENFDA_ADVERSE_EVENTS_URL = 'https://api.fda.gov/drug/event.json';

interface DrugLabel {
    openfda?: {
        brand_name?: string[];
        generic_name?: string[];
        manufacturer_name?: string[];
        substance_name?: string[];
        route?: string[];
        pharm_class_epc?: string[];
        rxcui?: string[];
    };
    warnings?: string[];
    adverse_reactions?: string[];
    drug_interactions?: string[];
    indications_and_usage?: string[];
    contraindications?: string[];
    boxed_warning?: string[];
}

// Extract side effects from text
function extractSideEffects(text: string): string[] {
    const effects: string[] = [];

    // Common side effect patterns
    const patterns = [
        /(?:common side effects include|side effects may include|adverse reactions include)[:\s]*([\w\s,;]+)/gi,
        /(?:nausea|vomiting|headache|dizziness|fatigue|diarrhea|constipation|rash|drowsiness|insomnia)/gi,
    ];

    for (const pattern of patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            if (match[1]) {
                const items = match[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 50);
                effects.push(...items);
            } else if (match[0]) {
                effects.push(match[0].toLowerCase());
            }
        }
    }

    return [...new Set(effects)];
}

// Extract drug interactions
function extractInteractions(text: string): Array<{ drug: string; severity: string; description: string }> {
    const interactions: Array<{ drug: string; severity: string; description: string }> = [];

    // Look for specific drug names and interaction descriptions
    const sentences = text.split(/[.;]+/);

    for (const sentence of sentences) {
        const lowerSentence = sentence.toLowerCase();

        // Check for interaction keywords
        if (lowerSentence.includes('interact') ||
            lowerSentence.includes('contraindicated') ||
            lowerSentence.includes('avoid') ||
            lowerSentence.includes('should not be used with')) {

            // Determine severity
            let severity = 'moderate';
            if (lowerSentence.includes('contraindicated') || lowerSentence.includes('fatal') || lowerSentence.includes('death')) {
                severity = 'critical';
            } else if (lowerSentence.includes('serious') || lowerSentence.includes('severe')) {
                severity = 'high';
            } else if (lowerSentence.includes('minor') || lowerSentence.includes('mild')) {
                severity = 'low';
            }

            interactions.push({
                drug: 'Multiple drugs', // Simplified - in reality you'd parse specific drug names
                severity,
                description: sentence.trim().slice(0, 500)
            });
        }
    }

    return interactions.slice(0, 10); // Limit to 10 interactions
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const {
            type = 'drugs', // 'drugs' | 'adverse_events' | 'symptoms'
            limit = 100,
            skip = 0,
            searchTerm = ''
        } = await req.json();

        console.log(`OpenFDA import: type=${type}, limit=${limit}, skip=${skip}`);

        if (type === 'drugs') {
            // Fetch drug labels from OpenFDA
            const searchQuery = searchTerm || '_exists_:openfda.generic_name';
            const url = `${OPENFDA_DRUG_LABEL_URL}?search=${encodeURIComponent(searchQuery)}&limit=${limit}&skip=${skip}`;

            console.log('Fetching from OpenFDA:', url);

            const response = await fetch(url);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenFDA API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const drugs: DrugLabel[] = data.results || [];

            console.log(`Retrieved ${drugs.length} drug labels`);

            // Process and insert medications
            const medications = [];
            const sideEffectsMap = new Map<string, Set<string>>();

            for (const drug of drugs) {
                const openfda = drug.openfda || {};
                const brandName = openfda.brand_name?.[0];
                const genericName = openfda.generic_name?.[0];
                const name = brandName || genericName;

                if (!name) continue;

                medications.push({
                    name,
                    substance: openfda.substance_name?.join(', ') || genericName || null,
                    manufacturer: openfda.manufacturer_name?.join(', ') || null,
                    atc_code: null, // OpenFDA doesn't provide ATC codes directly
                    indications: drug.indications_and_usage?.join(' ').slice(0, 2000) || null,
                    contraindications: drug.contraindications?.join(' ').slice(0, 2000) || null,
                    warnings: drug.warnings?.join(' ').slice(0, 2000) || null,
                    boxed_warning: drug.boxed_warning?.join(' ').slice(0, 2000) || null,
                    rxcui: openfda.rxcui?.[0] || null,
                    pharm_class: openfda.pharm_class_epc?.join(', ') || null,
                    route: openfda.route?.join(', ') || null,
                });

                // Extract side effects
                const adverseReactionsText = drug.adverse_reactions?.join(' ') || '';
                const sideEffects = extractSideEffects(adverseReactionsText);
                sideEffectsMap.set(name, new Set(sideEffects));
            }

            // Insert medications
            const { error: medError } = await supabase
                .from('medications')
                .upsert(medications, { onConflict: 'name', ignoreDuplicates: true });

            if (medError) {
                console.error('Error inserting medications:', medError);
            }

            // Insert side effects as symptoms
            const allSideEffects = new Set<string>();
            for (const effects of sideEffectsMap.values()) {
                for (const effect of effects) {
                    allSideEffects.add(effect);
                }
            }

            const symptomsToInsert = Array.from(allSideEffects)
                .filter(s => s.length > 2 && s.length < 100)
                .map(name => ({
                    name,
                    body_system: 'Effets indésirables médicamenteux',
                    is_primary: false,
                }));

            if (symptomsToInsert.length > 0) {
                const { error: sympError } = await supabase
                    .from('symptoms')
                    .upsert(symptomsToInsert, { onConflict: 'name', ignoreDuplicates: true });

                if (sympError) {
                    console.error('Error inserting symptoms:', sympError);
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    type: 'drugs',
                    imported: {
                        medications: medications.length,
                        sideEffects: symptomsToInsert.length,
                    },
                    total: data.meta?.results?.total || 0,
                    skip,
                    limit,
                    hasMore: (skip + limit) < (data.meta?.results?.total || 0),
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (type === 'symptoms') {
            // Common medical symptoms (pre-defined list since there's no free symptoms API)
            const commonSymptoms = [
                { name: 'Fièvre', body_system: 'Général', is_primary: true },
                { name: 'Fatigue', body_system: 'Général', is_primary: true },
                { name: 'Maux de tête', body_system: 'Neurologique', is_primary: true },
                { name: 'Nausées', body_system: 'Digestif', is_primary: true },
                { name: 'Vomissements', body_system: 'Digestif', is_primary: true },
                { name: 'Diarrhée', body_system: 'Digestif', is_primary: true },
                { name: 'Constipation', body_system: 'Digestif', is_primary: true },
                { name: 'Douleur abdominale', body_system: 'Digestif', is_primary: true },
                { name: 'Toux', body_system: 'Respiratoire', is_primary: true },
                { name: 'Essoufflement', body_system: 'Respiratoire', is_primary: true },
                { name: 'Douleur thoracique', body_system: 'Cardiovasculaire', is_primary: true },
                { name: 'Palpitations', body_system: 'Cardiovasculaire', is_primary: true },
                { name: 'Vertiges', body_system: 'Neurologique', is_primary: true },
                { name: 'Confusion', body_system: 'Neurologique', is_primary: true },
                { name: 'Perte de conscience', body_system: 'Neurologique', is_primary: true },
                { name: 'Convulsions', body_system: 'Neurologique', is_primary: true },
                { name: 'Douleur musculaire', body_system: 'Musculosquelettique', is_primary: true },
                { name: 'Douleur articulaire', body_system: 'Musculosquelettique', is_primary: true },
                { name: 'Œdème', body_system: 'Général', is_primary: true },
                { name: 'Éruption cutanée', body_system: 'Dermatologique', is_primary: true },
                { name: 'Démangeaisons', body_system: 'Dermatologique', is_primary: true },
                { name: 'Perte d\'appétit', body_system: 'Digestif', is_primary: true },
                { name: 'Perte de poids', body_system: 'Général', is_primary: true },
                { name: 'Sueurs nocturnes', body_system: 'Général', is_primary: true },
                { name: 'Frissons', body_system: 'Général', is_primary: true },
                { name: 'Insomnie', body_system: 'Neurologique', is_primary: true },
                { name: 'Anxiété', body_system: 'Psychiatrique', is_primary: true },
                { name: 'Dépression', body_system: 'Psychiatrique', is_primary: true },
                { name: 'Troubles de la vision', body_system: 'Ophtalmologique', is_primary: true },
                { name: 'Acouphènes', body_system: 'ORL', is_primary: true },
                { name: 'Dysphagie', body_system: 'Digestif', is_primary: true },
                { name: 'Ictère', body_system: 'Hépatique', is_primary: true },
                { name: 'Hématurie', body_system: 'Urologique', is_primary: true },
                { name: 'Dysurie', body_system: 'Urologique', is_primary: true },
                { name: 'Polyurie', body_system: 'Urologique', is_primary: true },
                { name: 'Polydipsie', body_system: 'Métabolique', is_primary: true },
                { name: 'Saignements', body_system: 'Hématologique', is_primary: true },
                { name: 'Ecchymoses', body_system: 'Hématologique', is_primary: true },
                { name: 'Lymphadénopathie', body_system: 'Hématologique', is_primary: true },
                { name: 'Splénomégalie', body_system: 'Hématologique', is_primary: true },
            ];

            const { error } = await supabase
                .from('symptoms')
                .upsert(commonSymptoms, { onConflict: 'name', ignoreDuplicates: true });

            if (error) {
                throw new Error(`Error inserting symptoms: ${error.message}`);
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    type: 'symptoms',
                    imported: commonSymptoms.length,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: false, error: 'Invalid type. Use: drugs, symptoms' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );

    } catch (error) {
        console.error('OpenFDA import error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
