-- CDE Systematic Analysis Tables
-- Stores analysis runs and pairwise results

-- ============================================
-- TABLE: Analysis Runs (tracks each systematic analysis session)
-- ============================================
CREATE TABLE IF NOT EXISTS cde_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  current_substance_index INT DEFAULT 0,
  total_substances INT DEFAULT 0,
  pairs_analyzed INT DEFAULT 0,
  discoveries_found INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  error_message TEXT,
  
  CONSTRAINT valid_progress CHECK (current_substance_index <= total_substances)
);

-- ============================================
-- TABLE: Pair Analyses (results for each substance pair)
-- ============================================
CREATE TABLE IF NOT EXISTS cde_pair_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES cde_analysis_runs(id) ON DELETE CASCADE,
  substance_a_id UUID REFERENCES cde_nodes(id),
  substance_a_name TEXT NOT NULL,
  substance_b_id UUID REFERENCES cde_nodes(id),
  substance_b_name TEXT NOT NULL,
  is_documented BOOLEAN DEFAULT false,
  discovery_type TEXT CHECK (discovery_type IN ('interaction', 'synergie', 'contre-indication', 'risque_combine', 'aucun')),
  plausibility_score FLOAT CHECK (plausibility_score >= 0 AND plausibility_score <= 1),
  severity TEXT CHECK (severity IN ('faible', 'moderee', 'elevee', 'critique')),
  reasoning TEXT,
  mechanism TEXT,
  recommendation TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(run_id, substance_a_name, substance_b_name)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pair_analyses_run ON cde_pair_analyses(run_id);
CREATE INDEX IF NOT EXISTS idx_pair_analyses_discovery ON cde_pair_analyses(is_documented, discovery_type);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON cde_analysis_runs(status);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE cde_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cde_pair_analyses ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view
CREATE POLICY "Users can view analysis runs"
  ON cde_analysis_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create analysis runs"
  ON cde_analysis_runs FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own runs"
  ON cde_analysis_runs FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can view pair analyses"
  ON cde_pair_analyses FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access runs"
  ON cde_analysis_runs FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Service role full access pairs"
  ON cde_pair_analyses FOR ALL
  TO service_role
  USING (true);
