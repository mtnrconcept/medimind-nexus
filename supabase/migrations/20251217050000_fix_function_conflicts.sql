-- Fix function overloading conflicts and missing column references

-- ============================================
-- SECTION 1: Drop conflicting get_category_tree overloads
-- ============================================

-- Drop both overloaded functions
DROP FUNCTION IF EXISTS public.get_category_tree();
DROP FUNCTION IF EXISTS public.get_category_tree(p_node_type TEXT);

-- Create a single unified function
CREATE OR REPLACE FUNCTION public.get_category_tree(p_node_type TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    name_fr TEXT,
    icon TEXT,
    color TEXT,
    node_type TEXT,
    node_count BIGINT,
    parent_id UUID,
    depth INTEGER,
    sort_order INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE category_tree AS (
        -- Base case: root categories
        SELECT 
            c.id,
            c.name,
            c.name_fr,
            c.icon,
            c.color,
            c.node_type,
            c.parent_id,
            c.sort_order,
            0 AS depth
        FROM cde_node_categories c
        WHERE c.parent_id IS NULL
          AND (p_node_type IS NULL OR c.node_type = p_node_type)
        
        UNION ALL
        
        -- Recursive case: subcategories
        SELECT 
            c.id,
            c.name,
            c.name_fr,
            c.icon,
            c.color,
            c.node_type,
            c.parent_id,
            c.sort_order,
            ct.depth + 1 AS depth
        FROM cde_node_categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT 
        ct.id,
        ct.name,
        ct.name_fr,
        ct.icon,
        ct.color,
        ct.node_type,
        COALESCE((SELECT COUNT(*) FROM cde_nodes n WHERE n.category_id = ct.id), 0) AS node_count,
        ct.parent_id,
        ct.depth,
        ct.sort_order
    FROM category_tree ct
    ORDER BY ct.depth, ct.sort_order, ct.name;
END;
$$;

-- ============================================
-- SECTION 2: Fix seed_cde_knowledge_graph function
-- Remove reference to s.atc_code which doesn't exist
-- ============================================

-- Drop and recreate the seed function without atc_code reference
DROP FUNCTION IF EXISTS public.seed_cde_knowledge_graph();

CREATE OR REPLACE FUNCTION public.seed_cde_knowledge_graph()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_nodes_created INTEGER := 0;
    v_edges_created INTEGER := 0;
    v_result JSONB;
BEGIN
    -- Create nodes from pathologies (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pathologies') THEN
        INSERT INTO cde_nodes (code, name, description, node_type, category_id, source)
        SELECT 
            COALESCE(p.icd10_code, 'PATH_' || p.id::TEXT),
            p.name,
            p.description,
            'pathology',
            (SELECT id FROM cde_node_categories WHERE node_type = 'pathology' AND parent_id IS NULL LIMIT 1),
            'pathologies'
        FROM pathologies p
        WHERE NOT EXISTS (
            SELECT 1 FROM cde_nodes n 
            WHERE n.code = COALESCE(p.icd10_code, 'PATH_' || p.id::TEXT)
        )
        ON CONFLICT (code) DO NOTHING;
        
        GET DIAGNOSTICS v_nodes_created = ROW_COUNT;
    END IF;
    
    -- Create nodes from medications (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medications') THEN
        INSERT INTO cde_nodes (code, name, description, node_type, category_id, source)
        SELECT 
            COALESCE(m.code, 'MED_' || m.id::TEXT),
            m.name,
            m.description,
            'medication',
            (SELECT id FROM cde_node_categories WHERE node_type = 'medication' AND parent_id IS NULL LIMIT 1),
            'medications'
        FROM medications m
        WHERE NOT EXISTS (
            SELECT 1 FROM cde_nodes n 
            WHERE n.code = COALESCE(m.code, 'MED_' || m.id::TEXT)
        )
        ON CONFLICT (code) DO NOTHING;
        
        v_nodes_created := v_nodes_created + ROW_COUNT;
    END IF;
    
    -- Create nodes from symptoms (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'symptoms') THEN
        INSERT INTO cde_nodes (code, name, description, node_type, category_id, source)
        SELECT 
            COALESCE(s.code, 'SYM_' || s.id::TEXT),
            s.name,
            s.description,
            'symptom',
            (SELECT id FROM cde_node_categories WHERE node_type = 'symptom' AND parent_id IS NULL LIMIT 1),
            'symptoms'
        FROM symptoms s
        WHERE NOT EXISTS (
            SELECT 1 FROM cde_nodes n 
            WHERE n.code = COALESCE(s.code, 'SYM_' || s.id::TEXT)
        )
        ON CONFLICT (code) DO NOTHING;
        
        v_nodes_created := v_nodes_created + ROW_COUNT;
    END IF;
    
    -- Create nodes from treatments (if table exists)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'treatments') THEN
        INSERT INTO cde_nodes (code, name, description, node_type, category_id, source)
        SELECT 
            COALESCE(t.code, 'TRT_' || t.id::TEXT),
            t.name,
            t.description,
            'treatment',
            (SELECT id FROM cde_node_categories WHERE node_type = 'treatment' AND parent_id IS NULL LIMIT 1),
            'treatments'
        FROM treatments t
        WHERE NOT EXISTS (
            SELECT 1 FROM cde_nodes n 
            WHERE n.code = COALESCE(t.code, 'TRT_' || t.id::TEXT)
        )
        ON CONFLICT (code) DO NOTHING;
        
        v_nodes_created := v_nodes_created + ROW_COUNT;
    END IF;
    
    -- Update category counts
    UPDATE cde_node_categories cat
    SET node_count = (
        SELECT COUNT(*) FROM cde_nodes n WHERE n.category_id = cat.id
    );
    
    v_result := jsonb_build_object(
        'success', true,
        'nodes_created', v_nodes_created,
        'edges_created', v_edges_created
    );
    
    RETURN v_result;
END;
$$;
