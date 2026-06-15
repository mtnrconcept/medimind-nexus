-- =====================================================
-- QUICK FIX: Correct column names for patient tables
-- Run this in Supabase SQL Editor
-- =====================================================

-- Fix patient_vaccinations: rename administrator to administered_by
ALTER TABLE public.patient_vaccinations 
    DROP COLUMN IF EXISTS administrator;
    
ALTER TABLE public.patient_vaccinations 
    ADD COLUMN IF NOT EXISTS administered_by TEXT;

-- Fix patient_functional_exams: ensure is_abnormal renamed to is_normal if needed
-- Check if is_abnormal exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patient_functional_exams' 
        AND column_name = 'is_abnormal'
    ) THEN
        -- Rename is_normal to is_abnormal if it exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'patient_functional_exams' 
            AND column_name = 'is_normal'
        ) THEN
            ALTER TABLE public.patient_functional_exams RENAME COLUMN is_normal TO is_abnormal;
            UPDATE public.patient_functional_exams SET is_abnormal = NOT is_abnormal WHERE is_abnormal IS NOT NULL;
        ELSE
            ALTER TABLE public.patient_functional_exams ADD COLUMN is_abnormal BOOLEAN DEFAULT false;
        END IF;
    END IF;
END $$;

-- Refresh schema cache (this helps with PGRST204 errors)
NOTIFY pgrst, 'reload schema';

SELECT 'SUCCESS: Applied column fixes!' AS status;
