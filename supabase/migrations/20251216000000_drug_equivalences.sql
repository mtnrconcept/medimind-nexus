-- Migration: Drug Equivalences and Switch Protocols
-- Created: 2025-12-16

-- Table for storing drug equivalence data (benzodiazepines, antipsychotics, opioids, etc.)
CREATE TABLE IF NOT EXISTS drug_equivalences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- 'benzodiazepine', 'antipsychotic', 'opioid', 'antidepressant'
    drug_name TEXT NOT NULL,
    equivalent_dose DECIMAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'mg',
    reference_drug TEXT NOT NULL, -- ex: 'diazepam' for benzos
    reference_dose DECIMAL NOT NULL DEFAULT 10,
    half_life_hours DECIMAL,
    half_life_range TEXT, -- "6-12" for display
    bioavailability DECIMAL, -- percentage 0-100
    onset TEXT, -- 'rapid', 'intermediate', 'slow'
    duration TEXT, -- 'short', 'intermediate', 'long'
    active_metabolites BOOLEAN DEFAULT false,
    notes TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(category, drug_name)
);

-- Table for storing switch protocols between drugs
CREATE TABLE IF NOT EXISTS drug_switch_protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- 'benzodiazepine', 'antipsychotic', 'opioid', 'antidepressant'
    from_drug TEXT NOT NULL,
    to_drug TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'cross-taper', -- 'cross-taper', 'direct', 'plateau', 'gradual'
    duration_weeks INTEGER,
    schedule JSONB, -- [{week: 1, from_pct: 100, to_pct: 25}, ...]
    withdrawal_risks JSONB, -- ["insomnia", "anxiety", "seizures"]
    rebound_effects JSONB,
    receptor_comparison JSONB, -- {D2: {from: 0.8, to: 0.2}, 5HT2A: {...}}
    clinical_notes TEXT,
    contraindications TEXT[],
    source_url TEXT,
    evidence_level TEXT, -- 'high', 'moderate', 'low', 'expert_opinion'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(category, from_drug, to_drug)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_drug_equivalences_category ON drug_equivalences(category);
CREATE INDEX IF NOT EXISTS idx_drug_equivalences_drug_name ON drug_equivalences(drug_name);
CREATE INDEX IF NOT EXISTS idx_drug_switch_protocols_category ON drug_switch_protocols(category);
CREATE INDEX IF NOT EXISTS idx_drug_switch_protocols_from_drug ON drug_switch_protocols(from_drug);
CREATE INDEX IF NOT EXISTS idx_drug_switch_protocols_to_drug ON drug_switch_protocols(to_drug);

-- Enable RLS
ALTER TABLE drug_equivalences ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_switch_protocols ENABLE ROW LEVEL SECURITY;

-- RLS policies (read-only for authenticated users, service role for write)
CREATE POLICY "Allow authenticated read on drug_equivalences"
    ON drug_equivalences FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow service role full access on drug_equivalences"
    ON drug_equivalences FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated read on drug_switch_protocols"
    ON drug_switch_protocols FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow service role full access on drug_switch_protocols"
    ON drug_switch_protocols FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Seed initial benzodiazepine equivalences (based on ClinCalc.com)
