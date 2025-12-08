-- ============================================================================
-- SCRIPT : Ajout des données patient e1f5a7b8
-- Pathologies extraites des notes cliniques de l'image
-- ============================================================================

-- D'abord, créons les pathologies manquantes dans la base si elles n'existent pas

-- Asthme sévère
INSERT INTO pathologies (name, category, specialty, severity, description)
VALUES ('Asthme sévère', 'Respiratory', 'Pneumologie', 'severe', 'Maladie inflammatoire chronique des voies respiratoires avec symptômes sévères')
ON CONFLICT DO NOTHING;

-- Polypose nasosinuienne
INSERT INTO pathologies (name, category, specialty, severity, description)
VALUES ('Polypose nasosinusienne', 'ENT', 'ORL', 'moderate', 'Présence de polypes dans les sinus et fosses nasales')
ON CONFLICT DO NOTHING;

-- Syndrome de Widal (Intolérance à l''aspirine)
INSERT INTO pathologies (name, category, specialty, severity, description, synonyms)
VALUES ('Syndrome de Widal', 'Allergy', 'Allergologie', 'severe', 'Triade associant polypose nasosinusienne, asthme et intolérance à l''aspirine', ARRAY['Intolérance à l''aspirine', 'Syndrome de Samter', 'AERD'])
ON CONFLICT DO NOTHING;

-- Reflux gastro-oesophagien (RGO)
INSERT INTO pathologies (name, category, specialty, severity, description, synonyms)
VALUES ('Reflux gastro-oesophagien', 'Digestive', 'Gastroentérologie', 'mild', 'Remontée du contenu gastrique dans l''oesophage', ARRAY['RGO', 'GERD', 'Reflux acide'])
ON CONFLICT DO NOTHING;

-- BPCO
INSERT INTO pathologies (name, category, specialty, severity, description, synonyms)
VALUES ('BPCO', 'Respiratory', 'Pneumologie', 'moderate', 'Bronchopneumopathie Chronique Obstructive - maladie pulmonaire progressive', ARRAY['Bronchopneumopathie Chronique Obstructive', 'COPD'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Récupérer l'ID du patient e1f5a7b8
-- ============================================================================

DO $$
DECLARE
    v_patient_id UUID;
    v_pathology_id UUID;
BEGIN
    -- Trouver le patient
    SELECT id INTO v_patient_id
    FROM patients
    WHERE patient_id = 'e1f5a7b8';
    
    IF v_patient_id IS NULL THEN
        RAISE NOTICE 'Patient e1f5a7b8 non trouvé, création...';
        -- Si le patient n'existe pas, on peut le créer ou arrêter
        RETURN;
    END IF;
    
    RAISE NOTICE 'Patient trouvé: %', v_patient_id;
    
    -- Ajouter Asthme sévère
    SELECT id INTO v_pathology_id FROM pathologies WHERE LOWER(name) LIKE '%asthme sévère%' OR LOWER(name) LIKE '%severe asthma%' LIMIT 1;
    IF v_pathology_id IS NOT NULL THEN
        INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
        VALUES (v_patient_id, v_pathology_id, 'severe', 'chronic', 'Depuis l''adolescence')
        ON CONFLICT (patient_id, pathology_id) DO UPDATE SET notes = 'Depuis l''adolescence', updated_at = NOW();
        RAISE NOTICE 'Ajouté: Asthme sévère';
    END IF;
    
    -- Ajouter Polypose nasosinuienne
    SELECT id INTO v_pathology_id FROM pathologies WHERE LOWER(name) LIKE '%polypose%' LIMIT 1;
    IF v_pathology_id IS NOT NULL THEN
        INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
        VALUES (v_patient_id, v_pathology_id, 'moderate', 'resolved', 'Opérée en 2018')
        ON CONFLICT (patient_id, pathology_id) DO UPDATE SET notes = 'Opérée en 2018', status = 'resolved', updated_at = NOW();
        RAISE NOTICE 'Ajouté: Polypose nasosinuienne';
    END IF;
    
    -- Ajouter Syndrome de Widal
    SELECT id INTO v_pathology_id FROM pathologies WHERE LOWER(name) LIKE '%widal%' OR LOWER(name) LIKE '%intolérance%aspirine%' LIMIT 1;
    IF v_pathology_id IS NOT NULL THEN
        INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
        VALUES (v_patient_id, v_pathology_id, 'severe', 'chronic', 'Intolérance à l''aspirine - Syndrome de Widal')
        ON CONFLICT (patient_id, pathology_id) DO UPDATE SET notes = 'Intolérance à l''aspirine - Syndrome de Widal', updated_at = NOW();
        RAISE NOTICE 'Ajouté: Syndrome de Widal';
    END IF;
    
    -- Ajouter RGO
    SELECT id INTO v_pathology_id FROM pathologies WHERE LOWER(name) LIKE '%reflux%' OR LOWER(name) LIKE '%rgo%' OR LOWER(name) LIKE '%gerd%' LIMIT 1;
    IF v_pathology_id IS NOT NULL THEN
        INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status, notes)
        VALUES (v_patient_id, v_pathology_id, 'mild', 'active', 'Reflux gastro-oesophagien')
        ON CONFLICT (patient_id, pathology_id) DO UPDATE SET notes = 'Reflux gastro-oesophagien', updated_at = NOW();
        RAISE NOTICE 'Ajouté: Reflux gastro-oesophagien';
    END IF;
    
    RAISE NOTICE '=== Pathologies du patient e1f5a7b8 mises à jour ===';
END $$;

-- ============================================================================
-- Afficher les pathologies du patient après insertion
-- ============================================================================

SELECT 
    p.patient_id,
    path.name AS pathologie,
    pp.severity,
    pp.status,
    pp.notes
FROM patients p
JOIN patient_pathologies pp ON p.id = pp.patient_id
JOIN pathologies path ON pp.pathology_id = path.id
WHERE p.patient_id = 'e1f5a7b8'
ORDER BY path.name;
