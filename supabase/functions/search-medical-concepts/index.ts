
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MedicalConcept {
    id: string;
    name: string;
    type: 'pathology' | 'medication' | 'symptom' | 'treatment';
    source: string;
    description?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { query, type } = await req.json();

        if (!query) {
            return new Response(
                JSON.stringify({ error: "Query parameter is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const apiKey = Deno.env.get("NCBI_API_KEY");
        const concepts: MedicalConcept[] = [];

        // Define database based on type
        let db = "mesh";
        if (type === "pathology") db = "medgen";
        if (type === "medication") db = "pccompound";

        // 1. Search (esearch)
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=${db}&term=${encodeURIComponent(query)}&retmax=10&retmode=json`;
        if (apiKey) searchUrl += `&api_key=${apiKey}`;

        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        const ids = searchData?.esearchresult?.idlist || [];

        if (ids.length === 0) {
            return new Response(
                JSON.stringify({ concepts: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Fetch Details (esummary)
        let summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${db}&id=${ids.join(",")}&retmode=json`;
        if (apiKey) summaryUrl += `&api_key=${apiKey}`;

        const summaryResponse = await fetch(summaryUrl);
        const summaryData = await summaryResponse.json();

        // Helper to safely extract string from potentially complex JSON objects
        const getString = (val: any): string => {
            if (val === null || val === undefined) return "";
            if (typeof val === 'string') return val;
            if (Array.isArray(val)) return val.map(v => getString(v)).join(", ");
            if (typeof val === 'object' && 'value' in val) return String(val.value); // Handle {value: "..."}
            return ""; // Fallback to empty string for unknown objects to avoid frontend crashes
        };

        for (const id of ids) {
            const item = summaryData?.result?.[id];
            if (!item) continue;

            let name = "";
            let description = "";

            if (db === "medgen") {
                name = getString(item.title || item.conceptid);
                description = getString(item.definition);
            } else if (db === "pccompound") {
                const synonyms = item.synonymlist;
                name = (Array.isArray(synonyms) && synonyms.length > 0) ? getString(synonyms[0]) : `CID: ${id}`;
            } else if (db === "mesh") {
                const meshTerms = item.ds_meshterms;
                name = (Array.isArray(meshTerms) && meshTerms.length > 0) ? getString(meshTerms[0]) : getString(item.sorttitle || item.term);
                description = getString(item.ds_scope_note); // MeSH often has scope notes
            }

            // Fallback
            if (!name || name === `CID: ${id}`) {
                const fallback = item.title || item.name || item.term;
                if (fallback) name = getString(fallback);
                else name = `ID: ${id}`; // Ultimate fallback
            }

            concepts.push({
                id: id,
                name: name,
                type: type || 'other',
                source: `ncbi_${db}`,
                description: description
            });
        }

        return new Response(
            JSON.stringify({ concepts }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("NCBI Search error:", error);
        return new Response(
            JSON.stringify({ error: "Failed to fetch from NCBI", details: error instanceof Error ? error.message : String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
