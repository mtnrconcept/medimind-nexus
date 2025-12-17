import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache des statistiques (1 heure)
let statsCache: { data: any; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 heure

interface MedicalStats {
    openfda: {
        adverse_events: number;
        drug_labels: number;
        ndc_directory: number;
        drugs_at_fda: number;
        enforcement: number;
    };
    icd10: {
        diagnosis_codes: number;
    };
    drugbank: {
        drugs: number;
        interactions: number;
    };
    total: number;
    last_updated: string;
    sources: string[];
}

async function fetchOpenFDAStats(): Promise<MedicalStats['openfda']> {
    const endpoints = [
        { key: 'adverse_events', url: 'https://api.fda.gov/drug/event.json?limit=1' },
        { key: 'drug_labels', url: 'https://api.fda.gov/drug/label.json?limit=1' },
        { key: 'ndc_directory', url: 'https://api.fda.gov/drug/ndc.json?limit=1' },
        { key: 'drugs_at_fda', url: 'https://api.fda.gov/drug/drugsfda.json?limit=1' },
        { key: 'enforcement', url: 'https://api.fda.gov/drug/enforcement.json?limit=1' },
    ];

    const results: any = {
        adverse_events: 19684585, // Fallback connu
        drug_labels: 252123,
        ndc_directory: 135674,
        drugs_at_fda: 28698,
        enforcement: 17271,
    };

    // Essayer de récupérer les stats en temps réel
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint.url, {
                headers: { 'Accept': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.meta?.results?.total) {
                    results[endpoint.key] = data.meta.results.total;
                }
            }
        } catch (e) {
            console.log(`OpenFDA ${endpoint.key} fallback used`);
        }
    }

    return results;
}

async function fetchDrugBankStats(): Promise<MedicalStats['drugbank']> {
    // DrugBank nécessite une API key payante pour les stats temps réel
    // Utilisation des statistiques officielles de DrugBank 6.0 (2024)
    return {
        drugs: 11891,
        interactions: 1413413, // DrugBank 6.0: +300% d'interactions
    };
}

function getICD10Stats(): MedicalStats['icd10'] {
    // Statistiques ICD-10-CM officielles (CMS.gov)
    return {
        diagnosis_codes: 69832,
    };
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Vérifier le cache
        if (statsCache && Date.now() - statsCache.timestamp < CACHE_DURATION) {
            console.log("Returning cached stats");
            return new Response(JSON.stringify(statsCache.data), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        console.log("Fetching fresh medical stats...");

        // Récupérer les statistiques de toutes les sources
        const [openfdaStats, drugbankStats] = await Promise.all([
            fetchOpenFDAStats(),
            fetchDrugBankStats(),
        ]);

        const icd10Stats = getICD10Stats();

        // Calculer le total
        const total =
            openfdaStats.adverse_events +
            openfdaStats.drug_labels +
            openfdaStats.ndc_directory +
            openfdaStats.drugs_at_fda +
            openfdaStats.enforcement +
            icd10Stats.diagnosis_codes +
            drugbankStats.drugs +
            drugbankStats.interactions;

        const stats: MedicalStats = {
            openfda: openfdaStats,
            icd10: icd10Stats,
            drugbank: drugbankStats,
            total,
            last_updated: new Date().toISOString(),
            sources: ['OpenFDA', 'ICD-10-CM', 'DrugBank 6.0'],
        };

        // Mettre en cache
        statsCache = { data: stats, timestamp: Date.now() };

        return new Response(JSON.stringify(stats), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Medical stats error:", error);

        // Retourner les stats de fallback en cas d'erreur
        const fallbackStats: MedicalStats = {
            openfda: {
                adverse_events: 19684585,
                drug_labels: 252123,
                ndc_directory: 135674,
                drugs_at_fda: 28698,
                enforcement: 17271,
            },
            icd10: { diagnosis_codes: 69832 },
            drugbank: { drugs: 11891, interactions: 1413413 },
            total: 21603527,
            last_updated: new Date().toISOString(),
            sources: ['OpenFDA', 'ICD-10-CM', 'DrugBank 6.0'],
        };

        return new Response(JSON.stringify(fallbackStats), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
