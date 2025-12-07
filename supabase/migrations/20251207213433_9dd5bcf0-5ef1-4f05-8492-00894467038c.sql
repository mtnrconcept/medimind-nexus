-- Ajouter les champs d'identité aux patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Index pour la recherche rapide
CREATE INDEX IF NOT EXISTS idx_patients_last_name ON public.patients(last_name);
CREATE INDEX IF NOT EXISTS idx_patients_first_name ON public.patients(first_name);
CREATE INDEX IF NOT EXISTS idx_patients_date_of_birth ON public.patients(date_of_birth);