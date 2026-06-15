import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * LBD EXPAND NODE (ULTRA VERSION)
 *
 * Recursive exploration engine with LLM-based extraction,
 * multi-criteria scoring, and deep reasoning traces.
 */

interface ExpandRequest {
    job_id: string;
    node_id: string;
    node_label: string;
    node_type: string;
    facet: string;
    hypothesis_id: string;
    depth: number;
    max_depth: number;
    budget: number;
}

const FACET_QUERIES: Record<string, (label: string) => string[]> = {
    mechanism: (label) => [
        `${label} molecular mechanism`,
        `${label} pathway signaling`,
        `${label} target receptor enzyme`
    ],
    phenotype: (label) => [
        `${label} symptoms phenotype clinical manifestations`
    ],
    molecule: (label) => [
        `${label} drug molecule chemical compound`
    ],
    intervention: (label) => [
        `${label} treatment therapy clinical trial`
    ],
    biomarker: (label) => [
        `${label} biomarker diagnostic prognostic`
    ]
};

const NCBI_API_KEY = Deno.env.get("NCBI_API_KEY");

async function fetchPubMed(query: string, maxResults: number = 5): Promise<any[]> {
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    const apiKeyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : '';
    try {
        const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json${apiKeyParam}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const ids = searchData.esearchresult?.idlist || [];
        if (ids.length === 0) return [];
        const fetchUrl = `${baseUrl}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&rettype=xml&retmode=xml${apiKeyParam}`;
        const fetchRes = await fetch(fetchUrl);
        const xml = await fetchRes.text();
        const papers: any[] = [];
        const articleMatches = xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g);
        for (const match of articleMatches) {
            const article = match[1];
            const pmid = article.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
            const title = article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]?.replace(/<[^>]+>/g, '');
            const abstract = article.match(/<Abstract>([\s\S]*?)<\/Abstract>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
            const year = article.match(/<PubDate>[\s\S]*?<Year>(\d+)<\/Year>/)?.[1];
            if (pmid && title) papers.push({ pmid, title, abstract, year: parseInt(year || '0') });
        }
        return papers;
    } catch (e) { return []; }
}

function extractEntities(text: string): any[] {
    const entities: any[] = [];
    const drugPatterns = text.match(/\b[A-Z][a-z]+(?:mab|nib|zumab|tinib|pril|sartan|statin|olol|zosin)\b/g);
    if (drugPatterns) drugPatterns.forEach(d => entities.push({ text: d, type: 'drug' }));
    const pathwayPatterns = text.match(/\b(?:NF-κB|JAK|STAT|MAPK|PI3K|AKT|mTOR|Wnt|Notch|TGF-β)\b/gi);
    if (pathwayPatterns) pathwayPatterns.forEach(p => entities.push({ text: p, type: 'pathway' }));
    return entities;
}

