-- Migration: Add hierarchical subcategories to Knowledge Graph
-- Enriches the category structure with detailed subcategories

-- ============================================
-- SECTION 1: PATHOLOGIES - Subcategories by ICD System
-- ============================================

-- Get the parent Pathologies category ID
DO $$
DECLARE
    v_pathologies_id UUID;
    v_medications_id UUID;
    v_symptoms_id UUID;
    v_treatments_id UUID;
    v_anatomy_id UUID;
BEGIN
    -- Get parent category IDs
    SELECT id INTO v_pathologies_id FROM cde_node_categories WHERE node_type = 'pathology' AND parent_id IS NULL LIMIT 1;
    SELECT id INTO v_medications_id FROM cde_node_categories WHERE node_type = 'medication' AND parent_id IS NULL LIMIT 1;
    SELECT id INTO v_symptoms_id FROM cde_node_categories WHERE node_type = 'symptom' AND parent_id IS NULL LIMIT 1;
    SELECT id INTO v_treatments_id FROM cde_node_categories WHERE node_type = 'treatment' AND parent_id IS NULL LIMIT 1;
    SELECT id INTO v_anatomy_id FROM cde_node_categories WHERE node_type = 'anatomy' AND parent_id IS NULL LIMIT 1;

    -- ============================================
    -- PATHOLOGIES SUBCATEGORIES (ICD-10 Chapters)
    -- ============================================
    IF v_pathologies_id IS NOT NULL THEN
        INSERT INTO cde_node_categories (name, name_fr, node_type, code_prefix, icon, color, parent_id, sort_order) VALUES
        ('Infectious Diseases', 'Maladies infectieuses', 'pathology', 'A-B', 'Bug', '#ef4444', v_pathologies_id, 1),
        ('Neoplasms', 'Néoplasmes / Tumeurs', 'pathology', 'C-D', 'CircleSlash', '#dc2626', v_pathologies_id, 2),
        ('Blood & Immune', 'Sang & Système immunitaire', 'pathology', 'D50-D89', 'Droplet', '#f97316', v_pathologies_id, 3),
        ('Endocrine & Metabolic', 'Endocrino-métaboliques', 'pathology', 'E', 'Zap', '#eab308', v_pathologies_id, 4),
        ('Mental & Behavioral', 'Troubles mentaux', 'pathology', 'F', 'Brain', '#a855f7', v_pathologies_id, 5),
        ('Nervous System', 'Système nerveux', 'pathology', 'G', 'Activity', '#8b5cf6', v_pathologies_id, 6),
        ('Eye Diseases', 'Maladies de l''œil', 'pathology', 'H0-H59', 'Eye', '#06b6d4', v_pathologies_id, 7),
        ('Ear Diseases', 'Maladies de l''oreille', 'pathology', 'H60-H95', 'Headphones', '#0ea5e9', v_pathologies_id, 8),
        ('Cardiovascular', 'Maladies cardiovasculaires', 'pathology', 'I', 'Heart', '#ef4444', v_pathologies_id, 9),
        ('Respiratory', 'Maladies respiratoires', 'pathology', 'J', 'Wind', '#10b981', v_pathologies_id, 10),
        ('Digestive', 'Maladies digestives', 'pathology', 'K', 'UtensilsCrossed', '#f59e0b', v_pathologies_id, 11),
        ('Skin & Subcutaneous', 'Maladies cutanées', 'pathology', 'L', 'Fingerprint', '#ec4899', v_pathologies_id, 12),
        ('Musculoskeletal', 'Système musculo-squelettique', 'pathology', 'M', 'Bone', '#6366f1', v_pathologies_id, 13),
        ('Genitourinary', 'Appareil génito-urinaire', 'pathology', 'N', 'Droplets', '#14b8a6', v_pathologies_id, 14),
        ('Pregnancy & Perinatal', 'Grossesse & Périnatalité', 'pathology', 'O-P', 'Baby', '#f472b6', v_pathologies_id, 15),
        ('Congenital Malformations', 'Malformations congénitales', 'pathology', 'Q', 'Dna', '#a78bfa', v_pathologies_id, 16)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ============================================
    -- MEDICATIONS SUBCATEGORIES (ATC Classification)
    -- ============================================
    IF v_medications_id IS NOT NULL THEN
        INSERT INTO cde_node_categories (name, name_fr, node_type, code_prefix, icon, color, parent_id, sort_order) VALUES
        ('Alimentary & Metabolism', 'Voies digestives & Métabolisme', 'medication', 'A', 'UtensilsCrossed', '#f59e0b', v_medications_id, 1),
        ('Blood & Hematopoietic', 'Sang & Organes hématopoïétiques', 'medication', 'B', 'Droplet', '#ef4444', v_medications_id, 2),
        ('Cardiovascular System', 'Système cardiovasculaire', 'medication', 'C', 'Heart', '#dc2626', v_medications_id, 3),
        ('Dermatologicals', 'Dermatologie', 'medication', 'D', 'Fingerprint', '#ec4899', v_medications_id, 4),
        ('Genitourinary & Sex Hormones', 'Génito-urinaire & Hormones', 'medication', 'G', 'Droplets', '#14b8a6', v_medications_id, 5),
        ('Systemic Hormones', 'Hormones systémiques', 'medication', 'H', 'Zap', '#eab308', v_medications_id, 6),
        ('Antiinfectives', 'Anti-infectieux', 'medication', 'J', 'Shield', '#10b981', v_medications_id, 7),
        ('Antineoplastic & Immunomodulating', 'Anticancéreux & Immunomodulateurs', 'medication', 'L', 'Target', '#a855f7', v_medications_id, 8),
        ('Musculoskeletal System', 'Système musculo-squelettique', 'medication', 'M', 'Bone', '#6366f1', v_medications_id, 9),
        ('Nervous System', 'Système nerveux', 'medication', 'N', 'Brain', '#8b5cf6', v_medications_id, 10),
        ('Antiparasitic', 'Antiparasitaires', 'medication', 'P', 'Bug', '#84cc16', v_medications_id, 11),
        ('Respiratory System', 'Système respiratoire', 'medication', 'R', 'Wind', '#06b6d4', v_medications_id, 12),
        ('Sensory Organs', 'Organes sensoriels', 'medication', 'S', 'Eye', '#0ea5e9', v_medications_id, 13),
        ('Various', 'Divers', 'medication', 'V', 'Package', '#64748b', v_medications_id, 14)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ============================================
    -- SYMPTOMS SUBCATEGORIES (By System)
    -- ============================================
    IF v_symptoms_id IS NOT NULL THEN
        INSERT INTO cde_node_categories (name, name_fr, node_type, icon, color, parent_id, sort_order) VALUES
        ('General Symptoms', 'Symptômes généraux', 'symptom', 'Thermometer', '#64748b', v_symptoms_id, 1),
        ('Pain Symptoms', 'Douleurs', 'symptom', 'AlertTriangle', '#ef4444', v_symptoms_id, 2),
        ('Neurological Symptoms', 'Symptômes neurologiques', 'symptom', 'Brain', '#8b5cf6', v_symptoms_id, 3),
        ('Respiratory Symptoms', 'Symptômes respiratoires', 'symptom', 'Wind', '#10b981', v_symptoms_id, 4),
        ('Cardiovascular Symptoms', 'Symptômes cardiovasculaires', 'symptom', 'Heart', '#ef4444', v_symptoms_id, 5),
        ('Digestive Symptoms', 'Symptômes digestifs', 'symptom', 'UtensilsCrossed', '#f59e0b', v_symptoms_id, 6),
        ('Dermatological Symptoms', 'Symptômes cutanés', 'symptom', 'Fingerprint', '#ec4899', v_symptoms_id, 7),
        ('Psychiatric Symptoms', 'Symptômes psychiatriques', 'symptom', 'Activity', '#a855f7', v_symptoms_id, 8),
        ('Musculoskeletal Symptoms', 'Symptômes musculo-squelettiques', 'symptom', 'Bone', '#6366f1', v_symptoms_id, 9),
        ('Urinary Symptoms', 'Symptômes urinaires', 'symptom', 'Droplets', '#14b8a6', v_symptoms_id, 10)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ============================================
    -- TREATMENTS SUBCATEGORIES (By Type)
    -- ============================================
    IF v_treatments_id IS NOT NULL THEN
        INSERT INTO cde_node_categories (name, name_fr, node_type, icon, color, parent_id, sort_order) VALUES
        ('Pharmacological', 'Traitements pharmacologiques', 'treatment', 'Pill', '#10b981', v_treatments_id, 1),
        ('Surgical', 'Chirurgies', 'treatment', 'Scissors', '#ef4444', v_treatments_id, 2),
        ('Radiotherapy', 'Radiothérapie', 'treatment', 'Zap', '#f59e0b', v_treatments_id, 3),
        ('Physiotherapy', 'Kinésithérapie', 'treatment', 'Move', '#06b6d4', v_treatments_id, 4),
        ('Psychotherapy', 'Psychothérapie', 'treatment', 'Brain', '#a855f7', v_treatments_id, 5),
        ('Diet & Lifestyle', 'Régime & Hygiène de vie', 'treatment', 'Apple', '#84cc16', v_treatments_id, 6),
        ('Alternative Medicine', 'Médecines alternatives', 'treatment', 'Leaf', '#22c55e', v_treatments_id, 7),
        ('Devices & Prosthetics', 'Appareillage & Prothèses', 'treatment', 'Cog', '#6366f1', v_treatments_id, 8),
        ('Transplantation', 'Transplantation', 'treatment', 'RefreshCw', '#dc2626', v_treatments_id, 9)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ============================================
    -- ANATOMY SUBCATEGORIES (By Region)
    -- ============================================
    IF v_anatomy_id IS NOT NULL THEN
        INSERT INTO cde_node_categories (name, name_fr, node_type, icon, color, parent_id, sort_order) VALUES
        ('Head & Neck', 'Tête & Cou', 'anatomy', 'User', '#8b5cf6', v_anatomy_id, 1),
        ('Thorax', 'Thorax', 'anatomy', 'Square', '#ef4444', v_anatomy_id, 2),
        ('Abdomen & Pelvis', 'Abdomen & Pelvis', 'anatomy', 'Circle', '#f59e0b', v_anatomy_id, 3),
        ('Limbs', 'Membres', 'anatomy', 'Move', '#10b981', v_anatomy_id, 4),
        ('Cardiovascular System', 'Système cardiovasculaire', 'anatomy', 'Heart', '#dc2626', v_anatomy_id, 5),
        ('Nervous System', 'Système nerveux', 'anatomy', 'Zap', '#a855f7', v_anatomy_id, 6),
        ('Digestive System', 'Système digestif', 'anatomy', 'UtensilsCrossed', '#f97316', v_anatomy_id, 7),
        ('Respiratory System', 'Système respiratoire', 'anatomy', 'Wind', '#06b6d4', v_anatomy_id, 8),
        ('Urinary System', 'Système urinaire', 'anatomy', 'Droplets', '#14b8a6', v_anatomy_id, 9),
        ('Endocrine System', 'Système endocrinien', 'anatomy', 'Activity', '#eab308', v_anatomy_id, 10)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ============================================
