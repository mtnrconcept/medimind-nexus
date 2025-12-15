-- Migration: recommendations_audit
-- Creates table for tracking AI recommendations with full audit trail

-- Note: Using gen_random_uuid() which is available natively in PostgreSQL 13+

-- ============================================
-- RECOMMENDATIONS LOG TABLE
-- ============================================
-- Stores all AI-generated recommendations for audit and compliance

CREATE TABLE IF NOT EXISTS recommendations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  
  -- Recommendation details
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'medication', 'exercise', 'nutrition', 'monitoring', 'lifestyle', 'urgent', 'general'
  )),
  category TEXT NOT NULL CHECK (category IN ('urgent', 'important', 'routine')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  urgency_score INTEGER CHECK (urgency_score >= 1 AND urgency_score <= 10),
  
  -- Context snapshot at time of recommendation
  context_snapshot JSONB NOT NULL DEFAULT '{}',
  -- Contains: lab_results, treatment, pathology, age, gender, medical_notes
  
  -- AI model information
  ai_model_version TEXT DEFAULT 'v1.0',
  ai_confidence_score NUMERIC(3, 2) CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1),
  reasoning TEXT, -- AI's explanation for this recommendation
  
  -- Review workflow
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',     -- Awaiting review
    'accepted',    -- Accepted by clinician
    'rejected',    -- Rejected by clinician
    'modified',    -- Accepted with modifications
    'implemented', -- Action taken
    'expired'      -- No longer relevant
  )),
  
  -- Reviewer information
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  modified_recommendation TEXT, -- If status = 'modified', the altered version
  
  -- Implementation tracking
  implemented_by UUID REFERENCES auth.users(id),
  implemented_at TIMESTAMPTZ,
  implementation_notes TEXT,
  
  -- Outcome tracking
  outcome_status TEXT CHECK (outcome_status IN (
    'pending',
    'positive',    -- Recommendation had positive impact
    'negative',    -- Recommendation had negative impact
    'neutral',     -- No measurable impact
    'unknown'
  )),
  outcome_notes TEXT,
  outcome_recorded_at TIMESTAMPTZ,
  outcome_recorded_by UUID REFERENCES auth.users(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- Optional expiration for time-sensitive recommendations
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_recommendations_patient ON recommendations_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations_log(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations_log(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_created ON recommendations_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_urgency ON recommendations_log(urgency_score DESC);

-- ============================================
-- RECOMMENDATION ACTIONS TABLE
-- ============================================
-- Tracks all actions taken on a recommendation (for detailed audit trail)

CREATE TABLE IF NOT EXISTS recommendation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendations_log(id) ON DELETE CASCADE,
  
  action_type TEXT NOT NULL CHECK (action_type IN (
    'created',
    'viewed',
    'acknowledged',
    'accepted',
    'rejected',
    'modified',
    'implemented',
    'outcome_recorded',
    'expired',
    'reopened'
  )),
  
  -- Action details
  action_by UUID REFERENCES auth.users(id),
  action_notes TEXT,
  previous_status TEXT,
  new_status TEXT,
  
  -- Additional context
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_actions_rec ON recommendation_actions(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_actions_type ON recommendation_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_recommendation_actions_by ON recommendation_actions(action_by);

-- ============================================
-- RECOMMENDATION TEMPLATES TABLE
-- ============================================
-- Reusable recommendation templates for common scenarios

CREATE TABLE IF NOT EXISTS recommendation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template metadata
  name TEXT NOT NULL,
  description TEXT,
  recommendation_type TEXT NOT NULL,
  category TEXT NOT NULL,
  
  -- Template content (with placeholders like {{glucose_value}})
  title_template TEXT NOT NULL,
  description_template TEXT NOT NULL,
  
  -- Conditions for auto-suggesting this template
  trigger_conditions JSONB, -- e.g., {"glucose_mg_dl": {"operator": ">", "value": 180}}
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE recommendations_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read recommendations
CREATE POLICY "Authenticated users can read recommendations"
  ON recommendations_log FOR SELECT
  TO authenticated
  USING (true);

-- Users can create recommendations (AI system or clinicians)
CREATE POLICY "Authenticated users can create recommendations"
  ON recommendations_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update recommendations they have access to
CREATE POLICY "Authenticated users can update recommendations"
  ON recommendations_log FOR UPDATE
  TO authenticated
  USING (true);

-- Recommendation actions - read access for authenticated
CREATE POLICY "Authenticated users can read recommendation actions"
  ON recommendation_actions FOR SELECT
  TO authenticated
  USING (true);

-- Recommendation actions - create for authenticated
CREATE POLICY "Authenticated users can create recommendation actions"
  ON recommendation_actions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Templates - read for all authenticated
CREATE POLICY "Authenticated users can read templates"
  ON recommendation_templates FOR SELECT
  TO authenticated
  USING (true);

-- Templates - manage for admins only
CREATE POLICY "Admins can manage templates"
  ON recommendation_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to log a recommendation action
CREATE OR REPLACE FUNCTION log_recommendation_action(
  p_recommendation_id UUID,
  p_action_type TEXT,
  p_notes TEXT DEFAULT NULL,
  p_new_status TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_previous_status TEXT;
  v_action_id UUID;
BEGIN
  -- Get current status
  SELECT status INTO v_previous_status 
  FROM recommendations_log 
  WHERE id = p_recommendation_id;
  
  -- Insert action record
  INSERT INTO recommendation_actions (
    recommendation_id,
    action_type,
    action_by,
    action_notes,
    previous_status,
    new_status
  ) VALUES (
    p_recommendation_id,
    p_action_type,
    auth.uid(),
    p_notes,
    v_previous_status,
    p_new_status
  )
  RETURNING id INTO v_action_id;
  
  -- Update recommendation status if provided
  IF p_new_status IS NOT NULL THEN
    UPDATE recommendations_log
    SET 
      status = p_new_status,
      updated_at = NOW()
    WHERE id = p_recommendation_id;
  END IF;
  
  RETURN v_action_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept a recommendation
CREATE OR REPLACE FUNCTION accept_recommendation(
  p_recommendation_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE recommendations_log
  SET 
    status = 'accepted',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    reviewer_notes = p_notes,
    updated_at = NOW()
  WHERE id = p_recommendation_id
  AND status = 'pending';
  
  PERFORM log_recommendation_action(
    p_recommendation_id, 
    'accepted', 
    p_notes, 
    'accepted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject a recommendation
CREATE OR REPLACE FUNCTION reject_recommendation(
  p_recommendation_id UUID,
  p_notes TEXT -- Notes required for rejection (validated in function body)
)
RETURNS VOID AS $$
BEGIN
  -- Validate that notes are provided
  IF p_notes IS NULL OR p_notes = '' THEN
    RAISE EXCEPTION 'Notes are required for rejection';
  END IF;

  UPDATE recommendations_log
  SET 
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    reviewer_notes = p_notes,
    updated_at = NOW()
  WHERE id = p_recommendation_id
  AND status = 'pending';
  
  PERFORM log_recommendation_action(
    p_recommendation_id, 
    'rejected', 
    p_notes, 
    'rejected'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to modify and accept a recommendation
CREATE OR REPLACE FUNCTION modify_recommendation(
  p_recommendation_id UUID,
  p_modified_text TEXT, -- Required (validated in function body)
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Validate that modified text is provided
  IF p_modified_text IS NULL OR p_modified_text = '' THEN
    RAISE EXCEPTION 'Modified text is required';
  END IF;

  UPDATE recommendations_log
  SET 
    status = 'modified',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    reviewer_notes = p_notes,
    modified_recommendation = p_modified_text,
    updated_at = NOW()
  WHERE id = p_recommendation_id
  AND status = 'pending';
  
  PERFORM log_recommendation_action(
    p_recommendation_id, 
    'modified', 
    COALESCE(p_notes, '') || ' Modified to: ' || p_modified_text, 
    'modified'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record outcome
CREATE OR REPLACE FUNCTION record_recommendation_outcome(
  p_recommendation_id UUID,
  p_outcome_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE recommendations_log
  SET 
    outcome_status = p_outcome_status,
    outcome_notes = p_notes,
    outcome_recorded_at = NOW(),
    outcome_recorded_by = auth.uid(),
    updated_at = NOW()
  WHERE id = p_recommendation_id;
  
  PERFORM log_recommendation_action(
    p_recommendation_id, 
    'outcome_recorded', 
    p_outcome_status || ': ' || COALESCE(p_notes, ''),
    NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recommendation statistics for a patient
CREATE OR REPLACE FUNCTION get_patient_recommendation_stats(p_patient_id UUID)
RETURNS TABLE (
  total_count INTEGER,
  pending_count INTEGER,
  accepted_count INTEGER,
  rejected_count INTEGER,
  implemented_count INTEGER,
  positive_outcomes INTEGER,
  acceptance_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_count,
    COUNT(*) FILTER (WHERE status = 'pending')::INTEGER as pending_count,
    COUNT(*) FILTER (WHERE status = 'accepted')::INTEGER as accepted_count,
    COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER as rejected_count,
    COUNT(*) FILTER (WHERE status = 'implemented')::INTEGER as implemented_count,
    COUNT(*) FILTER (WHERE outcome_status = 'positive')::INTEGER as positive_outcomes,
    CASE 
      WHEN COUNT(*) FILTER (WHERE status IN ('accepted', 'rejected', 'modified')) > 0 
      THEN ROUND(
        (COUNT(*) FILTER (WHERE status IN ('accepted', 'modified'))::NUMERIC / 
         COUNT(*) FILTER (WHERE status IN ('accepted', 'rejected', 'modified'))::NUMERIC) * 100, 
        1
      )
      ELSE NULL
    END as acceptance_rate
  FROM recommendations_log
  WHERE patient_id = p_patient_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_recommendations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recommendations_updated_at
  BEFORE UPDATE ON recommendations_log
  FOR EACH ROW
  EXECUTE FUNCTION update_recommendations_updated_at();
