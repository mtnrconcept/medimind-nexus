import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDrugBankComprehensiveData } from "./drugbank-api.ts";
import {
  aggregateInteractionEvidence,
  buildInteractionSummary,
  normalizeSeverity,
  severityFromText,
  type InteractionEvidenceInput,
  type InteractionSeverity,
  type SourceStatus,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_MEDICATIONS = 8;
const FETCH_TIMEOUT_MS = 6_000;

type InteractionRequest = {
  medications?: unknown;
  patient_id?: string;
  include_openfda?: boolean;
};

type PharmacovigilanceSignal = {
  drug_a: string;
  drug_b: string;
  event_count: number;
  top_reactions: string[];
  source: "openfda-faers";
  interpretation: string;
};

type NormalizedMedication = {
  input: string;
  rxcui: string | null;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanMedicationNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.replace(/\s+/g, " ").trim();
    if (!name || name.length > 120) continue;
    const key = name.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= MAX_MEDICATIONS) break;
  }
  return result;
}

function normalizeName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function namesMatch(left: unknown, right: unknown): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return a.includes(b) || b.includes(a);
}

async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ status: number; data: any | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) return { status: 404, data: null };
    if (!response.ok) return { status: response.status, data: null };
    return { status: response.status, data: await response.json() };
  } finally {
    clearTimeout(timeout);
  }
}

