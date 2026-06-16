import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, cleanJsonString } from "../_shared/ai-client.ts";
import {
  applyClinicalSafetyContract,
  buildClinicalSystemPrompt,
  detectHighRiskContext,
  getClinicalModelEnv,
  selectClinicalModel,
  type ClinicalRiskAssessment,
} from "../_shared/clinical-brain.ts";
import {
  OPENAI_CROSS_DATA_MODEL,
  OPENAI_CROSS_DATA_REASONING_EFFORT,
  buildEvidenceLinks,
  buildSelectedElements,
  ensureAnalysisShape,
  ensureSchemaComparison,
  ensureTreatmentSchemasShape,
  mergeAndValidateLinks,
  normalizeMedicalName,
  type SelectedElement,
  type TreatmentSchema,
} from "./analysis-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBMED_FETCH_TIMEOUT_MS = 6_000;
const MAX_PUBMED_QUERIES = 4;
const INTERACTIVE_AI_TIMEOUT_MS = 45_000;

interface CausalLink {
  from: string;
  fromType: 'symptom' | 'pathology' | 'treatment' | 'medication';
  to: string;
  toType: 'symptom' | 'pathology' | 'treatment' | 'medication';
  relationship: string;
  probability: 'high' | 'medium' | 'low';
  evidence: string;
  patientCount: number;
  webSources: string[];
  isAppropriate?: boolean; // Pour les traitements: indique si adapté à la pathologie
  effectType?: 'therapeutic' | 'adverse' | 'both'; // Type d'effet: thérapeutique, indésirable ou les deux
  therapeuticDetails?: string; // Détails de l'effet thérapeutique
  adverseDetails?: string; // Détails de l'effet indésirable
  dangerLevel?: 'critical' | 'high' | 'moderate' | 'low'; // Niveau de danger
  interactionType?: 'drug-drug' | 'drug-treatment' | 'pathology-danger'; // Type d'interaction
  symptomFrequency?: 'principal' | 'frequent' | 'possible' | 'rare'; // Pour liens pathologie→symptôme
}

interface Alternative {
  for: string;           // The problematic medication/treatment
  forType: string;       // Type: medication or treatment
  reason: string;        // Why it's problematic
  suggestions: string[]; // Alternative medications/treatments
  evidence?: string;
}

interface ProposedChange {
  action: 'replace' | 'remove' | 'add';
  target: string;        // Medication/treatment name
  targetType: 'medication' | 'treatment';
  reason: string;
  replacement?: string;  // For 'replace' action
  replacementType?: 'medication' | 'treatment';
  improvementScore: number; // How much this change improves the schema (0-100)
}

interface SchemaStats {
  redLinks: number;      // Critical/high danger
  orangeLinks: number;   // Moderate danger
  greenLinks: number;    // Safe/appropriate
  totalDangerScore: number;
  inappropriateCount: number;
  adverseEffectCount: number;
}

interface SchemaComparison {
  currentScore: number;     // 0-100 benefit/risk score
  proposedScore: number;    // 0-100 benefit/risk score
  improvementPercent: number;
  currentStats: SchemaStats;
  proposedStats: SchemaStats;
  proposedChanges: ProposedChange[];
  benefitRiskRatio: {
    current: number;  // Benefits / Risks ratio
    proposed: number;
  };
  clinicalSummary: string; // Summary of proposed changes
}

interface AnalysisResult {
  causalLinks: CausalLink[];
  summary: string;
  warnings: string[];
  recommendations: string[];
  alternatives: Alternative[];
  schemaComparison?: SchemaComparison;
  treatmentSchemas?: TreatmentSchema[];
  clinicalSafety?: ClinicalRiskAssessment;
  webResearch: {
    query: string;
    findings: string[];
    sources: { title: string; url: string }[];
  }[];
}

type PubMedArticle = { title: string; url: string; abstract: string };

type WebResearchResult = {
  query: string;
  articles: PubMedArticle[];
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`PubMed request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


// Fonction pour rechercher sur PubMed
// Fonction pour rechercher sur PubMed avec API Key et Abstracts complets
async function searchPubMed(query: string, maxResults: number = 5, apiKey?: string): Promise<PubMedArticle[]> {
  try {
    let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    if (apiKey) searchUrl += `&api_key=${apiKey}`;

    const searchResponse = await fetchWithTimeout(searchUrl, PUBMED_FETCH_TIMEOUT_MS);
    if (!searchResponse.ok) throw new Error(`PubMed search failed with ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const ids = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) return [];

    let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
    if (apiKey) fetchUrl += `&api_key=${apiKey}`;

    const fetchResponse = await fetchWithTimeout(fetchUrl, PUBMED_FETCH_TIMEOUT_MS);
    if (!fetchResponse.ok) throw new Error(`PubMed fetch failed with ${fetchResponse.status}`);
    const xmlText = await fetchResponse.text();

    const articles: PubMedArticle[] = [];
    const xmlArticles = xmlText.split('</PubmedArticle>');

    for (const articleXml of xmlArticles) {
      if (!articleXml.includes('<PubmedArticle>')) continue;

      const idMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
      const id = idMatch ? idMatch[1] : '';
      if (!id) continue;

      const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
      const title = titleMatch ? titleMatch[1] : "Sans titre";

      const abstractMatches = [...articleXml.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
      const abstract = abstractMatches.map(m => m[1]).join(" ");

      articles.push({
        title: title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        abstract: abstract || "Résumé non disponible."
      });
    }
    return articles;
  } catch (error) {
    console.error('PubMed search error:', error);
    return [];
  }
}

