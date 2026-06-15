-- Create a function to fetch edges for a list of node IDs
-- This avoids URL length limits when fetching edges for many nodes via GET requests
CREATE OR REPLACE FUNCTION get_cde_edges_for_nodes(node_ids uuid[])
RETURNS SETOF cde_edges
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM cde_edges
  WHERE source_node_id = ANY(node_ids)
     OR target_node_id = ANY(node_ids);
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_cde_edges_for_nodes(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cde_edges_for_nodes(uuid[]) TO service_role;
