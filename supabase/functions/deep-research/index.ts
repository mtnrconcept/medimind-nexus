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
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FUNCTION_NAME = 'deep-research';
const PUBMED_FETCH_TIMEOUT_MS = 6_000;
const INTERACTIVE_AI_TIMEOUT_MS = 45_000;
const BACKGROUND_AI_TIMEOUT_MS = 110_000;

interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

interface PathologyMatch {
  name: string;
  icdCode?: string;
  confidence: 'high' | 'medium' | 'low';
  matchedSymptoms: string[];
  description: string;
  severity?: string;
  treatmentSuggestions?: string[];
  sources: WebSource[];
  isInDatabase: boolean;
  databaseId?: string;
}

interface DeepResearchResult {
  pathologies: PathologyMatch[];
  summary: string;
  differentialDiagnosis: string;
  redFlags: string[];
  recommendedTests: string[];
  webSourcesCount: number;
}

interface StreamEvent {
  type: 'step_update' | 'text' | 'pathology' | 'summary' | 'done';
  step?: { id: number; status: string; details?: string; source?: string };
  content?: string;
  pathology?: PathologyMatch;
  summary?: string;
}

type DeepResearchJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type DeepResearchPayload = {
  action?: string;
  async?: boolean;
  runJob?: boolean;
  jobId?: string;
  jobToken?: string;
  providerResponseId?: string;
  symptomNames?: string[];
  symptomIds?: string[];
  stream?: boolean;
};

