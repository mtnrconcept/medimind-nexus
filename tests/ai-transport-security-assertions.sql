BEGIN;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_tool_job_events'::regclass) THEN
    RAISE EXCEPTION 'AI event RLS is disabled';
  END IF;
  IF has_table_privilege('anon', 'public.ai_tool_job_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ai_tool_job_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ai_tool_job_events', 'INSERT') THEN
    RAISE EXCEPTION 'Private AI events are accessible through the public Data API';
  END IF;
END $$;

SET ROLE service_role;
INSERT INTO public.ai_analysis_jobs(id, public_token, function_name, analysis_mode, requested_by)
VALUES ('aaa00000-0000-4000-8000-000000000001', 'aaa00000-0000-4000-8000-000000000002',
        'ai-assistant', 'tool_transport', '11111111-1111-4111-8111-111111111111');
INSERT INTO public.ai_tool_job_events(job_id, seq, data)
VALUES ('aaa00000-0000-4000-8000-000000000001', 1, 'synthetic frame');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.ai_tool_job_events WHERE job_id = 'aaa00000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Service role cannot persist/retrieve frames';
  END IF;
  BEGIN
    INSERT INTO public.ai_tool_job_events(job_id, seq, data)
    VALUES ('aaa00000-0000-4000-8000-000000000001', 1, 'duplicate frame');
    RAISE EXCEPTION 'Duplicate sequence was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.ai_tool_job_events(job_id, seq, data)
    VALUES ('aaa00000-0000-4000-8000-000000000003', 1, 'orphan frame');
    RAISE EXCEPTION 'Orphan event was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM data FROM public.ai_tool_job_events;
    RAISE EXCEPTION 'Anonymous event read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
BEGIN
  BEGIN
    PERFORM data FROM public.ai_tool_job_events;
    RAISE EXCEPTION 'Another user can read private events directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

ROLLBACK;
