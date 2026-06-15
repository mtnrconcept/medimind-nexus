-- =====================================================
-- Comprehensive Patient Data Schema
-- =====================================================
-- Extends patient records with complete medical history
-- =====================================================

-- =====================================================
-- PATIENT ADMINISTRATIVE DATA
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_administrative (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE UNIQUE,
    -- Identity
    birth_name TEXT,
    birth_place TEXT,
    biological_sex TEXT CHECK (biological_sex IN ('male', 'female', 'intersex')),
    gender_identity TEXT,
    social_security_number TEXT,
    -- Emergency contact
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,
    -- Family situation
    marital_status TEXT CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'pacs', 'cohabiting')),
    household_composition TEXT,
    number_of_children INTEGER DEFAULT 0,
    -- Professional
    profession TEXT,
    professional_status TEXT CHECK (professional_status IN ('employed', 'unemployed', 'retired', 'student', 'self_employed', 'disabled')),
    employer TEXT,
    -- Insurance
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    complementary_insurance TEXT,
    -- Medical team
    primary_physician_name TEXT,
    primary_physician_phone TEXT,
    specialists_followed JSONB DEFAULT '[]'::jsonb,
    -- Directives
    advance_directives BOOLEAN DEFAULT false,
    advance_directives_date DATE,
    organ_donor BOOLEAN,
    trusted_person_name TEXT,
    trusted_person_phone TEXT,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT MEDICAL HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_medical_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN (
        'chronic_disease', 'past_illness', 'hospitalization', 
        'surgery', 'trauma', 'infection', 'psychiatric',
        'neurological', 'autoimmune', 'endocrine', 'developmental'
    )),
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_ongoing BOOLEAN DEFAULT false,
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe')),
    treating_facility TEXT,
    treating_physician TEXT,
    complications TEXT,
    icd_code TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT FAMILY HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_family_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL CHECK (relationship IN (
        'mother', 'father', 'sibling', 'maternal_grandmother', 
        'maternal_grandfather', 'paternal_grandmother', 'paternal_grandfather',
        'aunt', 'uncle', 'child', 'other'
    )),
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
-- PATIENT LIFESTYLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_lifestyle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE UNIQUE,
    -- Tobacco
    smoking_status TEXT CHECK (smoking_status IN ('never', 'former', 'current', 'occasional')),
    cigarettes_per_day INTEGER,
    smoking_years INTEGER,
    quit_date DATE,
    pack_years DECIMAL(5,1),
    -- Alcohol
    alcohol_status TEXT CHECK (alcohol_status IN ('never', 'occasional', 'moderate', 'heavy', 'former')),
    drinks_per_week INTEGER,
    alcohol_type TEXT,
    -- Substances
    substance_use JSONB DEFAULT '[]'::jsonb,
    -- Physical activity
    physical_activity_level TEXT CHECK (physical_activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
    exercise_type TEXT,
    exercise_frequency TEXT,
    exercise_duration_minutes INTEGER,
    -- Diet
    diet_type TEXT,
    dietary_restrictions TEXT[],
    meals_per_day INTEGER,
    water_intake_liters DECIMAL(3,1),
    -- Sleep
    sleep_hours_average DECIMAL(3,1),
    sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'fair', 'good', 'excellent')),
    sleep_disorders TEXT[],
    -- Work exposure
    occupational_hazards TEXT[],
    protective_equipment_used BOOLEAN,
    -- Travel
    recent_travel JSONB DEFAULT '[]'::jsonb,
    tropical_disease_exposure BOOLEAN DEFAULT false,
    -- Metadata
    last_updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT CLINICAL DATA
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_clinical_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by TEXT,
    -- Vital signs
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    heart_rate INTEGER,
    respiratory_rate INTEGER,
    temperature DECIMAL(4,1),
    oxygen_saturation INTEGER,
    -- Measurements
    weight_kg DECIMAL(5,1),
    height_cm DECIMAL(5,1),
    bmi DECIMAL(4,1),
    waist_circumference_cm DECIMAL(5,1),
    -- Pain assessment
    pain_level INTEGER CHECK (pain_level >= 0 AND pain_level <= 10),
    pain_location TEXT,
    pain_type TEXT,
    -- Functional status
    functional_capacity TEXT CHECK (functional_capacity IN ('independent', 'partial_assistance', 'full_assistance', 'bedridden')),
    mobility_status TEXT,
    activities_of_daily_living JSONB,
    -- Nutritional status
    nutritional_status TEXT CHECK (nutritional_status IN ('normal', 'at_risk', 'malnourished', 'obese')),
    appetite TEXT CHECK (appetite IN ('normal', 'decreased', 'increased', 'absent')),
    -- Physical exam notes
    general_appearance TEXT,
    physical_exam_findings JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT LAB RESULTS (Structured)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    test_date DATE NOT NULL,
    test_category TEXT NOT NULL CHECK (test_category IN (
        'hematology', 'biochemistry', 'lipids', 'liver', 'kidney',
        'thyroid', 'inflammation', 'coagulation', 'urinalysis',
        'hormones', 'tumor_markers', 'serology', 'genetics', 'other'
    )),
    test_name TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS public.patient_imaging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    exam_date DATE NOT NULL,
    imaging_type TEXT NOT NULL CHECK (imaging_type IN (
        'xray', 'ultrasound', 'ct_scan', 'mri', 'pet_scan',
        'mammography', 'dexa', 'angiography', 'echocardiography', 'other'
    )),
    body_region TEXT NOT NULL,
    indication TEXT,
    findings TEXT,
    conclusion TEXT,
    radiologist TEXT,
    facility TEXT,
    contrast_used BOOLEAN DEFAULT false,
    document_id UUID REFERENCES public.patient_documents(id),
    images_stored JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT FUNCTIONAL EXAMS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_functional_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    exam_date DATE NOT NULL,
    exam_type TEXT NOT NULL CHECK (exam_type IN (
        'ecg', 'holter', 'stress_test', 'echocardiography',
        'spirometry', 'blood_gas', 'endoscopy_upper', 'endoscopy_lower',
        'bronchoscopy', 'audiometry', 'ophthalmology', 'emg', 'eeg', 'other'
    )),
    indication TEXT,
    findings TEXT,
    conclusion TEXT,
    performing_physician TEXT,
    facility TEXT,
    is_normal BOOLEAN,
    document_id UUID REFERENCES public.patient_documents(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT PREVENTION
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_prevention (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    screening_type TEXT NOT NULL CHECK (screening_type IN (
        'colorectal_cancer', 'breast_cancer', 'cervical_cancer',
        'prostate_cancer', 'lung_cancer', 'skin_cancer',
        'diabetes', 'cardiovascular', 'osteoporosis',
        'hepatitis', 'hiv', 'sti', 'vision', 'hearing', 'dental', 'other'
    )),
    last_screening_date DATE,
    next_due_date DATE,
    result TEXT,
    result_status TEXT CHECK (result_status IN ('normal', 'abnormal', 'inconclusive', 'pending')),
    follow_up_needed BOOLEAN DEFAULT false,
    follow_up_notes TEXT,
    performing_facility TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- UPDATE patient_documents TABLE
-- =====================================================
ALTER TABLE public.patient_documents 
ADD COLUMN IF NOT EXISTS integrated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS integrated_data JSONB,
ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT false;

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_patient_administrative_patient ON public.patient_administrative(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_patient ON public.patient_medical_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_history_category ON public.patient_medical_history(category);
CREATE INDEX IF NOT EXISTS idx_patient_family_history_patient ON public.patient_family_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_lifestyle_patient ON public.patient_lifestyle(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_clinical_data_patient ON public.patient_clinical_data(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_clinical_data_date ON public.patient_clinical_data(recorded_at);
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_patient ON public.patient_lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_date ON public.patient_lab_results(test_date);
CREATE INDEX IF NOT EXISTS idx_patient_imaging_patient ON public.patient_imaging(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_functional_exams_patient ON public.patient_functional_exams(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_prevention_patient ON public.patient_prevention(patient_id);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================
CREATE TRIGGER update_patient_administrative_updated_at
    BEFORE UPDATE ON public.patient_administrative
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_medical_history_updated_at
    BEFORE UPDATE ON public.patient_medical_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_family_history_updated_at
    BEFORE UPDATE ON public.patient_family_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_lifestyle_updated_at
    BEFORE UPDATE ON public.patient_lifestyle
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_prevention_updated_at
    BEFORE UPDATE ON public.patient_prevention
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.patient_administrative ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_family_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_clinical_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_imaging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_functional_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_prevention ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "authenticated_patient_administrative" ON public.patient_administrative
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_medical_history" ON public.patient_medical_history
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_family_history" ON public.patient_family_history
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_lifestyle" ON public.patient_lifestyle
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_clinical_data" ON public.patient_clinical_data
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_lab_results" ON public.patient_lab_results
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_imaging" ON public.patient_imaging
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_functional_exams" ON public.patient_functional_exams
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_patient_prevention" ON public.patient_prevention
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.patient_administrative IS 'Extended administrative and identity information';
COMMENT ON TABLE public.patient_medical_history IS 'Personal medical history including diseases, surgeries, hospitalizations';
COMMENT ON TABLE public.patient_family_history IS 'Family medical history for hereditary conditions';
COMMENT ON TABLE public.patient_lifestyle IS 'Lifestyle factors and risk behaviors';
COMMENT ON TABLE public.patient_clinical_data IS 'Clinical measurements and physical exam data';
COMMENT ON TABLE public.patient_lab_results IS 'Structured laboratory test results';
COMMENT ON TABLE public.patient_imaging IS 'Medical imaging exams and results';
COMMENT ON TABLE public.patient_functional_exams IS 'Functional and diagnostic exams';
COMMENT ON TABLE public.patient_prevention IS 'Screening and prevention tracking';
