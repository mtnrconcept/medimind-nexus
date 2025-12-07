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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversationHistory || []),
      { role: "user", content: message }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits insuffisants. Veuillez recharger votre compte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erreur du service IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
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
