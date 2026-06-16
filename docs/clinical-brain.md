# Medimind clinical brain

This document defines the runtime contract for AI-assisted clinical tools in Medimind.

## Principle

The LLM is not the source of truth. It synthesizes evidence that must first come from deterministic data:

1. Normalize medical names and identifiers when available.
2. Query internal structured data first: pathologies, symptoms, treatments, medications, contraindications, side effects and cached links.
3. Retrieve external evidence only as supporting context, currently PubMed through the Edge Function.
4. Rank the response by clinical risk before choosing the model and reasoning effort.
5. Generate a JSON answer with uncertainty, warnings, recommendations and citations/sources where available.
6. Attach a safety assessment so the frontend can display human-validation requirements.

## Model routing

The shared module is `supabase/functions/_shared/clinical-brain.ts`.

Default routing:

- `simple_lookup`, low risk: `gpt-4o`, low reasoning, short timeout.
- `official_label_summary`, `known_interaction`, `treatment_general`: standard clinical model, medium/high reasoning.
- `suspected_interaction`: standard clinical model, medium/high reasoning based on evidence and risk.
- `polypharmacy`, `treatment_complex`, `final_safety_review`, critical risk or dense graph: strongest configured clinical model, high/xhigh reasoning and longer timeout.

Environment overrides:

- `OPENAI_CLINICAL_SIMPLE_MODEL`
- `OPENAI_CLINICAL_STANDARD_MODEL`
- `OPENAI_CLINICAL_CRITICAL_MODEL`
- `OPENAI_CLINICAL_FINAL_REVIEW_MODEL`
- fallback: `OPENAI_MODEL`

The production secret `OPENAI_API_KEY` remains read only by Supabase Edge Functions.

## Risk flags

The first pass detects:

- high-risk medications: anticoagulants, opioids, benzodiazepines, antiarrhythmics, lithium, methotrexate, insulin, sulfonylureas, immunosuppressants, antiepileptics.
- vulnerable contexts: pregnancy, breastfeeding, child/pediatric, elderly, renal/hepatic impairment, dialysis, immunosuppression.
- critical contexts: anaphylaxis, bleeding, overdose, sepsis, shock, arrhythmia/QT risk, respiratory depression, severe cytopenia.
- dense graph or polypharmacy.

High and critical risk always require human validation. Critical risk or dense/polypharmacy cases require a second-pass style warning in the returned payload.

## Evaluation

Run:

```bash
npm run clinical-brain:audit
```

The current audit verifies:

- low-risk lookup stays cheap and does not require validation.
- critical polypharmacy routes to the strongest configured model.
- vulnerable and critical contexts are detected.
- the safety contract contains source-of-truth, human-validation and no-prescription rules.

The next dataset should add 500 to 2000 evaluated clinical cases and track:

- recall on severe interactions.
- precision on returned links.
- hallucination rate.
- citation/source quality.
- ability to say "unknown" or "insufficient evidence".
- escalation correctness.
- severity consistency.
