import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { streamAI } from "../_shared/ai-client.ts";

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

      // New Sections
      const mental = (patientContext as any).mental_health?.map((m: any) => `- ${m.condition_name}: ${m.notes}`).join('\n') || 'Aucune donnée';
      const repro = (patientContext as any).reproductive_health?.map((r: any) => `- ${r.condition_name}: ${r.notes}`).join('\n') || 'Aucune donnée';
      const clinical = (patientContext as any).clinical_data?.map((d: any) => `- ${d.data_name}: ${d.data_value} ${d.unit || ''}`).join('\n') || 'Aucune donnée';
      const labList = (patientContext as any).lab_results_data?.map((l: any) => `- ${l.test_name}: ${l.test_value} ${l.unit} (${l.status})`).join('\n') || 'Aucune donnée';

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

## 🔬 RÉSULTATS BIOLOGIQUES (LISTE)
${labList}

## 🧬 DONNÉES CLINIQUES & CONSTANTES
${clinical}

## 💉 VACCINATIONS
${vaccines}

## 📅 CONSULTATIONS RÉCENTES
${consults}

## 🧠 SANTÉ MENTALE
${mental}

## 🤰 SANTÉ REPRODUCTIVE
${repro}

## 🔬 SYNTHÈSE BIOLOGIQUE
- Glycémie: ${labResults?.glucose_mg_dl || 'N/A'} mg/dL
- Tension: ${labResults?.blood_pressure_sys || 'N/A'}/${labResults?.blood_pressure_dia || 'N/A'} mmHg
- Température: ${labResults?.temperature_c || 'N/A'}°C
- SpO2: ${labResults?.spo2_percent || 'N/A'}%
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamAI(
            systemPrompt,
            [...validMessages, { role: "user", content: message }],
            (text) => {
              const openaiChunk = {
                choices: [{ delta: { content: text } }]
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
            },
            {
              model: "gpt-5.5",
              reasoningEffort: "low",
              maxTokens: 4096,
            }
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (e) {
          console.error("Stream error:", e);
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
