-- ============================================
-- NODE LINKS CACHE TABLE
-- Stores calculated relationships between nodes for fast lookup
-- ============================================

-- Create table for caching node relationships
CREATE TABLE IF NOT EXISTS cde_node_links (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source_name text NOT NULL,
    target_name text NOT NULL,
    relationship text DEFAULT 'associated_with',
    weight float DEFAULT 0.5,
    evidence_grade text DEFAULT 'D',
    link_type text DEFAULT 'semantic', -- semantic, drug_interaction, symptom, treatment, etc.
    properties jsonb DEFAULT '{}'::jsonb,
    calculated_at timestamp with time zone DEFAULT now(),
    UNIQUE(source_name, target_name)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_node_links_source ON cde_node_links(source_name);
CREATE INDEX IF NOT EXISTS idx_node_links_target ON cde_node_links(target_name);
CREATE INDEX IF NOT EXISTS idx_node_links_type ON cde_node_links(link_type);

-- Function to get all links for a node (both as source and target)
CREATE OR REPLACE FUNCTION get_node_links(node_name text)
RETURNS TABLE (
    id uuid,
    source_name text,
    target_name text,
    relationship text,
    weight float,
    evidence_grade text,
    link_type text,
    properties jsonb
)
LANGUAGE sql
AS $$
    SELECT id, source_name, target_name, relationship, weight, evidence_grade, link_type, properties
    FROM cde_node_links
    WHERE source_name = node_name OR target_name = node_name;
$$;

-- Function to upsert a link (insert or update if exists)
CREATE OR REPLACE FUNCTION upsert_node_link(
    p_source text,
    p_target text,
    p_relationship text DEFAULT 'associated_with',
    p_weight float DEFAULT 0.5,
    p_evidence_grade text DEFAULT 'D',
    p_link_type text DEFAULT 'semantic',
    p_properties jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    result_id uuid;
BEGIN
    INSERT INTO cde_node_links (source_name, target_name, relationship, weight, evidence_grade, link_type, properties)
    VALUES (p_source, p_target, p_relationship, p_weight, p_evidence_grade, p_link_type, p_properties)
    ON CONFLICT (source_name, target_name) 
    DO UPDATE SET 
        relationship = EXCLUDED.relationship,
        weight = EXCLUDED.weight,
        evidence_grade = EXCLUDED.evidence_grade,
        link_type = EXCLUDED.link_type,
        properties = EXCLUDED.properties,
        calculated_at = now()
    RETURNING id INTO result_id;
    
    RETURN result_id;
END;
$$;

-- Function to get links between multiple nodes
CREATE OR REPLACE FUNCTION get_links_between_nodes(node_names text[])
RETURNS TABLE (
    id uuid,
    source_name text,
    target_name text,
    relationship text,
    weight float,
    evidence_grade text,
    link_type text
)
LANGUAGE sql
AS $$
    SELECT id, source_name, target_name, relationship, weight, evidence_grade, link_type
    FROM cde_node_links
    WHERE source_name = ANY(node_names) AND target_name = ANY(node_names);
$$;

-- Grant permissions
GRANT ALL ON TABLE cde_node_links TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_node_links TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION upsert_node_link TO service_role;
GRANT EXECUTE ON FUNCTION get_links_between_nodes TO authenticated, anon, service_role;