async function normalizeWithRxNorm(medications: string[]): Promise<{ values: NormalizedMedication[]; status: SourceStatus }> {
  let hadFailure = false;
  const values = await Promise.all(medications.map(async (name) => {
    try {
      const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=1`;
      const response = await fetchJson(url, 4_000);
      if (response.status !== 200) {
        if (response.status !== 404) hadFailure = true;
        return { input: name, rxcui: null };
      }
      return { input: name, rxcui: response.data?.idGroup?.rxnormId?.[0] || null };
    } catch {
      hadFailure = true;
      return { input: name, rxcui: null };
    }
  }));

  return {
    values,
    status: {
      source: "rxnorm-normalization",
      authoritative: false,
      status: hadFailure ? "partial" : "available",
      detail: hadFailure ? "Certaines normalisations RxNorm n’ont pas abouti." : undefined,
    },
  };
}

async function readInternalEvidence(supabase: any, medications: string[]): Promise<{ evidence: InteractionEvidenceInput[]; status: SourceStatus }> {
  try {
    const matchedRows: any[] = [];
    for (const medication of medications) {
      const [{ data: byName, error: nameError }, { data: bySubstance, error: substanceError }] = await Promise.all([
        supabase.from("medications").select("id, name, substance").eq("name", medication).limit(5),
        supabase.from("medications").select("id, name, substance").eq("substance", medication).limit(5),
      ]);
      if (nameError || substanceError) throw nameError || substanceError;
      matchedRows.push(...(byName || []), ...(bySubstance || []));
    }

    const uniqueRows = [...new Map(matchedRows.map((row) => [row.id, row])).values()];
    if (uniqueRows.length === 0) {
      return {
        evidence: [],
        status: { source: "internal-database", authoritative: true, status: "available" },
      };
    }

    const { data: rows, error } = await supabase
      .from("drug_interactions")
      .select("medication_id, interacting_drug, interaction_type, severity, description, recommendation")
      .in("medication_id", uniqueRows.map((row) => row.id))
      .limit(250);
    if (error) throw error;

    const rowById = new Map(uniqueRows.map((row) => [String(row.id), row]));
    const evidence: InteractionEvidenceInput[] = [];

    for (const interaction of rows || []) {
      const sourceMedication = rowById.get(String(interaction.medication_id));
      if (!sourceMedication) continue;
      const sourceInput = medications.find((name) => namesMatch(name, sourceMedication.name) || namesMatch(name, sourceMedication.substance));
      const targetInput = medications.find((name) => name !== sourceInput && namesMatch(name, interaction.interacting_drug));
      if (!sourceInput || !targetInput) continue;

      const text = [interaction.description, interaction.recommendation].filter(Boolean).join(" ");
      const severity = normalizeSeverity(interaction.severity) !== "unknown"
        ? normalizeSeverity(interaction.severity)
        : severityFromText(text);

      evidence.push({
        drugA: sourceInput,
        drugB: targetInput,
        source: "internal-database",
        sourceKind: "curated",
        severity,
        description: interaction.description || `Interaction documentée avec ${interaction.interacting_drug}.`,
        clinicalAction: interaction.recommendation || "Validation clinique de l’association recommandée.",
        mechanism: interaction.interaction_type || undefined,
        evidenceLevel: "CURATED_INTERNAL",
      });
    }

    return {
      evidence,
      status: { source: "internal-database", authoritative: true, status: "available" },
    };
  } catch (error) {
    console.error("Internal interaction source failed:", error);
    return {
      evidence: [],
      status: {
        source: "internal-database",
        authoritative: true,
        status: "unavailable",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function openFdaSearchUrl(field: "generic_name" | "brand_name", medication: string): string {
  const url = new URL("https://api.fda.gov/drug/label.json");
  url.searchParams.set("search", `openfda.${field}:\"${medication.replace(/\"/g, "")}\"`);
  url.searchParams.set("limit", "5");
  return url.toString();
}

function extractRelevantSentence(text: string, medication: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.find((sentence) => namesMatch(sentence, medication))?.trim() || text.slice(0, 700).trim();
}

async function readOpenFdaLabelEvidence(medications: string[]): Promise<{ evidence: InteractionEvidenceInput[]; status: SourceStatus }> {
  const evidence: InteractionEvidenceInput[] = [];
  let failures = 0;
  let successfulQueries = 0;

  for (const medication of medications) {
    let data: any | null = null;
    let resolved = false;
    for (const field of ["generic_name", "brand_name"] as const) {
      try {
        const response = await fetchJson(openFdaSearchUrl(field, medication));
        if (response.status === 200) {
          data = response.data;
          successfulQueries += 1;
          resolved = true;
          break;
        }
        if (response.status === 404) {
          successfulQueries += 1;
          resolved = true;
          continue;
        }
        failures += 1;
      } catch (error) {
        console.warn("openFDA label query failed:", error);
        failures += 1;
      }
    }

    if (!resolved || !data) continue;
    for (const label of data.results || []) {
      const blocks = Array.isArray(label.drug_interactions)
        ? label.drug_interactions.filter((item: unknown): item is string => typeof item === "string")
        : [];
      const interactionText = blocks.join(" ");
      if (!interactionText) continue;

      for (const otherMedication of medications) {
        if (otherMedication === medication || !namesMatch(interactionText, otherMedication)) continue;
        const sentence = extractRelevantSentence(interactionText, otherMedication);
        evidence.push({
          drugA: medication,
          drugB: otherMedication,
          source: "openfda-label",
          sourceKind: "official_label",
          severity: severityFromText(sentence),
          description: sentence,
          clinicalAction: "Consulter la notice officielle complète et valider la conduite clinique.",
          evidenceLevel: "OFFICIAL_FDA_LABEL",
          url: "https://open.fda.gov/apis/drug/label/",
        });
      }
    }
  }

  const status: SourceStatus["status"] = failures === 0
    ? "available"
    : successfulQueries > 0
      ? "partial"
      : "unavailable";

  return {
    evidence,
    status: {
      source: "openfda-label",
      authoritative: true,
      status,
      detail: failures > 0 ? `${failures} requête(s) de notice n’ont pas abouti.` : undefined,
    },
  };
}

function faersUrl(drugA: string, drugB: string): string {
  const url = new URL("https://api.fda.gov/drug/event.json");
  url.searchParams.set(
    "search",
    `patient.drug.medicinalproduct:\"${drugA.replace(/\"/g, "")}\" AND patient.drug.medicinalproduct:\"${drugB.replace(/\"/g, "")}\"`,
  );
  url.searchParams.set("limit", "5");
  return url.toString();
}

async function readFaersSignals(medications: string[]): Promise<{ signals: PharmacovigilanceSignal[]; status: SourceStatus }> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < medications.length; i += 1) {
    for (let j = i + 1; j < medications.length; j += 1) pairs.push([medications[i], medications[j]]);
  }

  let failures = 0;
  const signals: PharmacovigilanceSignal[] = [];
  await Promise.all(pairs.map(async ([drugA, drugB]) => {
    try {
      const response = await fetchJson(faersUrl(drugA, drugB), 5_000);
      if (response.status === 404) return;
      if (response.status !== 200) {
        failures += 1;
        return;
      }
      const eventCount = Number(response.data?.meta?.results?.total || 0);
      if (eventCount <= 0) return;
      const reactions = new Map<string, number>();
      for (const event of response.data?.results || []) {
        for (const reaction of event?.patient?.reaction || []) {
          const name = typeof reaction?.reactionmeddrapt === "string" ? reaction.reactionmeddrapt : "";
          if (name) reactions.set(name, (reactions.get(name) || 0) + 1);
        }
      }
      signals.push({
        drug_a: drugA,
        drug_b: drugB,
        event_count: eventCount,
        top_reactions: [...reactions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name),
        source: "openfda-faers",
        interpretation: "Co-déclaration de pharmacovigilance uniquement : ce signal ne démontre ni causalité ni interaction médicamenteuse.",
      });
    } catch (error) {
      console.warn("FAERS query failed:", error);
      failures += 1;
    }
  }));

  return {
    signals,
    status: {
      source: "openfda-faers",
      authoritative: false,
      status: failures === 0 ? "available" : failures < pairs.length ? "partial" : "unavailable",
      detail: failures > 0 ? `${failures} paire(s) n’ont pas pu être interrogées.` : undefined,
    },
  };
}

async function readDrugBankEvidence(medications: string[]): Promise<{ evidence: InteractionEvidenceInput[]; status: SourceStatus }> {
  const apiKey = Deno.env.get("DRUGBANK_API_KEY");
  if (!apiKey) {
    return {
      evidence: [],
      status: { source: "drugbank", authoritative: false, status: "not_configured", detail: "DRUGBANK_API_KEY absente." },
    };
  }

  const evidence: InteractionEvidenceInput[] = [];
  let failures = 0;
  for (const medication of medications.slice(0, 5)) {
    try {
      const data = await getDrugBankComprehensiveData(medication, apiKey);
      if (!data.found || !data.detailed?.interactions) continue;
      for (const interaction of data.detailed.interactions) {
        const otherMedication = medications.find((candidate) => candidate !== medication && namesMatch(candidate, interaction.name));
        if (!otherMedication) continue;
        const description = interaction.description || "Interaction pharmacologique documentée.";
        evidence.push({
          drugA: medication,
          drugB: otherMedication,
          source: "drugbank",
          sourceKind: "curated",
          severity: severityFromText(description),
          description,
          clinicalAction: "Vérifier la documentation pharmacologique et le contexte patient avant toute décision.",
          mechanism: description,
          evidenceLevel: "DRUGBANK_DOCUMENTATION",
        });
      }
    } catch (error) {
      console.warn("DrugBank query failed:", error);
      failures += 1;
    }
  }

  return {
    evidence,
    status: {
      source: "drugbank",
      authoritative: false,
      status: failures === 0 ? "available" : failures < Math.min(medications.length, 5) ? "partial" : "unavailable",
      detail: failures > 0 ? `${failures} requête(s) DrugBank n’ont pas abouti.` : undefined,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const request = await req.json().catch(() => ({})) as InteractionRequest;
    const medications = cleanMedicationNames(request.medications);
    if (medications.length < 2) {
      return jsonResponse({ error: "At least 2 distinct medications are required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase function environment is incomplete");
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const [rxNorm, internal, fdaLabels, drugBank, faers] = await Promise.all([
      normalizeWithRxNorm(medications),
      readInternalEvidence(supabase, medications),
      readOpenFdaLabelEvidence(medications),
      readDrugBankEvidence(medications),
      request.include_openfda === false
        ? Promise.resolve({ signals: [] as PharmacovigilanceSignal[], status: { source: "openfda-faers", authoritative: false, status: "not_configured" as const, detail: "Désactivé par la requête." } })
        : readFaersSignals(medications),
    ]);

    const evidence = [...internal.evidence, ...fdaLabels.evidence, ...drugBank.evidence];
    const interactions = aggregateInteractionEvidence(evidence);
    const sourceStatuses: SourceStatus[] = [internal.status, fdaLabels.status, drugBank.status, faers.status, rxNorm.status];
    const summary = buildInteractionSummary(interactions, sourceStatuses);

    const legacyInteractions = interactions.map((interaction) => {
      const sources = [...new Set(interaction.evidence.map((item) => item.source))];
      return {
        drug_a: interaction.drug_a,
        drug_b: interaction.drug_b,
        severity: interaction.severity,
        description: interaction.evidence.map((item) => `[${item.source}] ${item.description}`).join("\n"),
        mechanism: interaction.evidence.map((item) => item.mechanism).filter(Boolean).join(" | ") || undefined,
        source: sources.length === 1 ? sources[0] : "multiple",
        evidence_level: [...new Set(interaction.evidence.map((item) => item.evidenceLevel).filter(Boolean))].join(" + ") || undefined,
        clinical_action: interaction.clinical_actions.join(" ") || "Validation clinique recommandée.",
        evidence: interaction.evidence,
      };
    });

    const recommendations: string[] = [summary.message];
    if (summary.contraindicatedInteractions > 0) recommendations.push("Association(s) explicitement contre-indiquée(s) dans une source autoritative : validation médicale immédiate requise.");
    if (summary.majorInteractions > 0) recommendations.push("Interaction(s) majeure(s) documentée(s) : revoir le rapport bénéfice/risque et la surveillance avec le clinicien responsable.");
    if (faers.signals.length > 0) recommendations.push("Des co-déclarations de pharmacovigilance existent ; elles sont affichées comme signaux et ne doivent pas être interprétées comme preuve causale.");

    return jsonResponse({
      checked_at: new Date().toISOString(),
      medications,
      normalized_medications: rxNorm.values,
      interactions: legacyInteractions,
      pharmacovigilance_signals: faers.signals,
      source_statuses: sourceStatuses,
      verification_complete: summary.verificationComplete,
      summary: {
        total_interactions: summary.totalInteractions,
        major_interactions: summary.majorInteractions,
        contraindicated: summary.contraindicatedInteractions,
        requires_monitoring: interactions.filter((item) => item.severity === "moderate" || item.severity === "unknown").length,
      },
      recommendations,
      disclaimer: "Outil d’aide à la décision. Les sources doivent être vérifiées dans le contexte clinique du patient avant toute modification thérapeutique.",
    });
  } catch (error) {
    console.error("Drug interaction checker error:", error);
    return jsonResponse({
      error: "Interaction verification failed",
      verification_complete: false,
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
