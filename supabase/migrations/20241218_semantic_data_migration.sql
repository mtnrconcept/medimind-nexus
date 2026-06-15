-- ============================================
-- SEMANTIC MIND MAP - DATA MIGRATION (FIXED v2)
-- Populate semantic_nodes and semantic_edges from existing tables
-- Uses DISTINCT ON and correct column names
-- ============================================

-- ============================================
-- 1. MIGRATE PATHOLOGIES → SEMANTIC_NODES (PATHOLOGY)
-- ============================================

INSERT INTO semantic_nodes (node_type, label, description, attributes, source)
SELECT DISTINCT ON (name)
    'PATHOLOGY',
    name,
    description,
    jsonb_build_object(
        'icd_code', icd_code,
        'category', category,
        'severity', severity
    ),
    'local'
FROM pathologies
WHERE name IS NOT NULL AND TRIM(name) != ''
ORDER BY name, id
ON CONFLICT (node_type, label) DO UPDATE SET
    description = EXCLUDED.description,
    attributes = semantic_nodes.attributes || EXCLUDED.attributes,
    updated_at = now();

-- ============================================
-- 2. MIGRATE TREATMENTS → SEMANTIC_NODES (DRUG)
-- Note: treatments table has: id, pathology_id, name, type, description, contraindications
-- ============================================

INSERT INTO semantic_nodes (node_type, label, description, attributes, source)
SELECT DISTINCT ON (name)
    'DRUG',
    name,
    description,
    jsonb_build_object(
        'type', type,
        'contraindications', contraindications
    ),
    'local'
FROM treatments
WHERE name IS NOT NULL AND TRIM(name) != ''
ORDER BY name, id
ON CONFLICT (node_type, label) DO UPDATE SET
    description = EXCLUDED.description,
    attributes = semantic_nodes.attributes || EXCLUDED.attributes,
    updated_at = now();

-- ============================================
-- 3. MIGRATE MEDICATIONS → SEMANTIC_NODES (DRUG)
-- Note: medications table has: id, name, atc_code, substance, description, dosage_forms, indications, posology
-- ============================================

INSERT INTO semantic_nodes (node_type, label, description, attributes, source)
SELECT DISTINCT ON (name)
    'DRUG',
    name,
    description,
    jsonb_build_object(
        'atc_code', atc_code,
        'substance', substance,
        'dosage_forms', dosage_forms
    ),
    'local'
FROM medications
WHERE name IS NOT NULL AND TRIM(name) != ''
ORDER BY name, id
ON CONFLICT (node_type, label) DO UPDATE SET
    attributes = semantic_nodes.attributes || EXCLUDED.attributes,
    updated_at = now();

-- ============================================
-- 4. MIGRATE SYMPTOMS → SEMANTIC_NODES (SYMPTOM)
-- Note: symptoms table has: id, name, description, body_system
-- ============================================

INSERT INTO semantic_nodes (node_type, label, description, attributes, source)
SELECT DISTINCT ON (name)
    'SYMPTOM',
    name,
    description,
    jsonb_build_object(
        'body_system', body_system
    ),
    'local'
FROM symptoms
WHERE name IS NOT NULL AND TRIM(name) != ''
ORDER BY name, id
ON CONFLICT (node_type, label) DO UPDATE SET
    description = EXCLUDED.description,
    attributes = semantic_nodes.attributes || EXCLUDED.attributes,
    updated_at = now();

-- ============================================
-- 5. MIGRATE SIDE_EFFECTS → SEMANTIC_NODES (COMPLICATION)
-- Note: side_effects table has: id, medication_id, name, frequency, body_system, severity
-- ============================================

INSERT INTO semantic_nodes (node_type, label, description, attributes, source)
SELECT DISTINCT ON (name)
    'COMPLICATION',
    name,
    NULL as description,
    jsonb_build_object(
        'severity', severity,
        'frequency', frequency,
        'body_system', body_system
    ),
    'local'
FROM side_effects
WHERE name IS NOT NULL AND TRIM(name) != ''
ORDER BY name, id
ON CONFLICT (node_type, label) DO UPDATE SET
    attributes = semantic_nodes.attributes || EXCLUDED.attributes,
    updated_at = now();

-- ============================================
-- 6. CREATE EDGES: DRUG → PATHOLOGY (TREATS)
-- ============================================

INSERT INTO semantic_edges (source_node_id, target_node_id, edge_type, meta, source)
SELECT DISTINCT ON (drug_node.id, patho_node.id)
    drug_node.id as source_node_id,
    patho_node.id as target_node_id,
    'TREATS',
    jsonb_build_object(
        'direction', 'source_to_target',
        'weight', 0.8,
        'rationale', 'Traitement associé à la pathologie',
        'evidence_level', 'B'
    ),
    'local'
FROM treatments t
JOIN pathologies p ON t.pathology_id = p.id
JOIN semantic_nodes drug_node ON drug_node.label = t.name AND drug_node.node_type = 'DRUG'
JOIN semantic_nodes patho_node ON patho_node.label = p.name AND patho_node.node_type = 'PATHOLOGY'
WHERE t.pathology_id IS NOT NULL
ORDER BY drug_node.id, patho_node.id
ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING;

