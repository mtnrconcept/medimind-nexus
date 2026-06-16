// Supabase Edge Function: Patient Health Synthesis
// Generates a clinical summary without blocking the browser request.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callAI,
  cleanJsonString,
  retrieveBackgroundAI,
  startBackgroundAI,
} from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_NAME = "patient-health-synthesis";
const INTERACTIVE_AI_TIMEOUT_MS = 45_000;
const BACKGROUND_AI_TIMEOUT_MS = 130_000;
const MAX_CONTEXT_TEXT_LENGTH = 800;

type JobStatus = "queued" | "processing" | "completed" | "failed";

interface HealthSynthesis {
  global_synthesis: string;
  health_score: number;
  risk_level: "low" | "moderate" | "high" | "critical";
  vigilance_points: Array<{
    category: string;
    level: "info" | "warning" | "critical";
    title: string;
    description: string;
    action_needed?: string;
  }>;
  weak_signals: Array<{
    indicator: string;
    trend: "stable" | "improving" | "worsening";
    observation: string;
    recommendation: string;
  }>;
  treatment_recommendations: Array<{
    category: string;
    current_situation: string;
    suggested_action: string;
    rationale: string;
    priority: "low" | "medium" | "high";
  }>;
  prevention_alerts: Array<{
    screening: string;
    status: "up_to_date" | "due_soon" | "overdue" | "never_done";
    due_date?: string;
    recommendation: string;
  }>;
  lifestyle_advice: Array<{
    category: string;
    current_status: string;
    advice: string;
    impact: string;
  }>;
  drug_interactions: Array<{
    medications: string[];
    interaction_type: string;
    severity: "mild" | "moderate" | "severe";
    recommendation: string;
  }>;
  summary_for_patient: string;
}

type Payload = {
  action?: string;
  async?: boolean;
  runJob?: boolean;
  jobId?: string;
  jobToken?: string;
  providerResponseId?: string;
  patient_id?: string;
};

type PatientContext = {
  demographics: Record<string, unknown>;
  current_medications: Array<Record<string, unknown>>;
  current_pathologies: Array<Record<string, unknown>>;
  confirmed_drug_interactions: Array<Record<string, unknown>>;
  allergies: Array<Record<string, unknown>>;
  vaccinations: Array<Record<string, unknown>>;
  active_symptoms: Array<Record<string, unknown>>;
  medical_history: Array<Record<string, unknown>>;
  family_history: Array<Record<string, unknown>>;
  lifestyle: Record<string, unknown> | null;
  recent_vitals: Record<string, unknown> | null;
  recent_labs: Array<Record<string, unknown>>;
  prevention_status: Array<Record<string, unknown>>;
  recent_consultations: Array<Record<string, unknown>>;
  imaging_results: Array<Record<string, unknown>>;
  functional_exams: Array<Record<string, unknown>>;
  mental_health: Record<string, unknown> | null;
  reproductive_health: Record<string, unknown> | null;
  social_factors: Record<string, unknown> | null;
  dental_status: Record<string, unknown> | null;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeJobPayload(payload: Payload): Payload {
  const {
    action: _action,
    async: _async,
    runJob: _runJob,
    jobId: _jobId,
    jobToken: _jobToken,
    providerResponseId: _providerResponseId,
    ...requestPayload
  } = payload;
  return requestPayload;
}

function isOpenAIBackgroundPending(status: string | undefined | null): boolean {
  return status === "queued" || status === "in_progress";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function shortText(value: unknown, maxLength = MAX_CONTEXT_TEXT_LENGTH): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function pickText(row: any, keys: string[], maxLength = MAX_CONTEXT_TEXT_LENGTH): string | null {
  for (const key of keys) {
    const value = shortText(row?.[key], maxLength);
    if (value) return value;
  }
  return null;
}

function normalizeSeverity(value: unknown): "mild" | "moderate" | "severe" {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("severe") || normalized.includes("major") || normalized.includes("critical") || normalized.includes("grave")) {
    return "severe";
  }
  if (normalized.includes("mild") || normalized.includes("minor") || normalized.includes("low") || normalized.includes("leger")) {
    return "mild";
  }
  return "moderate";
}

async function updateJob(
  supabase: any,
  jobId: string | undefined,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return;
  const { error } = await supabase
    .from("ai_analysis_jobs")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("[PatientHealthSynthesis] Job update failed:", error);
  }
}

function startWorker(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
  publicToken: string,
  payload: Payload,
): void {
  const workerPayload: Payload = {
    ...sanitizeJobPayload(payload),
    ...(payload.providerResponseId ? { providerResponseId: payload.providerResponseId } : {}),
    runJob: true,
    jobId,
    jobToken: publicToken,
  };

  const processor = fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(workerPayload),
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      await updateJob(supabase, jobId, {
        status: "failed",
        progress_percentage: 100,
        progress_message: "Echec du worker de synthese patient.",
        error_message: `Worker returned ${response.status}: ${errorText}`,
        completed_at: new Date().toISOString(),
      });
    }
  }).catch(async (error) => {
    await updateJob(supabase, jobId, {
      status: "failed",
      progress_percentage: 100,
      progress_message: "Echec du lancement du worker de synthese patient.",
      error_message: getErrorMessage(error),
      completed_at: new Date().toISOString(),
    });
  });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(processor);
  } else {
    processor.catch((error) => console.error("[PatientHealthSynthesis] Background worker error:", error));
  }
}

