import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type LLMMode = 'cloud' | 'local';

interface AIContextType {
    llmMode: LLMMode;
    setLLMMode: (mode: LLMMode) => void;
    localLLMConfig: {
        baseUrl: string;
        model: string;
    };
    invokeAI: (functionName: string, body: any) => Promise<{ data: any; error: any }>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [llmMode, setLLMModeState] = useState<LLMMode>(() => {
        const saved = localStorage.getItem('medimind_llm_mode');
        return (saved as LLMMode) || 'cloud';
    });

    const localLLMConfig = {
        baseUrl: 'https://d3f432aacf5a.ngrok-free.app/v1',
        model: 'meditron-7b',
    };

    const setLLMMode = (mode: LLMMode) => {
        setLLMModeState(mode);
        localStorage.setItem('medimind_llm_mode', mode);
        toast.info(`Mode IA changé : ${mode === 'cloud' ? 'Cloud (Gemini/Claude)' : 'Local (Meditron)'}`);
    };

    const invokeAI = async (functionName: string, body: any) => {
        if (llmMode === 'cloud') {
            return await supabase.functions.invoke(functionName, { body });
        } else {
            console.log(`[AI-Local] Invoking ${functionName} with local LLM...`);
            try {
                // Generic prompt generation for local LLM
                const prompt = `System: Tu es une IA médicale experte (Meditron). 
Tu dois agir comme la fonction backend "${functionName}".
Données d'entrée (JSON) : ${JSON.stringify(body)}

Directives : 
- Analyse les données.
- Retourne TOUJOURS un JSON valide correspondant au format attendu par cette fonction.
- Pas de texte explicatif en dehors du JSON.

Réponse :`;

                const response = await fetch(`${localLLMConfig.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: localLLMConfig.model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.2,
                    }),
                });

                if (!response.ok) throw new Error(`Local LLM error: ${response.statusText}`);

                const result = await response.json();
                const content = result.choices[0]?.message?.content || '{}';

                // Clean and parse JSON from local LLM
                try {
                    const cleanedContent = content.replace(/```json|```/g, '').trim();
                    const data = JSON.parse(cleanedContent);
                    return { data, error: null };
                } catch (e) {
                    console.error('[AI-Local] Parse error:', e, content);
                    return { data: null, error: new Error('Failed to parse JSON from local LLM') };
                }
            } catch (err: any) {
                console.error('[AI-Local] Error:', err);
                return { data: null, error: err };
            }
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
