import React, { createContext, useContext, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LLMMode = 'cloud' | 'local';

interface AIContextType {
    llmMode: LLMMode;
    setLLMMode: (mode: LLMMode) => void;
    localLLMConfig: {
        baseUrl: string; // ex: http://localhost:1234/v1
        model: string;
        requestTimeoutMs: number;
        maxTokens: number;
    };
    invokeAI: (functionName: string, body: any) => Promise<{ data: any; error: any }>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

// Registry of function descriptions for local LLMs (emulates edge functions logic)
const FUNCTION_REGISTRY: Record<string, { instruction: string; schema: string }> = {
    'symptom-questionnaire': {
        instruction: `Tu es un assistant médical expert francophone. Tu fais l'anamnèse (recueil des symptômes).

RÈGLES:
1. Pose UNE question à la fois en français
2. Explore: localisation, intensité, durée, facteurs aggravants
3. NE FAIS PAS de diagnostic
4. Après 4-6 échanges ou 3+ symptômes clairs, mets isReadyForResearch à true`,
        schema: '{"nextQuestion": "...", "extractedSymptoms": [], "isReadyForResearch": false, "confidenceLevel": 0.5, "suggestedFollowUps": []}'
    },
    'ai-assistant': {
        instruction: "Réponds de façon factuelle et médicale. Inclus une analyse des risques.",
        schema: '{"content": "Analyse clinique basée sur les données fournies.", "redFlags": "Aucun"}'
    },
    'patient-health-synthesis': {
        instruction: "Analyse globale du dossier patient.",
        schema: '{"global_synthesis": "Texte", "health_score": 70, "risk_level": "low", "vigilance_points": [], "weak_signals": [], "treatment_recommendations": [], "prevention_alerts": [], "lifestyle_advice": [], "drug_interactions": [], "summary_for_patient": "Résumé", "redFlags": "Aucun"}'
    },
    'deep-research': {
        instruction: "Analyse les symptômes et identifie les pathologies possibles avec leur probabilité.",
        schema: '{"pathologies": [{"name": "Nom", "confidence": "high", "matchedSymptoms": [], "description": "Description", "severity": "moderate", "sources": [], "isInDatabase": false}], "summary": "Résumé", "differentialDiagnosis": "Diagnostic différentiel", "redFlags": [], "recommendedTests": [], "webSourcesCount": 0}'
    }
};


function extractJsonFromText(text: string): any {
    const trimmed = (text ?? '').trim();

    // 1) Remove fenced code blocks if present
    // e.g. ```json { ... } ```
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;

    // 2) Find the first '{' and last '}' (most robust for "JSON + extra text")
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');

    if (first === -1 || last === -1 || last <= first) {
        throw new Error('No JSON object found in response');
    }

    const jsonSlice = candidate.slice(first, last + 1).trim();
    return JSON.parse(jsonSlice);
}

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [llmMode, setLLMModeState] = useState<LLMMode>(() => {
        const saved = localStorage.getItem('medimind_llm_mode');
        return (saved as LLMMode) || 'cloud';
    });

    /**
     * Recommandation forte:
     * - Évite ngrok depuis le navigateur (CORS + instabilité).
     * - Utilise l’API locale LM Studio, typiquement: http://localhost:1234/v1
     * Si tu veux malgré tout ngrok, il faudra un proxy backend ou des headers CORS côté serveur.
     */
    const localLLMConfig = {
        baseUrl: 'http://localhost:1234/v1',
        model: 'openai/gpt-oss-20b',
        requestTimeoutMs: 300000, // 5 min for larger model
        maxTokens: 2048,
    };



    const setLLMMode = (mode: LLMMode) => {
        setLLMModeState(mode);
        localStorage.setItem('medimind_llm_mode', mode);
        toast.info(`Mode IA changé : ${mode === 'cloud' ? 'Cloud (Gemini/Claude)' : 'Local (Meditron)'}`);
    };

    const invokeAI = async (functionName: string, body: any) => {
        if (llmMode === 'cloud') {
            return await supabase.functions.invoke(functionName, { body });
        }

        console.log(`[AI-Local] Invoking ${functionName} with local LLM...`);

        // Timeout dur côté client (évite les "ça tourne 10 minutes")
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), localLLMConfig.requestTimeoutMs);

        try {
            /**
             * Important:
             * - Message system séparé => meilleure obéissance
             * - Prompt court => évite de saturer n_ctx
             * - max_tokens + stop => évite génération infinie
             */
            const regEntry = FUNCTION_REGISTRY[functionName];
            const systemPrompt = [
                '### INSTRUCTION:',
                'Tu es un automate de traitement de données médicales.',
                `TACHE: ${regEntry?.instruction || 'Extraire les données demandées.'}`,
                '',
                '### CONTRAINTE CRITIQUE:',
                'Réponds UNIQUEMENT avec l\'objet JSON. Ne copie pas les instructions dans la réponse.',
                'Ne change pas les noms des champs JSON du schéma.',
                '',
                '### SCHEMA DE SORTIE OBLIGATOIRE:',
                regEntry?.schema || '{"result": "string"}',
            ].join('\n');

            // Build conversation context for questionnaire
            let conversationContext = '';
            if (functionName === 'symptom-questionnaire' && body.conversationHistory?.length > 0) {
                conversationContext = '\n### HISTORIQUE CONVERSATION:\n' +
                    body.conversationHistory.map((m: any) =>
                        `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content}`
                    ).join('\n') +
                    '\n\n### INSTRUCTION: Pose une question de suivi basée sur la conversation.';
            }

            const userPrompt = `### DONNEES ENTREE (JSON):\n${JSON.stringify(body)}${conversationContext}\n\n### REPONSE JSON:`;

            const response = await fetch(`${localLLMConfig.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    model: localLLMConfig.model,
                    stream: false,
                    temperature: 0.1,
                    top_p: 0.9,
                    max_tokens: localLLMConfig.maxTokens,
                    stop: ['\nUser:', '\nUtilisateur:', '\nSystem:', '\nAssistant:', '\n###', '</s>'],
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                }),
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`Local LLM error: ${response.status} ${response.statusText} ${errText}`);
            }

            const result = await response.json();
            const content: string = result?.choices?.[0]?.message?.content ?? '';

            if (!content || content.trim().length === 0) {
                console.error('[AI-Local] Model returned empty content');
                throw new Error('Local LLM returned an empty response');
            }

            try {
                const rawData = extractJsonFromText(content);

                // Normalize local model output to expected schema (mirroring cloud logic)
                const normalizeLocalResponse = (fn: string, data: any, requestBody: any): any => {
                    if (fn === 'symptom-questionnaire') {
                        // Merge with previously identified symptoms (like cloud edge function does)
                        const previousSymptoms = requestBody?.identifiedSymptoms || [];
                        const rawSymptoms = data.extractedSymptoms || data.symptoms || data.key_points || [];

                        // Filter out placeholder values that the model might have copied
                        const validSymptoms = rawSymptoms.filter((s: string) =>
                            s && !s.includes('symptôme') && !s.includes('...') && s.length > 2
                        );
                        const allSymptoms = [...new Set([...previousSymptoms, ...validSymptoms])];

                        // Detect placeholder question and provide sensible fallback
                        let question = data.nextQuestion || data.question || data.summary || '';
                        const isPlaceholder = !question || question.includes('...') || question.includes('ciblée') || question.length < 10;

                        if (isPlaceholder) {
                            const turnCount = requestBody?.conversationHistory?.length || 0;
                            if (turnCount === 0) {
                                question = "Bonjour, quels symptômes ressentez-vous aujourd'hui ?";
                            } else if (allSymptoms.length === 0) {
                                question = "Pouvez-vous me décrire vos symptômes principaux ?";
                            } else if (allSymptoms.length < 3) {
                                question = "Y a-t-il d'autres symptômes associés ?";
                            } else {
                                question = "Avez-vous d'autres informations à ajouter ?";
                            }
                        }

                        return {
                            nextQuestion: question,
                            extractedSymptoms: allSymptoms,
                            isReadyForResearch: data.isReadyForResearch ?? (allSymptoms.length >= 3),
                            confidenceLevel: data.confidenceLevel ?? Math.min(0.3 + (allSymptoms.length * 0.2), 1.0),
                            suggestedFollowUps: (data.suggestedFollowUps || []).filter((s: string) => !s?.includes('alternative')),
                        };
                    }
                    if (fn === 'ai-assistant') {
                        return {
                            content: data.content || data.summary || JSON.stringify(data),
                            redFlags: data.redFlags || data.red_flags?.join(', ') || "Aucun",
                        };
                    }
                    if (fn === 'patient-health-synthesis') {
                        return {
                            global_synthesis: data.global_synthesis || data.summary || "Synthèse non disponible.",
                            health_score: data.health_score ?? 50,
                            risk_level: data.risk_level || 'moderate',
                            vigilance_points: data.vigilance_points || [],
                            weak_signals: data.weak_signals || [],
                            treatment_recommendations: data.treatment_recommendations || [],
                            prevention_alerts: data.prevention_alerts || [],
                            lifestyle_advice: data.lifestyle_advice || [],
                            drug_interactions: data.drug_interactions || [],
                            summary_for_patient: data.summary_for_patient || data.summary || "Consultez votre médecin.",
                        };
                    }
                    return data; // Fallback: return as-is
                };

                const data = normalizeLocalResponse(functionName, rawData, body);
                console.log(`[AI-Local] Successfully parsed and normalized response for ${functionName}`);
                return { data, error: null };
            } catch (e) {
                console.error('[AI-Local] Parse error:', e);
                console.log('[AI-Local] Raw content that failed to parse:', content);
                return { data: null, error: new Error('Failed to parse JSON from local LLM response') };
            }
        } catch (err: any) {
            const aborted = err?.name === 'AbortError';
            if (aborted) {
                return {
                    data: null,
                    error: new Error(
                        `Local LLM request timed out after ${localLLMConfig.requestTimeoutMs}ms. Reduce prompt/RAG size or increase timeout.`
                    ),
                };
            }
            console.error('[AI-Local] Error:', err);
            return { data: null, error: err };
        } finally {
            clearTimeout(timeout);
        }
    };

    return (
        <AIContext.Provider value={{ llmMode, setLLMMode, localLLMConfig, invokeAI }}>
            {children}
        </AIContext.Provider>
    );
};

export const useAI = () => {
    const context = useContext(AIContext);
    if (context === undefined) {
        throw new Error('useAI must be used within an AIProvider');
    }
    return context;
};
