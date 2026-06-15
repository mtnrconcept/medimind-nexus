-- =====================================================
-- Extended Patient Dossier Tables
-- =====================================================
-- Adds all remaining tables for complete patient dossier
-- =====================================================

-- =====================================================
-- PATIENT MENTAL HEALTH
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_mental_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('mood_check', 'diagnosis', 'therapy', 'crisis', 'follow_up')),
    -- Mood tracking
    mood_score INTEGER CHECK (mood_score >= 1 AND mood_score <= 10),
    anxiety_level INTEGER CHECK (anxiety_level >= 1 AND anxiety_level <= 10),
    sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 10),
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
    -- Diagnosis
    diagnosis TEXT,
    icd_code TEXT,
    severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe')),
    -- Therapy
    therapist_name TEXT,
    therapy_type TEXT CHECK (therapy_type IN ('cbt', 'psychoanalysis', 'emdr', 'group', 'family', 'medication', 'mindfulness', 'art', 'other')),
    therapy_frequency TEXT,
    session_count INTEGER,
    -- Notes
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
    entry_type TEXT NOT NULL CHECK (entry_type IN ('pregnancy', 'cycle', 'contraception', 'fertility', 'menopause', 'screening')),
    -- Pregnancy
    pregnancy_status TEXT CHECK (pregnancy_status IN ('current', 'completed', 'miscarriage', 'ectopic', 'ivg')),
    due_date DATE,
    gestational_weeks INTEGER,
    pregnancy_outcome TEXT,
    birth_type TEXT CHECK (birth_type IN ('vaginal', 'cesarean', 'assisted')),
    complications TEXT,
    -- Cycle
    cycle_start DATE,
    cycle_length INTEGER,
    flow_intensity TEXT CHECK (flow_intensity IN ('light', 'normal', 'heavy', 'very_heavy')),
    cycle_regularity TEXT CHECK (cycle_regularity IN ('regular', 'irregular', 'absent')),
    pms_symptoms TEXT[],
    -- Contraception
    contraception_method TEXT CHECK (contraception_method IN ('pill', 'iud_copper', 'iud_hormonal', 'implant', 'patch', 'ring', 'injection', 'condom', 'natural', 'sterilization', 'none')),
    start_date DATE,
    end_date DATE,
    -- Fertility
    fertility_treatment TEXT,
    ivf_cycles INTEGER,
    -- Notes
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT SOCIAL FACTORS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_social_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE UNIQUE,
    -- Housing
    housing_status TEXT CHECK (housing_status IN ('owner', 'tenant', 'family', 'social', 'shelter', 'homeless', 'institution')),
    housing_type TEXT CHECK (housing_type IN ('house', 'apartment', 'studio', 'care_home', 'assisted')),
    living_alone BOOLEAN DEFAULT false,
    floor_level INTEGER,
    elevator_access BOOLEAN,
    home_adaptations TEXT[],
    -- Employment
    employment_status TEXT CHECK (employment_status IN ('employed_full', 'employed_part', 'self_employed', 'unemployed', 'retired', 'student', 'disability', 'homemaker')),
    occupation TEXT,
    employer TEXT,
    work_hours_weekly INTEGER,
    -- Education
    education_level TEXT CHECK (education_level IN ('none', 'primary', 'secondary', 'high_school', 'bachelor', 'master', 'doctorate')),
    -- Support network
    has_family_support BOOLEAN DEFAULT true,
    has_caregiver BOOLEAN DEFAULT false,
    caregiver_name TEXT,
    caregiver_relationship TEXT,
    -- Mobility
    has_transportation BOOLEAN DEFAULT true,
    mobility_issues BOOLEAN DEFAULT false,
    uses_mobility_aid BOOLEAN DEFAULT false,
    mobility_aid_type TEXT,
    -- Financial
    financial_difficulties BOOLEAN DEFAULT false,
    has_health_insurance BOOLEAN DEFAULT true,
    receives_benefits BOOLEAN DEFAULT false,
    benefit_types TEXT[],
    -- Vulnerabilities
    is_isolated BOOLEAN DEFAULT false,
    language_barriers BOOLEAN DEFAULT false,
    primary_language TEXT DEFAULT 'fr',
    interpreter_needed BOOLEAN DEFAULT false,
    -- Notes
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
    entry_type TEXT NOT NULL CHECK (entry_type IN ('checkup', 'cleaning', 'filling', 'extraction', 'root_canal', 'crown', 'implant', 'bridge', 'denture', 'orthodontics', 'wisdom_teeth', 'gum_treatment', 'whitening', 'xray')),
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
    specialty TEXT NOT NULL CHECK (specialty IN (
        'general', 'cardiology', 'pulmonology', 'gastroenterology', 'neurology',
        'psychiatry', 'dermatology', 'rheumatology', 'endocrinology', 'nephrology',
        'urology', 'gynecology', 'ophthalmology', 'ent', 'orthopedics',
        'oncology', 'hematology', 'infectious', 'emergency', 'surgery', 'pediatrics', 'geriatrics', 'other'
    )),
    physician_name TEXT NOT NULL,
    facility TEXT,
    reason TEXT,
    diagnosis TEXT,
    treatment_plan TEXT,
    prescriptions TEXT,
    follow_up_date DATE,
    follow_up_notes TEXT,
    document_id UUID REFERENCES public.patient_documents(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT COMMUNICATIONS (Correspondances)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    communication_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    communication_type TEXT NOT NULL CHECK (communication_type IN (
        'letter_in', 'letter_out', 'email_in', 'email_out', 
        'phone_call', 'sms', 'fax', 'secure_message', 'referral', 'report'
    )),
    sender TEXT,
    recipient TEXT,
    subject TEXT,
    content TEXT,
    urgency TEXT CHECK (urgency IN ('routine', 'urgent', 'critical')),
    status TEXT CHECK (status IN ('pending', 'read', 'replied', 'archived')),
    related_consultation_id UUID REFERENCES public.patient_consultations(id),
    document_id UUID REFERENCES public.patient_documents(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT MONITORING (Suivi/Monitoring data)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    monitoring_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monitoring_type TEXT NOT NULL CHECK (monitoring_type IN (
        'blood_pressure', 'blood_glucose', 'weight', 'temperature',
        'heart_rate', 'oxygen', 'medication_adherence', 'symptom_diary',
        'pain_diary', 'exercise', 'diet', 'sleep', 'mood', 'custom'
    )),
    value DECIMAL(12,4),
    value_unit TEXT,
    secondary_value DECIMAL(12,4),
    secondary_unit TEXT,
    is_within_target BOOLEAN,
    target_min DECIMAL(12,4),
    target_max DECIMAL(12,4),
    source TEXT CHECK (source IN ('self_reported', 'device', 'clinical', 'wearable')),
    device_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PATIENT AGE SPECIFIC (Pédiatrie/Gériatrie)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.patient_age_specific (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT NOT NULL CHECK (entry_type IN (
        -- Pediatrics
        'growth', 'development', 'school_health', 'vaccination_schedule',
        -- Geriatrics
        'fall_risk', 'cognitive_assessment', 'functional_decline', 'polypharmacy', 'frailty'
    )),
    -- Pediatric growth
    height_percentile INTEGER,
    weight_percentile INTEGER,
    head_circumference_cm DECIMAL(5,1),
    developmental_milestones JSONB,
    school_performance TEXT,
    behavioral_concerns TEXT,
    -- Geriatric
    fall_risk_score INTEGER,
    cognitive_score INTEGER,
    cognitive_test_type TEXT,
    adl_score INTEGER,
    iadl_score INTEGER,
    frailty_index DECIMAL(3,2),
    polypharmacy_risk TEXT CHECK (polypharmacy_risk IN ('low', 'moderate', 'high')),
    -- Notes
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- UPDATE EXISTING TABLES - Add missing columns
-- =====================================================

-- Add is_abnormal to patient_imaging if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'patient_imaging' AND column_name = 'is_abnormal') THEN
        ALTER TABLE public.patient_imaging ADD COLUMN is_abnormal BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Add is_abnormal to patient_functional_exams if named differently
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'patient_functional_exams' AND column_name = 'is_abnormal') THEN
        ALTER TABLE public.patient_functional_exams ADD COLUMN is_abnormal BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Update patient_prevention with more fields
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'patient_prevention' AND column_name = 'next_screening_date') THEN
        ALTER TABLE public.patient_prevention ADD COLUMN next_screening_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'patient_prevention' AND column_name = 'is_normal') THEN
        ALTER TABLE public.patient_prevention ADD COLUMN is_normal BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'patient_prevention' AND column_name = 'frequency_months') THEN
        ALTER TABLE public.patient_prevention ADD COLUMN frequency_months INTEGER DEFAULT 12;
    END IF;
