-- ============================================
-- SEMANTIC MIND MAP - ONTOLOGY SCHEMA
-- Phase 1: nodes, edges, graph_cache tables
-- ============================================

-- ============================================
-- 1. NODES TABLE - Typed semantic nodes
-- ============================================

CREATE TABLE IF NOT EXISTS semantic_nodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node type (formal ontology)
    node_type text NOT NULL CHECK (node_type IN (
        'PATHOLOGY',      -- Pathologie (ex: syndrome néphrotique)
        'DRUG',           -- Médicament (ex: cyclosporine, prednisolone)
        'SYMPTOM',        -- Symptôme/signe (ex: œdème des paupières)
        'COMPLICATION',   -- Complication/risque (ex: varicelle chez immunodéprimé)
        'CONDITION',      -- Condition clinique / contexte (ex: rechute, cortico-dépendance)
        'LAB',            -- Examen / biomarqueur
        'GUIDELINE',      -- Recommandation clinique
        'EVIDENCE'        -- Source / preuve scientifique
    )),
    
    -- Core attributes
    label text NOT NULL,
    description text,
    
    -- Extended attributes (flexible)
    attributes jsonb DEFAULT '{}'::jsonb,
    
    -- Source tracking
    source text DEFAULT 'local' CHECK (source IN ('local', 'openfda', 'drugbank', 'ncbi', 'manual')),
    source_id text, -- External ID if from API
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Unique constraint: no duplicate nodes of same type with same label
    UNIQUE(node_type, label)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_semantic_nodes_type ON semantic_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_semantic_nodes_label ON semantic_nodes(label);
CREATE INDEX IF NOT EXISTS idx_semantic_nodes_source ON semantic_nodes(source);

-- ============================================
-- 2. EDGES TABLE - Typed semantic relationships
-- ============================================

CREATE TABLE IF NOT EXISTS semantic_edges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node references
    source_node_id uuid NOT NULL REFERENCES semantic_nodes(id) ON DELETE CASCADE,
    target_node_id uuid NOT NULL REFERENCES semantic_nodes(id) ON DELETE CASCADE,
    
    -- Edge type (formal ontology)
    edge_type text NOT NULL CHECK (edge_type IN (
        'TREATS',              -- X traite Y
        'ASSOCIATED_WITH',     -- Association clinique
        'CAUSES',              -- Causalité
        'LEADS_TO',            -- Évolution
        'RISK_INCREASED_BY',   -- Facteur de risque
        'INDICATED_IF',        -- Indication conditionnelle
        'CONTRAINDICATED_IF',  -- Contre-indication
        'MANAGED_BY',          -- Prise en charge
        'COMPLICATES',         -- Complication de
        'MONITOR_WITH'         -- Monitoring
    )),
    
    -- Edge metadata
    meta jsonb DEFAULT '{}'::jsonb,
    -- Expected meta structure:
    -- {
    --   "direction": "source_to_target" | "bidirectional",
    --   "weight": 0.0-1.0 (confidence score),
    --   "rationale": "Texte court exploitable en fiche",
    --   "tags": ["rechute", "immunosuppression", ...],
    --   "evidence_level": "A" | "B" | "C" | "D",
    --   "source_refs": ["PMID:12345", ...]
    -- }
    
    -- Knowledge versioning (for cache invalidation)
    knowledge_version integer DEFAULT 1,
    
    -- Source tracking
    source text DEFAULT 'local' CHECK (source IN ('local', 'openfda', 'drugbank', 'ncbi', 'manual', 'ai_inferred')),
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Unique constraint: no duplicate edges
    UNIQUE(source_node_id, target_node_id, edge_type)
);

-- Indexes for fast graph traversal
CREATE INDEX IF NOT EXISTS idx_semantic_edges_source ON semantic_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_semantic_edges_target ON semantic_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_semantic_edges_type ON semantic_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_semantic_edges_version ON semantic_edges(knowledge_version);

-- ============================================
-- 3. GRAPH CACHE TABLE - Computed graph snapshots
-- ============================================

