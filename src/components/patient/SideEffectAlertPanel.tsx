/**
 * SideEffectAlertPanel - AI-powered side effect detection alerts
 * Displays detected medication side effects with timeline and recommendations
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Pill,
    Calendar,
    Brain,
    Check,
    X,
    Loader2,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SideEffectAlert {
    id: string;
    patient_id: string;
    suspected_medication_name: string;
    medication_start_date: string | null;
    biomarker_name: string;
    biomarker_category: string;
    baseline_value: number;
    current_value: number;
    unit: string;
    change_percent: number;
    trend_description: string;
    ai_confidence: number;
    ai_recommendation: string;
    ai_reasoning: string;
    status: 'pending' | 'acknowledged' | 'dismissed' | 'resolved' | 'escalated';
    created_at: string;
}

interface SideEffectAlertPanelProps {
    patientId: string;
    onAlertCountChange?: (count: number) => void;
}

const STATUS_CONFIG = {
    pending: { label: 'En attente', color: 'bg-yellow-500', icon: AlertTriangle },
    acknowledged: { label: 'Pris en compte', color: 'bg-blue-500', icon: Check },
    dismissed: { label: 'Écarté', color: 'bg-gray-500', icon: X },
    resolved: { label: 'Résolu', color: 'bg-green-500', icon: Check },
    escalated: { label: 'Escaladé', color: 'bg-red-500', icon: AlertTriangle },
};

const CATEGORY_ICONS: Record<string, string> = {
    liver: '🫀',
    kidney: '🫘',
    hematology: '🩸',
    thyroid: '🦋',
    metabolic: '🔬',
    muscle: '💪',
    electrolyte: '⚡',
};

export const SideEffectAlertPanel = ({ patientId, onAlertCountChange }: SideEffectAlertPanelProps) => {
    const [alerts, setAlerts] = useState<SideEffectAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());

    const fetchAlerts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('side_effect_alerts')
            .select('*')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching alerts:', error);
            toast.error('Erreur chargement alertes');
        } else {
            setAlerts(data || []);
            onAlertCountChange?.(data?.filter(a => a.status === 'pending').length || 0);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAlerts();
    }, [patientId]);

    const runAnalysis = async () => {
        setAnalyzing(true);
        try {
            const { data, error } = await supabase.functions.invoke('detect-side-effects', {
                body: { patient_id: patientId }
            });

            if (error) throw error;

            toast.success(data.message || 'Analyse terminée');
            fetchAlerts();
        } catch (error: any) {
            console.error('Analysis error:', error);
            toast.error('Erreur analyse: ' + (error.message || 'Unknown'));
        } finally {
            setAnalyzing(false);
        }
    };

    const updateAlertStatus = async (alertId: string, newStatus: string) => {
        const { error } = await supabase
            .from('side_effect_alerts')
            .update({
                status: newStatus,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', alertId);

        if (error) {
            toast.error('Erreur mise à jour');
        } else {
            toast.success('Statut mis à jour');
            fetchAlerts();
        }
    };

    const toggleExpand = (alertId: string) => {
        const newExpanded = new Set(expandedAlerts);
        if (newExpanded.has(alertId)) {
            newExpanded.delete(alertId);
        } else {
            newExpanded.add(alertId);
        }
        setExpandedAlerts(newExpanded);
    };

    const pendingCount = alerts.filter(a => a.status === 'pending').length;

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    <span className="font-medium">Détection IA d'effets secondaires</span>
                    {pendingCount > 0 && (
                        <Badge variant="destructive" className="ml-2">
                            {pendingCount} en attente
                        </Badge>
                    )}
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={runAnalysis}
                    disabled={analyzing}
                >
                    {analyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {analyzing ? 'Analyse...' : 'Analyser'}
                </Button>
            </div>

            {alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Aucune alerte détectée</p>
                    <p className="text-sm mt-1">Cliquez sur "Analyser" pour scanner les tendances biologiques</p>
                </div>
            ) : (
                <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                        {alerts.map((alert) => {
                            const StatusIcon = STATUS_CONFIG[alert.status]?.icon || AlertTriangle;
                            const isExpanded = expandedAlerts.has(alert.id);
                            const isPositiveTrend = alert.change_percent > 0;

                            return (
                                <Collapsible
                                    key={alert.id}
                                    open={isExpanded}
                                    onOpenChange={() => toggleExpand(alert.id)}
                                >
                                    <Card className={`border-l-4 ${alert.status === 'pending' ? 'border-l-yellow-500' :
                                            alert.status === 'escalated' ? 'border-l-red-500' :
                                                'border-l-gray-300'
                                        }`}>
                                        <CollapsibleTrigger asChild>
                                            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-start gap-3">
                                                        <div className="text-2xl">
                                                            {CATEGORY_ICONS[alert.biomarker_category] || '🔬'}
                                                        </div>
                                                        <div>
                                                            <CardTitle className="text-sm flex items-center gap-2">
                                                                {alert.biomarker_name}
                                                                {isPositiveTrend ? (
                                                                    <TrendingUp className="h-4 w-4 text-red-500" />
                                                                ) : (
                                                                    <TrendingDown className="h-4 w-4 text-blue-500" />
                                                                )}
                                                                <span className={`text-xs font-normal ${isPositiveTrend ? 'text-red-500' : 'text-blue-500'
                                                                    }`}>
                                                                    {isPositiveTrend ? '+' : ''}{alert.change_percent.toFixed(1)}%
                                                                </span>
                                                            </CardTitle>
                                                            <CardDescription className="flex items-center gap-2 mt-1">
                                                                <Pill className="h-3 w-3" />
                                                                {alert.suspected_medication_name}
                                                                <span className="text-xs">•</span>
                                                                <span className="text-xs">
                                                                    Confiance: {(alert.ai_confidence * 100).toFixed(0)}%
                                                                </span>
                                                            </CardDescription>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge
                                                            variant="outline"
                                                            className={`${STATUS_CONFIG[alert.status]?.color} text-white text-xs`}
                                                        >
                                                            {STATUS_CONFIG[alert.status]?.label}
                                                        </Badge>
                                                        {isExpanded ? (
                                                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                </div>
                                            </CardHeader>
                                        </CollapsibleTrigger>

                                        <CollapsibleContent>
                                            <CardContent className="pt-0 space-y-4">
                                                <Separator />

                                                {/* Trend details */}
                                                <div className="grid grid-cols-3 gap-4 text-sm">
                                                    <div>
                                                        <p className="text-muted-foreground text-xs">Valeur initiale</p>
                                                        <p className="font-medium">{alert.baseline_value} {alert.unit}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-muted-foreground text-xs">Valeur actuelle</p>
                                                        <p className="font-medium">{alert.current_value} {alert.unit}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-muted-foreground text-xs">Détecté</p>
                                                        <p className="font-medium">
                                                            {format(new Date(alert.created_at), 'dd/MM/yy', { locale: fr })}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* AI Recommendation */}
                                                <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                                                    <div className="flex items-center gap-2 text-primary font-medium text-sm mb-2">
                                                        <Brain className="h-4 w-4" />
                                                        Recommandation IA
                                                    </div>
                                                    <p className="text-sm">{alert.ai_recommendation}</p>
                                                </div>

                                                {/* AI Reasoning */}
                                                {alert.ai_reasoning && (
                                                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                                                        <p className="font-medium mb-1">Raisonnement:</p>
                                                        <p>{alert.ai_reasoning}</p>
                                                    </div>
                                                )}

                                                {/* Actions */}
                                                {alert.status === 'pending' && (
                                                    <div className="flex gap-2 pt-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => updateAlertStatus(alert.id, 'acknowledged')}
                                                        >
                                                            <Check className="h-3 w-3 mr-1" />
                                                            Prendre en compte
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-red-500 hover:text-red-600"
                                                            onClick={() => updateAlertStatus(alert.id, 'escalated')}
                                                        >
                                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                                            Escalader
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => updateAlertStatus(alert.id, 'dismissed')}
                                                        >
                                                            <X className="h-3 w-3 mr-1" />
                                                            Écarter
                                                        </Button>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </CollapsibleContent>
                                    </Card>
                                </Collapsible>
                            );
                        })}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
};

export default SideEffectAlertPanel;
