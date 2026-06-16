import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callAI,
  cleanJsonString,
  retrieveBackgroundAI,
  startBackgroundAI,
  streamAI,
} from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_NAME = "cde-analyze";
const INTERACTIVE_AI_TIMEOUT_MS = 45_000;
const BACKGROUND_AI_TIMEOUT_MS = 110_000;

interface CDENode {
  id: string;
  node_type: string;
  name: string;
  properties?: Record<string, unknown> | null;
}

interface CDEEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  provenance?: string | null;
  context?: Record<string, unknown> | null;
}

interface DiscoveryCard {
  title: string;
  hypothesis: string;
  type: string;
  severity: string;
  plausibility: string;
  reasoning_chain: string[];
  recommended_actions: string[];
  involved_medications: string[];
}

interface CDEContext {
  totalNodeCount: number;
  totalEdgeCount: number;
  nodes: CDENode[];
  edges: CDEEdge[];
  substancesFromTable: Array<{
    id: string;
    name: string;
    atc_code?: string | null;
    mechanism_of_action?: string | null;
  }>;
  drugInteractions: Array<{
    id: string;
    medication_id?: string | null;
    interacting_substance?: string | null;
    severity?: string | null;
    description?: string | null;
  }>;
}

type CDEAnalyzeJobStatus = "queued" | "processing" | "completed" | "failed";

type CDEAnalyzePayload = {
  action?: string;
  async?: boolean;
  runJob?: boolean;
  jobId?: string;
  jobToken?: string;
  providerResponseId?: string;
  stream?: boolean;
};

type CDEAnalyzeResult = {
  output: string;
  discoveries: DiscoveryCard[];
  savedCount: number;
  skippedDuplicateCount: number;
  degraded: boolean;
  degradedReason?: string | null;
  model?: string;
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

function sanitizeJobPayload(payload: CDEAnalyzePayload): CDEAnalyzePayload {
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

function normalizeEnum(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function severityScore(severity: string): number {
  switch (normalizeEnum(severity)) {
    case "critique":
    case "critical":
      return 0.9;
    case "elevee":
    case "elevée":
    case "high":
      return 0.7;
    case "moderee":
    case "modérée":
    case "moderate":
      return 0.5;
    default:
      return 0.3;
  }
}

function plausibilityScore(plausibility: string): number {
  switch (normalizeEnum(plausibility)) {
    case "forte":
    case "high":
      return 0.8;
    case "moderee":
    case "modérée":
    case "moderate":
      return 0.5;
    default:
      return 0.3;
  }
}

async function updateCDEJob(
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
    console.error("[CDE Analyze] Job update failed:", error);
  }
}

function startCDEWorker(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
  publicToken: string,
  payload: CDEAnalyzePayload,
): void {
  const processorPayload: CDEAnalyzePayload = {
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
    body: JSON.stringify(processorPayload),
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      await updateCDEJob(supabase, jobId, {
        status: "failed",
        progress_percentage: 100,
        progress_message: "Echec du worker CDE.",
        error_message: `Worker returned ${response.status}: ${errorText}`,
        completed_at: new Date().toISOString(),
      });
    }
  }).catch(async (error) => {
    await updateCDEJob(supabase, jobId, {
      status: "failed",
      progress_percentage: 100,
      progress_message: "Echec du lancement du worker CDE.",
      error_message: getErrorMessage(error),
      completed_at: new Date().toISOString(),
    });
  });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(processor);
  } else {
    processor.catch((error) => console.error("[CDE Analyze] Background worker error:", error));
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

async function fetchCDEContext(supabase: any): Promise<CDEContext> {
  const [
    nodeCountResult,
    edgeCountResult,
    substancesResult,
    medicationsResult,
    pathologiesResult,
    symptomsResult,
    treatmentsResult,
    substancesFromTableResult,
    drugInteractionsResult,
    edgesResult,
  ] = await Promise.all([
    supabase.from("cde_nodes").select("id", { count: "exact", head: true }),
    supabase.from("cde_edges").select("id", { count: "exact", head: true }),
    supabase.from("cde_nodes").select("id,node_type,name,properties").eq("node_type", "substance").limit(300),
    supabase.from("cde_nodes").select("id,node_type,name,properties").eq("node_type", "medication").limit(120),
    supabase.from("cde_nodes").select("id,node_type,name,properties").eq("node_type", "pathology").limit(120),
    supabase.from("cde_nodes").select("id,node_type,name,properties").eq("node_type", "symptom").limit(80),
    supabase.from("cde_nodes").select("id,node_type,name,properties").eq("node_type", "treatment").limit(80),
    supabase.from("substances").select("id, name, atc_code, mechanism_of_action").limit(120),
    supabase
      .from("drug_interactions")
      .select("id, medication_id, interacting_substance, severity, description")
      .limit(160),
    supabase
      .from("cde_edges")
      .select("id,source_node_id,target_node_id,relationship_type,provenance,context")
      .limit(800),
  ]);

  const firstError = [
    nodeCountResult,
    edgeCountResult,
    substancesResult,
    medicationsResult,
    pathologiesResult,
    symptomsResult,
    treatmentsResult,
    substancesFromTableResult,
    drugInteractionsResult,
    edgesResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message || "Failed to load CDE context");
  }

  return {
    totalNodeCount: nodeCountResult.count || 0,
    totalEdgeCount: edgeCountResult.count || 0,
    nodes: [
      ...(substancesResult.data || []),
      ...(medicationsResult.data || []),
      ...(pathologiesResult.data || []),
      ...(symptomsResult.data || []),
      ...(treatmentsResult.data || []),
    ],
    edges: edgesResult.data || [],
    substancesFromTable: substancesFromTableResult.data || [],
    drugInteractions: drugInteractionsResult.data || [],
  };
}

