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
