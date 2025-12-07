-- Table des médicaments (substances actives)
CREATE TABLE public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  atc_code TEXT,
  substance TEXT,
  description TEXT,
  dosage_forms TEXT[],
  indications TEXT,
  posology TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table des effets secondaires
CREATE TABLE public.side_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT,
  body_system TEXT,
  description TEXT,
  severity TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table des interactions médicamenteuses
CREATE TABLE public.drug_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE,
  interacting_drug TEXT NOT NULL,
  interaction_type TEXT,
  severity TEXT,
  description TEXT,
  recommendation TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table des contre-indications
CREATE TABLE public.contraindications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID REFERENCES public.medications(id) ON DELETE CASCADE,
  condition TEXT NOT NULL,
  severity TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.side_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contraindications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for medications
CREATE POLICY "Authenticated users can view medications" 
ON public.medications FOR SELECT USING (true);

CREATE POLICY "Admins can manage medications" 
ON public.medications FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for side_effects
CREATE POLICY "Authenticated users can view side_effects" 
ON public.side_effects FOR SELECT USING (true);

CREATE POLICY "Admins can manage side_effects" 
ON public.side_effects FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for drug_interactions
CREATE POLICY "Authenticated users can view drug_interactions" 
ON public.drug_interactions FOR SELECT USING (true);

CREATE POLICY "Admins can manage drug_interactions" 
ON public.drug_interactions FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for contraindications
CREATE POLICY "Authenticated users can view contraindications" 
ON public.contraindications FOR SELECT USING (true);

CREATE POLICY "Admins can manage contraindications" 
ON public.contraindications FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_medications_updated_at
BEFORE UPDATE ON public.medications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_medications_atc_code ON public.medications(atc_code);
CREATE INDEX idx_medications_substance ON public.medications(substance);
CREATE INDEX idx_side_effects_medication_id ON public.side_effects(medication_id);
CREATE INDEX idx_drug_interactions_medication_id ON public.drug_interactions(medication_id);
CREATE INDEX idx_contraindications_medication_id ON public.contraindications(medication_id);