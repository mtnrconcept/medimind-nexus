import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// EVIDENCE PACK BUILDER
// Assembles context for Claude hypothesis generation
// ============================================

interface Paper {
    id?: string;
    pmid?: string;
    pmcid?: string;
    doi?: string;
    title: string;
    abstract?: string;
    source: string;
}

interface EvidenceSnippet {
    paper_id: string;
    passage: string;
    entities: string[];
    claim_tags: string[];
    confidence: number;
}

interface EvidencePack {
    id?: string;
    query_intent: {
        disease?: string;
        target?: string;
        focus?: string;
        keywords?: string[];
    };
    papers: Paper[];
    snippets: EvidenceSnippet[];
    graph_neighborhood: {
        nodes: any[];
        edges: any[];
    };
    trials_context: any[];
    total_papers: number;
    total_snippets: number;
    created_at: string;
}

// Entity extraction patterns
const ENTITY_PATTERNS = {
    genes: /\b([A-Z][A-Z0-9]{1,10})\b/g,
    proteins: /\b(IL-\d+[a-z]?|TNF-?α?|NF-κB|NLRP3|TREM2|TLR\d|CD\d+|STAT\d|JAK\d|MAPK|ERK|AKT|mTOR)\b/gi,
    diseases: /\b(Parkinson|Alzheimer|sclerosis|diabetes|cancer|carcinoma|leukemia|lymphoma|arthritis|lupus|Crohn|colitis|asthma|COPD|hypertension|stroke|infarction|depression|schizophrenia|autism|epilepsy)\b/gi,
    drugs: /\b(aspirin|ibuprofen|metformin|statin|inhibitor|agonist|antagonist|blocker|antibody|vaccine)\b/gi,
    pathways: /\b(pathway|signaling|cascade|axis|loop|cycle|metabolism|glycolysis|oxidative|mitochondrial|apoptosis|autophagy|inflammation|immune)\b/gi,
};

// Claim tag patterns
const CLAIM_PATTERNS = {
    INHIBITS: /\b(inhibit|block|suppress|reduce|decrease|attenuate|prevent|impair|downregulate)\b/gi,
    ACTIVATES: /\b(activate|induce|enhance|increase|stimulate|promote|upregulate|trigger|amplify)\b/gi,
    ASSOCIATED_WITH: /\b(associated|correlat|linked|related|connection|relationship)\b/gi,
    CAUSES: /\b(cause|lead to|result in|trigger|produce|generate)\b/gi,
    TREATS: /\b(treat|therapeutic|ameliorate|improve|alleviate|remedy|cure)\b/gi,
    NEUROPROTECTIVE: /\b(neuroprotect|protect|preserve|maintain|safeguard)\b/gi,
    BIOMARKER: /\b(biomarker|marker|indicator|predictor|signature)\b/gi,
};

function extractEntities(text: string): string[] {
    const entities = new Set<string>();

    for (const [, pattern] of Object.entries(ENTITY_PATTERNS)) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(m => entities.add(m.trim()));
        }
    }

    return [...entities].slice(0, 20); // Limit to 20 entities
}

function extractClaimTags(text: string): string[] {
    const tags = new Set<string>();
    const lowerText = text.toLowerCase();

    for (const [tag, pattern] of Object.entries(CLAIM_PATTERNS)) {
        if (pattern.test(lowerText)) {
            tags.add(tag);
        }
    }

    return [...tags];
}

function parseQueryIntent(query: string): EvidencePack['query_intent'] {
    const lowerQuery = query.toLowerCase();
    const words = query.split(/\s+/);

    // Try to identify disease
    let disease: string | undefined;
    for (const pattern of [
        /\b(Parkinson|Alzheimer|cancer|diabetes|sclerosis|arthritis|lupus|Crohn|colitis|asthma|COPD|hypertension|stroke|depression|schizophrenia|epilepsy)\b/i
    ]) {
        const match = query.match(pattern);
        if (match) {
            disease = match[1];
            break;
        }
    }

    // Try to identify focus/target
    let focus: string | undefined;
    const focusPatterns = [
        /(?:et|and|in|with)\s+(\w+)/i,
        /(\w+)(?:\s+et|\s+and|\s+in|\s+with)/i,
    ];
    for (const pattern of focusPatterns) {
        const match = query.match(pattern);
        if (match && match[1] !== disease) {
            focus = match[1];
            break;
        }
    }

    return {
        disease,
        focus,
        keywords: words.filter(w => w.length > 3)
    };
}

