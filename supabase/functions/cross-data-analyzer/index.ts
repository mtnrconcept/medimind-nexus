import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  webResearch: {
    query: string;
    findings: string[];
    sources: { title: string; url: string }[];
  }[];
}


// Fonction pour rechercher sur PubMed
async function searchPubMed(query: string, maxResults: number = 5): Promise<{ title: string; url: string; abstract: string }[]> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    const ids = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) return [];

    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
    const fetchResponse = await fetch(fetchUrl);
    const fetchData = await fetchResponse.json();

    const articles: { title: string; url: string; abstract: string }[] = [];
    for (const id of ids) {
      const article = fetchData?.result?.[id];
      if (article) {
        articles.push({
          title: article.title || "Sans titre",
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          abstract: article.elocationid || ""
        });
      }
    }
    return articles;
  } catch (error) {
    console.error('PubMed search error:', error);
    return [];
  }
}

// Fonction pour générer un hash de requête (pour le cache)
function generateRequestHash(pathologyIds: string[], symptomIds: string[], treatmentIds: string[], medicationIds: string[]): string {
  const sorted = [
    ...pathologyIds.sort(),
    ...symptomIds.sort(),
    ...treatmentIds.sort(),
    ...medicationIds.sort()
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
    const pairHash = [link.from, link.fromType, link.to, link.toType]
      .map(s => s.toLowerCase())
      .sort()
      .join('|');

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
    const { pathologyIds, symptomIds, treatmentIds, medicationIds } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer les données sélectionnées (incluant les médicaments)
    const [pathologiesRes, symptomsRes, treatmentsRes, medicationsRes, patientsRes] = await Promise.all([
      pathologyIds?.length > 0
        ? supabase.from('pathologies').select('*').in('id', pathologyIds)
        : Promise.resolve({ data: [] }),
      symptomIds?.length > 0
        ? supabase.from('symptoms').select('*').in('id', symptomIds)
        : Promise.resolve({ data: [] }),
      treatmentIds?.length > 0
        ? supabase.from('treatments').select('*, pathologies(name)').in('id', treatmentIds)
        : Promise.resolve({ data: [] }),
      medicationIds?.length > 0
        ? supabase.from('medications').select('*, side_effects(*), contraindications(*), drug_interactions(*)').in('id', medicationIds)
        : Promise.resolve({ data: [] }),
      supabase.from('patients').select('*, pathologies(name)')
    ]);

    const pathologies = pathologiesRes.data || [];
    const symptoms = symptomsRes.data || [];
    const treatments = treatmentsRes.data || [];
    const medications = medicationsRes.data || [];
    const patients = patientsRes.data || [];

    // Préparer la liste des éléments pour la recherche en cache
    const allElements: { name: string; type: string }[] = [
      ...pathologies.map((p: any) => ({ name: p.name, type: 'pathology' })),
      ...symptoms.map((s: any) => ({ name: s.name, type: 'symptom' })),
      ...treatments.map((t: any) => ({ name: t.name, type: 'treatment' })),
      ...medications.map((m: any) => ({ name: m.name, type: 'medication' })),
    ];

    // Rechercher les liens existants en cache
    console.log('[CrossDataAnalyzer] Recherche dans le cache...');
    const cachedLinks = await findCachedLinks(supabase, allElements);
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

    // Limiter à 5 recherches maximum
    const limitedQueries = webSearchQueries.slice(0, 5);

    console.log('Exécution des recherches PubMed:', limitedQueries);

    // Exécuter les recherches PubMed en parallèle
    const webResearchResults = await Promise.all(
      limitedQueries.map(async (query) => {
        const articles = await searchPubMed(query, 3);
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

    const systemPrompt = `Tu es un MÉDECIN EXPERT francophone spécialisé dans l'analyse cross-data et l'évaluation thérapeutique.

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

### RÈGLE D'OR: MIEUX VAUT TROP DE LIENS QUE PAS ASSEZ!
Si tu hésites, CRÉE LE LIEN avec une probabilité "low" ou "medium".

### SYNTHÈSE OBLIGATOIRE:
Tu DOIS générer:
- Un "summary" de 3-5 phrases résumant la situation clinique
- Au moins 2-3 "warnings" (points d'attention, risques)
- Au moins 3-5 "recommendations" (conseils thérapeutiques pratiques)

Base tes analyses sur les indications officielles, les contre-indications, la littérature médicale et tes connaissances médicales.

Réponds UNIQUEMENT en français avec le JSON demandé. GÉNÈRE LE MAXIMUM DE LIENS PERTINENTS!`;

    console.log('Appel de Claude AI pour l\'analyse cross-data...');

    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY');
    if (!CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY non configurée');
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5-20251101', // Claude Opus 4.5 - Performance maximale
        max_tokens: 8000,
        messages: [
          { role: 'user', content: systemPrompt + "\n\n" + userPrompt + "\n\nGénère maintenant le JSON avec TOUS les liens pertinents. Réfléchis bien à chaque relation médicale avant de répondre." }
        ]
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Erreur API Claude:', aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requêtes atteinte. Veuillez réessayer dans quelques instants.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Erreur API Claude: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.content?.[0]?.text;

    if (!content) {
      throw new Error('Aucun contenu dans la réponse Claude');
    }

    // Parser le JSON de la réponse
    let analysis: AnalysisResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Aucun JSON trouvé dans la réponse');
      }
    } catch (parseError) {
      console.error('Erreur de parsing JSON:', parseError, 'Contenu:', content);
      analysis = {
        causalLinks: [],
        summary: "L'analyse n'a pas pu être complétée correctement.",
        warnings: ["Erreur de parsing de la réponse IA"],
        recommendations: ["Veuillez réessayer l'analyse"],
        alternatives: [],
        webResearch: []
      };
    }

    // Ajouter les sources web si non présentes
    if (!analysis.webResearch || analysis.webResearch.length === 0) {
      analysis.webResearch = webResearchResults.map(wr => ({
        query: wr.query,
        findings: [],
        sources: wr.articles.map(a => ({ title: a.title, url: a.url }))
      }));
    }

    console.log('Analyse terminée avec succès');

    // Sauvegarder les nouveaux liens en cache
    const aiModel = 'claude-opus-4-5-20251101';
    console.log(`[CrossDataAnalyzer] Sauvegarde de ${analysis.causalLinks?.length || 0} liens en cache...`);

    for (const link of (analysis.causalLinks || [])) {
      await saveLinkToCache(supabase, link, aiModel);
    }
    console.log('[CrossDataAnalyzer] Liens sauvegardés en cache');

    // Fusionner avec les liens du cache existants (éviter les doublons)
    const existingFromTo = new Set(
      (analysis.causalLinks || []).map((l: CausalLink) => `${l.from}|${l.to}`)
    );

    const mergedLinks = [
      ...(analysis.causalLinks || []),
      ...cachedLinks.filter((cl: CausalLink) => !existingFromTo.has(`${cl.from}|${cl.to}`))
    ];

    return new Response(
      JSON.stringify({
        analysis: {
          ...analysis,
          causalLinks: mergedLinks,
        },
        context: {
          pathologiesCount: pathologies.length,
          symptomsCount: symptoms.length,
          treatmentsCount: treatments.length,
          medicationsCount: medications.length,
          patientsAnalyzed: relevantPatients.length,
          pubmedSearches: webResearchResults.length,
          cacheHits: cachedLinks.length,
          newLinksGenerated: analysis.causalLinks?.length || 0
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
