-- Migration: Add RCDP and Causal Graph fields to discovery_hypotheses
-- Purpose: Support Ultra-Deep 50k character reports with nodal images
-- Run this in Supabase SQL Editor

ALTER TABLE discovery_hypotheses
ADD COLUMN IF NOT EXISTS systemic_cascade JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS therapeutic_resolution_chains JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS causal_graph JSONB DEFAULT '{"nodes": [], "edges": []}'::jsonb,
ADD COLUMN IF NOT EXISTS mermaid_graph TEXT,
ADD COLUMN IF NOT EXISTS is_complete_resolution BOOLEAN DEFAULT FALSE;

-- Add documentation comments
COMMENT ON COLUMN discovery_hypotheses.systemic_cascade IS 'Organ-by-organ impact mapping with cellular targets and severity';
COMMENT ON COLUMN discovery_hypotheses.therapeutic_resolution_chains IS 'Sequential intervention steps with side-effect resolution loops';
COMMENT ON COLUMN discovery_hypotheses.causal_graph IS 'Structured nodal representation (nodes and edges) for interactive visualization';
COMMENT ON COLUMN discovery_hypotheses.mermaid_graph IS 'Mermaid.js code for static image generation via mermaid.ink';
COMMENT ON COLUMN discovery_hypotheses.is_complete_resolution IS 'Whether the hypothesis achieves full systemic homeostatic loop closure';
