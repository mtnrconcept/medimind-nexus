-- Remove anonymous canonical research-data writes without altering existing rows.
-- The existing Edge Functions use service_role to write; browser routes are authenticated.
-- Execute only after the isolated PostgreSQL privilege tests succeed.

do $$
declare
  tbl text;
  old_policy text;
begin
  for tbl, old_policy in
    select * from (values
      ('discovery_api_cache', 'discovery_cache_all'),
      ('discovery_evidence_packs', 'discovery_packs_all'),
      ('discovery_evidence_snippets', 'discovery_snippets_all'),
      ('discovery_hypotheses', 'discovery_hypotheses_all'),
      ('discovery_kg_triples', 'discovery_triples_all'),
      ('discovery_papers', 'discovery_papers_all'),
      ('discovery_research_sessions', 'discovery_sessions_all')
    ) as value(table_name, old_policy_name)
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', old_policy, tbl);
    execute format('drop policy if exists evidence_read_authenticated on public.%I', tbl);
    execute format('revoke all on table public.%I from anon', tbl);
    execute format('revoke all on table public.%I from public', tbl);
    execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', tbl);
    execute format('grant select on table public.%I to authenticated', tbl);
    execute format('grant all on table public.%I to service_role', tbl);
    execute format('create policy evidence_read_authenticated on public.%I for select to authenticated using (true)', tbl);
  end loop;
end $$;


-- Existing admin policies call is_admin_optimized(). Previous versions trusted
-- auth.users.raw_user_meta_data.role, which any signup can submit or update.
-- Only the server-managed user_roles table is an authorization source.
create or replace function public.is_admin_optimized()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $$
  select public.is_current_user_admin();
$$;

revoke all on function public.is_admin_optimized() from public, anon;
grant execute on function public.is_admin_optimized() to authenticated, service_role;
