-- Store asynchronous AI analysis jobs so long model work does not block the
-- browser request/response lifecycle.

CREATE TABLE IF NOT EXISTS public.ai_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token UUID NOT NULL DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  analysis_mode TEXT NOT NULL DEFAULT 'full_analysis',
  status TEXT NOT NULL DEFAULT 'queued',
  progress_percentage INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_message TEXT,
  model TEXT,
  reasoning_effort TEXT,
  degraded BOOLEAN NOT NULL DEFAULT false,
  degraded_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_analysis_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  CONSTRAINT ai_analysis_jobs_progress_check
    CHECK (progress_percentage >= 0 AND progress_percentage <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analysis_jobs_public_token
  ON public.ai_analysis_jobs(public_token);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status_created
  ON public.ai_analysis_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_function_status
  ON public.ai_analysis_jobs(function_name, status, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_completed
  ON public.ai_analysis_jobs(completed_at DESC)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_updated
  ON public.ai_analysis_jobs(updated_at DESC);

ALTER TABLE public.ai_analysis_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages ai_analysis_jobs" ON public.ai_analysis_jobs;
CREATE POLICY "Service role manages ai_analysis_jobs"
  ON public.ai_analysis_jobs
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

COMMENT ON TABLE public.ai_analysis_jobs IS 'Tracks asynchronous AI analysis jobs to avoid browser and Edge Function request timeouts.';
COMMENT ON COLUMN public.ai_analysis_jobs.public_token IS 'Unpredictable token required with job id when reading status through Edge Functions.';
COMMENT ON COLUMN public.ai_analysis_jobs.request_payload IS 'Original sanitized request payload used by the worker.';
COMMENT ON COLUMN public.ai_analysis_jobs.result_payload IS 'Final function response payload once completed.';

-- Advisor cleanup: keep the explicit performance indexes from
-- 20260615233936_restore_performance_indexes.sql and remove older duplicates.
DROP INDEX IF EXISTS public.idx_frontier_status_priority;
DROP INDEX IF EXISTS public.idx_lbd_claims_score;
