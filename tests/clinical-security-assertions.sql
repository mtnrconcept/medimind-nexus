\set ON_ERROR_STOP on

-- Both pre-existing users must receive both pre-existing patients at rollout.
do $$
begin
  if (select count(*) from public.patient_access_grants) <> 4 then
    raise exception 'expected 4 seeded patient grants';
  end if;
end $$;

-- New AI ownership/expiry and ClinicalTrials.gov provenance columns must exist.
do $$
begin
  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analysis_jobs'
      and column_name in ('requested_by', 'expires_at')
  ) <> 2 then
    raise exception 'ai_analysis_jobs ownership columns missing';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_trials'
      and column_name in (
        'start_date_precision', 'completion_date_precision', 'source_url',
        'source_api_version', 'has_posted_results', 'sync_status', 'sync_error', 'raw_payload'
      )
  ) <> 8 then
    raise exception 'clinical_trials provenance columns missing';
  end if;
end $$;

-- Anonymous callers must no longer execute privileged SECURITY DEFINER functions.
do $$
begin
  if has_function_privilege('anon', 'public.legacy_privileged_function()', 'EXECUTE') then
    raise exception 'anon still executes SECURITY DEFINER function';
  end if;
end $$;

-- Remove one grant, assume the second authenticated identity and verify RLS isolation.
delete from public.patient_access_grants
where user_id = '22222222-2222-4222-8222-222222222222'
  and patient_id = '44444444-4444-4444-8444-444444444444';

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

do $$
begin
  if (select count(*) from public.patients) <> 1 then
    raise exception 'patient RLS did not isolate the revoked patient';
  end if;

  if public.has_patient_access('44444444-4444-4444-8444-444444444444', false) then
    raise exception 'revoked patient still accessible';
  end if;

  if not public.has_patient_access('33333333-3333-4333-8333-333333333333', true) then
    raise exception 'retained write grant was lost';
  end if;

  if public.patient_id_from_storage_path('not-a-uuid/file.pdf') is not null then
    raise exception 'invalid storage path parsed as patient id';
  end if;

  if public.patient_id_from_storage_path('33333333-3333-4333-8333-333333333333/file.pdf')
      <> '33333333-3333-4333-8333-333333333333'::uuid then
    raise exception 'valid storage path did not parse patient id';
  end if;
end $$;

reset role;
