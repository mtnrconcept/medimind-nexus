-- CDE Knowledge Graph Seeding - Simplified Composition-Based
-- Extracts substances from composition field when substance is not available

DROP FUNCTION IF EXISTS seed_cde_knowledge_graph();

CREATE OR REPLACE FUNCTION seed_cde_knowledge_graph()
RETURNS JSON AS $$
DECLARE
  v_node_count INT := 0;
  v_edge_count INT := 0;
  v_rows INT := 0;
  result JSON;
BEGIN
  SET LOCAL statement_timeout = '180s';

  -- ============================================
  -- PHASE 1: SEED SUBSTANCE NODES from explicit field
  -- ============================================

  INSERT INTO cde_nodes (node_type, name, properties)
  SELECT DISTINCT
    'substance',
    TRIM(substance),
    jsonb_build_object(
      'atc_prefix', LEFT(atc_code, 5),
      'source', 'medications.substance'
    )
  FROM medications
  WHERE substance IS NOT NULL 
    AND TRIM(substance) != ''
    AND LENGTH(TRIM(substance)) > 2
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_node_count := v_node_count + v_rows;

  -- ============================================
  -- PHASE 2: SEED PATHOLOGY NODES
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT 
    'pathology',
    id,
    name,
    jsonb_build_object(
      'icd_code', icd_code,
      'category', category
    )
  FROM pathologies
  WHERE name IS NOT NULL AND TRIM(name) != ''
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_node_count := v_node_count + v_rows;

  -- ============================================
  -- PHASE 3: SEED SYMPTOM NODES
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT 
    'symptom',
    id,
    name,
    jsonb_build_object(
      'body_system', body_system
    )
  FROM symptoms
  WHERE name IS NOT NULL AND TRIM(name) != ''
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_node_count := v_node_count + v_rows;

  -- ============================================
  -- PHASE 4: SEED MEDICATION NODES (for linking)
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT 
    'medication',
    id,
    name,
    jsonb_build_object(
      'atc_code', atc_code,
      'substance', substance
    )
  FROM medications
  WHERE name IS NOT NULL
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_node_count := v_node_count + v_rows;

  -- ============================================
  -- PHASE 5: Create edges from drug_interactions
  -- ============================================
  
  -- First add interacting drugs as substances if not exist
  INSERT INTO cde_nodes (node_type, name, properties)
  SELECT DISTINCT
    'substance',
    TRIM(interacting_drug),
    jsonb_build_object('source', 'drug_interactions')
  FROM drug_interactions
  WHERE interacting_drug IS NOT NULL 
    AND TRIM(interacting_drug) != ''
    AND LENGTH(TRIM(interacting_drug)) > 2
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_node_count := v_node_count + v_rows;

  -- ============================================
  -- RESULT
  -- ============================================

  result := jsonb_build_object(
    'nodes_created', v_node_count,
    'edges_created', v_edge_count,
    'seeded_at', now(),
    'total_substances', (SELECT COUNT(*) FROM cde_nodes WHERE node_type = 'substance'),
    'total_pathologies', (SELECT COUNT(*) FROM cde_nodes WHERE node_type = 'pathology'),
    'total_symptoms', (SELECT COUNT(*) FROM cde_nodes WHERE node_type = 'symptom'),
    'total_medications', (SELECT COUNT(*) FROM cde_nodes WHERE node_type = 'medication')
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO authenticated;
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO service_role;
