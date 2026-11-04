\set ON_ERROR_STOP on

-- Authentication is required even for bibliographic metadata; never expose
-- a write path to citation ingestion through an unauthenticated RPC.
do $$
begin
  if has_function_privilege('anon','public.search_discovery_literature(text,text,integer,integer)','EXECUTE') then
    raise exception 'Anonymous library search is exposed';
  end if;
  if not has_function_privilege('authenticated','public.search_discovery_literature(text,text,integer,integer)','EXECUTE') then
    raise exception 'Authenticated library search is blocked';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.discovery_papers'::regclass) then
    raise exception 'Evidence RLS disabled';
  end if;
end $$;

begin;
insert into public.discovery_papers (pmid, title, source, metadata)
values ('999000001','Test nephrotic syndrome citation','pubmed',
        '{"title_fr":"Test du syndrome néphrotique","topic_fr":"néphrologie"}'::jsonb)
on conflict (pmid) do nothing;

set local role authenticated;
do $$
begin
  if not exists (
    select 1 from public.search_discovery_literature('syndrome nephrotique','',10,0)
    where pmid = '999000001'
  ) then
    raise exception 'French accents or bilingual metadata search failed';
  end if;
  if not exists (
    select 1 from public.search_discovery_literature('unlisted','nephrotic',10,0)
    where pmid = '999000001'
  ) then
    raise exception 'English query alias search failed';
  end if;
end $$;
reset role;
rollback;
