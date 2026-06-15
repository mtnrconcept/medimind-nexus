
-- Migration: Update Pathologies and CDE Schema for Ameli Import
-- Created: 2025-12-16

-- 1. Update 'pathologies' table
ALTER TABLE IF EXISTS pathologies 
ADD COLUMN IF NOT EXISTS source TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Update 'cde_nodes' table (ensure metadata exists)
ALTER TABLE IF EXISTS cde_nodes 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Update 'cde_edges' table (ensure metadata exists)
ALTER TABLE IF EXISTS cde_edges 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 4. Create index on source for faster filtering
CREATE INDEX IF NOT EXISTS idx_pathologies_source ON pathologies(source);
