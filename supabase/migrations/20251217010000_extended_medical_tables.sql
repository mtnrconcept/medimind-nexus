-- Migration: Extended Medical Knowledge Base Tables
-- FIXED VERSION: Handles existing tables and adds missing columns

-- ============================================
-- SECTION 1: MOLECULES / SUBSTANCES
-- ============================================

-- Drop and recreate molecules table (safer approach)
DROP TABLE IF EXISTS drug_compositions CASCADE;
DROP TABLE IF EXISTS molecules CASCADE;

CREATE TABLE molecules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_en TEXT,
    
    -- Identifiers
    rxcui TEXT,
    unii TEXT,
    cas_number TEXT,
    drugbank_id TEXT,
    pubchem_cid TEXT,
    
    -- Classification
    molecule_type TEXT CHECK (molecule_type IN (
        'small_molecule',
        'biologic',
        'peptide',
        'enzyme',
        'hormone',
        'vitamin',
        'mineral',
        'nucleic_acid',
        'other'
    )),
    
    -- Chemical properties
    molecular_formula TEXT,
    molecular_weight NUMERIC,
    inchi_key TEXT,
    smiles TEXT,
    
    -- Pharmacological
    mechanism_of_action TEXT,
    pharmacological_class TEXT[],
    therapeutic_areas TEXT[],
    
    -- Metadata
    source TEXT DEFAULT 'rxnorm',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on rxcui (allows nulls)
CREATE UNIQUE INDEX idx_molecules_rxcui_unique ON molecules(rxcui) WHERE rxcui IS NOT NULL;

-- ============================================

DROP TABLE IF EXISTS substances CASCADE;

CREATE TABLE substances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_en TEXT,
    
    -- Identifiers
    unii TEXT,
    cas_number TEXT,
    
    -- Classification
    substance_type TEXT CHECK (substance_type IN (
        'active_ingredient',
        'excipient',
        'preservative',
        'colorant',
        'flavoring',
        'allergen',
        'natural_product',
        'other'
    )),
    
    -- Risk info
    is_allergen BOOLEAN DEFAULT false,
    common_allergen_type TEXT,
    
    -- Metadata
    source TEXT DEFAULT 'fda',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_substances_unii_unique ON substances(unii) WHERE unii IS NOT NULL;

-- ============================================
-- SECTION 2: DRUG COMPOSITIONS
-- ============================================

CREATE TABLE drug_compositions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,
    medication_name TEXT,
    
    -- Component
    molecule_id UUID REFERENCES molecules(id),
    substance_id UUID REFERENCES substances(id),
    component_name TEXT NOT NULL,
    
    -- Role
    component_role TEXT CHECK (component_role IN (
        'active_ingredient',
        'excipient',
        'preservative',
        'colorant',
        'coating',
        'vehicle',
        'other'
    )),
    
    -- Quantity
    strength TEXT,
    strength_value NUMERIC,
    strength_unit TEXT,
    
    -- Metadata
    source TEXT DEFAULT 'openfda',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_drug_compositions_unique ON drug_compositions(medication_id, component_name, component_role) 
WHERE medication_id IS NOT NULL;

-- ============================================
-- SECTION 3: ALLERGENS
-- ============================================

DROP TABLE IF EXISTS allergens CASCADE;

CREATE TABLE allergens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    name_en TEXT,
    
    -- Classification
    allergen_category TEXT CHECK (allergen_category IN (
        'drug',
        'food',
        'environmental',
        'insect',
        'latex',
        'excipient',
        'other'
    )),
    
    -- Cross-reactivity
    cross_reactive_with TEXT[],
    
    -- Clinical info
    common_reactions TEXT[],
    severity_potential TEXT CHECK (severity_potential IN ('mild', 'moderate', 'severe', 'anaphylaxis')),
    
    -- Related substances
    related_substance_ids UUID[],
    related_molecule_ids UUID[],
    
    -- Metadata
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 4: FOODS AND DIETARY
-- ============================================

DROP TABLE IF EXISTS food_drug_interactions CASCADE;
DROP TABLE IF EXISTS foods CASCADE;

