import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// CONTINUOUS DISCOVERY PIPELINE
// Automated literature monitoring, delta ingestion,
// contradiction detection, and alerting
// ============================================

interface PipelineConfig {
    queries: string[];              // Monitored search queries
    check_interval_hours: number;   // How often to check (default: 24)
    max_papers_per_query: number;   // Limit per query
    alert_on_contradictions: boolean;
    alert_on_new_evidence: boolean;
}

interface Alert {
    type: 'new_evidence' | 'contradiction' | 'high_impact' | 'breakthrough';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    papers?: string[];
    created_at: string;
}

interface DeltaResult {
    query: string;
    new_papers: number;
    updated_papers: number;
    alerts: Alert[];
    last_checked: string;
}

// ============================================
// PUBMED DELTA FETCHER
// ============================================

async function fetchPubMedDelta(
    query: string,
    sinceDate: Date,
    maxResults: number = 50
): Promise<any[]> {
    const apiKey = Deno.env.get("NCBI_API_KEY");
    const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '/');

    // Add date filter to query
    const fullQuery = `${query} AND ("${dateStr}"[Date - Create] : "3000"[Date - Create])`;

    let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(fullQuery)}&retmax=${maxResults}&retmode=json&sort=date`;
    if (apiKey) searchUrl += `&api_key=${apiKey}`;

    try {
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        const ids = searchData?.esearchresult?.idlist || [];

        if (ids.length === 0) return [];

        // Wait for rate limiting
        await new Promise(r => setTimeout(r, 350));

        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (apiKey) fetchUrl += `&api_key=${apiKey}`;

        const fetchResponse = await fetch(fetchUrl);
        const xmlText = await fetchResponse.text();

        const papers: any[] = [];
        const xmlArticles = xmlText.split('</PubmedArticle>');

        for (const articleXml of xmlArticles) {
            if (!articleXml.includes('<PubmedArticle>')) continue;

            const idMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
            const pmid = idMatch ? idMatch[1] : '';
            if (!pmid) continue;

            const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
            const title = titleMatch ? titleMatch[1] : "Sans titre";

            const abstractMatches = [...articleXml.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ");

            const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
            const journal = journalMatch ? journalMatch[1] : "";

            const yearMatch = articleXml.match(/<Year>(.*?)<\/Year>/);
            const pubDate = yearMatch ? yearMatch[1] : "";

            papers.push({
                pmid,
                title,
                abstract,
                journal,
                publication_date: pubDate,
                source: 'pubmed'
            });
        }

        return papers;
    } catch (error) {
        console.error('PubMed delta fetch error:', error);
        return [];
    }
}

// ============================================
// CLINICAL TRIALS DELTA
// ============================================

async function fetchClinicalTrialsDelta(
    query: string,
    sinceDate: Date,
    maxResults: number = 20
): Promise<any[]> {
    const dateStr = sinceDate.toISOString().split('T')[0];

    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&filter.advanced=AREA[LastUpdatePostDate]RANGE[${dateStr},MAX]&pageSize=${maxResults}`;

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();

        return (data?.studies || []).map((study: any) => {
            const protocol = study.protocolSection || {};
            const identification = protocol.identificationModule || {};
            const description = protocol.descriptionModule || {};

            return {
                nct_id: identification.nctId,
                title: identification.briefTitle || identification.officialTitle,
                abstract: description.briefSummary,
                source: 'clinicaltrials',
                updated_at: study.lastUpdatePostDateStruct?.date
            };
        });
    } catch (error) {
        console.error('ClinicalTrials delta fetch error:', error);
        return [];
    }
}

// ============================================
// CONTRADICTION DETECTION
// ============================================

function detectContradictions(
    existingClaims: Array<{ subject: string; relation: string; object: string; papers: string[] }>,
    newClaims: Array<{ subject: string; relation: string; object: string; paper: string }>
): Alert[] {
    const alerts: Alert[] = [];

    const OPPOSITE_RELATIONS: Record<string, string[]> = {
        'INHIBITS': ['ACTIVATES', 'INCREASES', 'PROMOTES'],
        'ACTIVATES': ['INHIBITS', 'DECREASES', 'BLOCKS'],
        'INCREASES': ['DECREASES', 'REDUCES', 'INHIBITS'],
        'DECREASES': ['INCREASES', 'ENHANCES', 'ACTIVATES'],
        'TREATS': ['CAUSES', 'WORSENS'],
        'CAUSES': ['TREATS', 'PREVENTS', 'PROTECTS']
    };

    for (const newClaim of newClaims) {
        const opposites = OPPOSITE_RELATIONS[newClaim.relation] || [];

        for (const existing of existingClaims) {
            // Check if same subject-object pair with opposite relation
            if (
                existing.subject.toLowerCase() === newClaim.subject.toLowerCase() &&
                existing.object.toLowerCase() === newClaim.object.toLowerCase() &&
                opposites.includes(existing.relation)
            ) {
                alerts.push({
                    type: 'contradiction',
                    severity: 'warning',
                    title: `Contradiction détectée: ${newClaim.subject} → ${newClaim.object}`,
                    message: `Nouvel article (PMID:${newClaim.paper}) suggère "${newClaim.relation}" alors que ${existing.papers.length} article(s) précédent(s) suggèrent "${existing.relation}"`,
                    papers: [newClaim.paper, ...existing.papers],
                    created_at: new Date().toISOString()
                });
            }
        }
    }

    return alerts;
}

