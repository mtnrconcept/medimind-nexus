/**
 * PatientHealthSynthesis - AI-powered health analysis display
 * 
 * Displays:
 * - Global health score
 * - Vigilance points
 * - Weak signals detected
 * - Treatment recommendations
 * - Prevention alerts
 * - Lifestyle advice
 * - Drug interactions
 */

import { useState } from 'react';
import { useAI } from '@/contexts/AIContext';
import { resolveAIJob, type AIJobProgress } from '@/lib/aiJobs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    Brain,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Minus,
    Pill,
    Shield,
    Heart,
    Activity,
    RefreshCw,
    Loader2,
    ChevronRight,
    Lightbulb,
    Stethoscope,
    CalendarClock,
    Dumbbell,
    AlertCircle,
    CheckCircle,
    Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import HolographicLoader from '@/components/ui/HolographicLoader';

// =====================================================
// TYPES
// =====================================================

interface HealthSynthesis {
    global_synthesis: string;
    health_score: number;
    risk_level: 'low' | 'moderate' | 'high' | 'critical';
    vigilance_points: Array<{
        category: string;
        level: 'info' | 'warning' | 'critical';
        title: string;
        description: string;
        action_needed?: string;
    }>;
    weak_signals: Array<{
        indicator: string;
        trend: 'stable' | 'improving' | 'worsening';
        observation: string;
        recommendation: string;
    }>;
    treatment_recommendations: Array<{
        category: string;
        current_situation: string;
        suggested_action: string;
        rationale: string;
        priority: 'low' | 'medium' | 'high';
    }>;
    prevention_alerts: Array<{
        screening: string;
        status: 'up_to_date' | 'due_soon' | 'overdue' | 'never_done';
        due_date?: string;
        recommendation: string;
    }>;
    lifestyle_advice: Array<{
        category: string;
        current_status: string;
        advice: string;
        impact: string;
    }>;
    drug_interactions: Array<{
        medications: string[];
        interaction_type: string;
        severity: 'mild' | 'moderate' | 'severe';
        recommendation: string;
    }>;
    summary_for_patient: string;
}

interface PatientHealthSynthesisProps {
    patientId: string;
}

// =====================================================
// COMPONENT
// =====================================================

