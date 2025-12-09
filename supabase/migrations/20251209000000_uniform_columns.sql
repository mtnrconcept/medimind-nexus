-- ============================================================================
-- MIGRATION : Uniformisation des noms de colonnes
-- MediMind Nexus - Pour faciliter le croisement des données
-- ============================================================================

-- ============================================================================
-- ANALYSE DE LA STRUCTURE ACTUELLE
-- ============================================================================
-- 
-- Table: patients
--   - id, patient_id, age, gender, nationality, treatment (TEXT), 
--   - medical_notes_nlp (TEXT), pathology_id (FK), outcome, height_cm, weight_kg
--   - created_at, updated_at
--
-- Table: pathologies  
--   - id, name, category, specialty, severity, icd_code, description, synonyms
--   - created_at, updated_at
--
-- Table: symptoms
--   - id, name, body_system, description
--   - created_at (PAS de updated_at)
--
-- Table: treatments
--   - id, name, pathology_id (FK), type, description, contraindications
--   - created_at (PAS de updated_at)
--
-- Table: medications
--   - id, name, substance, atc_code, description, indications, posology
--   - created_at, updated_at (mais types différents)
--
-- ============================================================================
-- UNIFORMISATION
-- ============================================================================

-- 1. Ajouter updated_at à symptoms si manquant
ALTER TABLE symptoms 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Ajouter updated_at à treatments si manquant
ALTER TABLE treatments 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Ajouter category à symptoms pour correspondre à pathologies
ALTER TABLE symptoms 
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- 4. Ajouter severity à symptoms pour correspondre à pathologies
ALTER TABLE symptoms 
ADD COLUMN IF NOT EXISTS severity VARCHAR(50);

-- 5. Ajouter category à medications pour correspondre à pathologies
ALTER TABLE medications 
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- 6. Ajouter severity aux traitements
ALTER TABLE treatments 
ADD COLUMN IF NOT EXISTS severity VARCHAR(50);

-- 7. Ajouter synonyms aux symptoms (comme pathologies)
ALTER TABLE symptoms 
ADD COLUMN IF NOT EXISTS synonyms TEXT[];

-- 8. Ajouter synonyms aux medications
ALTER TABLE medications 
ADD COLUMN IF NOT EXISTS synonyms TEXT[];

-- 9. Ajouter specialty aux symptoms
ALTER TABLE symptoms 
ADD COLUMN IF NOT EXISTS specialty VARCHAR(100);

-- ============================================================================
-- COLONNES COMMUNES STANDARDISÉES
-- ============================================================================
-- Après cette migration, toutes les tables médicales auront :
-- 
-- | Colonne      | patients | pathologies | symptoms | treatments | medications |
-- |--------------|----------|-------------|----------|------------|-------------|
-- | id           | ✓        | ✓           | ✓        | ✓          | ✓           |
-- | name         | -        | ✓           | ✓        | ✓          | ✓           |
-- | category     | -        | ✓           | ✓ (NEW)  | -          | ✓ (NEW)     |
-- | severity     | -        | ✓           | ✓ (NEW)  | ✓ (NEW)    | -           |
-- | specialty    | -        | ✓           | ✓ (NEW)  | -          | -           |
-- | description  | -        | ✓           | ✓        | ✓          | ✓           |
-- | synonyms     | -        | ✓           | ✓ (NEW)  | -          | ✓ (NEW)     |
-- | body_system  | -        | -           | ✓        | -          | -           |
-- | created_at   | ✓        | ✓           | ✓        | ✓          | ✓           |
-- | updated_at   | ✓        | ✓           | ✓ (NEW)  | ✓ (NEW)    | ✓           |
-- ============================================================================

-- ============================================================================
-- TRIGGERS POUR AUTO-UPDATE de updated_at
-- ============================================================================

-- Fonction générique pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour symptoms
DROP TRIGGER IF EXISTS update_symptoms_updated_at ON symptoms;
CREATE TRIGGER update_symptoms_updated_at
    BEFORE UPDATE ON symptoms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour treatments
DROP TRIGGER IF EXISTS update_treatments_updated_at ON treatments;
CREATE TRIGGER update_treatments_updated_at
    BEFORE UPDATE ON treatments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MISE À JOUR DES CATÉGORIES PAR DÉFAUT
