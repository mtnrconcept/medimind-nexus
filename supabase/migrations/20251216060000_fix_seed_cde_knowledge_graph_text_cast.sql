-- Migration: Fix Seed Function Casts for Text External ID
-- Reason: cde_nodes.external_id was changed to text, causing type mismatch in JOINs with UUIDs.
-- Fixes: Adds explicit ::text casts when comparing or inserting UUIDs into external_id.

DROP FUNCTION IF EXISTS seed_cde_knowledge_graph() CASCADE;

CREATE OR REPLACE FUNCTION seed_cde_knowledge_graph()
RETURNS JSON 
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '6000s'
AS $$
DECLARE
  v_substances INT := 0;
  v_pathologies INT := 0;
  v_symptoms INT := 0;
  v_medications INT := 0;
  v_treatments INT := 0;
  v_edges INT := 0;
  result JSON;
BEGIN
  RAISE NOTICE 'Starting CDE Knowledge Graph seeding...';

  -- PHASE 0: Clear existing CDE data using TRUNCATE for speed
  TRUNCATE cde_pair_analyses CASCADE;
  TRUNCATE cde_analyzed_pairs CASCADE;
  TRUNCATE cde_analysis_runs CASCADE;
  TRUNCATE cde_edges CASCADE;
  TRUNCATE cde_nodes CASCADE;
  
  RAISE NOTICE 'Cleared existing CDE data';

  -- PHASE 1: Insert SUBSTANCES
  INSERT INTO cde_nodes (node_type, substance_id, name, properties)
  SELECT 
    'substance', s.id, s.name,
    jsonb_build_object('atc_code', s.atc_code, 'source', s.source)
  FROM substances s
  WHERE s.name IS NOT NULL
    AND LENGTH(TRIM(s.name)) > 2
    AND s.name ~ '[a-zA-Z]{2,}'
    AND s.name NOT LIKE '%"%'
    AND s.name NOT LIKE '{%'
  LIMIT 2000;
  
  GET DIAGNOSTICS v_substances = ROW_COUNT;
  RAISE NOTICE 'Inserted % substances', v_substances;

  -- PHASE 2: Insert PATHOLOGIES
  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'pathology', id::text, TRIM(name),
    jsonb_build_object('icd_code', icd_code, 'category', category)
  FROM pathologies
  WHERE name IS NOT NULL AND TRIM(name) != '' AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC
  LIMIT 1000;

  GET DIAGNOSTICS v_pathologies = ROW_COUNT;
  RAISE NOTICE 'Inserted % pathologies', v_pathologies;

  -- PHASE 3: Insert SYMPTOMS
  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'symptom', id::text, TRIM(name),
    jsonb_build_object('body_system', body_system)
  FROM symptoms
  WHERE name IS NOT NULL AND TRIM(name) != '' AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC
  LIMIT 500;

  GET DIAGNOSTICS v_symptoms = ROW_COUNT;
  RAISE NOTICE 'Inserted % symptoms', v_symptoms;

  -- PHASE 4: Insert MEDICATIONS
  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'medication', id::text, TRIM(name),
    jsonb_build_object('manufacturer', manufacturer, 'atc_code', atc_code)
  FROM medications
  WHERE name IS NOT NULL AND TRIM(name) != '' AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC
  LIMIT 1000;

  GET DIAGNOSTICS v_medications = ROW_COUNT;
  RAISE NOTICE 'Inserted % medications', v_medications;

  -- PHASE 5: Insert TREATMENTS
  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'treatment', id::text, TRIM(name),
    jsonb_build_object('type', type, 'pathology_id', pathology_id)
  FROM treatments
  WHERE name IS NOT NULL AND TRIM(name) != '' AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC
  LIMIT 500;

  GET DIAGNOSTICS v_treatments = ROW_COUNT;
  RAISE NOTICE 'Inserted % treatments', v_treatments;

  -- PHASE 6: Create edges (using correct column names: relationship_type, provenance, context)
  -- FIX: Cast ms.medication_id to text for comparison with cde_nodes.external_id
  INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
  SELECT DISTINCT
    sn.id,
    mn.id,
    'CONTAINS',
    'medication_substances',
    jsonb_build_object('relationship', 'medication contains substance')
  FROM medication_substances ms
  JOIN cde_nodes sn ON sn.substance_id = ms.substance_id AND sn.node_type = 'substance'
  JOIN cde_nodes mn ON mn.external_id = ms.medication_id::text AND mn.node_type = 'medication'
  LIMIT 70000;

  GET DIAGNOSTICS v_edges = ROW_COUNT;
  RAISE NOTICE 'Created % edges', v_edges;

  -- Return summary
  result := jsonb_build_object(
    'success', true,
    'nodes', jsonb_build_object(
      'substances', v_substances,
      'pathologies', v_pathologies,
      'symptoms', v_symptoms,
      'medications', v_medications,
      'treatments', v_treatments
    ),
    'edges', v_edges,
    'total_nodes', v_substances + v_pathologies + v_symptoms + v_medications + v_treatments
  );

  RAISE NOTICE 'Completed seeding: %', result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO authenticated;
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO service_role;

COMMENT ON FUNCTION seed_cde_knowledge_graph IS 'Seeds the CDE Knowledge Graph. Optimized for performance with batch limits.';
