-- Migration: Add UNIQUE constraint on medications.name for upsert operations
-- Created: 2025-12-16

-- First, handle potential duplicates by keeping the one with the most data
-- Delete duplicates keeping the one with the longest description/substance
WITH duplicates AS (
    SELECT id, name,
           ROW_NUMBER() OVER (
               PARTITION BY LOWER(TRIM(name)) 
               ORDER BY 
                   COALESCE(LENGTH(description), 0) + 
                   COALESCE(LENGTH(substance), 0) + 
                   COALESCE(LENGTH(indications), 0) DESC,
                   created_at ASC
           ) AS rn
    FROM medications
)
DELETE FROM medications 
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Create UNIQUE index on normalized name (case-insensitive, trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_medications_name_unique 
ON medications (LOWER(TRIM(name)));

-- Also add index on symptoms.name for similar operations
CREATE UNIQUE INDEX IF NOT EXISTS idx_symptoms_name_lower_unique 
ON symptoms (LOWER(TRIM(name)));

COMMENT ON INDEX idx_medications_name_unique IS 'Ensures unique medication names for upsert operations from import-openfda';
