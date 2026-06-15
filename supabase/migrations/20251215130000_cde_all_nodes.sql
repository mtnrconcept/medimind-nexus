-- ============================================
-- CDE Complete Knowledge Graph - ALL Node Types
-- Includes: substances, pathologies, symptoms, medications, treatments
-- ============================================

DROP FUNCTION IF EXISTS seed_cde_knowledge_graph() CASCADE;

CREATE OR REPLACE FUNCTION seed_cde_knowledge_graph()
RETURNS JSON AS $$
DECLARE
  v_substances INT := 0;
  v_pathologies INT := 0;
  v_symptoms INT := 0;
  v_medications INT := 0;
  v_treatments INT := 0;
  v_edges INT := 0;
  result JSON;
BEGIN
  SET LOCAL statement_timeout = '300s';

  -- ============================================
  -- PHASE 0: Clear existing CDE data
  -- ============================================
  
  DELETE FROM cde_pair_analyses WHERE id IS NOT NULL;
  DELETE FROM cde_analyzed_pairs WHERE id IS NOT NULL;
  DELETE FROM cde_analysis_runs WHERE id IS NOT NULL;
  DELETE FROM cde_edges WHERE source_node_id IS NOT NULL;
  DELETE FROM cde_nodes WHERE id IS NOT NULL;

  -- ============================================
  -- PHASE 1: Insert SUBSTANCES
  -- ============================================

  INSERT INTO cde_nodes (node_type, substance_id, name, properties)
  SELECT 
    'substance',
    s.id,
    s.name,
    jsonb_build_object(
      'atc_code', s.atc_code,
      'source', s.source,
      'therapeutic_class', s.therapeutic_class,
      'has_embedding', s.embedding IS NOT NULL,
      'medication_count', (SELECT COUNT(*) FROM medication_substances ms WHERE ms.substance_id = s.id)
    )
  FROM substances s
  WHERE s.name IS NOT NULL
    AND LENGTH(TRIM(s.name)) > 2
    AND s.name ~ '[a-zA-Z]{2,}'
    AND s.name NOT LIKE '%"dosage"%'
    AND s.name NOT LIKE '%":%'
    AND s.name NOT LIKE '{%'
    AND s.name NOT LIKE '%}%';
  
  SELECT COUNT(*) INTO v_substances FROM cde_nodes WHERE node_type = 'substance';

  -- ============================================
  -- PHASE 2: Insert PATHOLOGIES
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'pathology', id, TRIM(name),
    jsonb_build_object(
      'icd_code', icd_code, 
      'category', category,
      'severity', severity,
      'has_embedding', embedding IS NOT NULL
    )
  FROM pathologies
  WHERE name IS NOT NULL 
    AND TRIM(name) != ''
    AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_pathologies FROM cde_nodes WHERE node_type = 'pathology';

  -- ============================================
  -- PHASE 3: Insert SYMPTOMS
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'symptom', id, TRIM(name),
    jsonb_build_object(
      'body_system', body_system,
      'severity', severity,
      'has_embedding', embedding IS NOT NULL
    )
  FROM symptoms
  WHERE name IS NOT NULL 
    AND TRIM(name) != ''
    AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_symptoms FROM cde_nodes WHERE node_type = 'symptom';

  -- ============================================
  -- PHASE 4: Insert MEDICATIONS
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'medication', id, TRIM(name),
    jsonb_build_object(
      'atc_code', atc_code,
      'substance', substance,
      'dosage_forms', dosage_forms,
      'has_embedding', embedding IS NOT NULL
    )
  FROM medications
  WHERE name IS NOT NULL 
    AND TRIM(name) != ''
    AND name ~ '[a-zA-Z]{2,}'
    AND name NOT LIKE '%"dosage"%'
    AND name NOT LIKE '%":%'
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_medications FROM cde_nodes WHERE node_type = 'medication';

  -- ============================================
  -- PHASE 5: Insert TREATMENTS
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'treatment', id, TRIM(name),
    jsonb_build_object(
      'type', type,
      'duration', duration,
      'has_embedding', embedding IS NOT NULL
    )
  FROM treatments
  WHERE name IS NOT NULL 
    AND TRIM(name) != ''
    AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_treatments FROM cde_nodes WHERE node_type = 'treatment';

  -- ============================================
  -- PHASE 6: Create EDGES from drug_interactions (substance-based)
  -- ============================================

  INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
  SELECT DISTINCT
    n1.id as source_node_id,
    n2.id as target_node_id,
    COALESCE(di.interaction_type, 'interacts_with') as relationship_type,
    'drug_interactions' as provenance,
    jsonb_build_object(
      'severity', di.severity,
      'description', LEFT(di.description, 500),
      'recommendation', di.recommendation
    ) as context
  FROM drug_interactions di
  JOIN medication_substances ms ON ms.medication_id = di.medication_id
  JOIN substances s1 ON s1.id = ms.substance_id
  JOIN substances s2 ON LOWER(TRIM(s2.name)) = LOWER(TRIM(di.interacting_drug))
  JOIN cde_nodes n1 ON n1.substance_id = s1.id AND n1.node_type = 'substance'
  JOIN cde_nodes n2 ON n2.substance_id = s2.id AND n2.node_type = 'substance'
  WHERE n1.id != n2.id
  ON CONFLICT DO NOTHING;

  -- ============================================
  -- PHASE 7: Create EDGES from pathology_symptoms
  -- ============================================

  INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
  SELECT DISTINCT
    n1.id as source_node_id,
    n2.id as target_node_id,
    'has_symptom' as relationship_type,
    'pathology_symptoms' as provenance,
    jsonb_build_object(
      'frequency_percent', ps.frequency_percent,
      'is_primary', ps.is_primary
    ) as context
  FROM pathology_symptoms ps
  JOIN cde_nodes n1 ON n1.external_id = ps.pathology_id AND n1.node_type = 'pathology'
  JOIN cde_nodes n2 ON n2.external_id = ps.symptom_id AND n2.node_type = 'symptom'
  WHERE n1.id != n2.id
  ON CONFLICT DO NOTHING;

  -- ============================================
  -- PHASE 8: Create EDGES from pathology_treatments
  -- ============================================

  INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
  SELECT DISTINCT
    n1.id as source_node_id,
    n2.id as target_node_id,
    'treated_by' as relationship_type,
    'pathology_treatments' as provenance,
    jsonb_build_object(
      'efficacy', pt.efficacy,
      'is_first_line', pt.is_first_line
    ) as context
  FROM pathology_treatments pt
  JOIN cde_nodes n1 ON n1.external_id = pt.pathology_id AND n1.node_type = 'pathology'
  JOIN cde_nodes n2 ON n2.external_id = pt.treatment_id AND n2.node_type = 'treatment'
  WHERE n1.id != n2.id
  ON CONFLICT DO NOTHING;

  -- ============================================
  -- PHASE 9: Create EDGES from medication_substances
  -- ============================================

  INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
  SELECT DISTINCT
    n1.id as source_node_id,
    n2.id as target_node_id,
    'contains_substance' as relationship_type,
    'medication_substances' as provenance,
    '{}'::jsonb as context
  FROM medication_substances ms_link
  JOIN cde_nodes n1 ON n1.external_id = ms_link.medication_id AND n1.node_type = 'medication'
  JOIN cde_nodes n2 ON n2.substance_id = ms_link.substance_id AND n2.node_type = 'substance'
  WHERE n1.id != n2.id
  ON CONFLICT DO NOTHING;

  -- ============================================
  -- PHASE 10: Create EDGES from contraindications
  -- ============================================

  INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
  SELECT DISTINCT
    n1.id as source_node_id,
    n2.id as target_node_id,
    'contraindicated_for' as relationship_type,
    'contraindications' as provenance,
    jsonb_build_object(
      'severity', c.severity,
      'description', LEFT(c.description, 500)
    ) as context
  FROM contraindications c
  JOIN cde_nodes n1 ON n1.external_id = c.medication_id AND n1.node_type = 'medication'
  JOIN cde_nodes n2 ON LOWER(TRIM(n2.name)) = LOWER(TRIM(c.condition)) AND n2.node_type = 'pathology'
  WHERE n1.id != n2.id
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_edges FROM cde_edges;

  result := jsonb_build_object(
    'success', true,
    'nodes', jsonb_build_object(
      'substances', v_substances,
      'pathologies', v_pathologies,
      'symptoms', v_symptoms,
      'medications', v_medications,
      'treatments', v_treatments,
      'total', v_substances + v_pathologies + v_symptoms + v_medications + v_treatments
    ),
    'edges', v_edges,
    'seeded_at', now(),
    'message', 'CDE seeded with ALL node types and relationships'
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO authenticated;
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO service_role;
