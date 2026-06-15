-- Read-only Supabase audit for medimind-nexus.
-- Run from SQL Editor or psql against project kparxcfspgoonqttduyk.
-- Do not run this as a migration: it only reports diagnostics.

-- 1) Duplicate candidates by normalized medical names.
WITH duplicate_names AS (
  SELECT 'pathologies' AS table_name, lower(regexp_replace(trim(name), '\s+', ' ', 'g')) AS normalized_name, count(*) AS rows
  FROM public.pathologies
  GROUP BY lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  HAVING count(*) > 1
  UNION ALL
  SELECT 'symptoms', lower(regexp_replace(trim(name), '\s+', ' ', 'g')), count(*)
  FROM public.symptoms
  GROUP BY lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  HAVING count(*) > 1
  UNION ALL
  SELECT 'treatments', lower(regexp_replace(trim(name), '\s+', ' ', 'g')), count(*)
  FROM public.treatments
  GROUP BY lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  HAVING count(*) > 1
  UNION ALL
  SELECT 'medications', lower(regexp_replace(trim(name), '\s+', ' ', 'g')), count(*)
  FROM public.medications
  GROUP BY lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  HAVING count(*) > 1
  UNION ALL
  SELECT 'cde_nodes', node_type || ':' || lower(regexp_replace(trim(name), '\s+', ' ', 'g')), count(*)
  FROM public.cde_nodes
  GROUP BY node_type, lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  HAVING count(*) > 1
)
SELECT *
FROM duplicate_names
ORDER BY rows DESC, table_name, normalized_name
LIMIT 200;

-- 2) Largest tables and index footprint.
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS estimated_rows,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_indexes_size(relid)) AS indexes_size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 50;

-- 3) Index usage: candidates for removal only after sustained production data.
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
LIMIT 100;

-- 4) Foreign keys without a matching leading index.
WITH fk_columns AS (
  SELECT
    conrelid,
    conname,
    conrelid::regclass AS table_name,
    array_agg(att.attname ORDER BY key_ord.ord) AS columns
  FROM pg_constraint con
  CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key_ord(attnum, ord)
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = key_ord.attnum
  WHERE con.contype = 'f'
  GROUP BY conrelid, conname
),
matching_indexes AS (
  SELECT
    fk.conname,
    bool_or((
      SELECT array_agg(att.attname ORDER BY key_ord.ord)
      FROM unnest(idx.indkey) WITH ORDINALITY AS key_ord(attnum, ord)
      JOIN pg_attribute att ON att.attrelid = idx.indrelid AND att.attnum = key_ord.attnum
      WHERE key_ord.ord <= array_length(fk.columns, 1)
    ) = fk.columns) AS has_leading_index
  FROM fk_columns fk
  JOIN pg_index idx ON idx.indrelid = fk.conrelid
  GROUP BY fk.conname
)
SELECT fk.table_name, fk.conname, fk.columns
FROM fk_columns fk
LEFT JOIN matching_indexes mi ON mi.conname = fk.conname
WHERE coalesce(mi.has_leading_index, false) = false
ORDER BY fk.table_name::text, fk.conname;

-- 5) Permissive RLS policies to review manually.
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual = 'true'
    OR with_check = 'true'
    OR array_to_string(roles, ',') LIKE '%anon%'
  )
ORDER BY tablename, policyname;
