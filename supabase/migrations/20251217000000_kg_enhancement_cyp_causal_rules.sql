-- Migration: Knowledge Graph Enhancement - CYP450 Enzymes and Causal Rules
-- Part of Phase 1: MediMind Nexus Hybrid AI Architecture

-- ============================================
-- SECTION 1: CYP450 Enzymes
-- ============================================

CREATE TABLE IF NOT EXISTS kg_enzymes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- CYP3A4, CYP2D6, CYP2C9, etc.
    full_name TEXT, -- Cytochrome P450 3A4
    gene_symbol TEXT, -- CYP3A4
    
    -- Clinical relevance
    clinical_significance TEXT, -- HIGH, MODERATE, LOW
    common_drug_interactions TEXT[], -- Quick reference
    
    -- Metabolic properties
    tissue_expression TEXT[], -- liver, intestine, kidney
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 2: Enzyme-Medication Relationships
-- ============================================

CREATE TABLE IF NOT EXISTS kg_enzyme_medication (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enzyme_id UUID NOT NULL REFERENCES kg_enzymes(id) ON DELETE CASCADE,
    medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
    medication_name TEXT NOT NULL, -- Backup if medication_id is null
    
    -- Relationship type
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'substrate',    -- Metabolized by this enzyme
        'inhibitor',    -- Inhibits this enzyme
        'inducer',      -- Induces this enzyme
        'substrate_major', -- Major metabolic pathway
        'substrate_minor'  -- Minor metabolic pathway
    )),
    
    -- Strength of effect
    effect_strength TEXT CHECK (effect_strength IN ('strong', 'moderate', 'weak')),
    
    -- Evidence
    evidence_level TEXT CHECK (evidence_level IN ('established', 'theoretical', 'case_report')),
    pmid TEXT[], -- PubMed references
    
    -- Clinical notes
    clinical_notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(enzyme_id, medication_id, relationship_type)
);

-- ============================================
-- SECTION 3: Causal Rules (BRAIN of the system)
-- ============================================

CREATE TABLE IF NOT EXISTS kg_causal_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source and target (flexible references)
    source_type TEXT NOT NULL CHECK (source_type IN ('pathology', 'medication', 'symptom', 'treatment', 'enzyme', 'lab_parameter')),
    source_id UUID,
    source_name TEXT NOT NULL,
    
    target_type TEXT NOT NULL CHECK (target_type IN ('pathology', 'medication', 'symptom', 'treatment', 'enzyme', 'lab_parameter', 'risk', 'action')),
    target_id UUID,
    target_name TEXT NOT NULL,
    
    -- Relationship semantics
    relation_type TEXT NOT NULL CHECK (relation_type IN (
        'CAUSE',           -- A causes B
        'AGGRAVE',         -- A worsens B
        'PROTEGE',         -- A protects against B
        'CONTRE_INDIQUE',  -- A is contraindicated with B
        'INHIBE',          -- A inhibits B
        'INDUIT',          -- A induces B
        'AUGMENTE_RISQUE', -- A increases risk of B
        'DIMINUE_RISQUE',  -- A decreases risk of B
        'TRAITE',          -- A treats B
        'NECESSITE_SURVEILLANCE', -- A requires monitoring B
        'AJUSTE_DOSE'      -- A requires dose adjustment for B
    )),
    
    -- Strength and direction
    strength TEXT NOT NULL CHECK (strength IN ('FORT', 'MODERE', 'FAIBLE', 'VARIABLE')),
    is_bidirectional BOOLEAN DEFAULT false,
    
    -- Conditions for rule application
    conditions JSONB DEFAULT '{}', -- e.g., {"age_min": 65, "renal_function_below": 30}
    
    -- Evidence and validation
    evidence_level TEXT NOT NULL CHECK (evidence_level IN (
        'META_ANALYSE',
        'RCT',
        'OBSERVATIONNEL',
        'CASE_REPORT',
        'EXPERT_OPINION',
        'PHARMACOLOGIQUE' -- Based on pharmacological principles
    )),
    pmid TEXT[], -- PubMed references
    doi TEXT[],  -- DOI references
    
    -- Validation status
    is_validated BOOLEAN DEFAULT false,
    validated_by UUID REFERENCES auth.users(id),
    validated_at TIMESTAMPTZ,
    
    -- Clinical action
    recommended_action TEXT, -- What clinician should do
    urgency TEXT CHECK (urgency IN ('IMMEDIATE', 'URGENT', 'ROUTINE', 'INFORMATION')),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    source_database TEXT -- 'drugbank', 'sider', 'manual', 'pubmed'
);

-- ============================================
-- SECTION 4: Population Factors
-- ============================================

