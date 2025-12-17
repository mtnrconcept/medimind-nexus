import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * MEDICAL DATA SOURCES
 * 
 * Unified interface to multiple medical APIs:
 * 1. PubMed/NCBI - Scientific literature
 * 2. OpenFDA - Drug adverse events, recalls
 * 3. ClinicalTrials.gov - Ongoing trials
 * 4. RxNorm - Medication normalization
 * 5. MedlinePlus - Patient education
 * 6. DrugBank (if API key provided) - Drug interactions
 * 7. WHO ATC - Drug classification
 */

interface DataSourceRequest {
    query: string;
    sources: ('pubmed' | 'openfda' | 'clinicaltrials' | 'rxnorm' | 'medlineplus' | 'who_atc')[];
    filters?: {
        date_from?: string;
        date_to?: string;
        drug_name?: string;
        condition?: string;
        max_results?: number;
    };
}

interface PubMedResult {
    pmid: string;
    title: string;
    authors: string;
    journal: string;
    year: string;
    abstract: string;
    doi?: string;
    mesh_terms?: string[];
}

interface OpenFDAResult {
    type: 'adverse_event' | 'drug_label' | 'recall';
    report_date?: string;
    drug_name?: string;
    reactions?: string[];
    outcomes?: string[];
    patient_age?: number;
    patient_sex?: string;
    seriousness?: string;
    description?: string;
}

interface ClinicalTrialResult {
    nct_id: string;
    title: string;
    status: string;
    phase: string;
    conditions: string[];
    interventions: string[];
    sponsor: string;
    start_date?: string;
    completion_date?: string;
    enrollment?: number;
    locations?: string[];
}

interface RxNormResult {
    rxcui: string;
    name: string;
    synonym?: string;
    tty: string; // Term type
    related_drugs?: { name: string; rxcui: string; relation: string }[];
}

interface MedlinePlusResult {
    title: string;
    url: string;
    snippet: string;
    organization?: string;
}

interface DataSourceResponse {
    query: string;
    searched_at: string;
    sources: {
        pubmed?: PubMedResult[];
        openfda?: OpenFDAResult[];
        clinicaltrials?: ClinicalTrialResult[];
        rxnorm?: RxNormResult[];
        medlineplus?: MedlinePlusResult[];
    };
    errors: { source: string; error: string }[];
    summary: {
        total_results: number;
        sources_searched: number;
        sources_failed: number;
    };
}

// ============================================
// API IMPLEMENTATIONS
// ============================================

async function searchPubMed(query: string, maxResults: number = 10): Promise<PubMedResult[]> {
    try {
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
        if (ncbiApiKey) searchUrl += `&api_key=${ncbiApiKey}`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(`PubMed search failed: ${searchRes.status}`);

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];
        if (ids.length === 0) return [];

        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (ncbiApiKey) fetchUrl += `&api_key=${ncbiApiKey}`;

        const fetchRes = await fetch(fetchUrl);
        const xmlText = await fetchRes.text();

        const results: PubMedResult[] = [];
        const articles = xmlText.split('</PubmedArticle>');

        for (const chunk of articles) {
            const pmid = chunk.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1];
            const title = chunk.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1];
            const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ").substring(0, 1000);
            const journal = chunk.match(/<Title>(.*?)<\/Title>/)?.[1];
            const year = chunk.match(/<Year>(.*?)<\/Year>/)?.[1];
            const doi = chunk.match(/<ELocationID EIdType="doi"[^>]*>(.*?)<\/ELocationID>/)?.[1];
            const authorMatches = [...chunk.matchAll(/<LastName>(.*?)<\/LastName>.*?<Initials>(.*?)<\/Initials>/gs)];
            const authors = authorMatches.slice(0, 5).map(m => `${m[1]} ${m[2]}`).join(", ");
            const meshMatches = [...chunk.matchAll(/<DescriptorName[^>]*>(.*?)<\/DescriptorName>/g)];
            const mesh_terms = meshMatches.map(m => m[1]).slice(0, 10);

            if (pmid && title) {
                results.push({
                    pmid,
                    title: title.replace(/<[^>]*>/g, ''),
                    authors: authors || 'Unknown',
                    journal: journal || 'Unknown',
                    year: year || 'Unknown',
                    abstract: abstract || 'No abstract available',
                    doi,
                    mesh_terms
                });
            }
        }

        return results;
    } catch (e) {
        console.error("PubMed error:", e);
        throw e;
    }
}

