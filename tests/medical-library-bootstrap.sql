\set ON_ERROR_STOP on
-- The generic security fixture defines only id. Reproduce the bibliographic
-- columns used by the real live discovery_papers table for this isolated test.
alter table public.discovery_papers
  add column if not exists pmid text unique,
  add column if not exists title text,
  add column if not exists journal text,
  add column if not exists publication_date date,
  add column if not exists source text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
