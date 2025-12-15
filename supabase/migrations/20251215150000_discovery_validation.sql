-- ============================================
-- Hypothesis Validation System
-- Adds validation fields to discovery_cards and creates validation logs table
-- ============================================

-- ============================================
-- PART 1: Add validation fields to discovery_cards
-- ============================================

ALTER TABLE discovery_cards
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending' 
  CHECK (validation_status IN ('pending', 'validating', 'validated', 'needs_review', 'rejected', 'corrected')),
ADD COLUMN IF NOT EXISTS validation_result JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS validation_errors TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS validated_by TEXT, -- 'ai_auto', 'ai_manual', or user UUID
ADD COLUMN IF NOT EXISTS original_hypothesis TEXT, -- Store original if corrected
ADD COLUMN IF NOT EXISTS correction_notes TEXT;

-- Index for filtering by validation status
CREATE INDEX IF NOT EXISTS idx_discovery_validation_status ON discovery_cards(validation_status);

-- ============================================
-- PART 2: Create validation logs table
-- ============================================

CREATE TABLE IF NOT EXISTS discovery_validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_id UUID REFERENCES discovery_cards(id) ON DELETE CASCADE,
  step_index INT, -- Which step in the reasoning chain (1-indexed)
  claim TEXT NOT NULL, -- The claim being verified
  claim_type TEXT, -- 'pharmacokinetic', 'mechanism', 'epidemiological', 'clinical', etc.
  
  -- Verification details
  verification_method TEXT NOT NULL, -- 'pubmed', 'fda_label', 'drugbank', 'ai_cross_check', 'manual'
  verification_query TEXT, -- The query used for verification
  verification_sources JSONB DEFAULT '[]', -- Sources found/consulted
  
  -- Results
  is_valid BOOLEAN,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  error_type TEXT, -- 'factual_error', 'unsupported_claim', 'contradicted_by_source', 'mechanism_error'
  error_details TEXT,
  correct_information TEXT, -- What the correct info should be
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  verified_by TEXT -- 'ai' or user UUID
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_validation_logs_discovery ON discovery_validation_logs(discovery_id);
CREATE INDEX IF NOT EXISTS idx_validation_logs_valid ON discovery_validation_logs(is_valid);

-- RLS
ALTER TABLE discovery_validation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read validation logs" ON discovery_validation_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access validation logs" ON discovery_validation_logs
  FOR ALL TO service_role USING (true);

-- ============================================
-- PART 3: Function to calculate overall validation score
-- ============================================

CREATE OR REPLACE FUNCTION calculate_discovery_validation_score(p_discovery_id UUID)
RETURNS FLOAT
LANGUAGE plpgsql
AS $$
DECLARE
  v_avg_confidence FLOAT;
  v_invalid_count INT;
  v_total_count INT;
  v_score FLOAT;
BEGIN
  -- Get validation stats
  SELECT 
    AVG(confidence_score),
    COUNT(*) FILTER (WHERE is_valid = false),
    COUNT(*)
  INTO v_avg_confidence, v_invalid_count, v_total_count
  FROM discovery_validation_logs
  WHERE discovery_id = p_discovery_id;
  
  IF v_total_count = 0 THEN
    RETURN NULL;
  END IF;
  
  -- Calculate score: average confidence penalized by invalid claims
  v_score := COALESCE(v_avg_confidence, 0.5) * (1 - (v_invalid_count::FLOAT / v_total_count));
  
  RETURN v_score;
END;
$$;

-- ============================================
-- PART 4: Function to update discovery validation status based on logs
-- ============================================

CREATE OR REPLACE FUNCTION update_discovery_validation_status(p_discovery_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_score FLOAT;
  v_has_errors BOOLEAN;
  v_new_status TEXT;
BEGIN
  v_score := calculate_discovery_validation_score(p_discovery_id);
  
  IF v_score IS NULL THEN
    v_new_status := 'pending';
  ELSIF v_score >= 0.8 THEN
    v_new_status := 'validated';
  ELSIF v_score >= 0.5 THEN
    v_new_status := 'needs_review';
  ELSE
    v_new_status := 'rejected';
  END IF;
  
  -- Check for critical errors
  SELECT EXISTS(
    SELECT 1 FROM discovery_validation_logs 
    WHERE discovery_id = p_discovery_id 
      AND is_valid = false 
      AND error_type = 'factual_error'
  ) INTO v_has_errors;
  
  IF v_has_errors AND v_new_status = 'validated' THEN
    v_new_status := 'needs_review';
  END IF;
  
  -- Update discovery card
  UPDATE discovery_cards
  SET 
    validation_status = v_new_status,
    validation_result = jsonb_build_object(
      'score', v_score,
      'has_critical_errors', v_has_errors,
      'logs_count', (SELECT COUNT(*) FROM discovery_validation_logs WHERE discovery_id = p_discovery_id)
    ),
    validated_at = CASE WHEN v_new_status != 'pending' THEN now() ELSE NULL END
  WHERE id = p_discovery_id;
  
  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_discovery_validation_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_discovery_validation_status(UUID) TO authenticated;
