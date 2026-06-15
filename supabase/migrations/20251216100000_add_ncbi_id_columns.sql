-- Migration: Add NCBI ID columns to reference tables
-- This enables linking local medical data to NCBI databases (MeSH, MedGen, PubChem)

-- Add ncbi_id to symptoms table (for MeSH UIDs)
ALTER TABLE symptoms ADD COLUMN IF NOT EXISTS ncbi_id TEXT;

-- Add ncbi_id to pathologies table (for MedGen CUIDs)
ALTER TABLE pathologies ADD COLUMN IF NOT EXISTS ncbi_id TEXT;

-- Add ncbi_id to medications table (for PubChem CIDs)
ALTER TABLE medications ADD COLUMN IF NOT EXISTS ncbi_id TEXT;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_symptoms_ncbi_id ON symptoms(ncbi_id) WHERE ncbi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pathologies_ncbi_id ON pathologies(ncbi_id) WHERE ncbi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_medications_ncbi_id ON medications(ncbi_id) WHERE ncbi_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN symptoms.ncbi_id IS 'NCBI MeSH UID for interoperability';
COMMENT ON COLUMN pathologies.ncbi_id IS 'NCBI MedGen CUID for interoperability';
COMMENT ON COLUMN medications.ncbi_id IS 'NCBI PubChem CID for interoperability';
