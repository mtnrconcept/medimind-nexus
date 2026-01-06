-- Migration: LBD Knowledge Layer Tables
-- Part of LBD Discovery Engine Phase 3A

-- =============================================
-- TABLE: frontier_jobs
-- File d'exploration récursive avec priorité
-- =============================================
CREATE TABLE IF NOT EXISTS frontier_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Nœud à explorer
    node_id UUID REFERENCES graph_nodes(id) ON DELETE CASCADE,
    node_label TEXT,
    node_type VARCHAR(32),
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    
    -- Facette d'exploration
    facet VARCHAR(32) CHECK (facet IN (
        'mechanism', 'phenotype', 'molecule', 'population', 
        'intervention', 'complication', 'biomarker', 'pathway'
    )),
    
    -- Priorité et budget
    priority FLOAT DEFAULT 0.5,  -- Score de potentiel de découverte (0-1)
    depth INT DEFAULT 0,         -- Profondeur dans l'arbre d'exploration
    max_depth INT DEFAULT 5,
    budget_remaining INT DEFAULT 100,  -- Nombre de requêtes API restantes
    
    -- Status
    status VARCHAR(16) DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed', 'cancelled'
    )),
    
    -- Résultats
    claims_generated INT DEFAULT 0,
    hypotheses_generated INT DEFAULT 0,
    execution_time_ms INT,
    error_message TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_frontier_status_priority ON frontier_jobs(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_frontier_node ON frontier_jobs(node_id);
CREATE INDEX IF NOT EXISTS idx_frontier_hypothesis ON frontier_jobs(hypothesis_id);

-- =============================================
-- TABLE: lbd_documents
-- Sources scientifiques (articles, essais, brevets)
-- =============================================
CREATE TABLE IF NOT EXISTS lbd_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identifiants externes
    pmid VARCHAR(20) UNIQUE,
    pmcid VARCHAR(20),
    doi VARCHAR(100),
    nct_id VARCHAR(20),  -- ClinicalTrials.gov
    
    -- Métadonnées
    title TEXT NOT NULL,
    abstract TEXT,
    authors TEXT[],
    journal VARCHAR(255),
    publication_date DATE,
    publication_year INT,
    
    -- Source
    source VARCHAR(32) CHECK (source IN (
        'pubmed', 'clinicaltrials', 'openalex', 'europepmc', 'biorxiv', 'medrxiv'
    )),
    full_text_url TEXT,
    
    -- Evidence level
    study_type VARCHAR(32) CHECK (study_type IN (
        'meta_analysis', 'systematic_review', 'rct', 'cohort', 
        'case_control', 'case_series', 'case_report', 'in_vitro', 
        'animal', 'expert_opinion', 'guideline', 'unknown'
    )),
    
    -- Indexation
    mesh_terms TEXT[],
    keywords TEXT[],
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lbd_docs_pmid ON lbd_documents(pmid);
CREATE INDEX IF NOT EXISTS idx_lbd_docs_doi ON lbd_documents(doi);
CREATE INDEX IF NOT EXISTS idx_lbd_docs_source ON lbd_documents(source);
CREATE INDEX IF NOT EXISTS idx_lbd_docs_year ON lbd_documents(publication_year DESC);

-- =============================================
-- TABLE: lbd_passages
-- Extraits de texte pertinents avec embeddings
-- =============================================
CREATE TABLE IF NOT EXISTS lbd_passages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES lbd_documents(id) ON DELETE CASCADE,
    
    -- Contenu
    text TEXT NOT NULL,
    section VARCHAR(64) CHECK (section IN (
        'title', 'abstract', 'introduction', 'methods', 
        'results', 'discussion', 'conclusion', 'full_text'
    )),
    
    -- Entités extraites (NER)
    entities JSONB DEFAULT '[]'::jsonb,
    -- Format: [{"text": "...", "type": "drug|disease|gene|pathway", "norm_id": "..."}]
    
    -- Embedding pour recherche sémantique
    embedding VECTOR(1536),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lbd_passages_doc ON lbd_passages(document_id);
CREATE INDEX IF NOT EXISTS idx_lbd_passages_entities ON lbd_passages USING GIN (entities);

-- =============================================
-- TABLE: lbd_claims
-- Assertions normalisées (A RELATION B)
-- =============================================
CREATE TABLE IF NOT EXISTS lbd_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Sujet et objet (peuvent référencer graph_nodes ou être textuels)
    subject_node_id UUID REFERENCES graph_nodes(id) ON DELETE SET NULL,
    subject_text TEXT NOT NULL,
    subject_type VARCHAR(32),
    subject_norm_ids JSONB DEFAULT '[]'::jsonb,  -- MeSH, UMLS, RxNorm, etc.
    
    predicate VARCHAR(64) NOT NULL,  -- TREATS, CAUSES, TARGETS, INHIBITS, etc.
    
    object_node_id UUID REFERENCES graph_nodes(id) ON DELETE SET NULL,
    object_text TEXT NOT NULL,
    object_type VARCHAR(32),
    object_norm_ids JSONB DEFAULT '[]'::jsonb,
    
    -- Multi-dimensional scoring (0.0 - 1.0)
    evidence_quality FLOAT DEFAULT 0.5,       -- guideline > RCT > cohorte
    replication_count INT DEFAULT 1,          -- Nombre sources concordantes
    effect_direction VARCHAR(16) CHECK (effect_direction IN ('benefit', 'harm', 'neutral', 'unknown')),
    population_match FLOAT DEFAULT 0.5,       -- Correspondance contexte patient
    recency_score FLOAT DEFAULT 0.5,          -- Poids données récentes
    mechanistic_plausibility FLOAT DEFAULT 0.5,
    aggregate_score FLOAT DEFAULT 0.5,
    
    -- Type d'inférence
    is_hypothesis BOOLEAN DEFAULT FALSE,      -- Inférence multi-hop vs observation directe
    inference_rule VARCHAR(32) CHECK (inference_rule IN (
        'direct_extraction', 'swanson_abc', 'analogy', 'pathway_inference', NULL
    )),
    
    -- Lien vers hypothèse générée
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(128),
    status VARCHAR(16) DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_lbd_claims_subject ON lbd_claims(subject_node_id);
CREATE INDEX IF NOT EXISTS idx_lbd_claims_object ON lbd_claims(object_node_id);
CREATE INDEX IF NOT EXISTS idx_lbd_claims_predicate ON lbd_claims(predicate);
CREATE INDEX IF NOT EXISTS idx_lbd_claims_score ON lbd_claims(aggregate_score DESC);
CREATE INDEX IF NOT EXISTS idx_lbd_claims_hypothesis ON lbd_claims(is_hypothesis) WHERE is_hypothesis = TRUE;

-- =============================================
-- TABLE: lbd_claim_evidence
-- Lien claims → passages (preuves)
-- =============================================
CREATE TABLE IF NOT EXISTS lbd_claim_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID REFERENCES lbd_claims(id) ON DELETE CASCADE,
    passage_id UUID REFERENCES lbd_passages(id) ON DELETE CASCADE,
    
    confidence FLOAT DEFAULT 0.5,  -- Confiance de l'extraction
    extraction_method VARCHAR(32) CHECK (extraction_method IN (
        'manual', 'regex', 'ner', 'llm', 'relation_extraction'
    )),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(claim_id, passage_id)
);

