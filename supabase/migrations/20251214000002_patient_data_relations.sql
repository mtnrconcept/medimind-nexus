-- =====================================================
-- Patient Data Relations - Junction Tables
-- =====================================================
-- Creates tables to link patients with medications, 
-- pathologies, allergies, vaccinations, and symptoms
-- =====================================================

-- =====================================================
-- PATIENT MEDICATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
    dosage TEXT,
    frequency TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    prescribed_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(patient_id, medication_id)
);

-- =====================================================
-- PATIENT PATHOLOGIES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_pathologies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    pathology_id UUID NOT NULL REFERENCES public.pathologies(id) ON DELETE CASCADE,
    diagnosis_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'chronic', 'in_remission')),
    diagnosed_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(patient_id, pathology_id)
);

-- =====================================================
-- PATIENT ALLERGIES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    allergen TEXT NOT NULL,
    allergen_type TEXT CHECK (allergen_type IN ('medication', 'food', 'environmental', 'insect', 'latex', 'other')),
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
    reaction TEXT,
    first_reaction_date DATE,
    verified BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT VACCINATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_vaccinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    vaccine_name TEXT NOT NULL,
    vaccine_type TEXT,
    vaccination_date DATE NOT NULL,
    booster_date DATE,
    lot_number TEXT,
    administered_by TEXT,
    site TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT SYMPTOMS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    symptom_id UUID REFERENCES public.symptoms(id) ON DELETE SET NULL,
    symptom_name TEXT NOT NULL, -- Allow custom symptoms
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe')),
    onset_date DATE,
    frequency TEXT,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_patient_medications_patient ON public.patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_medication ON public.patient_medications(medication_id);
CREATE INDEX IF NOT EXISTS idx_patient_pathologies_patient ON public.patient_pathologies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_pathologies_pathology ON public.patient_pathologies(pathology_id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON public.patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_vaccinations_patient ON public.patient_vaccinations(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_symptoms_patient ON public.patient_symptoms(patient_id);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_patient_medications_updated_at ON public.patient_medications;
CREATE TRIGGER update_patient_medications_updated_at
    BEFORE UPDATE ON public.patient_medications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_pathologies_updated_at ON public.patient_pathologies;
CREATE TRIGGER update_patient_pathologies_updated_at
    BEFORE UPDATE ON public.patient_pathologies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_allergies_updated_at ON public.patient_allergies;
CREATE TRIGGER update_patient_allergies_updated_at
    BEFORE UPDATE ON public.patient_allergies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_vaccinations_updated_at ON public.patient_vaccinations;
CREATE TRIGGER update_patient_vaccinations_updated_at
    BEFORE UPDATE ON public.patient_vaccinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_symptoms_updated_at ON public.patient_symptoms;
CREATE TRIGGER update_patient_symptoms_updated_at
    BEFORE UPDATE ON public.patient_symptoms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_pathologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_symptoms ENABLE ROW LEVEL SECURITY;

-- Policies for patient_medications
CREATE POLICY "Allow authenticated users full access to patient_medications"
ON public.patient_medications FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policies for patient_pathologies
CREATE POLICY "Allow authenticated users full access to patient_pathologies"
ON public.patient_pathologies FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policies for patient_allergies
CREATE POLICY "Allow authenticated users full access to patient_allergies"
ON public.patient_allergies FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policies for patient_vaccinations
CREATE POLICY "Allow authenticated users full access to patient_vaccinations"
ON public.patient_vaccinations FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policies for patient_symptoms
CREATE POLICY "Allow authenticated users full access to patient_symptoms"
ON public.patient_symptoms FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.patient_medications IS 'Medications prescribed to each patient';
COMMENT ON TABLE public.patient_pathologies IS 'Diagnosed pathologies for each patient';
COMMENT ON TABLE public.patient_allergies IS 'Known allergies for each patient';
COMMENT ON TABLE public.patient_vaccinations IS 'Vaccination history for each patient';
COMMENT ON TABLE public.patient_symptoms IS 'Current and historical symptoms for each patient';