-- ============================================================================

-- Catégoriser les symptoms par body_system si category est vide
UPDATE symptoms 
SET category = body_system 
WHERE category IS NULL AND body_system IS NOT NULL;

-- ============================================================================
-- INDEX POUR OPTIMISER LES RECHERCHES CROISÉES
-- ============================================================================

-- Index sur category pour toutes les tables
CREATE INDEX IF NOT EXISTS idx_symptoms_category ON symptoms(category);
CREATE INDEX IF NOT EXISTS idx_medications_category ON medications(category);

-- Index sur severity
CREATE INDEX IF NOT EXISTS idx_symptoms_severity ON symptoms(severity);
CREATE INDEX IF NOT EXISTS idx_treatments_severity ON treatments(severity);

-- Index sur name (recherche textuelle)
CREATE INDEX IF NOT EXISTS idx_pathologies_name_lower ON pathologies(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_symptoms_name_lower ON symptoms(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_treatments_name_lower ON treatments(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_medications_name_lower ON medications(LOWER(name));

-- ============================================================================
-- VUE UNIFIÉE POUR LE CROISEMENT DES DONNÉES
-- ============================================================================

CREATE OR REPLACE VIEW unified_medical_entities AS
SELECT 
    id,
    name,
    'pathology' AS entity_type,
    category,
    severity,
    specialty,
    description,
    synonyms,
    NULL AS body_system,
    NULL AS atc_code,
    created_at,
    updated_at
FROM pathologies

UNION ALL

SELECT 
    id,
    name,
    'symptom' AS entity_type,
    category,
    severity,
    specialty,
    description,
    synonyms,
    body_system,
    NULL AS atc_code,
    created_at,
    updated_at
FROM symptoms

UNION ALL

SELECT 
    id,
    name,
    'treatment' AS entity_type,
    NULL AS category,
    severity,
    NULL AS specialty,
    description,
    NULL AS synonyms,
    NULL AS body_system,
    NULL AS atc_code,
    created_at,
    updated_at
FROM treatments

UNION ALL

SELECT 
    id,
    name,
    'medication' AS entity_type,
    category,
    NULL AS severity,
    NULL AS specialty,
    description,
    synonyms,
    NULL AS body_system,
    atc_code,
    created_at,
    updated_at
FROM medications;

-- ============================================================================
-- FONCTION DE RECHERCHE UNIFIÉE
-- ============================================================================

CREATE OR REPLACE FUNCTION search_medical_entities(
    p_search_term TEXT,
    p_entity_types TEXT[] DEFAULT ARRAY['pathology', 'symptom', 'treatment', 'medication']
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    entity_type TEXT,
    category TEXT,
    severity TEXT,
    match_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ume.id,
        ume.name,
        ume.entity_type,
        ume.category,
        ume.severity,
        CASE 
            WHEN LOWER(ume.name) = LOWER(p_search_term) THEN 1.0
            WHEN LOWER(ume.name) LIKE LOWER(p_search_term) || '%' THEN 0.9
            WHEN LOWER(ume.name) LIKE '%' || LOWER(p_search_term) || '%' THEN 0.7
            WHEN ume.synonyms IS NOT NULL AND 
                 EXISTS (SELECT 1 FROM unnest(ume.synonyms) s WHERE LOWER(s) LIKE '%' || LOWER(p_search_term) || '%') THEN 0.5
            ELSE 0.3
        END AS match_score
    FROM unified_medical_entities ume
    WHERE ume.entity_type = ANY(p_entity_types)
      AND (
          LOWER(ume.name) LIKE '%' || LOWER(p_search_term) || '%'
          OR (ume.synonyms IS NOT NULL AND 
              EXISTS (SELECT 1 FROM unnest(ume.synonyms) s WHERE LOWER(s) LIKE '%' || LOWER(p_search_term) || '%'))
      )
    ORDER BY match_score DESC, ume.name
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '=== Uniformisation terminée ===';
    RAISE NOTICE 'Colonnes ajoutées: category, severity, specialty, synonyms, updated_at';
    RAISE NOTICE 'Vue créée: unified_medical_entities';
    RAISE NOTICE 'Fonction créée: search_medical_entities(term, types[])';
END $$;