CREATE TABLE IF NOT EXISTS graph_cache (
    -- Primary key: hash of (central_node_id + params + version)
    cache_key text PRIMARY KEY,
    
    -- Cache metadata
    central_node_id uuid REFERENCES semantic_nodes(id) ON DELETE CASCADE,
    params_hash text NOT NULL,
    knowledge_version integer NOT NULL,
    
    -- Cached payload
    payload jsonb NOT NULL,
    -- Expected payload structure:
    -- {
    --   "nodes": [{ id, node_type, label, attributes }],
    --   "edges": [{ id, source_node_id, target_node_id, edge_type, meta }],
    --   "metrics": { node_count, edge_count, compute_time_ms }
    -- }
    
    -- Timestamps
    created_at timestamptz DEFAULT now(),
    last_accessed_at timestamptz DEFAULT now()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_graph_cache_accessed ON graph_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_graph_cache_version ON graph_cache(knowledge_version);

-- ============================================
-- 4. KNOWLEDGE VERSION TRACKER
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_version (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton
    current_version integer DEFAULT 1,
    last_updated_at timestamptz DEFAULT now(),
    update_reason text
);

-- Initialize version tracker
INSERT INTO knowledge_version (id, current_version, update_reason)
VALUES (1, 1, 'Initial schema creation')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to get current knowledge version
CREATE OR REPLACE FUNCTION get_knowledge_version()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
    SELECT current_version FROM knowledge_version WHERE id = 1;
$$;

-- Function to increment knowledge version (triggers cache invalidation)
CREATE OR REPLACE FUNCTION increment_knowledge_version(reason text DEFAULT 'Manual update')
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    new_version integer;
BEGIN
    UPDATE knowledge_version 
    SET current_version = current_version + 1,
        last_updated_at = now(),
        update_reason = reason
    WHERE id = 1
    RETURNING current_version INTO new_version;
    
    RETURN new_version;
END;
$$;

-- Function to get neighbors of a node (distance 1)
CREATE OR REPLACE FUNCTION get_node_neighbors(
    p_node_id uuid,
    p_max_results integer DEFAULT 50,
    p_min_weight float DEFAULT 0.3
)
RETURNS TABLE (
    node_id uuid,
    node_type text,
    label text,
    attributes jsonb,
    edge_id uuid,
    edge_type text,
    edge_meta jsonb,
    direction text
)
LANGUAGE sql
STABLE
AS $$
    -- Outgoing edges
    SELECT 
        n.id as node_id,
        n.node_type,
        n.label,
        n.attributes,
        e.id as edge_id,
        e.edge_type,
        e.meta as edge_meta,
        'outgoing' as direction
    FROM semantic_edges e
    JOIN semantic_nodes n ON n.id = e.target_node_id
    WHERE e.source_node_id = p_node_id
      AND COALESCE((e.meta->>'weight')::float, 0.5) >= p_min_weight
    
    UNION ALL
    
    -- Incoming edges
    SELECT 
        n.id as node_id,
        n.node_type,
        n.label,
        n.attributes,
        e.id as edge_id,
        e.edge_type,
        e.meta as edge_meta,
        'incoming' as direction
    FROM semantic_edges e
    JOIN semantic_nodes n ON n.id = e.source_node_id
    WHERE e.target_node_id = p_node_id
      AND COALESCE((e.meta->>'weight')::float, 0.5) >= p_min_weight
    
    LIMIT p_max_results;
$$;

-- Function to check/get cache
CREATE OR REPLACE FUNCTION get_graph_cache(p_cache_key text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    cached_payload jsonb;
BEGIN
    -- Update last_accessed and return payload if exists
    UPDATE graph_cache 
    SET last_accessed_at = now()
    WHERE cache_key = p_cache_key
    RETURNING payload INTO cached_payload;
    
    RETURN cached_payload;
END;
$$;

-- Function to set cache
CREATE OR REPLACE FUNCTION set_graph_cache(
    p_cache_key text,
    p_central_node_id uuid,
    p_params_hash text,
    p_knowledge_version integer,
    p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO graph_cache (cache_key, central_node_id, params_hash, knowledge_version, payload)
    VALUES (p_cache_key, p_central_node_id, p_params_hash, p_knowledge_version, p_payload)
    ON CONFLICT (cache_key) DO UPDATE SET
        payload = EXCLUDED.payload,
        last_accessed_at = now();
END;
$$;

-- ============================================
-- 6. PERMISSIONS
-- ============================================

GRANT ALL ON TABLE semantic_nodes TO authenticated, anon, service_role;
GRANT ALL ON TABLE semantic_edges TO authenticated, anon, service_role;
GRANT ALL ON TABLE graph_cache TO authenticated, anon, service_role;
GRANT ALL ON TABLE knowledge_version TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION get_knowledge_version TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION increment_knowledge_version TO service_role;
GRANT EXECUTE ON FUNCTION get_node_neighbors TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_graph_cache TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION set_graph_cache TO service_role;