CREATE INDEX IF NOT EXISTS idx_lbd_evidence_claim ON lbd_claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_lbd_evidence_passage ON lbd_claim_evidence(passage_id);

-- =============================================
-- TABLE: lbd_contradictions
-- Assertions opposées avec analyse
-- =============================================
CREATE TABLE IF NOT EXISTS lbd_contradictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    claim_support_id UUID REFERENCES lbd_claims(id) ON DELETE CASCADE,
    claim_refute_id UUID REFERENCES lbd_claims(id) ON DELETE CASCADE,
    
    -- Analyse de la contradiction
    resolution VARCHAR(32) CHECK (resolution IN (
        'unresolved', 'population_specific', 'dose_dependent', 
        'methodological', 'temporal', 'superseded'
    )),
    explanation TEXT,
    
    -- Poids relatif
    support_weight FLOAT DEFAULT 0.5,
    refute_weight FLOAT DEFAULT 0.5,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(claim_support_id, claim_refute_id)
);

CREATE INDEX IF NOT EXISTS idx_contradictions_support ON lbd_contradictions(claim_support_id);
CREATE INDEX IF NOT EXISTS idx_contradictions_refute ON lbd_contradictions(claim_refute_id);

-- =============================================
-- TABLE: lbd_reasoning_traces
-- Traçabilité complète du raisonnement
-- =============================================
CREATE TABLE IF NOT EXISTS lbd_reasoning_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    hypothesis_id UUID REFERENCES discovery_hypotheses(id) ON DELETE SET NULL,
    job_id UUID REFERENCES frontier_jobs(id) ON DELETE SET NULL,
    
    -- Inputs
    inputs JSONB DEFAULT '{}'::jsonb,
    -- Format: {"central_node": {...}, "context": {...}, "goal": "..."}
    
    -- Retrieval
    retrieval_queries JSONB DEFAULT '[]'::jsonb,
    -- Format: [{"api": "pubmed", "query": "...", "results_count": 42}]
    
    -- Evidence Map
    evidence_map JSONB DEFAULT '[]'::jsonb,
    -- Format: [{"document_id": "...", "passages": [...], "claims": [...]}]
    
    -- Normalization
    normalization_log JSONB DEFAULT '[]'::jsonb,
    -- Format: [{"term": "...", "resolved_to": "...", "confidence": 0.9}]
    
    -- Inference Steps
    inference_steps JSONB DEFAULT '[]'::jsonb,
    -- Format: [{"step": 1, "rule": "swanson_abc", "a": "...", "b": "...", "c": "...", "score": 0.7}]
    
    -- Contradictions Found
    contradictions_found JSONB DEFAULT '[]'::jsonb,
    
    -- Output
    output_claims JSONB DEFAULT '[]'::jsonb,
    next_experiments JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    execution_time_ms INT
);