async function requireAuthenticatedUser(req: Request, supabase: any, serviceRoleKey: string): Promise<Response | null> {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader === `Bearer ${serviceRoleKey}`) {
    return null;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return jsonResponse({ error: "Invalid session" }, 401);
  }

  return null;
}

async function rows(query: PromiseLike<{ data: any; error: any }>, label: string): Promise<any[]> {
  const { data, error } = await query;
  if (error) {
    console.warn(`[PatientHealthSynthesis] ${label} query failed:`, error.message || error);
    return [];
  }
  return asArray(data);
}

async function one(query: PromiseLike<{ data: any; error: any }>, label: string): Promise<any | null> {
  const { data, error } = await query;
  if (error) {
    console.warn(`[PatientHealthSynthesis] ${label} query failed:`, error.message || error);
    return null;
  }
  return data ?? null;
}

function medicationName(row: any): string | null {
  return pickText(row?.medications, ["name", "swissmedic_name", "substance"], 160)
    || pickText(row, ["medication_name", "drug_name", "name"], 160);
}

function compactMedication(row: any): Record<string, unknown> {
  const med = row?.medications || {};
  return {
    id: row?.medication_id || med?.id || null,
    name: medicationName(row),
    substance: pickText(med, ["substance", "composition"], 240),
    atc_code: med?.atc_code || null,
    dosage: shortText(row?.dosage, 160),
    frequency: shortText(row?.frequency, 160),
    active: row?.is_active ?? null,
    start_date: row?.start_date || null,
    notes: shortText(row?.notes, 300),
    indications: shortText(med?.indications, 300),
  };
}

function compactPathology(row: any): Record<string, unknown> {
  const pathology = row?.pathologies || row || {};
  return {
    name: pickText(pathology, ["name"], 180),
    icd_code: pathology?.icd_code || null,
    category: pathology?.category || null,
    severity: pathology?.severity || row?.severity || null,
    status: row?.status || null,
    diagnosis_date: row?.diagnosis_date || null,
    notes: shortText(row?.notes, 300),
  };
}

function compactConfirmedInteractions(interactions: any[], medications: any[]): Array<Record<string, unknown>> {
  const medicationById = new Map<string, string>();
  for (const medication of medications) {
    const id = medication?.medication_id || medication?.medications?.id;
    const name = medicationName(medication);
    if (id && name) medicationById.set(String(id), name);
  }

  return interactions.slice(0, 40).map((interaction) => {
    const sourceName = medicationById.get(String(interaction?.medication_id || "")) || "Medicament du dossier";
    const targetName = pickText(interaction, ["interacting_drug"], 180) || "Medicament associe";
    return {
      medications: [sourceName, targetName],
      interaction_type: pickText(interaction, ["interaction_type", "description"], 300) || "interaction documentee",
      severity: normalizeSeverity(interaction?.severity),
      recommendation: pickText(interaction, ["recommendation", "description"], 500) || "Validation clinique requise.",
      source: "drug_interactions",
    };
  });
}

