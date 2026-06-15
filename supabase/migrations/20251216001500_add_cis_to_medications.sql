
-- Migration: Add CIS code to medications
-- Created: 2025-12-16

ALTER TABLE IF EXISTS medications 
ADD COLUMN IF NOT EXISTS cis TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_medications_cis ON medications(cis);
