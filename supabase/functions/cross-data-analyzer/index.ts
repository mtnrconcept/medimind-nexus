import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CausalLink {
  from: string;
  fromType: 'symptom' | 'pathology' | 'treatment';
  to: string;
  toType: 'symptom' | 'pathology' | 'treatment';
  relationship: string;
  probability: 'high' | 'medium' | 'low';
  evidence: string;
  patientCount: number;
  webSources: string[];
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
    const { pathologyIds, symptomIds, treatmentIds } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer les données sélectionnées
    const [pathologiesRes, symptomsRes, treatmentsRes, patientsRes] = await Promise.all([
      pathologyIds?.length > 0 
        ? supabase.from('pathologies').select('*').in('id', pathologyIds)
        : Promise.resolve({ data: [] }),
      symptomIds?.length > 0
        ? supabase.from('symptoms').select('*').in('id', symptomIds)
        : Promise.resolve({ data: [] }),
      treatmentIds?.length > 0
        ? supabase.from('treatments').select('*, pathologies(name)').in('id', treatmentIds)
        : Promise.resolve({ data: [] }),
      supabase.from('patients').select('*, pathologies(name)')
    ]);

    const pathologies = pathologiesRes.data || [];
    const symptoms = symptomsRes.data || [];
    const treatments = treatmentsRes.data || [];
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
        webSearchQueries.push(`${pathology.name} ${treatment.name} interaction effets secondaires`);
      }
      for (const symptom of symptoms) {
        webSearchQueries.push(`${pathology.name} ${symptom.name} corrélation causalité`);
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
      for (const t of treatments) webSearchQueries.push(`${t.name} effets secondaires interactions`);
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
      `- ${t.name} (type: ${t.type || 'N/A'}, pour: ${t.pathologies?.name || 'N/A'}): ${t.description || ''}\n  Contre-indications: ${t.contraindications?.join(', ') || 'Aucune connue'}`
    ).join('\n');

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

    const systemPrompt = `Tu es un expert médical francophone spécialisé dans l'analyse cross-data. Tu analyses les corrélations et liens de causalité entre symptômes, pathologies et traitements.

IMPORTANT: Tu dois TOUJOURS répondre en FRANÇAIS.

Ton objectif est d'identifier:
1. Les liens de causalité potentiels entre les éléments sélectionnés
2. Si un symptôme pourrait être causé par un traitement (effet secondaire)
3. Si une pathologie peut causer une autre pathologie
4. Si un traitement peut aggraver ou masquer des symptômes
5. Les patterns observés dans les données patients
6. Les preuves scientifiques issues de la littérature médicale (PubMed)

Tu DOIS répondre UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "causalLinks": [
    {
      "from": "nom de l'élément source",
      "fromType": "symptom" | "pathology" | "treatment",
      "to": "nom de l'élément cible",
      "toType": "symptom" | "pathology" | "treatment",
      "relationship": "description courte du lien en français",
      "probability": "high" | "medium" | "low",
      "evidence": "explication détaillée basée sur les données et la recherche web, en français",
      "patientCount": nombre de patients où ce lien est observé,
      "webSources": ["URL des sources pertinentes"]
    }
  ],
  "summary": "résumé global de l'analyse en 2-3 phrases, en français",
  "warnings": ["avertissement 1 en français", "avertissement 2 en français"],
  "recommendations": ["recommandation 1 en français", "recommandation 2 en français"],
  "webResearch": [
    {
      "query": "requête de recherche",
      "findings": ["découverte 1 en français", "découverte 2 en français"],
      "sources": [{"title": "titre de l'article", "url": "URL"}]
    }
  ]
}`;

    const userPrompt = `Analyse les liens de causalité entre ces éléments médicaux en utilisant à la fois les données patients et la recherche scientifique:

## PATHOLOGIES SÉLECTIONNÉES
${selectedPathologiesContext || 'Aucune'}

## SYMPTÔMES SÉLECTIONNÉS
${selectedSymptomsContext || 'Aucun'}

## TRAITEMENTS SÉLECTIONNÉS
${selectedTreatmentsContext || 'Aucun'}

## ASSOCIATIONS SYMPTÔMES-PATHOLOGIES CONNUES (BASE DE DONNÉES)
${symptomLinksContext || 'Aucune association trouvée'}

## DONNÉES PATIENTS PERTINENTES (${relevantPatients.length} patients)
${patientContext || 'Aucun patient trouvé'}

## RECHERCHE SCIENTIFIQUE PUBMED
${webResearchContext || 'Aucune recherche effectuée'}

Identifie tous les liens de causalité possibles entre ces éléments. Base tes analyses sur:
- Les contre-indications des traitements
- Les fréquences des symptômes
- Les résultats observés chez les patients (Résolu, En cours, Effet secondaire)
- Les associations connues dans la littérature médicale (articles PubMed fournis)
- Tes connaissances médicales générales

Réponds UNIQUEMENT en français.`;

    console.log('Appel de Lovable AI pour l\'analyse cross-data...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY non configurée');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
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
