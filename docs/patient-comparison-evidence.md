# Evidence displayed in patient dossier comparison

## Purpose and data flow

The previous cards exposed only common labels and dimension percentages. In particular, two laboratory values flagged abnormal could receive 100% biological similarity despite a large numeric difference. A dimension populated in just one dossier also counted towards apparent completeness.

The authenticated patient detail page now reads the existing patient comparison gateway, ranks authorized peers, and displays five sections: dates/conditions, laboratory/clinical variables, treatments/symptoms, scoring rules, and exploratory research questions. The first card opens its detail panel; additional cards expand on demand. Results render ten at a time without truncating the cohort or its ranking.

`authorizedMatches.ts` continues to reauthorize the source, the selected condition and candidate patient IDs before profile enrichment. Every clinical query remains scoped to those authorized IDs and protected by the user's Supabase session/RLS. Existing pagination and size bounds apply. No clinical writes, migration, Edge Function, external research request or AI provider call is introduced. Errors clear stale results and remain visible; unavailable data is never converted into an empty successful comparison.

## Evidence and provenance

- Coded diagnoses match only by canonical UUID. Uncoded disease entries match by full recorded label, with case/accent/whitespace normalization; this is explicitly weaker than a confirmed shared diagnosis.
- Detail evidence uses original source/peer profiles, not the temporary anchors used to score an uncoded selected condition.
- Diagnosis dates, other diseases/procedures, their provenance and signed intervals relative to the selected diagnosis are shown. Earliest valid recorded diagnosis dates anchor chronology. Biological onset and age at onset are not inferred from age, treatment dates or record creation timestamps.
- Raw laboratory values, units, dates, reference bounds, abnormal flags and every supplied observation remain inspectable. The latest dated observation is selected before checking its value. A missing or invalid newest value does not silently select an older result. Different observations at the same latest time are ambiguous and excluded from scoring. Undated observations remain visible and are counted explicitly.
- Numeric comparisons require the same complete analyte label, matching units, valid dated values and consistent supplied reference metadata. Unit normalization only ignores whitespace and normalizes the two micro symbols; it does not change case, scale, or convert units. Missing references do not imply normality. A single reference bound is identified as incomplete.
- The difference is `peer − source`; relative difference is `abs(peer − source) / max(abs(source), abs(peer))`, with zero for two zero values. Laboratory similarity is `max(0, 1 − relativeDifference)`, averaged across usable analyte pairs. Date gaps are shown, not adjusted away. This is numerical proximity, not a validated clinical equivalence threshold.
- Clinical variables come from `patient_clinical_data`, with the latest dated non-null value for each field and the recorded timestamp. Null fields in a visit do not create synthetic zero measurements. These variables contextualize the comparison and do not add ranking weights.
- Treatments retain names, substances, doses, frequency, start/end dates and recorded active status. Symptoms retain names, onset dates, severity, frequency and resolution status. Historical entries are not assumed active merely because an end date is absent.

## Ranking rules

Weights stay at 25 diagnoses, 25 history, 20 medications, 15 laboratory, 5 symptoms, 5 chronology, and 5 age. Sets use shared/distinct elements across the two dossiers. If either counterpart is undocumented, that dimension is not calculable rather than a documented clinical difference. History keys include the complete label and condition type. Medication matching prefers substance, then ATC, then canonical medication ID; a brand name is not relabeled as a substance.

Chronology uses the earliest recorded date for each common antecedent preceding or coinciding with the selected diagnosis, comparing its delay with a 3,650-day heuristic scale. Later conditions are displayed but excluded from this dimension. Age uses a 40-year heuristic scale. These scales and all weights are exposed in the UI.

For usable dimensions, `W = sum(weights)` and `S = sum(weight × similarity)`. The displayed index is `round(100 × S/W × min(1, W/60))`, or zero when W is zero. The dimension counts, weighted points, W, coverage multiplier and formula are displayed. “Weighted coverage” is not the proportion of all dossier fields completed or the confidence of a medical conclusion. Constants, doses, severity and duration do not silently enter this score.

## Research questions

Deterministic prompts connect the compared records' shared diseases and dates, the most different usable laboratory pair, and a shared treatment to an open question and concrete verification steps. Sparse comparisons show a data-completion question. These are exploratory questions, not retrieved publications, evidence of association, diagnostic recommendations or causal conclusions. No patient context is sent outside the authorized application.

## Verified schema and compatibility

Live column metadata and SELECT policies were checked on 2026-11-06. `patient_clinical_data`, `patient_lab_results`, `patient_medications`, and `patient_symptoms` require `has_patient_access(patient_id, false)` for authenticated reads. The current live columns include `spo2` and `is_resolved`; generated frontend types still describe older names. The two narrow query result overrides in `supabaseGateway.ts` document that verified difference without changing unrelated schema types. No free-text notes, staff identifiers or additional patient identity fields are fetched.

## Verification and rollback

`tests/patient-comparison-evidence.test.ts` covers numeric similarity, missing counterparts, dates and chronology, newest invalid values, conflicting observations, units, true zero/tiny values, invalid references/flags, evidence provenance, all associated conditions, reproducible scores, raw treatment/symptom details and fact-linked research questions. Existing selector and authorization tests remain required.

`scripts/check-patient-pathology-browser.mjs` exercises the real UI/client/gateway with synthetic API responses in Chromium: all five tabs, raw values, histories, incompatible units, missing latest data, zero-valued constants, treatment status, the score explanation, research questions, read failure/retry, and 390px layouts. It also preserves selector, pagination, authorization-order and refresh regression coverage. Screenshots contain only synthetic records, and unexpected external requests fail the check.

Run the patient matching TypeScript target, ESLint, production build and required repository CI. Roll back application behavior by reverting the merge commit and redeploying. No clinical data rollback is needed.
