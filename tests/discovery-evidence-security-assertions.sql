\set ON_ERROR_STOP on

-- No unauthenticated client may poison a canonical evidence source, cache or hypothesis.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'discovery_api_cache',
    'discovery_evidence_packs',
    'discovery_evidence_snippets',
    'discovery_hypotheses',
    'discovery_kg_triples',
    'discovery_papers',
    'discovery_research_sessions'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = tbl and c.relrowsecurity
    ) then
      raise exception 'Missing evidence RLS: %', tbl;
    end if;

    if has_table_privilege('anon', format('public.%I', tbl), 'INSERT')
       or has_table_privilege('anon', format('public.%I', tbl), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', tbl), 'DELETE') then
      raise exception 'Anonymous evidence write privilege remains on %', tbl;
    end if;

    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl
        and 'public' = any(roles) and cmd in ('ALL','INSERT','UPDATE','DELETE')
    ) then
      raise exception 'Public evidence write policy remains on %', tbl;
    end if;

    if not has_table_privilege('authenticated', format('public.%I', tbl), 'SELECT') then
      raise exception 'Authenticated evidence read lost on %', tbl;
    end if;
  end loop;
end $$;
