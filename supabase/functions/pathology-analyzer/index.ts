import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisResult {
  interactions: Array<{
    symptom: string;
    treatment: string;
    probability: string;
    explanation: string;
  }>;
  correlations: Array<{
    symptom: string;
    related_pathology: string;
    evidence: string;
  }>;
  patient_insights: Array<{
    finding: string;
    patient_count: number;
    confidence: string;
  }>;
  recommendations: Array<{
    action: string;
    priority: string;
    rationale: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pathologyId } = await req.json();

    if (!pathologyId) {
      return new Response(
        JSON.stringify({ error: 'pathologyId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fix: Force Service Role to bypass RLS, same as in embed-data
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: { Authorization: `Bearer ${supabaseKey}` }
      }
    });

    console.log(`[PathologyAnalyzer] Analysing ID: ${pathologyId}`);

    // Fetch all related data in parallel with error handling
    const [pathologyRes, symptomsRes, treatmentsRes, patientsRes, sourcesRes] = await Promise.all([
      supabase.from('pathologies').select('*').eq('id', pathologyId).single(),
      supabase.from('pathology_symptoms')
        .select('frequency_percent, is_primary, symptoms(*)')
        .eq('pathology_id', pathologyId),
      supabase.from('treatments').select('*').eq('pathology_id', pathologyId),
      supabase.from('patients').select('*').eq('pathology_id', pathologyId),
      supabase.from('medical_sources').select('*').eq('pathology_id', pathologyId),
    ]);

    // Trace specifics errors
    if (pathologyRes.error) console.error('[Error] Pathologies:', pathologyRes.error);
    if (symptomsRes.error) console.error('[Error] Symptoms:', symptomsRes.error);
    if (treatmentsRes.error) console.error('[Error] Treatments:', treatmentsRes.error);

    const pathology = pathologyRes.data;
    const symptoms = symptomsRes.data || [];
    const treatments = treatmentsRes.data || [];
    const patients = patientsRes.data || [];
    const sources = sourcesRes.data || [];

    if (!pathology) {
      return new Response(
        JSON.stringify({ error: 'Pathology not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context for AI analysis
    const symptomsContext = symptoms.map((s: any) => ({
      name: s.symptoms?.name,
      frequency: s.frequency_percent,
      isPrimary: s.is_primary,
      bodySystem: s.symptoms?.body_system,
      description: s.symptoms?.description,
    }));

    const treatmentsContext = treatments.map((t: any) => ({
      name: t.name,
      type: t.type,
      description: t.description,
      contraindications: t.contraindications || [],
    }));

    const patientsContext = patients.map((p: any) => ({
      age: p.age,
      gender: p.gender,
      treatment: p.treatment,
      outcome: p.outcome,
      medicalNotes: p.medical_notes_nlp,
      labResults: p.lab_results_json,
    }));

    const sourcesContext = sources.map((s: any) => ({
      title: s.title,
      type: s.source_type,
      pubmedId: s.pubmed_id,
    }));

    const systemPrompt = `Tu es un expert en analyse médicale cross-data spécialisé dans la détection de corrélations entre symptômes, traitements et données cliniques des patients.

Analyse les données suivantes pour la pathologie "${pathology.name}" (${pathology.icd_code || 'Code non disponible'}):

**Symptômes associés:**
${JSON.stringify(symptomsContext, null, 2)}

**Traitements:**
${JSON.stringify(treatmentsContext, null, 2)}

**Données cliniques patients (${patients.length} cas):**
${JSON.stringify(patientsContext, null, 2)}

**Sources médicales:**
${JSON.stringify(sourcesContext, null, 2)}

Ta mission:
1. **Interactions symptômes-traitements**: Identifie si certains symptômes pourraient être des effets secondaires des traitements
2. **Corrélations pathologiques**: Détecte si des symptômes sont communs à d'autres pathologies
3. **Insights patients**: Analyse les patterns dans les données cliniques (âge, genre, outcomes)
4. **Recommandations**: Propose des actions avec niveau de priorité

Réponds UNIQUEMENT avec un JSON valide au format suivant (sans markdown, sans commentaires):
{
  "interactions": [{"symptom": "...", "treatment": "...", "probability": "haute|moyenne|faible", "explanation": "..."}],
  "correlations": [{"symptom": "...", "related_pathology": "...", "evidence": "..."}],
  "patient_insights": [{"finding": "...", "patient_count": 0, "confidence": "haute|moyenne|faible"}],
  "recommendations": [{"action": "...", "priority": "haute|moyenne|faible", "rationale": "..."}]
}`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
          { role: 'user', content: `Analyse cette pathologie et retourne le JSON d'analyse.` },
        ],
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requêtes dépassée. Réessayez plus tard.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Crédits insuffisants. Veuillez recharger votre compte.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Erreur du service IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'Réponse IA vide' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response, handling potential markdown code blocks
    let analysis: AnalysisResult;
    try {
      let jsonContent = content.trim();
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      analysis = JSON.parse(jsonContent.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return new Response(
        JSON.stringify({
          error: 'Erreur de parsing de la réponse IA',
          raw: content
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        pathology: {
          id: pathology.id,
          name: pathology.name,
          icdCode: pathology.icd_code,
        },
        dataContext: {
          symptomsCount: symptoms.length,
          treatmentsCount: treatments.length,
          patientsCount: patients.length,
          sourcesCount: sources.length,
        },
        analysis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Pathology analyzer error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
