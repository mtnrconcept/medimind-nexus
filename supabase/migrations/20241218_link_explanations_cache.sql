-- Cache for AI explanations of links between nodes
-- Avoids repeated AI calls for the same pair of nodes

CREATE TABLE IF NOT EXISTS public.link_explanations_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node identifiers (normalized: source < target alphabetically for consistency)
    source_name TEXT NOT NULL,
    target_name TEXT NOT NULL,
    
    -- Context
    pathology TEXT,
    relationship TEXT,
    evidence_grade TEXT,
    
    -- Cached explanation
    explanation TEXT NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    hit_count INTEGER DEFAULT 1,
    
    -- Unique constraint on node pair + pathology
    UNIQUE(source_name, target_name, pathology)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_link_cache_nodes 
ON public.link_explanations_cache(source_name, target_name);

CREATE INDEX IF NOT EXISTS idx_link_cache_pathology 
ON public.link_explanations_cache(pathology);

-- Enable RLS
ALTER TABLE public.link_explanations_cache ENABLE ROW LEVEL SECURITY;

-- Policy: anyone can read cache
CREATE POLICY "Anyone can read link cache" ON public.link_explanations_cache
    FOR SELECT USING (true);

-- Policy: anyone can insert (authenticated or anon for function calls)
CREATE POLICY "Anyone can insert link cache" ON public.link_explanations_cache
    FOR INSERT WITH CHECK (true);

-- Policy: anyone can update hit_count
CREATE POLICY "Anyone can update link cache" ON public.link_explanations_cache
    FOR UPDATE USING (true);

-- Function to update hit count on cache hit
CREATE OR REPLACE FUNCTION increment_link_cache_hit(cache_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.link_explanations_cache 
    SET hit_count = hit_count + 1,
        updated_at = NOW()
    WHERE id = cache_id;
END;
$$ LANGUAGE plpgsql;
