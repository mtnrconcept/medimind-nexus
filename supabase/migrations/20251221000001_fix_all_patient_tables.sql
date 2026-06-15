-- =====================================================
-- FIX ALL PATIENT TABLES - DROP AND RECREATE
-- Run this in Supabase SQL Editor to fix schema mismatches
-- =====================================================

-- Create update trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- DROP EXISTING TABLES WITH WRONG SCHEMAS
-- =====================================================
DROP TABLE IF EXISTS public.patient_prevention CASCADE;
DROP TABLE IF EXISTS public.patient_medical_history CASCADE;
DROP TABLE IF EXISTS public.patient_mental_health CASCADE;
DROP TABLE IF EXISTS public.patient_reproductive_health CASCADE;
DROP TABLE IF EXISTS public.patient_functional_exams CASCADE;
DROP TABLE IF EXISTS public.patient_age_specific CASCADE;
DROP TABLE IF EXISTS public.patient_social_factors CASCADE;
DROP TABLE IF EXISTS public.patient_dental CASCADE;
DROP TABLE IF EXISTS public.patient_consultations CASCADE;
DROP TABLE IF EXISTS public.patient_communications CASCADE;
DROP TABLE IF EXISTS public.patient_monitoring CASCADE;

-- =====================================================
-- PATIENT MEDICAL HISTORY (Fixed schema)
-- =====================================================
CREATE TABLE public.patient_medical_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    -- Fields used by MedicalHistoryCard.tsx
    condition_type TEXT NOT NULL DEFAULT 'disease',
    condition_name TEXT NOT NULL,
    diagnosis_date DATE,
    resolution_date DATE,
    severity TEXT,
    treatment TEXT,
    notes TEXT,
    is_chronic BOOLEAN DEFAULT false,
    -- Optional extra fields
    category TEXT,
    title TEXT,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_ongoing BOOLEAN DEFAULT false,
    treating_facility TEXT,
    treating_physician TEXT,
    complications TEXT,
    icd_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT PREVENTION (Fixed schema)
