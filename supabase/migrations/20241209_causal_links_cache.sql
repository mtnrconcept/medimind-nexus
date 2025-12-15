-- Table pour stocker les liens de causalité générés par l'IA (cache)
CREATE TABLE IF NOT EXISTS causal_links_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Éléments liés
    from_element TEXT NOT NULL,
    from_type TEXT NOT NULL CHECK (from_type IN ('pathology', 'symptom', 'treatment', 'medication')),
    to_element TEXT NOT NULL,
    to_type TEXT NOT NULL CHECK (to_type IN ('pathology', 'symptom', 'treatment', 'medication')),
    
    -- Hash unique pour identifier la paire (pour éviter les doublons)
    pair_hash TEXT NOT NULL UNIQUE,
    
    -- Données du lien
    relationship TEXT NOT NULL,
    probability TEXT CHECK (probability IN ('high', 'medium', 'low')),
    evidence TEXT,
    is_appropriate BOOLEAN,
    effect_type TEXT CHECK (effect_type IN ('therapeutic', 'adverse', 'both')),
    therapeutic_details TEXT,
    adverse_details TEXT,
    danger_level TEXT CHECK (danger_level IN ('critical', 'high', 'moderate', 'low')),
    interaction_type TEXT CHECK (interaction_type IN ('drug-drug', 'drug-treatment', 'pathology-danger')),
    symptom_frequency TEXT CHECK (symptom_frequency IN ('principal', 'frequent', 'possible', 'rare')),
    
    -- Métadonnées
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    hit_count INTEGER DEFAULT 1, -- Nombre de fois que ce lien a été consulté
    ai_model TEXT, -- Modèle IA qui a généré ce lien
    
    -- Index pour recherche rapide
    CONSTRAINT unique_pair UNIQUE (from_element, from_type, to_element, to_type)
);

-- Index pour accélérer les recherches
CREATE INDEX IF NOT EXISTS idx_causal_links_from ON causal_links_cache (from_element, from_type);
CREATE INDEX IF NOT EXISTS idx_causal_links_to ON causal_links_cache (to_element, to_type);
CREATE INDEX IF NOT EXISTS idx_causal_links_pair_hash ON causal_links_cache (pair_hash);
CREATE INDEX IF NOT EXISTS idx_causal_links_types ON causal_links_cache (from_type, to_type);

-- Table pour les requêtes de groupe (plusieurs éléments)
CREATE TABLE IF NOT EXISTS analysis_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Hash de la requête (combinaison triée des IDs)
    request_hash TEXT NOT NULL UNIQUE,
    
    -- IDs des éléments analysés
    pathology_ids TEXT[] DEFAULT '{}',
    symptom_ids TEXT[] DEFAULT '{}',
    treatment_ids TEXT[] DEFAULT '{}',
    medication_ids TEXT[] DEFAULT '{}',
    
    -- Résultat complet de l'analyse
    summary TEXT,
    warnings TEXT[] DEFAULT '{}',
    recommendations TEXT[] DEFAULT '{}',
    
    -- Liens (références aux causal_links_cache)
    causal_link_ids UUID[] DEFAULT '{}',
    
    -- Métadonnées
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    hit_count INTEGER DEFAULT 1,
    ai_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_hash ON analysis_cache (request_hash);

-- Fonction pour générer le hash d'une paire d'éléments
CREATE OR REPLACE FUNCTION generate_pair_hash(
    p_from_element TEXT,
    p_from_type TEXT,
    p_to_element TEXT,
    p_to_type TEXT
) RETURNS TEXT AS $$
DECLARE
    normalized_from TEXT;
    normalized_to TEXT;
BEGIN
    -- Normaliser les noms (minuscules, sans accents)
    normalized_from := lower(unaccent(p_from_element));
    normalized_to := lower(unaccent(p_to_element));
    
    -- Créer un hash ordonné pour que A->B et B->A donnent le même résultat
    IF normalized_from < normalized_to THEN
        RETURN md5(normalized_from || '|' || p_from_type || '|' || normalized_to || '|' || p_to_type);
    ELSE
        RETURN md5(normalized_to || '|' || p_to_type || '|' || normalized_from || '|' || p_from_type);
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Fonction pour chercher un lien existant
CREATE OR REPLACE FUNCTION find_causal_link(
    p_from_element TEXT,
    p_from_type TEXT,
    p_to_element TEXT,
    p_to_type TEXT
) RETURNS SETOF causal_links_cache AS $$
DECLARE
    pair_hash_value TEXT;
