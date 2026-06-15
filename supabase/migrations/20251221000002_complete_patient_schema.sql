-- =====================================================
-- COMPLETE PATIENT DATABASE SCHEMA
-- Run this in Supabase SQL Editor to fix ALL tables
-- =====================================================

-- Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- DROP ALL PATIENT TABLES TO RECREATE CLEANLY
-- =====================================================
DROP TABLE IF EXISTS public.patient_prevention CASCADE;
DROP TABLE IF EXISTS public.patient_medical_history CASCADE;
DROP TABLE IF EXISTS public.patient_family_history CASCADE;
DROP TABLE IF EXISTS public.patient_mental_health CASCADE;
DROP TABLE IF EXISTS public.patient_reproductive_health CASCADE;
DROP TABLE IF EXISTS public.patient_functional_exams CASCADE;
DROP TABLE IF EXISTS public.patient_age_specific CASCADE;
DROP TABLE IF EXISTS public.patient_social_factors CASCADE;
DROP TABLE IF EXISTS public.patient_dental CASCADE;
DROP TABLE IF EXISTS public.patient_consultations CASCADE;
DROP TABLE IF EXISTS public.patient_communications CASCADE;
DROP TABLE IF EXISTS public.patient_monitoring CASCADE;
DROP TABLE IF EXISTS public.patient_allergies CASCADE;
DROP TABLE IF EXISTS public.patient_vaccinations CASCADE;
DROP TABLE IF EXISTS public.patient_lifestyle CASCADE;
DROP TABLE IF EXISTS public.patient_lab_results CASCADE;
DROP TABLE IF EXISTS public.patient_imaging CASCADE;
DROP TABLE IF EXISTS public.patient_clinical_data CASCADE;

-- =====================================================
-- PATIENT MEDICAL HISTORY
-- =====================================================
CREATE TABLE public.patient_medical_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    condition_type TEXT NOT NULL DEFAULT 'disease',
    condition_name TEXT NOT NULL,
    diagnosis_date DATE,
    resolution_date DATE,
    severity TEXT,
    treatment TEXT,
    notes TEXT,
    is_chronic BOOLEAN DEFAULT false,
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
-- PATIENT FAMILY HISTORY
-- =====================================================
CREATE TABLE public.patient_family_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'other',
    condition TEXT NOT NULL,
    age_at_diagnosis INTEGER,
    age_at_death INTEGER,
    cause_of_death TEXT,
    is_hereditary BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT ALLERGIES
-- =====================================================
CREATE TABLE public.patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    allergen TEXT NOT NULL,
    allergen_type TEXT,
    severity TEXT,
    reaction TEXT,
    onset_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT VACCINATIONS
-- =====================================================
CREATE TABLE public.patient_vaccinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    vaccine_name TEXT NOT NULL,
    vaccine_type TEXT,
    dose_number INTEGER DEFAULT 1,
    vaccination_date DATE,
    next_dose_date DATE,
    lot_number TEXT,
    administrator TEXT,
    site TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT LIFESTYLE
-- =====================================================
CREATE TABLE public.patient_lifestyle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    smoking_status TEXT,
    cigarettes_per_day INTEGER,
    smoking_years INTEGER,
    quit_date DATE,
    pack_years DECIMAL(5,1),
    alcohol_status TEXT,
    drinks_per_week INTEGER,
    alcohol_type TEXT,
    substance_use JSONB DEFAULT '[]'::jsonb,
    physical_activity_level TEXT,
    exercise_type TEXT,
    exercise_frequency TEXT,
    exercise_duration_minutes INTEGER,
    diet_type TEXT,
    dietary_restrictions TEXT[],
    meals_per_day INTEGER,
    water_intake_liters DECIMAL(3,1),
    sleep_hours_average DECIMAL(3,1),
    sleep_quality TEXT,
    sleep_disorders TEXT[],
    occupational_hazards TEXT[],
    protective_equipment_used BOOLEAN,
    recent_travel JSONB DEFAULT '[]'::jsonb,
    tropical_disease_exposure BOOLEAN DEFAULT false,
    last_updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT LAB RESULTS
-- =====================================================
CREATE TABLE public.patient_lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    test_date DATE NOT NULL DEFAULT CURRENT_DATE,
    test_name TEXT NOT NULL,
    category TEXT,
    test_category TEXT,
    value DECIMAL(12,4),
    unit TEXT,
    reference_min DECIMAL(12,4),
    reference_max DECIMAL(12,4),
    is_abnormal BOOLEAN DEFAULT false,
    interpretation TEXT,
    laboratory TEXT,
    ordering_physician TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT IMAGING
-- =====================================================
CREATE TABLE public.patient_imaging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    imaging_type TEXT NOT NULL DEFAULT 'xray',
    body_region TEXT,
    indication TEXT,
    findings TEXT,
    conclusion TEXT,
    radiologist TEXT,
    facility TEXT,
    contrast_used BOOLEAN DEFAULT false,
    is_abnormal BOOLEAN DEFAULT false,
    document_id UUID,
    images_stored JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT CLINICAL DATA
-- =====================================================
CREATE TABLE public.patient_clinical_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by TEXT,
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    heart_rate INTEGER,
    respiratory_rate INTEGER,
    temperature DECIMAL(4,1),
    oxygen_saturation INTEGER,
    weight_kg DECIMAL(5,1),
    height_cm DECIMAL(5,1),
    bmi DECIMAL(4,1),
    waist_circumference_cm DECIMAL(5,1),
    pain_level INTEGER,
    pain_location TEXT,
    pain_type TEXT,
    functional_capacity TEXT,
    mobility_status TEXT,
    activities_of_daily_living JSONB,
    nutritional_status TEXT,
    appetite TEXT,
    general_appearance TEXT,
    physical_exam_findings JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT PREVENTION
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
-- PATIENT MENTAL HEALTH
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
-- PATIENT REPRODUCTIVE HEALTH
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
-- PATIENT FUNCTIONAL EXAMS
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
-- PATIENT AGE SPECIFIC
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
-- ENABLE RLS ON ALL TABLES
-- =====================================================
ALTER TABLE public.patient_medical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_family_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_imaging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_clinical_data ENABLE ROW LEVEL SECURITY;
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

-- =====================================================
-- CREATE POLICIES FOR ALL TABLES
-- =====================================================
CREATE POLICY "auth_medical_history" ON public.patient_medical_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_family_history" ON public.patient_family_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_allergies" ON public.patient_allergies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_vaccinations" ON public.patient_vaccinations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_lifestyle" ON public.patient_lifestyle FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_lab_results" ON public.patient_lab_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_imaging" ON public.patient_imaging FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_clinical_data" ON public.patient_clinical_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
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
CREATE INDEX idx_family_history_patient ON public.patient_family_history(patient_id);
CREATE INDEX idx_allergies_patient ON public.patient_allergies(patient_id);
CREATE INDEX idx_vaccinations_patient ON public.patient_vaccinations(patient_id);
CREATE INDEX idx_lifestyle_patient ON public.patient_lifestyle(patient_id);
CREATE INDEX idx_lab_results_patient ON public.patient_lab_results(patient_id);
CREATE INDEX idx_imaging_patient ON public.patient_imaging(patient_id);
CREATE INDEX idx_clinical_data_patient ON public.patient_clinical_data(patient_id);
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
SELECT 'SUCCESS: All 18 patient tables created with correct schemas!' AS status;
