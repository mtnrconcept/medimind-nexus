import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Fonction pour rechercher sur PubMed
async function searchPubMed(query: string, maxResults: number = 5): Promise<WebSource[]> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    const ids = searchData?.esearchresult?.idlist || [];
    
    if (ids.length === 0) return [];

    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
    const fetchResponse = await fetch(fetchUrl);
    const fetchData = await fetchResponse.json();
    
    const sources: WebSource[] = [];
    for (const id of ids) {
      const article = fetchData?.result?.[id];
      if (article) {
        sources.push({
          title: article.title || "Sans titre",
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          snippet: article.source || ""
        });
      }
    }
    return sources;
  } catch (error) {
    console.error('Erreur recherche PubMed:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symptomNames, symptomIds } = await req.json();

    if (!symptomNames || symptomNames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Veuillez sélectionner au moins un symptôme' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Deep Research lancée pour symptômes:', symptomNames);

    // 1. Rechercher dans la base de données locale
    let dbPathologies: any[] = [];
    if (symptomIds && symptomIds.length > 0) {
      const { data: links } = await supabase
        .from('pathology_symptoms')
        .select(`
          pathology_id,
          frequency_percent,
          symptom_id,
          is_primary,
          symptoms(name),
          pathologies(id, name, icd_code, description, severity, category)
        `)
        .in('symptom_id', symptomIds);
      
      if (links) {
        // Grouper par pathologie
        const pathologyMap = new Map();
        for (const link of links) {
          const pathology = link.pathologies as any;
          if (!pathology) continue;
          
          if (!pathologyMap.has(pathology.id)) {
            pathologyMap.set(pathology.id, {
              ...pathology,
              matchedSymptoms: [],
              totalScore: 0
            });
          }
          
          const existing = pathologyMap.get(pathology.id);
          existing.matchedSymptoms.push((link.symptoms as any)?.name);
          existing.totalScore += link.frequency_percent || 50;
        }
        
        dbPathologies = Array.from(pathologyMap.values())
          .sort((a, b) => b.totalScore - a.totalScore);
      }
    }

    // 2. Rechercher sur PubMed
    const symptomQuery = symptomNames.join(' AND ');
    const pubmedQuery = `${symptomQuery} diagnosis differential`;
    console.log('Recherche PubMed:', pubmedQuery);
    
    const pubmedSources = await searchPubMed(pubmedQuery, 10);
    
    // Recherches supplémentaires par combinaison de symptômes
    const additionalSearches: WebSource[] = [];
    if (symptomNames.length >= 2) {
      const combinedQuery = `${symptomNames.slice(0, 3).join(' ')} syndrome disease`;
      const combinedSources = await searchPubMed(combinedQuery, 5);
      additionalSearches.push(...combinedSources);
    }

    // 3. Construire le contexte pour l'IA
    const dbContext = dbPathologies.length > 0 
      ? dbPathologies.map(p => 
          `- ${p.name} (CIM: ${p.icd_code || 'N/A'}, sévérité: ${p.severity || 'N/A'}): ${p.description || 'Pas de description'}\n  Symptômes correspondants: ${p.matchedSymptoms.join(', ')}`
        ).join('\n')
      : 'Aucune pathologie trouvée dans la base de données locale';

    const webContext = [...pubmedSources, ...additionalSearches].map(s => 
      `- "${s.title}" (${s.url})`
    ).join('\n');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY non configurée');
    }

    const systemPrompt = `Tu es un expert médical francophone spécialisé dans le diagnostic différentiel. Tu effectues une "Deep Research" en analysant les symptômes fournis pour identifier TOUTES les pathologies possibles.

IMPORTANT: Tu dois TOUJOURS répondre en FRANÇAIS.

Tu dois:
1. Analyser les symptômes fournis
2. Identifier toutes les pathologies possibles (de la base de données ET de tes connaissances médicales)
3. Classer par probabilité/pertinence
4. Identifier les signaux d'alerte ("red flags")
5. Suggérer des examens complémentaires

Tu DOIS répondre UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "pathologies": [
    {
      "name": "Nom de la pathologie",
      "icdCode": "Code CIM-10/11 si connu",
      "confidence": "high" | "medium" | "low",
      "matchedSymptoms": ["symptôme1", "symptôme2"],
      "description": "Description courte de la pathologie",
      "severity": "mild" | "moderate" | "severe" | "critical",
      "treatmentSuggestions": ["traitement1", "traitement2"],
      "sources": [{"title": "titre", "url": "url"}]
    }
  ],
  "summary": "Résumé de l'analyse en 2-3 phrases",
  "differentialDiagnosis": "Explication du diagnostic différentiel",
  "redFlags": ["signal d'alerte 1", "signal d'alerte 2"],
  "recommendedTests": ["examen 1", "examen 2"]
}

IMPORTANT: Inclus à la fois les pathologies trouvées dans la base de données ET d'autres pathologies possibles basées sur tes connaissances médicales. Liste au moins 5-10 pathologies possibles, classées par pertinence.`;

    const userPrompt = `Effectue une Deep Research pour les symptômes suivants:

## SYMPTÔMES SIGNALÉS
${symptomNames.map((s: string) => `- ${s}`).join('\n')}

## PATHOLOGIES TROUVÉES DANS NOTRE BASE DE DONNÉES
${dbContext}

## SOURCES SCIENTIFIQUES PUBMED
${webContext || 'Aucune source trouvée'}

Analyse ces symptômes et identifie TOUTES les pathologies possibles qui pourraient les expliquer. Inclus:
1. Les pathologies de notre base de données (si pertinentes)
2. D'autres pathologies médicales connues qui correspondent à ces symptômes
3. Des pathologies rares mais à ne pas manquer

Classe-les par ordre de probabilité et indique les signaux d'alerte à surveiller.`;

    console.log('Appel Lovable AI pour Deep Research...');

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
          JSON.stringify({ error: 'Limite de requêtes atteinte. Réessayez dans quelques instants.' }),
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

    // Parser le JSON
    let result: DeepResearchResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Aucun JSON trouvé');
      }
    } catch (parseError) {
      console.error('Erreur parsing:', parseError);
      result = {
        pathologies: [],
        summary: "L'analyse n'a pas pu être complétée.",
        differentialDiagnosis: "",
        redFlags: [],
        recommendedTests: [],
        webSourcesCount: 0
      };
    }

    // Enrichir avec les IDs de la base de données
    if (result.pathologies) {
      for (const pathology of result.pathologies) {
        const dbMatch = dbPathologies.find(
          p => p.name.toLowerCase() === pathology.name.toLowerCase()
        );
        if (dbMatch) {
          pathology.isInDatabase = true;
          pathology.databaseId = dbMatch.id;
          if (!pathology.icdCode && dbMatch.icd_code) {
            pathology.icdCode = dbMatch.icd_code;
          }
        } else {
          pathology.isInDatabase = false;
        }
      }
    }

    result.webSourcesCount = pubmedSources.length + additionalSearches.length;

    console.log('Deep Research terminée:', result.pathologies?.length || 0, 'pathologies trouvées');

    return new Response(
      JSON.stringify({
        result,
        context: {
          symptomsAnalyzed: symptomNames.length,
          databasePathologies: dbPathologies.length,
          pubmedSources: pubmedSources.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur Deep Research:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur inconnue' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
