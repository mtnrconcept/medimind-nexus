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
      `- Patient ${p.patient_id.slice(0,6)}: ${p.age} ans, ${p.gender === 'M' ? 'Homme' : 'Femme'}, traitement: ${p.treatment || 'N/A'}, résultat: ${p.outcome === 'RESOLVED' ? 'Résolu' : p.outcome === 'ONGOING' ? 'En cours' : 'Effet secondaire'}`
    ).join('\n');

    const symptomLinksContext = symptomLinks.map((sl: any) => 
      `- ${sl.symptoms?.name} associé à ${sl.pathologies?.name} (fréquence: ${sl.frequency_percent || 'N/A'}%, primaire: ${sl.is_primary ? 'Oui' : 'Non'})`
    ).join('\n');

    // Contexte des recherches web
    const webResearchContext = webResearchResults.map(wr => {
      const articlesInfo = wr.articles.map(a => `  * "${a.title}" - ${a.url}`).join('\n');
      return `Recherche: "${wr.query}"\nArticles trouvés:\n${articlesInfo || '  Aucun article trouvé'}`;
    }).join('\n\n');

const systemPrompt = `Tu es un expert médical francophone spécialisé dans l'analyse cross-data et l'évaluation thérapeutique. Tu analyses les corrélations entre symptômes, pathologies, traitements ET médicaments.

IMPORTANT: Tu dois TOUJOURS répondre en FRANÇAIS.

## RÈGLE CRITIQUE - TYPES DE TRAITEMENTS À CONSIDÉRER

Les traitements peuvent être de plusieurs types, TOUS sont valides et potentiellement adaptés:
1. **Traitements médicamenteux** (antidépresseurs, anxiolytiques, etc.)
2. **Traitements comportementaux/mode de vie** - TRÈS IMPORTANTS pour les pathologies psychiatriques:
   - Abstinence d'alcool → ADAPTÉ pour dépression, anxiété (l'alcool aggrave ces conditions)
   - Arrêt du tabac → ADAPTÉ pour de nombreuses pathologies
   - Exercice physique → ADAPTÉ pour dépression, anxiété
   - Amélioration du sommeil → ADAPTÉ pour dépression, troubles cognitifs
   - Régime alimentaire → ADAPTÉ pour diabète, maladies cardiovasculaires
3. **Psychothérapies** (TCC, psychanalyse, etc.)
4. **Interventions chirurgicales**

ATTENTION: L'abstinence d'alcool EST un traitement ADAPTÉ pour la dépression car:
- L'alcool est un dépresseur du système nerveux central
- L'alcool interfère avec les traitements antidépresseurs
- L'abstinence améliore significativement les symptômes dépressifs

## RÈGLE CRITIQUE - DISTINCTION EFFET THÉRAPEUTIQUE vs EFFET INDÉSIRABLE

Quand un MÉDICAMENT ou TRAITEMENT est lié à un SYMPTÔME, tu DOIS distinguer clairement:
- **effectType: "therapeutic"** = Le traitement TRAITE/SOULAGE ce symptôme (c'est son indication)
- **effectType: "adverse"** = Le traitement CAUSE/PROVOQUE ce symptôme comme effet secondaire
- **effectType: "both"** = Le traitement peut À LA FOIS traiter ET causer ce symptôme

Pour les liens avec effectType "both", tu DOIS remplir:
- therapeuticDetails: explication de l'effet thérapeutique (comment il traite)
- adverseDetails: explication de l'effet indésirable (comment il peut causer)

## OBJECTIFS PRINCIPAUX

1. **L'ADÉQUATION TRAITEMENT/PATHOLOGIE**: Pour chaque combinaison traitement-pathologie ou médicament-pathologie, indique clairement si c'est ADAPTÉ (isAppropriate: true), ou NON ADAPTÉ (isAppropriate: false). Les traitements comportementaux comme l'abstinence d'alcool sont ADAPTÉS pour les troubles psychiatriques!
2. **DISTINCTION TRAITE vs CAUSE**: Pour chaque lien traitement/médicament-symptôme, indique si ça TRAITE ou CAUSE le symptôme (ou les deux!)
3. Les interactions entre médicaments et traitements
4. Les contre-indications par rapport aux pathologies sélectionnées
5. Les preuves scientifiques issues de PubMed

Tu DOIS répondre UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "causalLinks": [
    {
      "from": "nom de l'élément source",
      "fromType": "symptom" | "pathology" | "treatment" | "medication",
      "to": "nom de l'élément cible",
      "toType": "symptom" | "pathology" | "treatment" | "medication",
      "relationship": "description courte du lien en français",
      "probability": "high" | "medium" | "low",
      "evidence": "explication détaillée basée sur les données médicales, en français",
      "patientCount": nombre de patients où ce lien est observé (0 si non applicable),
      "webSources": ["URL des sources pertinentes"],
      "isAppropriate": true ou false (pour les liens traitement/médicament vers pathologie - les traitements mode de vie sont souvent ADAPTÉS!),
      "effectType": "therapeutic" | "adverse" | "both" (OBLIGATOIRE pour liens médicament/traitement → symptôme),
      "therapeuticDetails": "description de l'effet thérapeutique (si effectType est therapeutic ou both)",
      "adverseDetails": "description de l'effet indésirable avec fréquence si connue (si effectType est adverse ou both)"
    }
  ],
  "summary": "résumé global de l'analyse en 2-3 phrases, avec une conclusion claire sur l'adéquation des traitements aux pathologies, en français",
  "warnings": ["avertissement critique 1 en français", "avertissement 2 en français"],
  "recommendations": ["recommandation thérapeutique 1 en français", "recommandation 2 en français"],
  "webResearch": [
    {
      "query": "requête de recherche",
      "findings": ["découverte médicale 1 en français", "découverte 2 en français"],
      "sources": [{"title": "titre de l'article", "url": "URL"}]
    }
  ]
}`;

