-- Focused Research Sessions table
-- Tracks targeted research sessions for pathologies/medications

CREATE TABLE IF NOT EXISTS focused_research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  
  -- Target of the research
  target_type TEXT NOT NULL CHECK (target_type IN ('pathology', 'medication', 'substance')),
  target_id UUID,
  target_name TEXT NOT NULL,
  
  -- Results
  journey_steps JSONB DEFAULT '[]'::jsonb,
  discoveries JSONB DEFAULT '[]'::jsonb,
  simple_explanation TEXT,
  full_analysis_text TEXT,
  custom_prompt TEXT,
  
  -- Metrics
  kg_nodes_analyzed INTEGER DEFAULT 0,
  kg_edges_analyzed INTEGER DEFAULT 0,
  pubmed_articles_found INTEGER DEFAULT 0,
  hypotheses_generated INTEGER DEFAULT 0,
  
  -- Metadata
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Full text search
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(target_name, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(simple_explanation, '')), 'B')
  ) STORED
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_focused_research_user ON focused_research_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_focused_research_target ON focused_research_sessions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_focused_research_status ON focused_research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_focused_research_created ON focused_research_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_focused_research_search ON focused_research_sessions USING GIN(search_vector);

-- RLS
ALTER TABLE focused_research_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own research sessions" ON focused_research_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create research sessions" ON focused_research_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own research sessions" ON focused_research_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Service role full access to focused_research_sessions" ON focused_research_sessions
  FOR ALL TO service_role USING (true);
