import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ML SCORING ENGINE
 * 
 * Machine Learning scoring for Discovery Engine:
 * 1. Collaborative filtering based on user feedback patterns
 * 2. Content-based scoring using entity similarity
 * 3. Engagement-weighted ranking
 * 4. Recency boosting
 * 5. Diversity optimization
 */

interface MLRequest {
    action: 'score' | 'recommend' | 'record_feedback' | 'update_patterns' | 'get_similar';
    user_id?: string;
    discovery_id?: string;
    feedback_type?: string;
    context?: Record<string, any>;
    limit?: number;
}

interface ScoredDiscovery {
    id: string;
    title: string;
    ml_score: number;
    engagement_score: number;
    confidence: number;
    factors: Record<string, number>;
}

// ============================================
// SCORING ALGORITHMS
// ============================================

function calculateContentScore(discovery: any, patterns: any[]): number {
    let score = 0.5;
    let factors = 0;

    // Match against learned patterns
    for (const pattern of patterns) {
        const key = pattern.pattern_key.toLowerCase();
        const title = (discovery.title || '').toLowerCase();
        const hypothesis = (discovery.hypothesis || '').toLowerCase();

        if (title.includes(key) || hypothesis.includes(key)) {
            score += pattern.relevance_score * 0.1;
            factors++;
        }
    }

    // Novelty preference (emerging > novel > known)
    const noveltyScores: Record<string, number> = {
        'novel': 0.8,
        'emerging': 0.7,
        'unknown': 0.6,
        'controversial': 0.5,
        'known': 0.4
    };
    score += (noveltyScores[discovery.novelty] || 0.5) * 0.15;

    // Evidence level weight
    const evidenceScores: Record<string, number> = {
        'meta_analysis': 0.9,
        'guideline': 0.85,
        'rct': 0.8,
        'observational': 0.6,
        'case_report': 0.5,
        'in_vitro': 0.4,
        'ai_inferred': 0.3
    };
    score += (evidenceScores[discovery.evidence_level] || 0.5) * 0.2;

    return Math.min(1, Math.max(0, score));
}

function calculateEngagementScore(discovery: any): number {
    const viewCount = discovery.view_count || 0;
    const feedbackCount = discovery.feedback_count || 0;
    const engagementRaw = discovery.engagement_score || 0;

    if (viewCount === 0) return 0.5;

    // Engagement rate = engagement per view
    const engagementRate = engagementRaw / (viewCount * 5);

    // Confidence based on sample size
    const confidence = Math.min(1, viewCount / 20);

    // Blend with prior (0.5) based on confidence
    return 0.5 * (1 - confidence) + Math.min(1, engagementRate) * confidence;
}

function calculateRecencyScore(createdAt: string): number {
    const now = new Date();
    const created = new Date(createdAt);
    const hoursAgo = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

    if (hoursAgo < 1) return 1.0;
    if (hoursAgo < 6) return 0.9;
    if (hoursAgo < 24) return 0.8;
    if (hoursAgo < 72) return 0.6;
    if (hoursAgo < 168) return 0.4;
    return 0.2;
}

function calculateDiversityPenalty(discovery: any, selectedIds: Set<string>, discoveries: any[]): number {
    // Penalize if too similar to already selected
    let penalty = 0;

    const thisTitle = (discovery.title || '').toLowerCase();
    const thisNovelty = discovery.novelty;

    for (const id of selectedIds) {
        const other = discoveries.find(d => d.id === id);
        if (!other) continue;

        const otherTitle = (other.title || '').toLowerCase();

        // Same novelty type penalty
        if (other.novelty === thisNovelty) penalty += 0.1;

        // Similar title penalty (simple word overlap)
        const thisWords = new Set(thisTitle.split(/\s+/));
        const otherWords = new Set(otherTitle.split(/\s+/));
        const overlap = [...thisWords].filter(w => otherWords.has(w) && w.length > 3).length;
        if (overlap > 2) penalty += 0.1;
    }

    return Math.min(0.5, penalty);
}

