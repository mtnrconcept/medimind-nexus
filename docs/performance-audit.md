# Performance Audit Notes

## Baseline

- Local build command: `npm run build`
- Result before optimization: successful build in about 25 seconds.
- Main production JS chunk before optimization: about 4.9 MB minified / 1.4 MB gzip.
- Local lint command: `npm run lint`
- Result before optimization: failing with existing historical issues, mostly `no-explicit-any` and hook dependency warnings across app and Supabase function files.

## Access Notes

- Supabase project configured locally: `kparxcfspgoonqttduyk`.
- Supabase connector access was later confirmed for `kparxcfspgoonqttduyk` (`Medicore`, eu-west-1, Postgres 17.6.1).
- Vercel connector only listed `cloud-rebuild-recovered`; no visible `medimind-nexus` Vercel project was available, so no Vercel project settings were changed.

## Implemented Optimizations

- Route-level lazy loading was added in `src/App.tsx` so heavy pages are split out of the initial bundle.
- Vite manual chunks were added for React, Supabase, Radix/UI, graph, 3D, chart, chemistry, export and content dependencies.
- `cross-data-analyzer` no longer loads every patient row for each analysis. It filters patients by selected pathologies and limits the result.
- `cross-data-analyzer` now reads causal link cache entries by batched `pair_hash` lookups instead of sequential pair-by-pair `ILIKE` queries.
- OpenAI calls in Supabase Edge Functions now use a configurable timeout via `OPENAI_TIMEOUT_MS`, defaulting to 90 seconds.
- Duplicate translation keys in `PDFExportService` were removed to clear Vite duplicate-key warnings.
- A new idempotent migration restores high-value indexes for medical search, patient dossier date filters, causal caches, CDE graph traversal and LBD dashboard ordering.
- The migration also adds 22 foreign-key indexes confirmed by the live Supabase performance advisor.
- The migration avoids duplicate `pair_hash` and `request_hash` indexes because production already has unique constraints on those columns.
- One duplicate standalone `symptoms` unique index is dropped only when the equivalent index exists and the duplicate is not constraint-backed.

## Live Supabase Findings

- Edge logs show `cross-data-analyzer` timing out at about 150 seconds with 504/546 responses.
- Edge logs also show `cde-systematic-analyze` taking 141-146 seconds on successful calls and one 150-second 546 timeout.
- `search-medical-concepts` is comparatively healthy in recent logs, generally returning in about 200-1050 ms.
- The deployed `cross-data-analyzer` still contains the old N-squared cache lookup, broad `select('*')` calls and global `patients` scan; the PR code replaces those paths.
- Performance advisor reported 22 unindexed foreign keys; these are now covered in the migration.
- Performance advisor reported duplicate indexes on `public.symptoms`: `idx_symptoms_name_lower_unique` and `idx_symptoms_name_unique`.
- Security advisor reported several RLS policy issues: RLS-enabled tables with no policies, mutable function `search_path`, anonymous-access policy warnings and leaked-password protection disabled.
- Duplicate candidates exist in production data, especially treatments such as `changements de style de vie` (16 rows), `chirurgie` (15 rows), `antibiotiques` (12 rows), plus several pathologies and CDE medication nodes. These require conflict review before any data cleanup or unique constraint tightening.
- Largest table footprints currently include `pathologies` (34 MB), `medications` (27 MB), `semantic_nodes` (25 MB), `cde_nodes` (16 MB) and `hypothesis_generation_jobs` (10 MB).

## Validation After Changes

- `npm run lint`: passes with 0 errors and 1093 warnings kept as historical debt.
- `npm run build`: passes in 21.99 seconds after the live Supabase advisor update.
- Initial app JS chunk after optimization: 44.52 kB minified / 15.02 kB gzip.
- Heavy routes now build as separate chunks, including `CrossDataAnalysis` at 134.02 kB / 33.21 kB gzip and `PatientDetail` at 425.55 kB / 90.29 kB gzip.
- Smoke test on `http://127.0.0.1:8082/`: home loads, `/cross-data-analysis` correctly redirects to `/auth` without an authenticated session, and `/auth` renders.
- Remaining build warnings are third-party or future cleanup items: outdated Browserslist data, RDKit browser externalization warnings, a `three-mesh-bvh` export warning, and large vendor/export/three chunks.

## Follow-up Diagnostics

Run `scripts/audit-supabase-performance.sql` against production when read access to `kparxcfspgoonqttduyk` is available. It reports:

- duplicate candidates by normalized medical name,
- largest tables and index footprint,
- low-use indexes,
- foreign keys without matching leading indexes,
- permissive public RLS policies that need manual review.

Do not automatically delete duplicates or tighten RLS from the report without validating affected records and frontend access paths.
