-- Persist normalized cross-data searches and pair-level audit outcomes so
-- repeated or expanded searches can reuse existing synthesis work.

ALTER TABLE public.analysis_cache
  ADD COLUMN IF NOT EXISTS analysis_mode TEXT NOT NULL DEFAULT 'full_analysis',
  ADD COLUMN IF NOT EXISTS normalized_element_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS element_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pair_hashes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS covered_pair_hashes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_pair_hashes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS degraded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS degraded_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_analysis_cache_mode_updated
  ON public.analysis_cache(analysis_mode, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_element_count
  ON public.analysis_cache(analysis_mode, element_count DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_element_keys_gin
  ON public.analysis_cache USING gin(normalized_element_keys);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_pair_hashes_gin
  ON public.analysis_cache USING gin(pair_hashes);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_covered_pair_hashes_gin
  ON public.analysis_cache USING gin(covered_pair_hashes);

CREATE TABLE IF NOT EXISTS public.medical_pair_analysis_cache (
  pair_hash TEXT PRIMARY KEY,
  from_element TEXT NOT NULL,
  from_type TEXT NOT NULL CHECK (from_type IN ('pathology', 'symptom', 'treatment', 'medication')),
  to_element TEXT NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('pathology', 'symptom', 'treatment', 'medication')),
  from_key TEXT NOT NULL,
  to_key TEXT NOT NULL,
  element_keys TEXT[] NOT NULL DEFAULT '{}',
  has_direct_relation BOOLEAN NOT NULL DEFAULT false,
  causal_link_id UUID REFERENCES public.causal_links_cache(id) ON DELETE SET NULL,
  relationship TEXT,
  evidence_status TEXT NOT NULL DEFAULT 'no_data'
    CHECK (evidence_status IN ('confirmed', 'theoretical', 'no_data', 'contradictory')),
  analysis_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_model TEXT,
  source TEXT NOT NULL DEFAULT 'cross-data-analyzer',
  hit_count INTEGER NOT NULL DEFAULT 0,
  first_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_pair_cache_from_key
  ON public.medical_pair_analysis_cache(from_key);

CREATE INDEX IF NOT EXISTS idx_medical_pair_cache_to_key
  ON public.medical_pair_analysis_cache(to_key);

CREATE INDEX IF NOT EXISTS idx_medical_pair_cache_element_keys_gin
  ON public.medical_pair_analysis_cache USING gin(element_keys);

CREATE INDEX IF NOT EXISTS idx_medical_pair_cache_direct_updated
  ON public.medical_pair_analysis_cache(has_direct_relation, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_medical_pair_cache_causal_link
  ON public.medical_pair_analysis_cache(causal_link_id)
  WHERE causal_link_id IS NOT NULL;

ALTER TABLE public.medical_pair_analysis_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read medical_pair_analysis_cache"
  ON public.medical_pair_analysis_cache;
CREATE POLICY "Authenticated users can read medical_pair_analysis_cache"
  ON public.medical_pair_analysis_cache
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role manages medical_pair_analysis_cache"
  ON public.medical_pair_analysis_cache;
CREATE POLICY "Service role manages medical_pair_analysis_cache"
  ON public.medical_pair_analysis_cache
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role manages analysis_cache"
  ON public.analysis_cache;
CREATE POLICY "Service role manages analysis_cache"
  ON public.analysis_cache
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

COMMENT ON TABLE public.medical_pair_analysis_cache IS
  'Pair-level cross-data audit cache, including direct links and no-direct-relation outcomes, used to avoid re-auditing old concept pairs when a search is expanded.';

COMMENT ON COLUMN public.analysis_cache.normalized_element_keys IS
  'Stable typed medical element keys used for exact and subset/superset search reuse.';

COMMENT ON COLUMN public.analysis_cache.result_payload IS
  'Full cross-data response payload for exact repeated searches.';
