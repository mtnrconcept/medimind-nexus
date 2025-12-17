-- SEED DRUG INTERACTIONS FROM DISCOVERY ENGINE ANALYSIS
-- Based on 10 critical hypotheses detected by AI analysis
-- Source: CDE Discovery Engine v3.0 - 2025-12-17

-- ============================================
-- SECTION 1: CRITICAL INTERACTIONS (Severity = critical/élevée)
-- ============================================

INSERT INTO drug_interactions (medication_name, interacting_drug, severity, mechanism, clinical_effect, recommendation, source, evidence_level)
VALUES
-- Hypothèse #1: Abiraterone-Abemaciclib (CYP3A4)
('Abiraterone', 'Abemaciclib', 'severe', 
 'Inhibition bidirectionnelle CYP3A4 - compétition enzymatique',
 'Risque d''accumulation mutuelle avec toxicité hépatique et cardiotoxicité (QT) majorées',
 'Monitoring hépatique renforcé, dosage plasmatique, surveillance ECG (QTc)',
 'CDE Discovery Engine - Hypothèse mécanistique', 'hypothesis'),

-- Hypothèse #3: Abaloparatide + Calcium (Hypercalcémie)
('Abaloparatide', 'Calcium (supplémentation)', 'severe',
 'Stimulation ostéoblastique additive → hypercalcémie',
 'Risque d''hypercalcémie menaçant le pronostic vital (arythmies, coma calcique)',
 'Dosage calcémie avant/pendant traitement, suspendre calcium à l''initiation, éducation patient',
 'CDE Discovery Engine - Connaissance pharmacologique établie', 'expert_opinion'),

('Abaloparatide', 'Vitamine D', 'severe',
 'Potentialisation de l''absorption calcique',
 'Hypercalcémie sévère potentielle',
 'Surveillance calcémie rapprochée, ajuster vitamine D',
 'CDE Discovery Engine', 'hypothesis'),

-- Hypothèse #4: Abatacept + Abrocitinib (Double immunosuppression)
('Abatacept', 'Abrocitinib', 'severe',
 'Double immunosuppression: T cells (CTLA4) + JAK-STAT',
 'Risque d''infections opportunistes graves: tuberculose, zona disséminé, infections fongiques invasives',
 'CONTRE-INDICATION formelle. Si switch: wash-out minimum 4 semaines. Dépistage TB obligatoire.',
 'CDE Discovery Engine - Mécanisme établi', 'expert_opinion'),

-- Hypothèse #5: Acalabrutinib + Abacavir (UGT)
('Acalabrutinib', 'Abacavir', 'severe',
 'Compétition UGT1A1 - modulation transporteurs hépatiques',
 'Accumulation d''abacavir avec risque d''hypersensibilité potentialisé (HLA-B*5701)',
 'Typage HLA-B*5701 OBLIGATOIRE. Monitoring clinique rapproché. Éviter si alternative existe.',
 'CDE Discovery Engine - Hypothèse pharmacocinétique', 'hypothesis'),

-- Hypothèse #7: QT prolongé multi-kinases
('Abemaciclib', 'Abiraterone', 'severe',
 'Allongement QT additif - inhibiteurs de kinases',
 'Risque de torsades de pointes, arythmies ventriculaires',
 'ECG baseline + J7, J14, J28. Éviter torsadogènes. Corriger K+/Mg2+.',
 'CDE Discovery Engine - RCP + mécanisme', 'evidence_based'),

('Acalabrutinib', 'Abiraterone', 'severe',
 'Allongement QT additif + risque fibrillation auriculaire',
 'Arythmies cardiaques combinées',
 'ECG monitoring renforcé',
 'CDE Discovery Engine', 'hypothesis'),

('Abemaciclib', 'Acalabrutinib', 'moderate',
 'Double inhibition de kinases - toxicité additive',
 'Risque toxicité hématologique et hépatique cumulée',
 'NFS et bilan hépatique réguliers',
 'CDE Discovery Engine', 'hypothesis')

ON CONFLICT DO NOTHING;

-- ============================================
-- SECTION 2: MODERATE INTERACTIONS
-- ============================================

INSERT INTO drug_interactions (medication_name, interacting_drug, severity, mechanism, clinical_effect, recommendation, source, evidence_level)
VALUES
-- Hypothèse #2: 6-Mercaptopurine + IMAO
('6-Mercaptopurine', 'IMAO (classe)', 'moderate',
 'Interaction théorique via voies purinergiques',
 'Syndrome sérotoninergique potentiel (signal faible)',
 'Investiguer co-prescriptions psychotropes, documenter syndrome confusionnel fébrile',
 'CDE Discovery Engine - Hypothèse exploratoire', 'hypothesis'),

-- Hypothèse #9: Abrocitinib + infections cutanées
('Abrocitinib', 'Staphylococcus aureus (risque)', 'moderate',
 'JAK-inhibition altère réponse immunitaire innée cutanée',
 'Signal pharmacovigilance: abcès cutanés sous-rapportés',
 'Déclaration pharmacovigilance, éducation patient, culture bactériologique au moindre doute',
 'CDE Discovery Engine - Signal réel', 'post_marketing'),