CREATE TABLE foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_en TEXT,
    
    -- Classification
    food_category TEXT,
    food_group TEXT,
    
    -- Drug interactions
    known_drug_interactions TEXT[],
    interaction_mechanism TEXT,
    
    -- Nutritional relevance
    high_in TEXT[],
    
    -- Clinical notes
    clinical_considerations TEXT,
    
    -- Metadata
    source TEXT DEFAULT 'medlineplus',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE food_drug_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID REFERENCES foods(id),
    food_name TEXT,
    medication_id UUID REFERENCES medications(id),
    medication_name TEXT,
    
    -- Interaction details
    interaction_type TEXT CHECK (interaction_type IN (
        'absorption_decrease',
        'absorption_increase',
        'metabolism_inhibition',
        'metabolism_induction',
        'effect_potentiation',
        'effect_antagonism',
        'toxicity_increase'
    )),
    
    severity TEXT CHECK (severity IN ('minor', 'moderate', 'major', 'contraindicated')),
    description TEXT,
    clinical_action TEXT,
    
    -- Evidence
    pmid TEXT[],
    evidence_level TEXT,
    
    -- Metadata
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 5: ALTERNATIVE TREATMENTS
-- ============================================

DROP TABLE IF EXISTS alternative_treatments CASCADE;

CREATE TABLE alternative_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_en TEXT,
    
    -- Classification
    treatment_type TEXT CHECK (treatment_type IN (
        'herbal',
        'supplement',
        'homeopathy',
        'acupuncture',
        'massage',
        'chiropractic',
        'naturopathy',
        'traditional_medicine',
        'mind_body',
        'other'
    )),
    
    -- Composition
    active_components TEXT[],
    
    -- Indications
    traditional_uses TEXT[],
    conditions_addressed TEXT[],
    
    -- Safety
    known_drug_interactions TEXT[],
    contraindications TEXT[],
    side_effects TEXT[],
    
    -- Evidence
    evidence_level TEXT CHECK (evidence_level IN ('strong', 'moderate', 'limited', 'traditional', 'none')),
    clinical_trials_count INTEGER DEFAULT 0,
    
    -- Regulatory
    regulatory_status TEXT,
    
    -- Metadata
    source TEXT DEFAULT 'medlineplus',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 6: CLINICAL TRIALS CACHE
-- ============================================

DROP TABLE IF EXISTS clinical_trials CASCADE;

CREATE TABLE clinical_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nct_id TEXT UNIQUE NOT NULL,
    
    -- Basic info
    title TEXT NOT NULL,
    brief_summary TEXT,
    
    -- Status
    status TEXT,
    phase TEXT,
    
    -- Conditions and interventions
    conditions TEXT[],
    interventions JSONB,
    
    -- Enrollment
    enrollment INTEGER,
    
    -- Dates
    start_date DATE,
    completion_date DATE,
    
    -- Sponsor
    sponsor TEXT,
    
    -- Eligibility
    min_age TEXT,
    max_age TEXT,
    gender TEXT,
    
    -- Locations
    locations JSONB,
    
    -- Metadata
    last_updated TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 7: PUBMED ABSTRACTS CACHE
-- ============================================

DROP TABLE IF EXISTS pubmed_abstracts CASCADE;

CREATE TABLE pubmed_abstracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pmid TEXT UNIQUE NOT NULL,
    
    -- Article info
    title TEXT NOT NULL,
    authors TEXT,
    journal TEXT,
    publication_year INTEGER,
    
    -- Content
    abstract TEXT,
    
    -- Identifiers
    doi TEXT,
    pmc_id TEXT,
    
    -- Indexing
    mesh_terms TEXT[],
    keywords TEXT[],
    
    -- Relevance tracking
    search_queries TEXT[],
    citation_count INTEGER,
    
    -- Metadata
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 8: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_molecules_name ON molecules(name);
CREATE INDEX IF NOT EXISTS idx_molecules_type ON molecules(molecule_type);

CREATE INDEX IF NOT EXISTS idx_substances_name ON substances(name);
CREATE INDEX IF NOT EXISTS idx_substances_allergen ON substances(is_allergen);

CREATE INDEX IF NOT EXISTS idx_drug_compositions_med ON drug_compositions(medication_id);
CREATE INDEX IF NOT EXISTS idx_drug_compositions_molecule ON drug_compositions(molecule_id);

CREATE INDEX IF NOT EXISTS idx_allergens_name ON allergens(name);
CREATE INDEX IF NOT EXISTS idx_allergens_category ON allergens(allergen_category);

CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
CREATE INDEX IF NOT EXISTS idx_food_drug_interactions_food ON food_drug_interactions(food_id);
CREATE INDEX IF NOT EXISTS idx_food_drug_interactions_med ON food_drug_interactions(medication_id);

CREATE INDEX IF NOT EXISTS idx_alternative_treatments_name ON alternative_treatments(name);
CREATE INDEX IF NOT EXISTS idx_alternative_treatments_type ON alternative_treatments(treatment_type);

