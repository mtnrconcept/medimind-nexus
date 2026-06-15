import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, streamAI } from "../_shared/ai-client.ts";

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

interface StreamEvent {
  type: 'step_update' | 'text' | 'pathology' | 'summary' | 'done';
  step?: { id: number; status: string; details?: string; source?: string };
  content?: string;
  pathology?: any;
  summary?: string;
}

// Fonction pour rechercher sur PubMed
// Fonction pour rechercher sur PubMed avec API Key et Abstracts complets
async function searchPubMed(query: string, maxResults: number = 5, apiKey?: string): Promise<WebSource[]> {
  try {
    let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    if (apiKey) {
      searchUrl += `&api_key=${apiKey}`;
    }

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) return [];

    const searchData = await searchResponse.json();
    const ids = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) return [];

    let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
    if (apiKey) {
      fetchUrl += `&api_key=${apiKey}`;
    }

    const fetchResponse = await fetch(fetchUrl);
    const xmlText = await fetchResponse.text();

    const sources: WebSource[] = [];
    const articles = xmlText.split('</PubmedArticle>');

    for (const articleXml of articles) {
      if (!articleXml.includes('<PubmedArticle>')) continue;

      const idMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
      const id = idMatch ? idMatch[1] : '';
      if (!id) continue;

      const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
      const title = titleMatch ? titleMatch[1] : "Sans titre";

      const abstractMatches = [...articleXml.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
      const abstract = abstractMatches.map(m => m[1]).join(" ");

      const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
      const journal = journalMatch ? journalMatch[1] : "";

      const yearMatch = articleXml.match(/<Year>(.*?)<\/Year>/);
      const year = yearMatch ? yearMatch[1] : "";

      sources.push({
        title: title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        snippet: abstract ? `[${year} - ${journal}] ${abstract}` : `[${year} - ${journal}] Résumé non disponible.`
      });
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
    const { symptomNames, symptomIds, stream: wantStream = true } = await req.json();

    if (!symptomNames || symptomNames.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Veuillez sélectionner au moins un symptôme' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Core logic runner
    const runAnalysis = async (eventCallback?: (e: StreamEvent) => void): Promise<any> => {
      const emit = (e: StreamEvent) => {
        if (eventCallback) eventCallback(e);
      };

      // 1. Base locale
      emit({ type: 'step_update', step: { id: 1, status: 'running', details: '📁 Base locale...', source: 'Supabase' } });
      let dbPathologies: any[] = [];
      if (symptomIds && symptomIds.length > 0) {
        const { data: links } = await supabase.from('pathology_symptoms')
          .select(`pathology_id, frequency_percent, symptom_id, is_primary, symptoms(name), pathologies(id, name, icd_code, description, severity, category)`)
          .in('symptom_id', symptomIds);

        if (links) {
          const pathologyMap = new Map();
          for (const link of links) {
            const pathology = link.pathologies as any;
            if (!pathology) continue;
            if (!pathologyMap.has(pathology.id)) {
              pathologyMap.set(pathology.id, { ...pathology, matchedSymptoms: [], totalScore: 0 });
            }
            const existing = pathologyMap.get(pathology.id);
            existing.matchedSymptoms.push((link.symptoms as any)?.name);
            existing.totalScore += link.frequency_percent || 50;
          }
          dbPathologies = Array.from(pathologyMap.values()).sort((a, b) => b.totalScore - a.totalScore);
        }
      }
      emit({ type: 'step_update', step: { id: 1, status: 'completed', details: `✅ ${dbPathologies.length} pathologies locales trouvées`, source: 'Local DB' } });

      // 2. PubMed
      emit({ type: 'step_update', step: { id: 2, status: 'running', details: '📋 Recherche PubMed...', source: 'NCBI' } });
      const symptomQuery = symptomNames.join(' AND ');
      const pubmedQuery = `${symptomQuery} diagnosis differential`;
      const ncbiApiKey = Deno.env.get('NCBI_API_KEY');
      const pubmedSources = await searchPubMed(pubmedQuery, 10, ncbiApiKey);

      const additionalSearches: WebSource[] = [];
      if (symptomNames.length >= 2) {
        const combinedQuery = `${symptomNames.slice(0, 3).join(' ')} syndrome disease`;
        const combinedSources = await searchPubMed(combinedQuery, 5, ncbiApiKey);
        additionalSearches.push(...combinedSources);
      }
      emit({ type: 'step_update', step: { id: 2, status: 'completed', details: `✅ ${pubmedSources.length + additionalSearches.length} sources PubMed identifiées`, source: 'PubMed' } });

      // 3. OpenAI Analysis
      const dbContext = dbPathologies.length > 0
        ? dbPathologies.map(p => `- ${p.name} (CIM: ${p.icd_code || 'N/A'}, sévérité: ${p.severity || 'N/A'}): ${p.description || 'Pas de description'}\n  Symptômes correspondants: ${p.matchedSymptoms.join(', ')}`).join('\n')
        : 'Aucune pathologie trouvée dans la base de données locale';

      const webContext = [...pubmedSources, ...additionalSearches].map(s =>
        `- "${s.title}" (${s.url})\n  Extrait: ${s.snippet?.substring(0, 200)}...`
      ).join('\n');

      const systemPrompt = `Tu es un expert médical francophone spécialisé dans le diagnostic différentiel. Tu effectues une "Deep Research" exhaustive.
# RÈGLES
1. Analyse rigoureusement les symptômes signalés.
2. Identifie les pathologies potentielles (base locale + connaissances globales).
3. Evalue la sévérité et l'urgence (Red Flags).
4. Suggère des examens complémentaires pertinents.
5. Format de sortie: Texte d'analyse suivi d'un JSON structuré.

# FORMAT JSON ATTENDU
{
  "pathologies": [
    {
      "name": "Nom",
      "icdCode": "CIM-10",
      "confidence": "high|medium|low",
      "matchedSymptoms": [],
      "description": "...",
      "severity": "mild|moderate|severe|critical",
      "treatmentSuggestions": [],
      "sources": [{"title": "...", "url": "..."}]
    }
  ],
  "summary": "...",
  "differentialDiagnosis": "...",
  "redFlags": [],
  "recommendedTests": []
}
`;
      const userPrompt = `Deep Research pour: ${symptomNames.join(', ')}

## CONTEXTE LOCAL (Base de données)
${dbContext}

## SOURCES EXTERNES (PubMed)
${webContext}

Analyse complète demandée.`;

      emit({ type: 'step_update', step: { id: 3, status: 'running', details: '🧠 Analyse OpenAI...', source: 'OpenAI' } });

      // Use streamAI even for non-streaming to get the chunks/text processing for free, 
      // but only emit text events if we are streaming
      const aiResult = await streamAI(
        systemPrompt,
        userPrompt,
        (chunk) => {
          if (wantStream) emit({ type: 'text', content: chunk });
        },
        {
          model: "gpt-5.5",
          maxTokens: 8000,
          temperature: 0.3,
        }
      );

      const content = aiResult.text;
      emit({ type: 'step_update', step: { id: 3, status: 'completed', details: '✅ Analyse terminée', source: 'OpenAI' } });

      // Extract and Process JSON
      let finalResult = null;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          finalResult = JSON.parse(jsonMatch[0]);

          // Enrich with DB info
          if (finalResult.pathologies) {
            for (const pathology of finalResult.pathologies) {
              const dbMatch = dbPathologies.find(p => p.name.toLowerCase() === pathology.name.toLowerCase());
              if (dbMatch) {
                pathology.isInDatabase = true;
                pathology.databaseId = dbMatch.id;
                if (!pathology.icdCode && dbMatch.icd_code) pathology.icdCode = dbMatch.icd_code;
              } else {
                pathology.isInDatabase = false;
              }
              // Emit pathology event if streaming
              if (wantStream) emit({ type: 'pathology', pathology });
            }
          }
          if (wantStream) emit({ type: 'summary', summary: finalResult.summary });
        }
      } catch (e) {
        console.error("JSON parse error:", e);
      }

      emit({ type: 'done' });
      return finalResult;
    };

    // Branching Logic: Stream vs JSON
    if (wantStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          await runAnalysis((event) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          });
          controller.close();
        }
      });
      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
    } else {
      // Non-streaming mode (JSON)
      try {
        const finalJSON = await runAnalysis();
        return new Response(JSON.stringify({ result: finalJSON }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
  } catch (error) {
    console.error('Erreur Deep Research:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur inconnue' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
