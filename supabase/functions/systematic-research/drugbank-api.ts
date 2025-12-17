/**
 * DrugBank API Helper
 * Requires DrugBank API key (set in Supabase env: DRUGBANK_API_KEY)
 * API Documentation: https://docs.drugbankplus.com/
 */

export interface DrugBankDrug {
    drugbank_id: string;
    name: string;
    description?: string;
    cas_number?: string;
    unii?: string;
    state?: string;
    indication?: string;
    pharmacodynamics?: string;
    mechanism_of_action?: string;
    toxicity?: string;
    metabolism?: string;
    half_life?: string;
    protein_binding?: string;
    route_of_elimination?: string;
    volume_of_distribution?: string;
    clearance?: string;
    categories?: string[];
    atc_codes?: string[];
    targets?: DrugTarget[];
    enzymes?: DrugEnzyme[];
    pathways?: DrugPathway[];
    interactions?: DrugInteraction[];
}

export interface DrugTarget {
    id: string;
    name: string;
    organism: string;
    actions?: string[];
    known_action?: string;
}

export interface DrugEnzyme {
    id: string;
    name: string;
    organism: string;
    actions?: string[];
}

export interface DrugPathway {
    smpdb_id: string;
    name: string;
    category?: string;
}

export interface DrugInteraction {
    drugbank_id: string;
    name: string;
    description: string;
}

/**
 * Search DrugBank for drugs by name
 * @param query Drug name
 * @param apiKey DrugBank API key
 */
export async function searchDrugBank(
    query: string,
    apiKey?: string
): Promise<DrugBankDrug[]> {
    if (!apiKey) {
        console.warn('DrugBank API key not provided, skipping DrugBank search');
        return [];
    }

    try {
        const cleanQuery = encodeURIComponent(query.trim());

        // DrugBank Search endpoint
        const url = `https://api.drugbankplus.com/v1/drugs?q=${cleanQuery}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.error('DrugBank API: Invalid API key');
                return [];
            }
            if (response.status === 404) {
                return [];
            }
            throw new Error(`DrugBank API error: ${response.status}`);
        }

        const data = await response.json();

        // Parse response based on DrugBank API structure
        const drugs: DrugBankDrug[] = [];

        for (const drug of data.results || data || []) {
            drugs.push(parseDrugBankDrug(drug));
        }

        return drugs;
    } catch (error) {
        console.error('DrugBank search error:', error);
        return [];
    }
}

/**
 * Get detailed drug information from DrugBank by ID
 * @param drugbankId DrugBank ID (e.g., "DB00001")
 * @param apiKey DrugBank API key
 */
export async function getDrugBankDrugDetails(
    drugbankId: string,
    apiKey?: string
): Promise<DrugBankDrug | null> {
    if (!apiKey) {
        console.warn('DrugBank API key not provided');
        return null;
    }

    try {
        const url = `https://api.drugbankplus.com/v1/drugs/${drugbankId}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`DrugBank API error: ${response.status}`);
        }

        const data = await response.json();
        return parseDrugBankDrug(data);
    } catch (error) {
        console.error('DrugBank drug details error:', error);
        return null;
    }
}

/**
 * Parse DrugBank API response into our interface
 */
function parseDrugBankDrug(data: any): DrugBankDrug {
    return {
        drugbank_id: data.drugbank_id || data.id || '',
        name: data.name || '',
        description: data.description,
        cas_number: data.cas_number,
        unii: data.unii,
        state: data.state,
        indication: data.indication,
        pharmacodynamics: data.pharmacodynamics,
        mechanism_of_action: data.mechanism_of_action,
        toxicity: data.toxicity,
        metabolism: data.metabolism,
        half_life: data.half_life,
        protein_binding: data.protein_binding,
        route_of_elimination: data.route_of_elimination,
        volume_of_distribution: data.volume_of_distribution,
        clearance: data.clearance,
        categories: data.categories?.map((c: any) => c.category || c.name || c) || [],
        atc_codes: data.atc_codes?.map((a: any) => a.code || a) || [],
        targets: data.targets?.map((t: any) => ({
            id: t.id || t.target_id || '',
            name: t.name || '',
            organism: t.organism || '',
            actions: t.actions || [],
            known_action: t.known_action
        })) || [],
        enzymes: data.enzymes?.map((e: any) => ({
            id: e.id || e.enzyme_id || '',
            name: e.name || '',
            organism: e.organism || '',
            actions: e.actions || []
        })) || [],
        pathways: data.pathways?.map((p: any) => ({
            smpdb_id: p.smpdb_id || p.id || '',
            name: p.name || '',
            category: p.category
        })) || [],
        interactions: data.interactions?.map((i: any) => ({
            drugbank_id: i.drugbank_id || i.id || '',
            name: i.name || '',
            description: i.description || ''
        })) || []
    };
}

/**
 * Get comprehensive drug data from DrugBank
 * Performs search and fetches detailed info for the first result
 */
export async function getDrugBankComprehensiveData(
    drugName: string,
    apiKey?: string
) {
    const searchResults = await searchDrugBank(drugName, apiKey);

    if (searchResults.length === 0) {
        return {
            found: false,
            searchResults: [],
            detailed: null
        };
    }

    // Get detailed info for the first/best match
    const firstDrug = searchResults[0];
    const detailed = await getDrugBankDrugDetails(firstDrug.drugbank_id, apiKey);

    return {
        found: true,
        searchResults,
        detailed
    };
}
