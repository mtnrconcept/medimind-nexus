-- ============================================================================
-- SCRIPT : Peuplement des tables de liaison patients
-- MediMind Nexus - Extraction et liaison des données patients
-- ============================================================================

-- ============================================================================
-- 1. MIGRATION DES PATHOLOGIES EXISTANTES (pathology_id -> patient_pathologies)
-- ============================================================================

INSERT INTO patient_pathologies (patient_id, pathology_id, status, severity)
SELECT 
    p.id AS patient_id,
    p.pathology_id,
    'active' AS status,
    COALESCE(path.severity, 'moderate') AS severity
FROM patients p
JOIN pathologies path ON p.pathology_id = path.id
WHERE p.pathology_id IS NOT NULL
ON CONFLICT (patient_id, pathology_id) DO NOTHING;

-- ============================================================================
-- 2. EXTRACTION DES PATHOLOGIES DEPUIS LES NOTES MÉDICALES
-- ============================================================================

-- Créer une fonction pour extraire les pathologies des notes
CREATE OR REPLACE FUNCTION extract_pathologies_from_notes()
RETURNS INTEGER AS $$
DECLARE
    patient_rec RECORD;
    pathology_rec RECORD;
    extracted_count INTEGER := 0;
    notes_lower TEXT;
BEGIN
    FOR patient_rec IN SELECT id, medical_notes_nlp FROM patients WHERE medical_notes_nlp IS NOT NULL
    LOOP
        notes_lower := LOWER(patient_rec.medical_notes_nlp);
        
        FOR pathology_rec IN 
            SELECT id, name, LOWER(name) AS name_lower, synonyms 
            FROM pathologies
        LOOP
            -- Vérifier si le nom de la pathologie est dans les notes
            IF notes_lower LIKE '%' || pathology_rec.name_lower || '%' THEN
                INSERT INTO patient_pathologies (patient_id, pathology_id, status, notes)
                VALUES (patient_rec.id, pathology_rec.id, 'active', 'Extrait des notes médicales')
                ON CONFLICT (patient_id, pathology_id) DO NOTHING;
                extracted_count := extracted_count + 1;
            -- Vérifier les synonymes
            ELSIF pathology_rec.synonyms IS NOT NULL AND array_length(pathology_rec.synonyms, 1) > 0 THEN
                FOR i IN 1..COALESCE(array_length(pathology_rec.synonyms, 1), 0)
                LOOP
                    IF notes_lower LIKE '%' || LOWER(pathology_rec.synonyms[i]) || '%' THEN
                        INSERT INTO patient_pathologies (patient_id, pathology_id, status, notes)
                        VALUES (patient_rec.id, pathology_rec.id, 'active', 'Extrait des notes (synonyme)')
                        ON CONFLICT (patient_id, pathology_id) DO NOTHING;
                        extracted_count := extracted_count + 1;
                        EXIT;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN extracted_count;
END;
$$ LANGUAGE plpgsql;

-- Exécuter l'extraction
SELECT extract_pathologies_from_notes();

-- ============================================================================
-- 3. EXTRACTION DES MÉDICAMENTS DEPUIS LE CHAMP TREATMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_medications_from_treatment()
RETURNS INTEGER AS $$
DECLARE
    patient_rec RECORD;
    medication_rec RECORD;
    extracted_count INTEGER := 0;
    treatment_lower TEXT;
BEGIN
    FOR patient_rec IN SELECT id, treatment FROM patients WHERE treatment IS NOT NULL AND treatment != ''
    LOOP
        treatment_lower := LOWER(patient_rec.treatment);
        
        FOR medication_rec IN 
            SELECT id, name, LOWER(name) AS name_lower, 
                   LOWER(COALESCE(substance, '')) AS substance_lower
            FROM medications
        LOOP
            -- Vérifier si le nom du médicament est dans le traitement
            IF treatment_lower LIKE '%' || medication_rec.name_lower || '%' 
               OR (medication_rec.substance_lower != '' AND treatment_lower LIKE '%' || medication_rec.substance_lower || '%')
            THEN
                INSERT INTO patient_medications (patient_id, medication_id, is_active, notes)
                VALUES (patient_rec.id, medication_rec.id, TRUE, 'Extrait du traitement')
                ON CONFLICT DO NOTHING;
                extracted_count := extracted_count + 1;
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN extracted_count;
END;
$$ LANGUAGE plpgsql;

-- Exécuter l'extraction
SELECT extract_medications_from_treatment();

-- ============================================================================
-- 4. LIAISON DES TRAITEMENTS AUX PATIENTS
-- ============================================================================

-- Lier les traitements standards aux patients selon leur pathologie
INSERT INTO patient_treatments (patient_id, treatment_id, is_active)
SELECT DISTINCT
    pp.patient_id,
    t.id AS treatment_id,
    TRUE AS is_active
FROM patient_pathologies pp
JOIN treatments t ON pp.pathology_id = t.pathology_id
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. LIAISON DES SYMPTÔMES AUX PATIENTS
-- ============================================================================

-- Lier les symptômes standards aux patients selon leur pathologie
INSERT INTO patient_symptoms (patient_id, symptom_id, is_resolved)
SELECT DISTINCT
    pp.patient_id,
    ps.symptom_id,
    FALSE AS is_resolved
