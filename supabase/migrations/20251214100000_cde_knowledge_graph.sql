-- Continuous Discovery Engine (CDE) - Database Schema
-- Migration for Knowledge Graph and Discovery Cards
-- NOTE: Using TEXT instead of ENUMs for flexibility

-- ============================================
-- TABLES (using TEXT for type columns)
-- ============================================

-- Knowledge Graph Nodes
CREATE TABLE IF NOT EXISTS cde_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type TEXT NOT NULL, -- 'medication', 'pathology', 'enzyme', 'receptor', 'allergen', 'food', 'vaccine', 'symptom', 'organ'
  external_id UUID, -- FK to source table (medications.id, pathologies.id, etc.)
  name TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge Graph Edges
CREATE TABLE IF NOT EXISTS cde_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES cde_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES cde_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- 'inhibits', 'induces', 'contraindicated', 'increases_risk', 'decreases_risk', 'cross_reacts', 'contains', 'treats', 'causes', 'metabolized_by', 'substrate_of'
  provenance TEXT NOT NULL DEFAULT 'manual', -- Source: 'drug_interactions', 'contraindications', 'ai_inferred', 'manual'
  evidence_level TEXT, -- 'in_vitro', 'case_report', 'observational', 'rct', 'meta_analysis', 'guideline'
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_node_id, target_node_id, relationship_type)
);

-- Discovery Cards (Hypotheses)
CREATE TABLE IF NOT EXISTS discovery_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL, -- "Si X + Y alors Z"
  reasoning_chain JSONB DEFAULT '[]'::jsonb, -- Array of reasoning steps
  involved_nodes UUID[] DEFAULT '{}', -- Array of cde_nodes ids
  novelty TEXT CHECK (novelty IN ('unknown', 'emerging', 'controversial', 'known')),
  evidence_level TEXT, -- 'in_vitro', 'case_report', 'observational', 'rct', 'meta_analysis', 'guideline'
  severity_score FLOAT CHECK (severity_score >= 0 AND severity_score <= 1),
  plausibility_score FLOAT CHECK (plausibility_score >= 0 AND plausibility_score <= 1),
  frequency_score FLOAT CHECK (frequency_score >= 0 AND frequency_score <= 1),
  status TEXT DEFAULT 'raw_signal' CHECK (status IN ('raw_signal', 'plausible', 'corroborated', 'confirmed', 'refuted')),
  sources JSONB DEFAULT '[]'::jsonb, -- References to articles, guidelines, etc.
  recommended_actions TEXT[], -- Array of suggested actions
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  notes TEXT
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_cde_nodes_type ON cde_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_cde_nodes_external_id ON cde_nodes(external_id);
CREATE INDEX IF NOT EXISTS idx_cde_nodes_name ON cde_nodes USING gin(to_tsvector('french', name));

CREATE INDEX IF NOT EXISTS idx_cde_edges_source ON cde_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_cde_edges_target ON cde_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_cde_edges_type ON cde_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_cde_edges_provenance ON cde_edges(provenance);

CREATE INDEX IF NOT EXISTS idx_discovery_cards_status ON discovery_cards(status);
CREATE INDEX IF NOT EXISTS idx_discovery_cards_severity ON discovery_cards(severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_cards_created ON discovery_cards(created_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE cde_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cde_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_cards ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all CDE data
CREATE POLICY "Authenticated users can read cde_nodes" ON cde_nodes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read cde_edges" ON cde_edges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read discovery_cards" ON discovery_cards
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to update discovery cards (for review workflow)
CREATE POLICY "Authenticated users can update discovery_cards" ON discovery_cards
  FOR UPDATE TO authenticated USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access to cde_nodes" ON cde_nodes
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to cde_edges" ON cde_edges
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to discovery_cards" ON discovery_cards
  FOR ALL TO service_role USING (true);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at on modifications
CREATE OR REPLACE FUNCTION update_cde_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cde_nodes_updated_at ON cde_nodes;
CREATE TRIGGER cde_nodes_updated_at
  BEFORE UPDATE ON cde_nodes
  FOR EACH ROW EXECUTE FUNCTION update_cde_updated_at();

DROP TRIGGER IF EXISTS cde_edges_updated_at ON cde_edges;
CREATE TRIGGER cde_edges_updated_at
  BEFORE UPDATE ON cde_edges
  FOR EACH ROW EXECUTE FUNCTION update_cde_updated_at();
