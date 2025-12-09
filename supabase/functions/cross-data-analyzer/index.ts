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
}

interface AnalysisResult {
  causalLinks: CausalLink[];
  summary: string;
  warnings: string[];
  recommendations: string[];
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

    const systemPrompt = `Tu es un expert médical francophone spécialisé dans l'analyse cross-data et l'évaluation thérapeutique.

RÈGLE ABSOLUE: Analyse UNIQUEMENT les éléments fournis dans la liste. Ne génère JAMAIS de liens avec des éléments qui ne sont pas explicitement listés.

## TYPES DE LIENS À GÉNÉRER

### TYPE 1: MÉDICAMENT/TRAITEMENT → PATHOLOGIE
Pour chaque médicament/traitement ET pathologie sélectionnés:
- from: nom exact du médicament/traitement (fromType: "medication"/"treatment")
- to: nom exact de la pathologie (toType: "pathology")
- isAppropriate: TRUE si le médicament TRAITE cette pathologie
- isAppropriate: FALSE si le médicament est CONTRE-INDIQUÉ pour cette pathologie
- Si contre-indiqué, ajouter dangerLevel et adverseDetails

### TYPE 2: PATHOLOGIE → SYMPTÔME
Si une pathologie sélectionnée CAUSE un symptôme sélectionné:
- from: nom de la pathologie (fromType: "pathology")
- to: nom du symptôme (toType: "symptom")
- probability selon la fréquence du symptôme dans cette pathologie

### TYPE 3: MÉDICAMENT → SYMPTÔME (Effets indésirables)
Si un médicament peut CAUSER un symptôme sélectionné:
- effectType: "adverse"
- adverseDetails: description de l'effet

### TYPE 4: INTERACTIONS MÉDICAMENTEUSES
Si deux médicaments sélectionnés peuvent interagir:
- from/to: les deux médicaments (fromType/toType: "medication")
- interactionType: "drug-drug"
- dangerLevel selon gravité

### TYPE 5: DANGERS COMBINÉS
Si un médicament immunosuppresseur ET une pathologie infectieuse sont tous deux sélectionnés:
- Créer un lien de danger
- dangerLevel: "critical" ou "high"

## FORMAT DE RÉPONSE JSON

{
  "causalLinks": [
    {
      "from": "nom EXACT de l'élément tel que fourni",
      "fromType": "symptom" | "pathology" | "treatment" | "medication",
      "to": "nom EXACT de l'élément tel que fourni", 
      "toType": "symptom" | "pathology" | "treatment" | "medication",
      "relationship": "description courte",
      "probability": "high" | "medium" | "low",
      "evidence": "explication détaillée",
      "patientCount": 0,
      "webSources": [],
      "isAppropriate": true ou false (OBLIGATOIRE pour liens médicament→pathologie),
      "effectType": "therapeutic" | "adverse" | "both",
      "therapeuticDetails": "si therapeutic",
      "adverseDetails": "si adverse ou contre-indiqué",
      "dangerLevel": "critical" | "high" | "moderate" | "low",
      "interactionType": "drug-drug" | "drug-treatment" | "pathology-danger"
    }
  ],
  "summary": "résumé de l'analyse",
  "warnings": ["avertissements"],
  "recommendations": ["recommandations"],
  "webResearch": []
}

## RÈGLES CRITIQUES
1. N'utilise QUE les éléments listés dans les sections ci-dessous
2. Ne génère PAS de liens avec des éléments non listés
3. Utilise les noms EXACTS tels que fournis`;

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

## ANALYSES OBLIGATOIRES - GÉNÈRE UN LIEN POUR CHAQUE:

### 1. LIENS PATHOLOGIE → SYMPTÔME (OBLIGATOIRE!)
Si une pathologie peut CAUSER un symptôme sélectionné, crée un lien:
- from: nom de la pathologie, fromType: "pathology"
- to: nom du symptôme, toType: "symptom"
- relationship: "cause typiquement" ou "peut provoquer"
- probability: selon la fréquence du symptôme dans cette pathologie

EXEMPLE CRITIQUE: Si "syndrome néphrotique" et "œdème" sont sélectionnés → CRÉE LE LIEN! Le syndrome néphrotique cause l'œdème par hypoalbuminémie.

### 2. DANGERS INFECTION + IMMUNOSUPPRESSION (OBLIGATOIRE!)
Si une INFECTION VIRALE (varicelle, zona, etc.) ET des IMMUNOSUPPRESSEURS/CORTICOÏDES sont sélectionnés:
- Crée un lien de DANGER entre le médicament immunosuppresseur et la pathologie infectieuse
- probability: "high", dangerLevel: "critical"
- Explique le risque de forme grave/disséminée

EXEMPLE CRITIQUE: Si "varicelle" et "prednisolone" sont sélectionnés → CRÉE UN WARNING! La varicelle sous corticoïdes peut être mortelle.

### 3. CONTRE-INDICATIONS MÉDICAMENTS + PATHOLOGIE RÉNALE (OBLIGATOIRE!)
Si des AINS (Algifor, ibuprofène) ET une pathologie rénale sont sélectionnés:
- isAppropriate: false
- Explique que les AINS aggravent la fonction rénale

### 4. ADÉQUATION TRAITEMENT/PATHOLOGIE
Pour chaque médicament/traitement et chaque pathologie:
- isAppropriate: true si c'est un traitement indiqué
- isAppropriate: false si c'est contre-indiqué

### 5. DISTINCTION TRAITE vs CAUSE SYMPTÔME
Pour chaque médicament et symptôme:
- effectType: "therapeutic" si le médicament traite ce symptôme
- effectType: "adverse" si le médicament cause ce symptôme
- effectType: "both" si les deux sont possibles

Base tes analyses sur les indications officielles, les contre-indications, la littérature médicale (PubMed) et tes connaissances médicales.

Réponds UNIQUEMENT en français avec le JSON demandé. N'OUBLIE AUCUN LIEN PERTINENT!`;

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
        model: 'claude-3-haiku-20240307', // Haiku pour plus de rapidité
        max_tokens: 4000,
        messages: [{ role: 'user', content: systemPrompt + "\n\n" + userPrompt }]
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

    return new Response(
      JSON.stringify({
        analysis,
        context: {
          pathologiesCount: pathologies.length,
          symptomsCount: symptoms.length,
          treatmentsCount: treatments.length,
          medicationsCount: medications.length,
          patientsAnalyzed: relevantPatients.length,
          pubmedSearches: webResearchResults.length
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
