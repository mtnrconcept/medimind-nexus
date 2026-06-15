/**
 * Exhaustive OpenFDA Search with Pagination
 * Scans ALL available adverse events (19.7M) with batching
 */

import { FDADrug, FDAAdverseEvent } from './openfda-api.ts';

interface ExhaustiveSearchOptions {
    maxResults?: number; // Default: scan ALL
    batchSize?: number; // Results per API call (max 1000)
    onProgress?: (scanned: number, total: number) => void;
}

/**
 * Exhaustively search OpenFDA adverse events with pagination
 * @returns All matching adverse events (can be millions)
 */
export async function exhaustiveOpenFDAAdverseEvents(
    drugName: string,
    options: ExhaustiveSearchOptions = {}
): Promise<FDAAdverseEvent[]> {
    const {
        maxResults = Infinity,
        batchSize = 1000, // OpenFDA max per request
        onProgress
    } = options;

    const allEvents: FDAAdverseEvent[] = [];
    let skip = 0;
    let totalAvailable = 0;

    try {
        // First request to get total count
        const initialUrl = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=1`;
        const initialRes = await fetch(initialUrl);

        if (!initialRes.ok) {
            console.error(`OpenFDA initial fetch failed: ${initialRes.status}`);
            return [];
        }

        const initialData = await initialRes.json();
        totalAvailable = initialData?.meta?.results?.total || 0;

        if (totalAvailable === 0) {
            if (onProgress) onProgress(0, 0);
            return [];
        }

        console.log(`📊 OpenFDA: ${totalAvailable} événements disponibles pour "${drugName}"`);

        // Calculate how many we'll actually fetch
        const targetCount = Math.min(totalAvailable, maxResults);

        // Paginate through all results
        while (skip < targetCount) {
            const limit = Math.min(batchSize, targetCount - skip);
            const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=${limit}&skip=${skip}`;

            try {
                const response = await fetch(url);

                if (!response.ok) {
                    console.error(`OpenFDA batch at skip=${skip} failed: ${response.status}`);
                    break; // Stop on first error
                }

                const data = await response.json();
                const results = data.results || [];

                // Parse events
                for (const result of results) {
                    const patient = result.patient || {};

                    allEvents.push({
                        report_id: result.safetyreportid || 'unknown',
                        serious: result.serious === '1' || result.serious === 1,
                        patient_age: patient.patientonsetage,
                        patient_sex: patient.patientsex === '1' ? 'M' : patient.patientsex === '2' ? 'F' : undefined,
                        reactions: (patient.reaction || []).map((r: any) => r.reactionmeddrapt).filter(Boolean),
                        drugs: (patient.drug || []).map((d: any) => d.medicinalproduct).filter(Boolean),
                        outcomes: (patient.reaction || []).map((r: any) => r.reactionoutcome).filter(Boolean)
                    });
                }

                skip += results.length;

                if (onProgress) {
                    onProgress(skip, targetCount);
                }

                // Rate limiting: pause between requests (FDA recommends 240 req/min with key, 40 without)
                await new Promise(resolve => setTimeout(resolve, 250)); // 240/min = 250ms

            } catch (err) {
                console.error(`OpenFDA batch error at skip=${skip}:`, err);
                break;
            }

            // Safety: if we got fewer results than requested, we've hit the end
            if (skip > 0 && allEvents.length % batchSize !== 0) {
                break;
            }
        }

        console.log(`✅ OpenFDA: Collected ${allEvents.length}/${totalAvailable} events`);

    } catch (error) {
        console.error('OpenFDA exhaustive search error:', error);
    }

    return allEvents;
}

/**
 * Exhaustively search PubMed with pagination
 */
export async function exhaustivePubMedSearch(
    query: string,
    options: ExhaustiveSearchOptions = {}
): Promise<string[]> {
    const {
        maxResults = 1000, // Default to 1000 for PubMed (can be millions of articles)
        batchSize = 500, // PubMed supports up to 10k but we'll be conservative
        onProgress
    } = options;

    const pmids: string[] = [];
    let retstart = 0;

    try {
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");

        // First search to get count
        let countUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=0&retmode=json`;
        if (ncbiApiKey) countUrl += `&api_key=${ncbiApiKey}`;

        const countRes = await fetch(countUrl);
        const countData = await countRes.json();
        const totalAvailable = parseInt(countData?.esearchresult?.count || '0');

        console.log(`📚 PubMed: ${totalAvailable} articles disponibles pour "${query}"`);

        const targetCount = Math.min(totalAvailable, maxResults);

        // Paginate
        while (retstart < targetCount) {
            const retmax = Math.min(batchSize, targetCount - retstart);
            let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&retstart=${retstart}&retmode=json&sort=relevance`;
            if (ncbiApiKey) searchUrl += `&api_key=${ncbiApiKey}`;

            const response = await fetch(searchUrl);
            const data = await response.json();
            const ids = data?.esearchresult?.idlist || [];

            pmids.push(...ids);
            retstart += ids.length;

            if (onProgress) {
                onProgress(retstart, targetCount);
            }

            // NCBI rate limit: 10 req/sec with key, 3 without
            await new Promise(resolve => setTimeout(resolve, ncbiApiKey ? 100 : 350));

            if (ids.length === 0) break;
        }

        console.log(`✅ PubMed: Collected ${pmids.length}/${totalAvailable} PMIDs`);

    } catch (error) {
        console.error('PubMed exhaustive search error:', error);
    }

    return pmids;
}
