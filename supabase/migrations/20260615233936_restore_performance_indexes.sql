-- Restore high-value indexes used by the current app and Edge Functions.
-- This migration is intentionally non-destructive: no duplicate cleanup or
-- constraint tightening is done without production measurements first.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cross-data analyzer cache lookups.
CREATE INDEX IF NOT EXISTS idx_causal_links_cache_pair_hash
  ON public.causal_links_cache(pair_hash);

CREATE INDEX IF NOT EXISTS idx_causal_links_cache_from_lookup
  ON public.causal_links_cache(from_type, from_element);

CREATE INDEX IF NOT EXISTS idx_causal_links_cache_to_lookup
  ON public.causal_links_cache(to_type, to_element);

CREATE INDEX IF NOT EXISTS idx_analysis_cache_request_hash
  ON public.analysis_cache(request_hash);

-- Medical search/typeahead paths that use ILIKE in frontend and functions.
CREATE INDEX IF NOT EXISTS idx_pathologies_name_trgm
  ON public.pathologies USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_symptoms_name_trgm
  ON public.symptoms USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_treatments_name_trgm
  ON public.treatments USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_medications_name_trgm
  ON public.medications USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_medications_substance_trgm
  ON public.medications USING gin (substance gin_trgm_ops);

-- Patient dossier cards all filter by patient_id and most order by a date.
CREATE INDEX IF NOT EXISTS idx_patients_pathology_created
  ON public.patients(pathology_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_created
  ON public.patients(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_medical_history_patient_created
  ON public.patient_medical_history(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_family_history_patient_relationship
  ON public.patient_family_history(patient_id, relationship);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient_created
  ON public.patient_allergies(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_vaccinations_patient_date
  ON public.patient_vaccinations(patient_id, vaccination_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_lab_results_patient_date
  ON public.patient_lab_results(patient_id, test_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_imaging_patient_date
  ON public.patient_imaging(patient_id, exam_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_clinical_data_patient_recorded
  ON public.patient_clinical_data(patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_prevention_patient_next_screening
  ON public.patient_prevention(patient_id, next_screening_date);

CREATE INDEX IF NOT EXISTS idx_patient_mental_health_patient_entry
  ON public.patient_mental_health(patient_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_reproductive_health_patient_entry
  ON public.patient_reproductive_health(patient_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_functional_exams_patient_exam
  ON public.patient_functional_exams(patient_id, exam_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_age_specific_patient_entry
  ON public.patient_age_specific(patient_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_social_factors_patient_created
  ON public.patient_social_factors(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_dental_patient_entry
  ON public.patient_dental(patient_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_consultations_patient_date
  ON public.patient_consultations(patient_id, consultation_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_communications_patient_date
  ON public.patient_communications(patient_id, communication_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_monitoring_patient_date
  ON public.patient_monitoring(patient_id, monitoring_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_created
  ON public.patient_documents(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_status_created
  ON public.patient_documents(patient_id, extraction_status, created_at DESC);

-- CDE graph traversal, search and discovery dashboards.
CREATE INDEX IF NOT EXISTS idx_cde_nodes_type_name
  ON public.cde_nodes(node_type, name);

CREATE INDEX IF NOT EXISTS idx_cde_nodes_name_trgm
  ON public.cde_nodes USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cde_nodes_external_id
  ON public.cde_nodes(external_id);

CREATE INDEX IF NOT EXISTS idx_cde_edges_source
  ON public.cde_edges(source_node_id);

CREATE INDEX IF NOT EXISTS idx_cde_edges_target
  ON public.cde_edges(target_node_id);

CREATE INDEX IF NOT EXISTS idx_cde_edges_source_target
  ON public.cde_edges(source_node_id, target_node_id);

CREATE INDEX IF NOT EXISTS idx_cde_edges_target_source
  ON public.cde_edges(target_node_id, source_node_id);

CREATE INDEX IF NOT EXISTS idx_cde_edges_relationship
  ON public.cde_edges(relationship_type);

CREATE INDEX IF NOT EXISTS idx_cde_edges_provenance
  ON public.cde_edges(provenance);

CREATE INDEX IF NOT EXISTS idx_discovery_cards_created
  ON public.discovery_cards(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_cards_status_created
  ON public.discovery_cards(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_cards_severity
  ON public.discovery_cards(severity_score DESC);

-- LBD dashboard ordering and relationship joins.
CREATE INDEX IF NOT EXISTS idx_frontier_jobs_priority
  ON public.frontier_jobs(priority DESC);

CREATE INDEX IF NOT EXISTS idx_frontier_jobs_status_priority
  ON public.frontier_jobs(status, priority DESC);

CREATE INDEX IF NOT EXISTS idx_lbd_claims_aggregate_score
  ON public.lbd_claims(aggregate_score DESC);

CREATE INDEX IF NOT EXISTS idx_lbd_claims_status_score
  ON public.lbd_claims(status, aggregate_score DESC);

CREATE INDEX IF NOT EXISTS idx_lbd_reasoning_traces_created
  ON public.lbd_reasoning_traces(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lbd_contradictions_created
  ON public.lbd_contradictions(created_at DESC);