BEGIN
    pair_hash_value := generate_pair_hash(p_from_element, p_from_type, p_to_element, p_to_type);
    
    -- Incrémenter le compteur de hits
    UPDATE causal_links_cache 
    SET hit_count = hit_count + 1, updated_at = NOW()
    WHERE pair_hash = pair_hash_value;
    
    -- Retourner le lien
    RETURN QUERY SELECT * FROM causal_links_cache WHERE pair_hash = pair_hash_value;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour insérer ou mettre à jour un lien
CREATE OR REPLACE FUNCTION upsert_causal_link(
    p_from_element TEXT,
    p_from_type TEXT,
    p_to_element TEXT,
    p_to_type TEXT,
    p_relationship TEXT,
    p_probability TEXT DEFAULT NULL,
    p_evidence TEXT DEFAULT NULL,
    p_is_appropriate BOOLEAN DEFAULT NULL,
    p_effect_type TEXT DEFAULT NULL,
    p_therapeutic_details TEXT DEFAULT NULL,
    p_adverse_details TEXT DEFAULT NULL,
    p_danger_level TEXT DEFAULT NULL,
    p_interaction_type TEXT DEFAULT NULL,
    p_symptom_frequency TEXT DEFAULT NULL,
    p_ai_model TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_pair_hash TEXT;
BEGIN
    v_pair_hash := generate_pair_hash(p_from_element, p_from_type, p_to_element, p_to_type);
    
    INSERT INTO causal_links_cache (
        from_element, from_type, to_element, to_type, pair_hash,
        relationship, probability, evidence, is_appropriate, effect_type,
        therapeutic_details, adverse_details, danger_level, interaction_type,
        symptom_frequency, ai_model
    ) VALUES (
        p_from_element, p_from_type, p_to_element, p_to_type, v_pair_hash,
        p_relationship, p_probability, p_evidence, p_is_appropriate, p_effect_type,
        p_therapeutic_details, p_adverse_details, p_danger_level, p_interaction_type,
        p_symptom_frequency, p_ai_model
    )
    ON CONFLICT (pair_hash) DO UPDATE SET
        relationship = EXCLUDED.relationship,
        probability = EXCLUDED.probability,
        evidence = EXCLUDED.evidence,
        is_appropriate = EXCLUDED.is_appropriate,
        effect_type = EXCLUDED.effect_type,
        therapeutic_details = EXCLUDED.therapeutic_details,
        adverse_details = EXCLUDED.adverse_details,
        danger_level = EXCLUDED.danger_level,
        interaction_type = EXCLUDED.interaction_type,
        symptom_frequency = EXCLUDED.symptom_frequency,
        updated_at = NOW(),
        hit_count = causal_links_cache.hit_count + 1
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Activer l'extension unaccent si pas déjà fait
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Politique RLS
ALTER TABLE causal_links_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migration)
DROP POLICY IF EXISTS "Allow read causal_links_cache" ON causal_links_cache;
DROP POLICY IF EXISTS "Allow read analysis_cache" ON analysis_cache;
DROP POLICY IF EXISTS "Allow insert causal_links_cache" ON causal_links_cache;
DROP POLICY IF EXISTS "Allow update causal_links_cache" ON causal_links_cache;
DROP POLICY IF EXISTS "Allow insert analysis_cache" ON analysis_cache;
DROP POLICY IF EXISTS "Allow update analysis_cache" ON analysis_cache;

-- Permettre la lecture à tous les utilisateurs authentifiés
CREATE POLICY "Allow read causal_links_cache" ON causal_links_cache
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read analysis_cache" ON analysis_cache
    FOR SELECT TO authenticated USING (true);

-- Permettre l'insertion/update via service role uniquement
CREATE POLICY "Allow insert causal_links_cache" ON causal_links_cache
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Allow update causal_links_cache" ON causal_links_cache
    FOR UPDATE TO service_role USING (true);

CREATE POLICY "Allow insert analysis_cache" ON analysis_cache
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Allow update analysis_cache" ON analysis_cache
    FOR UPDATE TO service_role USING (true);