CREATE INDEX IF NOT EXISTS idx_traces_hypothesis ON lbd_reasoning_traces(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_traces_job ON lbd_reasoning_traces(job_id);
CREATE INDEX IF NOT EXISTS idx_traces_created ON lbd_reasoning_traces(created_at DESC);

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE frontier_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_contradictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lbd_reasoning_traces ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Users can view frontier jobs" ON frontier_jobs
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can view documents" ON lbd_documents
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can view passages" ON lbd_passages
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can view claims" ON lbd_claims
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can view evidence links" ON lbd_claim_evidence
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can view contradictions" ON lbd_contradictions
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can view reasoning traces" ON lbd_reasoning_traces
    FOR SELECT USING (auth.role() = 'authenticated');

-- Full access for service role
CREATE POLICY "Service manages frontier jobs" ON frontier_jobs
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service manages documents" ON lbd_documents
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service manages passages" ON lbd_passages
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service manages claims" ON lbd_claims
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service manages evidence links" ON lbd_claim_evidence
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service manages contradictions" ON lbd_contradictions
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service manages reasoning traces" ON lbd_reasoning_traces
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Helper function to calculate aggregate score
-- =============================================
CREATE OR REPLACE FUNCTION calculate_claim_score(
    p_evidence_quality FLOAT,
    p_replication_count INT,
    p_population_match FLOAT,
    p_recency_score FLOAT,
    p_mechanistic_plausibility FLOAT
) RETURNS FLOAT AS $$
BEGIN
    RETURN (
        p_evidence_quality * 0.25 +
        LEAST(p_replication_count / 5.0, 1.0) * 0.15 +
        p_population_match * 0.15 +
        p_recency_score * 0.10 +
        p_mechanistic_plausibility * 0.20 +
        0.15  -- Base score
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
