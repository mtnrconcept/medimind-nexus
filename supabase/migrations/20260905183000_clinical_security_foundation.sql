-- Clinical security foundation: explicit patient grants, protected jobs/trials,
-- storage isolation, and SECURITY DEFINER hardening.
-- Additive and non-destructive: existing authenticated users are granted
-- access to existing patients during migration to preserve current behavior.

create table if not exists public.patient_access_grants (
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (patient_id, user_id)
);

create index if not exists patient_access_grants_user_id_idx
  on public.patient_access_grants(user_id);

alter table public.patient_access_grants enable row level security;

-- Preserve current access for accounts that already existed at rollout time.
insert into public.patient_access_grants (patient_id, user_id, can_write)
select p.id, u.id, true
from public.patients p
cross join auth.users u
on conflict (patient_id, user_id)
do update set can_write = excluded.can_write, updated_at = now();

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = 'admin'
  );
$$;

create or replace function public.has_patient_access(
  p_patient_id uuid,
  p_require_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $$
  select
    auth.role() = 'service_role'
    or public.is_current_user_admin()
    or exists (
      select 1
      from public.patient_access_grants g
      where g.patient_id = p_patient_id
        and g.user_id = auth.uid()
        and (not p_require_write or g.can_write)
    );
$$;

create or replace function public.patient_id_from_storage_path(object_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when split_part(coalesce(object_name, ''), '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.is_current_user_admin() from public, anon;
revoke all on function public.has_patient_access(uuid, boolean) from public, anon;
revoke all on function public.patient_id_from_storage_path(text) from public, anon;
grant execute on function public.is_current_user_admin() to authenticated, service_role;
grant execute on function public.has_patient_access(uuid, boolean) to authenticated, service_role;
grant execute on function public.patient_id_from_storage_path(text) to authenticated, service_role;

-- Grants are visible to their holder but are administered by privileged backend/admin paths.
drop policy if exists patient_access_grants_select on public.patient_access_grants;
drop policy if exists patient_access_grants_admin_all on public.patient_access_grants;
create policy patient_access_grants_select
  on public.patient_access_grants
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_current_user_admin());
create policy patient_access_grants_admin_all
  on public.patient_access_grants
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

revoke all on table public.patient_access_grants from public, anon;
grant select on table public.patient_access_grants to authenticated;
grant all on table public.patient_access_grants to service_role;

-- Core patient table: explicit read access; preserve admin-only mutations.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'patients'
  loop
    execute format('drop policy if exists %I on public.patients', pol.policyname);
  end loop;
end $$;

alter table public.patients enable row level security;
create policy patients_select_explicit_access
  on public.patients
  for select
  to authenticated
  using (public.has_patient_access(id, false));
create policy patients_insert_admin
  on public.patients
  for insert
  to authenticated
  with check (public.is_current_user_admin());
create policy patients_update_admin
  on public.patients
  for update
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());
create policy patients_delete_admin
  on public.patients
  for delete
  to authenticated
  using (public.is_current_user_admin());
revoke all on table public.patients from anon;

-- Every public table with a UUID patient_id column is patient-scoped.
-- Existing ad-hoc policies are replaced with a single explicit access contract.
do $$
declare
  target record;
  pol record;
begin
  for target in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'patient_id'
      and c.data_type = 'uuid'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'patient_access_grants'
      and c.table_name <> 'patients'
  loop
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target.table_name
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, target.table_name);
    end loop;

    execute format('alter table public.%I enable row level security', target.table_name);
    execute format(
      'create policy patient_access_select on public.%I for select to authenticated using (public.has_patient_access(patient_id, false))',
      target.table_name
    );
    execute format(
      'create policy patient_access_insert on public.%I for insert to authenticated with check (public.has_patient_access(patient_id, true))',
      target.table_name
    );
    execute format(
      'create policy patient_access_update on public.%I for update to authenticated using (public.has_patient_access(patient_id, true)) with check (public.has_patient_access(patient_id, true))',
      target.table_name
    );
    execute format(
      'create policy patient_access_delete on public.%I for delete to authenticated using (public.has_patient_access(patient_id, true))',
      target.table_name
    );
    execute format('revoke all on table public.%I from anon', target.table_name);
  end loop;
end $$;

-- Private patient documents must live under <patient_uuid>/... in storage.
drop policy if exists "Allow authenticated reads" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "Allow authenticated deletes" on storage.objects;

drop policy if exists patient_documents_storage_select on storage.objects;
drop policy if exists patient_documents_storage_insert on storage.objects;
drop policy if exists patient_documents_storage_update on storage.objects;
drop policy if exists patient_documents_storage_delete on storage.objects;

create policy patient_documents_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and public.has_patient_access(public.patient_id_from_storage_path(name), false)
  );
create policy patient_documents_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient-documents'
    and public.has_patient_access(public.patient_id_from_storage_path(name), true)
  );
create policy patient_documents_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and public.has_patient_access(public.patient_id_from_storage_path(name), true)
  )
  with check (
    bucket_id = 'patient-documents'
    and public.has_patient_access(public.patient_id_from_storage_path(name), true)
  );
create policy patient_documents_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and public.has_patient_access(public.patient_id_from_storage_path(name), true)
  );

-- AI background jobs are a backend implementation detail. Status is exposed via Edge Functions.
revoke all on table public.ai_analysis_jobs from public, anon, authenticated;
grant all on table public.ai_analysis_jobs to service_role;

-- ClinicalTrials.gov provenance/freshness fields.
alter table public.clinical_trials
  add column if not exists start_date_precision text,
  add column if not exists completion_date_precision text,
  add column if not exists source_url text,
  add column if not exists source_api_version text,
  add column if not exists has_posted_results boolean,
  add column if not exists sync_status text,
  add column if not exists sync_error text,
  add column if not exists raw_payload jsonb;

alter table public.clinical_trials enable row level security;
drop policy if exists "Insert clinical_trials" on public.clinical_trials;
drop policy if exists "Update clinical_trials" on public.clinical_trials;
drop policy if exists "Read clinical_trials" on public.clinical_trials;
drop policy if exists clinical_trials_public_read on public.clinical_trials;
create policy clinical_trials_public_read
  on public.clinical_trials
  for select
  to anon, authenticated
  using (true);
revoke insert, update, delete on table public.clinical_trials from public, anon, authenticated;
grant select on table public.clinical_trials to anon, authenticated;
grant all on table public.clinical_trials to service_role;

-- Harden every existing SECURITY DEFINER function against mutable search paths
-- and anonymous execution while preserving authenticated compatibility.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('alter function %s set search_path to public, auth, extensions, pg_temp', fn.signature);
    execute format('revoke all on function %s from public', fn.signature);
    execute format('revoke all on function %s from anon', fn.signature);
    execute format('grant execute on function %s to authenticated, service_role', fn.signature);
  end loop;
end $$;
