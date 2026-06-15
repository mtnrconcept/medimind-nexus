-- Create saved_graphs table
CREATE TABLE IF NOT EXISTS saved_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  
  -- The core graph data (nodes and edges structure at the time of save)
  graph_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- The view state (layout configuration, hidden nodes, positions, etc.)
  view_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_graphs_user_id ON saved_graphs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_graphs_created_at ON saved_graphs(created_at DESC);

-- RLS
ALTER TABLE saved_graphs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own saved graphs"
  ON saved_graphs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own saved graphs"
  ON saved_graphs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved graphs"
  ON saved_graphs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved graphs"
  ON saved_graphs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_saved_graphs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_saved_graphs_updated_at
  BEFORE UPDATE ON saved_graphs
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_graphs_updated_at();
