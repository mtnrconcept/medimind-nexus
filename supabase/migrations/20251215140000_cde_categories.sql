-- ============================================
-- CDE Node Categories & User Edges
-- Hierarchical classification system + manual link creation
-- ============================================

-- ============================================
-- PART 1: Categories Table with Hierarchical Structure
-- ============================================

CREATE TABLE IF NOT EXISTS cde_node_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  parent_id UUID REFERENCES cde_node_categories(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL, -- 'substance', 'pathology', 'symptom', 'medication', 'treatment'
  code_prefix TEXT, -- ICD-10 or ATC prefix for auto-classification
  icon TEXT, -- Lucide icon name
  color TEXT, -- Hex color
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for hierarchical queries
CREATE INDEX IF NOT EXISTS idx_categories_parent ON cde_node_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_node_type ON cde_node_categories(node_type);
CREATE INDEX IF NOT EXISTS idx_categories_code_prefix ON cde_node_categories(code_prefix);

-- ============================================
-- PART 2: Add category_id to cde_nodes
-- ============================================

ALTER TABLE cde_nodes 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES cde_node_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cde_nodes_category ON cde_nodes(category_id);

-- ============================================
-- PART 3: User-created edges table
-- ============================================

CREATE TABLE IF NOT EXISTS cde_user_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  source_node_id UUID REFERENCES cde_nodes(id) ON DELETE CASCADE,
  target_node_id UUID REFERENCES cde_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  notes TEXT,
  confidence_score FLOAT DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  is_analyzed BOOLEAN DEFAULT false,
  analysis_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  analyzed_at TIMESTAMPTZ,
  UNIQUE(user_id, source_node_id, target_node_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_user_edges_user ON cde_user_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_edges_source ON cde_user_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_user_edges_target ON cde_user_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_user_edges_analyzed ON cde_user_edges(is_analyzed);

-- RLS
ALTER TABLE cde_node_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cde_user_edges ENABLE ROW LEVEL SECURITY;

-- Categories: readable by all authenticated users
CREATE POLICY "Authenticated users can read categories" ON cde_node_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access categories" ON cde_node_categories
  FOR ALL TO service_role USING (true);

-- User edges: users can only see and manage their own edges
CREATE POLICY "Users can read own edges" ON cde_user_edges
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create own edges" ON cde_user_edges
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own edges" ON cde_user_edges
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete own edges" ON cde_user_edges
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Service role full access user_edges" ON cde_user_edges
  FOR ALL TO service_role USING (true);

-- ============================================
-- PART 4: Seed default categories
-- ============================================

-- PATHOLOGIES by ICD-10 chapters
INSERT INTO cde_node_categories (name, name_fr, node_type, code_prefix, icon, color, sort_order) VALUES
('Infectious', 'Infectieuses', 'pathology', 'A,B', 'bug', '#ef4444', 1),
('Neoplasms', 'Tumeurs', 'pathology', 'C,D0,D1,D2,D3,D4', 'target', '#dc2626', 2),
('Blood', 'Sang et immunité', 'pathology', 'D5,D6,D7,D8', 'droplets', '#f97316', 3),
('Endocrine', 'Endocriniennes', 'pathology', 'E', 'activity', '#f59e0b', 4),
('Mental', 'Psychiatriques', 'pathology', 'F', 'brain', '#8b5cf6', 5),
('Nervous', 'Neurologiques', 'pathology', 'G', 'zap', '#a855f7', 6),
('Eye', 'Ophtalmologiques', 'pathology', 'H0,H1,H2,H3,H4,H5', 'eye', '#06b6d4', 7),
('Ear', 'ORL', 'pathology', 'H6,H7,H8,H9', 'ear', '#14b8a6', 8),
('Circulatory', 'Cardiovasculaires', 'pathology', 'I', 'heart', '#f43f5e', 9),
('Respiratory', 'Respiratoires', 'pathology', 'J', 'wind', '#0ea5e9', 10),
('Digestive', 'Digestives', 'pathology', 'K', 'utensils', '#84cc16', 11),
('Skin', 'Dermatologiques', 'pathology', 'L', 'scan', '#eab308', 12),
('Musculoskeletal', 'Musculosquelettiques', 'pathology', 'M', 'bone', '#78716c', 13),
('Genitourinary', 'Génito-urinaires', 'pathology', 'N', 'droplet', '#ec4899', 14),
('Pregnancy', 'Obstétrique', 'pathology', 'O', 'baby', '#f472b6', 15),
('Perinatal', 'Périnatales', 'pathology', 'P', 'baby', '#fb7185', 16),
('Congenital', 'Congénitales', 'pathology', 'Q', 'dna', '#a78bfa', 17),
('Symptoms', 'Signes et symptômes', 'pathology', 'R', 'alert-circle', '#fbbf24', 18),
('Injury', 'Traumatismes', 'pathology', 'S,T', 'shield-alert', '#64748b', 19),
('External', 'Causes externes', 'pathology', 'V,W,X,Y', 'alert-triangle', '#94a3b8', 20)
ON CONFLICT DO NOTHING;

-- SUBSTANCES by ATC first letter
INSERT INTO cde_node_categories (name, name_fr, node_type, code_prefix, icon, color, sort_order) VALUES
('Alimentary', 'Tube digestif', 'substance', 'A', 'utensils', '#84cc16', 1),
('Blood agents', 'Sang et hématopoïèse', 'substance', 'B', 'droplets', '#ef4444', 2),
('Cardiovascular', 'Cardiovasculaire', 'substance', 'C', 'heart', '#f43f5e', 3),
('Dermatologicals', 'Dermatologie', 'substance', 'D', 'scan', '#eab308', 4),
('Genitourinary', 'Génito-urinaire', 'substance', 'G', 'droplet', '#ec4899', 5),
('Hormones', 'Hormones', 'substance', 'H', 'activity', '#f59e0b', 6),
('Anti-infectives', 'Anti-infectieux', 'substance', 'J', 'shield', '#22c55e', 7),
('Antineoplastic', 'Antinéoplasiques', 'substance', 'L', 'target', '#dc2626', 8),
('Musculoskeletal', 'Musculosquelettique', 'substance', 'M', 'bone', '#78716c', 9),
('Nervous system', 'Système nerveux', 'substance', 'N', 'brain', '#8b5cf6', 10),
('Antiparasitic', 'Antiparasitaires', 'substance', 'P', 'bug', '#f97316', 11),
('Respiratory', 'Respiratoire', 'substance', 'R', 'wind', '#0ea5e9', 12),
('Sensory organs', 'Organes sensoriels', 'substance', 'S', 'eye', '#06b6d4', 13),
('Various', 'Divers', 'substance', 'V', 'package', '#94a3b8', 14)
ON CONFLICT DO NOTHING;

-- SYMPTOMS by body system
INSERT INTO cde_node_categories (name, name_fr, node_type, icon, color, sort_order) VALUES
('General', 'Généraux', 'symptom', 'thermometer', '#f59e0b', 1),
('Neurological', 'Neurologiques', 'symptom', 'brain', '#8b5cf6', 2),
('Cardiovascular', 'Cardiovasculaires', 'symptom', 'heart', '#f43f5e', 3),
('Respiratory', 'Respiratoires', 'symptom', 'wind', '#0ea5e9', 4),
('Digestive', 'Digestifs', 'symptom', 'utensils', '#84cc16', 5),
('Musculoskeletal', 'Musculosquelettiques', 'symptom', 'bone', '#78716c', 6),
('Skin', 'Cutanés', 'symptom', 'scan', '#eab308', 7),
('Psychiatric', 'Psychiatriques', 'symptom', 'brain', '#a855f7', 8)
ON CONFLICT DO NOTHING;

-- MEDICATIONS (inherit from substance categories)
INSERT INTO cde_node_categories (name, name_fr, node_type, icon, color, sort_order) VALUES
('Prescription', 'Sur ordonnance', 'medication', 'file-text', '#3b82f6', 1),
('OTC', 'Sans ordonnance', 'medication', 'package', '#22c55e', 2),
('Hospital', 'Usage hospitalier', 'medication', 'building-2', '#f97316', 3)
ON CONFLICT DO NOTHING;

-- TREATMENTS
INSERT INTO cde_node_categories (name, name_fr, node_type, icon, color, sort_order) VALUES
('Pharmacological', 'Pharmacologique', 'treatment', 'pill', '#3b82f6', 1),
('Surgical', 'Chirurgical', 'treatment', 'scissors', '#ef4444', 2),
('Physical', 'Physique', 'treatment', 'dumbbell', '#22c55e', 3),
('Psychological', 'Psychologique', 'treatment', 'brain', '#8b5cf6', 4),
('Lifestyle', 'Mode de vie', 'treatment', 'heart-pulse', '#ec4899', 5)
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 5: Function to auto-classify nodes
-- ============================================

CREATE OR REPLACE FUNCTION classify_cde_nodes()
RETURNS JSON AS $$
DECLARE
  v_classified INT := 0;
  result JSON;
BEGIN
  -- Classify pathologies by ICD code
  UPDATE cde_nodes n
  SET category_id = c.id
  FROM cde_node_categories c
  WHERE n.node_type = 'pathology'
    AND n.category_id IS NULL
    AND c.node_type = 'pathology'
    AND c.code_prefix IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(STRING_TO_ARRAY(c.code_prefix, ',')) prefix
      WHERE (n.properties->>'icd_code') LIKE (TRIM(prefix) || '%')
    );
  
  GET DIAGNOSTICS v_classified = ROW_COUNT;

  -- Classify substances by ATC code
  UPDATE cde_nodes n
  SET category_id = c.id
  FROM cde_node_categories c
  WHERE n.node_type = 'substance'
    AND n.category_id IS NULL
    AND c.node_type = 'substance'
    AND c.code_prefix IS NOT NULL
    AND (n.properties->>'atc_code') LIKE (c.code_prefix || '%');

  -- Assign default category for unclassified nodes
  UPDATE cde_nodes n
  SET category_id = (
    SELECT c.id FROM cde_node_categories c 
    WHERE c.node_type = n.node_type 
    ORDER BY c.sort_order 
    LIMIT 1
  )
  WHERE n.category_id IS NULL;

  SELECT COUNT(*) INTO v_classified FROM cde_nodes WHERE category_id IS NOT NULL;

  result := jsonb_build_object(
    'success', true,
    'classified_nodes', v_classified,
    'classified_at', now()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION classify_cde_nodes() TO authenticated;
GRANT EXECUTE ON FUNCTION classify_cde_nodes() TO service_role;

-- ============================================
-- PART 6: Function to get category tree
-- ============================================

CREATE OR REPLACE FUNCTION get_category_tree(p_node_type TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_fr TEXT,
  parent_id UUID,
  node_type TEXT,
  icon TEXT,
  color TEXT,
  node_count BIGINT,
  depth INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE category_tree AS (
    -- Base case: root categories
    SELECT 
      c.id, c.name, c.name_fr, c.parent_id, c.node_type, c.icon, c.color, c.sort_order,
      0 as depth
    FROM cde_node_categories c
    WHERE c.parent_id IS NULL
      AND (p_node_type IS NULL OR c.node_type = p_node_type)
    
    UNION ALL
    
    -- Recursive case: child categories
    SELECT 
      c.id, c.name, c.name_fr, c.parent_id, c.node_type, c.icon, c.color, c.sort_order,
      ct.depth + 1
    FROM cde_node_categories c
    JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT 
    ct.id, ct.name, ct.name_fr, ct.parent_id, ct.node_type, ct.icon, ct.color,
    COALESCE((SELECT COUNT(*) FROM cde_nodes n WHERE n.category_id = ct.id), 0) as node_count,
    ct.depth
  FROM category_tree ct
  ORDER BY ct.sort_order, ct.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_category_tree(TEXT) TO authenticated;
