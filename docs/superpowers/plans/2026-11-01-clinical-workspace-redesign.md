# MediCore Clinical Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development, superpowers:using-git-worktrees and superpowers:verification-before-completion. Each feature must have a red-green test where appropriate.

**Goal:** Make MediCore's current application simple, consistent, accessible and safe for day-to-day clinical navigation.

**Architecture:** Keep Vite, React, React Router, Supabase RLS and existing routes. Consolidate navigation in a pure TypeScript registry; replace the fixed dropdown header with a responsive sidebar + topbar; provide shared visual tokens and a page heading; simplify the main workflow pages without changing medical algorithms.

**Tech Stack:** React 18, TypeScript, React Router, Tailwind, shadcn/ui, Supabase and Node tests.

**Spec:** `docs/superpowers/specs/2026-11-01-clinical-workspace-design.md`

## Global Constraints

- Worktree only on `codex/ux-unified-20261101` (reconstructed Git tree exactly matches PR #25 base `aa225df88a5c01c1dab36ffc96f72d583ac4795c`).
- No changes to `main`, no production deployment, no clinical migrations.
- Keep every existing route; admin-only actions hidden and protected.
- Preserve RLS and verify all stats/records against actual scoped Supabase responses.
- Avoid misleading patient safety or security statements.

## Proposed changes, order and rollback

1. **Navigation source and tests (RED → GREEN).** Add `src/components/layout/navigation.ts` and `tests/clinical-workspace-navigation.test.ts`: nav groups, accessible destination labels, route resolution including detail routes and admin role filtering. Risk: dead links; rollback by reverting file pair.
2. **Theme and clinical shell.** Replace `src/components/layout/AppLayout.tsx` header with desktop sidebar, mobile drawer, contextual topbar and user controls. Update `src/components/layout/PageTransition.tsx`, `src/index.css`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx` and `index.html` for one visual system, keyboard focus, motion preference and honest metadata. Risk: responsive regressions in specialized pages; smoke test every route; rollback via code revert.
3. **Clear entry points and truthful dashboard.** Update `src/pages/Index.tsx`, `src/pages/Auth.tsx`, `src/pages/Dashboard.tsx`. Add `src/lib/dashboardSummary.ts` and `tests/dashboard-summary.test.ts` (test first) for safe counts / display names. Risk: RLS count errors; show explicit error/empty states; no fake values.
4. **Patient and pathology workflows.** Update `src/pages/Patients.tsx`, `src/components/patient/PatientDirectory.tsx`, `src/pages/Pathologies.tsx`, `src/pages/PatientDetail.tsx` to use consistent headings, clear controls and hide fake decrypt animation. Preserve patient comparison, export, warnings and all existing Supabase queries. Risk: loss of action in a long component; tests and manual source review.
5. **Other clinical views.** Align `src/pages/CrossDataAnalysis.tsx`, `src/pages/Search.tsx`, `src/pages/PathologyDetail.tsx`, `src/pages/Admin.tsx`, `src/pages/ContinuousDiscovery.tsx` and `src/pages/NotFound.tsx` to the shared page conventions. Remove unverified model/version claims from headlines. No clinical business logic changes.
6. **Route authorization consistency.** Update `src/App.tsx` to restrict `/populate-data` to admins, add focused test for access policy in existing tests or a new route test. Risk: users formerly allowed import; intentional security boundary. No schema change.
7. **Verification, commit and PR.** Add `tsconfig.workspace.json` and `npm run typecheck:workspace` to `.github/workflows/ci.yml`; Run `npm test`, `npm run typecheck`, `npm run typecheck:patient-matching`, `npm run lint`, `npm run build`, `npm run typecheck:full` (separate legacy diagnostic), and smoke test preview if available. Review every changed file, git diff --check. Commit on worktree; publish matching Git tree as dedicated branch via GitHub; open PR targeting PR #25 for stacked review. Do not merge.

## Required behavior tests

- Each common destination appears once, patient and pathology detail routes receive correct context, admin tools hidden for non-admins, `/populate-data` inaccessible to non-admins.
- Dashboard never displays hardcoded alert, analysis, or surveillance counts and safely handles unknown/missing RLS values.
- Navigation retains active link indicator, mobile menu, keyboard focus, theme switch and sign-out; avoid unsupported fake status badges.
- Fallback states render without disclosing patient information on public pages.
