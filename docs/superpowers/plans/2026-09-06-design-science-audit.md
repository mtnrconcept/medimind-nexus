# MediCore design and scientific reliability audit

## Goal
Review the real interface in Chromium, inventory every routed tool, run existing quality checks, and challenge scientific routing with reproducible counterexamples. A deployed page or a high reasoning setting is not a scientific validation.

## Baseline and isolation
- Repository: mtnrconcept/medimind-nexus.
- Audited application baseline: 017e25f0ce69cd03974c91417305f50b5b1fddfb.
- Dedicated branch: codex/design-scientific-audit-20260906.
- The runner checks git status, reads AGENTS.md, fetches the current remote state and creates a separate git worktree before executing the audit.
- No application modification, migration, production deployment, merge, patient export, account creation or import is authorized by this audit.

## Files
1. This plan records scope, risks and rollback.
2. .github/workflows/medicore-browser-science-audit.yml adds a branch-scoped diagnostic workflow. It runs browser checks and scientific counterexamples from the dedicated worktree, retains evidence and fails its validation gate when checks fail.
3. A subsequent report may be added under docs/superpowers after the evidence is reviewed. It must distinguish observations, hypotheses, failures and untested behavior.

## Execution order
1. Verify GitHub, target Supabase project, Vercel project and ClinicalTrials.gov connectivity. Read actual repository routes, auth guards, frontend config, dependency scripts and deployed clinical handlers.
2. Run npm test, focused and full typechecks, ESLint, production build, the existing clinical-brain audit and production dependency audit. Capture each exit code independently; do not skip later checks after an earlier failure.
3. Open production public routes in actual Chromium at desktop and mobile widths. Check initial rendering, public form behavior, protected-route redirects, console failures, accessible labels and horizontal overflow. Save screenshots only while data-service traffic is blocked to avoid capturing patient data. This is an interface/access-guard test, not a backend test.
4. Inventory every static and parameterized route and every Edge Function in the repository. Mark signed-in workflows blocked without an authorized dedicated test session. Do not count redirection to /auth as successful use of a tool.
5. Exercise actual pure clinical routing functions with neutral-text, free-text medication, critical-risk and unavailable-evidence cases. These are software regression tests, not clinical validation and not model-output evaluations.
6. Compare scientific data handling with the ClinicalTrials.gov connector and official documentation. A registered study must not be presented as verified efficacy.
7. Review screenshots and evidence, then publish a report and a PR without merging.

## Risks and mitigations
- The production database contains patient data. Block browser requests to Supabase data/function/storage services during screenshots; never capture session tokens or medical records.
- Administrative import buttons may write or delete data. Do not activate them on production.
- The local execution environment cannot resolve its outbound proxy. Use the connected GitHub Actions runner, not a fabricated local-browser result.
- Authenticated end-to-end workflows and generated scientific conclusions require a dedicated test account, synthetic fixtures and reference answers. Mark them unverified until actually exercised.
- The existing default typecheck covers only a small set of clinical files. Run typecheck:full separately and report its actual result.

## Rollback
The audit changes no runtime behavior or database state. Revert the audit-only commits or close the PR; never revert security migrations or alter main as part of cleanup.
