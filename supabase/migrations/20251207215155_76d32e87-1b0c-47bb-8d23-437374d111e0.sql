-- Ajouter les colonnes manquantes pour les données Compendium
ALTER TABLE public.medications 
ADD COLUMN IF NOT EXISTS manufacturer TEXT,
ADD COLUMN IF NOT EXISTS swissmedic_name TEXT,
ADD COLUMN IF NOT EXISTS pharmacode TEXT,
ADD COLUMN IF NOT EXISTS gtin TEXT,
ADD COLUMN IF NOT EXISTS dispensing_category TEXT,
ADD COLUMN IF NOT EXISTS characteristics TEXT,
ADD COLUMN IF NOT EXISTS composition TEXT;

-- Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_medications_pharmacode ON public.medications(pharmacode);
CREATE INDEX IF NOT EXISTS idx_medications_gtin ON public.medications(gtin);
CREATE INDEX IF NOT EXISTS idx_medications_atc ON public.medications(atc_code);