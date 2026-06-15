import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// ADVERSARIAL REVIEWER
// Uses OpenAI to critically analyze hypotheses
// ============================================

interface Hypothesis {
    hypothesis_id: string;
    statement: string;
    predictions?: string[];
    evidence_citations?: string[];
    scores?: Record<string, number>;
}

interface AdversarialReview {
    counter_arguments: string[];
    methodological_concerns: string[];
    confounders: string[];
    limitations: string[];
    missing_evidence: string[];
    conclusion: 'robust' | 'moderate' | 'fragile' | 'flawed';
    confidence_adjustment: number; // -1 to 0 adjustment to original scores
    recommended_tests: string[];
    summary: string;
}

async function performAdversarialReview(hypothesis: Hypothesis, evidenceContext?: string): Promise<AdversarialReview> {
    const systemPrompt = `Tu es un expert critique en méthodologie scientifique et en revue systématique.
Ton rôle est d'identifier les FAIBLESSES, BIAIS et LIMITATIONS d'une hypothèse médicale.

Tu dois être:
- Rigoureux: Identifier tous les confondeurs potentiels
- Sceptique: Chercher les explications alternatives
- Méthodique: Évaluer la qualité des preuves citées
- Constructif: Proposer des tests pour falsifier l'hypothèse

RÈGLES:
1. Cite des sources spécifiques si elles contredisent l'hypothèse
2. Identifie les biais de publication potentiels
3. Évalue si les études citées sont suffisamment puissantes
4. Vérifie la transposabilité (modèle animal → humain, in vitro → in vivo)
5. Identifie les variables confondantes non contrôlées

FORMAT DE SORTIE (JSON strict):
{
  "counter_arguments": ["Argument contre 1", "..."],
  "methodological_concerns": ["Préoccupation méthodologique 1", "..."],
  "confounders": ["Confondeur potentiel 1", "..."],
  "limitations": ["Limitation 1", "..."],
  "missing_evidence": ["Preuve manquante 1", "..."],
  "conclusion": "robust|moderate|fragile|flawed",
  "confidence_adjustment": -0.X,
  "recommended_tests": ["Test recommandé 1", "..."],
  "summary": "Résumé en 2-3 phrases"
}`;

    const userPrompt = `Effectue une revue adversariale critique de cette hypothèse:

HYPOTHÈSE: ${hypothesis.statement}

ID: ${hypothesis.hypothesis_id}

${hypothesis.predictions?.length ? `PRÉDICTIONS ASSOCIÉES:
${hypothesis.predictions.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : ''}

${hypothesis.evidence_citations?.length ? `CITATIONS DE PREUVES:
${hypothesis.evidence_citations.join(', ')}` : ''}

${hypothesis.scores ? `SCORES INITIAUX:
- Nouveauté: ${hypothesis.scores.novelty || 'N/A'}/10
- Plausibilité: ${hypothesis.scores.plausibility || 'N/A'}/10
- Force de preuve: ${hypothesis.scores.strength || 'N/A'}/10
- Faisabilité: ${hypothesis.scores.feasibility || 'N/A'}/10
- Impact: ${hypothesis.scores.impact || 'N/A'}/10` : ''}

${evidenceContext ? `CONTEXTE DES PREUVES:
${evidenceContext}` : ''}

Analyse critique en JSON:`;

    try {
        const aiResponse = await callAI(
            systemPrompt,
            userPrompt,
            {
                model: "gpt-5.5",
                maxTokens: 2048
            }
        );

        const content = aiResponse.text || '';

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                counter_arguments: parsed.counter_arguments || [],
                methodological_concerns: parsed.methodological_concerns || [],
                confounders: parsed.confounders || [],
                limitations: parsed.limitations || [],
                missing_evidence: parsed.missing_evidence || [],
                conclusion: parsed.conclusion || 'moderate',
                confidence_adjustment: parsed.confidence_adjustment || -0.1,
                recommended_tests: parsed.recommended_tests || [],
                summary: parsed.summary || 'Analyse non disponible'
            };
        }

        throw new Error('Could not parse JSON from AI response');
    } catch (error) {
        console.error('Adversarial review error:', error);
        throw error;
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { hypothesis, evidence_context } = await req.json();

        if (!hypothesis || !hypothesis.statement) {
            return new Response(
                JSON.stringify({ error: "Hypothesis with statement is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const review = await performAdversarialReview(hypothesis, evidence_context);

        // Calculate adjusted scores if original scores exist
        let adjusted_scores: Record<string, number> | null = null;
        if (hypothesis.scores) {
            const scores: Record<string, number> = { ...hypothesis.scores };
            for (const key of Object.keys(scores)) {
                if (typeof scores[key] === 'number') {
                    scores[key] = Math.max(0, scores[key] + (review.confidence_adjustment * 10));
                }
            }
            // Recalculate total
            const scoreKeys = ['novelty', 'plausibility', 'strength', 'feasibility', 'impact'];
            const validScores = scoreKeys.filter(k => typeof scores[k] === 'number');
            scores.total = validScores.reduce((sum, k) => sum + scores[k], 0) / validScores.length;
            adjusted_scores = scores;
        }

        return new Response(
            JSON.stringify({
                hypothesis_id: hypothesis.hypothesis_id,
                review,
                adjusted_scores,
                reviewed_at: new Date().toISOString()
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Adversarial reviewer error:", error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
