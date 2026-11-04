BEGIN;

-- ai_analysis_jobs already owns private results and requested_by in production.
-- The transport stores only opaque request hashes here; uploaded documents and
-- bearer tokens are never persisted by the relay.
CREATE TABLE IF NOT EXISTS public.ai_tool_job_events (
  job_id uuid NOT NULL REFERENCES public.ai_analysis_jobs(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq > 0),
  data text NOT NULL CHECK (octet_length(data) <= 4194304),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, seq)
);

ALTER TABLE public.ai_tool_job_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_tool_job_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_tool_job_events TO service_role;

CREATE POLICY "Service manages AI transport events"
  ON public.ai_tool_job_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ai_analysis_jobs_owner_created_idx
  ON public.ai_analysis_jobs (requested_by, created_at DESC)
  WHERE requested_by IS NOT NULL;

COMMENT ON TABLE public.ai_tool_job_events IS
  'Private replay frames for authenticated AI tasks. Access only through owner-checked Edge Functions.';

COMMIT;
