-- MIGRATION: Interoperable Discovery Engine - Canonical Entities & Cross-Ontology Mappings
-- Implements scientific data layer for falsifiable discoveries

-- ============================================
-- SECTION 1: CANONICAL ENTITY TABLE
-- Central registry of all biomedical entities
-- ============================================

CREATE TABLE IF NOT EXISTS canonical_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entity identification
    entity_type TEXT NOT NULL CHECK (entity_type IN (
        'drug',           -- Active pharmaceutical ingredient
        'disease',        -- Medical condition/pathology
        'adverse_event',  -- Side effect / adverse reaction
        'gene',           -- Gene/protein target
        'pathway',        -- Biological pathway
        'trial',          -- Clinical trial
        'paper',          -- Scientific publication
        'allergen',       -- Allergenic substance
        'phenotype',      -- Clinical phenotype
        'biomarker'       -- Diagnostic/prognostic marker
    )),
    
    -- Canonical name (normalized)
    canonical_name TEXT NOT NULL,
    
    -- Primary identifiers (at least one required)
    rxcui TEXT,               -- RxNorm Concept Unique Identifier
    umls_cui TEXT,            -- UMLS Concept Unique Identifier
    mesh_id TEXT,             -- MeSH Descriptor ID (Dxxxxxx)
    meddra_pt_code TEXT,      -- MedDRA Preferred Term code
    unii TEXT,                -- FDA Unique Ingredient Identifier
    ncbi_gene_id TEXT,        -- NCBI Gene ID
    ensembl_id TEXT,          -- Ensembl Gene ID
    nct_id TEXT,              -- ClinicalTrials.gov ID
    pmid TEXT,                -- PubMed ID
    
    -- Hierarchical classification
    meddra_hlt TEXT,          -- MedDRA High Level Term
    meddra_hlgt TEXT,         -- MedDRA High Level Group Term
    meddra_soc TEXT,          -- MedDRA System Organ Class
    atc_code TEXT,            -- ATC classification (drugs)
    icd10_code TEXT,          -- ICD-10 code (diseases)
    
    -- Metadata
    description TEXT,
    synonyms TEXT[],
    source TEXT NOT NULL,     -- Primary data source
    confidence_score NUMERIC DEFAULT 1.0, -- Entity resolution confidence
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(entity_type, rxcui) WHERE rxcui IS NOT NULL,
    UNIQUE(entity_type, umls_cui) WHERE umls_cui IS NOT NULL,
    UNIQUE(entity_type, mesh_id) WHERE mesh_id IS NOT NULL,
    UNIQUE(entity_type, meddra_pt_code) WHERE meddra_pt_code IS NOT NULL,
    UNIQUE(entity_type, nct_id) WHERE nct_id IS NOT NULL,
    UNIQUE(entity_type, pmid) WHERE pmid IS NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_canonical_type ON canonical_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_canonical_name ON canonical_entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_canonical_rxcui ON canonical_entities(rxcui) WHERE rxcui IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canonical_umls ON canonical_entities(umls_cui) WHERE umls_cui IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canonical_mesh ON canonical_entities(mesh_id) WHERE mesh_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canonical_meddra ON canonical_entities(meddra_pt_code) WHERE meddra_pt_code IS NOT NULL;

-- ============================================
-- SECTION 2: ENTITY SYNONYMS TABLE
-- Cross-reference all synonyms to canonical entities
-- ============================================

CREATE TABLE IF NOT EXISTS entity_synonyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    
    synonym TEXT NOT NULL,
    synonym_type TEXT CHECK (synonym_type IN (
        'trade_name',     -- Brand name
        'generic_name',   -- Generic drug name
        'abbreviation',   -- Common abbreviation
        'iupac',          -- IUPAC chemical name
        'mesh_term',      -- MeSH entry term
        'meddra_llt',     -- MedDRA Lowest Level Term
        'alias',          -- Other alias
        'obsolete'        -- Deprecated term
    )),
    source TEXT,
    lang TEXT DEFAULT 'en',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(entity_id, synonym, lang)
);

CREATE INDEX IF NOT EXISTS idx_synonym_text ON entity_synonyms(LOWER(synonym));
CREATE INDEX IF NOT EXISTS idx_synonym_entity ON entity_synonyms(entity_id);

-- ============================================
-- SECTION 3: CROSS-ONTOLOGY MAPPINGS
-- RxCUI ↔ UMLS ↔ MeSH ↔ MedDRA bridge
-- ============================================

