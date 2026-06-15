-- Function to clear and reseed CDE with individual substances
-- Call this via Supabase Dashboard SQL Editor

CREATE OR REPLACE FUNCTION reset_and_seed_cde()
RETURNS JSON AS $$
DECLARE
  v_substances INT := 0;
  v_pathologies INT := 0;
  v_symptoms INT := 0;
  result JSON;
BEGIN
  SET LOCAL statement_timeout = '300s';

  -- ============================================
  -- STEP 1: Clear ALL CDE data (order matters for FK constraints)
  -- ============================================
  
  -- First delete pair analyses (references cde_nodes)
  DELETE FROM cde_pair_analyses WHERE id IS NOT NULL;
  DELETE FROM cde_analyzed_pairs WHERE id IS NOT NULL;
  DELETE FROM cde_analysis_runs WHERE id IS NOT NULL;
  
  -- Then edges and nodes
  DELETE FROM cde_edges WHERE source_node_id IS NOT NULL;
  DELETE FROM cde_nodes WHERE id IS NOT NULL;

  -- ============================================
  -- STEP 2: Parse substances from medications into substances table
  -- ============================================

  -- Clear and repopulate substances table
  DELETE FROM medication_substances WHERE medication_id IS NOT NULL;
  DELETE FROM substances WHERE id IS NOT NULL;

  -- Parse and insert unique substances
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
    'parsed'
  FROM filtered
  GROUP BY LOWER(TRIM(substance_name)), substance_name
  ON CONFLICT (name_normalized) DO NOTHING;

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
  -- STEP 3: Insert INDIVIDUAL substances into cde_nodes
  -- ============================================

  INSERT INTO cde_nodes (node_type, name, properties)
  SELECT 
    'substance',
    s.name,
    jsonb_build_object(
      'atc_code', s.atc_code,
      'source', s.source,
      'medication_count', (SELECT COUNT(*) FROM medication_substances ms WHERE ms.substance_id = s.id)
    )
  FROM substances s;
  
  SELECT COUNT(*) INTO v_substances FROM cde_nodes WHERE node_type = 'substance';

  -- ============================================
  -- STEP 4: Insert PATHOLOGIES
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'pathology', id, TRIM(name),
    jsonb_build_object('icd_code', icd_code, 'category', category)
  FROM pathologies
  WHERE name IS NOT NULL AND TRIM(name) != ''
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_pathologies FROM cde_nodes WHERE node_type = 'pathology';

  -- ============================================
  -- STEP 5: Insert SYMPTOMS  
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'symptom', id, TRIM(name),
    jsonb_build_object('body_system', body_system)
  FROM symptoms
  WHERE name IS NOT NULL AND TRIM(name) != ''
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_symptoms FROM cde_nodes WHERE node_type = 'symptom';

  result := jsonb_build_object(
    'success', true,
    'total_substances', v_substances,
    'total_pathologies', v_pathologies,
    'total_symptoms', v_symptoms,
    'message', 'CDE reset complete with individual substances'
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION reset_and_seed_cde() TO authenticated;
GRANT EXECUTE ON FUNCTION reset_and_seed_cde() TO service_role;

-- Also update the main seed function to use reset logic
DROP FUNCTION IF EXISTS seed_cde_knowledge_graph();

CREATE OR REPLACE FUNCTION seed_cde_knowledge_graph()
RETURNS JSON AS $$
BEGIN
  RETURN reset_and_seed_cde();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO authenticated;
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO service_role;
