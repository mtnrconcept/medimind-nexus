import { useEffect, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAI } from '@/contexts/AIContext';

// Cache global partagé
const cache: Record<string, Record<string, string>> = {};

// Charger le cache depuis localStorage au démarrage
if (typeof window !== 'undefined') {
    try {
        const saved = localStorage.getItem('translation-cache');
        if (saved) {
            Object.assign(cache, JSON.parse(saved));
        }
    } catch (e) {
        console.warn('Failed to load translation cache');
    }
}

// Sauvegarder le cache périodiquement
let saveTimeout: NodeJS.Timeout | null = null;
function saveCache() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            localStorage.setItem('translation-cache', JSON.stringify(cache));
        } catch (e) {
            console.warn('Failed to save translation cache');
        }
    }, 1000);
}

interface TProps {
    children: string;
    as?: keyof JSX.IntrinsicElements;
    className?: string;
}

/**
 * Composant de traduction automatique simple
 * Usage: <T>Texte en français</T>
 */
export const T = memo(function T({ children, as: Tag = 'span', className }: TProps) {
    const { i18n } = useTranslation();
    const { invokeAI } = useAI();
    const lang = i18n.language;
    const [translated, setTranslated] = useState(children);

    useEffect(() => {
        // Si français ou pas de texte, pas besoin de traduire
        if (lang === 'fr' || !children || children.trim() === '') {
            setTranslated(children);
            return;
        }

        // Vérifier le cache
        if (cache[lang]?.[children]) {
            setTranslated(cache[lang][children]);
            return;
        }

        // Traduire
        const translateText = async () => {
            try {
                const { data, error } = await invokeAI('translate', {
                    texts: [children],
                    targetLang: lang,
                    sourceLang: 'fr'
                });

                if (!error && data?.translations?.[0]) {
                    const result = data.translations[0];
                    // Mettre en cache
                    if (!cache[lang]) cache[lang] = {};
                    cache[lang][children] = result;
                    saveCache();
                    setTranslated(result);
                }
            } catch (e) {
                console.warn('Translation failed:', e);
            }
        };

        translateText();
    }, [children, invokeAI, lang]);

    return <Tag className={className}>{translated}</Tag>;
});

/**
 * Hook pour traduire un texte
 */
export function useT(text: string): string {
    const { i18n } = useTranslation();
    const { invokeAI } = useAI();
    const lang = i18n.language;
    const [translated, setTranslated] = useState(text);

    useEffect(() => {
        if (lang === 'fr' || !text) {
            setTranslated(text);
            return;
        }

        if (cache[lang]?.[text]) {
            setTranslated(cache[lang][text]);
            return;
        }

        invokeAI('translate', {
            texts: [text], targetLang: lang, sourceLang: 'fr'
        }).then(({ data, error }) => {
            if (!error && data?.translations?.[0]) {
                if (!cache[lang]) cache[lang] = {};
                cache[lang][text] = data.translations[0];
                saveCache();
                setTranslated(data.translations[0]);
            }
        }).catch(() => { });
    }, [text, invokeAI, lang]);

    return translated;
}

/**
 * Traduire un tableau de textes (pour les listes)
 */
export async function translateBatch(
    texts: string[],
    targetLang: string,
    sourceLang: string = 'fr'
): Promise<string[]> {
    if (targetLang === sourceLang || texts.length === 0) {
        return texts;
    }

    // Vérifier le cache pour chaque texte
    const results: (string | null)[] = texts.map(t => cache[targetLang]?.[t] || null);
    const toTranslate: { index: number; text: string }[] = [];

    texts.forEach((text, i) => {
        if (!results[i] && text && text.trim()) {
            toTranslate.push({ index: i, text });
        }
    });

    if (toTranslate.length === 0) {
        return results.map((r, i) => r || texts[i]);
    }

    try {
        const { data, error } = await supabase.functions.invoke('translate', {
            body: {
                texts: toTranslate.map(t => t.text),
                targetLang,
                sourceLang
            }
        });

        if (!error && data?.translations) {
            if (!cache[targetLang]) cache[targetLang] = {};
            toTranslate.forEach(({ index, text }, i) => {
                const translated = data.translations[i] || text;
                cache[targetLang][text] = translated;
                results[index] = translated;
            });
            saveCache();
        }
    } catch (e) {
        console.warn('Batch translation failed:', e);
    }

    return results.map((r, i) => r || texts[i]);
}
