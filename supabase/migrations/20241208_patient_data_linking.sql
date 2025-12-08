-- ============================================================================
-- MIGRATION : Tables de liaison pour le croisement des données patients
-- MediMind Nexus - Version 1.0
-- ============================================================================

-- ============================================================================
-- 1. CRÉATION DES TABLES DE LIAISON
-- ============================================================================

-- Table de liaison Patient <-> Pathologies (un patient peut avoir plusieurs pathologies)
CREATE TABLE IF NOT EXISTS patient_pathologies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    pathology_id UUID NOT NULL REFERENCES pathologies(id) ON DELETE CASCADE,
    diagnosis_date DATE,
    severity VARCHAR(50), -- 'mild', 'moderate', 'severe', 'critical'
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'resolved', 'chronic', 'remission'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(patient_id, pathology_id)
);

-- Table de liaison Patient <-> Médicaments (un patient peut prendre plusieurs médicaments)
CREATE TABLE IF NOT EXISTS patient_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    dosage VARCHAR(100), -- Ex: "500mg 2x/jour"
    frequency VARCHAR(100), -- Ex: "matin et soir"
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    prescribed_for TEXT, -- Indication/raison
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table de liaison Patient <-> Symptômes (un patient peut avoir plusieurs symptômes)
CREATE TABLE IF NOT EXISTS patient_symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    symptom_id UUID NOT NULL REFERENCES symptoms(id) ON DELETE CASCADE,
    onset_date DATE,
    severity VARCHAR(50), -- 'mild', 'moderate', 'severe'
    frequency VARCHAR(100), -- 'constant', 'intermittent', 'occasional'
    is_resolved BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table de liaison Patient <-> Traitements (un patient peut avoir plusieurs traitements)
CREATE TABLE IF NOT EXISTS patient_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    treatment_id UUID NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    effectiveness VARCHAR(50), -- 'effective', 'partially_effective', 'ineffective'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEX POUR OPTIMISER LES REQUÊTES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patient_pathologies_patient ON patient_pathologies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_pathologies_pathology ON patient_pathologies(pathology_id);

