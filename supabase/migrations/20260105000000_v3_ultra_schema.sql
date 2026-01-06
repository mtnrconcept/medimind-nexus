-- Add ULTRA V3 columns to discovery_hypotheses
ALTER TABLE discovery_hypotheses 
ADD COLUMN IF NOT EXISTS executive_summary JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS clinical_scope JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS contradictions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS novelty_findings JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS validation_plan JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS detailed_analysis JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS systemic_cascade JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS therapeutic_resolution_chains JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS causal_graph JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS mermaid_graph TEXT,
ADD COLUMN IF NOT EXISTS is_complete_resolution BOOLEAN DEFAULT FALSE;

-- Ensure scores column exists and has defaults
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'discovery_hypotheses' AND column_name = 'scores') THEN
        ALTER TABLE discovery_hypotheses ADD COLUMN scores JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;
