-- MIGRATION: Fix seed_cde_knowledge_graph - Use only guaranteed columns
-- 2025-12-17 - Robust version that works with any schema variant

DROP FUNCTION IF EXISTS public.seed_cde_knowledge_graph() CASCADE;

CREATE OR REPLACE FUNCTION public.seed_cde_knowledge_graph()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
AS $$
DECLARE
    v_substances INTEGER := 0;
    v_pathologies INTEGER := 0;
    v_symptoms INTEGER := 0;
    v_medications INTEGER := 0;
    v_edges INTEGER := 0;
    v_result JSONB;
BEGIN
    RAISE NOTICE 'Starting CDE Knowledge Graph seeding...';

    -- ============================================
    -- PHASE 1: Insert SUBSTANCES (simple - name only)
    -- ============================================
    
    INSERT INTO cde_nodes (node_type, name, properties)
    SELECT DISTINCT
        'substance',
        s.name,
        jsonb_build_object('source', 'substances_table')
    FROM substances s
    WHERE s.name IS NOT NULL 
      AND LENGTH(TRIM(s.name)) > 2
      AND NOT EXISTS (
          SELECT 1 FROM cde_nodes n 
          WHERE LOWER(TRIM(n.name)) = LOWER(TRIM(s.name)) AND n.node_type = 'substance'
      )
    ON CONFLICT DO NOTHING;
    
    SELECT COUNT(*) INTO v_substances FROM cde_nodes WHERE node_type = 'substance';
    RAISE NOTICE 'Total substances: %', v_substances;

    -- ============================================
    -- PHASE 2: Insert PATHOLOGIES
    -- ============================================
    
    INSERT INTO cde_nodes (node_type, external_id, name, properties)
    SELECT DISTINCT ON (LOWER(TRIM(name)))
        'pathology',
        id::TEXT,
        TRIM(name),
        '{}'::jsonb
    FROM pathologies
    WHERE name IS NOT NULL 
      AND TRIM(name) != ''
      AND NOT EXISTS (
          SELECT 1 FROM cde_nodes n 
          WHERE LOWER(TRIM(n.name)) = LOWER(TRIM(pathologies.name)) AND n.node_type = 'pathology'
      )
    ORDER BY LOWER(TRIM(name)), created_at DESC
    LIMIT 2000
    ON CONFLICT DO NOTHING;
    
    SELECT COUNT(*) INTO v_pathologies FROM cde_nodes WHERE node_type = 'pathology';
    RAISE NOTICE 'Total pathologies: %', v_pathologies;

    -- ============================================
    -- PHASE 3: Insert SYMPTOMS
    -- ============================================
    
    INSERT INTO cde_nodes (node_type, external_id, name, properties)
    SELECT DISTINCT ON (LOWER(TRIM(name)))
        'symptom',
        id::TEXT,
        TRIM(name),
        '{}'::jsonb
    FROM symptoms
    WHERE name IS NOT NULL 
      AND TRIM(name) != ''
      AND NOT EXISTS (
          SELECT 1 FROM cde_nodes n 
          WHERE LOWER(TRIM(n.name)) = LOWER(TRIM(symptoms.name)) AND n.node_type = 'symptom'
      )
    ORDER BY LOWER(TRIM(name)), created_at DESC
    ON CONFLICT DO NOTHING;
    
    SELECT COUNT(*) INTO v_symptoms FROM cde_nodes WHERE node_type = 'symptom';
    RAISE NOTICE 'Total symptoms: %', v_symptoms;

    -- ============================================
    -- PHASE 4: Insert MEDICATIONS (limited)
    -- ============================================
    
    INSERT INTO cde_nodes (node_type, external_id, name, properties)
    SELECT DISTINCT ON (LOWER(TRIM(name)))
        'medication',
        id::TEXT,
        TRIM(name),
        '{}'::jsonb
    FROM medications
    WHERE name IS NOT NULL 
      AND TRIM(name) != ''
      AND NOT EXISTS (
          SELECT 1 FROM cde_nodes n 
          WHERE LOWER(TRIM(n.name)) = LOWER(TRIM(medications.name)) AND n.node_type = 'medication'
      )
    ORDER BY LOWER(TRIM(name)), created_at DESC
    LIMIT 3000
    ON CONFLICT DO NOTHING;
    
    SELECT COUNT(*) INTO v_medications FROM cde_nodes WHERE node_type = 'medication';
    RAISE NOTICE 'Total medications: %', v_medications;

    -- ============================================
    -- PHASE 5: Create EDGES from drug_interactions
    -- ============================================
    
    -- Add interacting drugs as substance nodes if not exist
    INSERT INTO cde_nodes (node_type, name, properties)
    SELECT DISTINCT
        'substance',
        TRIM(interacting_drug),
        jsonb_build_object('source', 'drug_interactions')
    FROM drug_interactions
    WHERE interacting_drug IS NOT NULL 
      AND TRIM(interacting_drug) != ''
      AND LENGTH(TRIM(interacting_drug)) > 2
      AND NOT EXISTS (
          SELECT 1 FROM cde_nodes n 
          WHERE LOWER(TRIM(n.name)) = LOWER(TRIM(drug_interactions.interacting_drug))
      )
    ON CONFLICT DO NOTHING;

    -- Create edges between medications and interacting drugs
    INSERT INTO cde_edges (source_node_id, target_node_id, relationship_type, provenance, context)
    SELECT DISTINCT ON (src.id, tgt.id)
        src.id,
        tgt.id,
        COALESCE(
            CASE 
                WHEN di.severity IN ('severe', 'contraindicated') THEN 'CONTRAINDICATED_WITH'
                WHEN di.severity = 'moderate' THEN 'CAUTION_WITH'
                ELSE 'INTERACTS_WITH'
            END,
            'INTERACTS_WITH'
        ),
        'drug_interactions',
        jsonb_build_object('severity', di.severity)
    FROM drug_interactions di
    JOIN cde_nodes src ON LOWER(TRIM(src.name)) = LOWER(TRIM(di.medication_name))
    JOIN cde_nodes tgt ON LOWER(TRIM(tgt.name)) = LOWER(TRIM(di.interacting_drug))
    WHERE src.id != tgt.id
    ORDER BY src.id, tgt.id
    ON CONFLICT DO NOTHING;
    
    SELECT COUNT(*) INTO v_edges FROM cde_edges;
    RAISE NOTICE 'Total edges: %', v_edges;

    -- ============================================
    -- RESULT
    -- ============================================
    
    v_result := jsonb_build_object(
        'success', true,
        'substances', v_substances,
        'pathologies', v_pathologies,
        'symptoms', v_symptoms,
        'medications', v_medications,
        'edges', v_edges,
        'seeded_at', now()
    );
    
    RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO authenticated;
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO service_role;
