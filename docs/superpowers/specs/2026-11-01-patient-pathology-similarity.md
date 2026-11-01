# Patient pathology similarity — design

## User goal

From a patient's real dossier, choose one of that patient's recorded pathologies and see **all visible patients with exactly the same canonical pathology ID**, ranked by documented similarity of clinical history.

## Clinical and privacy rules

- An exact diagnosis match means the same `pathologies.id` UUID, either `patients.pathology_id` (legacy primary diagnosis) or `patient_pathologies.pathology_id` (multi-diagnosis). Never infer an exact match from a name, substring, embedding or ICD prefix. The source dossier must contain the chosen ID.
- All queries use the logged-in browser's Supabase session and existing RLS, with no elevated/service-role key or new RLS grants. Candidate IDs from the join table are NOT displayed until independently confirmed via `patients` RLS. Do not expose counts of non-visible patients.
- Clinical similarity is a deterministic prioritisation aid, not statistical correlation, incidence, causality or diagnosis. A transparent 0–100 similarity index uses co-diagnoses (25%), coded clinical history (25%), active or documented medication substances (20%), comparable laboratory anomalies (15%), symptom concepts (5%), relative diagnosis timeline (5%) and age proximity (5%). Missing dimensions provide no evidence, are excluded from the mean and reduce the final score through a comparison-coverage penalty. Display coverage and concrete common factors.
- Laboratory comparison must require exact normalized analyte label **and identical units**; never assume that a missing value is normal. Compare only latest valid observations with compatible ranges.
- Exclude the source dossier from results, de-duplicate patients with primary+secondary diagnosis or repeated pathology entries, and order by score, coverage and stable identifier.
- No synthetic fixture dossiers should be inserted into or mixed with production patients. No persistent similarity scores or PHI in logs. No automatic medical conclusions.

## Flow

1. `PatientDetail` loads a patient as it already does, including its principal and linked pathologies.
2. A dedicated card offers a pathology selector (a unique list with labels); none is selected by default.
3. After selection, the service re-verifies source visibility and diagnosis ownership through RLS, discovers exact-id matches via both primary and secondary diagnosis tables, then filters by visible `patients` and loads only permitted clinical feature rows.
4. The pure ranking engine computes score and evidence. The UI displays number of accessible matches, clinical-completeness caveat, ranked cards, shared features, a direct dossier link, loading/error/empty states, and a manual refresh control.
5. Every request is bounded by pagination and batches; a query cap must produce a visible partial-results warning rather than claiming completeness.

## No-change boundaries

No Supabase migration, no changes to patient data, no real-time background surveillance, no new model inference or OpenAI spending. This is explicitly user-triggered and read-only.

## Rollback

Revert the feature commit. No database rollback needed. Prior dossier rendering continues unchanged.
