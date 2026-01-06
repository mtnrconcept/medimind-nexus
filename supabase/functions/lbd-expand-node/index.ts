import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * LBD EXPAND NODE
 * 
 * For a given node and facet, fetches relevant literature,
 * extracts entities/relations, generates claims, and queues new nodes.
 * 
 * This is the core recursive exploration engine.
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

// Facet-specific query templates
const FACET_QUERIES: Record<string, (label: string) => string[]> = {
    mechanism: (label) => [
        `${label} molecular mechanism`,
        `${label} pathway signaling`,
        `${label} target receptor enzyme`,
        `${label} gene expression`
    ],
    phenotype: (label) => [
        `${label} symptoms clinical presentation`,
        `${label} phenotype endotype`,
        `${label} manifestations signs`
    ],
    molecule: (label) => [
        `${label} drug molecule`,
        `${label} chemical compound`,
        `${label} pharmacology metabolism`
    ],
    intervention: (label) => [
        `${label} treatment therapy`,
        `${label} drug clinical trial`,
        `${label} intervention procedure`
    ],
    biomarker: (label) => [
        `${label} biomarker diagnostic`,
        `${label} prognostic marker`,
        `${label} laboratory test`
    ],
    population: (label) => [
        `${label} pediatric children`,
        `${label} pregnancy pregnant`,
        `${label} elderly geriatric`,
        `${label} renal impairment`
    ],
    complication: (label) => [
        `${label} complication adverse event`,
        `${label} side effect toxicity`,
        `${label} contraindication`
    ],
    pathway: (label) => [
        `${label} signaling pathway`,
        `${label} metabolic pathway`,
        `${label} inflammatory cascade`
    ]
};

// NCBI API rate limiting
const NCBI_API_KEY = Deno.env.get("NCBI_API_KEY");

async function fetchPubMed(query: string, maxResults: number = 10): Promise<any[]> {
    const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    const apiKeyParam = NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : '';

    try {
        // Search for IDs
        const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json${apiKeyParam}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const ids = searchData.esearchresult?.idlist || [];

        if (ids.length === 0) return [];

        // Fetch details
        const fetchUrl = `${baseUrl}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&rettype=xml&retmode=xml${apiKeyParam}`;
        const fetchRes = await fetch(fetchUrl);
        const xml = await fetchRes.text();

        // Simple XML parsing (extract key fields)
        const papers: any[] = [];
        const articleMatches = xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g);

        for (const match of articleMatches) {
            const article = match[1];
            const pmid = article.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
            const title = article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]?.replace(/<[^>]+>/g, '');
            const abstractMatch = article.match(/<Abstract>([\s\S]*?)<\/Abstract>/);
            const abstract = abstractMatch?.[1]?.replace(/<[^>]+>/g, '').trim();
            const journal = article.match(/<Title>([\s\S]*?)<\/Title>/)?.[1];
            const year = article.match(/<PubDate>[\s\S]*?<Year>(\d+)<\/Year>/)?.[1];

            if (pmid && title) {
                papers.push({ pmid, title, abstract, journal, year: parseInt(year || '0') });
            }
        }

        return papers;
    } catch (err) {
        console.error('PubMed fetch error:', err);
        return [];
    }
}

