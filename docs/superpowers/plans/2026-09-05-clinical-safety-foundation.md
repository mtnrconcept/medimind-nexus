# Clinical Safety Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-safe clinical security/evidence foundation for patient access, drug-interaction checks, and ClinicalTrials.gov freshness.

**Architecture:** Keep the existing React/Supabase application intact. Add explicit patient grants and restrictive RLS in an additive migration, move high-risk source interpretation into testable pure TypeScript helpers, protect Edge Functions with JWT, and add a server-only ClinicalTrials.gov v2 sync path with provenance.

**Tech Stack:** React 18, TypeScript 5.8, Vite 5, Supabase/PostgreSQL 17 Edge Functions (Deno), Node test runner via `tsx`, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-05-clinical-safety-foundation-design.md`

## Global Constraints

- Do not delete existing patient or clinical data.
- Existing authenticated users retain access to existing patients through seeded explicit grants; future users have no implicit access.
- Source outage or incomplete evidence must never become a reassuring “no interaction” conclusion.
- ClinicalTrials.gov writes are server-side and preserve source provenance/freshness.
- `main` is changed only by the final verified merge.

---

### Task 1: Repository verification contract

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Create: `tests/drug-interaction-logic.test.ts`
- Create: `tests/clinical-trials-mapper.test.ts`

**Interfaces:**
- Consumes: existing TypeScript/Vite toolchain.
- Produces: `npm test`, `npm run typecheck`, and regression tests that import pure helpers created in Tasks 3 and 4.

- [ ] **Step 1: Add failing tests before production helpers exist.**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateInteractionEvidence, buildInteractionSummary } from '../supabase/functions/drug-interaction-checker/logic.ts';

test('keeps corroborating evidence and does not claim safety when a source failed', () => {
  const aggregated = aggregateInteractionEvidence([
    { drugA: 'A', drugB: 'B', source: 'drugbank', sourceKind: 'curated', severity: 'major', description: 'documented' },
    { drugA: 'A', drugB: 'B', source: 'openfda-label', sourceKind: 'official_label', severity: 'moderate', description: 'label mention' },
  ]);
  assert.equal(aggregated[0].evidence.length, 2);
  assert.match(buildInteractionSummary(aggregated, [{ source: 'drugbank', status: 'unavailable' }]), /incomplete/i);
});
```

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidNctId, mapClinicalTrialStudy } from '../supabase/functions/clinical-trials-sync/mapper.ts';