CREATE TABLE IF NOT EXISTS ontology_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source ontology
    source_ontology TEXT NOT NULL CHECK (source_ontology IN (
        'rxnorm', 'umls', 'mesh', 'meddra', 'snomed', 'icd10', 'atc', 'unii', 'drugbank'
    )),
    source_code TEXT NOT NULL,
    source_term TEXT,
    
    -- Target ontology
    target_ontology TEXT NOT NULL CHECK (target_ontology IN (
        'rxnorm', 'umls', 'mesh', 'meddra', 'snomed', 'icd10', 'atc', 'unii', 'drugbank'
    )),
    target_code TEXT NOT NULL,
    target_term TEXT,
    
    -- Mapping quality
    mapping_type TEXT CHECK (mapping_type IN (
        'exact',          -- Exact semantic equivalence
        'broader',        -- Source is more specific
        'narrower',       -- Source is more general
        'related',        -- Related but not equivalent
        'approximate'     -- Approximate match
    )),
    confidence NUMERIC DEFAULT 1.0,
    source_authority TEXT, -- UMLS, manual, ML, etc.
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(source_ontology, source_code, target_ontology, target_code)
);

CREATE INDEX IF NOT EXISTS idx_mapping_source ON ontology_mappings(source_ontology, source_code);
CREATE INDEX IF NOT EXISTS idx_mapping_target ON ontology_mappings(target_ontology, target_code);

-- ============================================
-- SECTION 4: KNOWLEDGE GRAPH EDGES
-- Typed relationships between canonical entities
-- ============================================

