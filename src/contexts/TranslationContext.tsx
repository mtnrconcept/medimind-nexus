import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface TranslationContextType {
    t: (text: string) => string;
    translateAsync: (text: string) => Promise<string>;
    translateBatch: (texts: string[]) => Promise<string[]>;
    isLoading: boolean;
    currentLang: string;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export function TranslationProvider({ children }: { children: ReactNode }) {
    const { t: i18nT, i18n } = useTranslation();
    const currentLang = i18n.language;

    // Fonction de traduction simple
    // Pour les clés i18n connues, utilise les fichiers de traduction
    // Pour les textes dynamiques (données DB), retourne le texte tel quel
    // car les données sont déjà traduites en français en base
    const t = useCallback((text: string): string => {
        if (!text || text.trim() === '') {
            return text;
        }

        // Si la langue est français, retourner le texte tel quel
        // (les données en base sont en français)
        if (currentLang === 'fr') {
            return text;
        }

        // Essayer de trouver une traduction dans les fichiers i18n
        // Les clés sont formatées comme "nav.dashboard", "common.search", etc.
        // Pour les textes simples, on essaie de les trouver
        const possibleKeys = [
            text, // Essayer le texte directement comme clé
            `common.${text.toLowerCase().replace(/\s+/g, '_')}`,
        ];

        for (const key of possibleKeys) {
            const translation = i18nT(key, { defaultValue: '' });
            if (translation && translation !== key && translation !== '') {
                return translation;
            }
        }

        // Pour les textes non traduits, retourner le texte original
        // Les données de la base de données doivent être traduites via le panneau Admin
        return text;
    }, [currentLang, i18nT]);

    // Traduction asynchrone (même logique, pas d'API)
    const translateAsync = useCallback(async (text: string): Promise<string> => {
        return t(text);
    }, [t]);

    // Traduction par lots
    const translateBatch = useCallback(async (texts: string[]): Promise<string[]> => {
        return texts.map(text => t(text));
    }, [t]);

    return (
        <TranslationContext.Provider value={{ t, translateAsync, translateBatch, isLoading: false, currentLang }}>
            {children}
        </TranslationContext.Provider>
    );
}

export function useAutoTranslation() {
    const context = useContext(TranslationContext);
    if (!context) {
        // Fallback si utilisé en dehors du provider
        return {
            t: (text: string) => text,
            translateAsync: async (text: string) => text,
            translateBatch: async (texts: string[]) => texts,
            isLoading: false,
            currentLang: 'fr'
        };
    }
    return context;
}

// Composant helper pour traduire du texte
interface AutoTranslateTextProps {
    children: string;
    as?: keyof JSX.IntrinsicElements;
    className?: string;
}

export function AutoTranslateText({ children, as: Tag = 'span', className }: AutoTranslateTextProps) {
    const { t } = useAutoTranslation();
    return <Tag className={className}>{t(children)}</Tag>;
}

// Export alias pour utilisation facile
export const AT = AutoTranslateText;