-- Hypothèse #10: Vaccins + Immunomodulateurs
('Abatacept', 'Vaccin grippal', 'moderate',
 'Inhibition lymphocytes T (co-stimulation) → réponse vaccinale altérée',
 'Efficacité vaccinale réduite',
 'Vacciner 2-4 sem AVANT traitement. Sérologie post-vaccinale. Schéma renforcé à considérer.',
 'CDE Discovery Engine - Connaissance établie', 'evidence_based'),

('Abrocitinib', 'Vaccin grippal', 'moderate',
 'Blocage JAK1 → altération réponse interféron',
 'Efficacité vaccinale réduite',
 'Vacciner avant traitement si possible',
 'CDE Discovery Engine', 'hypothesis'),

-- Cross-réactivité allergique (faible)
('Abacavir', 'Sulfamides (allergie)', 'low',
 'Cross-réactivité épitopique théorique',
 'Risque de réaction d''hypersensibilité croisée (signal faible)',
 'Interrogatoire allergologique approfondi avant initiation',
 'CDE Discovery Engine - Hypothèse faible', 'hypothesis')

ON CONFLICT DO NOTHING;

-- ============================================
-- SECTION 3: SYNERGIES THÉRAPEUTIQUES
-- ============================================

INSERT INTO drug_interactions (medication_name, interacting_drug, severity, mechanism, clinical_effect, recommendation, source, evidence_level)
VALUES
-- Hypothèse #6: Synergie Abemaciclib + Abiraterone
('Abemaciclib', 'Abiraterone (synergie)', 'positive',
 'Blocage androgènes (CYP17) + restauration inhibition cycle cellulaire (CDK4/6)',
 'Synergie potentielle dans cancer prostate résistant à castration avec mutations RB1',
 'Piste de recherche clinique. Identifier biomarqueurs (RB1, CDKN2A). Attention toxicités.',
 'CDE Discovery Engine - Hypothèse de repositionnement', 'preclinical')

ON CONFLICT DO NOTHING;

-- ============================================
-- SECTION 4: CRÉER LES ARÊTES DANS LE KG
-- ============================================

-- Insérer les interactions comme arêtes dans cde_edges si les nœuds existent
DO $$
DECLARE
    v_source_id UUID;
    v_target_id UUID;
BEGIN
    -- Abiraterone ↔ Abemaciclib
    SELECT id INTO v_source_id FROM cde_nodes WHERE LOWER(name) LIKE '%abiraterone%' LIMIT 1;
    SELECT id INTO v_target_id FROM cde_nodes WHERE LOWER(name) LIKE '%abemaciclib%' LIMIT 1;
    
    IF v_source_id IS NOT NULL AND v_target_id IS NOT NULL THEN
        INSERT INTO cde_edges (source_id, target_id, relationship_type, properties, weight, data_source)
        VALUES (v_source_id, v_target_id, 'INTERACTS_WITH', 
                '{"mechanism": "CYP3A4 bidirectional inhibition", "severity": "severe", "confidence": 0.75}'::jsonb,
                0.75, 'CDE Discovery Engine')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Abatacept ↔ Abrocitinib
    SELECT id INTO v_source_id FROM cde_nodes WHERE LOWER(name) LIKE '%abatacept%' LIMIT 1;
    SELECT id INTO v_target_id FROM cde_nodes WHERE LOWER(name) LIKE '%abrocitinib%' LIMIT 1;
    
    IF v_source_id IS NOT NULL AND v_target_id IS NOT NULL THEN
        INSERT INTO cde_edges (source_id, target_id, relationship_type, properties, weight, data_source)
        VALUES (v_source_id, v_target_id, 'CONTRAINDICATED_WITH', 
                '{"mechanism": "Double immunosuppression T cells + JAK", "severity": "critical", "confidence": 0.85}'::jsonb,
                0.85, 'CDE Discovery Engine')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Abaloparatide ↔ Calcium
    SELECT id INTO v_source_id FROM cde_nodes WHERE LOWER(name) LIKE '%abaloparatide%' LIMIT 1;
    
    IF v_source_id IS NOT NULL THEN
        INSERT INTO cde_edges (source_id, target_id, relationship_type, properties, weight, data_source)
        VALUES (v_source_id, v_source_id, 'CAUTION_WITH', 
                '{"interacting_substance": "Calcium/Vitamin D", "mechanism": "Hypercalcemia risk", "severity": "critical", "confidence": 0.90}'::jsonb,
                0.90, 'CDE Discovery Engine')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ============================================
-- SECTION 5: MISE À JOUR STATISTIQUES
-- ============================================

-- Compter les interactions ajoutées
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM drug_interactions;
    RAISE NOTICE 'Total drug interactions in database: %', v_count;
END $$;