// ============================================
// MAIN FUNCTIONS
// ============================================

async function scoreDiscoveries(supabase: any, userId?: string): Promise<ScoredDiscovery[]> {
    // Fetch discoveries
    const { data: discoveries, error: discError } = await supabase
        .from('discovery_cards')
        .select('*')
        .not('status', 'eq', 'refuted')
        .order('created_at', { ascending: false })
        .limit(100);

    if (discError || !discoveries) {
        throw new Error(`Failed to fetch discoveries: ${discError?.message}`);
    }

    // Fetch learned patterns
    const { data: patterns } = await supabase
        .from('ml_patterns')
        .select('*')
        .order('relevance_score', { ascending: false })
        .limit(50);

    // Fetch user's feedback history if logged in
    let userFeedback: any[] = [];
    if (userId) {
        const { data } = await supabase
            .from('discovery_feedback')
            .select('discovery_id, feedback_type')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);
        userFeedback = data || [];
    }

    // Build user preference map
    const userPrefs = new Map<string, number>();
    for (const fb of userFeedback) {
        const current = userPrefs.get(fb.discovery_id) || 0;
        const delta = fb.feedback_type === 'confirm' || fb.feedback_type === 'mark_useful' ? 1 :
            fb.feedback_type === 'refute' || fb.feedback_type === 'mark_not_useful' ? -1 : 0.1;
        userPrefs.set(fb.discovery_id, current + delta);
    }

    // Score each discovery
    const scored: ScoredDiscovery[] = [];

    for (const disc of discoveries) {
        const contentScore = calculateContentScore(disc, patterns || []);
        const engagementScore = calculateEngagementScore(disc);
        const recencyScore = calculateRecencyScore(disc.created_at);

        // User preference boost
        let userBoost = 0;
        if (userPrefs.has(disc.id)) {
            userBoost = Math.max(-0.2, Math.min(0.2, userPrefs.get(disc.id)! * 0.1));
        }

        // Validation boost
        const validationBoost = disc.validation_status === 'validated' ? 0.1 :
            disc.validation_status === 'needs_review' ? 0.05 : 0;

        // Plausibility/severity from original scores
        const plausibilityScore = disc.plausibility_score || 0.5;
        const severityScore = disc.severity_score || 0.5;

        // Composite ML score
        const mlScore =
            contentScore * 0.2 +
            engagementScore * 0.2 +
            recencyScore * 0.15 +
            plausibilityScore * 0.2 +
            severityScore * 0.1 +
            validationBoost +
            userBoost;

        // Confidence based on data availability
        const confidence = Math.min(1,
            (disc.view_count > 0 ? 0.3 : 0) +
            (disc.feedback_count > 0 ? 0.3 : 0) +
            (patterns && patterns.length > 0 ? 0.2 : 0) +
            (disc.validation_status ? 0.2 : 0)
        );

        scored.push({
            id: disc.id,
            title: disc.title,
            ml_score: Math.min(1, Math.max(0, mlScore)),
            engagement_score: engagementScore,
            confidence,
            factors: {
                content: contentScore,
                engagement: engagementScore,
                recency: recencyScore,
                plausibility: plausibilityScore,
                severity: severityScore,
                validation: validationBoost,
                user_preference: userBoost
            }
        });
    }

    // Sort by ML score
    scored.sort((a, b) => b.ml_score - a.ml_score);

    return scored;
}

async function getRecommendations(supabase: any, userId?: string, limit: number = 10): Promise<ScoredDiscovery[]> {
    const allScored = await scoreDiscoveries(supabase, userId);

    // Apply diversity optimization
    const recommendations: ScoredDiscovery[] = [];
    const selectedIds = new Set<string>();

    // Get raw discovery data for diversity check
    const { data: discoveries } = await supabase
        .from('discovery_cards')
        .select('id, title, novelty')
        .in('id', allScored.map(s => s.id));

    for (const scored of allScored) {
        if (recommendations.length >= limit) break;

        const penalty = calculateDiversityPenalty(
            discoveries?.find((d: any) => d.id === scored.id) || {},
            selectedIds,
            discoveries || []
        );

        const adjustedScore = scored.ml_score - penalty;

        if (adjustedScore > 0.3 || recommendations.length < limit / 2) {
            recommendations.push({
                ...scored,
                ml_score: adjustedScore
            });
            selectedIds.add(scored.id);
        }
    }

    return recommendations;
}

