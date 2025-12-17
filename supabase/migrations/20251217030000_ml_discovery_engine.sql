-- Migration: Machine Learning for Discovery Engine
-- Adds tables for learning from user feedback and improving recommendations

-- ============================================
-- SECTION 1: USER FEEDBACK & INTERACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS discovery_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discovery_id UUID NOT NULL REFERENCES discovery_cards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    
    -- Feedback type
    feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        'confirm',           -- User confirmed the discovery
        'refute',            -- User refuted the discovery
        'mark_useful',       -- User marked as useful
        'mark_not_useful',   -- User marked as not useful
        'view',              -- Implicit: user viewed the discovery
        'expand',            -- Implicit: user expanded details
        'validate_request',  -- User requested validation
        'share',             -- User shared the discovery
        'bookmark',          -- User bookmarked
        'apply_action'       -- User applied a recommended action
    )),
    
    -- Context when feedback was given
    context JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_feedback_discovery ON discovery_feedback(discovery_id);
CREATE INDEX IF NOT EXISTS idx_discovery_feedback_user ON discovery_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_feedback_type ON discovery_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_discovery_feedback_created ON discovery_feedback(created_at);

-- ============================================
-- SECTION 2: LEARNED PATTERNS
-- ============================================

CREATE TABLE IF NOT EXISTS ml_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Pattern identification
    pattern_type TEXT NOT NULL CHECK (pattern_type IN (
        'entity_pair',           -- Specific pathology-medication pair
        'drug_class',            -- Drug class pattern
        'symptom_cluster',       -- Group of symptoms often together
        'user_preference',       -- User-specific preferences
        'evidence_weight',       -- How users weight evidence levels
        'novelty_preference',    -- Preference for novel vs known
        'severity_threshold'     -- User's severity interest threshold
    )),
    
    -- Pattern key (normalized)
    pattern_key TEXT NOT NULL,
    
    -- Learned weights
    positive_count INTEGER DEFAULT 0,
    negative_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    engagement_score NUMERIC DEFAULT 0,
    
    -- Computed scores (updated by ML function)
    relevance_score NUMERIC DEFAULT 0.5,
    quality_score NUMERIC DEFAULT 0.5,
    
    -- Last updated
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(pattern_type, pattern_key)
);

CREATE INDEX idx_ml_patterns_type ON ml_patterns(pattern_type);
CREATE INDEX idx_ml_patterns_key ON ml_patterns(pattern_key);
CREATE INDEX idx_ml_patterns_relevance ON ml_patterns(relevance_score DESC);

-- ============================================
-- SECTION 3: DISCOVERY SCORES (ML-enhanced)
-- ============================================

-- Add ML columns to discovery_cards if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discovery_cards' AND column_name = 'ml_score') THEN
        ALTER TABLE discovery_cards ADD COLUMN ml_score NUMERIC DEFAULT 0.5;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discovery_cards' AND column_name = 'engagement_score') THEN
        ALTER TABLE discovery_cards ADD COLUMN engagement_score NUMERIC DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discovery_cards' AND column_name = 'view_count') THEN
        ALTER TABLE discovery_cards ADD COLUMN view_count INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discovery_cards' AND column_name = 'feedback_count') THEN
        ALTER TABLE discovery_cards ADD COLUMN feedback_count INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'discovery_cards' AND column_name = 'ml_features') THEN
        ALTER TABLE discovery_cards ADD COLUMN ml_features JSONB DEFAULT '{}';
    END IF;
END $$;

-- ============================================
-- SECTION 4: RECOMMENDATION CACHE
-- ============================================

CREATE TABLE IF NOT EXISTS ml_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    
    -- Recommendation context
    context_type TEXT NOT NULL CHECK (context_type IN (
        'homepage',          -- General homepage recommendations
        'patient_context',   -- Based on patient being viewed
        'research_context',  -- Based on current research topic
        'similar_users'      -- Based on similar users' interests
    )),
    context_data JSONB DEFAULT '{}',
    
    -- Recommended discoveries
    discovery_ids UUID[] NOT NULL,
    scores NUMERIC[] NOT NULL,
    
    -- Validity
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX idx_ml_recommendations_user ON ml_recommendations(user_id);
CREATE INDEX idx_ml_recommendations_context ON ml_recommendations(context_type);
CREATE INDEX idx_ml_recommendations_expires ON ml_recommendations(expires_at);

-- ============================================
-- SECTION 5: RLS POLICIES
-- ============================================

ALTER TABLE discovery_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_recommendations ENABLE ROW LEVEL SECURITY;

-- Feedback: users can add their own, read aggregate
CREATE POLICY "Users can insert their feedback" ON discovery_feedback
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can read all feedback" ON discovery_feedback
    FOR SELECT USING (true);

