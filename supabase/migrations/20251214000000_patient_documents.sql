-- Migration: Patient Documents Table
-- Description: Creates table for storing patient document metadata and extracted data

-- Create document category enum
DO $$ BEGIN
    CREATE TYPE document_category AS ENUM (
        'ordonnance',
        'compte_rendu',
        'imagerie',
        'analyse_biologique',
        'certificat',
        'autre'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create extraction status enum
DO $$ BEGIN
    CREATE TYPE extraction_status AS ENUM (
        'pending',
        'processing',
        'completed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create patient_documents table
CREATE TABLE IF NOT EXISTS patient_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- pdf, doc, docx, xls, xlsx, csv, jpg, jpeg, png
    file_path TEXT NOT NULL, -- path in Supabase Storage
    file_size INTEGER NOT NULL,
    category document_category DEFAULT 'autre',
    extracted_data JSONB DEFAULT '{}',
    extraction_status extraction_status DEFAULT 'pending',
    extraction_error TEXT,
    analyzed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_id ON patient_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_category ON patient_documents(category);
CREATE INDEX IF NOT EXISTS idx_patient_documents_status ON patient_documents(extraction_status);
CREATE INDEX IF NOT EXISTS idx_patient_documents_created_at ON patient_documents(created_at DESC);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_patient_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_patient_documents_updated_at ON patient_documents;
CREATE TRIGGER trigger_patient_documents_updated_at
    BEFORE UPDATE ON patient_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_documents_updated_at();

-- Enable RLS
ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to view all documents (adjust based on your auth needs)
CREATE POLICY "Enable read access for authenticated users"
    ON patient_documents
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to insert documents
CREATE POLICY "Enable insert for authenticated users"
    ON patient_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow authenticated users to update their documents
CREATE POLICY "Enable update for authenticated users"
    ON patient_documents
    FOR UPDATE
    TO authenticated
    USING (true);

-- Allow authenticated users to delete documents
CREATE POLICY "Enable delete for authenticated users"
    ON patient_documents
    FOR DELETE
    TO authenticated
    USING (true);

-- Create storage bucket for patient documents (run this in Supabase dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('patient-documents', 'patient-documents', false);

COMMENT ON TABLE patient_documents IS 'Stores metadata and extracted data from patient medical documents';
COMMENT ON COLUMN patient_documents.extracted_data IS 'JSON containing AI-extracted medical data (medications, diagnoses, lab results, etc.)';
COMMENT ON COLUMN patient_documents.category IS 'Document category: ordonnance, compte_rendu, imagerie, analyse_biologique, certificat, autre';
