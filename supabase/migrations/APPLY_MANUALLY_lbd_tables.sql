-- APPLY MANUALLY VIA SUPABASE DASHBOARD (SQL Editor)
-- This combines graph_persistence + lbd_knowledge_layer migrations

-- =============================================
-- PHASE 2: GRAPH PERSISTENCE TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS graph_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE CASCADE,
    node_key VARCHAR(64) NOT NULL,
    node_type VARCHAR(32) NOT NULL,
    label TEXT NOT NULL,
    mechanism TEXT,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_hypothesis ON graph_nodes(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(node_type);

CREATE TABLE IF NOT EXISTS graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE CASCADE,
    source_key VARCHAR(64) NOT NULL,
    target_key VARCHAR(64) NOT NULL,
    edge_type VARCHAR(32) NOT NULL,
    label VARCHAR(64),
    reason TEXT,
    weight FLOAT DEFAULT 0.5,
    evidence_pmid VARCHAR(20),
    evidence_title TEXT,
    evidence_level VARCHAR(16),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_graph_edges_hypothesis ON graph_edges(hypothesis_id);

CREATE TABLE IF NOT EXISTS graph_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor VARCHAR(128) DEFAULT 'system' NOT NULL,
    action VARCHAR(16) NOT NULL,
    entity_type VARCHAR(16) NOT NULL,
    entity_id UUID NOT NULL,
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    before_state JSONB DEFAULT '{}'::jsonb,
    after_state JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 3: LBD KNOWLEDGE LAYER TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS frontier_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID,
    node_label TEXT,
    node_type VARCHAR(32),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    facet VARCHAR(32),
    priority FLOAT DEFAULT 0.5,
    depth INT DEFAULT 0,
    max_depth INT DEFAULT 5,
    budget_remaining INT DEFAULT 100,
    status VARCHAR(16) DEFAULT 'pending',
    claims_generated INT DEFAULT 0,
    hypotheses_generated INT DEFAULT 0,
    execution_time_ms INT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_frontier_status_priority ON frontier_jobs(status, priority DESC);

CREATE TABLE IF NOT EXISTS lbd_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pmid VARCHAR(20) UNIQUE,
    pmcid VARCHAR(20),
    doi VARCHAR(100),
    nct_id VARCHAR(20),
    title TEXT NOT NULL,
    abstract TEXT,
    authors TEXT[],
    journal VARCHAR(255),
    publication_date DATE,
    publication_year INT,
    source VARCHAR(32),
    full_text_url TEXT,
    study_type VARCHAR(32),
    mesh_terms TEXT[],
    keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lbd_docs_pmid ON lbd_documents(pmid);

CREATE TABLE IF NOT EXISTS lbd_passages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES lbd_documents(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    section VARCHAR(64),
    entities JSONB DEFAULT '[]'::jsonb,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lbd_passages_doc ON lbd_passages(document_id);

CREATE TABLE IF NOT EXISTS lbd_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_node_id UUID,
    subject_text TEXT NOT NULL,
    subject_type VARCHAR(32),
    subject_norm_ids JSONB DEFAULT '[]'::jsonb,
    predicate VARCHAR(64) NOT NULL,
    object_node_id UUID,
    object_text TEXT NOT NULL,
    object_type VARCHAR(32),
    object_norm_ids JSONB DEFAULT '[]'::jsonb,
    evidence_quality FLOAT DEFAULT 0.5,
    replication_count INT DEFAULT 1,
    effect_direction VARCHAR(16),
    population_match FLOAT DEFAULT 0.5,
    recency_score FLOAT DEFAULT 0.5,
    mechanistic_plausibility FLOAT DEFAULT 0.5,
    aggregate_score FLOAT DEFAULT 0.5,
    is_hypothesis BOOLEAN DEFAULT FALSE,
    inference_rule VARCHAR(32),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(128),
    status VARCHAR(16) DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_lbd_claims_predicate ON lbd_claims(predicate);
CREATE INDEX IF NOT EXISTS idx_lbd_claims_score ON lbd_claims(aggregate_score DESC);

CREATE TABLE IF NOT EXISTS lbd_claim_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES lbd_claims(id) ON DELETE CASCADE,
    passage_id UUID REFERENCES lbd_passages(id) ON DELETE CASCADE,
    confidence FLOAT DEFAULT 0.5,
    extraction_method VARCHAR(32),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lbd_contradictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_support_id UUID REFERENCES lbd_claims(id) ON DELETE CASCADE,
    claim_refute_id UUID REFERENCES lbd_claims(id) ON DELETE CASCADE,
    resolution VARCHAR(32),
    explanation TEXT,
    support_weight FLOAT DEFAULT 0.5,
    refute_weight FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lbd_reasoning_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    job_id UUID,
    inputs JSONB DEFAULT '{}'::jsonb,
    retrieval_queries JSONB DEFAULT '[]'::jsonb,
    evidence_map JSONB DEFAULT '[]'::jsonb,
    normalization_log JSONB DEFAULT '[]'::jsonb,
    inference_steps JSONB DEFAULT '[]'::jsonb,
    contradictions_found JSONB DEFAULT '[]'::jsonb,
    output_claims JSONB DEFAULT '[]'::jsonb,
    next_experiments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    execution_time_ms INT
);
CREATE INDEX IF NOT EXISTS idx_traces_hypothesis ON lbd_reasoning_traces(hypothesis_id);

-- RLS (with DROP first to avoid duplicates)
ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_reasoning_traces ENABLE ROW LEVEL SECURITY;

-- Service role policies
DO $$ BEGIN
    CREATE POLICY "Service manages graph_nodes" ON graph_nodes FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Service manages graph_edges" ON graph_edges FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Service manages frontier_jobs" ON frontier_jobs FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Service manages lbd_documents" ON lbd_documents FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Service manages lbd_claims" ON lbd_claims FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
