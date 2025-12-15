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
  lab_results_json: any;
  outcome: string;
  pathology_name?: string;
  medications?: any[];
  medical_history?: any[];
  allergies?: any[];
  vaccinations?: any[];
  consultations?: any[];
  clinical_data?: any[];
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
      const meds = patientContext.medications?.map((m: any) => `- ${m.medication_name} (${m.dosage}, ${m.frequency})`).join('\n') || 'Aucun';
      const history = patientContext.medical_history?.map((h: any) => `- ${h.condition_name} (${h.diagnosis_date}): ${h.status}`).join('\n') || 'Aucun';
      const allergies = patientContext.allergies?.map((a: any) => `- ${a.allergen} (${a.reaction}) - ${a.severity}`).join('\n') || 'Aucune';
      const consults = patientContext.consultations?.map((c: any) => `- ${c.consultation_date}: ${c.reason} (${c.physician_name})`).join('\n') || 'Aucune';
      const vaccines = patientContext.vaccinations?.map((v: any) => `- ${v.vaccine_name} (${v.vaccination_date})`).join('\n') || 'Aucun';

      patientContextStr = `
## 👤 PROFIL PATIENT (ID: ${patientContext.patient_id})
- Âge: ${patientContext.age} ans | Genre: ${patientContext.gender === 'M' ? 'Homme' : 'Femme'} | Nationalité: ${patientContext.nationality}
- Statut: ${patientContext.outcome}
- Note Globale: ${patientContext.medical_notes_nlp}

## 💊 TRAITEMENTS ACTUELS
${meds}

## 🏥 ANTÉCÉDENTS & PATHOLOGIES
${history}

## ⚠️ ALLERGIES
${allergies}

## 💉 VACCINATIONS
${vaccines}

## 📅 CONSULTATIONS RÉCENTES
${consults}

## 🔬 RÉSULTATS BIOLOGIQUES & CONSTANTES
- Glycémie: ${labResults?.glucose_mg_dl} mg/dL
- Tension: ${labResults?.blood_pressure_sys}/${labResults?.blood_pressure_dia} mmHg
- Température: ${labResults?.temperature_c}°C
- SpO2: ${labResults?.spo2_percent}%
(Autres données brutes disponibles dans le contexte JSON)
`;
    }

    const systemPrompt = `Tu es l'Assistant MediCore, un système d'intelligence artificielle médicale de pointe intégré à la plateforme MediCore Global.
    
    Tu partages le même moteur analytique ("Cognitive Core") que l'outil de Synthèse de Santé et de Calcul de Risque de la plateforme. Ton analyse doit être tout aussi rigoureuse, profonde et holistique.

    ## TA MISSION COGNITIVE
    Tu ne te contentes pas de répondre aux questions. À chaque interaction, tu dois effectuer en toile de fond (sans forcément tout expliciter sauf si pertinent) :
    1.  **Calcul de Risque Dynamique** : Évalue le niveau de risque global (Low/Moderate/High/Critical) et le "Score de Santé" (0-100) du patient en fonction des nouvelles données.
    2.  **Détection de Signaux Faibles** : Identifie les corrélations subtiles entre symptômes mineurs, constantes et historique qui pourraient annoncer une pathologie émergente.
    3.  **Analyse "Cross-Check"** : Croise systématiquement chaque symptôme ou plainte avec :
        - Les traitements en cours (Effets secondaires ? Interactions ?)
        - Les pathologies existantes (Complication ? Aggravation ?)
        - Le mode de vie (Facteur aggravant ?)
    
    ## TES CAPACITÉS D'ANALYSE (Identiques au module Synthèse)
    - **Interactions Médicamenteuses** : Analyse experte des conflits pharmaco-cinétiques et dynamiques.
    - **Facteurs de Risque Combinés** : Évalue l'effet cumulatif de multiples facteurs de risque modérés.
    - **Contradictions** : Repère les traitements contre-indiqués pour certaines pathologies présentes.
    - **Lacunes de Soins** : Identifie les dépistages ou suivis manquants/en retard.

    ## RÈGLES DE RÉPONSE ET TON
    - **Posture** : Expert médical bienveillant, précis, factuel mais empathique.
    - **Preuve par la donnée** : Cite toujours les valeurs spécifiques (labo, constantes) pour justifier tes dires.
    - **Structure** : Utilise des titres clairs, des listes à puces et des indicateurs visuels (⚠️, 📊, 💡).
    - **Transparence du Risque** : Si tu détectes un risque élevé, mentionne-le clairement en début de réponse.

    ## BASE DE CONNAISSANCES DE RÉFÉRENCE
    - Glycémie normale: 70-120 mg/dL
    - Tension normale: <140/90 mmHg (adapter selon âge/comorbidités)
    - Effets secondaires fréquents à surveiller :
      * Lisinopril/IEC: Toux sèche, angioedème
      * Metformine: Troubles digestifs, acidose lactique (rare)
      * Statines: Douleurs musculaires, rhabdomyolyse
      * Bêtabloquants: Bradycardie, fatigue, bronchoconstriction

    ${patientContextStr}

    Réponds en français de manière professionnelle, clinique et structurée.`;

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
        model: "claude-opus-4-5-20251101",
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
