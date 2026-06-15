import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * HYPOTHESIS GENERATOR
 *
 * Consumes the unified context from context-assembler and generates:
 * 1. Falsifiable hypotheses with plausibility scores
 * 2. Treatment adaptation recommendations
 * 3. Weak signals detection
 * 4. Risk mitigation strategies
 *
 * Uses OpenAI with strict contractual output schema.
 */

const SYSTEM_PROMPT = `Tu es un pharmacologue clinicien expert travaillant avec un système de raisonnement médical.

# CONTEXTE
Tu reçois un contexte patient structuré incluant:
- Données démographiques et pathologies
- Traitements en cours
- Résultats de laboratoire récents
- Règles causales du Knowledge Graph
- Interactions CYP450 détectées
- Facteurs de population applicables

# TA MISSION
Générer des hypothèses et recommandations ACTIONABLES et FALSIFIABLES.

# RÈGLES STRICTES

## 1. Chaque hypothèse DOIT être falsifiable
- Proposer un test concret pour valider/invalider
- Définir un endpoint mesurable
- Identifier les confondeurs potentiels

## 2. Scoring de plausibilité (0-100)
Pour chaque hypothèse, calculer:
- Proximité à l'évidence (0-25): Existe-t-il des données publiées proches?
- Cohérence biologique (0-25): Le mécanisme est-il biologiquement plausible?
- Compatibilité clinique (0-25): Doses, timing, concentrations réalistes?
- Absence de contradictions (0-25): Existe-t-il des données contraires?

## 3. Catégories de recommandations
- IMMEDIATE: Action requise maintenant
- URGENT: Dans les 24-48h
- ROUTINE: À planifier
- SURVEILLANCE: À monitorer

## 4. Format de sortie JSON STRICT

{
  "analysis_summary": "Résumé en 2-3 phrases",
  "risk_assessment": {
    "overall_level": "LOW|MODERATE|HIGH|CRITICAL",
    "key_concerns": ["..."],
    "protective_factors": ["..."]
  },
  "hypotheses": [
    {
      "id": "H1",
      "claim": "Description de l'hypothèse",
      "type": "interaction|side_effect|contraindication|optimization|surveillance",
      "plausibility_score": 75,
      "plausibility_breakdown": {
        "evidence_proximity": 20,
        "bio_coherence": 22,
        "clinical_compatibility": 18,
        "contradiction_absence": 15
      },
      "mechanism_chain": ["Étape 1", "Étape 2", "Étape 3"],
      "validation_test": "Test concret pour valider",
      "if_validated": "Action si hypothèse vraie",
      "if_refuted": "Action si hypothèse fausse"
    }
  ],
  "treatment_adaptations": [
    {
      "medication": "Nom du médicament",
      "current_regimen": "Posologie actuelle",
      "proposed_change": "Modification proposée",
      "rationale": "Justification",
      "urgency": "IMMEDIATE|URGENT|ROUTINE",
      "monitoring_required": ["Paramètre à suivre"]
    }
  ],
  "weak_signals": [
    {
      "signal": "Description du signal faible",
      "source": "D'où vient ce signal",
      "potential_significance": "Pourquoi c'est important",
      "recommended_action": "Action suggérée",
      "confidence": 0.0-1.0
    }
  ],
  "surveillance_plan": {
    "labs_to_monitor": [{"parameter": "...", "frequency": "...", "alert_threshold": "..."}],
    "clinical_signs": ["..."],
    "follow_up_timeline": "..."
  }
}

Réponds UNIQUEMENT avec le JSON, sans commentaires.`;

interface HypothesisRequest {
    unified_context: any; // From context-assembler
    focus_areas?: string[]; // Optional focus: 'interactions', 'side_effects', 'optimization'
    max_hypotheses?: number;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: HypothesisRequest = await req.json();

        if (!request.unified_context) {
            return new Response(
                JSON.stringify({ error: "unified_context is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // API keys are handled by callAI

        // Build user prompt from unified context
        let userPrompt = request.unified_context.ai_prompt_context || JSON.stringify(request.unified_context, null, 2);

        if (request.focus_areas && request.focus_areas.length > 0) {
            userPrompt += `\n\n## Focus demandé\nConcentre-toi particulièrement sur: ${request.focus_areas.join(', ')}`;
        }

        userPrompt += `\n\n## Instructions\nAnalyse ce contexte patient et génère:\n1. Des hypothèses falsifiables avec scores de plausibilité\n2. Des recommandations d'adaptation de traitement\n3. Des signaux faibles à surveiller\n4. Un plan de surveillance`;

        // Call AI with OpenAI
        const aiResponse = await callAI(
            SYSTEM_PROMPT,
            userPrompt,
            {
                model: "gpt-5.5",
                reasoningEffort: "high",
                maxTokens: 8000,
                temperature: 0.3
            }
        );

        let textContent = aiResponse.text;

        // Parse JSON from response
        let parsedResult;
        try {
            // Try to extract JSON from the response
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON found in response");
            }
        } catch (parseError) {
            console.error("JSON parse error:", parseError);
            // Return raw text if parsing fails
            parsedResult = {
                raw_response: textContent,
                parse_error: String(parseError)
            };
        }

        // Add metadata
        const result = {
            generated_at: new Date().toISOString(),
            patient_id: request.unified_context.patient_id,
            context_version: request.unified_context.context_version,
            focus_areas: request.focus_areas || [],
            ...parsedResult
        };

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Hypothesis generator error:", error);
        return new Response(
            JSON.stringify({ error: "Hypothesis generation failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