// ============================================
// BREAKTHROUGH DETECTION
// ============================================

function detectBreakthroughs(papers: any[]): Alert[] {
    const alerts: Alert[] = [];

    const BREAKTHROUGH_PATTERNS = [
        /\b(first|novel|breakthrough|revolutionary|paradigm.?shift)\b/gi,
        /\b(cure|remission|complete.?response|fully.?restores?)\b/gi,
        /\b(phase\s*[III3]|FDA\s*approv|EMA\s*approv)\b/gi
    ];

    for (const paper of papers) {
        const text = `${paper.title} ${paper.abstract || ''}`;

        for (const pattern of BREAKTHROUGH_PATTERNS) {
            if (pattern.test(text)) {
                alerts.push({
                    type: 'breakthrough',
                    severity: 'critical',
                    title: `Découverte potentielle: ${paper.title.slice(0, 60)}...`,
                    message: `Un nouvel article suggère une avancée significative. Vérification recommandée.`,
                    papers: [paper.pmid || paper.nct_id],
                    created_at: new Date().toISOString()
                });
                break; // One alert per paper
            }
        }
    }

    return alerts;
}

// ============================================
// MAIN PIPELINE
// ============================================

async function runPipeline(
    supabase: any,
    config: PipelineConfig
): Promise<DeltaResult[]> {
    const results: DeltaResult[] = [];

    for (const query of config.queries) {
        // Get last check time from database
        const { data: sessionData } = await supabase
            .from('discovery_research_sessions')
            .select('created_at')
            .eq('query', query)
            .eq('session_type', 'delta_check')
            .order('created_at', { ascending: false })
            .limit(1);

        const lastCheck = sessionData?.[0]?.created_at
            ? new Date(sessionData[0].created_at)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: 7 days ago

        // Fetch new papers
        const [pubmedPapers, trialsPapers] = await Promise.all([
            fetchPubMedDelta(query, lastCheck, config.max_papers_per_query),
            fetchClinicalTrialsDelta(query, lastCheck, 10)
        ]);

        const allNewPapers = [...pubmedPapers, ...trialsPapers];
        const alerts: Alert[] = [];

        // Save new papers to database
        for (const paper of allNewPapers) {
            const { error } = await supabase
                .from('discovery_papers')
                .upsert({
                    pmid: paper.pmid,
                    title: paper.title,
                    abstract: paper.abstract,
                    journal: paper.journal,
                    publication_date: paper.publication_date,
                    source: paper.source
                }, { onConflict: 'pmid' });

            if (error) console.error('Paper insert error:', error);
        }

        // Detect breakthroughs
        if (config.alert_on_new_evidence) {
            const breakthroughAlerts = detectBreakthroughs(allNewPapers);
            alerts.push(...breakthroughAlerts);
        }

        // Log session
        await supabase.from('discovery_research_sessions').insert({
            session_type: 'delta_check',
            query,
            parameters: { config },
            results_summary: {
                new_papers: allNewPapers.length,
                alerts: alerts.length
            },
            success: true
        });

        // Save alerts
        for (const alert of alerts) {
            const { error: alertError } = await supabase.from('discovery_alerts').insert(alert);
            if (alertError) console.error('Alert insert error:', alertError.message);
        }

        results.push({
            query,
            new_papers: allNewPapers.length,
            updated_papers: 0,
            alerts,
            last_checked: new Date().toISOString()
        });
    }

    return results;
}

// ============================================
// HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { action, config } = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Supabase configuration missing");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        switch (action) {
            case 'run_delta': {
                const pipelineConfig: PipelineConfig = {
                    queries: config?.queries || ['Parkinson neuroinflammation', 'Alzheimer TREM2'],
                    check_interval_hours: config?.check_interval_hours || 24,
                    max_papers_per_query: config?.max_papers_per_query || 30,
                    alert_on_contradictions: config?.alert_on_contradictions ?? true,
                    alert_on_new_evidence: config?.alert_on_new_evidence ?? true
                };

                const results = await runPipeline(supabase, pipelineConfig);

                return new Response(
                    JSON.stringify({
                        success: true,
                        results,
                        total_new_papers: results.reduce((sum, r) => sum + r.new_papers, 0),
                        total_alerts: results.reduce((sum, r) => sum + r.alerts.length, 0)
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            case 'get_alerts': {
                const { data: alerts, error } = await supabase
                    .from('discovery_alerts')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;

                return new Response(
                    JSON.stringify({ alerts: alerts || [] }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            case 'get_pipeline_status': {
                const { data: sessions } = await supabase
                    .from('discovery_research_sessions')
                    .select('query, created_at, results_summary')
                    .eq('session_type', 'delta_check')
                    .order('created_at', { ascending: false })
                    .limit(10);

                return new Response(
                    JSON.stringify({
                        recent_runs: sessions || [],
                        status: 'active'
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            default:
                return new Response(
                    JSON.stringify({
                        error: "Unknown action",
                        available_actions: ['run_delta', 'get_alerts', 'get_pipeline_status']
                    }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
        }
    } catch (error) {
        console.error("Continuous discovery pipeline error:", error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
