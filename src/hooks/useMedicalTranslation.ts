import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

/**
 * Hook pour traduire les termes médicaux provenant du backend
 * Utilise les traductions statiques pour les termes connus,
 * et retourne le terme original si aucune traduction n'est disponible
 */
export function useMedicalTranslation() {
    const { t, i18n } = useTranslation();

    // Traduire les systèmes corporels
    const translateBodySystem = useCallback((system: string | null | undefined): string => {
        if (!system) return '';
        const key = system.toLowerCase().replace(/[^a-z]/g, '');
        const translation = t(`medical.bodySystems.${key}`, { defaultValue: '' });
        return translation || system;
    }, [t]);

    // Traduire les spécialités médicales
    const translateSpecialty = useCallback((specialty: string | null | undefined): string => {
        if (!specialty) return '';
        const key = specialty.toLowerCase().replace(/[^a-z]/g, '');
        const translation = t(`medical.specialties.${key}`, { defaultValue: '' });
        return translation || specialty;
    }, [t]);

    // Traduire les niveaux de sévérité
    const translateSeverity = useCallback((severity: string | null | undefined): string => {
        if (!severity) return '';
        const key = severity.toLowerCase();
        const translation = t(`pathologies.severityLevels.${key}`, { defaultValue: '' });
        return translation || severity;
    }, [t]);

    // Traduire les types de traitement
    const translateTreatmentType = useCallback((type: string | null | undefined): string => {
        if (!type) return '';
        const key = type.toLowerCase();
        const translation = t(`treatments.types.${key}`, { defaultValue: '' });
        return translation || type;
    }, [t]);

    // Traduire les fréquences d'effets secondaires
    const translateFrequency = useCallback((frequency: string | null | undefined): string => {
        if (!frequency) return '';
        const frequencyMap: Record<string, string> = {
            'very_common': t('medications.frequency.veryCommon', 'Très fréquent'),
            'common': t('medications.frequency.common', 'Fréquent'),
            'uncommon': t('medications.frequency.uncommon', 'Peu fréquent'),
            'rare': t('medications.frequency.rare', 'Rare'),
            'very_rare': t('medications.frequency.veryRare', 'Très rare'),
        };
        return frequencyMap[frequency.toLowerCase()] || frequency;
    }, [t]);

    // Traduire les catégories
    const translateCategory = useCallback((category: string | null | undefined): string => {
        if (!category) return '';
        // Essayer plusieurs clés possibles
        const keys = [
            `medical.categories.${category.toLowerCase().replace(/[^a-z]/g, '')}`,
            `pathologies.categories.${category.toLowerCase().replace(/[^a-z]/g, '')}`,
        ];
        for (const key of keys) {
            const translation = t(key, { defaultValue: '' });
            if (translation) return translation;
        }
        return category;
    }, [t]);

    // Traduire un terme générique (essaie plusieurs stratégies)
    const translateTerm = useCallback((term: string | null | undefined, context?: string): string => {
        if (!term) return '';

        // Si un contexte est fourni, essayer d'abord la traduction contextuelle
        if (context) {
            const contextualKey = `${context}.${term.toLowerCase().replace(/[^a-z]/g, '')}`;
            const translation = t(contextualKey, { defaultValue: '' });
            if (translation) return translation;
        }

        return term;
    }, [t]);

    return {
        translateBodySystem,
        translateSpecialty,
        translateSeverity,
        translateTreatmentType,
        translateFrequency,
        translateCategory,
        translateTerm,
        currentLanguage: i18n.language,
    };
}