function buildDeterministicAnalysis(
  selectedElements: SelectedElement[],
  evidenceLinks: CausalLink[],
  cachedLinks: CausalLink[],
  webResearchResults: WebResearchResult[],
  riskAssessment: ClinicalRiskAssessment,
  reason: string,
): AnalysisResult {
  const causalLinks = mergeAndValidateLinks(selectedElements, evidenceLinks, cachedLinks);
  const sourceCount = webResearchResults.reduce((sum, result) => sum + result.articles.length, 0);
  const selectedNames = selectedElements.map((element) => element.name).join(', ');

  let analysis = ensureAnalysisShape({
    causalLinks,
    summary: causalLinks.length > 0
      ? `Analyse terminee en mode degrade: ${causalLinks.length} lien(s) clinique(s) valide(s) ont ete conserves a partir de la base, du cache et des sources recuperees. La synthese IA complete n'a pas abouti dans le delai interactif (${reason}). Elements analyses: ${selectedNames}.`
      : `Analyse terminee en mode degrade: aucun lien causal direct n'a ete confirme par la base, le cache ou les sources recuperees dans le delai interactif (${reason}). Elements analyses: ${selectedNames}.`,
    warnings: [
      'Synthese IA complete indisponible dans le delai interactif; les resultats affiches reposent sur les donnees structurees, le cache et les sources PubMed recuperees.',
      causalLinks.length === 0
        ? "L'absence de lien affiche ne signifie pas absence d'interaction clinique; elle signifie absence de preuve directe recuperee par cette requete."
        : 'Les liens affiches doivent etre interpretes comme des signaux cliniques a verifier, pas comme une prescription.',
    ],
    recommendations: [
      'Verifier les sources officielles, les contre-indications et les interactions connues avant toute decision therapeutique.',
      'Relancer une analyse complete si une synthese narrative plus detaillee est necessaire.',
      'Faire valider les conclusions par un professionnel de sante habilite.',
    ],
    alternatives: [],
    webResearch: webResearchResults.map((result) => ({
      query: result.query,
      findings: result.articles.map((article) => article.abstract).filter(Boolean).slice(0, 3),
      sources: result.articles.map((article) => ({ title: article.title, url: article.url })),
    })),
  });

  analysis.schemaComparison = ensureSchemaComparison(analysis);
  analysis = applyClinicalSafetyContract(analysis, riskAssessment);

  if (sourceCount > 0 && !analysis.recommendations.some((item) => item.includes('PubMed'))) {
    analysis.recommendations.push(`Revoir les ${sourceCount} source(s) PubMed recuperee(s) avant validation clinique.`);
  }

  return analysis;
}

