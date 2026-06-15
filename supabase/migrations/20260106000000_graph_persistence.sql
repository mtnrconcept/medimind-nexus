-- Migration: Structured Graph Persistence Tables
-- Part of MedGraph Integration Phase 2

-- =============================================
-- TABLE: graph_nodes
-- Stores all nodes from causal graphs with full attributes
-- =============================================
CREATE TABLE IF NOT EXISTS graph_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE CASCADE,
    
    -- Node identity
    node_key VARCHAR(64) NOT NULL,  -- Original ID from AI (e.g., "t1", "p1")
    node_type VARCHAR(32) NOT NULL CHECK (node_type IN (
        'pathology', 'treatment', 'symptom', 'side_effect', 
        'complication', 'molecule', 'research', 'resolution'
    )),
    label TEXT NOT NULL,
    mechanism TEXT,
    
    -- MedGraph-style attributes for context gating
    attributes JSONB DEFAULT '{}'::jsonb,
    -- Expected structure for treatment nodes:
    -- {
    --   "contraindications": {
    --     "pregnancy": boolean,
    --     "age_lt": number,
    --     "egfr_lt": number,
    --     "hepatic_impairment": boolean,
    --     "allergy_terms": ["term1", "term2"]
    --   },
    --   "interactions": [
    --     { "with": "drug_name", "severity": "major|moderate|minor", "note": "description" }
    --   ]
    -- }
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique node_key per hypothesis
    UNIQUE(hypothesis_id, node_key)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_graph_nodes_hypothesis ON graph_nodes(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_attributes ON graph_nodes USING GIN (attributes);

-- =============================================
-- TABLE: graph_edges
-- Stores all edges (links) between nodes with weight and evidence
-- =============================================
CREATE TABLE IF NOT EXISTS graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE CASCADE,
    
    -- Edge endpoints (reference node_key, not node id)
    source_key VARCHAR(64) NOT NULL,
    target_key VARCHAR(64) NOT NULL,
    
    -- Edge metadata
    edge_type VARCHAR(32) NOT NULL CHECK (edge_type IN (
        'TRAITE', 'PROVOQUE', 'RÉSOUT', 'MANIFESTE', 'PRÉVIENT', 
        'AGGRAVE', 'CORRIGE', 'CONTRE_INDIQUÉ_SI', 'INTERAGIT_AVEC'
    )),
    label VARCHAR(64),
    reason TEXT,
    
    -- Weight for path analysis (0.0 to 1.0)
    weight FLOAT DEFAULT 0.5 CHECK (weight >= 0.0 AND weight <= 1.0),
    
    -- Evidence reference (optional link to scientific sources)
    evidence_pmid VARCHAR(20),
    evidence_title TEXT,
    evidence_level VARCHAR(16) CHECK (evidence_level IN (
        'meta_analysis', 'rct', 'cohort', 'case_control', 'case_series', 'expert_opinion', NULL
    )),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique edge per hypothesis
    UNIQUE(hypothesis_id, source_key, target_key, edge_type)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_graph_edges_hypothesis ON graph_edges(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_key);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_key);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(edge_type);

-- =============================================
-- TABLE: graph_audit_log
-- Audit trail for all graph modifications (MedGraph-style)
-- =============================================
CREATE TABLE IF NOT EXISTS graph_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who did what
    actor VARCHAR(128) DEFAULT 'system' NOT NULL,
    action VARCHAR(16) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    
    -- What was affected
    entity_type VARCHAR(16) NOT NULL CHECK (entity_type IN ('node', 'edge')),
    entity_id UUID NOT NULL,
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    
    -- Before/after state for auditing
    before_state JSONB DEFAULT '{}'::jsonb,
    after_state JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying audit history
CREATE INDEX IF NOT EXISTS idx_audit_entity ON graph_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_hypothesis ON graph_audit_log(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON graph_audit_log(created_at DESC);

-- =============================================
-- RLS Policies (Row Level Security)
-- =============================================
ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all graph data
CREATE POLICY "Users can view graph nodes" ON graph_nodes
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view graph edges" ON graph_edges
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view audit logs" ON graph_audit_log
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role to manage all data
CREATE POLICY "Service role manages graph nodes" ON graph_nodes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages graph edges" ON graph_edges
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages audit logs" ON graph_audit_log
    FOR ALL USING (auth.role() = 'service_role');
