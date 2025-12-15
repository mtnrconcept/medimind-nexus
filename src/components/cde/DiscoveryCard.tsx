import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
    AlertTriangle, CheckCircle2, XCircle, Clock,
    ChevronRight, ExternalLink, FileText, Beaker,
    Scale, Activity, ShieldCheck, ShieldAlert, ShieldX,
    Loader2, RefreshCw, AlertCircle, Stethoscope, Pill, FlaskConical, Target
} from 'lucide-react';

interface DiscoveryCardProps {
    data: {
        id: string;
        title: string;
        hypothesis: string;
        reasoning_chain: any[];
        novelty: string;
        evidence_level: string;
        severity_score: number;
        plausibility_score: number;
        status: string;
        sources: any[];
        recommended_actions: string[];
        created_at: string;
        reviewed_at: string | null;
        validation_status?: string;
        validation_result?: any;
        validation_errors?: string[];
    };
    onUpdateStatus: (id: string, status: string) => void;
    onRefresh?: () => void;
}

const DiscoveryCard = ({ data, onUpdateStatus, onRefresh }: DiscoveryCardProps) => {
    const { t } = useAutoTranslation();
    const [isValidating, setIsValidating] = useState(false);

    const handleValidate = async () => {
        setIsValidating(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Non connecté');

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-hypothesis`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({ discoveryId: data.id }),
                }
            );

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            toast.success(t(`Validation terminée: ${result.validation_status}`));
            onRefresh?.();
        } catch (err: any) {
            console.error('Validation error:', err);
            toast.error(err.message || t('Erreur de validation'));
        } finally {
            setIsValidating(false);
        }
    };

    const getValidationStatusConfig = (status?: string) => {
        switch (status) {
            case 'validated':
                return {
                    color: 'bg-green-100 text-green-800 border-green-300',
                    icon: ShieldCheck,
                    label: t('Validé'),
                    bgColor: 'bg-green-50 dark:bg-green-900/20'
                };
            case 'validating':
                return {
                    color: 'bg-blue-100 text-blue-800 border-blue-300',
                    icon: Loader2,
                    label: t('Validation...'),
                    bgColor: 'bg-blue-50 dark:bg-blue-900/20'
                };
            case 'needs_review':
                return {
                    color: 'bg-amber-100 text-amber-800 border-amber-300',
                    icon: ShieldAlert,
                    label: t('À vérifier'),
                    bgColor: 'bg-amber-50 dark:bg-amber-900/20'
                };
            case 'rejected':
                return {
                    color: 'bg-red-100 text-red-800 border-red-300',
                    icon: ShieldX,
                    label: t('Rejeté'),
                    bgColor: 'bg-red-50 dark:bg-red-900/20'
                };
            default:
                return {
                    color: 'bg-slate-100 text-slate-800 border-slate-300',
                    icon: Clock,
                    label: t('En attente'),
                    bgColor: 'bg-slate-50 dark:bg-slate-900/20'
                };
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'raw_signal':
                return {
                    color: 'bg-amber-100 text-amber-800 border-amber-300',
                    icon: Clock,
                    label: t('Signal brut')
                };
            case 'plausible':
                return {
                    color: 'bg-blue-100 text-blue-800 border-blue-300',
                    icon: Beaker,
                    label: t('Plausible')
                };
            case 'corroborated':
                return {
                    color: 'bg-purple-100 text-purple-800 border-purple-300',
                    icon: Scale,
                    label: t('Corroboré')
                };
            case 'confirmed':
                return {
                    color: 'bg-green-100 text-green-800 border-green-300',
                    icon: CheckCircle2,
                    label: t('Confirmé')
                };
            case 'refuted':
                return {
                    color: 'bg-red-100 text-red-800 border-red-300',
                    icon: XCircle,
                    label: t('Réfuté')
                };
            default:
                return {
                    color: 'bg-slate-100 text-slate-800 border-slate-300',
                    icon: Activity,
                    label: status
                };
        }
    };

    const getNoveltyBadge = (novelty: string) => {
        switch (novelty) {
            case 'unknown':
                return <Badge variant="outline" className="bg-purple-50 text-purple-700">{t('Inconnu')}</Badge>;
            case 'emerging':
                return <Badge variant="outline" className="bg-orange-50 text-orange-700">{t('Émergent')}</Badge>;
            case 'controversial':
                return <Badge variant="outline" className="bg-red-50 text-red-700">{t('Controversé')}</Badge>;
            case 'known':
                return <Badge variant="outline" className="bg-green-50 text-green-700">{t('Connu')}</Badge>;
            case 'novel':
                return <Badge variant="outline" className="bg-violet-50 text-violet-700">{t('Nouveau')}</Badge>;
            default:
                return null;
        }
    };

    const getEvidenceBadge = (level: string) => {
        const colors: Record<string, string> = {
            'in_vitro': 'bg-slate-100 text-slate-700',
            'case_report': 'bg-blue-50 text-blue-700',
            'observational': 'bg-cyan-50 text-cyan-700',
            'rct': 'bg-green-50 text-green-700',
            'meta_analysis': 'bg-emerald-50 text-emerald-700',
            'guideline': 'bg-purple-50 text-purple-700',
            'ai_inferred': 'bg-violet-50 text-violet-700',
        };
        const labels: Record<string, string> = {
            'in_vitro': 'In vitro',
            'case_report': t('Cas clinique'),
            'observational': t('Observationnel'),
            'rct': 'RCT',
            'meta_analysis': t('Méta-analyse'),
            'guideline': 'Guideline',
            'ai_inferred': t('Inférence IA'),
        };
        return (
            <Badge variant="outline" className={colors[level] || 'bg-slate-100'}>
                {labels[level] || level}
            </Badge>
        );
    };

    // Get target info from sources
    const getTargetInfo = () => {
        if (!data.sources || data.sources.length === 0) return null;

        const targetSource = data.sources.find((s: any) => s.target_type || s.target_name);
        if (!targetSource) return null;

        const targetType = targetSource.target_type;
        const targetName = targetSource.target_name || targetSource.title;

        if (!targetName) return null;

        const config: Record<string, { icon: any, color: string, label: string }> = {
            'pathology': { icon: Stethoscope, color: 'bg-rose-100 text-rose-700 border-rose-300', label: 'Pathologie' },
            'medication': { icon: Pill, color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'Médicament' },
            'substance': { icon: FlaskConical, color: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Substance' },
            'treatment': { icon: Activity, color: 'bg-purple-100 text-purple-700 border-purple-300', label: 'Traitement' },
        };

        const typeConfig = config[targetType] || { icon: Target, color: 'bg-slate-100 text-slate-700 border-slate-300', label: 'Cible' };
        const TargetIcon = typeConfig.icon;

        return (
            <Badge className={`${typeConfig.color} border`}>
                <TargetIcon className="h-3 w-3 mr-1" />
                {targetName}
            </Badge>
        );
    };

    const statusConfig = getStatusConfig(data.status);
    const StatusIcon = statusConfig.icon;
    const validationConfig = getValidationStatusConfig(data.validation_status);
    const ValidationIcon = validationConfig.icon;

    const severityColor = data.severity_score >= 0.7
        ? 'text-red-600'
        : data.severity_score >= 0.4
            ? 'text-amber-600'
            : 'text-green-600';

    const validationScore = data.validation_result?.score;

    return (
        <Card className={`backdrop-blur border-white/30 shadow-lg hover:shadow-xl transition-all ${validationConfig.bgColor}`}>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {/* Validation Status Badge */}
                            <Badge className={`${validationConfig.color} border`}>
                                <ValidationIcon className={`h-3 w-3 mr-1 ${data.validation_status === 'validating' ? 'animate-spin' : ''}`} />
                                {validationConfig.label}
                                {validationScore !== undefined && (
                                    <span className="ml-1">({Math.round(validationScore * 100)}%)</span>
                                )}
                            </Badge>

                            <Badge className={`${statusConfig.color} border`}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statusConfig.label}
                            </Badge>
                            {data.novelty && getNoveltyBadge(data.novelty)}
                            {data.evidence_level && getEvidenceBadge(data.evidence_level)}
                            {/* Target Badge */}
                            {getTargetInfo()}
                        </div>
                        <CardTitle className="text-lg text-slate-800 dark:text-slate-200">
                            {data.title}
                        </CardTitle>
                    </div>
                    <div className="text-right space-y-1">
                        <div className="flex items-center gap-1 text-sm text-slate-500">
                            <AlertTriangle className={`h-4 w-4 ${severityColor}`} />
                            <span className={severityColor}>
                                {t('Risque')}: {Math.round(data.severity_score * 100)}%
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-slate-500">
                            <CheckCircle2 className={`h-4 w-4 ${data.plausibility_score >= 0.7 ? 'text-green-600' : data.plausibility_score >= 0.4 ? 'text-amber-600' : 'text-slate-400'}`} />
                            <span className={data.plausibility_score >= 0.7 ? 'text-green-600' : data.plausibility_score >= 0.4 ? 'text-amber-600' : 'text-slate-400'}>
                                {t('Bénéfice')}: {Math.round(data.plausibility_score * 100)}%
                            </span>
                        </div>
                        <div className="text-xs text-slate-400">
                            {new Date(data.created_at).toLocaleDateString('fr-FR')}
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Validation Errors Alert */}
                {data.validation_errors && data.validation_errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-2">
                            <AlertCircle className="h-4 w-4" />
                            <span className="font-medium text-sm">{t('Erreurs détectées')}</span>
                        </div>
                        <ul className="space-y-1">
                            {data.validation_errors.map((error, idx) => (
                                <li key={idx} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
                                    <span>•</span>
                                    <span>{error}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Hypothesis */}
                <div className="p-3 rounded-lg bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200/50">
                    <p className="text-sm font-medium text-violet-800 dark:text-violet-300 mb-1">
                        {t('Hypothèse')}
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">{data.hypothesis}</p>
                </div>

                {/* Reasoning Chain */}
                {data.reasoning_chain && data.reasoning_chain.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            {t('Chaîne de raisonnement')}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            {data.reasoning_chain.map((step, index) => (
                                <div key={index} className="flex items-center gap-1">
                                    <span className="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                        {typeof step === 'string' ? step : step.fact || step.label}
                                    </span>
                                    {index < data.reasoning_chain.length - 1 && (
                                        <ChevronRight className="h-4 w-4 text-slate-400" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recommended Actions */}
                {data.recommended_actions && data.recommended_actions.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            {t('Actions recommandées')}
                        </p>
                        <ul className="space-y-1">
                            {data.recommended_actions.map((action, index) => (
                                <li key={index} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                    {action}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                    <div className="flex gap-2 flex-wrap">
                        {/* Validation Button */}
                        {(!data.validation_status || data.validation_status === 'pending') && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleValidate}
                                disabled={isValidating}
                                className="gap-1 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                            >
                                {isValidating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ShieldCheck className="h-4 w-4" />
                                )}
                                {t('Valider')}
                            </Button>
                        )}

                        {/* Re-validate Button */}
                        {data.validation_status && data.validation_status !== 'pending' && data.validation_status !== 'validating' && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleValidate}
                                disabled={isValidating}
                                className="gap-1 text-slate-500"
                            >
                                <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                                {t('Revalider')}
                            </Button>
                        )}

                        {data.status !== 'confirmed' && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onUpdateStatus(data.id, 'confirmed')}
                                className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                {t('Confirmer')}
                            </Button>
                        )}
                        {data.status !== 'refuted' && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onUpdateStatus(data.id, 'refuted')}
                                className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                <XCircle className="h-4 w-4" />
                                {t('Réfuter')}
                            </Button>
                        )}
                        {data.status === 'raw_signal' && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onUpdateStatus(data.id, 'plausible')}
                                className="gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                                <Beaker className="h-4 w-4" />
                                {t('Plausible')}
                            </Button>
                        )}
                    </div>
                    {data.reviewed_at && (
                        <span className="text-xs text-slate-400">
                            {t('Revu le')} {new Date(data.reviewed_at).toLocaleDateString('fr-FR')}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default DiscoveryCard;

