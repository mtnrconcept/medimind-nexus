# Exact pathology patient-matching implementation plan

> **For agentic workers:** Use test-driven development and the repository AGENTS.md before every scoped change.

**Goal:** Add an authorized, deterministic same-pathology patient ranking inside the patient detail page.

**Architecture:** A pure clinical similarity engine plus a Supabase RLS-bound, paginated data service, rendered in a separate React component. The existing patient dossier route supplies recorded pathology choices. No persistence or privileged backend.

**Tech Stack:** TypeScript, React, Supabase JS, Node test runner/tsx, Vite, ESLint.

**Spec:** `docs/superpowers/specs/2026-11-01-patient-pathology-similarity.md`

## Global constraints

- Work only on `codex/patient-pathology-similarity-20261101`; base source tree equals production `main` SHA `3d5a610c970ecbd20a58adf545472654f0007d93` tree `a05e2def3f191a0364ba7f1865c8f46f58f2db32`.
- Never grant database rights or access synthetic patients in the production matching service.
- A diagnosis UUID is the only equality criterion. Compare documented history only; labels are not ontological equivalence.
- Respect existing `has_patient_access` RLS, detect errors, avoid clinical assertions.

## Task 1 — Pure scoring engine + exhaustive tests

- [x] Write red tests for exact ID matching, duplicate elimination, multi-pathology matching, clinical similarity evidence, missing data, lab unit compatibility, chronology, stable sorting and score labels.
- [x] Implement `src/lib/patientSimilarity/clinicalSimilarity.ts` with typed profiles, weighted observed-dimension scores, evidence and confidence indicators.
- [x] Verify red→green in `tests/patient-pathology-similarity.test.ts`.

## Task 2 — Secure retrieval + test

- [x] Write red tests for denied source, unowned pathology, selection of only visible peers, and errors before enrichment.
- [x] Implement `src/lib/patientSimilarity/authorizedMatches.ts` as an orchestrator around a narrow data gateway; use an adapter backed by the caller's Supabase client, cursor-style `.range` pagination, small `.in()` batches, no service role.
- [x] Verify red→green in `tests/patient-matching-access.test.ts`.

## Task 3 — Dossier integration + verification

- [x] Implement `src/components/patient/PatientPathologySimilarity.tsx` (selector, ranked items, explanations, source identity protected, clear errors, refresh).
- [x] Embed inside `src/pages/PatientDetail.tsx` using already loaded pathologies; preserve existing content.
- [x] Add `typecheck:patient-matching` to `package.json` and the GitHub CI workflow.
- [x] Run `npm test`, `npm run typecheck:patient-matching`, `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check`; report full legacy typecheck separately.
- [ ] Commit cleanly, publish isolated branch, open PR to `main`, inspect green checks and Vercel preview. Do not merge `main`.

## Risks

- Some dossiers have only a primary diagnosis, others multi-diagnoses; both must be included.
- Missing or uneven historical data can overstate similarity; surface evidence coverage and penalize weak comparisons.
- RLS may hide some patients or related clinical rows; never imply hidden patients are absent.
- Large same-pathology cohorts require paginated reads, batching, bounded queries, and explicit limit warnings.