type LocalPathology = {
  id: string;
  name: string;
  icd_code?: string | null;
  description?: string | null;
  severity?: string | null;
  category?: string | null;
  matchedSymptoms: string[];
  totalScore: number;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function sanitizeJobPayload(payload: DeepResearchPayload): DeepResearchPayload {
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
  return status === 'queued' || status === 'in_progress';
}

async function fetchWithTimeout(url: string, timeoutMs = PUBMED_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`External request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function updateDeepResearchJob(
  supabase: any,
  jobId: string | undefined,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return;
  const { error } = await supabase
    .from('ai_analysis_jobs')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    console.error('[DeepResearch] Job update failed:', error);
  }
}

function startDeepResearchWorker(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  jobId: string,
  publicToken: string,
  payload: DeepResearchPayload,
): void {
  const processorPayload: DeepResearchPayload = {
    ...sanitizeJobPayload(payload),
    ...(payload.providerResponseId ? { providerResponseId: payload.providerResponseId } : {}),
    runJob: true,
    jobId,
    jobToken: publicToken,
  };

  const processor = fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(processorPayload),
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      await updateDeepResearchJob(supabase, jobId, {
        status: 'failed',
        progress_percentage: 100,
        progress_message: 'Echec du worker deep research.',
        error_message: `Worker returned ${response.status}: ${errorText}`,
        completed_at: new Date().toISOString(),
      });
    }
  }).catch(async (error) => {
    await updateDeepResearchJob(supabase, jobId, {
      status: 'failed',
      progress_percentage: 100,
      progress_message: 'Echec du lancement du worker deep research.',
      error_message: getErrorMessage(error),
      completed_at: new Date().toISOString(),
    });
  });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(processor);
  } else {
    processor.catch((error) => console.error('[DeepResearch] Background worker error:', error));
  }
}

async function searchPubMed(query: string, maxResults: number = 5, apiKey?: string): Promise<WebSource[]> {
  try {
    let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    if (apiKey) searchUrl += `&api_key=${apiKey}`;

    const searchResponse = await fetchWithTimeout(searchUrl);
    if (!searchResponse.ok) return [];

    const searchData = await searchResponse.json();
    const ids = searchData?.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
    if (apiKey) fetchUrl += `&api_key=${apiKey}`;

    const fetchResponse = await fetchWithTimeout(fetchUrl);
    if (!fetchResponse.ok) return [];

    const xmlText = await fetchResponse.text();
    const sources: WebSource[] = [];
    const articles = xmlText.split('</PubmedArticle>');

    for (const articleXml of articles) {
      if (!articleXml.includes('<PubmedArticle>')) continue;

      const id = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1] || '';
      if (!id) continue;

      const title = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1] || 'Sans titre';
      const abstractMatches = [...articleXml.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
      const abstract = abstractMatches.map((match) => match[1]).join(' ');
      const journal = articleXml.match(/<Title>(.*?)<\/Title>/)?.[1] || '';
      const year = articleXml.match(/<Year>(.*?)<\/Year>/)?.[1] || '';

      sources.push({
        title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        snippet: abstract ? `[${year} - ${journal}] ${abstract}` : `[${year} - ${journal}] Resume non disponible.`,
      });
    }

    return sources;
  } catch (error) {
    console.error('[DeepResearch] PubMed search failed:', error);
    return [];
  }
}

async function fetchLocalPathologies(supabase: any, symptomIds: string[]): Promise<LocalPathology[]> {
  if (symptomIds.length === 0) return [];

  const { data: links, error } = await supabase
    .from('pathology_symptoms')
    .select('pathology_id, frequency_percent, symptom_id, is_primary, symptoms(name), pathologies(id, name, icd_code, description, severity, category)')
    .in('symptom_id', symptomIds);

  if (error) {
    console.warn('[DeepResearch] Local pathology lookup failed:', error);
    return [];
  }

  const pathologyMap = new Map<string, LocalPathology>();

  for (const link of links || []) {
    const pathology = link.pathologies as any;
    if (!pathology?.id || !pathology?.name) continue;

    if (!pathologyMap.has(pathology.id)) {
      pathologyMap.set(pathology.id, {
        id: pathology.id,
        name: pathology.name,
        icd_code: pathology.icd_code,
        description: pathology.description,
        severity: pathology.severity,
        category: pathology.category,
        matchedSymptoms: [],
        totalScore: 0,
      });
    }

    const existing = pathologyMap.get(pathology.id)!;
    const symptomName = (link.symptoms as any)?.name;
    if (symptomName) existing.matchedSymptoms.push(symptomName);
    existing.totalScore += Number(link.frequency_percent || 50);
    if (link.is_primary) existing.totalScore += 25;
  }

  return Array.from(pathologyMap.values()).sort((a, b) => b.totalScore - a.totalScore);
}

function confidenceFromLocalScore(pathology: LocalPathology): PathologyMatch['confidence'] {
  if (pathology.matchedSymptoms.length >= 3 || pathology.totalScore >= 180) return 'high';
  if (pathology.matchedSymptoms.length >= 2 || pathology.totalScore >= 80) return 'medium';
  return 'low';
}

function buildFallbackResult(
  symptomNames: string[],
  dbPathologies: LocalPathology[],
  sources: WebSource[],
  reason: string,
): DeepResearchResult {
  const sharedSources = sources.slice(0, 3);
  const pathologies = dbPathologies.slice(0, 10).map<PathologyMatch>((pathology) => ({
    name: pathology.name,
    icdCode: pathology.icd_code || undefined,
    confidence: confidenceFromLocalScore(pathology),
    matchedSymptoms: pathology.matchedSymptoms,
    description: pathology.description || 'Pathologie issue de la base locale, description indisponible.',
    severity: pathology.severity || undefined,
    treatmentSuggestions: [],
    sources: sharedSources,
    isInDatabase: true,
    databaseId: pathology.id,
  }));

  const symptomList = symptomNames.join(', ');
  const summary = pathologies.length > 0
    ? `Analyse degradee (${reason}). ${pathologies.length} pathologies locales correspondent aux symptomes: ${symptomList}. Ces resultats doivent etre valides par un clinicien.`
    : `Analyse degradee (${reason}). Aucune pathologie locale exploitable n'a ete retrouvee pour les symptomes: ${symptomList}.`;

  return {
    pathologies,
    summary,
    differentialDiagnosis: pathologies.length > 0
      ? pathologies.map((pathology) => pathology.name).join(', ')
      : 'Donnees insuffisantes pour etablir un diagnostic differentiel.',
    redFlags: [
      'Resultat degrade: l IA n a pas produit une synthese complete verifiable.',
      'Toute aggravation, douleur thoracique, dyspnee, deficit neurologique, confusion, fievre elevee ou signe de detresse impose une evaluation medicale urgente.',
    ],
    recommendedTests: [
      'Evaluation clinique complete et constantes vitales.',
      'Examens complementaires a determiner par le clinicien selon contexte, age, antecedents et traitement en cours.',
    ],
    webSourcesCount: sources.length,
  };
}

function buildPrompts(
  symptomNames: string[],
  dbPathologies: LocalPathology[],
  sources: WebSource[],
): { systemPrompt: string; userPrompt: string } {
  const dbContext = dbPathologies.length > 0
    ? dbPathologies.map((pathology) => (
      `- ${pathology.name} (CIM: ${pathology.icd_code || 'N/A'}, severite: ${pathology.severity || 'N/A'}): ${pathology.description || 'Pas de description'}\n  Symptomes correspondants: ${pathology.matchedSymptoms.join(', ')}`
    )).join('\n')
    : 'Aucune pathologie trouvee dans la base de donnees locale';

  const webContext = sources.length > 0
    ? sources.map((source) => `- "${source.title}" (${source.url})\n  Extrait: ${source.snippet?.substring(0, 300) || 'Aucun extrait disponible'}...`).join('\n')
    : 'Aucune source PubMed exploitable recuperee dans le budget interactif.';

  const systemPrompt = `Tu es un expert medical francophone specialise dans le diagnostic differentiel.

Contraintes de securite:
- Le modele synthetise les donnees recuperees; il n est pas la source de verite.
- Ne prescris pas et ne conclus pas a un diagnostic certain.
- Distingue clairement donnees confirmees, hypotheses et donnees insuffisantes.
- Cite les sources fournies quand elles supportent une affirmation.
- Retourne uniquement un JSON valide, sans markdown.

Format JSON obligatoire:
{
  "pathologies": [
    {
      "name": "Nom",
      "icdCode": "CIM-10 ou null",
      "confidence": "high|medium|low",
      "matchedSymptoms": ["..."],
      "description": "...",
      "severity": "mild|moderate|severe|critical",
      "treatmentSuggestions": [],
      "sources": [{"title": "...", "url": "..."}]
    }
  ],
  "summary": "...",
  "differentialDiagnosis": "...",
  "redFlags": ["..."],
  "recommendedTests": ["..."]
}`;

  const userPrompt = `Deep Research pour les symptomes: ${symptomNames.join(', ')}

CONTEXTE LOCAL
${dbContext}

SOURCES PUBMED
${webContext}

Produis une synthese clinique prudente, cite les sources disponibles et signale explicitement les limites.`;

  return { systemPrompt, userPrompt };
}

function parseResearchResult(
  content: string,
  symptomNames: string[],
  dbPathologies: LocalPathology[],
  sources: WebSource[],
): DeepResearchResult {
  try {
    const parsed = JSON.parse(cleanJsonString(content)) as Partial<DeepResearchResult>;
    const rawPathologies = Array.isArray(parsed.pathologies) ? parsed.pathologies : [];

    const pathologies = rawPathologies.slice(0, 20).map((raw: any): PathologyMatch => {
      const name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : 'Pathologie non nommee';
      const dbMatch = dbPathologies.find((pathology) => pathology.name.toLowerCase() === name.toLowerCase());
      const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
      const mappedSources = rawSources
        .filter((source: any) => typeof source?.title === 'string' && typeof source?.url === 'string')
        .slice(0, 5)
        .map((source: any) => ({
          title: source.title,
          url: source.url,
          snippet: typeof source.snippet === 'string' ? source.snippet : undefined,
        }));

      return {
        name,
        icdCode: typeof raw.icdCode === 'string' ? raw.icdCode : dbMatch?.icd_code || undefined,
        confidence: raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
          ? raw.confidence
          : (dbMatch ? confidenceFromLocalScore(dbMatch) : 'low'),
        matchedSymptoms: Array.isArray(raw.matchedSymptoms)
          ? raw.matchedSymptoms.filter((symptom: unknown): symptom is string => typeof symptom === 'string')
          : dbMatch?.matchedSymptoms || [],
        description: typeof raw.description === 'string' && raw.description.trim()
          ? raw.description
          : dbMatch?.description || 'Description indisponible.',
        severity: typeof raw.severity === 'string' ? raw.severity : dbMatch?.severity || undefined,
        treatmentSuggestions: Array.isArray(raw.treatmentSuggestions)
          ? raw.treatmentSuggestions.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
          : [],
        sources: mappedSources.length > 0 ? mappedSources : sources.slice(0, 3),
        isInDatabase: Boolean(dbMatch),
        databaseId: dbMatch?.id,
      };
    });

    if (pathologies.length === 0 && !parsed.summary) {
      throw new Error('OpenAI JSON did not include usable pathologies or summary');
    }

    return {
      pathologies,
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary
        : 'Synthese indisponible; verifier les resultats detailles.',
      differentialDiagnosis: typeof parsed.differentialDiagnosis === 'string'
        ? parsed.differentialDiagnosis
        : pathologies.map((pathology) => pathology.name).join(', '),
      redFlags: Array.isArray(parsed.redFlags)
        ? parsed.redFlags.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      recommendedTests: Array.isArray(parsed.recommendedTests)
        ? parsed.recommendedTests.filter((item: unknown): item is string => typeof item === 'string')
        : [],
      webSourcesCount: sources.length,
    };
  } catch (error) {
    console.error('[DeepResearch] JSON parse/validation error:', error);
    return buildFallbackResult(symptomNames, dbPathologies, sources, 'JSON OpenAI invalide ou incomplet');
  }
}

async function buildResearchContext(
  supabase: any,
  symptomNames: string[],
  symptomIds: string[],
  emit?: (event: StreamEvent) => void,
): Promise<{ dbPathologies: LocalPathology[]; sources: WebSource[] }> {
  emit?.({ type: 'step_update', step: { id: 1, status: 'running', details: 'Base locale...', source: 'Supabase' } });
  const localPromise = fetchLocalPathologies(supabase, symptomIds);

  emit?.({ type: 'step_update', step: { id: 2, status: 'running', details: 'Recherche PubMed...', source: 'NCBI' } });
  const ncbiApiKey = Deno.env.get('NCBI_API_KEY');
  const symptomQuery = symptomNames.join(' AND ');
  const pubmedQuery = `${symptomQuery} diagnosis differential`;
  const combinedQuery = symptomNames.length >= 2
    ? `${symptomNames.slice(0, 3).join(' ')} syndrome disease`
    : '';
  const pubmedPromise = searchPubMed(pubmedQuery, 10, ncbiApiKey);
  const combinedPromise = combinedQuery
    ? searchPubMed(combinedQuery, 5, ncbiApiKey)
    : Promise.resolve([] as WebSource[]);

  const [dbPathologies, pubmedSources, additionalSources] = await Promise.all([
    localPromise,
    pubmedPromise,
    combinedPromise,
  ]);
  const sources = [...pubmedSources, ...additionalSources];

  emit?.({ type: 'step_update', step: { id: 1, status: 'completed', details: `${dbPathologies.length} pathologies locales trouvees`, source: 'Local DB' } });
  emit?.({ type: 'step_update', step: { id: 2, status: 'completed', details: `${sources.length} sources PubMed identifiees`, source: 'PubMed' } });

  return { dbPathologies, sources };
}

async function runAnalysis(params: {
  supabase: any;
  symptomNames: string[];
  symptomIds: string[];
  wantStream: boolean;
  runJob: boolean;
  jobId?: string;
  providerResponseId?: string;
  emit?: (event: StreamEvent) => void;
}): Promise<{ responsePayload?: { result: DeepResearchResult }; providerPending?: boolean }> {
  const { supabase, symptomNames, symptomIds, wantStream, runJob, jobId, providerResponseId, emit } = params;
  const { dbPathologies, sources } = await buildResearchContext(supabase, symptomNames, symptomIds, emit);

  await updateDeepResearchJob(supabase, runJob ? jobId : undefined, {
    progress_percentage: 30,
    progress_message: 'Donnees locales et PubMed chargees.',
  });

  const { systemPrompt, userPrompt } = buildPrompts(symptomNames, dbPathologies, sources);
  const callOptions = {
    model: 'gpt-5.5',
    reasoningEffort: 'high' as const,
    maxTokens: 8000,
    temperature: 0.3,
    timeoutMs: runJob ? BACKGROUND_AI_TIMEOUT_MS : INTERACTIVE_AI_TIMEOUT_MS,
    hasExternalEvidence: sources.length > 0,
  };

  let content = '';
  let degradedReason: string | null = null;

  emit?.({ type: 'step_update', step: { id: 3, status: 'running', details: 'Analyse OpenAI...', source: 'OpenAI' } });

  if (runJob && providerResponseId) {
    const providerResult = await retrieveBackgroundAI(providerResponseId, {
      ...callOptions,
      timeoutMs: 15_000,
    });

    if (isOpenAIBackgroundPending(providerResult.status)) {
      await updateDeepResearchJob(supabase, jobId, {
        provider_status: providerResult.status,
        progress_percentage: 80,
        progress_message: 'Modele OpenAI en cours de raisonnement.',
      });
      return { providerPending: true };
    }

    if (providerResult.status !== 'completed' || !providerResult.text?.trim()) {
      degradedReason = providerResult.errorMessage || `OpenAI background status ${providerResult.status}`;
    } else {
      content = providerResult.text;
    }
  } else if (runJob) {
    try {
      const backgroundResponse = await startBackgroundAI(systemPrompt, userPrompt, callOptions);
      await updateDeepResearchJob(supabase, jobId, {
        status: 'processing' satisfies DeepResearchJobStatus,
        progress_percentage: 70,
        progress_message: 'Modele OpenAI en cours de raisonnement.',
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
        ? await streamAI(systemPrompt, userPrompt, (chunk) => {
          emit?.({ type: 'text', content: chunk });
        }, callOptions)
        : await callAI(systemPrompt, userPrompt, callOptions);
      content = aiResult.text;
    } catch (error) {
      degradedReason = getErrorMessage(error);
    }
  }

  const result = content.trim()
    ? parseResearchResult(content, symptomNames, dbPathologies, sources)
    : buildFallbackResult(symptomNames, dbPathologies, sources, degradedReason || 'OpenAI indisponible ou timeout');

  emit?.({ type: 'step_update', step: { id: 3, status: 'completed', details: 'Analyse terminee', source: 'OpenAI' } });

  for (const pathology of result.pathologies) {
    emit?.({ type: 'pathology', pathology });
  }
  emit?.({ type: 'summary', summary: result.summary });
  emit?.({ type: 'done' });

  const responsePayload = { result };

  await updateDeepResearchJob(supabase, runJob ? jobId : undefined, {
    status: 'completed' satisfies DeepResearchJobStatus,
    progress_percentage: 100,
    progress_message: degradedReason ? 'Analyse terminee en mode degrade.' : 'Analyse terminee.',
    result_payload: responsePayload,
    degraded: Boolean(degradedReason),
    degraded_reason: degradedReason,
    provider_status: providerResponseId ? 'completed' : undefined,
    completed_at: new Date().toISOString(),
  });

  return { responsePayload };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let activeSupabase: any;
  let activeJobId: string | undefined;
  let activeRunJob = false;

  try {
    const payload = await req.json().catch(() => ({})) as DeepResearchPayload;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase function environment is incomplete');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    activeSupabase = supabase;

    const action = payload.action;
    const jobId = payload.jobId;
    const jobToken = payload.jobToken;
    const providerResponseId = payload.providerResponseId;
    const runJob = Boolean(payload.runJob);
    const wantStream = payload.stream === true;
    const requestedAsync = payload.async === true || (!runJob && action !== 'status' && !wantStream);
    const symptomNames = normalizeStringArray(payload.symptomNames);
    const symptomIds = normalizeStringArray(payload.symptomIds);
    const isServiceInvocation = req.headers.get('authorization') === `Bearer ${supabaseKey}`;
    activeJobId = jobId;
    activeRunJob = Boolean(runJob && jobId);

    if (runJob && !isServiceInvocation) {
      return jsonResponse({ error: 'Worker execution requires service authorization' }, 403);
    }

    if (action === 'status') {
      if (!jobId || !jobToken) {
        return jsonResponse({ error: 'jobId and jobToken are required' }, 400);
      }

      const { data: job, error: jobError } = await supabase
        .from('ai_analysis_jobs')
        .select('id, status, progress_percentage, progress_message, request_payload, result_payload, error_message, model, reasoning_effort, degraded, degraded_reason, provider_name, provider_response_id, provider_status, provider_started_at, provider_completed_at, created_at, started_at, completed_at, updated_at')
        .eq('id', jobId)
        .eq('public_token', jobToken)
        .maybeSingle();

      if (jobError) return jsonResponse({ error: jobError.message }, 500);
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);

      if (
        job.status === 'processing' &&
        job.provider_name === 'openai' &&
        job.provider_response_id &&
        job.provider_status !== 'finalizing'
      ) {
        const providerResult = await retrieveBackgroundAI(job.provider_response_id, {
          model: typeof job.model === 'string' ? job.model : undefined,
          reasoningEffort: job.reasoning_effort,
          timeoutMs: 15_000,
        });

        if (isOpenAIBackgroundPending(providerResult.status)) {
          const nextProgress = Math.max(Number(job.progress_percentage || 0), 80);
          const nextMessage = 'Modele OpenAI en cours de raisonnement.';
          await updateDeepResearchJob(supabase, job.id, {
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

        if (providerResult.status === 'completed' && providerResult.text?.trim()) {
          const nextMessage = 'Reponse OpenAI recue. Finalisation clinique.';
          await updateDeepResearchJob(supabase, job.id, {
            provider_status: 'finalizing',
            provider_completed_at: new Date().toISOString(),
            progress_percentage: 90,
            progress_message: nextMessage,
          });

          startDeepResearchWorker(supabase, supabaseUrl, supabaseKey, job.id, jobToken, {
            ...(job.request_payload || {}),
            providerResponseId: job.provider_response_id,
          });

          return jsonResponse({
            job: {
              ...job,
              provider_status: 'finalizing',
              progress_percentage: 90,
              progress_message: nextMessage,
            },
          });
        }

        const errorMessage = providerResult.errorMessage || `OpenAI background response ended with status ${providerResult.status}`;
        await updateDeepResearchJob(supabase, job.id, {
          provider_status: 'finalizing',
          progress_percentage: 90,
          progress_message: 'OpenAI indisponible. Finalisation en mode degrade.',
          degraded: true,
          degraded_reason: errorMessage,
        });

        startDeepResearchWorker(supabase, supabaseUrl, supabaseKey, job.id, jobToken, {
          ...(job.request_payload || {}),
          providerResponseId: job.provider_response_id,
        });

        return jsonResponse({
          job: {
            ...job,
            provider_status: 'finalizing',
            progress_percentage: 90,
            progress_message: 'OpenAI indisponible. Finalisation en mode degrade.',
            degraded: true,
            degraded_reason: errorMessage,
          },
        });
      }

      return jsonResponse({ job });
    }

    if (symptomNames.length === 0) {
      return jsonResponse({ error: 'Veuillez selectionner au moins un symptome' }, 400);
    }

    if (requestedAsync && !runJob) {
      const { data: job, error: createJobError } = await supabase
        .from('ai_analysis_jobs')
        .insert({
          function_name: FUNCTION_NAME,
          analysis_mode: 'symptom_deep_research',
          status: 'queued' satisfies DeepResearchJobStatus,
          progress_percentage: 0,
          progress_message: 'Deep Research en file d attente.',
          request_payload: sanitizeJobPayload(payload),
        })
        .select('id, public_token, status, progress_percentage, progress_message, created_at')
        .single();

      if (createJobError) return jsonResponse({ error: createJobError.message }, 500);

      startDeepResearchWorker(supabase, supabaseUrl, supabaseKey, job.id, job.public_token, payload);

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
          analysisMode: 'symptom_deep_research',
        },
      }, 202);
    }

    if (runJob && jobId) {
      await updateDeepResearchJob(supabase, jobId, {
        status: 'processing' satisfies DeepResearchJobStatus,
        progress_percentage: 10,
        progress_message: 'Chargement des donnees pour la Deep Research.',
        started_at: new Date().toISOString(),
      });
    }

    const emit = (event: StreamEvent) => event;
    const outcome = await runAnalysis({
      supabase,
      symptomNames,
      symptomIds,
      wantStream,
      runJob,
      jobId,
      providerResponseId,
      emit: wantStream ? emit : undefined,
    });

    if (outcome.providerPending) {
      return jsonResponse({ status: 'processing', jobId }, 202);
    }

    if (wantStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          if (outcome.responsePayload?.result) {
            for (const pathology of outcome.responsePayload.result.pathologies) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'pathology', pathology })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'summary', summary: outcome.responsePayload.result.summary })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    return jsonResponse(outcome.responsePayload || { result: null });
  } catch (error) {
    console.error('[DeepResearch] Error:', error);
    await updateDeepResearchJob(activeSupabase, activeRunJob ? activeJobId : undefined, {
      status: 'failed' satisfies DeepResearchJobStatus,
      progress_percentage: 100,
      progress_message: 'Erreur Deep Research.',
      error_message: getErrorMessage(error),
      completed_at: new Date().toISOString(),
    });

    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      500,
    );
  }
});
