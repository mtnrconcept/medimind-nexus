/**
 * OpenFDA API Helper
 * Provides functions to query openFDA for drug information and adverse events
 * API Documentation: https://open.fda.gov/apis/
 */

export interface FDADrug {
    id: string;
    brand_name: string;
    generic_name: string;
    manufacturer_name?: string;
    product_type?: string;
    route?: string[];
    substance_name?: string;
    active_ingredients?: string[];
    purpose?: string[];
    warnings?: string[];
    indications_and_usage?: string[];
    adverse_reactions?: string[];
    drug_interactions?: string[];
    description?: string;
}

export interface FDAAdverseEvent {
    report_id: string;
    serious: boolean;
    patient_age?: number;
    patient_sex?: string;
    reactions: string[];
    drugs: string[];
    outcomes?: string[];
}

/**
 * Search for drugs in OpenFDA database
 * @param query Search term (drug name)
 * @param limit Max results to return
 */
export async function searchOpenFDADrugs(
    query: string,
    limit: number = 10
): Promise<FDADrug[]> {
    try {
        // Clean query for URL encoding
        const cleanQuery = query.trim().replace(/[^\w\s]/g, '');

        // OpenFDA Drug Label endpoint
        const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(cleanQuery)}"+openfda.generic_name:"${encodeURIComponent(cleanQuery)}"&limit=${limit}`;

        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                // No results found
                return [];
            }
            throw new Error(`OpenFDA API error: ${response.status}`);
        }

        const data = await response.json();
        const results: FDADrug[] = [];

        for (const result of data.results || []) {
            const openfda = result.openfda || {};

            results.push({
                id: `fda-${openfda.product_ndc?.[0] || openfda.application_number?.[0] || 'unknown'}`,
                brand_name: openfda.brand_name?.[0] || '',
                generic_name: openfda.generic_name?.[0] || '',
                manufacturer_name: openfda.manufacturer_name?.[0],
                product_type: openfda.product_type?.[0],
                route: openfda.route || [],
                substance_name: openfda.substance_name?.[0],
                active_ingredients: result.active_ingredient || openfda.substance_name || [],
                purpose: result.purpose || [],
                warnings: result.warnings || result.boxed_warning || [],
                indications_and_usage: result.indications_and_usage || [],
                adverse_reactions: result.adverse_reactions || [],
                drug_interactions: result.drug_interactions || [],
                description: result.description?.[0]
            });
        }

        return results;
    } catch (error) {
        console.error('OpenFDA drug search error:', error);
        // Return empty array on error - graceful degradation
        return [];
    }
}

/**
 * Search for adverse events related to a drug
 * @param drugName Drug name to search
 * @param limit Max results
 */
export async function searchOpenFDAAdverseEvents(
    drugName: string,
    limit: number = 20
): Promise<FDAAdverseEvent[]> {
    try {
        const cleanQuery = drugName.trim().replace(/[^\w\s]/g, '');

        // OpenFDA Adverse Events endpoint
        const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(cleanQuery)}"&limit=${limit}`;

        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                return [];
            }
            throw new Error(`OpenFDA Adverse Events API error: ${response.status}`);
        }

        const data = await response.json();
        const events: FDAAdverseEvent[] = [];

        for (const result of data.results || []) {
            const patient = result.patient || {};

            events.push({
                report_id: result.safetyreportid || 'unknown',
                serious: result.serious === '1' || result.serious === 1,
                patient_age: patient.patientonsetage,
                patient_sex: patient.patientsex === '1' ? 'M' : patient.patientsex === '2' ? 'F' : undefined,
                reactions: (patient.reaction || []).map((r: any) => r.reactionmeddrapt).filter(Boolean),
                drugs: (patient.drug || []).map((d: any) => d.medicinalproduct).filter(Boolean),
                outcomes: (patient.reaction || []).map((r: any) => r.reactionoutcome).filter(Boolean)
            });
        }

        return events;
    } catch (error) {
        console.error('OpenFDA adverse events search error:', error);
        return [];
    }
}

/**
 * Get comprehensive drug information from OpenFDA
 * Combines drug labels and adverse events
 */
export async function getOpenFDAComprehensiveData(drugName: string) {
    const [drugs, adverseEvents] = await Promise.all([
        searchOpenFDADrugs(drugName, 5),
        searchOpenFDAAdverseEvents(drugName, 15)
    ]);

    return {
        drugs,
        adverseEvents,
        totalDrugs: drugs.length,
        totalAdverseEvents: adverseEvents.length
    };
}
