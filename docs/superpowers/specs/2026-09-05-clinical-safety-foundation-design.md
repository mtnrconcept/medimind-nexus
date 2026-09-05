# Clinical Safety Foundation Design

## Purpose

Harden MediMind's production clinical workflows without rewriting the product: make patient access explicit, close anonymous clinical write paths, prevent false reassurance from failed evidence sources, and keep ClinicalTrials.gov records fresh and traceable.

## Scope

This delivery changes five bounded areas that share one safety objective:

1. **Authorization** — authenticated users must have an explicit patient grant (or administrator role) before reading/writing patient-linked data through RLS or privileged Edge Functions. Existing users are granted access to existing patients once during migration to preserve current behavior; new users receive no implicit patient access.
2. **Clinical Edge Functions** — functions that can query privileged data, call paid models, import data, or write caches require JWT validation. Service-to-service worker calls remain possible with the Supabase service role.
3. **Drug interactions** — RxNorm is used only for terminology normalization. Curated database/DrugBank/official-label evidence and pharmacovigilance signals are kept separate; source outages produce an incomplete result, never an “absence of interaction” claim.
4. **ClinicalTrials.gov** — an authenticated/server-only sync function uses the official v2 study endpoint, validates NCT identifiers, stores registry update/fetch timestamps and source metadata, and can refresh stale records deterministically.
5. **Verification** — CI gains tests and typecheck in addition to lint/build, with focused pure-logic tests for interaction aggregation and ClinicalTrials.gov mapping.

## Data model and authorization

Create `public.patient_access_grants` with `patient_id`, `user_id`, `can_write`, timestamps, a unique `(patient_id,user_id)` key, and foreign keys to patients/auth users. Create `public.has_patient_access(uuid, boolean)` with a fixed search path. Access succeeds for service-role calls, authenticated administrators, or a matching grant; write operations require `can_write=true`.

During migration, every current authenticated user receives a write grant for every current patient. This preserves the application's current all-authenticated behavior for the two existing accounts while converting future access into an explicit model. No patient rows or clinical documents are deleted.

Policies on `patients`, tables whose UUID `patient_id` references patients, `patient_documents`, and the `patient-documents` storage bucket are replaced with access-grant checks. Storage object paths must begin with the patient UUID; the bucket is currently empty, so this does not orphan existing objects.

`ai_analysis_jobs` receives `requested_by` and `expires_at`; clients can read only their own unexpired jobs, while writes remain service-side.

`clinical_trials` remains readable but direct client insert/update/delete privileges are removed; sync writes use the service role. Provenance fields are additive.

For existing `SECURITY DEFINER` functions, revoke anonymous/public execution and assign a fixed `search_path`. Authenticated execution is retained where needed for compatibility unless a function is clearly backend-only.

## Drug-interaction evidence model

Each drug pair contains an array of evidence items rather than a single winner. Evidence items include source, source kind (`curated`, `official_label`, `pharmacovigilance`), description, optional mechanism, reported severity, and clinical action. The aggregate severity is the highest explicit severity among curated/official-label evidence; pharmacovigilance signals cannot independently establish a contraindication or major interaction.

Each upstream source returns a health status: `available`, `partial`, `unavailable`, or `not_configured`. When no interaction is found and every authoritative source completed, the response says no documented interaction was found in the sources consulted. If any authoritative source failed, the response says verification is incomplete.

## ClinicalTrials.gov sync

The sync function accepts one or more NCT IDs (bounded batch), validates `^NCT\d{8}$`, fetches `https://clinicaltrials.gov/api/v2/studies/{NCT_ID}` with a timeout and limited retry, maps the official structure to the existing table, and upserts by `nct_id`.

New columns record registry update time, fetch time, source URL, source API version, result-posting status, sync status/error, and the raw official payload. Registry data is labeled as sponsor-submitted and is not treated as evidence of efficacy, safety, current availability, or individual eligibility.

## Failure handling

Authorization failures return 401/403 and never silently fall back to service-role access. Source errors remain visible in source status. External malformed payloads are rejected before database writes. Network operations use bounded timeouts. No empty result caused by a failed source is converted into a reassuring clinical statement.

## Testing

Pure logic is tested with Node's test runner via `tsx --test`. CI runs tests, `tsc --noEmit`, ESLint, and Vite production build. The database migration is dry-run in a transaction against the live schema before merge, then verified after application using two distinct authenticated users/patient grants and Supabase security advisors.

## Rollout and rollback

Rollout order: merge verified code → apply additive migration → deploy/update Edge Functions → verify RLS and source behavior → verify Vercel production deployment and canonical URL.

Application rollback is a revert of the squash merge. Database rollback uses a compensating migration that restores prior grants/policies without dropping clinical data. Because the schema changes are additive and the initial grant seeding preserves current users, rollback does not require data deletion.