END $$;

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_patient_mental_health_patient ON public.patient_mental_health(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_mental_health_date ON public.patient_mental_health(entry_date);
CREATE INDEX IF NOT EXISTS idx_patient_reproductive_health_patient ON public.patient_reproductive_health(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_social_factors_patient ON public.patient_social_factors(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_dental_patient ON public.patient_dental(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consultations_patient ON public.patient_consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consultations_date ON public.patient_consultations(consultation_date);
CREATE INDEX IF NOT EXISTS idx_patient_communications_patient ON public.patient_communications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_monitoring_patient ON public.patient_monitoring(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_monitoring_date ON public.patient_monitoring(monitoring_date);
CREATE INDEX IF NOT EXISTS idx_patient_age_specific_patient ON public.patient_age_specific(patient_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.patient_mental_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_reproductive_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_social_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_dental ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_age_specific ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "auth_patient_mental_health" ON public.patient_mental_health
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_patient_reproductive_health" ON public.patient_reproductive_health
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_patient_social_factors" ON public.patient_social_factors
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_patient_dental" ON public.patient_dental
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_patient_consultations" ON public.patient_consultations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_patient_communications" ON public.patient_communications
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_patient_monitoring" ON public.patient_monitoring
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_patient_age_specific" ON public.patient_age_specific
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_patient_mental_health_updated_at
    BEFORE UPDATE ON public.patient_mental_health
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_reproductive_health_updated_at
    BEFORE UPDATE ON public.patient_reproductive_health
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_social_factors_updated_at
    BEFORE UPDATE ON public.patient_social_factors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_dental_updated_at
    BEFORE UPDATE ON public.patient_dental
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_consultations_updated_at
    BEFORE UPDATE ON public.patient_consultations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_age_specific_updated_at
    BEFORE UPDATE ON public.patient_age_specific
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.patient_mental_health IS 'Mental health tracking: mood, diagnoses, therapy sessions';
COMMENT ON TABLE public.patient_reproductive_health IS 'Reproductive health: pregnancy, cycles, contraception';
COMMENT ON TABLE public.patient_social_factors IS 'Social determinants of health: housing, employment, support';
COMMENT ON TABLE public.patient_dental IS 'Dental health history and procedures';
COMMENT ON TABLE public.patient_consultations IS 'Medical consultations and specialist visits';
COMMENT ON TABLE public.patient_communications IS 'Medical correspondence and communications';
COMMENT ON TABLE public.patient_monitoring IS 'Self-monitoring and device data';
COMMENT ON TABLE public.patient_age_specific IS 'Age-specific assessments (pediatric/geriatric)';
