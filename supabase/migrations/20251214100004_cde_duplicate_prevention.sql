-- CDE Duplicate Prevention
-- Ensures pairs are not analyzed multiple times across runs

-- ============================================
-- 1. Add global unique constraint for pairs (ignoring run_id)
-- ============================================

-- Create a table to store ALL analyzed pairs globally (not per run)
CREATE TABLE IF NOT EXISTS cde_analyzed_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  substance_a_name TEXT NOT NULL,
  substance_b_name TEXT NOT NULL,
  first_analyzed_at TIMESTAMPTZ DEFAULT now(),
  last_analyzed_at TIMESTAMPTZ DEFAULT now(),
  analysis_count INT DEFAULT 1,
  best_discovery_type TEXT,
  best_plausibility_score FLOAT,
  is_documented BOOLEAN DEFAULT false
);

-- Add unique constraint on pair names
CREATE UNIQUE INDEX IF NOT EXISTS idx_analyzed_pairs_unique 
  ON cde_analyzed_pairs(LEAST(substance_a_name, substance_b_name), GREATEST(substance_a_name, substance_b_name));

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_analyzed_pairs_names 
  ON cde_analyzed_pairs(substance_a_name, substance_b_name);

-- RLS
ALTER TABLE cde_analyzed_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analyzed pairs"
  ON cde_analyzed_pairs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access analyzed pairs"
  ON cde_analyzed_pairs FOR ALL
  TO service_role
  USING (true);

-- ============================================
-- 2. Function to check if pair already analyzed
-- ============================================

CREATE OR REPLACE FUNCTION is_pair_analyzed(a_name TEXT, b_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  normalized_a TEXT;
  normalized_b TEXT;
  exists_flag BOOLEAN;
BEGIN
  -- Normalize order alphabetically
  IF a_name <= b_name THEN
    normalized_a := a_name;
    normalized_b := b_name;
  ELSE
    normalized_a := b_name;
    normalized_b := a_name;
  END IF;
  
  SELECT EXISTS(
    SELECT 1 FROM cde_analyzed_pairs 
    WHERE substance_a_name = normalized_a 
      AND substance_b_name = normalized_b
  ) INTO exists_flag;
  
  RETURN exists_flag;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Function to record analyzed pair
-- ============================================

CREATE OR REPLACE FUNCTION record_analyzed_pair(
  a_name TEXT, 
  b_name TEXT,
  discovery TEXT DEFAULT NULL,
  plausibility FLOAT DEFAULT NULL,
  documented BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
DECLARE
  normalized_a TEXT;
  normalized_b TEXT;
BEGIN
  -- Normalize order alphabetically
  IF a_name <= b_name THEN
    normalized_a := a_name;
    normalized_b := b_name;
  ELSE
    normalized_a := b_name;
    normalized_b := a_name;
  END IF;
  
  INSERT INTO cde_analyzed_pairs (
    substance_a_name, 
    substance_b_name, 
    best_discovery_type,
    best_plausibility_score,
    is_documented
  ) VALUES (
    normalized_a, 
    normalized_b, 
    discovery,
    plausibility,
    documented
  )
  ON CONFLICT (substance_a_name, substance_b_name) DO UPDATE SET
    last_analyzed_at = now(),
    analysis_count = cde_analyzed_pairs.analysis_count + 1,
    best_discovery_type = COALESCE(EXCLUDED.best_discovery_type, cde_analyzed_pairs.best_discovery_type),
    best_plausibility_score = GREATEST(EXCLUDED.best_plausibility_score, cde_analyzed_pairs.best_plausibility_score),
    is_documented = EXCLUDED.is_documented OR cde_analyzed_pairs.is_documented;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_pair_analyzed(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_pair_analyzed(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_analyzed_pair(TEXT, TEXT, TEXT, FLOAT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION record_analyzed_pair(TEXT, TEXT, TEXT, FLOAT, BOOLEAN) TO service_role;

-- ============================================
-- 4. Add discovery types for aggravation/benefice
-- ============================================

-- Update check constraint to include new types
ALTER TABLE cde_pair_analyses 
  DROP CONSTRAINT IF EXISTS cde_pair_analyses_discovery_type_check;

ALTER TABLE cde_pair_analyses
  ADD CONSTRAINT cde_pair_analyses_discovery_type_check 
  CHECK (discovery_type IN ('interaction', 'synergie', 'contre-indication', 'risque_combine', 'aggravation', 'benefice', 'aucun'));