async function recordFeedback(
    supabase: any,
    discoveryId: string,
    userId: string,
    feedbackType: string,
    context: Record<string, any>
): Promise<void> {
    // Use the SQL function for atomic update
    const { error } = await supabase.rpc('record_discovery_feedback', {
        p_discovery_id: discoveryId,
        p_user_id: userId,
        p_feedback_type: feedbackType,
        p_context: context
    });

    if (error) {
        throw new Error(`Failed to record feedback: ${error.message}`);
    }
}

async function findSimilar(supabase: any, discoveryId: string, limit: number = 5): Promise<ScoredDiscovery[]> {
    // Fetch the source discovery
    const { data: source } = await supabase
        .from('discovery_cards')
        .select('*')
        .eq('id', discoveryId)
        .single();

    if (!source) {
        throw new Error('Discovery not found');
    }

    // Fetch all discoveries
    const { data: all } = await supabase
        .from('discovery_cards')
        .select('*')
        .not('id', 'eq', discoveryId)
        .not('status', 'eq', 'refuted')
        .limit(50);

    if (!all) return [];

    // Score by similarity
    const similar: ScoredDiscovery[] = [];
    const sourceTitle = (source.title || '').toLowerCase();
    const sourceWords = new Set(sourceTitle.split(/\s+/).filter((w: string) => w.length > 3));

    for (const disc of all) {
        const discTitle = (disc.title || '').toLowerCase();
        const discWords = new Set(discTitle.split(/\s+/).filter((w: string) => w.length > 3));

        // Word overlap
        const overlap = [...sourceWords].filter(w => discWords.has(w)).length;
        const overlapScore = overlap / Math.max(sourceWords.size, 1);

        // Same novelty/evidence
        const noveltyMatch = source.novelty === disc.novelty ? 0.2 : 0;
        const evidenceMatch = source.evidence_level === disc.evidence_level ? 0.1 : 0;

        const similarityScore = overlapScore * 0.6 + noveltyMatch + evidenceMatch;

        if (similarityScore > 0.2) {
            similar.push({
                id: disc.id,
                title: disc.title,
                ml_score: similarityScore,
                engagement_score: disc.engagement_score || 0,
                confidence: 0.7,
                factors: {
                    word_overlap: overlapScore,
                    novelty_match: noveltyMatch,
                    evidence_match: evidenceMatch
                }
            });
        }
    }

    similar.sort((a, b) => b.ml_score - a.ml_score);
    return similar.slice(0, limit);
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: MLRequest = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        let result: any;

        switch (request.action) {
            case 'score':
                result = await scoreDiscoveries(supabase, request.user_id);
                break;

            case 'recommend':
                result = await getRecommendations(supabase, request.user_id, request.limit || 10);
                break;

            case 'record_feedback':
                if (!request.discovery_id || !request.user_id || !request.feedback_type) {
                    throw new Error('Missing required fields for feedback');
                }
                await recordFeedback(
                    supabase,
                    request.discovery_id,
                    request.user_id,
                    request.feedback_type,
                    request.context || {}
                );
                result = { success: true };
                break;

            case 'get_similar':
                if (!request.discovery_id) {
                    throw new Error('Missing discovery_id');
                }
                result = await findSimilar(supabase, request.discovery_id, request.limit || 5);
                break;

            default:
                throw new Error(`Unknown action: ${request.action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("ML scoring error:", error);
        return new Response(
            JSON.stringify({ error: "ML scoring failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