-- SECTION 2: Update get_category_tree function to include hierarchy depth
-- ============================================

CREATE OR REPLACE FUNCTION get_category_tree()
RETURNS TABLE (
    id UUID,
    name TEXT,
    name_fr TEXT,
    icon TEXT,
    color TEXT,
    node_type TEXT,
    node_count BIGINT,
    parent_id UUID,
    depth INTEGER,
    sort_order INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE category_tree AS (
        -- Base case: root categories
        SELECT 
            c.id,
            c.name,
            c.name_fr,
            c.icon,
            c.color,
            c.node_type,
            c.parent_id,
            c.sort_order,
            0 AS depth
        FROM cde_node_categories c
        WHERE c.parent_id IS NULL
        
        UNION ALL
        
        -- Recursive case: subcategories
        SELECT 
            c.id,
            c.name,
            c.name_fr,
            c.icon,
            c.color,
            c.node_type,
            c.parent_id,
            c.sort_order,
            ct.depth + 1 AS depth
        FROM cde_node_categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT 
        ct.id,
        ct.name,
        ct.name_fr,
        ct.icon,
        ct.color,
        ct.node_type,
        COALESCE((SELECT COUNT(*) FROM cde_nodes n WHERE n.category_id = ct.id), 0) AS node_count,
        ct.parent_id,
        ct.depth,
        ct.sort_order
    FROM category_tree ct
    ORDER BY ct.depth, ct.sort_order, ct.name;
END;
$$;
