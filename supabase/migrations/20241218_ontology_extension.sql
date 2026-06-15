-- ============================================
-- ONTOLOGY EXTENSION - Phase 2
-- Adds facets indexes, new edge types, and optimized functions
-- Based on ChatGPT's integration plan
-- ============================================

-- ============================================
-- 1. FACET INDEXES (for category_id, subcategory, tags filtering)
-- ============================================

-- Index for filtering by category_id
CREATE INDEX IF NOT EXISTS idx_nodes_category
ON semantic_nodes ((attributes->>'category_id'));

-- Index for filtering by subcategory
CREATE INDEX IF NOT EXISTS idx_nodes_subcategory
ON semantic_nodes ((attributes->>'subcategory'));

-- GIN index for tags array (supports @> operator for array contains)
CREATE INDEX IF NOT EXISTS idx_nodes_tags_gin
ON semantic_nodes USING gin ((attributes->'tags'));

-- ============================================
-- 2. EXTEND EDGE TYPES (add structuring relations)
-- ============================================

-- Drop old constraint and add extended one
ALTER TABLE semantic_edges
DROP CONSTRAINT IF EXISTS semantic_edges_edge_type_check;

ALTER TABLE semantic_edges
ADD CONSTRAINT semantic_edges_edge_type_check
CHECK (edge_type IN (
    -- Original types
    'TREATS',              -- X traite Y
    'ASSOCIATED_WITH',     -- Association clinique
    'CAUSES',              -- Causalité
    'LEADS_TO',            -- Évolution
    'RISK_INCREASED_BY',   -- Facteur de risque
    'INDICATED_IF',        -- Indication conditionnelle
    'CONTRAINDICATED_IF',  -- Contre-indication
    'MANAGED_BY',          -- Prise en charge
    'COMPLICATES',         -- Complication de
    'MONITOR_WITH',        -- Monitoring
    -- NEW structuring types
    'TARGETS',             -- Molécule/thérapie cible un récepteur/voie
    'BIOMARKER_OF',        -- Biomarqueur d'une pathologie/complication
    'DIAGNOSED_BY',        -- Pathologie diagnostiquée par examen/score
    'PREDISPOSED_BY',      -- Prédisposition génétique / terrain
    'WORSENED_BY',         -- Aggravé par un facteur (lifestyle/env)
    'IMPROVED_BY',         -- Amélioré par un facteur
    'INTERACTS_WITH',      -- Interactions (drug-drug / substance-drug)
    'CONFLICTS_WITH',      -- Contre-indication forte
    'PREVENTS'             -- Prévention (vaccin, mesure, traitement prophylactique)
));

-- ============================================
-- 3. OPTIMIZED NEIGHBOR FUNCTION (with category filtering)
-- ============================================

CREATE OR REPLACE FUNCTION get_node_neighbors_v2(
    p_node_id uuid,
    p_max_results integer DEFAULT 50,
    p_min_weight float DEFAULT 0.3,
    p_include_categories text[] DEFAULT NULL,
    p_exclude_categories text[] DEFAULT NULL,
    p_include_edge_types text[] DEFAULT NULL,
    p_exclude_edge_types text[] DEFAULT NULL
)
RETURNS TABLE (
    node_id uuid,
    node_type text,
    label text,
    description text,
    attributes jsonb,
    category_id text,
    subcategory text,
    edge_id uuid,
    edge_type text,
    edge_meta jsonb,
    direction text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH all_neighbors AS (
        -- Outgoing edges
        SELECT 
            n.id as node_id,
            n.node_type,
            n.label,
            n.description,
            n.attributes,
            n.attributes->>'category_id' as category_id,
            n.attributes->>'subcategory' as subcategory,
            e.id as edge_id,
            e.edge_type,
            e.meta as edge_meta,
            'outgoing'::text as direction,
            COALESCE((e.meta->>'weight')::float, 0.5) as weight
        FROM semantic_edges e
        JOIN semantic_nodes n ON n.id = e.target_node_id
        WHERE e.source_node_id = p_node_id
        
        UNION ALL
        
        -- Incoming edges
        SELECT 
            n.id as node_id,
            n.node_type,
            n.label,
            n.description,
            n.attributes,
            n.attributes->>'category_id' as category_id,
            n.attributes->>'subcategory' as subcategory,
            e.id as edge_id,
            e.edge_type,
            e.meta as edge_meta,
            'incoming'::text as direction,
            COALESCE((e.meta->>'weight')::float, 0.5) as weight
        FROM semantic_edges e
        JOIN semantic_nodes n ON n.id = e.source_node_id
        WHERE e.target_node_id = p_node_id
    )
    SELECT 
        an.node_id,
        an.node_type,
        an.label,
        an.description,
        an.attributes,
        an.category_id,
        an.subcategory,
        an.edge_id,
        an.edge_type,
        an.edge_meta,
        an.direction
    FROM all_neighbors an
    WHERE 
        -- Weight filter
        an.weight >= p_min_weight
        -- Category inclusion filter
        AND (p_include_categories IS NULL OR an.category_id = ANY(p_include_categories))
        -- Category exclusion filter
        AND (p_exclude_categories IS NULL OR an.category_id IS NULL OR NOT an.category_id = ANY(p_exclude_categories))
        -- Edge type inclusion filter
        AND (p_include_edge_types IS NULL OR an.edge_type = ANY(p_include_edge_types))
        -- Edge type exclusion filter
        AND (p_exclude_edge_types IS NULL OR NOT an.edge_type = ANY(p_exclude_edge_types))
    ORDER BY an.weight DESC
    LIMIT p_max_results;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_node_neighbors_v2 TO authenticated, anon, service_role;

-- ============================================
-- 4. UPDATE KNOWLEDGE VERSION
-- ============================================

SELECT increment_knowledge_version('Extended ontology with facets and new edge types');