-- ============================================
-- 7. CREATE EDGES: PATHOLOGY → SYMPTOM (ASSOCIATED_WITH)
-- ============================================

INSERT INTO semantic_edges (source_node_id, target_node_id, edge_type, meta, source)
SELECT DISTINCT ON (patho_node.id, symptom_node.id)
    patho_node.id as source_node_id,
    symptom_node.id as target_node_id,
    'ASSOCIATED_WITH',
    jsonb_build_object(
        'direction', 'source_to_target',
        'weight', CASE WHEN ps.is_primary THEN 0.9 ELSE 0.6 END,
        'rationale', CASE WHEN ps.is_primary THEN 'Symptôme principal' ELSE 'Symptôme associé' END,
        'tags', CASE WHEN ps.is_primary THEN ARRAY['primary'] ELSE ARRAY['secondary'] END,
        'evidence_level', 'A'
    ),
    'local'
FROM pathology_symptoms ps
JOIN pathologies p ON ps.pathology_id = p.id
JOIN symptoms s ON ps.symptom_id = s.id
JOIN semantic_nodes patho_node ON patho_node.label = p.name AND patho_node.node_type = 'PATHOLOGY'
JOIN semantic_nodes symptom_node ON symptom_node.label = s.name AND symptom_node.node_type = 'SYMPTOM'
ORDER BY patho_node.id, symptom_node.id
ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING;

-- ============================================
-- 8. CREATE EDGES: DRUG → COMPLICATION (COMPLICATES - side effects)
-- ============================================

INSERT INTO semantic_edges (source_node_id, target_node_id, edge_type, meta, source)
SELECT DISTINCT ON (drug_node.id, complication_node.id)
    drug_node.id as source_node_id,
    complication_node.id as target_node_id,
    'COMPLICATES',
    jsonb_build_object(
        'direction', 'source_to_target',
        'weight', CASE 
            WHEN se.severity = 'severe' THEN 0.9 
            WHEN se.severity = 'moderate' THEN 0.7 
            ELSE 0.5 
        END,
        'rationale', 'Effet secondaire du médicament',
        'tags', ARRAY[COALESCE(se.severity, 'unknown'), COALESCE(se.frequency, 'unknown')],
        'evidence_level', 'B'
    ),
    'local'
FROM side_effects se
JOIN medications m ON se.medication_id = m.id
JOIN semantic_nodes drug_node ON drug_node.label = m.name AND drug_node.node_type = 'DRUG'
JOIN semantic_nodes complication_node ON complication_node.label = se.name AND complication_node.node_type = 'COMPLICATION'
WHERE se.medication_id IS NOT NULL
ORDER BY drug_node.id, complication_node.id
ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING;

-- ============================================
-- 9. CREATE EDGES: DRUG ↔ DRUG (INTERACTS_WITH)
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'drug_interactions') THEN
        INSERT INTO semantic_edges (source_node_id, target_node_id, edge_type, meta, source)
        SELECT DISTINCT ON (drug_node.id, drug2_node.id)
            drug_node.id as source_node_id,
            drug2_node.id as target_node_id,
            CASE 
                WHEN di.severity = 'major' THEN 'CONFLICTS_WITH'
                ELSE 'INTERACTS_WITH'
            END,
            jsonb_build_object(
                'direction', 'bidirectional',
                'weight', CASE 
                    WHEN di.severity = 'major' THEN 0.95 
                    WHEN di.severity = 'moderate' THEN 0.7 
                    ELSE 0.5 
                END,
                'rationale', COALESCE(di.description, 'Interaction médicamenteuse'),
                'tags', ARRAY[COALESCE(di.severity, 'unknown')],
                'evidence_level', 'B'
            ),
            'local'
        FROM drug_interactions di
        JOIN medications m ON di.medication_id = m.id
        JOIN semantic_nodes drug_node ON drug_node.label = m.name AND drug_node.node_type = 'DRUG'
        JOIN semantic_nodes drug2_node ON drug2_node.label ILIKE '%' || SPLIT_PART(di.interacting_drug, ' ', 1) || '%'
            AND drug2_node.node_type = 'DRUG'
            AND drug2_node.id != drug_node.id
        WHERE di.interacting_drug IS NOT NULL
        ORDER BY drug_node.id, drug2_node.id
        ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING;
    END IF;
END $$;

-- ============================================
-- 10. UPDATE KNOWLEDGE VERSION
-- ============================================

SELECT increment_knowledge_version('Initial data migration from existing tables');

-- ============================================
-- 11. LOG MIGRATION STATS
-- ============================================

DO $$
DECLARE
    node_count integer;
    edge_count integer;
BEGIN
    SELECT COUNT(*) INTO node_count FROM semantic_nodes;
    SELECT COUNT(*) INTO edge_count FROM semantic_edges;
    
    RAISE NOTICE 'Migration complete: % nodes, % edges', node_count, edge_count;
END $$;