const userPrompt = `Analyse les liens de causalité et L'ADÉQUATION THÉRAPEUTIQUE entre ces éléments médicaux:

## PATHOLOGIES SÉLECTIONNÉES
${selectedPathologiesContext || 'Aucune'}

## SYMPTÔMES SÉLECTIONNÉS (peuvent être des effets indésirables OU des indications de traitement)
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

ANALYSE REQUISE:
1. **PRIORITÉ 1 - ADÉQUATION TRAITEMENT/PATHOLOGIE**: Pour chaque traitement ou médicament sélectionné, évalue s'il est ADAPTÉ, PARTIELLEMENT ADAPTÉ ou NON ADAPTÉ pour chaque pathologie sélectionnée. Utilise isAppropriate=true/false.

2. **PRIORITÉ 2 - DISTINCTION TRAITE vs CAUSE (CRITIQUE!)**: Pour chaque lien entre un médicament/traitement et un symptôme:
   - Si le médicament TRAITE ce symptôme → effectType: "therapeutic", remplis therapeuticDetails
   - Si le médicament CAUSE ce symptôme (effet secondaire) → effectType: "adverse", remplis adverseDetails
   - Si le médicament peut FAIRE LES DEUX (ex: Fentanyl traite la douleur mais peut causer des maux de tête) → effectType: "both", remplis therapeuticDetails ET adverseDetails

3. **PRIORITÉ 3 - INTERACTIONS**: Y a-t-il des interactions dangereuses entre les médicaments sélectionnés ?

4. **PRIORITÉ 4 - CONTRE-INDICATIONS**: Y a-t-il des contre-indications par rapport aux pathologies ?

Base tes analyses sur les indications officielles, les contre-indications, la littérature médicale (PubMed) et tes connaissances médicales.

Réponds UNIQUEMENT en français avec le JSON demandé.`;

    console.log('Appel de OpenAI pour l\'analyse cross-data...');

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY non configurée');
    }

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Erreur API IA:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requêtes atteinte. Veuillez réessayer dans quelques instants.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Crédits insuffisants. Veuillez recharger votre compte.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erreur API IA: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Aucun contenu dans la réponse IA');
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