FROM patient_pathologies pp
JOIN pathology_symptoms ps ON pp.pathology_id = ps.pathology_id
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. DONNÉES SPÉCIFIQUES PAR PATIENT (basé sur l'image fournie)
-- ============================================================================

-- Patient e1f5a7b8 - Données complètes
DO $$
DECLARE
    v_patient_id UUID;
    v_pathology_id UUID;
    v_med_id UUID;
BEGIN
    -- Récupérer l'ID du patient
    SELECT id INTO v_patient_id FROM patients WHERE patient_id = 'e1f5a7b8';
    
    IF v_patient_id IS NOT NULL THEN
        RAISE NOTICE 'Traitement du patient e1f5a7b8...';
        
        -- Asthme sévère
        SELECT id INTO v_pathology_id FROM pathologies 
        WHERE LOWER(name) LIKE '%asthme%' OR LOWER(name) LIKE '%asthma%' LIMIT 1;
        IF v_pathology_id IS NOT NULL THEN
            INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
            VALUES (v_patient_id, v_pathology_id, 'severe', 'chronic', 'Depuis l''adolescence')
            ON CONFLICT (patient_id, pathology_id) DO UPDATE SET severity = 'severe', notes = 'Depuis l''adolescence';
        END IF;
        
        -- Polypose nasosinuienne
        SELECT id INTO v_pathology_id FROM pathologies 
        WHERE LOWER(name) LIKE '%polypose%' OR LOWER(name) LIKE '%polyposis%' LIMIT 1;
        IF v_pathology_id IS NOT NULL THEN
            INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
            VALUES (v_patient_id, v_pathology_id, 'moderate', 'resolved', 'Opérée en 2018')
            ON CONFLICT (patient_id, pathology_id) DO UPDATE SET status = 'resolved', notes = 'Opérée en 2018';
        END IF;
        
        -- Syndrome de Widal / Intolérance aspirine
        SELECT id INTO v_pathology_id FROM pathologies 
        WHERE LOWER(name) LIKE '%widal%' OR LOWER(name) LIKE '%aspirine%' OR LOWER(name) LIKE '%aspirin%intolerance%' LIMIT 1;
        IF v_pathology_id IS NOT NULL THEN
            INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
            VALUES (v_patient_id, v_pathology_id, 'severe', 'chronic', 'Syndrome de Widal - Intolérance à l''aspirine')
            ON CONFLICT (patient_id, pathology_id) DO UPDATE SET severity = 'severe', notes = 'Syndrome de Widal';
        END IF;
        
        -- Reflux gastro-oesophagien
        SELECT id INTO v_pathology_id FROM pathologies 
        WHERE LOWER(name) LIKE '%reflux%' OR LOWER(name) LIKE '%rgo%' OR LOWER(name) LIKE '%gerd%' LIMIT 1;
        IF v_pathology_id IS NOT NULL THEN
            INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
            VALUES (v_patient_id, v_pathology_id, 'mild', 'active', 'RGO actif')
            ON CONFLICT (patient_id, pathology_id) DO UPDATE SET severity = 'mild';
        END IF;
        
        RAISE NOTICE 'Patient e1f5a7b8 traité avec succès';
    END IF;
END $$;

-- ============================================================================
-- 7. STATISTIQUES FINALES
-- ============================================================================

DO $$
DECLARE
    pp_count INTEGER;
    pm_count INTEGER;
    ps_count INTEGER;
    pt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO pp_count FROM patient_pathologies;
    SELECT COUNT(*) INTO pm_count FROM patient_medications;
    SELECT COUNT(*) INTO ps_count FROM patient_symptoms;
    SELECT COUNT(*) INTO pt_count FROM patient_treatments;
    
    RAISE NOTICE '=== Statistiques des liaisons ===';
    RAISE NOTICE 'patient_pathologies: % liaisons', pp_count;
    RAISE NOTICE 'patient_medications: % liaisons', pm_count;
    RAISE NOTICE 'patient_symptoms: % liaisons', ps_count;
    RAISE NOTICE 'patient_treatments: % liaisons', pt_count;
    RAISE NOTICE 'Total: % liaisons créées', pp_count + pm_count + ps_count + pt_count;
END $$;

-- ============================================================================
-- 8. VUE DE VÉRIFICATION
-- ============================================================================

-- Créer une vue pour vérifier les données d'un patient
CREATE OR REPLACE VIEW patient_medical_summary AS
SELECT 
    p.patient_id,
    p.age,
    p.gender,
    p.nationality,
    (SELECT COUNT(*) FROM patient_pathologies WHERE patient_id = p.id) AS pathologies_count,
    (SELECT COUNT(*) FROM patient_medications WHERE patient_id = p.id) AS medications_count,
    (SELECT COUNT(*) FROM patient_symptoms WHERE patient_id = p.id) AS symptoms_count,
    (SELECT COUNT(*) FROM patient_treatments WHERE patient_id = p.id) AS treatments_count,
    (SELECT string_agg(path.name, ', ') 
     FROM patient_pathologies pp 
     JOIN pathologies path ON pp.pathology_id = path.id 
     WHERE pp.patient_id = p.id) AS pathologies_list
FROM patients p;

-- ============================================================================
-- FIN DU SCRIPT
-- ============================================================================

-- Afficher les patients avec leurs pathologies
SELECT * FROM patient_medical_summary ORDER BY pathologies_count DESC LIMIT 20;
