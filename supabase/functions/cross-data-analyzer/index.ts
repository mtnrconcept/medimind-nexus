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
}

interface AnalysisResult {
  causalLinks: CausalLink[];
  summary: string;
  warnings: string[];
  recommendations: string[];
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

    // Fetch selected data
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

    // Get symptom links for selected pathologies
    let symptomLinks: any[] = [];
    if (pathologyIds?.length > 0) {
      const { data: links } = await supabase
        .from('pathology_symptoms')
        .select('*, symptoms(name), pathologies(name)')
        .in('pathology_id', pathologyIds);
      symptomLinks = links || [];
    }

    // Build context for AI
    const selectedPathologiesContext = pathologies.map((p: any) => 
      `- ${p.name} (CIM: ${p.icd_code || 'N/A'}, sévérité: ${p.severity || 'N/A'}): ${p.description || ''}`
    ).join('\n');

    const selectedSymptomsContext = symptoms.map((s: any) => 
      `- ${s.name} (système: ${s.body_system || 'N/A'}): ${s.description || ''}`
    ).join('\n');

    const selectedTreatmentsContext = treatments.map((t: any) => 
      `- ${t.name} (type: ${t.type || 'N/A'}, pour: ${t.pathologies?.name || 'N/A'}): ${t.description || ''}\n  Contre-indications: ${t.contraindications?.join(', ') || 'Aucune connue'}`
    ).join('\n');

    // Find patients with selected pathologies
    const relevantPatients = patients.filter((p: any) => 
      pathologyIds?.includes(p.pathology_id)
    );

    const patientContext = relevantPatients.slice(0, 20).map((p: any) => 
      `- Patient ${p.patient_id.slice(0,6)}: ${p.age} ans, ${p.gender}, traitement: ${p.treatment || 'N/A'}, résultat: ${p.outcome}`
    ).join('\n');

    const symptomLinksContext = symptomLinks.map((sl: any) => 
      `- ${sl.symptoms?.name} associé à ${sl.pathologies?.name} (fréquence: ${sl.frequency_percent || 'N/A'}%, primaire: ${sl.is_primary ? 'Oui' : 'Non'})`
    ).join('\n');

    const systemPrompt = `Tu es un expert en analyse médicale cross-data. Tu analyses les corrélations et liens de causalité entre symptômes, pathologies et traitements.

Ton objectif est d'identifier:
1. Les liens de causalité potentiels entre les éléments sélectionnés
2. Si un symptôme pourrait être causé par un traitement (effet secondaire)
3. Si une pathologie peut causer une autre pathologie
4. Si un traitement peut aggraver ou masquer des symptômes
5. Les patterns observés dans les données patients

Tu DOIS répondre UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "causalLinks": [
    {
      "from": "nom de l'élément source",
      "fromType": "symptom" | "pathology" | "treatment",
      "to": "nom de l'élément cible",
      "toType": "symptom" | "pathology" | "treatment",
      "relationship": "description courte du lien",
      "probability": "high" | "medium" | "low",
      "evidence": "explication détaillée basée sur les données",
      "patientCount": nombre de patients où ce lien est observé
    }
  ],
  "summary": "résumé global de l'analyse en 2-3 phrases",
  "warnings": ["avertissement 1", "avertissement 2"],
  "recommendations": ["recommandation 1", "recommandation 2"]
}`;

    const userPrompt = `Analyse les liens de causalité entre ces éléments médicaux:

## PATHOLOGIES SÉLECTIONNÉES
${selectedPathologiesContext || 'Aucune'}

## SYMPTÔMES SÉLECTIONNÉS
${selectedSymptomsContext || 'Aucun'}

## TRAITEMENTS SÉLECTIONNÉS
${selectedTreatmentsContext || 'Aucun'}

## ASSOCIATIONS SYMPTÔMES-PATHOLOGIES CONNUES
${symptomLinksContext || 'Aucune association trouvée'}

## DONNÉES PATIENTS PERTINENTES (${relevantPatients.length} patients)
${patientContext || 'Aucun patient trouvé'}

Identifie tous les liens de causalité possibles entre ces éléments. Base tes analyses sur:
- Les contre-indications des traitements
- Les fréquences des symptômes
- Les résultats observés chez les patients (RESOLVED, ONGOING, SIDE_EFFECT)
- Les associations connues dans la littérature médicale`;

    console.log('Calling Lovable AI for cross-data analysis...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit atteint. Veuillez réessayer dans quelques instants.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Crédits insuffisants. Veuillez recharger votre compte.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from response
    let analysis: AnalysisResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Content:', content);
      analysis = {
        causalLinks: [],
        summary: "L'analyse n'a pas pu être complétée correctement.",
        warnings: ["Erreur de parsing de la réponse IA"],
        recommendations: ["Veuillez réessayer l'analyse"]
      };
    }

    console.log('Analysis completed successfully');

    return new Response(
      JSON.stringify({
        analysis,
        context: {
          pathologiesCount: pathologies.length,
          symptomsCount: symptoms.length,
          treatmentsCount: treatments.length,
          patientsAnalyzed: relevantPatients.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cross-data analyzer error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