CREATE INDEX IF NOT EXISTS idx_patient_medications_patient ON patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_medication ON patient_medications(medication_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_active ON patient_medications(patient_id, is_active);

CREATE INDEX IF NOT EXISTS idx_patient_symptoms_patient ON patient_symptoms(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_symptoms_symptom ON patient_symptoms(symptom_id);

CREATE INDEX IF NOT EXISTS idx_patient_treatments_patient ON patient_treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_treatment ON patient_treatments(treatment_id);

-- ============================================================================
-- 3. FONCTION POUR EXTRAIRE LES DONNÉES EXISTANTES
-- ============================================================================

-- Fonction pour migrer la pathologie existante de chaque patient
CREATE OR REPLACE FUNCTION migrate_patient_pathology()
RETURNS INTEGER AS $$
DECLARE
    migrated_count INTEGER := 0;
    patient_record RECORD;
BEGIN
    FOR patient_record IN 
        SELECT id, pathology_id 
        FROM patients 
        WHERE pathology_id IS NOT NULL
    LOOP
        INSERT INTO patient_pathologies (patient_id, pathology_id, status)
        VALUES (patient_record.id, patient_record.pathology_id, 'active')
        ON CONFLICT (patient_id, pathology_id) DO NOTHING;
        
        migrated_count := migrated_count + 1;
    END LOOP;
    
    RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. EXÉCUTER LA MIGRATION DES DONNÉES EXISTANTES
-- ============================================================================

-- Migrer les pathologies existantes
SELECT migrate_patient_pathology();

-- ============================================================================
-- 5. POLICIES RLS (Row Level Security)
-- ============================================================================

-- Enable RLS sur les nouvelles tables
ALTER TABLE patient_pathologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_treatments ENABLE ROW LEVEL SECURITY;

-- Policies pour permettre l'accès aux utilisateurs authentifiés
CREATE POLICY "Authenticated users can read patient_pathologies"
ON patient_pathologies FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert patient_pathologies"
ON patient_pathologies FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update patient_pathologies"
ON patient_pathologies FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete patient_pathologies"
ON patient_pathologies FOR DELETE
TO authenticated
USING (true);

-- Répéter pour patient_medications
CREATE POLICY "Authenticated users can read patient_medications"
ON patient_medications FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert patient_medications"
ON patient_medications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update patient_medications"
ON patient_medications FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete patient_medications"
ON patient_medications FOR DELETE
TO authenticated
USING (true);

-- Répéter pour patient_symptoms
CREATE POLICY "Authenticated users can read patient_symptoms"
ON patient_symptoms FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert patient_symptoms"
ON patient_symptoms FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update patient_symptoms"
ON patient_symptoms FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete patient_symptoms"
ON patient_symptoms FOR DELETE
TO authenticated
USING (true);

-- Répéter pour patient_treatments
CREATE POLICY "Authenticated users can read patient_treatments"
ON patient_treatments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert patient_treatments"
ON patient_treatments FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update patient_treatments"
ON patient_treatments FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete patient_treatments"
ON patient_treatments FOR DELETE
TO authenticated
USING (true);

-- ============================================================================
-- 6. VUES POUR FACILITER LE CROISEMENT DES DONNÉES
-- ============================================================================

-- Vue complète d'un patient avec toutes ses données médicales
CREATE OR REPLACE VIEW patient_complete_profile AS
SELECT 
    p.id,
    p.patient_id,
    p.age,
    p.gender,
    p.nationality,
    p.height_cm,
    p.weight_kg,
    p.medical_notes_nlp,
    p.treatment,
    p.outcome,
    -- Pathologies (agrégées en JSON)
    (
        SELECT json_agg(json_build_object(
            'id', path.id,
            'name', path.name,
            'category', path.category,
            'severity', pp.severity,
            'status', pp.status
        ))
        FROM patient_pathologies pp
        JOIN pathologies path ON pp.pathology_id = path.id
        WHERE pp.patient_id = p.id
    ) AS pathologies_list,
    -- Médicaments (agrégés en JSON)
    (
        SELECT json_agg(json_build_object(
            'id', med.id,
            'name', med.name,
            'substance', med.substance,
            'atc_code', med.atc_code,
            'dosage', pm.dosage,
            'is_active', pm.is_active
        ))
        FROM patient_medications pm
        JOIN medications med ON pm.medication_id = med.id
        WHERE pm.patient_id = p.id
    ) AS medications_list,
    -- Symptômes (agrégés en JSON)
    (
        SELECT json_agg(json_build_object(
            'id', sym.id,
            'name', sym.name,
            'body_system', sym.body_system,
            'severity', ps.severity,
            'is_resolved', ps.is_resolved
        ))
        FROM patient_symptoms ps
        JOIN symptoms sym ON ps.symptom_id = sym.id
        WHERE ps.patient_id = p.id
    ) AS symptoms_list,
    -- Traitements (agrégés en JSON)
    (
        SELECT json_agg(json_build_object(
            'id', tr.id,
            'name', tr.name,
            'type', tr.type,
            'is_active', pt.is_active,
            'effectiveness', pt.effectiveness
        ))
        FROM patient_treatments pt
        JOIN treatments tr ON pt.treatment_id = tr.id
        WHERE pt.patient_id = p.id
    ) AS treatments_list
FROM patients p;

-- ============================================================================
-- 7. FONCTION POUR AJOUTER UNE PATHOLOGIE À UN PATIENT
-- ============================================================================

CREATE OR REPLACE FUNCTION add_patient_pathology(
    p_patient_id UUID,
    p_pathology_name TEXT,
    p_severity TEXT DEFAULT 'moderate',
    p_status TEXT DEFAULT 'active'
)
RETURNS UUID AS $$
DECLARE
    v_pathology_id UUID;
    v_result_id UUID;
BEGIN
    -- Chercher la pathologie par nom (insensible à la casse)
    SELECT id INTO v_pathology_id
    FROM pathologies
    WHERE LOWER(name) LIKE '%' || LOWER(p_pathology_name) || '%'
    LIMIT 1;
    
    IF v_pathology_id IS NULL THEN
        RAISE EXCEPTION 'Pathologie non trouvée: %', p_pathology_name;
    END IF;
    
    -- Insérer la liaison
    INSERT INTO patient_pathologies (patient_id, pathology_id, severity, status)
    VALUES (p_patient_id, v_pathology_id, p_severity, p_status)
    ON CONFLICT (patient_id, pathology_id) 
    DO UPDATE SET severity = p_severity, status = p_status, updated_at = NOW()
    RETURNING id INTO v_result_id;
    
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FONCTION POUR AJOUTER UN MÉDICAMENT À UN PATIENT
-- ============================================================================

CREATE OR REPLACE FUNCTION add_patient_medication(
    p_patient_id UUID,
    p_medication_name TEXT,
    p_dosage TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID AS $$
DECLARE
    v_medication_id UUID;
    v_result_id UUID;
BEGIN
    -- Chercher le médicament par nom ou substance
    SELECT id INTO v_medication_id
    FROM medications
    WHERE LOWER(name) LIKE '%' || LOWER(p_medication_name) || '%'
       OR LOWER(substance) LIKE '%' || LOWER(p_medication_name) || '%'
    LIMIT 1;
    
    IF v_medication_id IS NULL THEN
        RAISE EXCEPTION 'Médicament non trouvé: %', p_medication_name;
    END IF;
    
    -- Insérer la liaison
    INSERT INTO patient_medications (patient_id, medication_id, dosage, is_active)
    VALUES (p_patient_id, v_medication_id, p_dosage, p_is_active)
    RETURNING id INTO v_result_id;
    
    RETURN v_result_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================

-- Afficher un résumé
DO $$
BEGIN
    RAISE NOTICE '=== Migration terminée ===';
    RAISE NOTICE 'Tables créées: patient_pathologies, patient_medications, patient_symptoms, patient_treatments';
    RAISE NOTICE 'Vue créée: patient_complete_profile';
    RAISE NOTICE 'Fonctions créées: add_patient_pathology, add_patient_medication';
END $$;