-- Patterns: read for all, write for service
CREATE POLICY "Read patterns" ON ml_patterns FOR SELECT USING (true);
CREATE POLICY "Service write patterns" ON ml_patterns FOR ALL USING (true);

-- Recommendations: users see their own
CREATE POLICY "Users read own recommendations" ON ml_recommendations
    FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Service write recommendations" ON ml_recommendations
    FOR ALL USING (true);

-- ============================================
-- SECTION 6: HELPER FUNCTIONS
-- ============================================

-- Function to record feedback and update patterns
CREATE OR REPLACE FUNCTION record_discovery_feedback(
    p_discovery_id UUID,
    p_user_id UUID,
    p_feedback_type TEXT,
    p_context JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_discovery RECORD;
    v_pattern_key TEXT;
BEGIN
    -- Insert feedback
    INSERT INTO discovery_feedback (discovery_id, user_id, feedback_type, context)
    VALUES (p_discovery_id, p_user_id, p_feedback_type, p_context);
    
    -- Get discovery info
    SELECT * INTO v_discovery FROM discovery_cards WHERE id = p_discovery_id;
    
    IF v_discovery IS NULL THEN RETURN; END IF;
    
    -- Update discovery counters
    UPDATE discovery_cards SET
        view_count = view_count + CASE WHEN p_feedback_type = 'view' THEN 1 ELSE 0 END,
        feedback_count = feedback_count + 1,
        engagement_score = engagement_score + 
            CASE p_feedback_type
                WHEN 'confirm' THEN 10
                WHEN 'refute' THEN 5
                WHEN 'mark_useful' THEN 8
                WHEN 'mark_not_useful' THEN 3
                WHEN 'view' THEN 1
                WHEN 'expand' THEN 2
                WHEN 'validate_request' THEN 5
                WHEN 'share' THEN 7
                WHEN 'bookmark' THEN 6
                WHEN 'apply_action' THEN 15
                ELSE 1
            END
    WHERE id = p_discovery_id;
    
    -- Update ML patterns based on title/novelty
    v_pattern_key := v_discovery.novelty || ':' || LOWER(SUBSTRING(v_discovery.title FROM 1 FOR 50));
    
    INSERT INTO ml_patterns (pattern_type, pattern_key, positive_count, negative_count, view_count)
    VALUES ('entity_pair', v_pattern_key, 
            CASE WHEN p_feedback_type IN ('confirm', 'mark_useful', 'bookmark', 'apply_action') THEN 1 ELSE 0 END,
            CASE WHEN p_feedback_type IN ('refute', 'mark_not_useful') THEN 1 ELSE 0 END,
            CASE WHEN p_feedback_type = 'view' THEN 1 ELSE 0 END)
    ON CONFLICT (pattern_type, pattern_key) DO UPDATE SET
        positive_count = ml_patterns.positive_count + EXCLUDED.positive_count,
        negative_count = ml_patterns.negative_count + EXCLUDED.negative_count,
        view_count = ml_patterns.view_count + EXCLUDED.view_count,
        updated_at = NOW();
    
    -- Update relevance score
    UPDATE ml_patterns SET
        relevance_score = CASE 
            WHEN (positive_count + negative_count) > 0 
            THEN positive_count::NUMERIC / (positive_count + negative_count)
            ELSE 0.5
        END,
        engagement_score = view_count + (positive_count * 2) - negative_count
    WHERE pattern_type = 'entity_pair' AND pattern_key = v_pattern_key;
    
END;
$$;

-- Function to get ML-enhanced recommendations
CREATE OR REPLACE FUNCTION get_ml_recommendations(
    p_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    discovery_id UUID,
    title TEXT,
    ml_score NUMERIC,
    engagement_score NUMERIC,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.title,
        -- Composite ML score
        (
            COALESCE(d.ml_score, 0.5) * 0.3 +
            COALESCE(d.plausibility_score, 0.5) * 0.25 +
            COALESCE(d.severity_score, 0.5) * 0.15 +
            CASE WHEN d.view_count > 0 
                THEN LEAST(d.engagement_score::NUMERIC / (d.view_count * 5), 1)
                ELSE 0.5
            END * 0.2 +
            CASE d.validation_status
                WHEN 'validated' THEN 0.1
                WHEN 'needs_review' THEN 0.05
                ELSE 0
            END
        ) AS ml_score,
        COALESCE(d.engagement_score, 0)::NUMERIC,
        d.created_at
    FROM discovery_cards d
    WHERE d.status NOT IN ('refuted')
    ORDER BY 
        -- Prioritize recent + high engagement
        (
            COALESCE(d.ml_score, 0.5) * 0.4 +
            COALESCE(d.engagement_score, 0) / 100.0 * 0.3 +
            CASE WHEN d.created_at > NOW() - INTERVAL '24 hours' THEN 0.3 ELSE 0.1 END
        ) DESC
    LIMIT p_limit;
END;
$$;
