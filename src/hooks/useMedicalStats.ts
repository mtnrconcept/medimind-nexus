import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MedicalStats {
    openfda: {
        adverse_events: number;
        drug_labels: number;
        ndc_directory: number;
        drugs_at_fda: number;
        enforcement: number;
    };
    icd10: {
        diagnosis_codes: number;
    };
    drugbank: {
        drugs: number;
        interactions: number;
    };
    total: number;
    last_updated: string;
    sources: string[];
}

export interface MedicalStatsDisplay {
    adverseEvents: { count: number; label: string };
    medications: { count: number; label: string };
    diagnoses: { count: number; label: string };
    interactions: { count: number; label: string };
    labels: { count: number; label: string };
    total: number;
    sources: string[];
    lastUpdated: string;
}

export function useMedicalStats() {
    const [stats, setStats] = useState<MedicalStatsDisplay | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/medical-stats`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': session ? `Bearer ${session.access_token}` : '',
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    },
                }
            );

            if (!response.ok) {
                throw new Error('Erreur de récupération des statistiques');
            }

            const data: MedicalStats = await response.json();

            // Transformer les données pour l'affichage
            const displayStats: MedicalStatsDisplay = {
                adverseEvents: {
                    count: data.openfda.adverse_events,
                    label: 'Événements Indésirables',
                },
                medications: {
                    count: data.openfda.ndc_directory + data.openfda.drugs_at_fda + data.drugbank.drugs,
                    label: 'Médicaments',
                },
                diagnoses: {
                    count: data.icd10.diagnosis_codes,
                    label: 'Diagnostics ICD-10',
                },
                interactions: {
                    count: data.drugbank.interactions,
                    label: 'Interactions Médicamenteuses',
                },
                labels: {
                    count: data.openfda.drug_labels,
                    label: 'Étiquetages FDA',
                },
                total: data.total,
                sources: data.sources,
                lastUpdated: data.last_updated,
            };

            setStats(displayStats);
        } catch (err) {
            console.error('Medical stats error:', err);
            setError(err instanceof Error ? err.message : 'Erreur inconnue');

            // Stats de fallback
            setStats({
                adverseEvents: { count: 19684585, label: 'Événements Indésirables' },
                medications: { count: 176263, label: 'Médicaments' },
                diagnoses: { count: 69832, label: 'Diagnostics ICD-10' },
                interactions: { count: 1413413, label: 'Interactions Médicamenteuses' },
                labels: { count: 252123, label: 'Étiquetages FDA' },
                total: 21603527,
                sources: ['OpenFDA', 'ICD-10-CM', 'DrugBank 6.0'],
                lastUpdated: new Date().toISOString(),
            });
        } finally {
            setLoading(false);
        }
    };

    // Formater les grands nombres
    const formatNumber = (num: number): string => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    };

    return { stats, loading, error, formatNumber, refetch: fetchStats };
}

export default useMedicalStats;
