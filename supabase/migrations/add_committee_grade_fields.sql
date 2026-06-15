-- Migration: Add committee-grade fields to discovery_hypotheses table
-- Run this in Supabase SQL Editor

ALTER TABLE discovery_hypotheses
ADD COLUMN IF NOT EXISTS executive_summary JSONB,
ADD COLUMN IF NOT EXISTS clinical_scope JSONB,
ADD COLUMN IF NOT EXISTS rival_hypotheses JSONB,
ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB,
ADD COLUMN IF NOT EXISTS mechanistic_model JSONB,
ADD COLUMN IF NOT EXISTS risks_monitoring JSONB,
ADD COLUMN IF NOT EXISTS drug_repurposing_candidates TEXT[];

-- Add comments for documentation
COMMENT ON COLUMN discovery_hypotheses.executive_summary IS 'Committee-grade executive summary with context, operational hypothesis, scope decisions, and Go/No-Go table';
COMMENT ON COLUMN discovery_hypotheses.clinical_scope IS 'Operational definitions and recommended comparators';
COMMENT ON COLUMN discovery_hypotheses.rival_hypotheses IS 'Rival hypotheses (H1-H4) and DAG textual representation';
COMMENT ON COLUMN discovery_hypotheses.evidence_snapshot IS 'Evidence snapshot with Oxford/EBM levels';
COMMENT ON COLUMN discovery_hypotheses.mechanistic_model IS 'Mechanistic model with PK/PD and organ-risk mapping';
COMMENT ON COLUMN discovery_hypotheses.risks_monitoring IS 'Key risks, monitoring table, and pharmacogenetic recommendations';
