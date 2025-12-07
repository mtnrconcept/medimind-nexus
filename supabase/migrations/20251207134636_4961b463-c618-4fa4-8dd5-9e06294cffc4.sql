-- Add unique constraint on icd_code for upsert operations
ALTER TABLE public.pathologies ADD CONSTRAINT pathologies_icd_code_key UNIQUE (icd_code);