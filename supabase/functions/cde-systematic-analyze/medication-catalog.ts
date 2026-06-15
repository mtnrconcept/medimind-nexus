/**
 * Medication Catalog Helper for Systematic Analysis
 * Fetches comprehensive medication list from OpenFDA and DrugBank
 */

export interface MedicationCatalogItem {
    id: string;
    name: string;
    source: 'local' | 'openfda' | 'drugbank';
    node_type?: string; // For compatibility with existing code
    atc_code?: string;
    generic_name?: string;
    brand_names?: string[];
    properties?: Record<string, any>; // For compatibility
}

/**
 * Build comprehensive medication catalog from multiple sources
 * @param localSub

stances Local substances from cde_nodes
 * @param drugbankApiKey DrugBank API key (optional)
 * @returns Combined catalog with deduplicated medications
 */
export async function buildMedicationCatalog(
    localSubstances: any[],
    drugbankApiKey?: string
): Promise<MedicationCatalogItem[]> {
    const catalog: MedicationCatalogItem[] = [];
    const seenNames = new Set<string>();

    // 1. Add local substances
    for (const sub of localSubstances) {
        const normalizedName = sub.name.toLowerCase().trim();
        if (!seenNames.has(normalizedName)) {
            catalog.push({
                id: sub.id,
                name: sub.name,
                source: 'local',
                node_type: sub.node_type || 'substance',
                properties: sub.properties || {},
                atc_code: sub.properties?.atc_code || sub.properties?.atc_prefix
            });
            seenNames.add(normalizedName);
        }
    }

    console.log(`Local substances added: ${catalog.length}`);

    // 2. Fetch from OpenFDA (batched to avoid rate limits)
    try {
        // OpenFDA provides downloadable datasets, but for real-time we use search
        // Search for common drug categories to get broader coverage
        const fdaSearchTerms = [
            'analgesic', 'antibiotic', 'antihypertensive', 'antidiabetic',
            'antidepressant', 'anticoagulant', 'antihistamine', 'steroid',
            'vaccine', 'vitamin', 'supplement'
        ];

        for (const term of fdaSearchTerms) {
            const url = `https://api.fda.gov/drug/label.json?search=openfda.pharm_class_epc:"${encodeURIComponent(term)}"&limit=1000`;

            try {
                const response = await fetch(url);
                if (!response.ok) continue;

                const data = await response.json();

                for (const result of data.results || []) {
                    const openfda = result.openfda || {};
                    const genericName = openfda.generic_name?.[0];
                    const brandNames = openfda.brand_name || [];

                    // Add generic name
                    if (genericName) {
                        const normalized = genericName.toLowerCase().trim();
                        if (!seenNames.has(normalized)) {
                            catalog.push({
                                id: `fda-${openfda.application_number?.[0] || Math.random().toString(36)}`,
                                name: genericName,
                                source: 'openfda',
                                node_type: 'substance',
                                generic_name: genericName,
                                brand_names: brandNames
                            });
                            seenNames.add(normalized);
                        }
                    }

                    // Add brand names
                    for (const brandName of brandNames.slice(0, 3)) { // Limit to avoid explosion
                        const normalized = brandName.toLowerCase().trim();
                        if (!seenNames.has(normalized)) {
                            catalog.push({
                                id: `fda-brand-${Math.random().toString(36)}`,
                                name: brandName,
                                source: 'openfda',
                                node_type: 'substance',
                                generic_name: genericName,
                                brand_names: [brandName]
                            });
                            seenNames.add(normalized);
                        }
                    }
                }

                console.log(`OpenFDA term "${term}": ${catalog.length} total meds`);

                // Rate limit protection: wait 200ms between requests
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err) {
                console.error(`OpenFDA search error for "${term}":`, err);
            }
        }
    } catch (error) {
        console.error('OpenFDA catalog building error:', error);
    }

    // 3. Fetch from DrugBank (if API key provided)
    if (drugbankApiKey) {
        try {
            // DrugBank has a comprehensive drugs list endpoint
            const response = await fetch('https://api.drugbankplus.com/v1/drugs?limit=10000', {
                headers: {
                    'Authorization': drugbankApiKey,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();

                for (const drug of data.results || data || []) {
                    const name = drug.name;
                    if (!name) continue;

                    const normalized = name.toLowerCase().trim();
                    if (!seenNames.has(normalized)) {
                        catalog.push({
                            id: drug.drugbank_id || `db-${Math.random().toString(36)}`,
                            name: name,
                            source: 'drugbank',
                            node_type: 'substance',
                            atc_code: drug.atc_codes?.[0]?.code
                        });
                        seenNames.add(normalized);
                    }
                }

                console.log(`DrugBank medications added: ${catalog.length} total`);
            } else {
                console.warn('DrugBank API failed or not configured');
            }
        } catch (error) {
            console.error('DrugBank catalog building error:', error);
        }
    }

    console.log(`✅ Final medication catalog: ${catalog.length} unique medications`);
    return catalog;
}

/**
 * Check if a medication pair is already documented in drug_interactions
 * @param supabase Supabase client
 * @param medA First medication name
 * @param medB Second medication name
 * @returns true if interaction is already documented
 */
export async function isInteractionDocumented(
    supabase: any,
    medA: string,
    medB: string
): Promise<boolean> {
    try {
        // Aggressive normalization: remove ALL special characters
        // PostgreSQL ilike pattern will handle fuzzy matching with remaining words
        const normalizeForSearch = (str: string) => {
            return str
                .replace(/[()[\]{}<>]/g, ' ')        // Brackets → space
                .replace(/[-–—]/g, ' ')               // All dashes → space  
                .replace(/[,;:/\\|]/g, ' ')          // Punctuation → space
                .replace(/[àáâãäå]/gi, 'a')          // Accents → base char
                .replace(/[èéêë]/gi, 'e')
                .replace(/[ìíîï]/gi, 'i')
                .replace(/[òóôõö]/gi, 'o')
                .replace(/[ùúûü]/gi, 'u')
                .replace(/ç/gi, 'c')
                .replace(/ñ/gi, 'n')
                .replace(/[^a-z0-9\s]/gi, ' ')       // Any remaining special → space
                .replace(/\s+/g, ' ')                 // Multiple spaces → single
                .trim();
        };

        const medANorm = normalizeForSearch(medA);
        const medBNorm = normalizeForSearch(medB);

        // Simple search: just check if either medication name appears
        // (drug_interactions.interacting_drug is freeform text)
        const { data, error } = await supabase
            .from('drug_interactions')
            .select('id')
            .or(`interacting_drug.ilike.%${medANorm}%,interacting_drug.ilike.%${medBNorm}%`)
            .limit(1);

        if (error) {
            console.error('Error checking documented interactions:', error);
            return false;
        }

        return (data || []).length > 0;
    } catch (err) {
        console.error('Interaction check error:', err);
        return false; // On error, assume not documented (safer for discovery)
    }
}
