-- Add target_pathology column to cde_analysis_runs
-- This stores the selected pathology context for oriented analysis

ALTER TABLE cde_analysis_runs 
ADD COLUMN IF NOT EXISTS target_pathology TEXT;

-- Add index for faster lookup by pathology
CREATE INDEX IF NOT EXISTS idx_cde_analysis_runs_pathology 
ON cde_analysis_runs(target_pathology) 
WHERE target_pathology IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN cde_analysis_runs.target_pathology IS 
'Optional pathology filter to focus analysis on a specific therapeutic area (e.g., "diabète", "cardiologie", "cancer")';
