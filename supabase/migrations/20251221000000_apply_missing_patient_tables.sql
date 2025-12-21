-- =====================================================
-- APPLY MISSING PATIENT DOSSIER TABLES
-- Run this in Supabase SQL Editor if you get 400 errors
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
-- PATIENT PREVENTION
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_prevention (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    screening_type TEXT NOT NULL,
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
-- PATIENT MENTAL HEALTH
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_mental_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL DEFAULT 'mood_check',
    mood_score INTEGER CHECK (mood_score >= 1 AND mood_score <= 10),
    anxiety_level INTEGER CHECK (anxiety_level >= 1 AND anxiety_level <= 10),
    sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 10),
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
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
-- PATIENT REPRODUCTIVE HEALTH
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_reproductive_health (
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
-- PATIENT FUNCTIONAL EXAMS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_functional_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    exam_date DATE NOT NULL,
    exam_type TEXT NOT NULL DEFAULT 'ecg',
    indication TEXT,
    findings TEXT,
    conclusion TEXT,
    performing_physician TEXT,
    physician TEXT,
    facility TEXT,
    is_normal BOOLEAN,
    is_abnormal BOOLEAN DEFAULT false,
    document_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT AGE SPECIFIC
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_age_specific (
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
    cognitive_test_type TEXT,
    adl_score INTEGER,
    iadl_score INTEGER,
    frailty_index DECIMAL(3,2),
    polypharmacy_risk TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT SOCIAL FACTORS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_social_factors (
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
CREATE TABLE IF NOT EXISTS public.patient_dental (
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
CREATE TABLE IF NOT EXISTS public.patient_consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    consultation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    specialty TEXT NOT NULL DEFAULT 'general',
    physician_name TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS public.patient_communications (
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
CREATE TABLE IF NOT EXISTS public.patient_monitoring (
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

-- Drop existing policies if they exist, then create new ones
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "auth_patient_prevention" ON public.patient_prevention;
    DROP POLICY IF EXISTS "auth_patient_mental_health" ON public.patient_mental_health;
    DROP POLICY IF EXISTS "auth_patient_reproductive_health" ON public.patient_reproductive_health;
    DROP POLICY IF EXISTS "auth_patient_functional_exams" ON public.patient_functional_exams;
    DROP POLICY IF EXISTS "auth_patient_age_specific" ON public.patient_age_specific;
    DROP POLICY IF EXISTS "auth_patient_social_factors" ON public.patient_social_factors;
    DROP POLICY IF EXISTS "auth_patient_dental" ON public.patient_dental;
    DROP POLICY IF EXISTS "auth_patient_consultations" ON public.patient_consultations;
    DROP POLICY IF EXISTS "auth_patient_communications" ON public.patient_communications;
    DROP POLICY IF EXISTS "auth_patient_monitoring" ON public.patient_monitoring;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "auth_patient_prevention" ON public.patient_prevention FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_mental_health" ON public.patient_mental_health FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_reproductive_health" ON public.patient_reproductive_health FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_functional_exams" ON public.patient_functional_exams FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_age_specific" ON public.patient_age_specific FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_social_factors" ON public.patient_social_factors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_dental" ON public.patient_dental FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_consultations" ON public.patient_consultations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_communications" ON public.patient_communications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_patient_monitoring" ON public.patient_monitoring FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_patient_prevention_patient ON public.patient_prevention(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_mental_health_patient ON public.patient_mental_health(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_reproductive_health_patient ON public.patient_reproductive_health(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_functional_exams_patient ON public.patient_functional_exams(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_age_specific_patient ON public.patient_age_specific(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_social_factors_patient ON public.patient_social_factors(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_dental_patient ON public.patient_dental(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consultations_patient ON public.patient_consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_communications_patient ON public.patient_communications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_monitoring_patient ON public.patient_monitoring(patient_id);

-- Done!
SELECT 'All patient dossier tables created successfully!' AS status;