const PatientHealthSynthesis = ({ patientId }: PatientHealthSynthesisProps) => {
    const { invokeAI } = useAI();
    const [synthesis, setSynthesis] = useState<HealthSynthesis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [jobProgress, setJobProgress] = useState<AIJobProgress | null>(null);

    const fetchSynthesis = async () => {
        setLoading(true);
        setError(null);
        setJobProgress(null);

        try {
            const { data, error: fnError } = await invokeAI('patient-health-synthesis', {
                patient_id: patientId,
                async: true,
            });

            if (fnError) throw fnError;

            const resolvedData = await resolveAIJob<HealthSynthesis>(
                invokeAI,
                'patient-health-synthesis',
                data,
                {
                    maxWaitMs: 1_200_000,
                    onProgress: setJobProgress,
                },
            );

            setSynthesis(resolvedData);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Error fetching synthesis:', err);
            setError('Erreur lors de l\'analyse. Veuillez réessayer.');
        } finally {
            setLoading(false);
            setJobProgress(null);
        }
    };

    // =====================================================
    // HELPERS
    // =====================================================

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        if (score >= 40) return 'text-orange-500';
        return 'text-red-500';
    };

    const getScoreGradient = (score: number) => {
        if (score >= 80) return 'from-green-500 to-emerald-400';
        if (score >= 60) return 'from-yellow-500 to-amber-400';
        if (score >= 40) return 'from-orange-500 to-amber-500';
        return 'from-red-500 to-rose-400';
    };

    const getRiskBadge = (level: string) => {
        const config = {
            low: { label: 'Faible', class: 'bg-green-500/10 text-green-500 border-green-500/30' },
            moderate: { label: 'Modéré', class: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
            high: { label: 'Élevé', class: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
            critical: { label: 'Critique', class: 'bg-red-500/10 text-red-500 border-red-500/30' },
        };
        const c = config[level as keyof typeof config] || config.moderate;
        return <Badge variant="outline" className={c.class}>{c.label}</Badge>;
    };

    const getTrendIcon = (trend: string) => {
        switch (trend) {
            case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
            case 'worsening': return <TrendingDown className="h-4 w-4 text-red-500" />;
            default: return <Minus className="h-4 w-4 text-gray-500" />;
        }
    };

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
            case 'warning': return <AlertCircle className="h-4 w-4 text-orange-500" />;
            default: return <Info className="h-4 w-4 text-blue-500" />;
        }
    };

    const getStatusBadge = (status: string) => {
        const config = {
            up_to_date: { label: 'À jour', class: 'bg-green-500/10 text-green-500', icon: CheckCircle },
            due_soon: { label: 'Bientôt', class: 'bg-yellow-500/10 text-yellow-500', icon: CalendarClock },
            overdue: { label: 'En retard', class: 'bg-red-500/10 text-red-500', icon: AlertTriangle },
            never_done: { label: 'Jamais fait', class: 'bg-gray-500/10 text-gray-500', icon: Info },
        };
        const c = config[status as keyof typeof config] || config.never_done;
        const Icon = c.icon;
        return (
            <Badge variant="outline" className={c.class}>
                <Icon className="h-3 w-3 mr-1" />
                {c.label}
            </Badge>
        );
    };

    // =====================================================
    // RENDER
    // =====================================================

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Synthèse IA de Santé
                    </CardTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={fetchSynthesis}
                        disabled={loading}
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                        )}
                        {loading ? 'Analyse...' : 'Analyser'}
                    </Button>
                </div>
                {lastUpdated && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Dernière analyse: {lastUpdated.toLocaleString('fr-FR')}
                    </p>
                )}
            </CardHeader>

            <CardContent className="pt-4">
                {error && (
                    <div className="p-4 rounded-lg bg-red-500/10 text-red-500 text-sm mb-4">
                        <AlertTriangle className="h-4 w-4 inline mr-2" />
                        {error}
                    </div>
                )}

                {!synthesis && !loading && !error && (
                    <div className="text-center py-8 text-muted-foreground">
                        <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Cliquez sur "Analyser" pour générer la synthèse IA</p>
                        <p className="text-xs mt-1">L'analyse prend en compte tout le dossier patient</p>
                    </div>
                )}

                {loading && (
                    <div className="py-8">
                        <HolographicLoader text={jobProgress?.message || "Analyse cognitive du dossier en cours..."} />
                        <p className="text-center text-xs text-muted-foreground mt-2 opacity-70">
                            {jobProgress
                                ? `Progression: ${Math.round(jobProgress.progress || 0)}%`
                                : 'Extraction des patterns cliniques & interactions'}
                        </p>
                    </div>
                )}

                {synthesis && !loading && (
                    <div className="space-y-4">
                        {/* Health Score */}
                        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                            <div className="relative">
                                <div className={cn(
                                    "w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold bg-gradient-to-br",
                                    getScoreGradient(synthesis.health_score)
                                )}>
                                    <span className="text-white">{synthesis.health_score}</span>
                                </div>
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium">Score de Santé Global</span>
                                    {getRiskBadge(synthesis.risk_level)}
                                </div>
                                <Progress value={synthesis.health_score} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-2">
                                    {synthesis.summary_for_patient}
                                </p>
                            </div>
                        </div>

                        {/* Main Tabs */}
                        <Tabs defaultValue="synthesis" className="w-full">
                            <TabsList className="grid grid-cols-4 w-full">
                                <TabsTrigger value="synthesis" className="text-xs">
                                    <Stethoscope className="h-3 w-3 mr-1" />
                                    Synthèse
                                </TabsTrigger>
                                <TabsTrigger value="vigilance" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Vigilance
                                    {(synthesis.vigilance_points?.length || 0) > 0 && (
                                        <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                                            {synthesis.vigilance_points?.length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="recommendations" className="text-xs">
                                    <Lightbulb className="h-3 w-3 mr-1" />
                                    Conseils
                                </TabsTrigger>
                                <TabsTrigger value="prevention" className="text-xs">
                                    <Shield className="h-3 w-3 mr-1" />
                                    Prévention
                                </TabsTrigger>
                            </TabsList>

                            {/* Synthesis Tab */}
                            <TabsContent value="synthesis" className="mt-4">
                                <ScrollArea className="h-[300px]">
                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                        <p className="whitespace-pre-line">{synthesis.global_synthesis}</p>
                                    </div>

                                    {(synthesis.weak_signals?.length || 0) > 0 && (
                                        <div className="mt-4">
                                            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                                                <Activity className="h-4 w-4 text-orange-500" />
                                                Signaux Faibles Détectés
                                            </h4>
                                            <div className="space-y-2">
                                                {synthesis.weak_signals?.map((signal, idx) => (
                                                    <div key={idx} className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {getTrendIcon(signal.trend)}
                                                            <span className="font-medium text-sm">{signal.indicator}</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">{signal.observation}</p>
                                                        <p className="text-xs mt-1">
                                                            <span className="font-medium">Recommandation:</span> {signal.recommendation}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(synthesis.drug_interactions?.length || 0) > 0 && (
                                        <div className="mt-4">
                                            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                                                <Pill className="h-4 w-4 text-red-500" />
                                                Interactions Médicamenteuses
                                            </h4>
                                            <div className="space-y-2">
                                                {synthesis.drug_interactions?.map((interaction, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={cn(
                                                            "p-3 rounded-lg border",
                                                            interaction.severity === 'severe'
                                                                ? 'bg-red-500/10 border-red-500/30'
                                                                : interaction.severity === 'moderate'
                                                                    ? 'bg-orange-500/10 border-orange-500/30'
                                                                    : 'bg-yellow-500/10 border-yellow-500/30'
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Badge variant="outline" className="text-[10px]">
                                                                {interaction.medications?.join(' + ')}
                                                            </Badge>
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    "text-[10px]",
                                                                    interaction.severity === 'severe' ? 'text-red-500' :
                                                                        interaction.severity === 'moderate' ? 'text-orange-500' : 'text-yellow-500'
                                                                )}
                                                            >
                                                                {interaction.severity === 'severe' ? 'Sévère' :
                                                                    interaction.severity === 'moderate' ? 'Modérée' : 'Légère'}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs">{interaction.interaction_type}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">{interaction.recommendation}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            {/* Vigilance Tab */}
                            <TabsContent value="vigilance" className="mt-4">
                                <ScrollArea className="h-[300px]">
                                    {(synthesis.vigilance_points?.length || 0) === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                            <p>Aucun point de vigilance détecté</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {synthesis.vigilance_points?.map((point, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        "p-3 rounded-lg border",
                                                        point.level === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                                                            point.level === 'warning' ? 'bg-orange-500/10 border-orange-500/30' :
                                                                'bg-blue-500/10 border-blue-500/30'
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {getLevelIcon(point.level)}
                                                        <span className="font-medium text-sm">{point.title}</span>
                                                        <Badge variant="outline" className="text-[10px] ml-auto">
                                                            {point.category}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{point.description}</p>
                                                    {point.action_needed && (
                                                        <div className="mt-2 pt-2 border-t border-dashed">
                                                            <p className="text-xs font-medium flex items-center gap-1">
                                                                <ChevronRight className="h-3 w-3" />
                                                                {point.action_needed}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            {/* Recommendations Tab */}
                            <TabsContent value="recommendations" className="mt-4">
                                <ScrollArea className="h-[300px]">
                                    {(synthesis.treatment_recommendations?.length || 0) === 0 && (synthesis.lifestyle_advice?.length || 0) === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                            <p>Aucune recommandation particulière</p>
                                        </div>
                                    ) : (
                                        <Accordion type="multiple" className="space-y-2">
                                            {(synthesis.treatment_recommendations?.length || 0) > 0 && (
                                                <AccordionItem value="treatment" className="border rounded-lg px-3">
                                                    <AccordionTrigger className="text-sm hover:no-underline">
                                                        <div className="flex items-center gap-2">
                                                            <Pill className="h-4 w-4 text-primary" />
                                                            Traitements ({synthesis.treatment_recommendations?.length})
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent>
                                                        <div className="space-y-2">
                                                            {synthesis.treatment_recommendations?.map((rec, idx) => (
                                                                <div key={idx} className="p-2 rounded bg-muted/50">
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <span className="text-xs font-medium">{rec.suggested_action}</span>
                                                                        <Badge
                                                                            variant="outline"
                                                                            className={cn(
                                                                                "text-[10px]",
                                                                                rec.priority === 'high' ? 'text-red-500' :
                                                                                    rec.priority === 'medium' ? 'text-orange-500' : 'text-gray-500'
                                                                            )}
                                                                        >
                                                                            {rec.priority === 'high' ? 'Prioritaire' :
                                                                                rec.priority === 'medium' ? 'Modérée' : 'Faible'}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="text-[10px] text-muted-foreground">{rec.rationale}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            )}

                                            {(synthesis.lifestyle_advice?.length || 0) > 0 && (
                                                <AccordionItem value="lifestyle" className="border rounded-lg px-3">
                                                    <AccordionTrigger className="text-sm hover:no-underline">
                                                        <div className="flex items-center gap-2">
                                                            <Dumbbell className="h-4 w-4 text-green-500" />
                                                            Mode de vie ({synthesis.lifestyle_advice?.length})
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent>
                                                        <div className="space-y-2">
                                                            {synthesis.lifestyle_advice?.map((advice, idx) => (
                                                                <div key={idx} className="p-2 rounded bg-muted/50">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <Badge variant="outline" className="text-[10px]">{advice.category}</Badge>
                                                                    </div>
                                                                    <p className="text-xs font-medium">{advice.advice}</p>
                                                                    <p className="text-[10px] text-muted-foreground mt-1">
                                                                        <span className="font-medium">Impact:</span> {advice.impact}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            )}
                                        </Accordion>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            {/* Prevention Tab */}
                            <TabsContent value="prevention" className="mt-4">
                                <ScrollArea className="h-[300px]">
                                    {(synthesis.prevention_alerts?.length || 0) === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Shield className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                            <p>Tous les dépistages sont à jour</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {synthesis.prevention_alerts?.map((alert, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-medium text-sm">{alert.screening}</span>
                                                            {getStatusBadge(alert.status)}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">{alert.recommendation}</p>
                                                        {alert.due_date && (
                                                            <p className="text-xs mt-1">
                                                                <CalendarClock className="h-3 w-3 inline mr-1" />
                                                                Échéance: {alert.due_date}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default PatientHealthSynthesis;