// ULTRA: LLM-based extraction and scoring
async function extractClaimsWithLLM(text: string, subjectLabel: string): Promise<any[]> {
    const systemPrompt = `You are a biomedical extraction expert. Extract clinical and mechanistic claims related to: "${subjectLabel}".
For each claim, provide:
- Predicate: TREATS, CAUSES, TARGETS, INHIBITS, ASSOCIATED_WITH, INCREASES, DECREASES, PREVENTS.
- Object: The target entity.
- Object Type: drug, disease, gene, pathway, biomarker.
- Effect Direction: benefit, harm, neutral, unknown.
- Evidence Quality: 0-1 (guideline=0.9, RCT=0.8, cohort=0.6, case=0.4, pre-clinical=0.2).
- Mechanistic Plausibility: 0-1.

Return JSON array: [{"predicate": "...", "object": "...", "object_type": "...", "effect": "...", "quality": 0.X, "plausibility": 0.Y}]`;

    try {
        const response = await callAI(systemPrompt, text, {
            model: 'gpt-5.5',
            reasoningEffort: 'high',
            maxTokens: 2000,
            temperature: 0.1
        });
        const jsonStr = response.text.match(/\[[\s\S]*\]/)?.[0] || '[]';
        return JSON.parse(jsonStr);
    } catch (e) { return []; }
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body: ExpandRequest = await req.json();
        const { job_id, node_id, node_label, node_type, facet, hypothesis_id, depth, max_depth, budget } = body;
        console.log(`🔍 [Ultra] Expanding: "${node_label}" (${facet}) depth ${depth}`);
        const startTime = Date.now();
        const trace: any = { inputs: { node_label, node_type, facet, depth }, retrieval_queries: [], evidence_map: [], output_claims: [] };

        const queries = (FACET_QUERIES[facet] || FACET_QUERIES.mechanism)(node_label);
        const allDocuments: any[] = [];
        const allClaims: any[] = [];

        let budgetUsed = 0;
        for (const query of queries) {
            if (budgetUsed >= budget) break;
            const papers = await fetchPubMed(query, 3);
            budgetUsed++;
            trace.retrieval_queries.push({ api: 'pubmed', query, results: papers.length });

            for (const paper of papers) {
                const { data: doc } = await supabase.from('lbd_documents').upsert({
                    pmid: paper.pmid, title: paper.title, abstract: paper.abstract, publication_year: paper.year, source: 'pubmed'
                }, { onConflict: 'pmid' }).select().single();

                if (doc && paper.abstract) {
                    allDocuments.push(doc);
                    const extracted = await extractClaimsWithLLM(paper.abstract, node_label);
                    const { data: passage } = await supabase.from('lbd_passages').insert({
                        document_id: doc.id, text: paper.abstract.substring(0, 3000), section: 'abstract', entities: extractEntities(paper.abstract)
                    }).select().single();

                    if (passage) {
                        for (const ec of extracted) {
                            const recency = Math.min(1, (paper.year - 2015) / 10);
                            const aggregateScore = (ec.quality * 0.4) + (ec.plausibility * 0.4) + (recency * 0.2);
                            const { data: savedClaim } = await supabase.from('lbd_claims').insert({
                                subject_node_id: node_id, subject_text: node_label, subject_type: node_type,
                                predicate: ec.predicate, object_text: ec.object, object_type: ec.object_type,
                                evidence_quality: ec.quality, replication_count: 1, effect_direction: ec.effect, recency_score: recency,
                                mechanistic_plausibility: ec.plausibility, aggregate_score: aggregateScore,
                                is_hypothesis: false, inference_rule: 'direct_extraction', hypothesis_id: hypothesis_id
                            }).select().single();

                            if (savedClaim) {
                                allClaims.push(savedClaim);
                                await supabase.from('lbd_claim_evidence').insert({ claim_id: savedClaim.id, passage_id: passage.id, confidence: ec.plausibility, extraction_method: 'llm' });
                            }
                        }
                    }
                }
            }
        }

        trace.evidence_map = allDocuments.map(d => ({ pmid: d.pmid, title: d.title }));
        trace.output_claims = allClaims.map(c => ({ id: c.id, predicate: c.predicate, object: c.object_text, score: c.aggregate_score }));

        let childJobsCreated = 0;
        if (depth < max_depth && allClaims.length > 0) {
            const topClaims = allClaims.filter(c => c.aggregate_score > 0.6).sort((a, b) => b.aggregate_score - a.aggregate_score).slice(0, 5);
            const childJobs = topClaims.map(c => ({
                node_label: c.object_text, node_type: c.object_type, hypothesis_id,
                facet: facet === 'mechanism' ? 'intervention' : 'mechanism',
                priority: c.aggregate_score * (1 - depth / max_depth),
                depth: depth + 1, max_depth, budget_remaining: Math.floor(budget / 2), status: 'pending'
            }));
            if (childJobs.length > 0) {
                const { data: newJobs } = await supabase.from('frontier_jobs').insert(childJobs).select();
                childJobsCreated = newJobs?.length || 0;
            }
        }

        await supabase.from('lbd_reasoning_traces').insert({
            hypothesis_id, job_id, inputs: trace.inputs, retrieval_queries: trace.retrieval_queries,
            evidence_map: trace.evidence_map, output_claims: trace.output_claims, execution_time_ms: Date.now() - startTime
        });

        return new Response(JSON.stringify({
            success: true, claims_count: allClaims.length, child_jobs_created: childJobsCreated, execution_time_ms: Date.now() - startTime
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