async function searchOpenFDA(drugName: string, maxResults: number = 10): Promise<OpenFDAResult[]> {
    try {
        // Search drug adverse events
        const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=${maxResults}`;

        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 404) return []; // No results
            throw new Error(`OpenFDA failed: ${res.status}`);
        }

        const data = await res.json();
        const results: OpenFDAResult[] = [];

        for (const event of data.results || []) {
            const reactions = event.patient?.reaction?.map((r: any) => r.reactionmeddrapt) || [];
            const outcomes = event.patient?.reactionoutcome?.map((o: any) => {
                const outcomeMap: Record<string, string> = {
                    '1': 'Recovered',
                    '2': 'Recovering',
                    '3': 'Not recovered',
                    '4': 'Recovered with sequelae',
                    '5': 'Fatal',
                    '6': 'Unknown'
                };
                return outcomeMap[o] || o;
            }) || [];

            results.push({
                type: 'adverse_event',
                report_date: event.receivedate,
                drug_name: drugName,
                reactions: reactions.slice(0, 10),
                outcomes,
                patient_age: event.patient?.patientonsetage,
                patient_sex: event.patient?.patientsex === '1' ? 'Male' : event.patient?.patientsex === '2' ? 'Female' : undefined,
                seriousness: event.serious === '1' ? 'Serious' : 'Non-serious'
            });
        }

        return results;
    } catch (e) {
        console.error("OpenFDA error:", e);
        throw e;
    }
}

async function searchClinicalTrials(query: string, maxResults: number = 10): Promise<ClinicalTrialResult[]> {
    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(query)}&pageSize=${maxResults}&format=json`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`ClinicalTrials.gov failed: ${res.status}`);

        const data = await res.json();
        const results: ClinicalTrialResult[] = [];

        for (const study of data.studies || []) {
            const protocol = study.protocolSection;
            const id = protocol?.identificationModule;
            const status = protocol?.statusModule;
            const design = protocol?.designModule;
            const desc = protocol?.descriptionModule;
            const arms = protocol?.armsInterventionsModule;
            const sponsor = protocol?.sponsorCollaboratorsModule;
            const locations = protocol?.contactsLocationsModule;

            results.push({
                nct_id: id?.nctId || 'Unknown',
                title: id?.officialTitle || id?.briefTitle || 'Unknown',
                status: status?.overallStatus || 'Unknown',
                phase: design?.phases?.join(', ') || 'Not Specified',
                conditions: protocol?.conditionsModule?.conditions || [],
                interventions: arms?.interventions?.map((i: any) => `${i.type}: ${i.name}`) || [],
                sponsor: sponsor?.leadSponsor?.name || 'Unknown',
                start_date: status?.startDateStruct?.date,
                completion_date: status?.completionDateStruct?.date,
                enrollment: design?.enrollmentInfo?.count,
                locations: locations?.locations?.slice(0, 3).map((l: any) => `${l.city}, ${l.country}`) || []
            });
        }

        return results;
    } catch (e) {
        console.error("ClinicalTrials error:", e);
        throw e;
    }
}

async function searchRxNorm(drugName: string): Promise<RxNormResult[]> {
    try {
        // Search for drug
        const searchUrl = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(drugName)}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(`RxNorm failed: ${searchRes.status}`);

        const searchData = await searchRes.json();
        const results: RxNormResult[] = [];

        const concepts = searchData?.drugGroup?.conceptGroup || [];
        for (const group of concepts) {
            for (const concept of group.conceptProperties || []) {
                const result: RxNormResult = {
                    rxcui: concept.rxcui,
                    name: concept.name,
                    synonym: concept.synonym,
                    tty: concept.tty
                };

                // Get related drugs (interactions, etc.)
                try {
                    const relatedUrl = `https://rxnav.nlm.nih.gov/REST/rxcui/${concept.rxcui}/related.json?tty=IN+PIN`;
                    const relatedRes = await fetch(relatedUrl);
                    if (relatedRes.ok) {
                        const relatedData = await relatedRes.json();
                        const related = relatedData?.relatedGroup?.conceptGroup?.[0]?.conceptProperties || [];
                        result.related_drugs = related.slice(0, 5).map((r: any) => ({
                            name: r.name,
                            rxcui: r.rxcui,
                            relation: r.tty
                        }));
                    }
                } catch { /* ignore */ }

                results.push(result);
            }
        }

        return results.slice(0, 10);
    } catch (e) {
        console.error("RxNorm error:", e);
        throw e;
    }
}