async function fetchPatientContext(supabase: any, patientId: string): Promise<PatientContext> {
  const patient = await one(
    supabase
      .from("patients")
      .select("id, age, gender, nationality, weight_kg, height_cm, pathologies(id, name, icd_code, category, severity)")
      .eq("id", patientId)
      .maybeSingle(),
    "patient",
  );

  if (!patient) {
    throw new Error("Patient not found");
  }

  const [
    medications,
    patientPathologies,
    allergies,
    vaccinations,
    symptoms,
    medicalHistory,
    familyHistory,
    lifestyle,
    clinicalData,
    labResults,
    prevention,
    consultations,
    imaging,
    functionalExams,
    mentalHealth,
    reproductiveHealth,
    socialFactors,
    dental,
  ] = await Promise.all([
    rows(
      supabase
        .from("patient_medications")
        .select("*, medications(id, name, substance, atc_code, medication_category, indications)")
        .eq("patient_id", patientId)
        .limit(40),
      "medications",
    ),
    rows(
      supabase
        .from("patient_pathologies")
        .select("*, pathologies(id, name, icd_code, category, severity)")
        .eq("patient_id", patientId)
        .limit(40),
      "pathologies",
    ),
    rows(supabase.from("patient_allergies").select("*").eq("patient_id", patientId).limit(40), "allergies"),
    rows(supabase.from("patient_vaccinations").select("*").eq("patient_id", patientId).limit(40), "vaccinations"),
    rows(
      supabase
        .from("patient_symptoms")
        .select("*, symptoms(id, name, body_system)")
        .eq("patient_id", patientId)
        .eq("is_active", true)
        .limit(30),
      "symptoms",
    ),
    rows(supabase.from("patient_medical_history").select("*").eq("patient_id", patientId).limit(40), "medical_history"),
    rows(supabase.from("patient_family_history").select("*").eq("patient_id", patientId).limit(25), "family_history"),
    one(supabase.from("patient_lifestyle").select("*").eq("patient_id", patientId).maybeSingle(), "lifestyle"),
    rows(
      supabase
        .from("patient_clinical_data")
        .select("*")
        .eq("patient_id", patientId)
        .order("recorded_at", { ascending: false })
        .limit(10),
      "clinical_data",
    ),
    rows(
      supabase
        .from("patient_lab_results")
        .select("*")
        .eq("patient_id", patientId)
        .order("test_date", { ascending: false })
        .limit(30),
      "lab_results",
    ),
    rows(supabase.from("patient_prevention").select("*").eq("patient_id", patientId).limit(30), "prevention"),
    rows(
      supabase
        .from("patient_consultations")
        .select("*")
        .eq("patient_id", patientId)
        .order("consultation_date", { ascending: false })
        .limit(12),
      "consultations",
    ),
    rows(
      supabase
        .from("patient_imaging")
        .select("*")
        .eq("patient_id", patientId)
        .order("exam_date", { ascending: false })
        .limit(12),
      "imaging",
    ),
    rows(
      supabase
        .from("patient_functional_exams")
        .select("*")
        .eq("patient_id", patientId)
        .order("exam_date", { ascending: false })
        .limit(12),
      "functional_exams",
    ),
    one(supabase.from("patient_mental_health").select("*").eq("patient_id", patientId).maybeSingle(), "mental_health"),
    one(supabase.from("patient_reproductive_health").select("*").eq("patient_id", patientId).maybeSingle(), "reproductive_health"),
    one(supabase.from("patient_social_factors").select("*").eq("patient_id", patientId).maybeSingle(), "social_factors"),
    rows(supabase.from("patient_dental").select("*").eq("patient_id", patientId).limit(5), "dental"),
  ]);

  const medicationIds = medications
    .map((row) => row?.medication_id || row?.medications?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const confirmedInteractionRows = medicationIds.length > 0
    ? await rows(
      supabase
        .from("drug_interactions")
        .select("medication_id, interacting_drug, interaction_type, severity, description, recommendation")
        .in("medication_id", medicationIds)
        .limit(60),
      "drug_interactions",
    )
    : [];

  const latestVitals = clinicalData[0];
  const latestDental = dental[0];

  return {
    demographics: {
      age: patient.age,
      gender: patient.gender,
      nationality: patient.nationality,
      weight_kg: patient.weight_kg,
      height_cm: patient.height_cm,
      primary_pathology: patient.pathologies ? compactPathology({ pathologies: patient.pathologies }) : null,
    },
    current_medications: medications.map(compactMedication).filter((item) => item.name),
    current_pathologies: patientPathologies.map(compactPathology).filter((item) => item.name),
    confirmed_drug_interactions: compactConfirmedInteractions(confirmedInteractionRows, medications),
    allergies: allergies.slice(0, 30).map((row) => ({
      allergen: pickText(row, ["allergen"], 180),
      type: pickText(row, ["allergy_type", "allergen_type"], 120),
      severity: row?.severity || null,
      reaction: shortText(row?.reaction, 250),
      confirmed: row?.confirmed ?? row?.verified ?? null,
    })).filter((item) => item.allergen),
    vaccinations: vaccinations.slice(0, 30).map((row) => ({
      vaccine: pickText(row, ["vaccine_name"], 180),
      date: row?.vaccination_date || null,
      dose_number: row?.dose_number || null,
      next_dose_due: row?.next_dose_date || null,
    })).filter((item) => item.vaccine),
    active_symptoms: symptoms.slice(0, 25).map((row) => ({
      name: pickText(row, ["symptom_name"], 180) || pickText(row?.symptoms, ["name"], 180),
      severity: row?.severity || null,
      onset: row?.onset_date || null,
      frequency: row?.frequency || null,
      notes: shortText(row?.notes, 250),
    })).filter((item) => item.name),
    medical_history: medicalHistory.slice(0, 30).map((row) => ({
      condition_name: pickText(row, ["condition_name"], 220),
      condition_type: row?.condition_type || null,
      severity: row?.severity || null,
      diagnosis_date: row?.diagnosis_date || null,
      resolution_date: row?.resolution_date || null,
      treatment: shortText(row?.treatment, 300),
      is_chronic: row?.is_chronic ?? null,
      notes: shortText(row?.notes, 300),
    })).filter((item) => item.condition_name),
    family_history: familyHistory.slice(0, 20).map((row) => ({
      relationship: row?.relationship || null,
      condition: pickText(row, ["condition"], 220),
      age_at_diagnosis: row?.age_at_diagnosis || null,
      is_deceased: row?.is_deceased ?? null,
      cause_of_death: shortText(row?.cause_of_death, 250),
    })).filter((item) => item.condition),
    lifestyle: lifestyle ? {
      smoking: lifestyle.smoking_status || null,
      alcohol: lifestyle.alcohol_status || lifestyle.alcohol_consumption || null,
      physical_activity: lifestyle.physical_activity_level || lifestyle.physical_activity || null,
      diet: lifestyle.diet_type || null,
      sleep_hours: lifestyle.sleep_hours_average || lifestyle.sleep_hours || null,
      sleep_quality: lifestyle.sleep_quality || null,
      notes: shortText(lifestyle.notes, 300),
    } : null,
    recent_vitals: latestVitals ? {
      bp: latestVitals.systolic_bp || latestVitals.diastolic_bp
        ? `${latestVitals.systolic_bp || "?"}/${latestVitals.diastolic_bp || "?"}`
        : null,
      heart_rate: latestVitals.heart_rate || null,
      weight: latestVitals.weight_kg || null,
      bmi: latestVitals.bmi || null,
      temperature: latestVitals.temperature || null,
      spo2: latestVitals.oxygen_saturation || latestVitals.spo2 || null,
      respiratory_rate: latestVitals.respiratory_rate || null,
      recorded_at: latestVitals.recorded_at || null,
    } : null,
    recent_labs: labResults.slice(0, 30).map((row) => ({
      test: pickText(row, ["test_name"], 180),
      category: row?.category || row?.test_category || null,
      value: row?.value ?? null,
      unit: row?.unit || null,
      is_abnormal: row?.is_abnormal ?? null,
      date: row?.test_date || null,
      reference_min: row?.reference_min ?? null,
      reference_max: row?.reference_max ?? null,
      interpretation: shortText(row?.interpretation || row?.notes, 250),
    })).filter((item) => item.test),
    prevention_status: prevention.slice(0, 20).map((row) => ({
      screening: pickText(row, ["screening_type", "screening_name"], 180),
      last_done: row?.last_screening_date || row?.last_exam_date || null,
      next_due: row?.next_screening_date || row?.next_due_date || null,
      status: row?.result_status || row?.result || null,
      is_normal: row?.is_normal ?? null,
    })).filter((item) => item.screening),
    recent_consultations: consultations.slice(0, 10).map((row) => ({
      date: row?.consultation_date || null,
      specialty: row?.specialty || null,
      reason: shortText(row?.reason, 250),
      diagnosis: shortText(row?.diagnosis, 250),
      treatment_plan: shortText(row?.treatment_plan, 300),
      follow_up_date: row?.follow_up_date || null,
      notes: shortText(row?.notes, 300),
    })),
    imaging_results: imaging.slice(0, 10).map((row) => ({
      type: row?.imaging_type || row?.exam_type || null,
      body_part: row?.body_region || row?.body_part || null,
      date: row?.exam_date || null,
      findings: shortText(row?.findings, 400),
      conclusion: shortText(row?.conclusion, 400),
      is_abnormal: row?.is_abnormal ?? null,
    })),
    functional_exams: functionalExams.slice(0, 10).map((row) => ({
      type: row?.exam_type || null,
      date: row?.exam_date || null,
      findings: shortText(row?.findings || row?.result_summary, 350),
      conclusion: shortText(row?.conclusion, 350),
      is_abnormal: row?.is_abnormal ?? (typeof row?.is_normal === "boolean" ? !row.is_normal : null),
    })),
    mental_health: mentalHealth ? {
      mood_score: mentalHealth.mood_score || null,
      anxiety_level: mentalHealth.anxiety_level || mentalHealth.anxiety_score || null,
      depression_score: mentalHealth.depression_score || null,
      sleep_quality: mentalHealth.sleep_quality || null,
      diagnosis: shortText(mentalHealth.diagnosis, 240),
      severity: mentalHealth.severity || null,
      notes: shortText(mentalHealth.notes, 300),
    } : null,
    reproductive_health: reproductiveHealth ? {
      pregnancy_status: reproductiveHealth.pregnancy_status || null,
      contraception: reproductiveHealth.contraception_method || null,
      due_date: reproductiveHealth.due_date || null,
      complications: shortText(reproductiveHealth.complications, 300),
      notes: shortText(reproductiveHealth.notes, 300),
    } : null,
    social_factors: socialFactors ? {
      housing: socialFactors.housing_status || socialFactors.housing_situation || null,
      employment: socialFactors.employment_status || null,
      education: socialFactors.education_level || null,
      social_support: socialFactors.has_family_support ?? socialFactors.social_support_level ?? null,
      financial_stress: socialFactors.financial_difficulties ?? socialFactors.financial_stress ?? null,
      isolation: socialFactors.is_isolated ?? null,
      mobility_issues: socialFactors.mobility_issues ?? null,
    } : null,
    dental_status: latestDental ? {
      last_exam: latestDental.exam_date || latestDental.entry_date || null,
      procedure: shortText(latestDental.procedure, 180),
      notes: shortText(latestDental.notes, 250),
      next_appointment: latestDental.next_appointment || null,
    } : null,
  };
}

function buildSystemPrompt(): string {
  return `Tu es un assistant medical expert francophone pour la synthese d'un dossier patient.

Tu dois repondre uniquement avec un objet JSON valide, sans markdown, compatible avec ce schema:
{
  "global_synthesis": "Synthese narrative factuelle de l'etat de sante global (2-3 paragraphes)",
  "health_score": 0,
  "risk_level": "low|moderate|high|critical",
  "vigilance_points": [{"category": "cardiovascular|metabolic|respiratory|neurological|oncological|infectious|mental|other", "level": "info|warning|critical", "title": "Titre court", "description": "Description clinique", "action_needed": "Action a discuter avec un clinicien"}],
  "weak_signals": [{"indicator": "Indicateur", "trend": "stable|improving|worsening", "observation": "Observation", "recommendation": "Suivi recommande"}],
  "treatment_recommendations": [{"category": "medication|therapy|procedure|monitoring|lifestyle", "current_situation": "Situation actuelle", "suggested_action": "Action a discuter", "rationale": "Justification", "priority": "low|medium|high"}],
  "prevention_alerts": [{"screening": "Depistage", "status": "up_to_date|due_soon|overdue|never_done", "due_date": "YYYY-MM-DD", "recommendation": "Recommandation"}],
  "lifestyle_advice": [{"category": "nutrition|exercise|sleep|stress|tobacco|alcohol|other", "current_status": "Etat actuel", "advice": "Conseil", "impact": "Impact attendu"}],
  "drug_interactions": [{"medications": ["A", "B"], "interaction_type": "Type", "severity": "mild|moderate|severe", "recommendation": "Recommandation"}],
  "summary_for_patient": "Resume simple pour le patient"
}

Contraintes cliniques:
- Base ton raisonnement sur les donnees structurees fournies, pas sur une hypothese inventee.
- N'ajoute une interaction medicamenteuse que si elle est presente dans confirmed_drug_interactions.
- Si aucune interaction confirmee n'est fournie, retourne drug_interactions: [] et mentionne seulement la necessite d'une validation clinique en vigilance si le contexte le justifie.
- Pour toute recommandation, formule une option a discuter avec un professionnel de sante, jamais une prescription.
- Mentionne explicitement l'incertitude, les donnees manquantes et la necessite de validation humaine pour les risques importants.
- Le score de sante doit etre coherent avec le nombre de pathologies actives, anomalies biologiques, medicaments, allergies, symptomes et facteurs sociaux.`;
}

function parseSynthesis(content: string, context: PatientContext): HealthSynthesis {
  const parsed = JSON.parse(cleanJsonString(content));
  return normalizeSynthesis(parsed, context, null);
}

function normalizeSynthesis(value: any, context: PatientContext, degradedReason: string | null): HealthSynthesis {
  const confirmedInteractions = context.confirmed_drug_interactions.map((interaction) => ({
    medications: asArray<string>(interaction.medications).map(String).filter(Boolean).slice(0, 4),
    interaction_type: shortText(interaction.interaction_type, 250) || "Interaction documentee",
    severity: normalizeSeverity(interaction.severity),
    recommendation: shortText(interaction.recommendation, 400) || "Validation clinique requise.",
  })).filter((interaction) => interaction.medications.length >= 2);

  const healthScore = typeof value?.health_score === "number"
    ? clamp(Math.round(value.health_score), 0, 100)
    : scoreFromContext(context);
  const riskLevel = ["low", "moderate", "high", "critical"].includes(value?.risk_level)
    ? value.risk_level as HealthSynthesis["risk_level"]
    : riskLevelFromScore(healthScore);

  const globalPrefix = degradedReason
    ? `Synthese provisoire basee sur les donnees structurees disponibles. Limite: ${degradedReason}. `
    : "";

  return {
    global_synthesis: `${globalPrefix}${shortText(value?.global_synthesis, 4000) || fallbackGlobalSynthesis(context)}`,
    health_score: healthScore,
    risk_level: riskLevel,
    vigilance_points: normalizeVigilancePoints(value?.vigilance_points, context, degradedReason),
    weak_signals: normalizeWeakSignals(value?.weak_signals, context),
    treatment_recommendations: normalizeTreatmentRecommendations(value?.treatment_recommendations, context),
    prevention_alerts: normalizePreventionAlerts(value?.prevention_alerts, context),
    lifestyle_advice: normalizeLifestyleAdvice(value?.lifestyle_advice, context),
    drug_interactions: confirmedInteractions.length > 0 ? confirmedInteractions : [],
    summary_for_patient: shortText(value?.summary_for_patient, 600)
      || "Cette synthese est informative et doit etre validee par un professionnel de sante.",
  };
}

function scoreFromContext(context: PatientContext): number {
  let score = 82;
  score -= context.current_pathologies.length * 6;
  score -= context.active_symptoms.length * 3;
  score -= context.allergies.filter((item) => String(item.severity || "").toLowerCase().includes("severe")).length * 5;
  score -= context.recent_labs.filter((item) => item.is_abnormal === true).length * 3;
  score -= context.confirmed_drug_interactions.length * 8;
  if (context.current_medications.length >= 5) score -= 8;
  if (context.recent_vitals?.bp && String(context.recent_vitals.bp).includes("?")) score -= 2;
  if (context.social_factors?.financial_stress === true || context.social_factors?.isolation === true) score -= 4;
  return clamp(score, 20, 92);
}

function riskLevelFromScore(score: number): HealthSynthesis["risk_level"] {
  if (score < 35) return "critical";
  if (score < 55) return "high";
  if (score < 75) return "moderate";
  return "low";
}

function fallbackGlobalSynthesis(context: PatientContext): string {
  const pathologyNames = context.current_pathologies.map((item) => item.name).filter(Boolean).slice(0, 6).join(", ");
  const medicationNames = context.current_medications.map((item) => item.name).filter(Boolean).slice(0, 8).join(", ");
  const abnormalLabs = context.recent_labs.filter((item) => item.is_abnormal === true).map((item) => item.test).filter(Boolean).slice(0, 6).join(", ");

  const parts = [
    `Le dossier decrit un patient age de ${context.demographics.age ?? "age non renseigne"} ans avec ${pathologyNames || "aucune pathologie structuree active renseignee"}.`,
    medicationNames ? `Les traitements actifs identifies sont: ${medicationNames}.` : "Aucun traitement actif structure n'est renseigne.",
    abnormalLabs ? `Des anomalies biologiques recentes sont signalees: ${abnormalLabs}.` : "Aucune anomalie biologique recente n'est identifiee dans les donnees transmises.",
    "Cette synthese est informative et doit etre revue par un professionnel de sante, surtout en cas de symptomes actifs, grossesse, insuffisance renale/hepatique ou polymedication.",
  ];

  return parts.join(" ");
}

function normalizeVigilancePoints(value: unknown, context: PatientContext, degradedReason: string | null): HealthSynthesis["vigilance_points"] {
  const points: HealthSynthesis["vigilance_points"] = asArray<any>(value).slice(0, 12).map((item) => ({
    category: shortText(item?.category, 80) || "other",
    level: ["info", "warning", "critical"].includes(item?.level) ? item.level : "warning",
    title: shortText(item?.title, 160) || "Point de vigilance",
    description: shortText(item?.description, 900) || "Validation clinique recommandee.",
    action_needed: shortText(item?.action_needed, 400) || undefined,
  }));

  if (context.current_medications.length >= 5) {
    points.push({
      category: "other",
      level: "warning",
      title: "Polymedication",
      description: "Le dossier contient au moins cinq traitements actifs. Une revue medicamenteuse clinique est recommandee.",
      action_needed: "Verifier indications, interactions confirmees, duplications et tolerance.",
    });
  }

  if (context.confirmed_drug_interactions.length > 0) {
    points.push({
      category: "other",
      level: "critical",
      title: "Interactions medicamenteuses confirmees",
      description: "La base contient des interactions documentees pour certains traitements du dossier.",
      action_needed: "Valider rapidement la conduite a tenir avec le clinicien responsable.",
    });
  }

  if (degradedReason) {
    points.push({
      category: "other",
      level: "info",
      title: "Analyse IA degradee",
      description: "La synthese repose sur les donnees structurees car le modele IA n'a pas renvoye de sortie exploitable dans le budget interactif.",
      action_needed: "Relancer l'analyse ou completer le dossier si necessaire.",
    });
  }

  if (points.length === 0) {
    points.push({
      category: "other",
      level: "info",
      title: "Validation clinique",
      description: "Aucun signal critique structure n'est ressorti, mais la synthese doit rester validee par un professionnel de sante.",
    });
  }

  return points.slice(0, 14);
}

function normalizeWeakSignals(value: unknown, context: PatientContext): HealthSynthesis["weak_signals"] {
  const signals = asArray<any>(value).slice(0, 10).map((item) => ({
    indicator: shortText(item?.indicator, 160) || "Signal clinique",
    trend: ["stable", "improving", "worsening"].includes(item?.trend) ? item.trend : "stable",
    observation: shortText(item?.observation, 600) || "Observation a confirmer.",
    recommendation: shortText(item?.recommendation, 400) || "Surveillance clinique.",
  }));

  for (const lab of context.recent_labs.filter((item) => item.is_abnormal === true).slice(0, 5)) {
    signals.push({
      indicator: String(lab.test || "Biologie anormale"),
      trend: "worsening",
      observation: `Resultat biologique signale comme anormal${lab.value !== null ? `: ${lab.value} ${lab.unit || ""}` : ""}.`.trim(),
      recommendation: "Interpreter selon le contexte clinique et les valeurs de reference.",
    });
  }

  return signals.slice(0, 10);
}

function normalizeTreatmentRecommendations(value: unknown, context: PatientContext): HealthSynthesis["treatment_recommendations"] {
  const recommendations = asArray<any>(value).slice(0, 8).map((item) => ({
    category: shortText(item?.category, 80) || "monitoring",
    current_situation: shortText(item?.current_situation, 500) || "Situation a revoir.",
    suggested_action: shortText(item?.suggested_action, 500) || "Discuter avec un professionnel de sante.",
    rationale: shortText(item?.rationale, 600) || "Recommandation informative, non prescriptive.",
    priority: ["low", "medium", "high"].includes(item?.priority) ? item.priority : "medium",
  }));

  if (context.current_medications.length > 0 && recommendations.length === 0) {
    recommendations.push({
      category: "medication",
      current_situation: "Traitements actifs presents dans le dossier.",
      suggested_action: "Realiser une revue therapeutique structuree.",
      rationale: "La revue limite les duplications, interactions et effets indesirables non documentes.",
      priority: context.current_medications.length >= 5 ? "high" : "medium",
    });
  }

  return recommendations;
}

function normalizePreventionAlerts(value: unknown, context: PatientContext): HealthSynthesis["prevention_alerts"] {
  const alerts = asArray<any>(value).slice(0, 8).map((item) => ({
    screening: shortText(item?.screening, 180) || "Prevention",
    status: ["up_to_date", "due_soon", "overdue", "never_done"].includes(item?.status) ? item.status : "due_soon",
    due_date: item?.due_date || undefined,
    recommendation: shortText(item?.recommendation, 500) || "Verifier le calendrier de prevention.",
  }));

  for (const prevention of context.prevention_status.slice(0, 6)) {
    if (alerts.some((alert) => alert.screening === prevention.screening)) continue;
    alerts.push({
      screening: String(prevention.screening || "Prevention"),
      status: prevention.next_due ? "due_soon" : "never_done",
      due_date: prevention.next_due ? String(prevention.next_due) : undefined,
      recommendation: "Verifier le statut et la periodicite avec le professionnel de sante.",
    });
  }

  return alerts.slice(0, 8);
}

function normalizeLifestyleAdvice(value: unknown, context: PatientContext): HealthSynthesis["lifestyle_advice"] {
  const advice = asArray<any>(value).slice(0, 8).map((item) => ({
    category: shortText(item?.category, 80) || "other",
    current_status: shortText(item?.current_status, 400) || "Non renseigne.",
    advice: shortText(item?.advice, 500) || "A discuter selon le contexte clinique.",
    impact: shortText(item?.impact, 400) || "Objectif: reduction du risque global.",
  }));

  if (context.lifestyle && advice.length === 0) {
    advice.push({
      category: "other",
      current_status: JSON.stringify(context.lifestyle),
      advice: "Revoir les habitudes de vie documentees et fixer des objectifs realistes avec le patient.",
      impact: "Amelioration du risque cardiometabolique, du sommeil et de l'observance selon le contexte.",
    });
  }

  return advice;
}

function buildFallbackSynthesis(context: PatientContext, reason: string): HealthSynthesis {
  return normalizeSynthesis({
    global_synthesis: fallbackGlobalSynthesis(context),
    health_score: scoreFromContext(context),
    risk_level: riskLevelFromScore(scoreFromContext(context)),
    vigilance_points: [],
    weak_signals: [],
    treatment_recommendations: [],
    prevention_alerts: [],
    lifestyle_advice: [],
    drug_interactions: [],
    summary_for_patient: "Synthese informative generee a partir des donnees structurees. Validation medicale necessaire.",
  }, context, reason);
}

async function runSynthesis(params: {
  supabase: any;
  patientId: string;
  runJob: boolean;
  jobId?: string;
  providerResponseId?: string;
}): Promise<{ providerPending?: boolean; responsePayload?: HealthSynthesis }> {
  const { supabase, patientId, runJob, jobId, providerResponseId } = params;

  await updateJob(supabase, runJob ? jobId : undefined, {
    progress_percentage: 25,
    progress_message: "Chargement du dossier patient.",
  });

  const context = await fetchPatientContext(supabase, patientId);

  await updateJob(supabase, runJob ? jobId : undefined, {
    progress_percentage: 45,
    progress_message: "Contexte clinique compacte.",
  });

  const systemPrompt = buildSystemPrompt();
  const userPrompt = `Dossier patient structure a analyser:\n${JSON.stringify(context)}`;
  const callOptions = {
    model: "gpt-5.5",
    reasoningEffort: "high" as const,
    maxTokens: 4096,
    temperature: 0,
    timeoutMs: runJob ? BACKGROUND_AI_TIMEOUT_MS : INTERACTIVE_AI_TIMEOUT_MS,
    hasExternalEvidence: context.confirmed_drug_interactions.length > 0,
  };

  let synthesis: HealthSynthesis;
  let degradedReason: string | null = null;

  if (runJob && providerResponseId) {
    const providerResult = await retrieveBackgroundAI(providerResponseId, {
      ...callOptions,
      timeoutMs: 15_000,
    });

    if (isOpenAIBackgroundPending(providerResult.status)) {
      await updateJob(supabase, jobId, {
        provider_status: providerResult.status,
        progress_percentage: 80,
        progress_message: "Modele OpenAI en cours de raisonnement.",
      });
      return { providerPending: true };
    }

    if (providerResult.status !== "completed" || !providerResult.text?.trim()) {
      degradedReason = providerResult.errorMessage || `OpenAI background status ${providerResult.status}`;
      synthesis = buildFallbackSynthesis(context, degradedReason);
    } else {
      try {
        synthesis = parseSynthesis(providerResult.text, context);
      } catch (error) {
        degradedReason = `Reponse OpenAI invalide: ${getErrorMessage(error)}`;
        synthesis = buildFallbackSynthesis(context, degradedReason);
      }
    }
  } else if (runJob) {
    try {
      const backgroundResponse = await startBackgroundAI(systemPrompt, userPrompt, callOptions);
      await updateJob(supabase, jobId, {
        status: "processing" satisfies JobStatus,
        progress_percentage: 70,
        progress_message: "Modele OpenAI en cours de raisonnement.",
        model: backgroundResponse.model,
        reasoning_effort: backgroundResponse.reasoningEffort,
        provider_name: backgroundResponse.provider,
        provider_response_id: backgroundResponse.id,
        provider_status: backgroundResponse.status,
        provider_started_at: new Date().toISOString(),
        degraded: false,
      });
      return { providerPending: true };
    } catch (error) {
      degradedReason = getErrorMessage(error);
      synthesis = buildFallbackSynthesis(context, degradedReason);
    }
  } else {
    try {
      const aiResponse = await callAI(systemPrompt, userPrompt, callOptions);
      synthesis = parseSynthesis(aiResponse.text, context);
    } catch (error) {
      degradedReason = getErrorMessage(error);
      synthesis = buildFallbackSynthesis(context, degradedReason);
    }
  }

  await updateJob(supabase, runJob ? jobId : undefined, {
    status: "completed" satisfies JobStatus,
    progress_percentage: 100,
    progress_message: degradedReason ? "Synthese terminee en mode degrade." : "Synthese terminee.",
    result_payload: synthesis,
    degraded: Boolean(degradedReason),
    degraded_reason: degradedReason,
    provider_status: providerResponseId ? "completed" : undefined,
    provider_completed_at: providerResponseId ? new Date().toISOString() : undefined,
    completed_at: new Date().toISOString(),
  });

  return { responsePayload: synthesis };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let activeSupabase: any;
  let activeJobId: string | undefined;
  let activeRunJob = false;

  try {
    const payload = await req.json().catch(() => ({})) as Payload;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase function environment is incomplete");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    activeSupabase = supabase;

    const action = payload.action;
    const jobId = payload.jobId;
    const jobToken = payload.jobToken;
    const providerResponseId = payload.providerResponseId;
    const runJob = Boolean(payload.runJob);
    const isServiceInvocation = req.headers.get("authorization") === `Bearer ${serviceRoleKey}`;
    const requestedAsync = payload.async === true || (!runJob && action !== "status");
    activeJobId = jobId;
    activeRunJob = Boolean(runJob && jobId);

    if (runJob && !isServiceInvocation) {
      return jsonResponse({ error: "Worker execution requires service authorization" }, 403);
    }

    if (!runJob && action !== "status") {
      const authError = await requireAuthenticatedUser(req, supabase, serviceRoleKey);
      if (authError) return authError;
    }

    if (action === "status") {
      if (!jobId || !jobToken) {
        return jsonResponse({ error: "jobId and jobToken are required" }, 400);
      }

      const { data: job, error: jobError } = await supabase
        .from("ai_analysis_jobs")
        .select("id, status, progress_percentage, progress_message, request_payload, result_payload, error_message, model, reasoning_effort, degraded, degraded_reason, provider_name, provider_response_id, provider_status, provider_started_at, provider_completed_at, created_at, started_at, completed_at, updated_at")
        .eq("id", jobId)
        .eq("public_token", jobToken)
        .maybeSingle();

      if (jobError) return jsonResponse({ error: jobError.message }, 500);
      if (!job) return jsonResponse({ error: "Job not found" }, 404);

      if (
        job.status === "processing" &&
        job.provider_name === "openai" &&
        job.provider_response_id &&
        job.provider_status !== "finalizing"
      ) {
        const providerResult = await retrieveBackgroundAI(job.provider_response_id, {
          model: typeof job.model === "string" ? job.model : undefined,
          reasoningEffort: job.reasoning_effort,
          timeoutMs: 15_000,
        });

        if (isOpenAIBackgroundPending(providerResult.status)) {
          const nextProgress = Math.max(Number(job.progress_percentage || 0), 80);
          const nextMessage = "Modele OpenAI en cours de raisonnement.";
          await updateJob(supabase, job.id, {
            provider_status: providerResult.status,
            progress_percentage: nextProgress,
            progress_message: nextMessage,
          });

          return jsonResponse({
            job: {
              ...job,
              provider_status: providerResult.status,
              progress_percentage: nextProgress,
              progress_message: nextMessage,
            },
          });
        }

        const nextMessage = providerResult.status === "completed"
          ? "Reponse OpenAI recue. Finalisation clinique."
          : "OpenAI indisponible. Finalisation en mode degrade.";

        await updateJob(supabase, job.id, {
          provider_status: "finalizing",
          provider_completed_at: new Date().toISOString(),
          progress_percentage: 90,
          progress_message: nextMessage,
          degraded: providerResult.status !== "completed",
          degraded_reason: providerResult.status === "completed"
            ? null
            : providerResult.errorMessage || `OpenAI background response ended with status ${providerResult.status}`,
        });

        startWorker(supabase, supabaseUrl, serviceRoleKey, job.id, jobToken, {
          ...(job.request_payload || {}),
          providerResponseId: job.provider_response_id,
        });

        return jsonResponse({
          job: {
            ...job,
            provider_status: "finalizing",
            progress_percentage: 90,
            progress_message: nextMessage,
          },
        });
      }

      return jsonResponse({ job });
    }

    if (!payload.patient_id) {
      return jsonResponse({ error: "patient_id is required" }, 400);
    }

    if (requestedAsync && !runJob) {
      const { data: job, error: createJobError } = await supabase
        .from("ai_analysis_jobs")
        .insert({
          function_name: FUNCTION_NAME,
          analysis_mode: "patient_health_synthesis",
          status: "queued" satisfies JobStatus,
          progress_percentage: 0,
          progress_message: "Synthese patient en file d attente.",
          request_payload: sanitizeJobPayload(payload),
        })
        .select("id, public_token, status, progress_percentage, progress_message, created_at")
        .single();

      if (createJobError) return jsonResponse({ error: createJobError.message }, 500);

      startWorker(supabase, supabaseUrl, serviceRoleKey, job.id, job.public_token, payload);

      return jsonResponse({
        job: {
          id: job.id,
          token: job.public_token,
          status: job.status,
          progress: job.progress_percentage,
          message: job.progress_message,
          createdAt: job.created_at,
        },
        context: {
          async: true,
          functionName: FUNCTION_NAME,
          analysisMode: "patient_health_synthesis",
        },
      }, 202);
    }

    if (runJob && jobId) {
      await updateJob(supabase, jobId, {
        status: "processing" satisfies JobStatus,
        progress_percentage: 10,
        progress_message: "Preparation de la synthese patient.",
        started_at: new Date().toISOString(),
      });
    }

    const outcome = await runSynthesis({
      supabase,
      patientId: payload.patient_id,
      runJob,
      jobId,
      providerResponseId,
    });

    if (outcome.providerPending) {
      return jsonResponse({ status: "processing", jobId }, 202);
    }

    return jsonResponse(outcome.responsePayload ?? { error: "No synthesis generated" });
  } catch (error) {
    console.error("[PatientHealthSynthesis] Error:", error);
    if (activeRunJob && activeSupabase && activeJobId) {
      await updateJob(activeSupabase, activeJobId, {
        status: "failed" satisfies JobStatus,
        progress_percentage: 100,
        progress_message: "Echec de la synthese patient.",
        error_message: getErrorMessage(error),
        completed_at: new Date().toISOString(),
      });
    }

    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});
