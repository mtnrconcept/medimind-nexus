import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, streamAI } from "../_shared/ai-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StreamEvent {
  type: 'step_update' | 'text' | 'analysis' | 'done';
  step?: { id: number; status: string; details?: string; source?: string };
  content?: string;
  analysis?: any;
}

serve(async (req: Request) => {
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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: StreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          sendEvent({ type: 'step_update', step: { id: 1, status: 'running', details: '📊 Collecte des données cliniques...', source: 'Supabase' } });

          const [pathologyRes, symptomsRes, treatmentsRes, patientsRes, sourcesRes] = await Promise.all([
            supabase.from('pathologies').select('*').eq('id', pathologyId).single(),
            supabase.from('pathology_symptoms')
              .select('frequency_percent, is_primary, symptoms(name, body_system, description)')
              .eq('pathology_id', pathologyId),
            supabase.from('treatments').select('*').eq('pathology_id', pathologyId),
            supabase.from('patients').select('*').eq('pathology_id', pathologyId).limit(50),
            supabase.from('medical_sources').select('*').eq('pathology_id', pathologyId),
          ]);

          const pathology = pathologyRes.data;
          if (!pathology) {
            sendEvent({ type: 'step_update', step: { id: 1, status: 'error', details: 'Pathologie non trouvée' } });
            controller.close();
            return;
          }

          const symptoms = symptomsRes.data || [];
          const treatments = treatmentsRes.data || [];
          const patients = patientsRes.data || [];
          const sources = sourcesRes.data || [];

          sendEvent({ type: 'step_update', step: { id: 1, status: 'completed', details: `✅ ${symptoms.length} symptômes, ${treatments.length} traitements`, source: 'Local DB' } });

          const systemPrompt = `Tu es un expert en analyse médicale cross-data.
Ton but est de détecter des corrélations entre symptômes, traitements et données cliniques pour la pathologie "${pathology.name}".

# INSTRUCTIONS
1. Analyse les données fournies (JSON).
2. Identifie les interactions, corrélations et insights patients.
3. Formule des recommandations prioritaires.
4. Format de sortie: Texte d'analyse explicatif suivi d'un JSON structuré.

# FORMAT JSON ATTENDU
{
  "interactions": [{"symptom": "...", "treatment": "...", "probability": "haute|moyenne|faible", "explanation": "..."}],
  "correlations": [{"symptom": "...", "related_pathology": "...", "evidence": "..."}],
  "patient_insights": [{"finding": "...", "patient_count": 0, "confidence": "haute|moyenne|faible"}],
  "recommendations": [{"action": "...", "priority": "haute|moyenne|faible", "rationale": "..."}]
}
`;

          const userPrompt = `Analyse de la pathologie: ${pathology.name} (${pathology.icd_code || 'N/A'})

SYMPTÔMES: ${JSON.stringify(symptoms.slice(0, 20))}
TRAITEMENTS: ${JSON.stringify(treatments.slice(0, 10))}
PATIENTS (N=${patients.length}): ${JSON.stringify(patients.slice(0, 10))}
SOURCES: ${JSON.stringify(sources.slice(0, 5))}

Effectue l'analyse complète.`;

          sendEvent({ type: 'step_update', step: { id: 2, status: 'running', details: '🧠 Analyse multi-agents...', source: 'Claude 3.5 Sonnet' } });

          const aiResult = await streamAI(
            systemPrompt,
            userPrompt,
            (chunk) => {
              sendEvent({ type: 'text', content: chunk });
            },
            {
              model: 'claude-3-5-sonnet-20240620',
              maxTokens: 4000,
              temperature: 0.2
            }
          );

          const fullText = aiResult.text;
          sendEvent({ type: 'step_update', step: { id: 2, status: 'completed', details: '✅ Analyse terminée', source: 'Claude' } });

          // Extraction du JSON
          try {
            const jsonMatch = fullText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const analysis = JSON.parse(jsonMatch[0]);
              sendEvent({ type: 'analysis', analysis });
            }
          } catch (e) {
            console.error("Pathology analysis JSON parse error:", e);
          }

          sendEvent({ type: 'done' });
        } catch (err) {
          console.error("Pathology analyzer error:", err);
          sendEvent({ type: 'step_update', step: { id: 1, status: 'error', details: String(err) } });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });

  } catch (error) {
    console.error('Pathology analyzer error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
