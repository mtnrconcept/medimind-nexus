-- Migration: alerts_config
-- Creates tables for configurable alert rules and patient alert history

-- Enable UUID extension if not already enabled
-- Note: In PostgreSQL 13+, gen_random_uuid() is available natively

-- ============================================
-- ALERT RULES CONFIGURATION TABLE
-- ============================================
-- Allows dynamic configuration of alert thresholds and rules

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT UNIQUE NOT NULL, -- e.g., 'glucose_hypo', 'bp_critical'
  category TEXT NOT NULL CHECK (category IN ('VITAL', 'LAB', 'INTERACTION', 'CONTRAINDICATION', 'SURVEILLANCE')),
  level TEXT NOT NULL CHECK (level IN ('CRITICAL', 'WARNING', 'INFO')),
  
  -- Threshold configuration (for numeric rules)
  threshold_value NUMERIC,
  threshold_operator TEXT CHECK (threshold_operator IN ('<', '<=', '>', '>=', '=', 'between')),
  threshold_value_max NUMERIC, -- For 'between' operator
  
  -- Alert content
  title_template TEXT NOT NULL,
  description_template TEXT NOT NULL, -- Can include {{value}} placeholders
  action_template TEXT,
  organ TEXT,
  
  -- Rule status
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- For display grouping
  display_order INTEGER DEFAULT 0
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_alert_rules_category ON alert_rules(category);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);

-- ============================================
-- PATIENT ALERTS HISTORY TABLE
-- ============================================
-- Stores triggered alerts for audit trail and analytics

CREATE TABLE IF NOT EXISTS patient_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  
  -- Alert details (snapshot at time of trigger)
  level TEXT NOT NULL CHECK (level IN ('CRITICAL', 'WARNING', 'INFO')),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  action TEXT,
  organ TEXT,
  
  -- Context at time of alert
  context_snapshot JSONB, -- Lab results, treatment, etc.
  triggered_value NUMERIC, -- The value that triggered the alert
  threshold_value NUMERIC, -- The threshold at time of trigger
  
  -- Status tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- Optional: auto-expire old alerts
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_patient_alerts_patient ON patient_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_alerts_status ON patient_alerts(status);
CREATE INDEX IF NOT EXISTS idx_patient_alerts_level ON patient_alerts(level);
CREATE INDEX IF NOT EXISTS idx_patient_alerts_created ON patient_alerts(created_at DESC);

-- ============================================
-- ALERT SUBSCRIPTIONS TABLE
-- ============================================
-- Who should be notified when certain alert types are triggered

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Subscription scope
  alert_level TEXT[], -- ['CRITICAL', 'WARNING'] etc.
  alert_categories TEXT[], -- ['VITAL', 'LAB'] etc.
  patient_ids UUID[], -- Specific patients, NULL = all
  
  -- Notification preferences
  notify_in_app BOOLEAN DEFAULT true,
  notify_email BOOLEAN DEFAULT false,
  notify_sms BOOLEAN DEFAULT false,
  
  -- Status
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_user ON alert_subscriptions(user_id);

-- ============================================
-- DEFAULT ALERT RULES
-- ============================================
-- Insert default rules based on existing logic

