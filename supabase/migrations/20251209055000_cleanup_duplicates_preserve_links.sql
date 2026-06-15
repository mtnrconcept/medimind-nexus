-- ============================================================================
-- Migration: Nettoyage des doublons avec préservation des liens (v5)
-- Stratégie: Désactiver contraintes -> Update -> Nettoyer doublons -> Réactiver
-- ============================================================================

-- ============================================================================
-- 1. PATHOLOGIES
-- ============================================================================

CREATE TEMP TABLE pathologies_to_keep AS
SELECT DISTINCT ON (LOWER(name)) id, name
FROM pathologies
ORDER BY LOWER(name), created_at ASC NULLS LAST, id;

CREATE TEMP TABLE pathology_id_mapping AS
SELECT p.id AS old_id, pk.id AS new_id
FROM pathologies p
JOIN pathologies_to_keep pk ON LOWER(p.name) = LOWER(pk.name)
WHERE p.id != pk.id;

-- Mettre à jour les traitements
UPDATE treatments t
SET pathology_id = m.new_id
FROM pathology_id_mapping m
WHERE t.pathology_id = m.old_id;

-- Désactiver la contrainte sur pathology_symptoms
ALTER TABLE pathology_symptoms DROP CONSTRAINT IF EXISTS pathology_symptoms_pathology_id_symptom_id_key;

-- Mettre à jour pathology_symptoms
UPDATE pathology_symptoms ps
SET pathology_id = m.new_id
FROM pathology_id_mapping m
WHERE ps.pathology_id = m.old_id;

-- Supprimer les doublons dans pathology_symptoms (garder le premier)
DELETE FROM pathology_symptoms ps1
WHERE EXISTS (
    SELECT 1 FROM pathology_symptoms ps2
    WHERE ps2.pathology_id = ps1.pathology_id
      AND ps2.symptom_id = ps1.symptom_id
      AND ps2.id < ps1.id
);

-- Recréer la contrainte
ALTER TABLE pathology_symptoms ADD CONSTRAINT pathology_symptoms_pathology_id_symptom_id_key 
    UNIQUE (pathology_id, symptom_id);

-- Supprimer les doublons de pathologies
DELETE FROM pathologies
WHERE id NOT IN (SELECT id FROM pathologies_to_keep);

DROP TABLE pathology_id_mapping;
DROP TABLE pathologies_to_keep;

-- ============================================================================
-- 2. SYMPTOMS
-- ============================================================================

CREATE TEMP TABLE symptoms_to_keep AS
SELECT DISTINCT ON (LOWER(name)) id, name
FROM symptoms
ORDER BY LOWER(name), created_at ASC NULLS LAST, id;

CREATE TEMP TABLE symptom_id_mapping AS
SELECT s.id AS old_id, sk.id AS new_id
FROM symptoms s
JOIN symptoms_to_keep sk ON LOWER(s.name) = LOWER(sk.name)
WHERE s.id != sk.id;

-- Désactiver la contrainte sur pathology_symptoms
ALTER TABLE pathology_symptoms DROP CONSTRAINT IF EXISTS pathology_symptoms_pathology_id_symptom_id_key;

-- Mettre à jour pathology_symptoms
UPDATE pathology_symptoms ps
SET symptom_id = m.new_id
FROM symptom_id_mapping m
WHERE ps.symptom_id = m.old_id;

-- Supprimer les doublons dans pathology_symptoms
DELETE FROM pathology_symptoms ps1
WHERE EXISTS (
    SELECT 1 FROM pathology_symptoms ps2
    WHERE ps2.pathology_id = ps1.pathology_id
      AND ps2.symptom_id = ps1.symptom_id
      AND ps2.id < ps1.id
);

-- Recréer la contrainte
ALTER TABLE pathology_symptoms ADD CONSTRAINT pathology_symptoms_pathology_id_symptom_id_key 
    UNIQUE (pathology_id, symptom_id);

-- Supprimer les doublons de symptoms
DELETE FROM symptoms
WHERE id NOT IN (SELECT id FROM symptoms_to_keep);

DROP TABLE symptom_id_mapping;
DROP TABLE symptoms_to_keep;

-- ============================================================================
-- 3. MEDICATIONS
-- ============================================================================

CREATE TEMP TABLE medications_to_keep AS
SELECT DISTINCT ON (LOWER(name)) id, name
FROM medications
ORDER BY LOWER(name), created_at ASC NULLS LAST, id;

CREATE TEMP TABLE medication_id_mapping AS
SELECT m.id AS old_id, mk.id AS new_id
FROM medications m
JOIN medications_to_keep mk ON LOWER(m.name) = LOWER(mk.name)
WHERE m.id != mk.id;

-- Mettre à jour side_effects
UPDATE side_effects se
SET medication_id = m.new_id
FROM medication_id_mapping m
WHERE se.medication_id = m.old_id;

-- Mettre à jour drug_interactions
UPDATE drug_interactions di
SET medication_id = m.new_id
FROM medication_id_mapping m
WHERE di.medication_id = m.old_id;

-- Supprimer les doublons de medications
DELETE FROM medications
WHERE id NOT IN (SELECT id FROM medications_to_keep);

DROP TABLE medication_id_mapping;
DROP TABLE medications_to_keep;

-- ============================================================================
-- 4. TREATMENTS
-- ============================================================================

DELETE FROM treatments
WHERE id NOT IN (
    SELECT DISTINCT ON (LOWER(name), COALESCE(pathology_id::text, 'null')) id
    FROM treatments
    ORDER BY LOWER(name), COALESCE(pathology_id::text, 'null'), created_at ASC NULLS LAST, id
);

-- ============================================================================
-- 5. SIDE_EFFECTS
-- ============================================================================

DELETE FROM side_effects
WHERE id NOT IN (
    SELECT DISTINCT ON (LOWER(name), medication_id) id
    FROM side_effects
    ORDER BY LOWER(name), medication_id, created_at ASC NULLS LAST, id
);

-- ============================================================================
-- 6. DRUG_INTERACTIONS
-- ============================================================================

DELETE FROM drug_interactions
WHERE id NOT IN (
    SELECT DISTINCT ON (medication_id, LOWER(interacting_drug)) id
    FROM drug_interactions
    ORDER BY medication_id, LOWER(interacting_drug), created_at ASC NULLS LAST, id
);

-- ============================================================================
-- 7. Rapport final
-- ============================================================================

SELECT 'pathologies' AS table_name, COUNT(*) AS count FROM pathologies
UNION ALL
SELECT 'symptoms', COUNT(*) FROM symptoms
UNION ALL
SELECT 'medications', COUNT(*) FROM medications
UNION ALL
SELECT 'treatments', COUNT(*) FROM treatments
UNION ALL
SELECT 'side_effects', COUNT(*) FROM side_effects
UNION ALL
SELECT 'drug_interactions', COUNT(*) FROM drug_interactions
UNION ALL
SELECT 'pathology_symptoms', COUNT(*) FROM pathology_symptoms;
