-- CDE Fix: Simplified seed function with DO NOTHING only

-- ============================================
-- STEP 1: Clear existing CDE data (fresh start)
-- ============================================

DELETE FROM cde_edges;
DELETE FROM cde_nodes;
DELETE FROM cde_pair_analyses;
DELETE FROM cde_analyzed_pairs;
DELETE FROM cde_analysis_runs;

-- ============================================
-- STEP 2: Add UNIQUE constraint on (node_type, name)
-- ============================================

DROP INDEX IF EXISTS idx_cde_nodes_type_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cde_nodes_type_name_unique 
  ON cde_nodes(node_type, LOWER(TRIM(name)));

-- ============================================
-- STEP 3: Recreate seed function - using DO NOTHING only
-- ============================================

DROP FUNCTION IF EXISTS seed_cde_knowledge_graph();

CREATE OR REPLACE FUNCTION seed_cde_knowledge_graph()
RETURNS JSON AS $$
DECLARE
  v_substances INT := 0;
  v_pathologies INT := 0;
  v_symptoms INT := 0;
  v_interactions INT := 0;
  result JSON;
BEGIN
  SET LOCAL statement_timeout = '300s';

  -- ============================================
  -- PHASE 1: Insert UNIQUE SUBSTANCES using temp table
  -- ============================================

  -- Use a CTE to ensure unique values before insert
  WITH unique_substances AS (
    SELECT DISTINCT ON (LOWER(TRIM(substance)))
      TRIM(substance) as name,
      LEFT(atc_code, 5) as atc_prefix,
      COUNT(*) OVER (PARTITION BY LOWER(TRIM(substance))) as med_count
    FROM medications
    WHERE substance IS NOT NULL 
      AND TRIM(substance) != ''
      AND LENGTH(TRIM(substance)) > 2
    ORDER BY LOWER(TRIM(substance)), atc_code
  )
  INSERT INTO cde_nodes (node_type, name, properties)
  SELECT 
    'substance',
    name,
    jsonb_build_object('atc_prefix', atc_prefix, 'medication_count', med_count)
  FROM unique_substances
  ON CONFLICT (node_type, LOWER(TRIM(name))) DO NOTHING;
  
  SELECT COUNT(*) INTO v_substances FROM cde_nodes WHERE node_type = 'substance';

  -- ============================================
  -- PHASE 2: Insert PATHOLOGIES
  -- ============================================

  WITH unique_pathologies AS (
    SELECT DISTINCT ON (LOWER(TRIM(name)))
      id,
      TRIM(name) as name,
      icd_code,
      category,
      severity
    FROM pathologies
    WHERE name IS NOT NULL AND TRIM(name) != ''
    ORDER BY LOWER(TRIM(name)), created_at DESC
  )
  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT 
    'pathology',
    id,
    name,
    jsonb_build_object('icd_code', icd_code, 'category', category, 'severity', severity)
  FROM unique_pathologies
  ON CONFLICT (node_type, LOWER(TRIM(name))) DO NOTHING;

  SELECT COUNT(*) INTO v_pathologies FROM cde_nodes WHERE node_type = 'pathology';

  -- ============================================
  -- PHASE 3: Insert SYMPTOMS
  -- ============================================

  WITH unique_symptoms AS (
    SELECT DISTINCT ON (LOWER(TRIM(name)))
      id,
      TRIM(name) as name,
      body_system
    FROM symptoms
    WHERE name IS NOT NULL AND TRIM(name) != ''
    ORDER BY LOWER(TRIM(name)), created_at DESC
  )
  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT 
    'symptom',
    id,
    name,
    jsonb_build_object('body_system', body_system)
  FROM unique_symptoms
  ON CONFLICT (node_type, LOWER(TRIM(name))) DO NOTHING;

  SELECT COUNT(*) INTO v_symptoms FROM cde_nodes WHERE node_type = 'symptom';

  -- ============================================
  -- PHASE 4: Add interacting drugs as substances
  -- ============================================

  WITH unique_interactions AS (
    SELECT DISTINCT ON (LOWER(TRIM(interacting_drug)))
      TRIM(interacting_drug) as name
    FROM drug_interactions
    WHERE interacting_drug IS NOT NULL 
      AND TRIM(interacting_drug) != ''
      AND LENGTH(TRIM(interacting_drug)) > 2
    ORDER BY LOWER(TRIM(interacting_drug))
  )
  INSERT INTO cde_nodes (node_type, name, properties)
  SELECT 
    'substance',
    name,
    jsonb_build_object('source', 'drug_interactions')
  FROM unique_interactions
  ON CONFLICT (node_type, LOWER(TRIM(name))) DO NOTHING;

  -- Recount substances
  SELECT COUNT(*) INTO v_substances FROM cde_nodes WHERE node_type = 'substance';

  -- ============================================
  -- PHASE 5: Create INTERACTION EDGES
  -- ============================================

  INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
  SELECT DISTINCT ON (src.id, tgt.id)
    src.id,
    tgt.id,
    CASE 
      WHEN di.severity = 'severe' THEN 'contraindicated'
      WHEN di.severity = 'moderate' THEN 'caution_required'
      ELSE 'interacts_with'
    END,
    'drug_interactions',
    jsonb_build_object('severity', di.severity)
  FROM drug_interactions di
  JOIN medications m ON m.id = di.medication_id
  JOIN cde_nodes src ON src.node_type = 'substance' 
    AND LOWER(TRIM(src.name)) = LOWER(TRIM(m.substance))
  JOIN cde_nodes tgt ON tgt.node_type = 'substance' 
    AND LOWER(TRIM(tgt.name)) = LOWER(TRIM(di.interacting_drug))
  WHERE m.substance IS NOT NULL AND src.id != tgt.id
  ORDER BY src.id, tgt.id, di.severity DESC
  ON CONFLICT (source_node_id, target_node_id, relationship_type) DO NOTHING;

  SELECT COUNT(*) INTO v_interactions FROM cde_edges;

  -- ============================================
  -- RESULT
  -- ============================================

  result := jsonb_build_object(
    'success', true,
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
