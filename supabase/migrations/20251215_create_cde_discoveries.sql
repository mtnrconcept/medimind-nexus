-- Create table for storing validated AI-generated discoveries
CREATE TABLE IF NOT EXISTS cde_discoveries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discovery_id VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    hypothesis TEXT NOT NULL,
    discovery_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    plausibility VARCHAR(20) NOT NULL,
    reasoning_chain JSONB NOT NULL DEFAULT '[]',
    recommended_actions JSONB NOT NULL DEFAULT '[]',
    involved_medications JSONB NOT NULL DEFAULT '[]',
    sources JSONB DEFAULT '[]',
    gaps_addressed JSONB DEFAULT '[]',
    target_pathology VARCHAR(255),
    validation_status VARCHAR(20) DEFAULT 'pending',
    validated_at TIMESTAMP WITH TIME ZONE,
    validated_by VARCHAR(255),
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicates
    CONSTRAINT unique_discovery UNIQUE (discovery_id, title)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cde_discoveries_type ON cde_discoveries(discovery_type);
CREATE INDEX IF NOT EXISTS idx_cde_discoveries_severity ON cde_discoveries(severity);
CREATE INDEX IF NOT EXISTS idx_cde_discoveries_pathology ON cde_discoveries(target_pathology);
CREATE INDEX IF NOT EXISTS idx_cde_discoveries_status ON cde_discoveries(validation_status);

-- Enable RLS
ALTER TABLE cde_discoveries ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read discoveries
DROP POLICY IF EXISTS "Allow read access to discoveries" ON cde_discoveries;
CREATE POLICY "Allow read access to discoveries" ON cde_discoveries
    FOR SELECT USING (true);

-- Allow authenticated users to insert new discoveries
DROP POLICY IF EXISTS "Allow insert discoveries" ON cde_discoveries;
CREATE POLICY "Allow insert discoveries" ON cde_discoveries
    FOR INSERT WITH CHECK (true);

-- Allow authenticated users to update discoveries
DROP POLICY IF EXISTS "Allow update discoveries" ON cde_discoveries;
CREATE POLICY "Allow update discoveries" ON cde_discoveries
    FOR UPDATE USING (true);
