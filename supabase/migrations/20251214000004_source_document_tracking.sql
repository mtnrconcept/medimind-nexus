-- Add source_document_id to junction tables for document traceability
-- This allows tracking which document populated each data entry

-- Add column to patient_medications
ALTER TABLE patient_medications 
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Add column to patient_pathologies
ALTER TABLE patient_pathologies 
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Add column to patient_allergies
ALTER TABLE patient_allergies 
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Add column to patient_vaccinations
ALTER TABLE patient_vaccinations
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Add column to patient_symptoms
ALTER TABLE patient_symptoms
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Add column to patient_lab_results
ALTER TABLE patient_lab_results
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Add column to patient_clinical_data
ALTER TABLE patient_clinical_data
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Add column to patient_medical_history
ALTER TABLE patient_medical_history
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES patient_documents(id) ON DELETE SET NULL;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_medications_doc ON patient_medications(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_pathologies_doc ON patient_pathologies(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_allergies_doc ON patient_allergies(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_vaccinations_doc ON patient_vaccinations(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_lab_results_doc ON patient_lab_results(source_document_id) WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_clinical_data_doc ON patient_clinical_data(source_document_id) WHERE source_document_id IS NOT NULL;

COMMENT ON COLUMN patient_medications.source_document_id IS 'Reference to the document from which this data was extracted';
COMMENT ON COLUMN patient_pathologies.source_document_id IS 'Reference to the document from which this data was extracted';
COMMENT ON COLUMN patient_allergies.source_document_id IS 'Reference to the document from which this data was extracted';
