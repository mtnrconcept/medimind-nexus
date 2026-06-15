-- ============================================
-- SEMANTIC INDEX FOR KNOWLEDGE GRAPH
-- Enable pgvector and add embeddings to nodes
-- ============================================

-- Enable pgvector extension (requires Supabase Pro or manual enable)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to cde_nodes
ALTER TABLE cde_nodes 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS cde_nodes_embedding_idx 
ON cde_nodes 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add semantic_category for grouping
ALTER TABLE cde_nodes
ADD COLUMN IF NOT EXISTS semantic_category text;

-- ============================================
-- FUNCTION: Get semantically similar nodes
-- Returns nodes ordered by cosine similarity
-- ============================================

CREATE OR REPLACE FUNCTION get_similar_nodes(
    target_node_id uuid,
    max_results integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    name text,
    node_type text,
    properties jsonb,
    similarity float
) 
LANGUAGE plpgsql
AS $$
DECLARE
    target_embedding vector(1536);
BEGIN
    -- Get the embedding of the target node
    SELECT n.embedding INTO target_embedding
    FROM cde_nodes n
    WHERE n.id = target_node_id;
    
    -- If no embedding found, return empty
    IF target_embedding IS NULL THEN
        RETURN;
    END IF;
    
    -- Return similar nodes ordered by cosine similarity
    RETURN QUERY
    SELECT 
        n.id,
        n.name,
        n.node_type,
        n.properties,
        1 - (n.embedding <=> target_embedding) as similarity
    FROM cde_nodes n
    WHERE n.id != target_node_id
      AND n.embedding IS NOT NULL
    ORDER BY n.embedding <=> target_embedding
    LIMIT max_results;
END;
$$;

-- ============================================
-- FUNCTION: Build semantic graph around central node
-- Returns nodes with ring assignments and edges
-- ============================================

CREATE OR REPLACE FUNCTION get_semantic_graph(
    central_node_id uuid,
    max_nodes integer DEFAULT 100,
    similarity_threshold float DEFAULT 0.3
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    result jsonb;
    central_node record;
    nodes_array jsonb := '[]'::jsonb;
    edges_array jsonb := '[]'::jsonb;
    node_record record;
    edge_record record;
    ring_number integer;
BEGIN
    -- Get central node
    SELECT id, name, node_type, properties, semantic_category
    INTO central_node
    FROM cde_nodes
    WHERE id = central_node_id;
    
    IF central_node IS NULL THEN
        RETURN jsonb_build_object('error', 'Central node not found');
    END IF;
    
    -- Add central node (ring 0)
    nodes_array := nodes_array || jsonb_build_object(
        'id', central_node.id,
        'name', central_node.name,
        'node_type', central_node.node_type,
        'ring', 0,
        'lane', COALESCE(central_node.semantic_category, 'pathology'),
        'proximity_score', 1.0,
        'properties', central_node.properties
    );
    
    -- Get similar nodes and assign rings based on similarity
    FOR node_record IN (
        SELECT * FROM get_similar_nodes(central_node_id, max_nodes - 1)
        WHERE similarity >= similarity_threshold
    ) LOOP
        -- Assign ring based on similarity (higher similarity = closer ring)
        IF node_record.similarity >= 0.8 THEN
            ring_number := 1;
        ELSIF node_record.similarity >= 0.6 THEN
            ring_number := 2;
        ELSIF node_record.similarity >= 0.45 THEN
            ring_number := 3;
        ELSE
            ring_number := 4;
        END IF;
        
        -- Add node
        nodes_array := nodes_array || jsonb_build_object(
            'id', node_record.id,
            'name', node_record.name,
            'node_type', node_record.node_type,
            'ring', ring_number,
            'lane', COALESCE(
                node_record.properties->>'category',
                node_record.node_type,
                'other'
            ),
            'proximity_score', node_record.similarity,
            'properties', node_record.properties
        );
        
        -- Add edge from central node to this node
        edges_array := edges_array || jsonb_build_object(
            'source', central_node.id,
            'target', node_record.id,
            'relationship', CASE
                WHEN node_record.similarity >= 0.8 THEN 'strong_association'
                WHEN node_record.similarity >= 0.6 THEN 'moderate_association'
                WHEN node_record.similarity >= 0.45 THEN 'weak_association'
                ELSE 'potential_link'
            END,
            'evidence_grade', CASE
                WHEN node_record.similarity >= 0.7 THEN 'high'
                WHEN node_record.similarity >= 0.5 THEN 'moderate'
                ELSE 'low'
            END,
            'weight', node_record.similarity,
            'translation_gap', node_record.similarity < 0.5
        );
    END LOOP;
    
    -- Also add edges between similar nodes in the graph
    FOR edge_record IN (
        WITH graph_nodes AS (
            SELECT (n->>'id')::uuid as node_id
            FROM jsonb_array_elements(nodes_array) n
            WHERE (n->>'id')::uuid != central_node_id
        )
        SELECT 
            a.node_id as source_id,
            b.node_id as target_id,
            1 - (na.embedding <=> nb.embedding) as sim
        FROM graph_nodes a
        CROSS JOIN graph_nodes b
        JOIN cde_nodes na ON na.id = a.node_id
        JOIN cde_nodes nb ON nb.id = b.node_id
        WHERE a.node_id < b.node_id
          AND na.embedding IS NOT NULL
          AND nb.embedding IS NOT NULL
          AND 1 - (na.embedding <=> nb.embedding) >= 0.6
        ORDER BY sim DESC
        LIMIT 200
    ) LOOP
        edges_array := edges_array || jsonb_build_object(
            'source', edge_record.source_id,
            'target', edge_record.target_id,
            'relationship', 'semantic_link',
            'evidence_grade', CASE
                WHEN edge_record.sim >= 0.7 THEN 'high'
                ELSE 'moderate'
            END,
            'weight', edge_record.sim,
            'translation_gap', false
        );
    END LOOP;
    
    -- Build result
    result := jsonb_build_object(
        'central_node', central_node.id,
        'nodes', nodes_array,
        'edges', edges_array,
        'total_nodes', jsonb_array_length(nodes_array),
        'total_edges', jsonb_array_length(edges_array)
    );
    
    RETURN result;
END;
$$;

-- ============================================
-- FUNCTION: Get all nodes without embeddings
-- For batch processing
-- ============================================

CREATE OR REPLACE FUNCTION get_nodes_without_embeddings(
    batch_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    name text,
    node_type text,
    properties jsonb
)
LANGUAGE sql
AS $$
    SELECT id, name, node_type, properties
    FROM cde_nodes
    WHERE embedding IS NULL
    LIMIT batch_limit;
$$;

-- ============================================
-- FUNCTION: Update node embedding
-- ============================================

CREATE OR REPLACE FUNCTION update_node_embedding(
    node_id uuid,
    new_embedding vector(1536)
)
RETURNS void
LANGUAGE sql
AS $$
    UPDATE cde_nodes
    SET embedding = new_embedding
    WHERE id = node_id;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION get_similar_nodes TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_semantic_graph TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_nodes_without_embeddings TO service_role;
GRANT EXECUTE ON FUNCTION update_node_embedding TO service_role;
