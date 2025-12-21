-- =====================================================
-- COMPLETE FIX: All remaining schema issues
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- FIX PATIENT_FUNCTIONAL_EXAMS
-- Frontend uses: physician, is_abnormal
-- =====================================================
ALTER TABLE public.patient_functional_exams 
    ADD COLUMN IF NOT EXISTS physician TEXT;

ALTER TABLE public.patient_functional_exams 
    ADD COLUMN IF NOT EXISTS is_abnormal BOOLEAN DEFAULT false;

-- Drop old column if exists
ALTER TABLE public.patient_functional_exams 
    DROP COLUMN IF EXISTS performing_physician;

ALTER TABLE public.patient_functional_exams 
    DROP COLUMN IF EXISTS is_normal;

-- =====================================================
-- FIX PATIENT_REPRODUCTIVE_HEALTH
-- Add missing columns used by frontend
-- =====================================================
ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS pregnancy_status TEXT;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS gestational_weeks INTEGER;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS pregnancy_outcome TEXT;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS cycle_start DATE;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS cycle_length INTEGER;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS flow_intensity TEXT;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS contraception_method TEXT;

ALTER TABLE public.patient_reproductive_health 
    ADD COLUMN IF NOT EXISTS start_date DATE;

-- =====================================================
-- FIX PATIENT_ALLERGIES
-- Ensure all columns exist
-- =====================================================
ALTER TABLE public.patient_allergies 
    ADD COLUMN IF NOT EXISTS allergy_type TEXT DEFAULT 'medication';

ALTER TABLE public.patient_allergies 
    ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT true;

ALTER TABLE public.patient_allergies 
    ADD COLUMN IF NOT EXISTS onset_date DATE;

-- =====================================================
-- FIX PATIENT_VACCINATIONS
-- Frontend uses: administered_by
-- =====================================================
ALTER TABLE public.patient_vaccinations 
    DROP COLUMN IF EXISTS administrator;

ALTER TABLE public.patient_vaccinations 
    ADD COLUMN IF NOT EXISTS administered_by TEXT;

-- =====================================================
-- Refresh schema cache
-- =====================================================
NOTIFY pgrst, 'reload schema';

SELECT 'SUCCESS: All schema issues fixed!' AS status;