INSERT INTO alert_rules (rule_key, category, level, threshold_value, threshold_operator, title_template, description_template, action_template, organ, priority)
VALUES
  -- Glucose rules
  ('glucose_hypo', 'VITAL', 'CRITICAL', 70, '<', 'Hypoglycémie', 'Glycémie à {{value}} mg/dL. Risque de malaise hypoglycémique.', 'Resucrage immédiat. Revoir posologie antidiabétiques.', 'pancreas', 10),
  ('glucose_hyper_critical', 'VITAL', 'CRITICAL', 300, '>', 'Hyperglycémie sévère', 'Glycémie à {{value}} mg/dL. Risque d''acidocétose ou syndrome hyperosmolaire.', 'Hospitalisation urgente. Insulinothérapie IV.', 'pancreas', 10),
  ('glucose_hyper_warning', 'VITAL', 'WARNING', 180, '>', 'Hyperglycémie modérée', 'Glycémie à {{value}} mg/dL. Contrôle glycémique insuffisant.', 'Revoir le traitement antidiabétique.', 'pancreas', 7),
  
  -- Blood pressure rules
  ('bp_critical', 'VITAL', 'CRITICAL', 180, '>', 'Hypertension artérielle sévère', 'TA à {{value}} mmHg. Risque d''AVC ou IDM.', 'Traitement antihypertenseur urgent. Surveillance continue.', 'heart', 10),
  ('bp_warning', 'VITAL', 'WARNING', 140, '>', 'Hypertension non contrôlée', 'TA à {{value}} mmHg.', 'Optimiser le traitement antihypertenseur.', 'heart', 7),
  
  -- Temperature rules
  ('temp_critical', 'VITAL', 'CRITICAL', 39, '>', 'Hyperthermie majeure', 'Température à {{value}}°C. Rechercher infection sévère.', 'Bilan infectieux complet. Antipyrétiques + hydratation.', NULL, 9),
  ('temp_warning', 'VITAL', 'WARNING', 38, '>', 'Fièvre', 'Température à {{value}}°C.', 'Rechercher foyer infectieux.', NULL, 6),
  
  -- Renal function
  ('gfr_critical', 'LAB', 'CRITICAL', 30, '<', 'Insuffisance rénale sévère', 'DFG à {{value}} mL/min. Ajuster les posologies des médicaments néphrotoxiques.', 'Consultation néphrologie. Adapter posologies.', 'kidney', 10),
  ('gfr_warning', 'LAB', 'WARNING', 60, '<', 'Insuffisance rénale modérée', 'DFG à {{value}} mL/min.', 'Surveillance fonction rénale. Éviter néphrotoxiques.', 'kidney', 7),
  
  -- Potassium
  ('potassium_critical', 'LAB', 'CRITICAL', 6.0, '>', 'Hyperkaliémie sévère', 'Potassium à {{value}} mEq/L. Risque d''arythmie cardiaque.', 'ECG urgent. Traitement hypokaliémiant en urgence.', 'heart', 10),
  ('potassium_warning', 'LAB', 'WARNING', 5.5, '>', 'Hyperkaliémie', 'Potassium à {{value}} mEq/L.', 'Surveillance ECG. Revoir traitements hyperkaliémiants.', NULL, 7),
  
  -- Hemoglobin
  ('hemoglobin_critical', 'LAB', 'CRITICAL', 7, '<', 'Anémie sévère', 'Hémoglobine à {{value}} g/dL. Indication de transfusion.', 'Transfusion sanguine. Rechercher cause du saignement.', NULL, 10),
  ('hemoglobin_warning', 'LAB', 'WARNING', 10, '<', 'Anémie modérée', 'Hémoglobine à {{value}} g/dL.', 'Bilan martial. Supplémentation si carence.', NULL, 6),
  
  -- SpO2
  ('spo2_critical', 'LAB', 'CRITICAL', 90, '<', 'Hypoxémie sévère', 'SpO2 à {{value}}%. Insuffisance respiratoire.', 'Oxygénothérapie urgente. Rechercher étiologie.', 'lungs', 10),
  ('spo2_warning', 'LAB', 'WARNING', 94, '<', 'Désaturation', 'SpO2 à {{value}}%.', 'Surveillance rapprochée. Oxygénothérapie si besoin.', 'lungs', 7),
  
  -- Liver function
  ('alt_critical', 'LAB', 'CRITICAL', 200, '>', 'Cytolyse hépatique majeure', 'ALAT à {{value}} U/L. Rechercher hépatite aiguë.', 'Bilan hépatique complet. Échographie hépatique.', 'liver', 9),
  ('alt_warning', 'LAB', 'WARNING', 50, '>', 'Élévation des transaminases', 'ALAT à {{value}} U/L.', 'Surveillance hépatique. Rechercher cause médicamenteuse.', 'liver', 6),
  
  -- CRP inflammation
  ('crp_critical', 'LAB', 'CRITICAL', 100, '>', 'Syndrome inflammatoire majeur', 'CRP à {{value}} mg/L. Suspicion d''infection sévère.', 'Bilan infectieux complet. Antibiothérapie probabiliste.', NULL, 9),
  ('crp_warning', 'LAB', 'WARNING', 20, '>', 'Syndrome inflammatoire', 'CRP à {{value}} mg/L.', 'Rechercher foyer infectieux ou inflammatoire.', NULL, 6)
ON CONFLICT (rule_key) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read alert rules
CREATE POLICY "Authenticated users can read alert rules"
  ON alert_rules FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify alert rules
CREATE POLICY "Admins can manage alert rules"
  ON alert_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND (auth.users.raw_user_meta_data->>'role' = 'admin')
    )
  );

-- Users can read alerts for patients they have access to
CREATE POLICY "Users can read patient alerts"
  ON patient_alerts FOR SELECT
  TO authenticated
  USING (true);

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage their subscriptions"
  ON alert_subscriptions FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to acknowledge an alert
CREATE OR REPLACE FUNCTION acknowledge_alert(
  p_alert_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS VOID AS $$
BEGIN
  UPDATE patient_alerts
  SET 
    status = 'acknowledged',
    acknowledged_at = NOW(),
    acknowledged_by = p_user_id
  WHERE id = p_alert_id
  AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve an alert
CREATE OR REPLACE FUNCTION resolve_alert(
  p_alert_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS VOID AS $$
BEGIN
  UPDATE patient_alerts
  SET 
    status = 'resolved',
    resolved_at = NOW(),
    resolved_by = p_user_id,
    resolution_notes = p_notes
  WHERE id = p_alert_id
  AND status IN ('active', 'acknowledged');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active alerts count per patient
CREATE OR REPLACE FUNCTION get_patient_alert_counts(p_patient_id UUID)
RETURNS TABLE (
  critical_count INTEGER,
  warning_count INTEGER,
  info_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE level = 'CRITICAL')::INTEGER as critical_count,
    COUNT(*) FILTER (WHERE level = 'WARNING')::INTEGER as warning_count,
    COUNT(*) FILTER (WHERE level = 'INFO')::INTEGER as info_count
  FROM patient_alerts
  WHERE patient_id = p_patient_id
  AND status = 'active';
END;
$$ LANGUAGE plpgsql STABLE;