CREATE TABLE IF NOT EXISTS kg_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Edge endpoints (canonical entity IDs)
    source_entity_id UUID NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    
    -- Relationship type (biomedical semantics)
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        -- Drug-Disease
        'treats',                 -- Drug indicated for disease
        'prevents',               -- Drug prevents disease
        'contraindicated_for',    -- Drug contraindicated for disease
        'off_label_for',          -- Off-label use
        
        -- Drug-AE
        'causes',                 -- Drug causes adverse event
        'may_cause',              -- Possible causation (signal)
        'associated_with',        -- Statistical association
        
        -- Drug-Drug
        'interacts_with',         -- Drug-drug interaction
        'synergistic_with',       -- Synergistic effect
        'antagonistic_to',        -- Antagonistic effect
        
        -- Drug-Target
        'targets',                -- Drug targets gene/protein
        'inhibits',               -- Drug inhibits target
        'activates',              -- Drug activates target
        'modulates',              -- Drug modulates target
        
        -- Drug-Pathway
        'affects_pathway',        -- Drug affects biological pathway
        
        -- Disease-Gene
        'associated_gene',        -- Gene associated with disease
        'causal_gene',            -- Gene causally linked to disease
        
        -- Evidence links
        'reported_in',            -- Reported in paper/trial
        'tested_in',              -- Tested in clinical trial
        'validated_by',           -- Validated by evidence
        'refuted_by',             -- Refuted by evidence
        
        -- Allergen
        'cross_reacts_with',      -- Cross-reactivity
        'contains_allergen'       -- Product contains allergen
    )),
    
    -- Edge properties
    direction TEXT DEFAULT 'directed' CHECK (direction IN ('directed', 'undirected')),
    
    -- Evidence & scoring
    evidence_sources JSONB DEFAULT '[]', -- Array of {type, id, strength}
    evidence_count INTEGER DEFAULT 1,
    confidence_score NUMERIC DEFAULT 0.5,
    
    -- FAERS-specific scores (if applicable)
    faers_ror NUMERIC,            -- Reporting Odds Ratio
    faers_prr NUMERIC,            -- Proportional Reporting Ratio
    faers_ebgm NUMERIC,           -- Empirical Bayesian Geometric Mean
    faers_case_count INTEGER,     -- Number of FAERS cases
    
    -- Metadata
    primary_source TEXT,          -- Primary data source
    last_validated TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(source_entity_id, target_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_kg_edge_source ON kg_edges(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_edge_target ON kg_edges(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_edge_type ON kg_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_kg_edge_confidence ON kg_edges(confidence_score DESC);

-- ============================================
-- SECTION 5: EVIDENCE STACKS
-- Triangulated evidence for hypotheses
-- ============================================

CREATE TABLE IF NOT EXISTS evidence_stacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Hypothesis identification
    hypothesis_id UUID,           -- Links to discovery_cards
    hypothesis_type TEXT CHECK (hypothesis_type IN (
        'repositioning',          -- Drug repositioning
        'risk_detection',         -- Adverse event detection
        'stratification',         -- Patient stratification
        'interaction',            -- Drug interaction
        'mechanism'               -- Novel mechanism
    )),
    
    -- Core claim
    drug_rxcui TEXT,
    disease_mesh TEXT,
    claim_summary TEXT NOT NULL,
    
    -- Evidence lines (minimum 3 for valid hypothesis)
    evidence_lines JSONB NOT NULL DEFAULT '[]',
    -- Structure: [{
    --   type: 'faers' | 'pubmed' | 'trials' | 'mechanism' | 'omics',
    --   source_ids: ['NCT123', 'PMID456'],
    --   strength: 'strong' | 'moderate' | 'weak',
    --   direction: 'supports' | 'refutes' | 'neutral',
    --   summary: 'text',
    --   scores: {ror: 2.5, prr: 1.8, ebgm: 3.2} // if applicable
    -- }]
    
    -- Counter-evidence (required for valid hypothesis)
    counter_evidence JSONB DEFAULT '[]',
    -- Structure: [{source, summary, strength}]
    
    -- Bias assessment
    bias_flags JSONB DEFAULT '[]',
    -- Structure: ['notoriety_bias', 'channeling_bias', 'confounding_by_indication']
    
    -- Scoring (non-LLM computed)
    triangulation_score NUMERIC,  -- Number of independent evidence types
    novelty_score NUMERIC,        -- 0-10
    plausibility_score NUMERIC,   -- 0-10
    risk_score NUMERIC,           -- 0-10
    feasibility_score NUMERIC,    -- Validation feasibility 0-10
    
    -- Validation plan
    validation_plan JSONB DEFAULT '[]',
    -- Structure: [{study_type, dataset, endpoint, estimated_cost, timeline_days}]
    
    -- Kill criteria (falsification)
    kill_criteria TEXT[],
    
    -- Status
    status TEXT DEFAULT 'proposed' CHECK (status IN (
        'proposed', 'under_review', 'validated', 'refuted', 'archived'
    )),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_hypothesis ON evidence_stacks(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence_stacks(hypothesis_type);
CREATE INDEX IF NOT EXISTS idx_evidence_drug ON evidence_stacks(drug_rxcui);
CREATE INDEX IF NOT EXISTS idx_evidence_disease ON evidence_stacks(disease_mesh);
CREATE INDEX IF NOT EXISTS idx_evidence_triangulation ON evidence_stacks(triangulation_score DESC);

-- ============================================
-- SECTION 6: FAERS SIGNALS (Pre-computed)
-- Non-LLM analytics for FAERS data
-- ============================================

CREATE TABLE IF NOT EXISTS faers_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Drug-Event pair
    drug_rxcui TEXT NOT NULL,
    drug_name TEXT,
    event_meddra_pt TEXT NOT NULL,
    event_name TEXT,
    
    -- Signal scores (disproportionality analysis)
    ror NUMERIC,                  -- Reporting Odds Ratio
    ror_lower_95 NUMERIC,         -- 95% CI lower bound
    ror_upper_95 NUMERIC,         -- 95% CI upper bound
    prr NUMERIC,                  -- Proportional Reporting Ratio
    prr_chi_squared NUMERIC,      -- Chi-squared statistic
    ebgm NUMERIC,                 -- Empirical Bayesian Geometric Mean (MGPS)
    ebgm_lower_90 NUMERIC,        -- EB05 (5th percentile)
    ic NUMERIC,                   -- Information Component (Bayesian)
    ic_lower_95 NUMERIC,          -- IC025
    
    -- Case counts
    case_count INTEGER,           -- Total cases with drug + event
    drug_count INTEGER,           -- Total cases with drug
    event_count INTEGER,          -- Total cases with event
    total_cases INTEGER,          -- Total FAERS cases in analysis
    
    -- Stratification
    age_group_signals JSONB,      -- {pediatric: {...}, adult: {...}, geriatric: {...}}
    sex_signals JSONB,            -- {male: {...}, female: {...}}
    indication_signals JSONB,     -- By indication
    
    -- Quality flags
    is_known_reaction BOOLEAN,    -- Already in label
    notoriety_bias_risk TEXT,     -- low/medium/high
    channeling_bias_risk TEXT,    -- low/medium/high
    
    -- Timestamps
    analysis_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(drug_rxcui, event_meddra_pt, analysis_date)
);

CREATE INDEX IF NOT EXISTS idx_faers_drug ON faers_signals(drug_rxcui);
CREATE INDEX IF NOT EXISTS idx_faers_event ON faers_signals(event_meddra_pt);
CREATE INDEX IF NOT EXISTS idx_faers_ebgm ON faers_signals(ebgm DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_faers_ror ON faers_signals(ror DESC NULLS LAST);

-- ============================================
-- SECTION 7: RLS POLICIES
-- ============================================

ALTER TABLE canonical_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_synonyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kg_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE faers_signals ENABLE ROW LEVEL SECURITY;

-- Public read for all reference tables
CREATE POLICY "Public read canonical_entities" ON canonical_entities FOR SELECT USING (true);
CREATE POLICY "Public read entity_synonyms" ON entity_synonyms FOR SELECT USING (true);
CREATE POLICY "Public read ontology_mappings" ON ontology_mappings FOR SELECT USING (true);
CREATE POLICY "Public read kg_edges" ON kg_edges FOR SELECT USING (true);
CREATE POLICY "Public read evidence_stacks" ON evidence_stacks FOR SELECT USING (true);
CREATE POLICY "Public read faers_signals" ON faers_signals FOR SELECT USING (true);

-- Service role full access
CREATE POLICY "Service write canonical_entities" ON canonical_entities FOR ALL USING (true);
CREATE POLICY "Service write entity_synonyms" ON entity_synonyms FOR ALL USING (true);
CREATE POLICY "Service write ontology_mappings" ON ontology_mappings FOR ALL USING (true);
CREATE POLICY "Service write kg_edges" ON kg_edges FOR ALL USING (true);
CREATE POLICY "Service write evidence_stacks" ON evidence_stacks FOR ALL USING (true);
CREATE POLICY "Service write faers_signals" ON faers_signals FOR ALL USING (true);

-- ============================================
-- SECTION 8: HELPER FUNCTIONS
-- ============================================

-- Function to resolve entity by any ID
CREATE OR REPLACE FUNCTION resolve_entity(
    p_identifier TEXT,
    p_ontology TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_entity_id UUID;
BEGIN
    -- Try exact ID matches
    IF p_ontology = 'rxnorm' OR p_ontology IS NULL THEN
        SELECT id INTO v_entity_id FROM canonical_entities WHERE rxcui = p_identifier LIMIT 1;
        IF v_entity_id IS NOT NULL THEN RETURN v_entity_id; END IF;
    END IF;
    
    IF p_ontology = 'umls' OR p_ontology IS NULL THEN
        SELECT id INTO v_entity_id FROM canonical_entities WHERE umls_cui = p_identifier LIMIT 1;
        IF v_entity_id IS NOT NULL THEN RETURN v_entity_id; END IF;
    END IF;
    
    IF p_ontology = 'mesh' OR p_ontology IS NULL THEN
        SELECT id INTO v_entity_id FROM canonical_entities WHERE mesh_id = p_identifier LIMIT 1;
        IF v_entity_id IS NOT NULL THEN RETURN v_entity_id; END IF;
    END IF;
    
    IF p_ontology = 'meddra' OR p_ontology IS NULL THEN
        SELECT id INTO v_entity_id FROM canonical_entities WHERE meddra_pt_code = p_identifier LIMIT 1;
        IF v_entity_id IS NOT NULL THEN RETURN v_entity_id; END IF;
    END IF;
    
    -- Try synonym lookup
    SELECT e.entity_id INTO v_entity_id 
    FROM entity_synonyms e 
    WHERE LOWER(e.synonym) = LOWER(p_identifier) 
    LIMIT 1;
    
    RETURN v_entity_id;
END;
$$;

-- Function to get all related entities
CREATE OR REPLACE FUNCTION get_entity_relationships(
    p_entity_id UUID,
    p_relationship_types TEXT[] DEFAULT NULL,
    p_min_confidence NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
    related_entity_id UUID,
    relationship_type TEXT,
    direction TEXT,
    confidence_score NUMERIC,
    evidence_count INTEGER,
    faers_ebgm NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE WHEN e.source_entity_id = p_entity_id 
             THEN e.target_entity_id 
             ELSE e.source_entity_id 
        END,
        e.relationship_type,
        CASE WHEN e.source_entity_id = p_entity_id 
             THEN 'outgoing' 
             ELSE 'incoming' 
        END,
        e.confidence_score,
        e.evidence_count,
        e.faers_ebgm
    FROM kg_edges e
    WHERE (e.source_entity_id = p_entity_id OR e.target_entity_id = p_entity_id)
      AND e.confidence_score >= p_min_confidence
      AND (p_relationship_types IS NULL OR e.relationship_type = ANY(p_relationship_types))
    ORDER BY e.confidence_score DESC, e.evidence_count DESC;
END;
$$;
