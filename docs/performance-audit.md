# Performance Audit Notes

## Baseline

- Local build command: `npm run build`
- Result before optimization: successful build in about 25 seconds.
- Main production JS chunk before optimization: about 4.9 MB minified / 1.4 MB gzip.
- Local lint command: `npm run lint`
- Result before optimization: failing with existing historical issues, mostly `no-explicit-any` and hook dependency warnings across app and Supabase function files.

## Access Notes

- Supabase project configured locally: `kparxcfspgoonqttduyk`.
- The Supabase connector can list accessible projects, but direct read access to `kparxcfspgoonqttduyk` returned a permission error during this pass.
- Vercel connector only listed `cloud-rebuild-recovered`; no visible `medimind-nexus` Vercel project was available, so no Vercel project settings were changed.

## Implemented Optimizations

- Route-level lazy loading was added in `src/App.tsx` so heavy pages are split out of the initial bundle.
- Vite manual chunks were added for React, Supabase, Radix/UI, graph, 3D, chart, chemistry, export and content dependencies.
- `cross-data-analyzer` no longer loads every patient row for each analysis. It filters patients by selected pathologies and limits the result.
- `cross-data-analyzer` now reads causal link cache entries by batched `pair_hash` lookups instead of sequential pair-by-pair `ILIKE` queries.
- OpenAI calls in Supabase Edge Functions now use a configurable timeout via `OPENAI_TIMEOUT_MS`, defaulting to 90 seconds.
- Duplicate translation keys in `PDFExportService` were removed to clear Vite duplicate-key warnings.
- A new idempotent migration restores high-value indexes for medical search, patient dossier date filters, causal caches, CDE graph traversal and LBD dashboard ordering.

## Validation After Changes

- `npm run lint`: passes with 0 errors and 1093 warnings kept as historical debt.
- `npm run build`: passes in 23.27 seconds.
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
