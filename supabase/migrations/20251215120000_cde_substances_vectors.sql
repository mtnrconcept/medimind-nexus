-- ============================================
-- CDE Substances with Vector Embeddings
-- Uses the substances table as the single source of truth for KG nodes
-- Adds vector embeddings for faster semantic similarity search
-- ============================================

-- STEP 1: Add vector embedding column to substances table
ALTER TABLE substances 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Add description and mechanism columns for richer embeddings
ALTER TABLE substances 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS mechanism_of_action TEXT,
ADD COLUMN IF NOT EXISTS therapeutic_class TEXT;

-- Create HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_substances_embedding 
ON substances USING hnsw (embedding vector_cosine_ops);

-- Text search index
CREATE INDEX IF NOT EXISTS idx_substances_name_gin 
ON substances USING gin(to_tsvector('french', name));

-- ============================================
-- STEP 2: Add external_substance_id to cde_nodes for direct linking
-- ============================================

ALTER TABLE cde_nodes 
ADD COLUMN IF NOT EXISTS substance_id UUID REFERENCES substances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cde_nodes_substance_id ON cde_nodes(substance_id);

-- ============================================
-- STEP 3: Create vector similarity search function for substances
-- ============================================

CREATE OR REPLACE FUNCTION search_substances_by_vector(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  atc_code TEXT,
  description TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.atc_code,
    s.description,
    1 - (s.embedding <=> query_embedding) as similarity
  FROM substances s
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- STEP 4: Create function to find related substances
-- ============================================

CREATE OR REPLACE FUNCTION find_related_substances(
  substance_id_input UUID,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  atc_code TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
  source_embedding vector(384);
BEGIN
  -- Get the embedding of the source substance
  SELECT embedding INTO source_embedding 
  FROM substances 
  WHERE id = substance_id_input;
  
  IF source_embedding IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.atc_code,
    1 - (s.embedding <=> source_embedding) as similarity
  FROM substances s
  WHERE s.id != substance_id_input
    AND s.embedding IS NOT NULL
  ORDER BY s.embedding <=> source_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- STEP 5: Clean and rebuild seed function using substances table directly
-- ============================================

DROP FUNCTION IF EXISTS seed_cde_knowledge_graph() CASCADE;
DROP FUNCTION IF EXISTS reset_and_seed_cde() CASCADE;

CREATE OR REPLACE FUNCTION seed_cde_knowledge_graph()
RETURNS JSON AS $$
DECLARE
  v_substances INT := 0;
  v_pathologies INT := 0;
  v_symptoms INT := 0;
  v_edges INT := 0;
  result JSON;
BEGIN
  SET LOCAL statement_timeout = '300s';

  -- ============================================
  -- PHASE 1: Clear existing CDE data (but keep substances table intact)
  -- ============================================
  
  DELETE FROM cde_pair_analyses WHERE id IS NOT NULL;
  DELETE FROM cde_analyzed_pairs WHERE id IS NOT NULL;
  DELETE FROM cde_analysis_runs WHERE id IS NOT NULL;
  DELETE FROM cde_edges WHERE source_node_id IS NOT NULL;
  DELETE FROM cde_nodes WHERE id IS NOT NULL;

  -- ============================================
  -- PHASE 2: Insert SUBSTANCES from substances table (single source of truth)
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
  -- PHASE 3: Insert PATHOLOGIES
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'pathology', id, TRIM(name),
    jsonb_build_object(
      'icd_code', icd_code, 
      'category', category,
      'has_embedding', embedding IS NOT NULL
    )
  FROM pathologies
  WHERE name IS NOT NULL 
    AND TRIM(name) != ''
    AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_pathologies FROM cde_nodes WHERE node_type = 'pathology';

  -- ============================================
  -- PHASE 4: Insert SYMPTOMS
  -- ============================================

  INSERT INTO cde_nodes (node_type, external_id, name, properties)
  SELECT DISTINCT ON (LOWER(TRIM(name)))
    'symptom', id, TRIM(name),
    jsonb_build_object(
      'body_system', body_system,
      'has_embedding', embedding IS NOT NULL
    )
  FROM symptoms
  WHERE name IS NOT NULL 
    AND TRIM(name) != ''
    AND name ~ '[a-zA-Z]{2,}'
  ORDER BY LOWER(TRIM(name)), created_at DESC;

  SELECT COUNT(*) INTO v_symptoms FROM cde_nodes WHERE node_type = 'symptom';

  -- ============================================
  -- PHASE 5: Create edges from drug_interactions (substance-based)
  -- ============================================

  -- Create edges between substances that interact
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

  SELECT COUNT(*) INTO v_edges FROM cde_edges;

  result := jsonb_build_object(
    'success', true,
    'total_substances', v_substances,
    'total_pathologies', v_pathologies,
    'total_symptoms', v_symptoms,
    'total_edges', v_edges,
    'seeded_at', now(),
    'message', 'CDE seeded from substances table with vector support'
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO authenticated;
GRANT EXECUTE ON FUNCTION seed_cde_knowledge_graph() TO service_role;
GRANT EXECUTE ON FUNCTION search_substances_by_vector(vector, float, int) TO authenticated;
GRANT EXECUTE ON FUNCTION find_related_substances(UUID, int) TO authenticated;
