import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PatientContext {
  patient_id: string;
  age: number;
  gender: string;
  nationality: string;
  treatment: string;
  medical_notes_nlp: string;
  lab_results_json: {
    glucose_mg_dl: number;
    blood_pressure_sys: number;
    blood_pressure_dia: number;
    temperature_c: number;
  };
  outcome: string;
  pathology_name?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, patient, conversationHistory } = await req.json();
    const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");

    if (!CLAUDE_API_KEY) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    const patientContext = patient as PatientContext;
    const labResults = patientContext?.lab_results_json;

    // Build patient context string
    let patientContextStr = "";
    if (patientContext) {
      patientContextStr = `
## Données Patient Actuel (ID: ${patientContext.patient_id})
- Âge: ${patientContext.age} ans
- Genre: ${patientContext.gender === 'M' ? 'Homme' : 'Femme'}
- Nationalité: ${patientContext.nationality}
- Pathologie: ${patientContext.pathology_name || 'Non spécifiée'}
- Traitement actuel: ${patientContext.treatment}
- Statut: ${patientContext.outcome}

## Résultats Biologiques
- Glycémie: ${labResults?.glucose_mg_dl} mg/dL ${labResults?.glucose_mg_dl > 120 ? '⚠️ ÉLEVÉE' : labResults?.glucose_mg_dl < 70 ? '⚠️ BASSE' : '✓ Normal'}
- Tension artérielle: ${labResults?.blood_pressure_sys}/${labResults?.blood_pressure_dia} mmHg ${labResults?.blood_pressure_sys > 140 || labResults?.blood_pressure_dia > 90 ? '⚠️ ÉLEVÉE' : '✓ Normal'}
- Température: ${labResults?.temperature_c}°C ${labResults?.temperature_c > 37.5 ? '⚠️ FIÈVRE' : '✓ Normal'}

## Notes Médicales (NLP)
${patientContext.medical_notes_nlp}
`;
    }

    const systemPrompt = `Tu es l'Assistant MediCore, un système d'intelligence artificielle médicale de pointe intégré à la plateforme MediCore Global.

## Tes capacités
1. **Analyse Cross-Check** : Tu peux comparer les résultats biologiques avec les traitements prescrits et détecter les incohérences.
2. **Lecture NLP** : Tu analyses les notes médicales en texte libre pour extraire symptômes cachés et informations cliniques.
3. **Intelligence Collective** : Tu as accès à une base de données mondiale de patients pour comparaisons statistiques.
4. **Pharmacovigilance** : Tu détectes les effets secondaires potentiels des médicaments.

## Règles de réponse
- Sois précis et factuel, cite les données du patient.
- Utilise des emojis pour les alertes (⚠️ pour danger, ✓ pour normal, 📊 pour statistiques).
- Structure tes réponses avec des titres clairs.
- Mentionne toujours les pourcentages et données statistiques quand pertinent.
- Si tu suggères un changement de traitement, explique pourquoi avec des données.

## Base de connaissances médicales
- Glycémie normale: 70-120 mg/dL
- Tension normale: <140/90 mmHg
- Effets secondaires connus:
  * Lisinopril (IEC): Toux sèche (10-15% des patients)
  * Metformine: Troubles digestifs
  * Bêtamimétiques: Résistance possible chez certains profils ethniques

${patientContextStr}

Réponds en français de manière professionnelle et médicale.`;

    // Filtrer les messages pour exclure les rôles système et s'assurer que c'est user/assistant
    const validMessages = (conversationHistory || [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({ role: m.role, content: m.content }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...validMessages,
          { role: "user", content: message }
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requêtes atteinte. Veuillez réessayer dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erreur du service IA Claude" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transform Stream pour convertir le format Claude en format OpenAI pour le frontend
    const reader = response.body!.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Garder le dernier fragment incomplet

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') continue;

                try {
                  const data = JSON.parse(jsonStr);
                  if (data.type === 'content_block_delta' && data.delta?.text) {
                    // Format compatible OpenAI pour le frontend
                    const openaiChunk = {
                      choices: [{ delta: { content: data.delta.text } }]
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                  }
                } catch (e) {
                  // Ignorer les erreurs de parsing JSON partiel
                }
              }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI Assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