-- =====================================================
CREATE TABLE public.patient_prevention (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    screening_type TEXT NOT NULL DEFAULT 'general_checkup',
    last_screening_date DATE,
    next_screening_date DATE,
    next_due_date DATE,
    result TEXT,
    result_status TEXT,
    is_normal BOOLEAN DEFAULT true,
    frequency_months INTEGER DEFAULT 12,
    follow_up_needed BOOLEAN DEFAULT false,
    follow_up_notes TEXT,
    performing_facility TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT MENTAL HEALTH (Fixed schema)
-- =====================================================
CREATE TABLE public.patient_mental_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL DEFAULT 'mood_check',
    mood_score INTEGER,
    anxiety_level INTEGER,
    sleep_quality INTEGER,
    energy_level INTEGER,
    diagnosis TEXT,
    icd_code TEXT,
    severity TEXT,
    therapist_name TEXT,
    therapy_type TEXT,
    therapy_frequency TEXT,
    session_count INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT REPRODUCTIVE HEALTH (Fixed schema)
-- =====================================================
CREATE TABLE public.patient_reproductive_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL DEFAULT 'cycle',
    pregnancy_status TEXT,
    due_date DATE,
    gestational_weeks INTEGER,
    pregnancy_outcome TEXT,
    birth_type TEXT,
    complications TEXT,
    cycle_start DATE,
    cycle_length INTEGER,
    flow_intensity TEXT,
    cycle_regularity TEXT,
    pms_symptoms TEXT[],
    contraception_method TEXT,
    start_date DATE,
    end_date DATE,
    fertility_treatment TEXT,
    ivf_cycles INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT FUNCTIONAL EXAMS (Fixed schema)
-- =====================================================
CREATE TABLE public.patient_functional_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    exam_type TEXT NOT NULL DEFAULT 'ecg',
    indication TEXT,
    findings TEXT,
    conclusion TEXT,
    performing_physician TEXT,
    physician TEXT,
    facility TEXT,
    is_normal BOOLEAN DEFAULT true,
    is_abnormal BOOLEAN DEFAULT false,
    document_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT AGE SPECIFIC (Fixed schema)
-- =====================================================
CREATE TABLE public.patient_age_specific (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL DEFAULT 'growth',
    height_percentile INTEGER,
    weight_percentile INTEGER,
    head_circumference_cm DECIMAL(5,1),
    developmental_milestones JSONB,
    school_performance TEXT,
    behavioral_concerns TEXT,
    fall_risk_score INTEGER,
    cognitive_score INTEGER,
    cognitive_test_type TEXT DEFAULT 'MMS',
    adl_score INTEGER,
    iadl_score INTEGER,
    frailty_index DECIMAL(3,2),
    polypharmacy_risk TEXT DEFAULT 'low',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT SOCIAL FACTORS
-- =====================================================
CREATE TABLE public.patient_social_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    housing_status TEXT,
    housing_type TEXT,
    living_alone BOOLEAN DEFAULT false,
    floor_level INTEGER,
    elevator_access BOOLEAN,
    home_adaptations TEXT[],
    employment_status TEXT,
    occupation TEXT,
    employer TEXT,
    work_hours_weekly INTEGER,
    education_level TEXT,
    has_family_support BOOLEAN DEFAULT true,
    has_caregiver BOOLEAN DEFAULT false,
    caregiver_name TEXT,
    caregiver_relationship TEXT,
    has_transportation BOOLEAN DEFAULT true,
    mobility_issues BOOLEAN DEFAULT false,
    uses_mobility_aid BOOLEAN DEFAULT false,
    mobility_aid_type TEXT,
    financial_difficulties BOOLEAN DEFAULT false,
    has_health_insurance BOOLEAN DEFAULT true,
    receives_benefits BOOLEAN DEFAULT false,
    benefit_types TEXT[],
    is_isolated BOOLEAN DEFAULT false,
    language_barriers BOOLEAN DEFAULT false,
    primary_language TEXT DEFAULT 'fr',
    interpreter_needed BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT DENTAL
-- =====================================================
CREATE TABLE public.patient_dental (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL DEFAULT 'checkup',
    procedure TEXT,
    tooth_numbers TEXT,
    dentist_name TEXT,
    facility TEXT,
    next_appointment DATE,
    cost DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT CONSULTATIONS
-- =====================================================
CREATE TABLE public.patient_consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    consultation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    specialty TEXT NOT NULL DEFAULT 'general',
    physician_name TEXT NOT NULL DEFAULT 'Non spécifié',
    facility TEXT,
    reason TEXT,
    diagnosis TEXT,
    treatment_plan TEXT,
    prescriptions TEXT,
    follow_up_date DATE,
    follow_up_notes TEXT,
    document_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT COMMUNICATIONS
-- =====================================================
CREATE TABLE public.patient_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    communication_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    communication_type TEXT NOT NULL DEFAULT 'email_in',
    sender TEXT,
    recipient TEXT,
    subject TEXT,
    content TEXT,
    urgency TEXT DEFAULT 'routine',
    status TEXT DEFAULT 'pending',
    related_consultation_id UUID,
    document_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT MONITORING
-- =====================================================
CREATE TABLE public.patient_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    monitoring_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monitoring_type TEXT NOT NULL DEFAULT 'blood_pressure',
    value DECIMAL(12,4),
    value_unit TEXT,
    secondary_value DECIMAL(12,4),
    secondary_unit TEXT,
    is_within_target BOOLEAN,
    target_min DECIMAL(12,4),
    target_max DECIMAL(12,4),
    source TEXT DEFAULT 'self_reported',
    device_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ENABLE RLS AND CREATE POLICIES
-- =====================================================
ALTER TABLE public.patient_medical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_prevention ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_mental_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_reproductive_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_functional_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_age_specific ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_social_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_dental ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_monitoring ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "auth_medical_history" ON public.patient_medical_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_prevention" ON public.patient_prevention FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_mental_health" ON public.patient_mental_health FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_reproductive_health" ON public.patient_reproductive_health FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_functional_exams" ON public.patient_functional_exams FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_age_specific" ON public.patient_age_specific FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_social_factors" ON public.patient_social_factors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_dental" ON public.patient_dental FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_consultations" ON public.patient_consultations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_communications" ON public.patient_communications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_monitoring" ON public.patient_monitoring FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- CREATE INDEXES
-- =====================================================
CREATE INDEX idx_medical_history_patient ON public.patient_medical_history(patient_id);
CREATE INDEX idx_prevention_patient ON public.patient_prevention(patient_id);
CREATE INDEX idx_mental_health_patient ON public.patient_mental_health(patient_id);
CREATE INDEX idx_reproductive_health_patient ON public.patient_reproductive_health(patient_id);
CREATE INDEX idx_functional_exams_patient ON public.patient_functional_exams(patient_id);
CREATE INDEX idx_age_specific_patient ON public.patient_age_specific(patient_id);
CREATE INDEX idx_social_factors_patient ON public.patient_social_factors(patient_id);
CREATE INDEX idx_dental_patient ON public.patient_dental(patient_id);
CREATE INDEX idx_consultations_patient ON public.patient_consultations(patient_id);
CREATE INDEX idx_communications_patient ON public.patient_communications(patient_id);
CREATE INDEX idx_monitoring_patient ON public.patient_monitoring(patient_id);

-- Done!
SELECT 'All patient dossier tables recreated with correct schemas!' AS status;
