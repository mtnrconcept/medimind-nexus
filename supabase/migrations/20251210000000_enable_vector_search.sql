-- ============================================================================
-- MIGRATION : Activation de la recherche vectorielle (IA)
-- MediMind Nexus - Support pour HNSW Indexing (MiniLM-L6-v2 - 384 dimensions)
-- ============================================================================

-- 1. Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ajouter la colonne embedding (384 dimensions pour MiniLM-L6-v2)
--    Modèle gratuit et performance pour Edge Functions.

-- Pathologies
ALTER TABLE pathologies 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Symptômes
ALTER TABLE symptoms 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Traitements
ALTER TABLE treatments 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Médicaments
ALTER TABLE medications 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. Créer les index HNSW (Hierarchical Navigable Small World)
--    'vector_cosine_ops' est utilisé pour la similarité cosinus.

CREATE INDEX IF NOT EXISTS idx_pathologies_embedding 
ON pathologies USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_symptoms_embedding 
ON symptoms USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_treatments_embedding 
ON treatments USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_medications_embedding 
ON medications USING hnsw (embedding vector_cosine_ops);

-- 4. Fonction utilitaire pour la recherche par similarité

CREATE OR REPLACE FUNCTION match_medical_entities(
    query_embedding vector(384),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    name text,
    entity_type text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        id,
        name,
        'pathology' as entity_type,
        1 - (embedding <=> query_embedding) as similarity
    FROM pathologies
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    
    UNION ALL
    
    SELECT
        id,
        name,
        'symptom' as entity_type,
        1 - (embedding <=> query_embedding) as similarity
    FROM symptoms
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    
    UNION ALL
    
    SELECT
        id,
        name,
        'treatment' as entity_type,
        1 - (embedding <=> query_embedding) as similarity
    FROM treatments
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    
    UNION ALL
    
    SELECT
        id,
        name,
        'medication' as entity_type,
        1 - (embedding <=> query_embedding) as similarity
    FROM medications
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;
