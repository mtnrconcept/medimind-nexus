-- Simplified seed function - no DELETE, just UPSERT
-- Run this manually in Supabase SQL Editor if migration fails

-- Create substances table if not exists
CREATE TABLE IF NOT EXISTS substances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED,
  atc_code TEXT,
  properties JSONB DEFAULT '{}',
  source TEXT DEFAULT 'parsed',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add unique constraint if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'substances_name_unique') THEN
    ALTER TABLE substances ADD CONSTRAINT substances_name_unique UNIQUE (name_normalized);
  END IF;
END $$;

-- Create medication_substances if not exists
CREATE TABLE IF NOT EXISTS medication_substances (
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  substance_id UUID NOT NULL REFERENCES substances(id) ON DELETE CASCADE,
  PRIMARY KEY (medication_id, substance_id)
);

-- RLS
ALTER TABLE substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_substances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read substances" ON substances;
CREATE POLICY "Authenticated users can read substances" ON substances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access substances" ON substances;
CREATE POLICY "Service role full access substances" ON substances FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Authenticated users can read medication_substances" ON medication_substances;
CREATE POLICY "Authenticated users can read medication_substances" ON medication_substances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access medication_substances" ON medication_substances;
CREATE POLICY "Service role full access medication_substances" ON medication_substances FOR ALL TO service_role USING (true);

-- Updated seed function (NO deletes)
DROP FUNCTION IF EXISTS seed_cde_knowledge_graph();

CREATE OR REPLACE FUNCTION seed_cde_knowledge_graph()
RETURNS JSON AS $$
DECLARE
  v_substances INT := 0;
  v_pathologies INT := 0;
  v_symptoms INT := 0;
  v_interactions INT := 0;
  v_parsed INT := 0;
  result JSON;
BEGIN
  SET LOCAL statement_timeout = '300s';

  -- ============================================
  -- PHASE 0: Parse substances from medications
  -- ============================================

  WITH parsed_substances AS (
    SELECT DISTINCT
      m.id as medication_id,
      TRIM(REGEXP_REPLACE(
        unnest(STRING_TO_ARRAY(
          REGEXP_REPLACE(m.substance, '[/+;]', ',', 'g'),
          ','
        )),
        '\s+', ' ', 'g'
      )) as substance_name,
      LEFT(m.atc_code, 5) as atc_prefix
    FROM medications m
    WHERE m.substance IS NOT NULL 
      AND TRIM(m.substance) != ''
  ),
  filtered AS (
    SELECT * FROM parsed_substances
    WHERE LENGTH(substance_name) > 2
      AND substance_name NOT SIMILAR TO '[0-9]+%'
  )
  INSERT INTO substances (name, atc_code, source)
  SELECT DISTINCT ON (LOWER(TRIM(substance_name)))
    substance_name,
    MAX(atc_prefix),
    'parsed_from_medications'
  FROM filtered
  GROUP BY LOWER(TRIM(substance_name)), substance_name
  ON CONFLICT (name_normalized) DO NOTHING;

  GET DIAGNOSTICS v_parsed = ROW_COUNT;

  -- Add substances from drug_interactions
  INSERT INTO substances (name, source)
  SELECT DISTINCT TRIM(interacting_drug), 'drug_interactions'
  FROM drug_interactions
  WHERE interacting_drug IS NOT NULL 
    AND TRIM(interacting_drug) != ''
    AND LENGTH(TRIM(interacting_drug)) > 2
  ON CONFLICT (name_normalized) DO NOTHING;

  -- Create medication-substance links
  INSERT INTO medication_substances (medication_id, substance_id)
  SELECT DISTINCT m.id, s.id
  FROM medications m
  CROSS JOIN LATERAL (
    SELECT TRIM(REGEXP_REPLACE(
      unnest(STRING_TO_ARRAY(REGEXP_REPLACE(m.substance, '[/+;]', ',', 'g'), ',')),
      '\s+', ' ', 'g'
    )) as sub_name
  ) parsed
  JOIN substances s ON s.name_normalized = LOWER(TRIM(parsed.sub_name))
  WHERE m.substance IS NOT NULL
  ON CONFLICT (medication_id, substance_id) DO NOTHING;

  -- ============================================
  -- PHASE 1: Insert SUBSTANCES into cde_nodes
  -- ============================================

  INSERT INTO cde_nodes (node_type, name, properties)
  SELECT 
    'substance',
    name,
    jsonb_build_object('atc_code', atc_code, 'source', source)
  FROM substances
  ON CONFLICT (node_type, LOWER(TRIM(name))) DO NOTHING;
  
  SELECT COUNT(*) INTO v_substances FROM cde_nodes WHERE node_type = 'substance';

  -- ============================================
  -- PHASE 2: Insert PATHOLOGIES
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'pathology', id, TRIM(name),
    jsonb_build_object('icd_code', icd_code, 'category', category)
  FROM pathologies
  WHERE name IS NOT NULL AND TRIM(name) != ''
  ORDER BY LOWER(TRIM(name)), created_at DESC
  ON CONFLICT (node_type, LOWER(TRIM(name))) DO NOTHING;

  SELECT COUNT(*) INTO v_pathologies FROM cde_nodes WHERE node_type = 'pathology';

  -- ============================================
  -- PHASE 3: Insert SYMPTOMS  
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'symptom', id, TRIM(name),
    jsonb_build_object('body_system', body_system)
  FROM symptoms
  WHERE name IS NOT NULL AND TRIM(name) != ''
  ORDER BY LOWER(TRIM(name)), created_at DESC
  ON CONFLICT (node_type, LOWER(TRIM(name))) DO NOTHING;

  SELECT COUNT(*) INTO v_symptoms FROM cde_nodes WHERE node_type = 'symptom';

  SELECT COUNT(*) INTO v_interactions FROM cde_edges;

  result := jsonb_build_object(
    'success', true,
    'substances_parsed', v_parsed,
    'total_substances', v_substances,
    'total_pathologies', v_pathologies,
    'total_symptoms', v_symptoms,
    'total_interactions', v_interactions,
    'seeded_at', now()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO authenticated;
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO service_role;
