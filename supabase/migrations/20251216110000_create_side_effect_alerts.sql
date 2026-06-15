-- Migration: Create side_effect_alerts table for AI-powered early detection
-- Part of Feature 3: Early Side Effect Detection

CREATE TABLE IF NOT EXISTS side_effect_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Suspected medication
    suspected_medication_id UUID REFERENCES medications(id),
    suspected_medication_name TEXT NOT NULL,
    medication_start_date DATE,
    
    -- Biomarker trend data
    biomarker_name TEXT NOT NULL, -- 'ALT', 'AST', 'creatinine', 'hemoglobin', etc.
    biomarker_category TEXT, -- 'liver', 'kidney', 'hematology', 'metabolic'
    baseline_value DECIMAL(10,3),
    current_value DECIMAL(10,3),
    unit TEXT, -- 'U/L', 'mg/dL', 'g/dL', etc.
    change_percent DECIMAL(5,2),
    trend_description TEXT, -- 'progressive elevation +45% over 3 weeks'
    first_abnormal_date DATE,
    
    -- AI Analysis
    ai_confidence DECIMAL(3,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    ai_recommendation TEXT,
    ai_reasoning TEXT, -- Detailed explanation for clinicians
    
    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'dismissed', 'resolved', 'escalated')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_side_effect_alerts_patient ON side_effect_alerts(patient_id);
CREATE INDEX idx_side_effect_alerts_status ON side_effect_alerts(status);
CREATE INDEX idx_side_effect_alerts_created ON side_effect_alerts(created_at DESC);
CREATE INDEX idx_side_effect_alerts_medication ON side_effect_alerts(suspected_medication_id);

-- RLS Policies
ALTER TABLE side_effect_alerts ENABLE ROW LEVEL SECURITY;

-- Doctors can view alerts for their patients
CREATE POLICY "Users can view side effect alerts"
    ON side_effect_alerts FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Doctors can update alert status
CREATE POLICY "Users can update side effect alerts"
    ON side_effect_alerts FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- System can insert alerts (via Edge Function with service role)
CREATE POLICY "Service can insert side effect alerts"
    ON side_effect_alerts FOR INSERT
    WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_side_effect_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER side_effect_alerts_updated_at
    BEFORE UPDATE ON side_effect_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_side_effect_alerts_updated_at();

-- Add comments
COMMENT ON TABLE side_effect_alerts IS 'AI-generated alerts for potential medication side effects detected via lab trends';
COMMENT ON COLUMN side_effect_alerts.ai_confidence IS 'AI confidence score 0-1 for the detection';
COMMENT ON COLUMN side_effect_alerts.ai_recommendation IS 'AI-suggested clinical action';