function buildContextSummary(context: CDEContext): string {
  const nodesByType: Record<string, CDENode[]> = {};
  for (const node of context.nodes) {
    if (!nodesByType[node.node_type]) nodesByType[node.node_type] = [];
    nodesByType[node.node_type].push(node);
  }

  const nodeMap = new Map(context.nodes.map((node) => [node.id, node]));
  const substanceEdges = context.edges.filter((edge) => {
    const source = nodeMap.get(edge.source_node_id);
    const target = nodeMap.get(edge.target_node_id);
    return source?.node_type === "substance" && target?.node_type === "substance";
  });

  const relationshipsSummary = substanceEdges.slice(0, 40).map((edge) => {
    const source = nodeMap.get(edge.source_node_id);
    const target = nodeMap.get(edge.target_node_id);
    const severity = typeof edge.context?.severity === "string" ? ` (${edge.context.severity})` : "";
    return `${source?.name || "?"} --[${edge.relationship_type}${severity}]--> ${target?.name || "?"}`;
  }).join("\n") || "Aucune relation substance-substance disponible dans l'echantillon.";

  const substanceList = (nodesByType.substance || []).slice(0, 80).map((node) => {
    const props = node.properties || {};
    const atc = String(props.atc_code || props.atc_prefix || "N/A");
    return `- ${node.name} (ATC: ${atc})`;
  }).join("\n") || "Aucune substance.";

  const substanceTableList = context.substancesFromTable.slice(0, 80).map((substance) => {
    const mechanism = substance.mechanism_of_action?.slice(0, 90) || "non renseigne";
    return `- ${substance.name} (ATC: ${substance.atc_code || "N/A"}) - mecanisme: ${mechanism}`;
  }).join("\n") || "Aucune substance de reference.";

  const medicationList = (nodesByType.medication || []).slice(0, 40).map((node) => `- ${node.name}`).join("\n") ||
    "Aucun medicament.";

  const pathologyList = (nodesByType.pathology || []).slice(0, 30).map((node) => {
    const props = node.properties || {};
    return `- ${node.name} (${String(props.category || "N/A")})`;
  }).join("\n") || "Aucune pathologie.";

  const symptomList = (nodesByType.symptom || []).slice(0, 20).map((node) => `- ${node.name}`).join("\n") ||
    "Aucun symptome.";

  const interactionsList = context.drugInteractions.slice(0, 60).map((interaction) => {
    const description = interaction.description?.slice(0, 90) || "";
    return `- ${interaction.interacting_substance || "?"} (severite: ${interaction.severity || "?"}) - ${description}`;
  }).join("\n") || "Aucune interaction documentee.";

  const typesList = Object.entries(nodesByType)
    .map(([type, items]) => `- ${type}: ${items.length} entites`)
    .join("\n");

  return `
## Corpus CDE extrait depuis Supabase
- Noeuds totaux en base: ${context.totalNodeCount}
- Aretes totales en base: ${context.totalEdgeCount}

### Echantillon analyse
${typesList}

### Principes actifs prioritaires
${substanceList}

### Substances de reference
${substanceTableList}

### Medicaments associes
${medicationList}

### Pathologies et symptomes de contexte
${pathologyList}
${symptomList}

### Relations substance-substance connues dans le graphe
${relationshipsSummary}

### Interactions documentees
${interactionsList}
`;
}

