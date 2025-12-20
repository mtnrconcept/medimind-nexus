import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface QuestionnaireRequest {
    conversationHistory: Message[];
    identifiedSymptoms: string[];
    initialSymptom?: string;
}

interface QuestionnaireResponse {
    nextQuestion: string;
    extractedSymptoms: string[];
    isReadyForResearch: boolean;
    confidenceLevel: number;
    suggestedFollowUps: string[];
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { conversationHistory, identifiedSymptoms, initialSymptom }: QuestionnaireRequest = await req.json();

        const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY');
        if (!CLAUDE_API_KEY) {
            throw new Error('CLAUDE_API_KEY non configurée');
        }

        const currentSymptoms = identifiedSymptoms || [];

        const systemPrompt = `Tu es un assistant médical expert francophone spécialisé dans l'anamnèse (recueil des symptômes). Tu poses des questions ciblées et pertinentes pour identifier précisément les symptômes du patient.

RÈGLES IMPORTANTES:
1. Pose UNE question à la fois, claire et précise
2. Utilise un langage simple et accessible
3. Explore les caractéristiques importantes: localisation, intensité, durée, facteurs aggravants/soulageants
4. Identifie les symptômes associés
5. Reste empathique et professionnel
6. NE FAIS PAS de diagnostic - tu collectes uniquement les symptômes

PROCESSUS:
- Si c'est le début de la conversation, pose une question ouverte sur le symptôme principal
- Sinon, pose des questions de suivi pour clarifier et approfondir
- Après 4-6 échanges pertinents ou quand tu as identifié au moins 3-4 symptômes clairs, indique que la recherche peut commencer

Tu DOIS répondre UNIQUEMENT en JSON valide:
{
  "nextQuestion": "Ta prochaine question ciblée",
  "extractedSymptoms": ["symptôme1", "symptôme2"],
  "isReadyForResearch": false,
  "confidenceLevel": 0.7,
  "suggestedFollowUps": ["Question alternative 1", "Question alternative 2"]
}

- extractedSymptoms: Liste TOUS les symptômes identifiés dans cette réponse ET les précédents
- isReadyForResearch: true si assez d'informations (minimum 3 symptômes bien caractérisés OU 5+ échanges)
- confidenceLevel: 0-1 indiquant la qualité des informations recueillies
- suggestedFollowUps: 2-3 questions alternatives que l'utilisateur pourrait choisir`;

        // Build the conversation for Claude
        const messages: { role: string; content: string }[] = [];

        if (conversationHistory.length === 0) {
            // First message - initiate the questionnaire
            const startPrompt = initialSymptom
                ? `Le patient mentionne: "${initialSymptom}". Commence l'anamnèse en posant une première question pour explorer ce symptôme.`
                : `Commence une nouvelle anamnèse. Pose une question ouverte pour identifier le symptôme principal du patient.`;

            messages.push({ role: 'user', content: startPrompt });
        } else {
            // Continue conversation
            for (const msg of conversationHistory) {
                messages.push({ role: msg.role, content: msg.content });
            }

            // Add context about already identified symptoms
            if (currentSymptoms.length > 0) {
                messages.push({
                    role: 'user',
                    content: `[Contexte système: Symptômes déjà identifiés: ${currentSymptoms.join(', ')}. Continue l'anamnèse ou détermine si nous avons assez d'informations.]`
                });
            }
        }

        console.log('Questionnaire - Appel Claude API...');

        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                system: systemPrompt,
                messages: messages,
                temperature: 0.5,
            }),
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error('Erreur API Claude:', aiResponse.status, errorText);

            if (aiResponse.status === 429) {
                return new Response(
                    JSON.stringify({ error: 'Limite de requêtes atteinte. Réessayez dans quelques instants.' }),
                    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            throw new Error(`Erreur API Claude: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const content = aiData.content?.[0]?.text;

        if (!content) {
            throw new Error('Aucun contenu dans la réponse IA');
        }

        // Parse JSON response
        let result: QuestionnaireResponse;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Aucun JSON trouvé');
            }
        } catch (parseError) {
            console.error('Erreur parsing:', parseError, 'Content:', content);
            // Fallback response
            result = {
                nextQuestion: "Pouvez-vous me décrire vos symptômes principaux ?",
                extractedSymptoms: currentSymptoms,
                isReadyForResearch: false,
                confidenceLevel: 0.3,
                suggestedFollowUps: [
                    "Depuis combien de temps ressentez-vous ces symptômes ?",
                    "Y a-t-il d'autres symptômes associés ?"
                ]
            };
        }

        // Merge with previously identified symptoms
        const allSymptoms = [...new Set([...currentSymptoms, ...(result.extractedSymptoms || [])])];
        result.extractedSymptoms = allSymptoms;

        console.log('Questionnaire - Symptômes identifiés:', allSymptoms);
        console.log('Questionnaire - Prêt pour recherche:', result.isReadyForResearch);

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Erreur Questionnaire:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur inconnue' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
