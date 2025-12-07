-- Ajouter les colonnes manquantes pour les données Swissmedic
ALTER TABLE public.medications
ADD COLUMN IF NOT EXISTS swissmedic_number text UNIQUE,
ADD COLUMN IF NOT EXISTS authorization_type text,
ADD COLUMN IF NOT EXISTS medication_category text,
ADD COLUMN IF NOT EXISTS first_authorization_date date,
ADD COLUMN IF NOT EXISTS validity_duration text,
ADD COLUMN IF NOT EXISTS genetically_produced boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS narcotic_category text,
ADD COLUMN IF NOT EXISTS authorization_status text;

-- Créer un index sur le numéro Swissmedic pour les upserts rapides
CREATE INDEX IF NOT EXISTS idx_medications_swissmedic_number ON public.medications(swissmedic_number);