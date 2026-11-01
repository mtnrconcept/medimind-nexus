# MediCore — medical AI and evidence integrity implementation plan

**Base:** `main` at `017e25f0ce69cd03974c91417305f50b5b1fddfb`, verified against GitHub. **Worktree:** `codex/medical-ai-evidence-20261031`. **No direct edits to main.**

**Goal:** Make clinical routing risk-aware, reproducible and evidence-conscious while blocking unauthorized administration and anonymous research-evidence poisoning.

**Architecture:** Preserve the existing React/Vite application and the shared Supabase Edge Functions AI client. Route validated clinical workloads through OpenAI's Responses API; use `gpt-6-astra` and `max`/`pro` only for truly critical workflows, `gpt-6.1-sol` for standard clinical analysis, and a lower-cost model for low-risk lookups. The model produces decision support, not validated medical conclusions. Keep client data inaccessible unless Supabase Auth and RLS authorize the user.

**Referenced specifications:** `AGENTS.md` and `docs/superpowers/reports/2026-09-06-design-science-audit.md` on the dedicated audit branch. Current live schema and RLS read from Supabase on 2026-10-31. API reference: https://developers.openai.com/api/docs/models/gpt-6-astra and https://developers.openai.com/api/docs/guides/reasoning .

## Files and order

1. Test `tests/clinical-brain-routing.test.ts` before changes to `supabase/functions/_shared/clinical-brain.ts` and `supabase/functions/_shared/ai-client.ts`. Fix exact-term matching, risk classification, no fabricated external evidence, routing precedence, maximum reasoning token budget, and valid GPT-6 Responses payloads. Update `scripts/clinical-brain-eval.ts` expectations if behavior changes, explaining why.
2. Test `tests/route-access.test.ts` before `src/components/auth/access-policy.ts`, `src/components/auth/ProtectedRoute.tsx`, `src/hooks/useAuth.tsx`, `src/App.tsx` and `src/pages/Admin.tsx`; enforce proper role resolution and refuse nonadmin routes. Rework `src/components/patient/PatientLoginBlock.tsx` to remove the hard-coded client secret, require Supabase Auth, and rely on existing patients RLS.
3. Inspect and test all direct research-table callers before preparing `supabase/migrations/20261031071206_secure_discovery_evidence.sql` (created from the current UTC clock because the Supabase CLI is not installed in this runtime) plus SQL assertions. Do not automatically deploy the migration: verify a PostgreSQL transaction-based authorization test and compare with the live schema. These are legacy global caches, so avoid changing client reads without testing.
4. Run `npm test`, `npm run typecheck`, `npm run clinical-brain:audit`, `npm run lint`, `npm run build`, focused security SQL checks, and check preview Vercel/CI. Use `npm run typecheck:full` as a separate legacy-debt diagnostic. Commit focused changes and open a PR; do not merge without green checks and proven rollout.

**Risks:** New Astra model access/expense and latency, reasoning token exhaustion, unverified claims mistaken for evidence, incorrect user role timing, hidden legacy RLS readers and writers, existing TypeScript debt. High reasoning defaults require live-provider evals before broad release.

**Rollback:** Revert commits through PR; preserve Supabase data. If the RLS migration is deployed, use a reviewed compensating migration rather than dropping clinical records. Avoid enabling costly models in production unless access, billing and latency are confirmed.
