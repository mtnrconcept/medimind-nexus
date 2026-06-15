-- ============================================
-- DISCOVERY PLATFORM SCHEMA - SIMPLIFIED
-- Only essential tables, no dependencies on other tables
-- ============================================

-- 1. Papers Table
CREATE TABLE IF NOT EXISTS discovery_papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pmid TEXT UNIQUE,
    pmcid TEXT,
    doi TEXT,
    title TEXT NOT NULL,
    authors JSONB DEFAULT '[]'::jsonb,
    abstract TEXT,
    publication_date DATE,
    journal TEXT,
    source TEXT NOT NULL,
    text_chunks JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    full_text_available BOOLEAN DEFAULT FALSE,
    citation_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_papers_pmid ON discovery_papers(pmid) WHERE pmid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discovery_papers_doi ON discovery_papers(doi) WHERE doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discovery_papers_source ON discovery_papers(source);

-- 2. Hypotheses Table
CREATE TABLE IF NOT EXISTS discovery_hypotheses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hypothesis_id TEXT UNIQUE NOT NULL,
    statement TEXT NOT NULL,
    predictions JSONB DEFAULT '[]'::jsonb,
    minimal_tests JSONB DEFAULT '[]'::jsonb,
    risks_confounders TEXT[] DEFAULT ARRAY[]::TEXT[],
    evidence_pack_id UUID,
    evidence_citations JSONB DEFAULT '[]'::jsonb,
    scores JSONB DEFAULT '{}'::jsonb,
    adversarial_review JSONB DEFAULT NULL,
    status TEXT DEFAULT 'pending',
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID
);

CREATE INDEX IF NOT EXISTS idx_discovery_hypotheses_status ON discovery_hypotheses(status);

-- 3. Research Sessions Table
CREATE TABLE IF NOT EXISTS discovery_research_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    session_type TEXT NOT NULL,
    query TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    results_summary JSONB DEFAULT '{}'::jsonb,
    claude_prompt TEXT,
    claude_response TEXT,
    tokens_used JSONB DEFAULT '{}'::jsonb,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_type ON discovery_research_sessions(session_type);

-- 4. Evidence Snippets Table
CREATE TABLE IF NOT EXISTS discovery_evidence_snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id UUID REFERENCES discovery_papers(id) ON DELETE CASCADE,
    chunk_id TEXT,
    passage TEXT NOT NULL,
    section TEXT,
    entities JSONB DEFAULT '[]'::jsonb,
    claim_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    confidence REAL DEFAULT 0.5,
    start_offset INTEGER,
    end_offset INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Evidence Packs Table
CREATE TABLE IF NOT EXISTS discovery_evidence_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_intent JSONB NOT NULL,
    paper_ids UUID[] DEFAULT ARRAY[]::UUID[],
    snippet_ids UUID[] DEFAULT ARRAY[]::UUID[],
    graph_neighborhood JSONB DEFAULT '{}'::jsonb,
    trials_context JSONB DEFAULT '[]'::jsonb,
    total_papers INTEGER DEFAULT 0,
    total_snippets INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. KG Triples
CREATE TABLE IF NOT EXISTS discovery_kg_triples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    relation TEXT NOT NULL,
    object_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_name TEXT NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    provenance UUID[] DEFAULT ARRAY[]::UUID[],
    confidence_score REAL DEFAULT 0.5,
    evidence_level TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subject_id, relation, object_id)
);

-- 7. API Cache
CREATE TABLE IF NOT EXISTS discovery_api_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    request_params JSONB NOT NULL,
    response_data JSONB NOT NULL,
    etag TEXT,
    last_modified TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE discovery_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_evidence_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_evidence_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_kg_triples ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_api_cache ENABLE ROW LEVEL SECURITY;

-- Simple RLS Policies - Allow all operations
CREATE POLICY "discovery_papers_all" ON discovery_papers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "discovery_hypotheses_all" ON discovery_hypotheses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "discovery_sessions_all" ON discovery_research_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "discovery_snippets_all" ON discovery_evidence_snippets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "discovery_packs_all" ON discovery_evidence_packs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "discovery_triples_all" ON discovery_kg_triples FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "discovery_cache_all" ON discovery_api_cache FOR ALL USING (true) WITH CHECK (true);
