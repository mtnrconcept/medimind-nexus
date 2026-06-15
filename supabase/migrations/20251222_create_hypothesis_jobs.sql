-- Migration: Create hypothesis generation jobs table for async processing
-- This allows Edge Functions to return immediately while background processing handles long-running Claude API calls

CREATE TABLE IF NOT EXISTS hypothesis_generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending',
    query TEXT NOT NULL,
    query_intent JSONB,
    evidence_pack JSONB,
    hypothesis_id UUID REFERENCES discovery_hypotheses(id),
    error_message TEXT,
    progress_percentage INTEGER DEFAULT 0,
    progress_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT valid_progress CHECK (progress_percentage >= 0 AND progress_percentage <= 100)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON hypothesis_generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_desc ON hypothesis_generation_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_hypothesis ON hypothesis_generation_jobs(hypothesis_id) WHERE hypothesis_id IS NOT NULL;

-- Row Level Security (RLS)
ALTER TABLE hypothesis_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all jobs (for now - adjust based on your auth requirements)
CREATE POLICY "Enable read access for all users" ON hypothesis_generation_jobs
    FOR SELECT
    USING (true);

-- Policy: Service role can do everything (for Edge Functions)
CREATE POLICY "Enable all access for service role" ON hypothesis_generation_jobs
    FOR ALL
    USING (auth.role() = 'service_role');

-- Comments for documentation
COMMENT ON TABLE hypothesis_generation_jobs IS 'Tracks asynchronous hypothesis generation jobs to avoid Edge Function timeouts';
COMMENT ON COLUMN hypothesis_generation_jobs.status IS 'Job status: pending (queued), processing (running), completed (success), failed (error)';
COMMENT ON COLUMN hypothesis_generation_jobs.query IS 'Original user search query';
COMMENT ON COLUMN hypothesis_generation_jobs.evidence_pack IS 'Cached evidence data to avoid re-fetching papers';
COMMENT ON COLUMN hypothesis_generation_jobs.hypothesis_id IS 'Reference to generated hypothesis once completed';
COMMENT ON COLUMN hypothesis_generation_jobs.progress_percentage IS 'Completion percentage (0-100) for UI progress bars';
COMMENT ON COLUMN hypothesis_generation_jobs.progress_message IS 'Human-readable progress message for UI';
