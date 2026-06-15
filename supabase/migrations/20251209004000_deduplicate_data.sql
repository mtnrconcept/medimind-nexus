-- Migration : Nettoyage des doublons dans les tables symptoms et treatments

BEGIN;

-- ============================================================================
-- 1. Nettoyage des SYMPTOMS (Dictionnaire global unique)
-- ============================================================================

-- Table temporaire pour identifier les groupes de doublons (même nom normalisé)
CREATE TEMP TABLE IF NOT EXISTS symptoms_dedup AS
SELECT 
    MIN(id::text)::uuid as keep_id,
    ARRAY_AGG(id) as all_ids,
    LOWER(TRIM(name)) as clean_name
FROM symptoms
GROUP BY LOWER(TRIM(name))
HAVING COUNT(*) > 1;

DO $$
DECLARE
    r RECORD;
    bad_id UUID;
    migrated_count INT := 0;
    deleted_count INT := 0;
BEGIN
    RAISE NOTICE 'Début du nettoyage des symptômes...';
    
    FOR r IN SELECT * FROM symptoms_dedup LOOP
        FOREACH bad_id IN ARRAY r.all_ids LOOP
            IF bad_id != r.keep_id THEN
                
                -- A. Rediriger les liens PATHOLOGY_SYMPTOMS
                BEGIN
                    UPDATE pathology_symptoms 
                    SET symptom_id = r.keep_id 
                    WHERE symptom_id = bad_id;
                EXCEPTION WHEN unique_violation THEN
                    -- Le lien vers keep_id existe déjà pour cette pathologie, donc le lien bad_id est inutile -> Supprimer
                    DELETE FROM pathology_symptoms WHERE symptom_id = bad_id;
                END;

                -- B. Rediriger les liens PATIENT_SYMPTOMS
                BEGIN
                    UPDATE patient_symptoms 
                    SET symptom_id = r.keep_id 
                    WHERE symptom_id = bad_id;
                EXCEPTION WHEN unique_violation THEN
                    DELETE FROM patient_symptoms WHERE symptom_id = bad_id;
                END;

                -- C. Supprimer le symptôme doublon
                DELETE FROM symptoms WHERE id = bad_id;
                deleted_count := deleted_count + 1;
                
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Symptômes nettoyés. % doublons supprimés.', deleted_count;
END $$;

-- ============================================================================
-- 2. Nettoyage des TREATMENTS (Doublons par Pathologie)
-- ============================================================================

-- Table temporaire pour identifier les traitements identiques AU SEIN D'UNE MÊME PATHOLOGIE
-- Note: On ne fusionne pas "Aspirine" (Grippe) et "Aspirine" (Rhume) car ce sont deux entités distinctes dans ce modèle
CREATE TEMP TABLE IF NOT EXISTS treatments_dedup AS
SELECT 
    MIN(id::text)::uuid as keep_id,
    ARRAY_AGG(id) as all_ids,
    pathology_id,
    LOWER(TRIM(name)) as clean_name
FROM treatments
GROUP BY pathology_id, LOWER(TRIM(name))
HAVING COUNT(*) > 1;

DO $$
DECLARE
    r RECORD;
    bad_id UUID;
    deleted_count INT := 0;
BEGIN
    RAISE NOTICE 'Début du nettoyage des traitements...';

    FOR r IN SELECT * FROM treatments_dedup LOOP
        FOREACH bad_id IN ARRAY r.all_ids LOOP
            IF bad_id != r.keep_id THEN
                
                -- A. Rediriger les liens PATIENT_TREATMENTS
                BEGIN
                    UPDATE patient_treatments 
                    SET treatment_id = r.keep_id 
                    WHERE treatment_id = bad_id;
                EXCEPTION WHEN unique_violation THEN
                    DELETE FROM patient_treatments WHERE treatment_id = bad_id;
                END;

                -- B. Supprimer le traitement doublon
                DELETE FROM treatments WHERE id = bad_id;
                deleted_count := deleted_count + 1;
                
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Traitements nettoyés. % doublons supprimés.', deleted_count;
END $$;

COMMIT;

-- ============================================================================
-- 3. Sécurisation : Index UNIQUE pour empêcher les futurs doublons
-- ============================================================================

-- SYMPTOMS : Nom unique globalement (insensible à la casse/espaces)
CREATE UNIQUE INDEX IF NOT EXISTS idx_symptoms_name_unique ON symptoms (LOWER(TRIM(name)));

-- TREATMENTS : Nom unique PAR pathologie
CREATE UNIQUE INDEX IF NOT EXISTS idx_treatments_name_pathology_unique ON treatments (pathology_id, LOWER(TRIM(name)));

ANALYZE symptoms;
ANALYZE treatments;