test('validates NCT IDs and maps registry provenance', () => {
  assert.equal(isValidNctId('NCT00198068'), true);
  assert.equal(isValidNctId('NCT123'), false);
  const mapped = mapClinicalTrialStudy({ protocolSection: { identificationModule: { nctId: 'NCT00198068', briefTitle: 'Example' }, statusModule: { overallStatus: 'RECRUITING', studyFirstSubmitDate: '2020-01-01', lastUpdatePostDateStruct: { date: '2026-04-28' } } }, hasResults: false });
  assert.equal(mapped.nct_id, 'NCT00198068');
  assert.equal(mapped.last_updated, '2026-04-28');
  assert.match(mapped.source_url, /clinicaltrials\.gov/);
});
```

- [ ] **Step 2: Run CI on the branch and confirm these imports fail because the helpers do not exist.**

Expected failure: module-not-found for `logic.ts` and/or `mapper.ts`.

- [ ] **Step 3: Add `test`, `typecheck`, and `check` scripts and make CI run tests → typecheck → lint → build.**

```json
"test": "tsx --test tests/**/*.test.ts",
"typecheck": "tsc --noEmit",
"check": "npm run test && npm run typecheck && npm run lint && npm run build"
```

- [ ] **Step 4: Add `.worktrees/` to `.gitignore`.**

- [ ] **Step 5: Commit the verification contract.**

### Task 2: Add explicit patient authorization and database guardrails

**Files:**
- Create: `supabase/migrations/20260905183000_clinical_security_foundation.sql`

**Interfaces:**
- Produces: `patient_access_grants`, `has_patient_access(uuid, boolean)`, tightened RLS/Storage, owned `ai_analysis_jobs`, protected `clinical_trials`, canonical cache trigger validation.

- [ ] **Step 1: Create an additive migration with `patient_access_grants` and seed current users × current patients.**

```sql
create table if not exists public.patient_access_grants (
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_write boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (patient_id, user_id)
);
insert into public.patient_access_grants(patient_id,user_id,can_write)
select p.id,u.id,true from public.patients p cross join auth.users u
on conflict (patient_id,user_id) do update set can_write = true, updated_at = now();
```

- [ ] **Step 2: Create a fixed-search-path authorization helper and policies on `patients`, UUID patient child tables, and `patient_documents`.**

`has_patient_access` returns true for service-role, administrators, or a matching current-user grant; write access requires `can_write`.

- [ ] **Step 3: Replace `patient-documents` Storage policies with patient UUID path-prefix checks.**

Use `(storage.foldername(name))[1]::uuid` only after validating the first segment against a UUID regex.

- [ ] **Step 4: Add `requested_by`/`expires_at` to `ai_analysis_jobs`, owner-only authenticated read policy, and service-role writes.**

- [ ] **Step 5: Add provenance fields to `clinical_trials`, keep reads, revoke direct client writes, and reserve writes to service role.**

- [ ] **Step 6: Protect global clinical caches against non-canonical entities with a trigger that accepts only names present in the corresponding canonical medical table.**

- [ ] **Step 7: Revoke public/anonymous execution on `SECURITY DEFINER` functions and set their `search_path` to `public, pg_temp`; retain required authenticated grants for compatibility.**

- [ ] **Step 8: Dry-run the complete migration with `BEGIN; ... ROLLBACK;` against the live schema and inspect errors before production application.**

### Task 3: Make drug-interaction reasoning evidence-aware

**Files:**
- Create: `supabase/functions/drug-interaction-checker/logic.ts`
- Modify: `supabase/functions/drug-interaction-checker/index.ts`

**Interfaces:**
- Produces: `aggregateInteractionEvidence(evidence)`, `buildInteractionSummary(interactions, sourceStatuses)`, source status objects, multi-evidence drug-pair output.

- [ ] **Step 1: Implement the minimal pure helpers needed to turn Task 1 tests green.**

- [ ] **Step 2: Remove the retired RxNav interaction endpoint; retain RxNorm name→RxCUI normalization only.**

- [ ] **Step 3: Classify evidence sources explicitly and retain all corroborating/contradictory evidence for a pair.**

Curated/official-label evidence may contribute explicit severity. Pharmacovigilance co-reporting remains a signal and cannot alone establish contraindication/major severity.

- [ ] **Step 4: Return per-source health and an incomplete-verification warning whenever an authoritative source fails or is not configured.**

- [ ] **Step 5: Run the focused tests and full repository checks.**

### Task 4: Add official ClinicalTrials.gov v2 synchronization

**Files:**
- Create: `supabase/functions/clinical-trials-sync/mapper.ts`
- Create: `supabase/functions/clinical-trials-sync/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces: `isValidNctId`, `mapClinicalTrialStudy`, authenticated/server sync endpoint accepting bounded `nct_ids`.

- [ ] **Step 1: Implement `isValidNctId` and `mapClinicalTrialStudy` until Task 1 mapper tests pass.**

- [ ] **Step 2: Implement the sync handler with a maximum batch size of 25, 8-second fetch timeout, at most two attempts per study, and bounded concurrency.**

- [ ] **Step 3: Upsert mapped rows by existing unique `nct_id`, recording success/error/fetch timestamps and raw official payload.**

- [ ] **Step 4: Require JWT in `supabase/config.toml` for this function and every currently configured privileged clinical/import function.**

- [ ] **Step 5: Smoke-test the mapper against `NCT00198068` and verify its official registry update date is preserved.**

### Task 5: Merge and production rollout

**Files:**
- No new source files; operational verification only.

**Interfaces:**
- Consumes: green branch, migration, Edge Functions.
- Produces: merged `main`, applied Supabase migration/functions, READY Vercel production deployment.

- [ ] **Step 1: Compare branch to `main`, inspect every changed filename/patch, and open a PR.**

- [ ] **Step 2: Wait for required GitHub/Vercel checks and verify success from fresh status responses.**

- [ ] **Step 3: Squash-merge the PR into `main` as explicitly requested by the human.**

- [ ] **Step 4: Apply the verified migration to Supabase and deploy the changed Edge Functions.**

- [ ] **Step 5: Re-run authorization SQL checks and Supabase security advisors; verify no regression on patient access and no anonymous write path on changed surfaces.**

- [ ] **Step 6: Verify the Vercel production deployment for merged `main` is `READY`, then test the canonical production URL.**