CREATE TABLE IF NOT EXISTS kg_population_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Factor definition
    factor_type TEXT NOT NULL CHECK (factor_type IN (
        'AGE_PEDIATRIC',    -- < 18 years
        'AGE_GERIATRIC',    -- >= 65 years
        'PREGNANCY',
        'LACTATION',
        'RENAL_IMPAIRMENT',
        'HEPATIC_IMPAIRMENT',
        'GENETIC_POLYMORPHISM',
        'WEIGHT_OBESE',
        'WEIGHT_UNDERWEIGHT'
    )),
    
    -- Threshold values (stored in JSONB for flexibility)
    thresholds JSONB, -- e.g., {"min": 0, "max": 18} for pediatric, {"egfr_below": 30} for renal
    
    -- Affected entities
    affected_medication_ids UUID[],
    affected_pathology_ids UUID[],
    
    -- Modification to apply
    modification_type TEXT NOT NULL CHECK (modification_type IN (
        'CONTRE_INDICATION',
        'REDUCTION_DOSE',
        'AUGMENTATION_DOSE',
        'SURVEILLANCE_RENFORCEE',
        'ALTERNATIVE_RECOMMANDEE',
        'PRUDENCE'
    )),
    
    modification_details TEXT, -- "Réduire la dose de 50%"
    
    -- Evidence
    evidence_level TEXT,
    pmid TEXT[],
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 5: Indexes for Performance
-- ============================================

CREATE INDEX idx_kg_enzymes_name ON kg_enzymes(name);
CREATE INDEX idx_kg_enzyme_medication_enzyme ON kg_enzyme_medication(enzyme_id);
CREATE INDEX idx_kg_enzyme_medication_med ON kg_enzyme_medication(medication_id);
CREATE INDEX idx_kg_enzyme_medication_type ON kg_enzyme_medication(relationship_type);

CREATE INDEX idx_kg_causal_rules_source ON kg_causal_rules(source_type, source_name);
CREATE INDEX idx_kg_causal_rules_target ON kg_causal_rules(target_type, target_name);
CREATE INDEX idx_kg_causal_rules_relation ON kg_causal_rules(relation_type);
CREATE INDEX idx_kg_causal_rules_validated ON kg_causal_rules(is_validated);

CREATE INDEX idx_kg_population_factors_type ON kg_population_factors(factor_type);

-- ============================================
-- SECTION 6: RLS Policies
-- ============================================

ALTER TABLE kg_enzymes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kg_enzyme_medication ENABLE ROW LEVEL SECURITY;
ALTER TABLE kg_causal_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE kg_population_factors ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Users can read kg_enzymes" ON kg_enzymes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can read kg_enzyme_medication" ON kg_enzyme_medication FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can read kg_causal_rules" ON kg_causal_rules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can read kg_population_factors" ON kg_population_factors FOR SELECT USING (auth.uid() IS NOT NULL);

-- System insert (via service role)
CREATE POLICY "Service can insert kg_enzymes" ON kg_enzymes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert kg_enzyme_medication" ON kg_enzyme_medication FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert kg_causal_rules" ON kg_causal_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can insert kg_population_factors" ON kg_population_factors FOR INSERT WITH CHECK (true);

-- Users can validate rules
CREATE POLICY "Users can update kg_causal_rules" ON kg_causal_rules FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ============================================
-- SECTION 7: Seed Data - Major CYP Enzymes
-- ============================================

INSERT INTO kg_enzymes (name, full_name, gene_symbol, clinical_significance, common_drug_interactions, tissue_expression) VALUES
('CYP3A4', 'Cytochrome P450 3A4', 'CYP3A4', 'HIGH', 
 ARRAY['clarithromycine', 'itraconazole', 'ritonavir', 'pamplemousse', 'millepertuis'],
 ARRAY['foie', 'intestin']),
 
('CYP2D6', 'Cytochrome P450 2D6', 'CYP2D6', 'HIGH',
 ARRAY['fluoxétine', 'paroxétine', 'quinidine', 'bupropion'],
 ARRAY['foie']),
 
('CYP2C9', 'Cytochrome P450 2C9', 'CYP2C9', 'HIGH',
 ARRAY['fluconazole', 'amiodarone', 'fluvastatine'],
 ARRAY['foie']),
 
('CYP2C19', 'Cytochrome P450 2C19', 'CYP2C19', 'MODERATE',
 ARRAY['oméprazole', 'fluconazole', 'fluvoxamine'],
 ARRAY['foie']),
 
('CYP1A2', 'Cytochrome P450 1A2', 'CYP1A2', 'MODERATE',
 ARRAY['ciprofloxacine', 'fluvoxamine', 'tabac', 'caféine'],
 ARRAY['foie']),
 
('CYP2B6', 'Cytochrome P450 2B6', 'CYP2B6', 'MODERATE',
 ARRAY['rifampicine', 'éfavirenz'],
 ARRAY['foie']),
 
('CYP2E1', 'Cytochrome P450 2E1', 'CYP2E1', 'MODERATE',
 ARRAY['isoniazide', 'alcool'],
 ARRAY['foie'])
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- SECTION 8: Seed Data - Critical Causal Rules
-- ============================================