function buildPrompts(context: CDEContext): { systemPrompt: string; userPrompt: string } {
  const contextSummary = buildContextSummary(context);

  const systemPrompt = `Tu es le Continuous Discovery Engine (CDE) de Medimind.

CONTRAT CLINIQUE:
- Le graphe, les tables et les sources documentees sont la base factuelle.
- Ne presente jamais une hypothese comme une interaction confirmee si elle n'est pas explicitement documentee.
- Separe les signaux confirmes, theoriques, sans donnees et contradictoires.
- Ne prescris pas. Formule des pistes a verifier par un clinicien.
- Priorise les risques medicamenteux graves: anticoagulants, opioides, benzodiazepines, antiarythmiques, lithium, methotrexate, insuline, antidiabetiques, antiepileptiques, immunosuppresseurs, grossesse, enfant, sujet age, insuffisance renale/hepatique.

MISSION:
Detecter des cartes de decouverte plausibles depuis le contexte fourni: interaction, contre-indication, synergie, risque_combine ou effet_indesirable.
Donne une synthese courte et un bloc JSON final strictement valide.

FORMAT JSON FINAL:
{
  "discoveries": [
    {
      "title": "titre concis",
      "hypothesis": "hypothese prudente et verifiable",
      "type": "interaction|contre-indication|synergie|risque_combine|effet_indesirable",
      "severity": "faible|moderee|elevee|critique",
      "plausibility": "faible|moderee|forte",
      "reasoning_chain": ["fait recupere", "mecanisme propose", "limite ou incertitude"],
      "recommended_actions": ["verification documentaire", "revue clinique"],
      "involved_medications": ["substance ou medicament"]
    }
  ]
}`;

  const userPrompt = `Analyse le contexte CDE suivant et genere au maximum 8 Discovery Cards. Reponds en francais. Termine par le JSON final.

${contextSummary}`;

  return { systemPrompt, userPrompt };
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function parseDiscoveries(text: string): DiscoveryCard[] {
  const jsonFence = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const jsonText = jsonFence?.[1] || cleanJsonString(text);

  try {
    const parsed = JSON.parse(jsonText);
    const discoveries = Array.isArray(parsed?.discoveries) ? parsed.discoveries : [];
    const normalizedDiscoveries: Array<DiscoveryCard | null> = discoveries.slice(0, 12).map((item: any): DiscoveryCard | null => {
      if (!item || typeof item !== "object") return null;

      const title = typeof item.title === "string" ? item.title.trim() : "";
      const hypothesis = typeof item.hypothesis === "string" ? item.hypothesis.trim() : "";
      if (!title || !hypothesis) return null;

      return {
        title,
        hypothesis,
        type: typeof item.type === "string" ? item.type : "interaction",
        severity: typeof item.severity === "string" ? item.severity : "moderee",
        plausibility: typeof item.plausibility === "string" ? item.plausibility : "moderee",
        reasoning_chain: normalizeStringList(item.reasoning_chain),
        recommended_actions: normalizeStringList(item.recommended_actions),
        involved_medications: normalizeStringList(item.involved_medications),
      };
    });

    return normalizedDiscoveries.filter((item): item is DiscoveryCard => Boolean(item));
  } catch (error) {
    console.error("[CDE Analyze] Discovery JSON parse failed:", error);
    return [];
  }
}

function buildFallbackDiscoveries(context: CDEContext, degradedReason: string): DiscoveryCard[] {
  const interactions = context.drugInteractions
    .filter((interaction) => interaction.interacting_substance)
    .slice(0, 5);

  if (interactions.length > 0) {
    return interactions.map((interaction) => ({
      title: `Signal a verifier: ${interaction.interacting_substance}`,
      hypothesis:
        interaction.description ||
        `Une interaction documentee mentionne ${interaction.interacting_substance}; elle doit etre revue avec les donnees source avant validation clinique.`,
      type: "interaction",
      severity: interaction.severity || "moderee",
      plausibility: "moderee",
      reasoning_chain: [
        "Fallback determine a partir des interactions structurees deja presentes en base.",
        "OpenAI n'a pas produit de synthese exploitable dans le budget disponible.",
        `Raison technique: ${degradedReason}`,
      ],
      recommended_actions: [
        "Verifier la source primaire et la fiche officielle du medicament.",
        "Faire valider le signal par un clinicien avant toute decision.",
      ],
      involved_medications: [interaction.interacting_substance || "substance"],
    }));
  }

  const substances = context.substancesFromTable.slice(0, 3);
  return substances.map((substance) => ({
    title: `Signal exploratoire: ${substance.name}`,
    hypothesis:
      `La substance ${substance.name} dispose de donnees partielles dans le graphe. Une revue documentaire est necessaire avant de conclure a une relation medicale.`,
    type: "interaction",
    severity: "faible",
    plausibility: "faible",
    reasoning_chain: [
      "Fallback determine depuis les substances disponibles en base.",
      "Aucune hypothese confirmeable sans synthese documentaire supplementaire.",
      `Raison technique: ${degradedReason}`,
    ],
    recommended_actions: [
      "Completer les sources documentees.",
      "Relancer l'analyse apres enrichissement du graphe.",
    ],
    involved_medications: [substance.name],
  }));
}

function buildOutputText(params: {
  discoveries: DiscoveryCard[];
  savedCount: number;
  skippedDuplicateCount: number;
  degradedReason?: string | null;
  model?: string;
}): string {
  const header = params.degradedReason
    ? `Analyse CDE terminee en mode degrade.\nRaison: ${params.degradedReason}`
    : `Analyse CDE terminee${params.model ? ` avec ${params.model}` : ""}.`;

  const cardsText = params.discoveries.map((card, index) => {
    return [
      `\n### Hypothese ${index + 1}: ${card.title}`,
      `Type: ${card.type}`,
      `Gravite: ${card.severity} | Plausibilite: ${card.plausibility}`,
      `Hypothese: ${card.hypothesis}`,
      card.reasoning_chain.length > 0 ? `Raisonnement synthetique:\n- ${card.reasoning_chain.join("\n- ")}` : "",
      card.recommended_actions.length > 0 ? `Actions recommandees:\n- ${card.recommended_actions.join("\n- ")}` : "",
      card.involved_medications.length > 0 ? `Elements impliques: ${card.involved_medications.join(", ")}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n");

  return [
    header,
    cardsText || "Aucune discovery card exploitable n'a ete produite.",
    `\nSauvegarde: ${params.savedCount} carte(s), ${params.skippedDuplicateCount} doublon(s) ignore(s).`,
    "Ces signaux sont des hypotheses de recherche, pas des recommandations de traitement.",
  ].join("\n");
}

async function saveDiscoveries(
  supabase: any,
  discoveries: DiscoveryCard[],
  model: string,
): Promise<{ savedCount: number; skippedDuplicateCount: number }> {
  const titles = discoveries.map((discovery) => discovery.title).filter(Boolean);
  let existingTitles = new Set<string>();

  if (titles.length > 0) {
    const { data, error } = await supabase
      .from("discovery_cards")
      .select("title")
      .in("title", titles);

    if (!error && Array.isArray(data)) {
      const existing = data
        .map((row: { title?: string }) => row.title)
        .filter((title: string | undefined): title is string => Boolean(title));
      existingTitles = new Set(existing);
    }
  }

  let savedCount = 0;
  let skippedDuplicateCount = 0;

  for (const discovery of discoveries) {
    if (existingTitles.has(discovery.title)) {
      skippedDuplicateCount++;
      continue;
    }

    const { error } = await supabase
      .from("discovery_cards")
      .insert({
        title: discovery.title,
        hypothesis: discovery.hypothesis,
        reasoning_chain: discovery.reasoning_chain,
        novelty: "emerging",
        evidence_level: "ai_inferred",
        severity_score: severityScore(discovery.severity),
        plausibility_score: plausibilityScore(discovery.plausibility),
        status: "raw_signal",
        sources: [{
          type: "cde_analysis",
          model,
          discoveryType: discovery.type,
          evidenceStatus: "theoretical",
          involved_medications: discovery.involved_medications,
        }],
        recommended_actions: discovery.recommended_actions,
      });

    if (error) {
      console.error("[CDE Analyze] Discovery insert failed:", error);
      continue;
    }

    savedCount++;
    existingTitles.add(discovery.title);
  }

  return { savedCount, skippedDuplicateCount };
}

async function runAnalysis(params: {
  supabase: any;
  runJob: boolean;
  jobId?: string;
  providerResponseId?: string;
  wantStream: boolean;
  emit?: (text: string) => void | Promise<void>;
}): Promise<{ responsePayload?: CDEAnalyzeResult; providerPending?: boolean }> {
  const { supabase, runJob, jobId, providerResponseId, wantStream, emit } = params;

  await updateCDEJob(supabase, runJob ? jobId : undefined, {
    progress_percentage: 15,
    progress_message: "Chargement du Knowledge Graph CDE.",
  });

  const context = await fetchCDEContext(supabase);

  await updateCDEJob(supabase, runJob ? jobId : undefined, {
    progress_percentage: 35,
    progress_message: "Contexte CDE prepare.",
  });

  const { systemPrompt, userPrompt } = buildPrompts(context);
  const callOptions = {
    model: "gpt-5.5",
    reasoningEffort: "high" as const,
    maxTokens: 7000,
    temperature: 0.2,
    timeoutMs: runJob ? BACKGROUND_AI_TIMEOUT_MS : INTERACTIVE_AI_TIMEOUT_MS,
    elementCount: context.nodes.length + context.edges.length,
    hasExternalEvidence: context.drugInteractions.length > 0 || context.edges.length > 0,
    enforceClinicalContract: true,
  };

  let content = "";
  let model = "gpt-5.5";
  let degradedReason: string | null = null;

  if (runJob && providerResponseId) {
    const providerResult = await retrieveBackgroundAI(providerResponseId, {
      ...callOptions,
      timeoutMs: 15_000,
    });

    if (isOpenAIBackgroundPending(providerResult.status)) {
      await updateCDEJob(supabase, jobId, {
        provider_status: providerResult.status,
        progress_percentage: 80,
        progress_message: "Modele OpenAI en cours de raisonnement CDE.",
      });
      return { providerPending: true };
    }

    model = providerResult.model || model;
    if (providerResult.status !== "completed" || !providerResult.text?.trim()) {
      degradedReason = providerResult.errorMessage || `OpenAI background status ${providerResult.status}`;
    } else {
      content = providerResult.text;
    }
  } else if (runJob) {
    try {
      const backgroundResponse = await startBackgroundAI(systemPrompt, userPrompt, callOptions);
      await updateCDEJob(supabase, jobId, {
        status: "processing" satisfies CDEAnalyzeJobStatus,
        progress_percentage: 70,
        progress_message: "Modele OpenAI en cours de raisonnement CDE.",
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
    }
  } else {
    try {
      const aiResult = wantStream
        ? await streamAI(systemPrompt, userPrompt, async (chunk) => {
          await emit?.(chunk);
        }, callOptions)
        : await callAI(systemPrompt, userPrompt, callOptions);
      content = aiResult.text;
      model = aiResult.model;
    } catch (error) {
      degradedReason = getErrorMessage(error);
    }
  }

  let discoveries = content.trim() ? parseDiscoveries(content) : [];
  if (discoveries.length === 0) {
    degradedReason = degradedReason || "Aucune discovery card JSON exploitable dans la reponse OpenAI.";
    discoveries = buildFallbackDiscoveries(context, degradedReason);
  }

  const { savedCount, skippedDuplicateCount } = await saveDiscoveries(supabase, discoveries, model);
  const output = buildOutputText({
    discoveries,
    savedCount,
    skippedDuplicateCount,
    degradedReason,
    model,
  });
  const responsePayload: CDEAnalyzeResult = {
    output,
    discoveries,
    savedCount,
    skippedDuplicateCount,
    degraded: Boolean(degradedReason),
    degradedReason,
    model,
  };

  await updateCDEJob(supabase, runJob ? jobId : undefined, {
    status: "completed" satisfies CDEAnalyzeJobStatus,
    progress_percentage: 100,
    progress_message: degradedReason ? "Analyse CDE terminee en mode degrade." : "Analyse CDE terminee.",
    result_payload: responsePayload,
    degraded: Boolean(degradedReason),
    degraded_reason: degradedReason,
    provider_status: providerResponseId ? "completed" : undefined,
    completed_at: new Date().toISOString(),
  });

  return { responsePayload };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let activeSupabase: any;
  let activeJobId: string | undefined;
  let activeRunJob = false;

  try {
    const payload = await req.json().catch(() => ({})) as CDEAnalyzePayload;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase function environment is incomplete");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    activeSupabase = supabase;

    const action = payload.action;
    const jobId = payload.jobId;
    const jobToken = payload.jobToken;
    const providerResponseId = payload.providerResponseId;
    const runJob = Boolean(payload.runJob);
    const wantStream = payload.stream === true;
    const requestedAsync = payload.async === true || (!runJob && action !== "status" && !wantStream);
    const isServiceInvocation = req.headers.get("authorization") === `Bearer ${supabaseKey}`;
    activeJobId = jobId;
    activeRunJob = Boolean(runJob && jobId);

    if (runJob && !isServiceInvocation) {
      return jsonResponse({ error: "Worker execution requires service authorization" }, 403);
    }

    if (!runJob && action !== "status") {
      const authError = await requireAuthenticatedUser(req, supabase, supabaseKey);
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
          const nextMessage = "Modele OpenAI en cours de raisonnement CDE.";
          await updateCDEJob(supabase, job.id, {
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

        const nextMessage = providerResult.status === "completed" && providerResult.text?.trim()
          ? "Reponse OpenAI recue. Finalisation CDE."
          : "OpenAI indisponible. Finalisation CDE en mode degrade.";
        await updateCDEJob(supabase, job.id, {
          provider_status: "finalizing",
          provider_completed_at: new Date().toISOString(),
          progress_percentage: 90,
          progress_message: nextMessage,
          degraded: providerResult.status !== "completed",
          degraded_reason: providerResult.errorMessage,
        });

        startCDEWorker(supabase, supabaseUrl, supabaseKey, job.id, jobToken, {
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

    if (requestedAsync && !runJob) {
      const { data: job, error: createJobError } = await supabase
        .from("ai_analysis_jobs")
        .insert({
          function_name: FUNCTION_NAME,
          analysis_mode: "cde_discovery",
          status: "queued" satisfies CDEAnalyzeJobStatus,
          progress_percentage: 0,
          progress_message: "Analyse CDE en file d attente.",
          request_payload: sanitizeJobPayload(payload),
        })
        .select("id, public_token, status, progress_percentage, progress_message, created_at")
        .single();

      if (createJobError) return jsonResponse({ error: createJobError.message }, 500);

      startCDEWorker(supabase, supabaseUrl, supabaseKey, job.id, job.public_token, payload);

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
          analysisMode: "cde_discovery",
        },
      }, 202);
    }

    if (runJob && jobId) {
      await updateCDEJob(supabase, jobId, {
        status: "processing" satisfies CDEAnalyzeJobStatus,
        progress_percentage: 10,
        progress_message: "Demarrage de l'analyse CDE.",
        started_at: new Date().toISOString(),
      });
    }

    const streamedChunks: string[] = [];
    const outcome = await runAnalysis({
      supabase,
      runJob,
      jobId,
      providerResponseId,
      wantStream,
      emit: wantStream ? (chunk) => {
        streamedChunks.push(chunk);
      } : undefined,
    });

    if (outcome.providerPending) {
      return jsonResponse({ status: "processing", jobId }, 202);
    }

    if (wantStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const output = outcome.responsePayload?.output || streamedChunks.join("");
          if (output) {
            const chunk = { choices: [{ delta: { content: output } }] };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    return jsonResponse(outcome.responsePayload || { output: "" });
  } catch (error) {
    console.error("[CDE Analyze] Error:", error);
    await updateCDEJob(activeSupabase, activeRunJob ? activeJobId : undefined, {
      status: "failed" satisfies CDEAnalyzeJobStatus,
      progress_percentage: 100,
      progress_message: "Erreur analyse CDE.",
      error_message: getErrorMessage(error),
      completed_at: new Date().toISOString(),
    });

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      500,
    );
  }
});
