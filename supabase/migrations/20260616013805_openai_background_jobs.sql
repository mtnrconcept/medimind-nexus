-- Track provider-side background response ids so long OpenAI reasoning can
-- continue independently from Supabase Edge Function request lifetimes.

ALTER TABLE public.ai_analysis_jobs
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_response_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_provider_response
  ON public.ai_analysis_jobs(provider_name, provider_response_id)
  WHERE provider_response_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_provider_status
  ON public.ai_analysis_jobs(provider_name, provider_status, updated_at DESC)
  WHERE provider_response_id IS NOT NULL;
