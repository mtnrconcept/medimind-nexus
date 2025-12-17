-- ============================================================================
-- MIGRATION: Neural Network-like Knowledge Graph with Semantic Indices
-- MediMind Nexus - Réseau neuronal sémantique avec optimiseurs
-- ============================================================================

-- ===========================================
-- PHASE 1: Add embeddings to cde_nodes
-- ===========================================

-- Add vector embedding column to cde_nodes (384D for MiniLM-L6-v2)
ALTER TABLE cde_nodes 
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Add semantic metadata
ALTER TABLE cde_nodes
ADD COLUMN IF NOT EXISTS semantic_cluster INTEGER,
ADD COLUMN IF NOT EXISTS activation_score FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS last_activated_at TIMESTAMP WITH TIME ZONE;

-- Create HNSW index for fast semantic search
CREATE INDEX IF NOT EXISTS idx_cde_nodes_embedding 
ON cde_nodes USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_cde_nodes_semantic_cluster 
ON cde_nodes(semantic_cluster);

-- ===========================================
-- PHASE 2: Add synaptic weights to cde_edges
-- ===========================================

-- Add neural network-like properties to edges
ALTER TABLE cde_edges
ADD COLUMN IF NOT EXISTS weight FLOAT DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS semantic_similarity FLOAT,
ADD COLUMN IF NOT EXISTS activation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS decay_rate FLOAT DEFAULT 0.01,
ADD COLUMN IF NOT EXISTS last_reinforced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_learned BOOLEAN DEFAULT FALSE;

-- Index for optimized queries
CREATE INDEX IF NOT EXISTS idx_cde_edges_weight ON cde_edges(weight DESC);
CREATE INDEX IF NOT EXISTS idx_cde_edges_activation ON cde_edges(activation_count DESC);

-- ===========================================
-- PHASE 3: Create semantic_links table for auto-discovered connections
-- ===========================================

CREATE TABLE IF NOT EXISTS cde_semantic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id UUID NOT NULL REFERENCES cde_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES cde_nodes(id) ON DELETE CASCADE,
    similarity_score FLOAT NOT NULL,
    link_type TEXT DEFAULT 'semantic', -- semantic, causal, temporal, hierarchical
    confidence FLOAT DEFAULT 0.5,
    weight FLOAT DEFAULT 0.5,
    activation_count INTEGER DEFAULT 0,
    is_bidirectional BOOLEAN DEFAULT TRUE,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_validated_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(source_node_id, target_node_id)
);

CREATE INDEX idx_semantic_links_source ON cde_semantic_links(source_node_id);
CREATE INDEX idx_semantic_links_target ON cde_semantic_links(target_node_id);
CREATE INDEX idx_semantic_links_similarity ON cde_semantic_links(similarity_score DESC);
CREATE INDEX idx_semantic_links_weight ON cde_semantic_links(weight DESC);

-- ===========================================
-- PHASE 4: Semantic similarity functions
-- ===========================================

