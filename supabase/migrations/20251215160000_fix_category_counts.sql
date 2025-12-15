-- ============================================
-- Fix: Category node count + classify nodes function
-- ============================================

-- Drop and recreate the function with better counting logic
DROP FUNCTION IF EXISTS get_category_tree(TEXT);

CREATE OR REPLACE FUNCTION get_category_tree(p_node_type TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_fr TEXT,
  parent_id UUID,
  node_type TEXT,
  icon TEXT,
  color TEXT,
  node_count BIGINT,
  depth INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE category_tree AS (
    -- Base case: root categories
    SELECT 
      c.id, c.name, c.name_fr, c.parent_id, c.node_type, c.icon, c.color, c.sort_order,
      0 as depth
    FROM cde_node_categories c
    WHERE c.parent_id IS NULL
      AND (p_node_type IS NULL OR c.node_type = p_node_type)
    
    UNION ALL
    
    -- Recursive case: child categories
    SELECT 
      c.id, c.name, c.name_fr, c.parent_id, c.node_type, c.icon, c.color, c.sort_order,
      ct.depth + 1
    FROM cde_node_categories c
    JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT 
    ct.id, ct.name, ct.name_fr, ct.parent_id, ct.node_type, ct.icon, ct.color,
    -- Count nodes: either by category_id OR by node_type if category_id is null
    COALESCE(
      (SELECT COUNT(*) FROM cde_nodes n WHERE n.category_id = ct.id),
      0
    ) + 
    -- Also count unclassified nodes of this type for the first category of each type
    CASE 
      WHEN ct.sort_order = 1 THEN 
        COALESCE(
          (SELECT COUNT(*) FROM cde_nodes n 
           WHERE n.node_type = ct.node_type 
           AND n.category_id IS NULL),
          0
        )
      ELSE 0
    END as node_count,
    ct.depth
  FROM category_tree ct
  ORDER BY ct.sort_order, ct.name;
END;
$$;

-- Also create a simpler function to get total counts by node_type
CREATE OR REPLACE FUNCTION get_node_type_counts()
RETURNS TABLE (
  node_type TEXT,
  total_count BIGINT,
  classified_count BIGINT,
  unclassified_count BIGINT
)
LANGUAGE SQL
AS $$
  SELECT 
    n.node_type,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE n.category_id IS NOT NULL) as classified_count,
    COUNT(*) FILTER (WHERE n.category_id IS NULL) as unclassified_count
  FROM cde_nodes n
  GROUP BY n.node_type
  ORDER BY n.node_type;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_category_tree(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_node_type_counts() TO authenticated;

-- Also run the classification now
SELECT classify_cde_nodes();