// Fonction pour générer un hash de requête (pour le cache)
function generateRequestHash(pathologyIds: string[], symptomIds: string[], treatmentIds: string[], medicationIds: string[]): string {
  const sorted = [
    ...[...pathologyIds].sort(),
    ...[...symptomIds].sort(),
    ...[...treatmentIds].sort(),
    ...[...medicationIds].sort()
  ].join('|');
  // Simple hash
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function buildPairHash(fromName: string, fromType: string, toName: string, toType: string): string {
  return [
    `${normalizeMedicalName(fromName)}|${fromType}`,
    `${normalizeMedicalName(toName)}|${toType}`,
  ].sort().join('|');
}

function uniqueElements(elements: { name: string; type: string }[]): { name: string; type: string }[] {
  const seen = new Set<string>();
  return elements.filter((element) => {
    const key = `${element.type}:${normalizeMedicalName(element.name)}`;
    if (!element.name || !element.type || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toCausalLink(link: any): CausalLink {
  return {
    from: link.from_element,
    fromType: link.from_type,
    to: link.to_element,
    toType: link.to_type,
    relationship: link.relationship,
    probability: link.probability || 'medium',
    evidence: link.evidence || '',
    patientCount: 0,
    webSources: [],
    isAppropriate: link.is_appropriate,
    effectType: link.effect_type,
    therapeuticDetails: link.therapeutic_details,
    adverseDetails: link.adverse_details,
    dangerLevel: link.danger_level,
    interactionType: link.interaction_type,
    symptomFrequency: link.symptom_frequency,
  };
}

async function findCachedLinksBatched(
  supabase: any,
  elements: { name: string; type: string }[]
): Promise<CausalLink[]> {
  const candidates = uniqueElements(elements);
  const pairHashes: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const elem1 = candidates[i];
      const elem2 = candidates[j];
      pairHashes.push(buildPairHash(elem1.name, elem1.type, elem2.name, elem2.type));
    }
  }

  if (pairHashes.length === 0) return [];

  const cachedRows: any[] = [];
  const uniquePairHashes = [...new Set(pairHashes)];

  for (let i = 0; i < uniquePairHashes.length; i += 100) {
    const chunk = uniquePairHashes.slice(i, i + 100);
    const { data, error } = await supabase
      .from('causal_links_cache')
      .select('id, from_element, from_type, to_element, to_type, relationship, probability, evidence, is_appropriate, effect_type, therapeutic_details, adverse_details, danger_level, interaction_type, symptom_frequency, hit_count')
      .in('pair_hash', chunk);

    if (error) {
      console.warn('[Cache] Lecture batch impossible:', error.message || error);
      continue;
    }

    cachedRows.push(...(data || []));
  }

  if (cachedRows.length > 0) {
    const updatedAt = new Date().toISOString();
    await Promise.allSettled(
      cachedRows.slice(0, 100).map((link) =>
        supabase
          .from('causal_links_cache')
          .update({ hit_count: (link.hit_count || 0) + 1, updated_at: updatedAt })
          .eq('id', link.id)
      )
    );
  }

  return cachedRows.map(toCausalLink);
}

// Fonction pour chercher les liens en cache
async function findCachedLinks(
  supabase: any,
  elements: { name: string; type: string }[]
): Promise<CausalLink[]> {
  const cachedLinks: CausalLink[] = [];

  // Chercher les liens existants entre tous les éléments
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elem1 = elements[i];
      const elem2 = elements[j];

      // Chercher dans les deux directions
      const { data: links1 } = await supabase
        .from('causal_links_cache')
        .select('*')
        .ilike('from_element', `%${elem1.name}%`)
        .ilike('to_element', `%${elem2.name}%`);

      const { data: links2 } = await supabase
        .from('causal_links_cache')
        .select('*')
        .ilike('from_element', `%${elem2.name}%`)
        .ilike('to_element', `%${elem1.name}%`);

      // Convertir au format CausalLink
      const allLinks = [...(links1 || []), ...(links2 || [])];
      for (const link of allLinks) {
        cachedLinks.push({
          from: link.from_element,
          fromType: link.from_type,
          to: link.to_element,
          toType: link.to_type,
          relationship: link.relationship,
          probability: link.probability || 'medium',
          evidence: link.evidence || '',
          patientCount: 0,
          webSources: [],
          isAppropriate: link.is_appropriate,
          effectType: link.effect_type,
          therapeuticDetails: link.therapeutic_details,
          adverseDetails: link.adverse_details,
          dangerLevel: link.danger_level,
          interactionType: link.interaction_type,
          symptomFrequency: link.symptom_frequency,
        });

        // Incrémenter le hit count
        await supabase
          .from('causal_links_cache')
          .update({ hit_count: link.hit_count + 1, updated_at: new Date().toISOString() })
          .eq('id', link.id);
      }
    }
  }

  return cachedLinks;
}

// Fonction pour sauvegarder les liens en cache
async function saveLinkToCache(supabase: any, link: CausalLink, aiModel: string): Promise<void> {
  try {
    // Générer le hash de la paire
    const pairHash = buildPairHash(link.from, link.fromType, link.to, link.toType);

    await supabase.from('causal_links_cache').upsert({
      from_element: link.from,
      from_type: link.fromType,
      to_element: link.to,
      to_type: link.toType,
      pair_hash: pairHash,
      relationship: link.relationship,
      probability: link.probability,
      evidence: link.evidence,
      is_appropriate: link.isAppropriate,
      effect_type: link.effectType,
      therapeutic_details: link.therapeuticDetails,
      adverse_details: link.adverseDetails,
      danger_level: link.dangerLevel,
      interaction_type: link.interactionType,
      symptom_frequency: link.symptomFrequency,
      ai_model: aiModel,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'pair_hash',
      ignoreDuplicates: false
    });
  } catch (error) {
    console.error('[Cache] Erreur sauvegarde lien:', error);
  }
}


serve(async (req) => {
  console.log(`[CrossDataAnalyzer] Requête reçue: ${req.method}`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      pathologyIds, symptomIds, treatmentIds, medicationIds,
      externalPathologies = [], externalSymptoms = [], externalTreatments = [], externalMedications = [],
      analysisMode = 'full_analysis',
      currentAnalysis = null
    } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase function environment is incomplete: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer les données sélectionnées (incluant les médicaments) depuis la DB
    const [pathologiesRes, symptomsRes, treatmentsRes, medicationsRes, patientsRes] = await Promise.all([
      pathologyIds?.length > 0
        ? supabase.from('pathologies').select('id, name, icd_code, severity, description').in('id', pathologyIds)
        : Promise.resolve({ data: [] }),
      symptomIds?.length > 0
        ? supabase.from('symptoms').select('id, name, body_system, description').in('id', symptomIds)
        : Promise.resolve({ data: [] }),
      treatmentIds?.length > 0
        ? supabase.from('treatments').select('id, name, type, pathology_id, description, contraindications, pathologies(name)').in('id', treatmentIds)
        : Promise.resolve({ data: [] }),
      medicationIds?.length > 0
        ? supabase.from('medications').select('id, name, atc_code, substance, indications, posology, side_effects(name, severity, frequency, description), contraindications(condition, severity, description), drug_interactions(interacting_drug, severity, description)').in('id', medicationIds)
        : Promise.resolve({ data: [] }),
      pathologyIds?.length > 0
        ? supabase
          .from('patients')
          .select('id, patient_id, age, gender, treatment, outcome, pathology_id, pathologies(name)')
          .in('pathology_id', pathologyIds)
          .limit(100)
        : Promise.resolve({ data: [] })
    ]);

    // Fusionner données DB et données externes (NCBI)
    const pathologies = [...(pathologiesRes.data || []), ...externalPathologies];
    const symptoms = [...(symptomsRes.data || []), ...externalSymptoms];
    const treatments = [...(treatmentsRes.data || []), ...externalTreatments];
    const medications = [...(medicationsRes.data || []), ...externalMedications];
    const patients = patientsRes.data || [];

    // Préparer la liste des éléments pour la recherche en cache
    const allElements: { name: string; type: string }[] = [
      ...pathologies.map((p: any) => ({ name: p.name, type: 'pathology' })),
      ...symptoms.map((s: any) => ({ name: s.name, type: 'symptom' })),
      ...treatments.map((t: any) => ({ name: t.name, type: 'treatment' })),
      ...medications.map((m: any) => ({ name: m.name, type: 'medication' })),
    ];
    const selectedElements = buildSelectedElements(pathologies, symptoms, treatments, medications);

    if (selectedElements.length < 2) {
      const summary = selectedElements.length === 0
        ? "Aucun element medical n'a ete fourni pour l'analyse cross-data."
        : "Un seul element medical a ete fourni; aucune paire clinique ne peut etre auditee.";
      const analysis = ensureAnalysisShape({
        causalLinks: [],
        summary,
        warnings: [
          "L'absence de lien detecte ne signifie pas absence de risque: les donnees fournies sont insuffisantes.",
          "Les interactions, contre-indications et effets indesirables necessitent au moins deux elements medicaux a comparer.",
        ],
        recommendations: [
          "Ajouter au moins deux elements parmi pathologies, symptomes, traitements ou medicaments avant de relancer l'analyse.",
          "Verifier les donnees reelles du patient, notamment traitements actuels, antecedents, allergies et comorbidites.",
          "Ne pas prendre de decision therapeutique sur la base d'une analyse vide ou incomplete.",
        ],
        alternatives: [],
        webResearch: [],
      });
      analysis.schemaComparison = ensureSchemaComparison(analysis);

      return new Response(
        JSON.stringify({
          analysis,
          context: {
            pathologiesCount: pathologies.length,
            symptomsCount: symptoms.length,
            treatmentsCount: treatments.length,
            medicationsCount: medications.length,
            patientsAnalyzed: 0,
            pubmedSearches: 0,
            cacheHits: 0,
            newLinksGenerated: 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rechercher les liens existants en cache
    console.log('[CrossDataAnalyzer] Recherche dans le cache...');
    const cachedLinks = await findCachedLinksBatched(supabase, allElements);
    console.log(`[CrossDataAnalyzer] ${cachedLinks.length} liens trouvés en cache`);

    // Si on a trouvé des liens en cache pour TOUTES les paires, on peut les retourner directement
    const expectedPairs = (allElements.length * (allElements.length - 1)) / 2;
    const cacheHitRatio = cachedLinks.length / Math.max(expectedPairs, 1);
    console.log(`[CrossDataAnalyzer] Ratio cache: ${(cacheHitRatio * 100).toFixed(1)}%`);

    // Récupérer les liens symptômes pour les pathologies sélectionnées
    let symptomLinks: any[] = [];
    if (pathologyIds?.length > 0) {
      const { data: links } = await supabase
        .from('pathology_symptoms')
        .select('*, symptoms(name), pathologies(name)')
        .in('pathology_id', pathologyIds);
      symptomLinks = links || [];
    }

    const evidenceLinks = buildEvidenceLinks({
      pathologies,
      symptoms,
      treatments,
      medications,
      symptomLinks,
    });

    // Construire les requêtes de recherche web
    const webSearchQueries: string[] = [];

    // Rechercher les interactions entre éléments sélectionnés
    for (const pathology of pathologies) {
      for (const treatment of treatments) {
        webSearchQueries.push(`${pathology.name} ${treatment.name} traitement adapté efficacité`);
      }
      for (const medication of medications) {
        webSearchQueries.push(`${pathology.name} ${medication.name} indication traitement`);
      }
      for (const symptom of symptoms) {
        webSearchQueries.push(`${pathology.name} ${symptom.name} corrélation causalité`);
      }
    }

    // Interactions médicaments-traitements
    for (const medication of medications) {
      for (const treatment of treatments) {
        webSearchQueries.push(`${medication.name} ${treatment.name} interaction combinaison`);
      }
      for (const symptom of symptoms) {
        webSearchQueries.push(`${medication.name} ${symptom.name} effet secondaire indésirable`);
      }
    }

    for (const treatment of treatments) {
      for (const symptom of symptoms) {
        webSearchQueries.push(`${treatment.name} ${symptom.name} effet secondaire`);
      }
    }

    // DÉSACTIVÉ: Retour cache rapide - on veut toujours générer la synthèse
    // Le cache sera utilisé pour enrichir les liens, mais on appelle toujours l'IA pour la synthèse
    // if (cacheHitRatio >= 0.8 && cachedLinks.length >= 2) {
    //   console.log('[CrossDataAnalyzer] Cache suffisant, retour direct sans appel API');
    //   ...
    // }
    console.log(`[CrossDataAnalyzer] ${cachedLinks.length} liens en cache, mais appel IA pour synthèse complète`);

    // Si pas assez de requêtes spécifiques, rechercher chaque élément individuellement
    if (webSearchQueries.length === 0) {
      for (const p of pathologies) webSearchQueries.push(`${p.name} causes symptômes traitements`);
      for (const s of symptoms) webSearchQueries.push(`${s.name} causes pathologies associées`);
      for (const t of treatments) webSearchQueries.push(`${t.name} effets secondaires interactions indications`);
      for (const m of medications) webSearchQueries.push(`${m.name} indications contre-indications effets secondaires`);
    }

    // Limiter les recherches externes pour garder la fonction dans le budget interactif.
    const limitedQueries = webSearchQueries.slice(0, MAX_PUBMED_QUERIES);

    console.log('Exécution des recherches PubMed:', limitedQueries);

    // Exécuter les recherches PubMed en parallèle
    const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
    const webResearchResults = await Promise.all(
      limitedQueries.map(async (query) => {
        const articles = await searchPubMed(query, 3, ncbiApiKey);
        return {
          query,
          articles
        };
      })
    );

    // Construire le contexte pour l'IA
    const selectedPathologiesContext = pathologies.map((p: any) =>
      `- ${p.name} (CIM: ${p.icd_code || 'N/A'}, sévérité: ${p.severity || 'N/A'}): ${p.description || ''}`
    ).join('\n');

    const selectedSymptomsContext = symptoms.map((s: any) =>
      `- ${s.name} (système: ${s.body_system || 'N/A'}): ${s.description || ''}`
    ).join('\n');

    const selectedTreatmentsContext = treatments.map((t: any) =>
      `- ${t.name} (type: ${t.type || 'N/A'}, pour pathologie: ${t.pathologies?.name || 'N/A'}): ${t.description || ''}\n  Contre-indications: ${t.contraindications?.join(', ') || 'Aucune connue'}`
    ).join('\n');

    // Contexte des médicaments avec effets secondaires et interactions
    const selectedMedicationsContext = medications.map((m: any) => {
      const sideEffects = m.side_effects?.map((se: any) => `${se.name} (${se.severity || 'N/A'})`).join(', ') || 'Aucun connu';
      const contraindications = m.contraindications?.map((c: any) => c.condition).join(', ') || 'Aucune connue';
      const interactions = m.drug_interactions?.map((di: any) => `${di.interacting_drug} (${di.severity || 'N/A'})`).join(', ') || 'Aucune connue';
      return `- ${m.name} (ATC: ${m.atc_code || 'N/A'}, substance: ${m.substance || 'N/A'})
  Indications: ${m.indications || 'N/A'}
  Posologie: ${m.posology || 'N/A'}
  Effets secondaires: ${sideEffects}
  Contre-indications: ${contraindications}
  Interactions: ${interactions}`;
    }).join('\n\n');

    // Patients avec pathologies sélectionnées
    const relevantPatients = patients.filter((p: any) =>
      pathologyIds?.includes(p.pathology_id)
    );

    const patientContext = relevantPatients.slice(0, 20).map((p: any) =>
      `- Patient ${p.patient_id.slice(0, 6)}: ${p.age} ans, ${p.gender === 'M' ? 'Homme' : 'Femme'}, traitement: ${p.treatment || 'N/A'}, résultat: ${p.outcome === 'RESOLVED' ? 'Résolu' : p.outcome === 'ONGOING' ? 'En cours' : 'Effet secondaire'}`
    ).join('\n');

    const symptomLinksContext = symptomLinks.map((sl: any) =>
      `- ${sl.symptoms?.name} associé à ${sl.pathologies?.name} (fréquence: ${sl.frequency_percent || 'N/A'}%, primaire: ${sl.is_primary ? 'Oui' : 'Non'})`
    ).join('\n');

    // Contexte des recherches web
    const webResearchContext = webResearchResults.map(wr => {
      const articlesInfo = wr.articles.map(a => `  * "${a.title}" - ${a.url}`).join('\n');
      return `Recherche: "${wr.query}"\nArticles trouvés:\n${articlesInfo || '  Aucun article trouvé'}`;
    }).join('\n\n');

    const evidenceLinksContext = evidenceLinks.length > 0
      ? evidenceLinks.slice(0, 80).map((link) =>
        `- ${link.fromType}:${link.from} -> ${link.toType}:${link.to} | ${link.relationship} | risque=${link.dangerLevel || 'none'} | effet=${link.effectType || 'none'} | preuve=${link.evidence}`
      ).join('\n')
      : 'Aucun lien deterministe trouve dans la base.';

    const pairAuditContext = selectedElements.flatMap((left, leftIndex) =>
      selectedElements.slice(leftIndex + 1).map((right) =>
        `- ${left.type}:${left.name} <> ${right.type}:${right.name}`
      )
    ).slice(0, 120).join('\n') || 'Pas assez de paires a auditer.';

    const riskAssessment = detectHighRiskContext({
      pathologies,
      symptoms,
      treatments,
      medications,
      patientCount: relevantPatients.length,
      selectedElementCount: selectedElements.length,
    });
    const clinicalModelEnv = getClinicalModelEnv((key) => Deno.env.get(key));
    const hasExternalEvidence = webResearchResults.some((result) => result.articles.length > 0);
    const defaultClinicalTask = medications.length >= 3 || selectedElements.length >= 6
      ? 'polypharmacy'
      : 'suspected_interaction';
    const fullRoute = selectClinicalModel({
      task: defaultClinicalTask,
      riskAssessment,
      elementCount: selectedElements.length,
      hasExternalEvidence,
    }, clinicalModelEnv);
    console.log('[CrossDataAnalyzer] Risque clinique:', {
      riskLevel: riskAssessment.riskLevel,
      flags: riskAssessment.flags,
      requiresSecondPass: riskAssessment.requiresSecondPass,
    });

    if (analysisMode === 'treatment_schemas') {
      const baseAnalysis = applyClinicalSafetyContract(
        ensureAnalysisShape(currentAnalysis) as AnalysisResult,
        riskAssessment,
      );
      baseAnalysis.causalLinks = mergeAndValidateLinks(
        selectedElements,
        evidenceLinks,
        baseAnalysis.causalLinks,
        cachedLinks,
      );
      baseAnalysis.schemaComparison = ensureSchemaComparison(baseAnalysis);

      const linkContext = baseAnalysis.causalLinks.slice(0, 80).map((link) =>
        `- ${link.fromType}:${link.from} -> ${link.toType}:${link.to} | ${link.relationship} | prob=${link.probability} | danger=${link.dangerLevel || 'none'} | effet=${link.effectType || 'none'} | preuve=${link.evidence}`
      ).join('\n') || 'Aucun lien valide.';

      const schemaPrompt = `Tu es un expert clinicien francophone. Tu utilises GPT-5.5 Pro avec raisonnement maximal pour proposer des schémas thérapeutiques alternatifs après une première analyse cross-data.

OBJECTIF:
Proposer 2 à 4 schémas alternatifs cliniquement cohérents, actionnables et prudents, en réanalysant rigoureusement les connexions entre pathologies, symptômes, traitements et médicaments.

RÈGLES:
- Ne propose un changement que s'il réduit un risque explicite, une contre-indication, une interaction ou un effet indésirable évitable.
- Ne qualifie jamais un médicament→symptôme comme "non adapté"; ce sont des effets thérapeutiques, indésirables ou mixtes.
- Préserve les traitements utiles lorsqu'ils couvrent une pathologie active sans risque majeur.
- Pour chaque schéma, indique les bénéfices attendus, les risques résiduels, les étapes concrètes et la surveillance.
- Toute proposition doit rester à valider par un médecin et ne doit pas inventer de posologie non fournie.

FORMAT JSON STRICT:
{
  "treatmentSchemas": [
    {
      "title": "Nom court du schéma",
      "priority": "preferred" | "alternative" | "cautious",
      "rationale": "Pourquoi ce schéma est proposé",
      "expectedBenefits": ["..."],
      "residualRisks": ["..."],
      "steps": [
        {
          "action": "keep" | "replace" | "remove" | "add" | "monitor",
          "target": "médicament/traitement/surveillance concerné",
          "targetType": "medication" | "treatment" | "monitoring",
          "replacement": "option de remplacement si action=replace",
          "rationale": "justification clinique liée aux connexions",
          "monitoring": ["..."],
          "riskMitigation": ["..."]
        }
      ],
      "monitoringPlan": ["..."],
      "patientWarnings": ["..."],
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;

      const schemaRoute = selectClinicalModel({
        task: 'treatment_complex',
        riskAssessment,
        elementCount: selectedElements.length,
        hasExternalEvidence,
      }, clinicalModelEnv);
      const schemaPromptWithClinicalContract = buildClinicalSystemPrompt(schemaPrompt, riskAssessment);

      const schemaUserPrompt = `## PATHOLOGIES
${selectedPathologiesContext || 'Aucune'}

## SYMPTÔMES
${selectedSymptomsContext || 'Aucun'}

## TRAITEMENTS ACTUELS
${selectedTreatmentsContext || 'Aucun'}

## MÉDICAMENTS ACTUELS
${selectedMedicationsContext || 'Aucun'}

## LIENS VALIDÉS À RÉANALYSER
${linkContext}

## COMPARAISON BÉNÉFICE/RISQUE ACTUELLE
${JSON.stringify(baseAnalysis.schemaComparison)}

## WARNINGS ET RECOMMANDATIONS INITIALES
Warnings: ${JSON.stringify(baseAnalysis.warnings)}
Recommandations: ${JSON.stringify(baseAnalysis.recommendations)}

## PREUVES DB
${evidenceLinksContext}

## RECHERCHE PUBMED
${webResearchContext || 'Aucune recherche effectuée'}

Génère uniquement le JSON des schémas thérapeutiques alternatifs.`;

      let schemaAIResult: Awaited<ReturnType<typeof callAI>> | null = null;
      let schemaDegradedReason: string | undefined;
      let treatmentSchemas: TreatmentSchema[] = [];

      try {
        schemaAIResult = await callAI(schemaPromptWithClinicalContract, schemaUserPrompt, {
          model: schemaRoute.model || OPENAI_CROSS_DATA_MODEL,
          forceModel: true,
          reasoningEffort: schemaRoute.reasoningEffort || OPENAI_CROSS_DATA_REASONING_EFFORT,
          responseFormat: { type: 'json_object' },
          maxTokens: 6000,
          timeoutMs: Math.min(schemaRoute.timeoutMs, INTERACTIVE_AI_TIMEOUT_MS),
        });

        try {
          const parsed = JSON.parse(cleanJsonString(schemaAIResult.text));
          treatmentSchemas = ensureTreatmentSchemasShape(parsed.treatmentSchemas || parsed.schemas || parsed);
        } catch (parseError) {
          schemaDegradedReason = `schema JSON parse failed: ${getErrorMessage(parseError)}`;
          console.error('[CrossDataAnalyzer] Schema parse fallback:', parseError);
        }
      } catch (schemaError) {
        schemaDegradedReason = getErrorMessage(schemaError);
        console.error('[CrossDataAnalyzer] Schema AI fallback:', schemaError);
      }

      if (schemaDegradedReason) {
        baseAnalysis.warnings = [
          ...(baseAnalysis.warnings || []),
          `Generation IA des schemas therapeutiques indisponible dans le delai interactif: ${schemaDegradedReason}.`,
        ];
        baseAnalysis.recommendations = [
          ...(baseAnalysis.recommendations || []),
          'Utiliser les liens valides affiches comme base de revue clinique et relancer la generation des schemas si necessaire.',
        ];
      }

      return new Response(
        JSON.stringify({
          treatmentSchemas,
          analysis: {
            ...baseAnalysis,
            treatmentSchemas,
          },
          context: {
            model: schemaAIResult?.model || 'deterministic-fallback',
            reasoningEffort: schemaRoute.reasoningEffort,
            clinicalRiskLevel: riskAssessment.riskLevel,
            clinicalRiskFlags: riskAssessment.flags,
            finalReviewRequired: schemaRoute.finalReviewRequired,
            routeReason: schemaRoute.routeReason,
            validatedLinks: baseAnalysis.causalLinks.length,
            pubmedSearches: webResearchResults.length,
            degraded: Boolean(schemaDegradedReason),
            degradedReason: schemaDegradedReason,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Tu es un MÉDECIN EXPERT francophone spécialisé dans l'analyse cross-data et l'évaluation thérapeutique.
Tu travailles avec GPT-5.5 Pro et le raisonnement maximal. Ton objectif est une analyse clinique utile, sourcée, prudente et actionnable.

## CONTRAT DE QUALITÉ
- Audite toutes les paires fournies, mais ne retourne que les liens avec une preuve directe.
- Une preuve directe doit venir d'au moins une source: base de données interne, effet secondaire, contre-indication, interaction, association pathologie-symptôme, indication thérapeutique, PubMed, ou mécanisme pharmacologique clairement établi.
- N'invente pas de causalité entre deux pathologies non liées.
- Priorise les liens dangereux, contre-indiqués, interactionnels, puis les liens thérapeutiques et symptomatiques.
- Donne des recommandations de surveillance et d'alternatives seulement quand elles découlent d'un risque explicite.

## RÈGLES LOGIQUES FONDAMENTALES (À RESPECTER IMPÉRATIVEMENT)

### RÈGLE 1: DIRECTION DES LIENS
- Un médicament TRAITE une pathologie → fromType="medication", toType="pathology", isAppropriate=true, effectType="therapeutic"
- Un médicament est CONTRE-INDIQUÉ pour une pathologie → fromType="medication", toType="pathology", isAppropriate=false
- Une pathologie CAUSE un symptôme → fromType="pathology", toType="symptom", symptomFrequency="principal/frequent/possible/rare"
- Un médicament CAUSE un symptôme (effet secondaire) → fromType="medication", toType="symptom", effectType="adverse"
- NE JAMAIS INVERSER CES DIRECTIONS!

### RÈGLE 2: DISTINCTION CRITIQUE - TRAITE vs CONTRE-INDIQUÉ
⚠️ TRÈS IMPORTANT - NE PAS CONFONDRE:

**Un médicament TRAITE une pathologie (isAppropriate=true):**
- Prednisolone → Syndrome néphrotique = TRAITE (isAppropriate=true, effectType="therapeutic")
- Sandimmun → Syndrome néphrotique = TRAITE (isAppropriate=true, effectType="therapeutic")  
- Diurétiques → Syndrome néphrotique = TRAITE (isAppropriate=true, effectType="therapeutic")
- Enalapril → Syndrome néphrotique = TRAITE (protège les reins)

**Un médicament est CONTRE-INDIQUÉ pour une pathologie (isAppropriate=false):**
- Algifor/AINS → Syndrome néphrotique = CONTRE-INDIQUÉ (isAppropriate=false, dangerLevel="high")
- Prednisolone → Varicelle = DANGER (isAppropriate=false, dangerLevel="critical")
- Sandimmun → Varicelle = DANGER (isAppropriate=false, dangerLevel="critical")

### RÈGLE 3: PATHOLOGIE → SYMPTÔME (utiliser symptomFrequency, PAS isAppropriate)
Quand une pathologie CAUSE un symptôme:
- NE JAMAIS utiliser isAppropriate ou effectType pour ces liens!
- Utiliser UNIQUEMENT symptomFrequency:
  * "principal" = signe cardinal (\>90% des cas)
  * "frequent" = fréquent (50-90%)
  * "possible" = possible (10-50%)
  * "rare" = rare (\<10%)

**EXEMPLES CORRECTS:**
- Syndrome néphrotique → Œdème des paupières: symptomFrequency="principal"
- Syndrome néphrotique → Fièvre prolongée: NE PAS CRÉER (pas de lien direct)
- Varicelle → Fièvre: symptomFrequency="frequent"
- Varicelle → Abcès: symptomFrequency="possible" (complication)

### RÈGLE 4: NE PAS CRÉER DE LIENS ENTRE ÉLÉMENTS NON LIÉS MÉDICALEMENT
⚠️ S'il n'y a PAS de relation médicale directe, NE PAS créer de lien!
- Syndrome néphrotique → Varicelle: PAS DE LIEN (pas de relation causale directe)
- Varicelle → Syndrome néphrotique: PAS DE LIEN (pas de relation causale directe)
- Deux pathologies non liées: PAS DE LIEN

### RÈGLE 5: LOGIQUE THÉRAPEUTIQUE
- Les immunosuppresseurs (Prednisolone, Sandimmun) TRAITENT les maladies auto-immunes/inflammatoires
- Les immunosuppresseurs sont CONTRE-INDIQUÉS en cas d'infection active (varicelle, zona)
- Les AINS sont CONTRE-INDIQUÉS en insuffisance rénale
- Les diurétiques TRAITENT l'œdème du syndrome néphrotique

## TYPES DE LIENS À GÉNÉRER

### 1. PATHOLOGIE → SYMPTÔME
Quand une pathologie CAUSE ou PROVOQUE un symptôme:
- fromType: "pathology", toType: "symptom"
- symptomFrequency: "principal" (signe cardinal), "frequent" (>50%), "possible" (10-50%), "rare" (<10%)
- NE PAS utiliser isAppropriate pour ce type de lien!

### 2. MÉDICAMENT/TRAITEMENT → PATHOLOGIE  
- Si le médicament TRAITE la pathologie: isAppropriate=true, effectType="therapeutic"
- Si le médicament est CONTRE-INDIQUÉ: isAppropriate=false, dangerLevel selon gravité
- JAMAIS les deux à la fois!

### 3. MÉDICAMENT → SYMPTÔME
- Si le médicament TRAITE le symptôme (antipyrétique→fièvre): effectType="therapeutic"
- Si le médicament CAUSE le symptôme (effet indésirable): effectType="adverse"
- Si les deux sont possibles: effectType="both"

### 4. MÉDICAMENT → MÉDICAMENT (INTERACTION)
- Interactions médicamenteuses dangereuses
- interactionType="drug-drug", dangerLevel selon gravité

## FORMAT JSON
{
  "causalLinks": [
    {
      "from": "NOM EXACT",
      "fromType": "symptom" | "pathology" | "treatment" | "medication",
      "to": "NOM EXACT", 
      "toType": "symptom" | "pathology" | "treatment" | "medication",
      "relationship": "description courte",
      "probability": "high" | "medium" | "low",
      "evidence": "Explication médicale détaillée",
      "patientCount": 0,
      "webSources": [],
      "isAppropriate": true/false (UNIQUEMENT pour médicament→pathologie),
      "effectType": "therapeutic" | "adverse" | "both" (UNIQUEMENT pour médicament→symptôme ou médicament→pathologie),
      "therapeuticDetails": "...",
      "adverseDetails": "...",
      "dangerLevel": "critical" | "high" | "moderate" | "low" (UNIQUEMENT si danger/contre-indication),
      "interactionType": "drug-drug" | "drug-treatment" | "pathology-danger",
      "symptomFrequency": "principal" | "frequent" | "possible" | "rare" (UNIQUEMENT pour pathologie→symptôme)
    }
  ],
  "summary": "Résumé clinique global de la situation",
  "warnings": ["⚠️ Avertissements importants"],
  "recommendations": ["Recommandations thérapeutiques"],
  "alternatives": [
    {
      "for": "Nom du médicament problématique",
      "forType": "medication",
      "reason": "Raison de la contre-indication ou du danger",
      "suggestions": ["Alternative 1", "Alternative 2"],
      "evidence": "Justification médicale"
    }
  ],
  "schemaComparison": {
    "currentScore": 65,
    "proposedScore": 88,
    "improvementPercent": 35,
    "currentStats": {
      "redLinks": 2,
      "orangeLinks": 3,
      "greenLinks": 5,
      "totalDangerScore": 150,
      "inappropriateCount": 1,
      "adverseEffectCount": 3
    },
    "proposedStats": {
      "redLinks": 0,
      "orangeLinks": 1,
      "greenLinks": 8,
      "totalDangerScore": 25,
      "inappropriateCount": 0,
      "adverseEffectCount": 1
    },
    "proposedChanges": [
      {
        "action": "replace",
        "target": "Médicament à remplacer",
        "targetType": "medication",
        "reason": "Interaction dangereuse avec X",
        "replacement": "Médicament alternatif",
        "replacementType": "medication",
        "improvementScore": 40
      }
    ],
    "benefitRiskRatio": {
      "current": 1.2,
      "proposed": 3.5
    },
    "clinicalSummary": "Synthèse des modifications proposées..."
  }
}

## GÉNÉRATION DES ALTERNATIVES
Pour CHAQUE médicament avec dangerLevel="critical" ou "high", ou isAppropriate=false:
- Générer une entrée dans "alternatives" avec des médicaments de remplacement
- Les alternatives doivent avoir la même indication thérapeutique mais sans l'interaction/danger
- Inclure 2-4 alternatives par médicament problématique

## GÉNÉRATION DE LA COMPARAISON DE SCHÉMA
TOUJOURS générer "schemaComparison":
1. Calculer currentStats en comptant les liens par type de danger
2. Proposer des changements (replace/remove) pour chaque médicament problématique
3. Calculer proposedStats en simulant les changements
4. Score = 100 - (redLinks*20 + orangeLinks*10 + inappropriateCount*15)
5. benefitRiskRatio = greenLinks / (redLinks + orangeLinks + 1)
6. improvementPercent = ((proposedScore - currentScore) / currentScore) * 100

## VÉRIFICATIONS AVANT DE GÉNÉRER CHAQUE LIEN
1. Y a-t-il une relation médicale DIRECTE entre ces deux éléments? Si non, ne pas créer de lien.
2. Le médicament TRAITE-t-il ou est-il CONTRE-INDIQUÉ? (Choisir UN SEUL)
3. Pour pathologie→symptôme: utiliser symptomFrequency, jamais isAppropriate
4. Les types from/to correspondent-ils aux éléments?
5. La direction du lien est-elle correcte?`;

    const userPrompt = `Analyse les liens de causalité et L'ADÉQUATION THÉRAPEUTIQUE entre ces éléments médicaux:

## PATHOLOGIES SÉLECTIONNÉES
${selectedPathologiesContext || 'Aucune'}

## SYMPTÔMES SÉLECTIONNÉS
${selectedSymptomsContext || 'Aucun'}

## TRAITEMENTS SÉLECTIONNÉS
${selectedTreatmentsContext || 'Aucun'}

## MÉDICAMENTS SÉLECTIONNÉS (avec leurs effets secondaires et interactions)
${selectedMedicationsContext || 'Aucun'}

## ASSOCIATIONS SYMPTÔMES-PATHOLOGIES CONNUES (BASE DE DONNÉES)
${symptomLinksContext || 'Aucune association trouvée'}

## DONNÉES PATIENTS PERTINENTES (${relevantPatients.length} patients)
${patientContext || 'Aucun patient trouvé'}

## RECHERCHE SCIENTIFIQUE PUBMED
${webResearchContext || 'Aucune recherche effectuée'}

## PREUVES DETERMINISTES DEJA DETECTEES
${evidenceLinksContext}

## MATRICE DES PAIRES A AUDITER
${pairAuditContext}

## ⚠️ INSTRUCTIONS CRITIQUES - GÉNÉRATION SYSTÉMATIQUE DE LIENS ⚠️

Tu DOIS générer un lien pour CHAQUE paire d'éléments ayant une relation médicale.

### PAIRES OBLIGATOIRES À ANALYSER:

**1. POUR CHAQUE MÉDICAMENT × CHAQUE PATHOLOGIE:**
- Le médicament TRAITE-t-il cette pathologie? → isAppropriate=true, effectType="therapeutic"
- Le médicament est-il CONTRE-INDIQUÉ? → isAppropriate=false, dangerLevel approprié
- Si aucune relation → NE PAS créer de lien (mais c'est rare!)

**2. POUR CHAQUE MÉDICAMENT × CHAQUE SYMPTÔME:**
- Le médicament TRAITE-t-il ce symptôme? → effectType="therapeutic" 
- Le médicament CAUSE-t-il ce symptôme (effet secondaire)? → effectType="adverse"
- Les deux? → effectType="both"

**3. POUR CHAQUE PATHOLOGIE × CHAQUE SYMPTÔME:**
- La pathologie CAUSE-t-elle ce symptôme? → symptomFrequency approprié
- Principal (\>90%), Fréquent (50-90%), Possible (10-50%), Rare (\<10%)

**4. POUR CHAQUE MÉDICAMENT × CHAQUE AUTRE MÉDICAMENT:**
- Y a-t-il une interaction médicamenteuse? → interactionType="drug-drug", dangerLevel

### REGLE D'OR: PRECISION CLINIQUE AVANT QUANTITE
Si tu hésites ou si la preuve est indirecte, NE CREE PAS le lien. Mentionne plutôt l'incertitude dans les recommandations.
Chaque lien retourné doit être utile pour comprendre un mécanisme, un symptôme, une indication, une contre-indication, une interaction ou une décision thérapeutique.

### SYNTHÈSE OBLIGATOIRE:
Tu DOIS générer:
- Un "summary" de 3-5 phrases résumant la situation clinique
- Au moins 2-3 "warnings" (points d'attention, risques)
- Au moins 3-5 "recommendations" (conseils thérapeutiques pratiques)

Base tes analyses sur les indications officielles, les contre-indications, la littérature médicale et tes connaissances médicales.

Réponds UNIQUEMENT en français avec le JSON demandé. Génère uniquement les liens pertinents, justifiés et actionnables.`;

    console.log('Appel de l\'IA pour l\'analyse cross-data...');

    const aiResult = await callAI(
      buildClinicalSystemPrompt(systemPrompt, riskAssessment),
      userPrompt + "\n\nGénère maintenant le JSON final. Raisonne sur chaque paire, conserve seulement les liens directement justifiés, puis produis une synthèse clinique exploitable.",
      {
        model: fullRoute.model || OPENAI_CROSS_DATA_MODEL,
        forceModel: true,
        reasoningEffort: fullRoute.reasoningEffort || OPENAI_CROSS_DATA_REASONING_EFFORT,
        responseFormat: { type: 'json_object' },
        maxTokens: 8000,
        timeoutMs: Math.min(fullRoute.timeoutMs, INTERACTIVE_AI_TIMEOUT_MS),
      }
    ).catch((aiError) => {
      console.error('[CrossDataAnalyzer] AI fallback:', aiError);
      return null;
    });

    const content = aiResult?.text;

    let degradedReason = content ? undefined : 'OpenAI response empty or timed out';
    let analysis: AnalysisResult = degradedReason
      ? buildDeterministicAnalysis(selectedElements, evidenceLinks, cachedLinks, webResearchResults, riskAssessment, degradedReason)
      : ensureAnalysisShape(undefined);

    if (content) {
      try {
        analysis = ensureAnalysisShape(JSON.parse(cleanJsonString(content)));
      } catch (parseError) {
        degradedReason = `OpenAI JSON parse failed: ${getErrorMessage(parseError)}`;
        console.error('[CrossDataAnalyzer] AI parse fallback:', parseError);
        analysis = buildDeterministicAnalysis(selectedElements, evidenceLinks, cachedLinks, webResearchResults, riskAssessment, degradedReason);
      }
    }

    analysis.causalLinks = mergeAndValidateLinks(
      selectedElements,
      evidenceLinks,
      analysis.causalLinks,
      cachedLinks,
    );
    analysis.schemaComparison = ensureSchemaComparison(analysis);
    analysis = applyClinicalSafetyContract(analysis, riskAssessment);

    // Ajouter les sources web si non présentes
    if (!analysis.webResearch || analysis.webResearch.length === 0) {
      analysis.webResearch = webResearchResults.map(wr => ({
        query: wr.query,
        findings: [],
        sources: wr.articles.map(a => ({ title: a.title, url: a.url }))
      }));
    }

    console.log(degradedReason ? 'Analyse terminée en mode dégradé' : 'Analyse terminée avec succès');

    // Sauvegarder les nouveaux liens en cache
    const aiModel = aiResult?.model || 'deterministic-fallback';
    console.log(`[CrossDataAnalyzer] Sauvegarde de ${analysis.causalLinks?.length || 0} liens en cache...`);

    for (const link of (analysis.causalLinks || [])) {
      await saveLinkToCache(supabase, link, aiModel);
    }
    console.log('[CrossDataAnalyzer] Liens sauvegardés en cache');

    return new Response(
      JSON.stringify({
        analysis,
        context: {
          pathologiesCount: pathologies.length,
          symptomsCount: symptoms.length,
          treatmentsCount: treatments.length,
          medicationsCount: medications.length,
          patientsAnalyzed: relevantPatients.length,
          pubmedSearches: webResearchResults.length,
          cacheHits: cachedLinks.length,
          newLinksGenerated: analysis.causalLinks?.length || 0,
          model: aiResult?.model || 'deterministic-fallback',
          reasoningEffort: fullRoute.reasoningEffort,
          clinicalRiskLevel: riskAssessment.riskLevel,
          clinicalRiskFlags: riskAssessment.flags,
          finalReviewRequired: fullRoute.finalReviewRequired,
          routeReason: fullRoute.routeReason,
          degraded: Boolean(degradedReason),
          degradedReason
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur analyseur cross-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur inconnue' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