-- Find semantically similar nodes using cosine similarity
CREATE OR REPLACE FUNCTION find_similar_nodes(
    node_id_input UUID,
    similarity_threshold FLOAT DEFAULT 0.7,
    max_results INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    node_type TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
    source_embedding vector(384);
BEGIN
    -- Get source node embedding
    SELECT embedding INTO source_embedding 
    FROM cde_nodes 
    WHERE id = node_id_input;
    
    IF source_embedding IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        n.id,
        n.name,
        n.node_type,
        (1 - (n.embedding <=> source_embedding))::FLOAT as similarity
    FROM cde_nodes n
    WHERE n.id != node_id_input
        AND n.embedding IS NOT NULL
        AND (1 - (n.embedding <=> source_embedding)) > similarity_threshold
    ORDER BY n.embedding <=> source_embedding
    LIMIT max_results;
END;
$$;

-- Search nodes by semantic query embedding
CREATE OR REPLACE FUNCTION semantic_search_nodes(
    query_embedding vector(384),
    similarity_threshold FLOAT DEFAULT 0.6,
    max_results INTEGER DEFAULT 30,
    node_type_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    node_type TEXT,
    similarity FLOAT,
    activation_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id,
        n.name,
        n.node_type,
        (1 - (n.embedding <=> query_embedding))::FLOAT as similarity,
        COALESCE(n.activation_score, 0)::FLOAT
    FROM cde_nodes n
    WHERE n.embedding IS NOT NULL
        AND (1 - (n.embedding <=> query_embedding)) > similarity_threshold
        AND (node_type_filter IS NULL OR n.node_type = node_type_filter)
    ORDER BY n.embedding <=> query_embedding
    LIMIT max_results;
END;
$$;

-- ===========================================
-- PHASE 5: Auto-link nodes based on semantic similarity
-- ===========================================

CREATE OR REPLACE FUNCTION create_semantic_links(
    similarity_threshold FLOAT DEFAULT 0.75,
    max_links_per_node INTEGER DEFAULT 10,
    batch_size INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '600s'
AS $$
DECLARE
    v_created INTEGER := 0;
    v_node RECORD;
    v_similar RECORD;
BEGIN
    -- Process nodes with embeddings
    FOR v_node IN 
        SELECT id, embedding 
        FROM cde_nodes 
        WHERE embedding IS NOT NULL
        ORDER BY RANDOM()
        LIMIT batch_size
    LOOP
        -- Find similar nodes and create links
        FOR v_similar IN
            SELECT 
                n.id as target_id,
                (1 - (n.embedding <=> v_node.embedding)) as sim
            FROM cde_nodes n
            WHERE n.id != v_node.id
                AND n.embedding IS NOT NULL
                AND (1 - (n.embedding <=> v_node.embedding)) > similarity_threshold
            ORDER BY n.embedding <=> v_node.embedding
            LIMIT max_links_per_node
        LOOP
            INSERT INTO cde_semantic_links (source_node_id, target_node_id, similarity_score, weight)
            VALUES (v_node.id, v_similar.target_id, v_similar.sim, v_similar.sim)
            ON CONFLICT (source_node_id, target_node_id) 
            DO UPDATE SET 
                similarity_score = v_similar.sim,
                last_validated_at = NOW();
            
            v_created := v_created + 1;
        END LOOP;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'links_created_or_updated', v_created,
        'threshold', similarity_threshold,
        'processed_nodes', batch_size
    );
END;
$$;

-- ===========================================
-- PHASE 6: Neural activation propagation
-- ===========================================

-- Activate a node and propagate activation through network
CREATE OR REPLACE FUNCTION activate_node(
    node_id_input UUID,
    activation_strength FLOAT DEFAULT 1.0,
    propagation_depth INTEGER DEFAULT 3,
    decay_factor FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    node_type TEXT,
    final_activation FLOAT,
    depth INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    current_depth INTEGER := 0;
BEGIN
    -- Create temp table for activation tracking
    CREATE TEMP TABLE IF NOT EXISTS temp_activations (
        node_id UUID PRIMARY KEY,
        activation FLOAT,
        depth INTEGER
    ) ON COMMIT DROP;
    
    -- Clear previous activations
    DELETE FROM temp_activations;
    
    -- Seed the starting node
    INSERT INTO temp_activations VALUES (node_id_input, activation_strength, 0);
    
    -- Propagate activation through semantic links
    WHILE current_depth < propagation_depth LOOP
        INSERT INTO temp_activations (node_id, activation, depth)
        SELECT DISTINCT
            CASE 
                WHEN sl.source_node_id = ta.node_id THEN sl.target_node_id
                ELSE sl.source_node_id
            END as node_id,
            (ta.activation * sl.weight * decay_factor)::FLOAT as activation,
            current_depth + 1 as depth
        FROM temp_activations ta
        JOIN cde_semantic_links sl 
            ON (sl.source_node_id = ta.node_id OR sl.target_node_id = ta.node_id)
        WHERE ta.depth = current_depth
            AND NOT EXISTS (
                SELECT 1 FROM temp_activations x 
                WHERE x.node_id = CASE 
                    WHEN sl.source_node_id = ta.node_id THEN sl.target_node_id 
                    ELSE sl.source_node_id 
                END
            )
        ON CONFLICT (node_id) 
        DO UPDATE SET activation = GREATEST(temp_activations.activation, EXCLUDED.activation);
        
        current_depth := current_depth + 1;
    END LOOP;
    
    -- Update activation scores in main table
    UPDATE cde_nodes n
    SET 
        activation_score = ta.activation,
        last_activated_at = NOW()
    FROM temp_activations ta
    WHERE n.id = ta.node_id;
    
    -- Return activated nodes
    RETURN QUERY
    SELECT 
        n.id,
        n.name,
        n.node_type,
        ta.activation::FLOAT,
        ta.depth
    FROM temp_activations ta
    JOIN cde_nodes n ON n.id = ta.node_id
    ORDER BY ta.activation DESC, ta.depth ASC;
END;
$$;

-- ===========================================
-- PHASE 7: Hebbian learning optimizer
-- ===========================================

-- Reinforce edges that are frequently co-activated (Hebbian learning)
CREATE OR REPLACE FUNCTION reinforce_edge(
    source_id UUID,
    target_id UUID,
    reinforcement_strength FLOAT DEFAULT 0.1
)
RETURNS FLOAT
LANGUAGE plpgsql
AS $$
DECLARE
    new_weight FLOAT;
BEGIN
    -- Update semantic link weight using Hebbian rule
    UPDATE cde_semantic_links
    SET 
        weight = LEAST(1.0, weight + reinforcement_strength * (1 - weight)),
        activation_count = activation_count + 1,
        last_validated_at = NOW()
    WHERE (source_node_id = source_id AND target_node_id = target_id)
       OR (source_node_id = target_id AND target_node_id = source_id)
    RETURNING weight INTO new_weight;
    
    -- Also update cde_edges if exists
    UPDATE cde_edges
    SET 
        weight = LEAST(1.0, weight + reinforcement_strength * (1 - weight)),
        activation_count = activation_count + 1,
        last_reinforced_at = NOW(),
        is_learned = TRUE
    WHERE (source_node_id = source_id AND target_node_id = target_id)
       OR (source_node_id = target_id AND target_node_id = source_id);
    
    RETURN COALESCE(new_weight, 0);
END;
$$;

-- Decay unused connections (forgetting)
CREATE OR REPLACE FUNCTION decay_unused_weights(
    inactivity_days INTEGER DEFAULT 30,
    decay_amount FLOAT DEFAULT 0.05,
    min_weight FLOAT DEFAULT 0.1
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Decay semantic links not used recently
    WITH decayed AS (
        UPDATE cde_semantic_links
        SET weight = GREATEST(min_weight, weight - decay_amount)
        WHERE last_validated_at < NOW() - (inactivity_days || ' days')::INTERVAL
            AND weight > min_weight
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM decayed;
    
    -- Also decay cde_edges
    UPDATE cde_edges
    SET weight = GREATEST(min_weight, weight - decay_amount)
    WHERE last_reinforced_at < NOW() - (inactivity_days || ' days')::INTERVAL
        AND weight > min_weight;
    
    RETURN v_count;
END;
$$;

-- ===========================================
-- PHASE 8: Batch weight optimizer
-- ===========================================

CREATE OR REPLACE FUNCTION optimize_network_weights(
    learning_rate FLOAT DEFAULT 0.01,
    momentum FLOAT DEFAULT 0.9
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INTEGER := 0;
    v_avg_weight FLOAT;
    v_max_activation INTEGER;
BEGIN
    -- Normalize weights based on activation frequency
    SELECT MAX(activation_count) INTO v_max_activation 
    FROM cde_semantic_links 
    WHERE activation_count > 0;
    
    IF v_max_activation > 0 THEN
        UPDATE cde_semantic_links
        SET weight = LEAST(1.0, 
            weight * momentum + 
            (activation_count::FLOAT / v_max_activation) * learning_rate
        )
        WHERE activation_count > 0;
        
        GET DIAGNOSTICS v_updated = ROW_COUNT;
    END IF;
    
    SELECT AVG(weight) INTO v_avg_weight FROM cde_semantic_links;
    
    RETURN jsonb_build_object(
        'success', true,
        'updated_links', v_updated,
        'average_weight', ROUND(v_avg_weight::NUMERIC, 4),
        'learning_rate', learning_rate,
        'momentum', momentum
    );
END;
$$;

-- ===========================================
-- PHASE 9: Semantic clustering
-- ===========================================

CREATE OR REPLACE FUNCTION cluster_nodes_semantically(
    num_clusters INTEGER DEFAULT 10,
    iterations INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
AS $$
DECLARE
    v_clustered INTEGER := 0;
    v_iter INTEGER := 0;
BEGIN
    -- Simple k-means-like clustering based on activation patterns
    
    -- Initial random cluster assignment
    UPDATE cde_nodes
    SET semantic_cluster = (RANDOM() * num_clusters)::INTEGER
    WHERE embedding IS NOT NULL;
    
    -- Iterative refinement based on neighbors
    WHILE v_iter < iterations LOOP
        UPDATE cde_nodes n
        SET semantic_cluster = (
            SELECT COALESCE(
                MODE() WITHIN GROUP (ORDER BY n2.semantic_cluster),
                n.semantic_cluster
            )
            FROM cde_semantic_links sl
            JOIN cde_nodes n2 ON (
                n2.id = CASE 
                    WHEN sl.source_node_id = n.id THEN sl.target_node_id
                    ELSE sl.source_node_id
                END
            )
            WHERE (sl.source_node_id = n.id OR sl.target_node_id = n.id)
                AND sl.weight > 0.5
        )
        WHERE embedding IS NOT NULL;
        
        v_iter := v_iter + 1;
    END LOOP;
    
    SELECT COUNT(*) INTO v_clustered 
    FROM cde_nodes 
    WHERE semantic_cluster IS NOT NULL;
    
    RETURN jsonb_build_object(
        'success', true,
        'clustered_nodes', v_clustered,
        'num_clusters', num_clusters,
        'iterations', iterations
    );
END;
$$;

-- ===========================================
-- PHASE 10: Full neural network initialization
-- ===========================================

CREATE OR REPLACE FUNCTION initialize_neural_knowledge_graph(
    similarity_threshold FLOAT DEFAULT 0.7,
    max_links INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '900s'
AS $$
DECLARE
    v_result JSONB;
    v_nodes_with_embeddings INTEGER;
    v_links_created JSONB;
    v_clusters JSONB;
BEGIN
    -- Count nodes with embeddings
    SELECT COUNT(*) INTO v_nodes_with_embeddings 
    FROM cde_nodes 
    WHERE embedding IS NOT NULL;
    
    -- Create semantic links
    SELECT create_semantic_links(similarity_threshold, max_links, 5000) INTO v_links_created;
    
    -- Cluster nodes
    SELECT cluster_nodes_semantically(10, 3) INTO v_clusters;
    
    -- Initialize weights
    UPDATE cde_edges 
    SET weight = 0.5 
    WHERE weight IS NULL;
    
    UPDATE cde_semantic_links 
    SET weight = similarity_score 
    WHERE weight < similarity_score;
    
    RETURN jsonb_build_object(
        'success', true,
        'nodes_with_embeddings', v_nodes_with_embeddings,
        'semantic_links', v_links_created,
        'clusters', v_clusters,
        'initialized_at', NOW()
    );
END;
$$;

-- ===========================================
-- PERMISSIONS
-- ===========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON cde_semantic_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cde_semantic_links TO service_role;

GRANT EXECUTE ON FUNCTION find_similar_nodes(UUID, FLOAT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION semantic_search_nodes(vector, FLOAT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_semantic_links(FLOAT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION activate_node(UUID, FLOAT, INTEGER, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION reinforce_edge(UUID, UUID, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION decay_unused_weights(INTEGER, FLOAT, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION optimize_network_weights(FLOAT, FLOAT) TO authenticated;
GRANT EXECUTE ON FUNCTION cluster_nodes_semantically(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_neural_knowledge_graph(FLOAT, INTEGER) TO authenticated;

GRANT EXECUTE ON FUNCTION find_similar_nodes(UUID, FLOAT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION semantic_search_nodes(vector, FLOAT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION create_semantic_links(FLOAT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION activate_node(UUID, FLOAT, INTEGER, FLOAT) TO service_role;
GRANT EXECUTE ON FUNCTION reinforce_edge(UUID, UUID, FLOAT) TO service_role;
GRANT EXECUTE ON FUNCTION decay_unused_weights(INTEGER, FLOAT, FLOAT) TO service_role;
GRANT EXECUTE ON FUNCTION optimize_network_weights(FLOAT, FLOAT) TO service_role;
GRANT EXECUTE ON FUNCTION cluster_nodes_semantically(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION initialize_neural_knowledge_graph(FLOAT, INTEGER) TO service_role;
