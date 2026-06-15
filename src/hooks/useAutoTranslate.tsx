import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAI } from '@/contexts/AIContext';

// Cache global des traductions pour persister entre les rendus
const globalTranslationCache: Record<string, Record<string, string>> = {};

// File d'attente pour les traductions par lot
let translationQueue: { text: string; resolve: (value: string) => void }[] = [];
let queueTimeout: NodeJS.Timeout | null = null;

interface UseAutoTranslateOptions {
    enabled?: boolean;
    batchSize?: number;
    debounceMs?: number;
}

export function useAutoTranslate(options: UseAutoTranslateOptions = {}) {
    const { enabled = true, batchSize = 50, debounceMs = 100 } = options;
    const { i18n } = useTranslation();
    const { invokeAI } = useAI();
    const currentLang = i18n.language;
    const [isTranslating, setIsTranslating] = useState(false);

    // Initialiser le cache pour la langue courante
    if (!globalTranslationCache[currentLang]) {
        globalTranslationCache[currentLang] = {};
    }

    // Fonction pour traiter la file d'attente
    const processQueue = useCallback(async () => {
        if (translationQueue.length === 0) return;

        const queueToProcess = [...translationQueue];
        translationQueue = [];

        // Séparer les textes en cache et à traduire
        const textsToTranslate: string[] = [];
        const textIndexMap: Map<string, number[]> = new Map();

        queueToProcess.forEach((item, index) => {
            const cached = globalTranslationCache[currentLang]?.[item.text];
            if (cached) {
                item.resolve(cached);
            } else {
                if (!textIndexMap.has(item.text)) {
                    textIndexMap.set(item.text, []);
                    textsToTranslate.push(item.text);
                }
                textIndexMap.get(item.text)!.push(index);
            }
        });

        if (textsToTranslate.length === 0) return;

        // Si la langue est français (source), pas besoin de traduire
        if (currentLang === 'fr') {
            textsToTranslate.forEach(text => {
                globalTranslationCache[currentLang][text] = text;
                textIndexMap.get(text)?.forEach(idx => {
                    queueToProcess[idx].resolve(text);
                });
            });
            return;
        }

        setIsTranslating(true);

        try {
            // Appeler l'Edge Function par lots
            for (let i = 0; i < textsToTranslate.length; i += batchSize) {
                const batch = textsToTranslate.slice(i, i + batchSize);

                const { data, error } = await invokeAI('translate', {
                    texts: batch,
                    targetLang: currentLang,
                    sourceLang: 'fr'
                });

                if (error) {
                    console.error('Translation error:', error);
                    // En cas d'erreur, utiliser les textes originaux
                    batch.forEach((text, j) => {
                        globalTranslationCache[currentLang][text] = text;
                        textIndexMap.get(text)?.forEach(idx => {
                            queueToProcess[idx].resolve(text);
                        });
                    });
                } else if (data?.translations) {
                    batch.forEach((text, j) => {
                        const translated = data.translations[j] || text;
                        globalTranslationCache[currentLang][text] = translated;
                        textIndexMap.get(text)?.forEach(idx => {
                            queueToProcess[idx].resolve(translated);
                        });
                    });
                }
            }
        } catch (error) {
            console.error('Translation service error:', error);
            // Fallback: utiliser les textes originaux
            textsToTranslate.forEach(text => {
                globalTranslationCache[currentLang][text] = text;
                textIndexMap.get(text)?.forEach(idx => {
                    queueToProcess[idx].resolve(text);
                });
            });
        } finally {
            setIsTranslating(false);
        }
    }, [batchSize, currentLang, invokeAI]);

    // Fonction pour ajouter un texte à la file d'attente
    const translate = useCallback((text: string): Promise<string> => {
        if (!enabled || !text || text.trim() === '') {
            return Promise.resolve(text);
        }

        // Vérifier le cache d'abord
        const cached = globalTranslationCache[currentLang]?.[text];
        if (cached) {
            return Promise.resolve(cached);
        }

        // Ajouter à la file d'attente
        return new Promise((resolve) => {
            translationQueue.push({ text, resolve });

            // Débouncer le traitement
            if (queueTimeout) {
                clearTimeout(queueTimeout);
            }
            queueTimeout = setTimeout(() => {
                processQueue();
            }, debounceMs);
        });
    }, [enabled, currentLang, processQueue, debounceMs]);

    // Traduction synchrone (retourne le cache ou le texte original)
    const translateSync = useCallback((text: string): string => {
        if (!text || text.trim() === '') return text;

        const cached = globalTranslationCache[currentLang]?.[text];
        if (cached) return cached;

        // Déclencher une traduction async en arrière-plan
        translate(text);

        // Retourner le texte original en attendant
        return text;
    }, [currentLang, translate]);

    // Traduction d'un tableau de textes
    const translateAll = useCallback(async (texts: string[]): Promise<string[]> => {
        if (!enabled || texts.length === 0) {
            return texts;
        }
        return Promise.all(texts.map(text => translate(text)));
    }, [enabled, translate]);

    return {
        translate,
        translateSync,
        translateAll,
        isTranslating,
        currentLang,
        cache: globalTranslationCache[currentLang] || {}
    };
}

// Composant wrapper pour la traduction automatique
interface AutoTranslateProps {
    text: string;
    fallback?: string;
    className?: string;
    as?: keyof JSX.IntrinsicElements;
}

export function AutoTranslate({
    text,
    fallback,
    className,
    as: Component = 'span'
}: AutoTranslateProps) {
    const { translateSync } = useAutoTranslate();
    const translated = translateSync(text);

    return (
        <Component className={className}>
            {translated || fallback || text}
        </Component>
    );
}
