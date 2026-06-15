-- Corriger la dimension des vecteurs pour correspondre au modèle MiniLM (384)
-- Au cas où la table aurait été créée avec la dimension par défaut OpenAI (1536)

-- Pathologies
ALTER TABLE public.pathologies ALTER COLUMN embedding TYPE vector(384);
DROP INDEX IF EXISTS idx_pathologies_embedding;
CREATE INDEX idx_pathologies_embedding ON public.pathologies USING hnsw (embedding vector_cosine_ops);

-- Symptoms
ALTER TABLE public.symptoms ALTER COLUMN embedding TYPE vector(384);
DROP INDEX IF EXISTS idx_symptoms_embedding;
CREATE INDEX idx_symptoms_embedding ON public.symptoms USING hnsw (embedding vector_cosine_ops);

-- Treatments
ALTER TABLE public.treatments ALTER COLUMN embedding TYPE vector(384);
DROP INDEX IF EXISTS idx_treatments_embedding;
CREATE INDEX idx_treatments_embedding ON public.treatments USING hnsw (embedding vector_cosine_ops);

-- Medications
ALTER TABLE public.medications ALTER COLUMN embedding TYPE vector(384);
DROP INDEX IF EXISTS idx_medications_embedding;
CREATE INDEX idx_medications_embedding ON public.medications USING hnsw (embedding vector_cosine_ops);