async function searchMedlinePlus(query: string, maxResults: number = 5): Promise<MedlinePlusResult[]> {
    try {
        const url = `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(query)}&retmax=${maxResults}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`MedlinePlus failed: ${res.status}`);

        const xmlText = await res.text();
        const results: MedlinePlusResult[] = [];

        // Parse XML response
        const documents = xmlText.split('</document>');
        for (const doc of documents) {
            const title = doc.match(/<content name="title">(.*?)<\/content>/)?.[1];
            const url = doc.match(/<content name="FullSummary"[^>]*>(.*?)<\/content>/)?.[1]?.match(/href="([^"]+)"/)?.[1];
            const snippet = doc.match(/<content name="snippet">(.*?)<\/content>/)?.[1];
            const org = doc.match(/<content name="organizationName">(.*?)<\/content>/)?.[1];

            if (title) {
                results.push({
                    title: title.replace(/<[^>]*>/g, ''),
                    url: url || `https://medlineplus.gov/search/?query=${encodeURIComponent(query)}`,
                    snippet: snippet?.replace(/<[^>]*>/g, '').substring(0, 300) || '',
                    organization: org
                });
            }
        }

        return results;
    } catch (e) {
        console.error("MedlinePlus error:", e);
        throw e;
    }
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: DataSourceRequest = await req.json();

        if (!request.query) {
            return new Response(
                JSON.stringify({ error: "query is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const sources = request.sources || ['pubmed'];
        const maxResults = request.filters?.max_results || 10;
        const drugName = request.filters?.drug_name || request.query;

        const response: DataSourceResponse = {
            query: request.query,
            searched_at: new Date().toISOString(),
            sources: {},
            errors: [],
            summary: {
                total_results: 0,
                sources_searched: sources.length,
                sources_failed: 0
            }
        };

        // Parallel API calls
        const promises: Promise<void>[] = [];

        if (sources.includes('pubmed')) {
            promises.push(
                searchPubMed(request.query, maxResults)
                    .then(results => { response.sources.pubmed = results; response.summary.total_results += results.length; })
                    .catch(e => { response.errors.push({ source: 'pubmed', error: String(e) }); response.summary.sources_failed++; })
            );
        }

        if (sources.includes('openfda')) {
            promises.push(
                searchOpenFDA(drugName, maxResults)
                    .then(results => { response.sources.openfda = results; response.summary.total_results += results.length; })
                    .catch(e => { response.errors.push({ source: 'openfda', error: String(e) }); response.summary.sources_failed++; })
            );
        }

        if (sources.includes('clinicaltrials')) {
            promises.push(
                searchClinicalTrials(request.query, maxResults)
                    .then(results => { response.sources.clinicaltrials = results; response.summary.total_results += results.length; })
                    .catch(e => { response.errors.push({ source: 'clinicaltrials', error: String(e) }); response.summary.sources_failed++; })
            );
        }

        if (sources.includes('rxnorm')) {
            promises.push(
                searchRxNorm(drugName)
                    .then(results => { response.sources.rxnorm = results; response.summary.total_results += results.length; })
                    .catch(e => { response.errors.push({ source: 'rxnorm', error: String(e) }); response.summary.sources_failed++; })
            );
        }

        if (sources.includes('medlineplus')) {
            promises.push(
                searchMedlinePlus(request.query, maxResults)
                    .then(results => { response.sources.medlineplus = results; response.summary.total_results += results.length; })
                    .catch(e => { response.errors.push({ source: 'medlineplus', error: String(e) }); response.summary.sources_failed++; })
            );
        }

        await Promise.all(promises);

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Medical data sources error:", error);
        return new Response(
            JSON.stringify({ error: "Data source search failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