async function fetchClinicalTrials(query: string, maxResults: number = 5): Promise<any[]> {
    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=${maxResults}`;
        const res = await fetch(url);
        const data = await res.json();

        return (data.studies || []).map((s: any) => ({
            nct_id: s.protocolSection?.identificationModule?.nctId,
            title: s.protocolSection?.identificationModule?.briefTitle,
            abstract: s.protocolSection?.descriptionModule?.briefSummary,
            phase: s.protocolSection?.designModule?.phases?.[0],
            status: s.protocolSection?.statusModule?.overallStatus
        }));
    } catch (err) {
        console.error('ClinicalTrials fetch error:', err);
        return [];
    }
}

// Simple entity extraction (NER-like)
function extractEntities(text: string): any[] {
    const entities: any[] = [];

    // Drug patterns
    const drugPatterns = text.match(/\b[A-Z][a-z]+(?:mab|nib|zumab|tinib|pril|sartan|statin|olol|zosin)\b/g);
    if (drugPatterns) {
        drugPatterns.forEach(d => entities.push({ text: d, type: 'drug' }));
    }

    // Gene patterns
    const genePatterns = text.match(/\b[A-Z]{2,6}\d?(?:\s|,|\.)/g);
    if (genePatterns) {
        genePatterns.forEach(g => entities.push({ text: g.trim(), type: 'gene' }));
    }

    // Pathway patterns
    const pathwayPatterns = text.match(/\b(?:NF-κB|JAK|STAT|MAPK|PI3K|AKT|mTOR|Wnt|Notch|TGF-β)\b/gi);
    if (pathwayPatterns) {
        pathwayPatterns.forEach(p => entities.push({ text: p, type: 'pathway' }));
    }

    return entities;
}

// Simple relation extraction
function extractRelations(text: string, subjectLabel: string): any[] {
    const relations: any[] = [];
    const lowerText = text.toLowerCase();
    const lowerSubject = subjectLabel.toLowerCase();

    const patterns = [
        { regex: /treat(?:s|ed|ment)?/i, predicate: 'TREATS' },
        { regex: /caus(?:e|es|ed|ing)/i, predicate: 'CAUSES' },
        { regex: /inhibit(?:s|ed|or)?/i, predicate: 'INHIBITS' },
        { regex: /target(?:s|ed|ing)?/i, predicate: 'TARGETS' },
        { regex: /associat(?:e|ed|ion)/i, predicate: 'ASSOCIATED_WITH' },
        { regex: /increas(?:e|es|ed)/i, predicate: 'INCREASES' },
        { regex: /decreas(?:e|es|ed)|reduc(?:e|es|ed)/i, predicate: 'DECREASES' },
    ];

    for (const { regex, predicate } of patterns) {
        if (regex.test(lowerText) && lowerText.includes(lowerSubject)) {
            relations.push({ predicate, confidence: 0.6 });
        }
    }

    return relations;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const body: ExpandRequest = await req.json();
        const { job_id, node_id, node_label, node_type, facet, hypothesis_id, depth, max_depth, budget } = body;

        console.log(`🔍 Expanding node: "${node_label}" (${facet}) at depth ${depth}`);

        const startTime = Date.now();
        const trace: any = {
            inputs: { node_label, node_type, facet, depth },
            retrieval_queries: [],
            evidence_map: [],
            normalization_log: [],
            inference_steps: [],
            output_claims: []
        };

        // Get facet-specific queries
        const queryTemplates = FACET_QUERIES[facet] || FACET_QUERIES.mechanism;
        const queries = queryTemplates(node_label);

        // Fetch documents
        const allDocuments: any[] = [];
        const allPassages: any[] = [];
        const allClaims: any[] = [];

        let budgetUsed = 0;
        for (const query of queries) {
            if (budgetUsed >= budget) break;

            // Fetch from PubMed
            const pubmedPapers = await fetchPubMed(query, 5);
            budgetUsed++;
            trace.retrieval_queries.push({ api: 'pubmed', query, results: pubmedPapers.length });

            for (const paper of pubmedPapers) {
                // Insert document
                const { data: doc } = await supabase
                    .from('lbd_documents')
                    .upsert({
                        pmid: paper.pmid,
                        title: paper.title,
                        abstract: paper.abstract,
                        journal: paper.journal,
                        publication_year: paper.year,
                        source: 'pubmed'
                    }, { onConflict: 'pmid' })
                    .select()
                    .single();

                if (doc) {
                    allDocuments.push(doc);

                    // Create passage from abstract
                    if (paper.abstract) {
                        const entities = extractEntities(paper.abstract);
                        const { data: passage } = await supabase
                            .from('lbd_passages')
                            .insert({
                                document_id: doc.id,
                                text: paper.abstract.substring(0, 2000),
                                section: 'abstract',
                                entities: entities
                            })
                            .select()
                            .single();

                        if (passage) {
                            allPassages.push(passage);

                            // Extract relations and create claims
                            const relations = extractRelations(paper.abstract, node_label);
                            for (const rel of relations) {
                                for (const entity of entities) {
                                    const claim = {
                                        subject_node_id: node_id,
                                        subject_text: node_label,
                                        subject_type: node_type,
                                        predicate: rel.predicate,
                                        object_text: entity.text,
                                        object_type: entity.type,
                                        evidence_quality: paper.year > 2020 ? 0.7 : 0.5,
                                        replication_count: 1,
                                        effect_direction: 'unknown',
                                        recency_score: Math.min(1, (paper.year - 2010) / 15),
                                        mechanistic_plausibility: rel.confidence,
                                        aggregate_score: 0.5,
                                        is_hypothesis: false,
                                        inference_rule: 'direct_extraction',
                                        hypothesis_id: hypothesis_id
                                    };

                                    const { data: savedClaim } = await supabase
                                        .from('lbd_claims')
                                        .insert(claim)
                                        .select()
                                        .single();

                                    if (savedClaim) {
                                        allClaims.push(savedClaim);

                                        // Link claim to passage
                                        await supabase.from('lbd_claim_evidence').insert({
                                            claim_id: savedClaim.id,
                                            passage_id: passage.id,
                                            confidence: rel.confidence,
                                            extraction_method: 'regex'
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Fetch from ClinicalTrials for intervention facet
            if (facet === 'intervention' && budgetUsed < budget) {
                const trials = await fetchClinicalTrials(query, 3);
                budgetUsed++;
                trace.retrieval_queries.push({ api: 'clinicaltrials', query, results: trials.length });

                for (const trial of trials) {
                    if (trial.nct_id) {
                        await supabase.from('lbd_documents').upsert({
                            nct_id: trial.nct_id,
                            title: trial.title,
                            abstract: trial.abstract,
                            source: 'clinicaltrials',
                            study_type: trial.phase?.includes('3') ? 'rct' : 'cohort'
                        }, { onConflict: 'nct_id' });
                    }
                }
            }
        }

        trace.evidence_map = allDocuments.map(d => ({ id: d.id, pmid: d.pmid }));
        trace.output_claims = allClaims.map(c => ({ id: c.id, predicate: c.predicate, object: c.object_text }));

        // Queue child nodes if not at max depth
        let childJobsCreated = 0;
        if (depth < max_depth && allClaims.length > 0) {
            // Find unique objects from claims as new nodes to explore
            const uniqueObjects = [...new Set(allClaims.map(c => c.object_text))].slice(0, 3);

            const childJobs = uniqueObjects.map(obj => ({
                node_label: obj,
                node_type: allClaims.find(c => c.object_text === obj)?.object_type || 'unknown',
                hypothesis_id,
                facet: facet === 'mechanism' ? 'molecule' : 'mechanism',  // Alternate facets
                priority: 0.5 * (1 - depth / max_depth),
                depth: depth + 1,
                max_depth,
                budget_remaining: Math.floor(budget / 2),
                status: 'pending'
            }));

            const { data: newJobs } = await supabase
                .from('frontier_jobs')
                .insert(childJobs)
                .select();

            childJobsCreated = newJobs?.length || 0;
        }

        // Save reasoning trace
        await supabase.from('lbd_reasoning_traces').insert({
            hypothesis_id,
            job_id,
            inputs: trace.inputs,
            retrieval_queries: trace.retrieval_queries,
            evidence_map: trace.evidence_map,
            normalization_log: trace.normalization_log,
            inference_steps: trace.inference_steps,
            output_claims: trace.output_claims,
            execution_time_ms: Date.now() - startTime
        });

        console.log(`✅ Expansion complete: ${allDocuments.length} docs, ${allClaims.length} claims, ${childJobsCreated} child jobs`);

        return new Response(JSON.stringify({
            success: true,
            documents_count: allDocuments.length,
            passages_count: allPassages.length,
            claims_count: allClaims.length,
            child_jobs_created: childJobsCreated,
            execution_time_ms: Date.now() - startTime
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("LBD Expand error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