-- Reference: Diazepam 10mg oral as standard
INSERT INTO drug_equivalences (category, drug_name, equivalent_dose, unit, reference_drug, reference_dose, half_life_hours, half_life_range, onset, duration, active_metabolites, notes) VALUES
('benzodiazepine', 'Diazepam', 10, 'mg', 'diazepam', 10, 100, '20-100', 'rapid', 'long', true, 'Reference drug. Active metabolites: desmethyldiazepam, temazepam, oxazepam.'),
('benzodiazepine', 'Alprazolam', 0.5, 'mg', 'diazepam', 10, 11, '6-12', 'intermediate', 'short', false, 'Short half-life, high potency.'),
('benzodiazepine', 'Bromazepam', 6, 'mg', 'diazepam', 10, 20, '10-20', 'intermediate', 'intermediate', false, 'Available in Europe.'),
('benzodiazepine', 'Chlordiazepoxide', 25, 'mg', 'diazepam', 10, 100, '5-30', 'intermediate', 'long', true, 'First benzodiazepine marketed. Active metabolites.'),
('benzodiazepine', 'Clonazepam', 0.5, 'mg', 'diazepam', 10, 34, '18-50', 'slow', 'long', false, 'Often used for seizures and panic disorder.'),
('benzodiazepine', 'Clorazepate', 15, 'mg', 'diazepam', 10, 100, '36-200', 'rapid', 'long', true, 'Prodrug converted to desmethyldiazepam.'),
('benzodiazepine', 'Flurazepam', 30, 'mg', 'diazepam', 10, 100, '40-250', 'rapid', 'long', true, 'Hypnotic. Very long half-life.'),
('benzodiazepine', 'Lorazepam', 1, 'mg', 'diazepam', 10, 14, '10-20', 'intermediate', 'intermediate', false, 'No active metabolites. Preferred in liver disease.'),
('benzodiazepine', 'Midazolam', 7.5, 'mg', 'diazepam', 10, 2, '1.5-2.5', 'rapid', 'short', false, 'IV/IM form available. Very short half-life.'),
('benzodiazepine', 'Nitrazepam', 10, 'mg', 'diazepam', 10, 26, '15-38', 'slow', 'long', false, 'Hypnotic benzodiazepine.'),
('benzodiazepine', 'Oxazepam', 20, 'mg', 'diazepam', 10, 7, '4-15', 'slow', 'short', false, 'No active metabolites. Slower onset.'),
('benzodiazepine', 'Temazepam', 20, 'mg', 'diazepam', 10, 11, '8-22', 'intermediate', 'intermediate', false, 'Hypnotic. No active metabolites.'),
('benzodiazepine', 'Triazolam', 0.25, 'mg', 'diazepam', 10, 2, '1.5-5.5', 'rapid', 'short', false, 'Ultra-short acting hypnotic.')
ON CONFLICT (category, drug_name) DO NOTHING;

-- Seed initial antipsychotic equivalences (chlorpromazine 100mg as reference)
INSERT INTO drug_equivalences (category, drug_name, equivalent_dose, unit, reference_drug, reference_dose, half_life_hours, onset, notes) VALUES
('antipsychotic', 'Chlorpromazine', 100, 'mg', 'chlorpromazine', 100, 30, 'intermediate', 'Reference typical antipsychotic.'),
('antipsychotic', 'Haloperidol', 2, 'mg', 'chlorpromazine', 100, 20, 'intermediate', 'High-potency typical. High D2 affinity.'),
('antipsychotic', 'Risperidone', 2, 'mg', 'chlorpromazine', 100, 20, 'intermediate', 'Atypical. 5-HT2A/D2 antagonist.'),
('antipsychotic', 'Olanzapine', 5, 'mg', 'chlorpromazine', 100, 30, 'intermediate', 'Atypical. Metabolic side effects.'),
('antipsychotic', 'Quetiapine', 75, 'mg', 'chlorpromazine', 100, 7, 'rapid', 'Low D2 affinity. Sedating.'),
('antipsychotic', 'Aripiprazole', 7.5, 'mg', 'chlorpromazine', 100, 75, 'slow', 'Partial D2 agonist. Less sedating.'),
('antipsychotic', 'Ziprasidone', 60, 'mg', 'chlorpromazine', 100, 7, 'intermediate', 'QTc prolongation risk.'),
('antipsychotic', 'Paliperidone', 3, 'mg', 'chlorpromazine', 100, 23, 'intermediate', 'Active metabolite of risperidone.'),
('antipsychotic', 'Lurasidone', 40, 'mg', 'chlorpromazine', 100, 18, 'intermediate', 'Take with food.'),
('antipsychotic', 'Clozapine', 50, 'mg', 'chlorpromazine', 100, 12, 'intermediate', 'Reserved for treatment-resistant cases. Agranulocytosis risk.'),
('antipsychotic', 'Amisulpride', 200, 'mg', 'chlorpromazine', 100, 12, 'intermediate', 'Selective D2/D3 antagonist.')
ON CONFLICT (category, drug_name) DO NOTHING;

COMMENT ON TABLE drug_equivalences IS 'Stores drug equivalence data for switch calculations. Reference doses allow conversion between drugs in the same category.';
COMMENT ON TABLE drug_switch_protocols IS 'Stores protocols for switching between drugs, including schedules and risk information.';
