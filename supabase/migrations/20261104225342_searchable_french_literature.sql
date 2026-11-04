-- Search verified bibliographic metadata without reading patient records.
-- Source titles and original metadata remain intact. French terms are additive.
create extension if not exists unaccent with schema public;
create extension if not exists pg_trgm with schema public;

create index if not exists discovery_papers_title_trgm_202611
  on public.discovery_papers using gin (lower(title) public.gin_trgm_ops);

create or replace function public.search_discovery_literature(
  p_query text default '',
  p_alias text default '',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid, pmid text, title text, title_fr text, journal text,
  publication_date date, source text, topic_fr text,
  translation_status text, total_count bigint
)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with inputs as (
    select
      public.unaccent(lower(left(btrim(coalesce(p_query,'')),120))) as query,
      public.unaccent(lower(left(btrim(coalesce(p_alias,'')),120))) as alias
  ), candidates as (
    select p.id, p.pmid, p.title,
      nullif(p.metadata->>'title_fr','') as title_fr,
      p.journal, p.publication_date, p.source,
      nullif(p.metadata->>'topic_fr','') as topic_fr,
      coalesce(p.metadata->>'translation_status','original') as translation_status
    from public.discovery_papers p
    cross join inputs i
    where p.pmid ~ '^[1-9][0-9]{0,8}$'
      and (
        i.query = ''
        or strpos(public.unaccent(lower(concat_ws(' ',p.pmid,p.title,p.journal,p.metadata->>'title_fr',
                         p.metadata->>'topic_fr',p.metadata->>'query_en'))),i.query) > 0
        or (i.alias <> '' and i.alias <> i.query and
            strpos(public.unaccent(lower(concat_ws(' ',p.title,p.journal,p.metadata->>'title_fr',
                       p.metadata->>'topic_fr',p.metadata->>'query_en'))),i.alias)>0)
      )
  )
  select c.*, count(*) over () as total_count
  from candidates c
  order by c.publication_date desc nulls last, c.pmid desc
  limit least(greatest(coalesce(p_limit,24),1),50)
  offset least(greatest(coalesce(p_offset,0),0),10000);
$$;

revoke all on function public.search_discovery_literature(text,text,integer,integer) from public,anon;
grant execute on function public.search_discovery_literature(text,text,integer,integer) to authenticated,service_role;