INSERT INTO kg_causal_rules (source_type, source_name, target_type, target_name, relation_type, strength, evidence_level, recommended_action, urgency) VALUES
-- Renal impairment rules
('pathology', 'Insuffisance rénale chronique', 'medication', 'AINS (ibuprofène, naproxène)', 'CONTRE_INDIQUE', 'FORT', 'META_ANALYSE', 'Éviter les AINS - risque d''aggravation de la fonction rénale', 'URGENT'),
('pathology', 'Insuffisance rénale chronique', 'medication', 'Metformine', 'NECESSITE_SURVEILLANCE', 'FORT', 'RCT', 'Ajuster la dose selon DFG, contre-indiqué si DFG < 30', 'ROUTINE'),
('pathology', 'Insuffisance rénale chronique', 'medication', 'Aminosides', 'CONTRE_INDIQUE', 'FORT', 'META_ANALYSE', 'Éviter ou adapter dose - néphrotoxicité', 'URGENT'),

-- Liver impairment rules
('pathology', 'Insuffisance hépatique', 'medication', 'Paracétamol', 'AJUSTE_DOSE', 'MODERE', 'OBSERVATIONNEL', 'Réduire la dose maximale à 2g/jour', 'ROUTINE'),
('pathology', 'Insuffisance hépatique', 'medication', 'Statines', 'NECESSITE_SURVEILLANCE', 'MODERE', 'RCT', 'Surveillance des transaminases', 'ROUTINE'),

-- Pregnancy rules
('pathology', 'Grossesse', 'medication', 'AINS', 'CONTRE_INDIQUE', 'FORT', 'META_ANALYSE', 'Contre-indiqué au 3e trimestre - risque de fermeture prématurée du canal artériel', 'IMMEDIATE'),
('pathology', 'Grossesse', 'medication', 'IEC/ARA2', 'CONTRE_INDIQUE', 'FORT', 'META_ANALYSE', 'Contre-indiqué aux 2e et 3e trimestres - foetotoxicité', 'IMMEDIATE'),
('pathology', 'Grossesse', 'medication', 'Warfarine', 'CONTRE_INDIQUE', 'FORT', 'OBSERVATIONNEL', 'Tératogène - utiliser HBPM', 'IMMEDIATE'),

-- Drug-drug interactions via CYP
('medication', 'Clarithromycine', 'enzyme', 'CYP3A4', 'INHIBE', 'FORT', 'RCT', 'Surveiller les substrats CYP3A4 - risque de surdosage', 'URGENT'),
('medication', 'Rifampicine', 'enzyme', 'CYP3A4', 'INDUIT', 'FORT', 'RCT', 'Surveiller les substrats CYP3A4 - risque de sous-dosage', 'URGENT'),
('medication', 'Fluoxétine', 'enzyme', 'CYP2D6', 'INHIBE', 'FORT', 'RCT', 'Surveiller les substrats CYP2D6 (codéine, tramadol, etc.)', 'ROUTINE'),

-- Causal pathology chains
('pathology', 'Diabète type 2', 'pathology', 'Néphropathie diabétique', 'AUGMENTE_RISQUE', 'FORT', 'META_ANALYSE', 'Surveillance fonction rénale annuelle', 'ROUTINE'),
('pathology', 'Diabète type 2', 'pathology', 'Rétinopathie diabétique', 'AUGMENTE_RISQUE', 'FORT', 'META_ANALYSE', 'Examen ophtalmologique annuel', 'ROUTINE'),
('pathology', 'Hypertension artérielle', 'pathology', 'AVC', 'AUGMENTE_RISQUE', 'FORT', 'META_ANALYSE', 'Contrôle tensionnel strict', 'ROUTINE'),

-- Syndrome néphrotique specific
('pathology', 'Syndrome néphrotique', 'symptom', 'Œdèmes', 'CAUSE', 'FORT', 'PHARMACOLOGIQUE', 'Rechercher protéinurie si œdèmes', 'ROUTINE'),
('pathology', 'Syndrome néphrotique', 'pathology', 'Thrombose veineuse', 'AUGMENTE_RISQUE', 'FORT', 'OBSERVATIONNEL', 'Anticoagulation prophylactique selon albumine', 'URGENT'),
('medication', 'Prednisolone', 'pathology', 'Syndrome néphrotique', 'TRAITE', 'FORT', 'RCT', 'Traitement de première ligne', 'ROUTINE');

-- ============================================
-- SECTION 9: Comments
-- ============================================

COMMENT ON TABLE kg_enzymes IS 'CYP450 enzymes for drug metabolism tracking';
COMMENT ON TABLE kg_enzyme_medication IS 'Relationships between enzymes and medications (substrate/inhibitor/inducer)';
COMMENT ON TABLE kg_causal_rules IS 'Explicit causal rules for medical reasoning - BRAIN of the system';
COMMENT ON TABLE kg_population_factors IS 'Population-specific factors affecting drug therapy';