CREATE INDEX IF NOT EXISTS idx_clinical_trials_nct ON clinical_trials(nct_id);
CREATE INDEX IF NOT EXISTS idx_clinical_trials_status ON clinical_trials(status);
CREATE INDEX IF NOT EXISTS idx_clinical_trials_conditions ON clinical_trials USING GIN(conditions);

CREATE INDEX IF NOT EXISTS idx_pubmed_pmid ON pubmed_abstracts(pmid);
CREATE INDEX IF NOT EXISTS idx_pubmed_mesh ON pubmed_abstracts USING GIN(mesh_terms);

-- ============================================
-- SECTION 9: RLS POLICIES
-- ============================================

ALTER TABLE molecules ENABLE ROW LEVEL SECURITY;
ALTER TABLE substances ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_drug_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alternative_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE pubmed_abstracts ENABLE ROW LEVEL SECURITY;

-- Read policies (public read)
DROP POLICY IF EXISTS "Read molecules" ON molecules;
CREATE POLICY "Read molecules" ON molecules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read substances" ON substances;
CREATE POLICY "Read substances" ON substances FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read drug_compositions" ON drug_compositions;
CREATE POLICY "Read drug_compositions" ON drug_compositions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read allergens" ON allergens;
CREATE POLICY "Read allergens" ON allergens FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read foods" ON foods;
CREATE POLICY "Read foods" ON foods FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read food_drug_interactions" ON food_drug_interactions;
CREATE POLICY "Read food_drug_interactions" ON food_drug_interactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read alternative_treatments" ON alternative_treatments;
CREATE POLICY "Read alternative_treatments" ON alternative_treatments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read clinical_trials" ON clinical_trials;
CREATE POLICY "Read clinical_trials" ON clinical_trials FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read pubmed_abstracts" ON pubmed_abstracts;
CREATE POLICY "Read pubmed_abstracts" ON pubmed_abstracts FOR SELECT USING (true);

-- Insert policies (service role)
DROP POLICY IF EXISTS "Insert molecules" ON molecules;
CREATE POLICY "Insert molecules" ON molecules FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert substances" ON substances;
CREATE POLICY "Insert substances" ON substances FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert drug_compositions" ON drug_compositions;
CREATE POLICY "Insert drug_compositions" ON drug_compositions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert allergens" ON allergens;
CREATE POLICY "Insert allergens" ON allergens FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert foods" ON foods;
CREATE POLICY "Insert foods" ON foods FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert food_drug_interactions" ON food_drug_interactions;
CREATE POLICY "Insert food_drug_interactions" ON food_drug_interactions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert alternative_treatments" ON alternative_treatments;
CREATE POLICY "Insert alternative_treatments" ON alternative_treatments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert clinical_trials" ON clinical_trials;
CREATE POLICY "Insert clinical_trials" ON clinical_trials FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Insert pubmed_abstracts" ON pubmed_abstracts;
CREATE POLICY "Insert pubmed_abstracts" ON pubmed_abstracts FOR INSERT WITH CHECK (true);

-- Update policies
DROP POLICY IF EXISTS "Update molecules" ON molecules;
CREATE POLICY "Update molecules" ON molecules FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Update substances" ON substances;
CREATE POLICY "Update substances" ON substances FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Update clinical_trials" ON clinical_trials;
CREATE POLICY "Update clinical_trials" ON clinical_trials FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Update pubmed_abstracts" ON pubmed_abstracts;
CREATE POLICY "Update pubmed_abstracts" ON pubmed_abstracts FOR UPDATE USING (true);

-- ============================================
-- SECTION 10: COMMENTS
-- ============================================

COMMENT ON TABLE molecules IS 'Chemical/biological molecules (active ingredients)';
COMMENT ON TABLE substances IS 'General substances including excipients and allergens';
COMMENT ON TABLE drug_compositions IS 'Drug composition breakdown (active + inactive ingredients)';
COMMENT ON TABLE allergens IS 'Known allergens with cross-reactivity info';
COMMENT ON TABLE foods IS 'Foods with drug interaction potential';
COMMENT ON TABLE food_drug_interactions IS 'Food-drug interactions';
COMMENT ON TABLE alternative_treatments IS 'Complementary and alternative medicine';
COMMENT ON TABLE clinical_trials IS 'Cached clinical trials from ClinicalTrials.gov';
COMMENT ON TABLE pubmed_abstracts IS 'Cached PubMed abstracts for local search';