function buildSnippetFromPaper(paper: Paper): EvidenceSnippet | null {
    if (!paper.abstract) return null;

    // Limit passage length
    const passage = paper.abstract.slice(0, 1500);

    return {
        paper_id: paper.pmid || paper.doi || paper.id || 'unknown',
        passage,
        entities: extractEntities(passage),
        claim_tags: extractClaimTags(passage),
        confidence: 0.7 // Default confidence
    };
}

function buildGraphNeighborhood(snippets: EvidenceSnippet[]): { nodes: any[]; edges: any[] } {
    const nodes = new Map<string, any>();
    const edges: any[] = [];

    // Extract entities and build nodes
    snippets.forEach(snippet => {
        snippet.entities.forEach(entity => {
            if (!nodes.has(entity)) {
                nodes.set(entity, {
                    id: entity,
                    label: entity,
                    type: 'entity',
                    frequency: 1
                });
            } else {
                nodes.get(entity).frequency++;
            }
        });

        // Create edges between co-occurring entities
        for (let i = 0; i < snippet.entities.length; i++) {
            for (let j = i + 1; j < snippet.entities.length; j++) {
                const source = snippet.entities[i];
                const target = snippet.entities[j];

                // Check for claim tags to determine edge type
                const edgeType = snippet.claim_tags.length > 0 ? snippet.claim_tags[0] : 'CO_OCCURS';

                edges.push({
                    source,
                    target,
                    type: edgeType,
                    paper_id: snippet.paper_id
                });
            }
        }
    });

    return {
        nodes: [...nodes.values()],
        edges: edges.slice(0, 50) // Limit edges
    };
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { query, papers, include_graph = true, max_snippets = 30 } = await req.json();

        if (!query || !papers || !Array.isArray(papers)) {
            return new Response(
                JSON.stringify({ error: "Query and papers array are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Parse query intent
        const query_intent = parseQueryIntent(query);

        // Build snippets from papers
        const snippets: EvidenceSnippet[] = papers
            .map(buildSnippetFromPaper)
            .filter((s): s is EvidenceSnippet => s !== null)
            .slice(0, max_snippets);

        // Build graph neighborhood
        const graph_neighborhood = include_graph
            ? buildGraphNeighborhood(snippets)
            : { nodes: [], edges: [] };

        // Separate clinical trials from papers
        const trials_context = papers
            .filter(p => p.source === 'clinicaltrials')
            .map(p => ({
                nct_id: p.pmid, // Using pmid field for NCT ID
                title: p.title,
                summary: p.abstract?.slice(0, 500)
            }));

        const evidence_pack: EvidencePack = {
            query_intent,
            papers: papers.map(p => ({
                id: p.id,
                pmid: p.pmid,
                pmcid: p.pmcid,
                doi: p.doi,
                title: p.title,
                abstract: p.abstract?.slice(0, 500), // Truncate for context size
                source: p.source
            })),
            snippets,
            graph_neighborhood,
            trials_context,
            total_papers: papers.length,
            total_snippets: snippets.length,
            created_at: new Date().toISOString()
        };

        // Optionally save to database
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (supabaseUrl && supabaseKey) {
            try {
                const supabase = createClient(supabaseUrl, supabaseKey);

                const { data, error } = await supabase
                    .from('discovery_evidence_packs')
                    .insert({
                        query_intent: evidence_pack.query_intent,
                        paper_ids: papers.map(p => p.id).filter(Boolean),
                        graph_neighborhood: evidence_pack.graph_neighborhood,
                        trials_context: evidence_pack.trials_context,
                        total_papers: evidence_pack.total_papers,
                        total_snippets: evidence_pack.total_snippets
                    })
                    .select('id')
                    .single();

                if (data) {
                    evidence_pack.id = data.id;
                }
            } catch (dbError) {
                console.error('Database save error (non-blocking):', dbError);
            }
        }

        return new Response(
            JSON.stringify(evidence_pack),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Evidence pack builder error:", error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
